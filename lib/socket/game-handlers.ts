import type { Server, Socket } from 'socket.io'
import type { createClient } from 'redis'

type RedisClientType = ReturnType<typeof createClient>

import {
  type GameState,
  type PlayerSeat,
  type EnvidoCall,
  type TrucoCall,
  type CallResponse,
  dealHand,
  applyPlayCard,
  applyEnvidoCall,
  applyTrucoCall,
  createInitialState,
  cardPower,
} from '../game/engine'
import { getAiMove } from '../game/ai-player'
import { prisma } from '../prisma'

const GAME_TTL = 60 * 60 * 2 // 2 hours
const AI_RATE_LIMIT = parseInt(process.env.AI_RATE_LIMIT ?? '10', 10)
const AI_RATE_TTL = 60 * 60 // 1 hour window
const BYPASS_IPS = new Set(
  (process.env.RATE_LIMIT_BYPASS_IPS ?? '').split(',').map((s) => s.trim()).filter(Boolean),
)

async function getState(redis: RedisClientType, gameId: string): Promise<GameState | null> {
  const raw = await redis.get(`game:${gameId}`)
  return raw ? (JSON.parse(raw) as GameState) : null
}

async function setState(redis: RedisClientType, state: GameState): Promise<void> {
  await redis.set(`game:${state.gameId}`, JSON.stringify(state), { EX: GAME_TTL })
}

function stateForPlayer(state: GameState, seat: PlayerSeat): GameState {
  const opponentSeat: PlayerSeat = seat === 'p1' ? 'p2' : 'p1'
  return {
    ...state,
    hands: {
      ...state.hands,
      [opponentSeat]: state.hands[opponentSeat].map(() => ({
        id: 'hidden',
        number: 0,
        suit: 'espada' as const,
      })),
    },
  }
}

function broadcastState(io: Server, state: GameState) {
  io.to(state.gameId).emit('game:state:p1', stateForPlayer(state, 'p1'))
  io.to(state.gameId).emit('game:state:p2', stateForPlayer(state, 'p2'))
}

async function resolveSeat(
  redis: RedisClientType,
  gameId: string,
  userId: string,
): Promise<PlayerSeat> {
  const cached = await redis.get(`seat:${gameId}:${userId}`)
  if (cached) return cached as PlayerSeat

  const game = await prisma.game.findUnique({ where: { id: gameId } })
  const seat: PlayerSeat = game?.player2Id === userId ? 'p2' : 'p1'
  await redis.set(`seat:${gameId}:${userId}`, seat, { EX: GAME_TTL })
  return seat
}

async function initStateFromPrisma(
  redis: RedisClientType,
  gameId: string,
): Promise<GameState | null> {
  const game = await prisma.game.findUnique({ where: { id: gameId } })
  if (!game) return null

  const p2Id = game.isAiGame ? 'ai' : (game.player2Id ?? '')
  const state = createInitialState(
    gameId,
    game.player1Id,
    p2Id,
    game.isAiGame ? 'p2' : undefined,
  )
  state.isAiGame = game.isAiGame
  await setState(redis, state)
  return state
}

// Returns false if rate limit exceeded for this userId or IP
async function checkRateLimit(redis: RedisClientType, userId: string, ip: string): Promise<boolean> {
  if (BYPASS_IPS.has(ip)) return true

  const userKey = `ratelimit:ai:user:${userId}`
  const ipKey = `ratelimit:ai:ip:${ip}`

  const [userCount, ipCount] = await Promise.all([
    redis.incr(userKey),
    redis.incr(ipKey),
  ])

  if (userCount === 1) await redis.expire(userKey, AI_RATE_TTL)
  if (ipCount === 1) await redis.expire(ipKey, AI_RATE_TTL)

  return userCount <= AI_RATE_LIMIT && ipCount <= AI_RATE_LIMIT
}

export function registerGameHandlers(
  io: Server,
  socket: Socket,
  redis: RedisClientType,
) {
  const ip = (socket.handshake.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim()
    ?? socket.handshake.address

  // ── Rejoin ───────────────────────────────────────────────────────────────
  socket.on('game:rejoin', async ({ gameId, userId }: { gameId: string; userId: string }) => {
    let state = await getState(redis, gameId)
    if (!state) state = await initStateFromPrisma(redis, gameId)
    if (!state) return socket.emit('game:error', { message: 'Partida no encontrada' })

    const seat = await resolveSeat(redis, gameId, userId)
    socket.join(gameId)
    socket.emit(`game:state:${seat}`, stateForPlayer(state, seat))

    if (state.aiSeat && state.turn === state.aiSeat) {
      await maybeRunAi(io, socket, redis, state, false, userId, ip)
    }
  })

  // ── Join multiplayer ─────────────────────────────────────────────────────
  socket.on('game:join', async ({ gameId, userId }: { gameId: string; userId: string }) => {
    let state = await getState(redis, gameId)
    if (!state) state = await initStateFromPrisma(redis, gameId)
    if (!state) return socket.emit('game:error', { message: 'Partida no encontrada' })

    const updated: GameState = { ...state, players: { ...state.players, p2: userId } }
    await setState(redis, updated)
    await redis.set(`seat:${gameId}:${userId}`, 'p2', { EX: GAME_TTL })
    socket.join(gameId)

    socket.emit('game:state:p2', stateForPlayer(updated, 'p2'))
    io.to(gameId).emit('game:ready', { gameId })
    io.to(gameId).emit('game:message', { text: 'Oponente conectado — ¡Que empiece el juego!' })
  })

  // ── Play card ────────────────────────────────────────────────────────────
  socket.on('game:play_card', async ({ gameId, userId, cardId, explain }: { gameId: string; userId: string; cardId: string; explain?: boolean }) => {
    let state = await getState(redis, gameId)
    if (!state) return

    const seat = await resolveSeat(redis, gameId, userId)
    if (state.turn !== seat) return socket.emit('game:error', { message: 'No es tu turno' })

    state = applyPlayCard(state, seat, cardId)
    await setState(redis, state)
    broadcastState(io, state)
    await maybeRunAi(io, socket, redis, state, explain ?? false, userId, ip)
  })

  // ── Envido call ──────────────────────────────────────────────────────────
  socket.on('game:envido', async ({ gameId, userId, call, explain }: { gameId: string; userId: string; call: EnvidoCall | CallResponse; explain?: boolean }) => {
    let state = await getState(redis, gameId)
    if (!state) return

    const seat = await resolveSeat(redis, gameId, userId)
    state = applyEnvidoCall(state, seat, call)
    await setState(redis, state)
    broadcastState(io, state)
    await maybeRunAi(io, socket, redis, state, explain ?? false, userId, ip)
  })

  // ── Truco call ───────────────────────────────────────────────────────────
  socket.on('game:truco', async ({ gameId, userId, call, explain }: { gameId: string; userId: string; call: TrucoCall | CallResponse; explain?: boolean }) => {
    let state = await getState(redis, gameId)
    if (!state) return

    const seat = await resolveSeat(redis, gameId, userId)
    state = applyTrucoCall(state, seat, call)
    await setState(redis, state)
    broadcastState(io, state)
    await maybeRunAi(io, socket, redis, state, explain ?? false, userId, ip)
  })

  // ── Ir al mazo ───────────────────────────────────────────────────────────
  socket.on('game:mazo', async ({ gameId, userId }: { gameId: string; userId: string }) => {
    let state = await getState(redis, gameId)
    if (!state) return

    const seat = await resolveSeat(redis, gameId, userId)
    const opponent: PlayerSeat = seat === 'p1' ? 'p2' : 'p1'

    state = {
      ...state,
      score: { ...state.score, [opponent]: state.score[opponent] + 1 },
      phase: 'hand_over',
      lastMessage: `${seat === 'p1' ? 'Jugador 1' : 'Jugador 2'} se fue al mazo.`,
    }
    await setState(redis, state)
    broadcastState(io, state)
    scheduleNextHand(io, socket, redis, state, false, userId, ip)
  })

  // ── Next hand ────────────────────────────────────────────────────────────
  socket.on('game:next_hand', async ({ gameId, explain }: { gameId: string; explain?: boolean }) => {
    let state = await getState(redis, gameId)
    if (!state || state.phase !== 'hand_over') return
    state = dealHand(state)
    await setState(redis, state)
    broadcastState(io, state)
    const playerSeat: PlayerSeat = state.aiSeat === 'p1' ? 'p2' : 'p1'
    const humanId = state.players[playerSeat]
    await maybeRunAi(io, socket, redis, state, explain ?? false, humanId, ip)
  })
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function scheduleNextHand(
  io: Server,
  socket: Socket,
  redis: RedisClientType,
  state: GameState,
  explain: boolean,
  userId: string,
  ip: string,
) {
  setTimeout(async () => {
    const fresh = await getState(redis, state.gameId)
    if (!fresh || fresh.phase !== 'hand_over') return
    const next = dealHand(fresh)
    await setState(redis, next)
    broadcastState(io, next)
    await maybeRunAi(io, socket, redis, next, explain, userId, ip)
  }, 3000)
}

async function maybeRunAi(
  io: Server,
  socket: Socket,
  redis: RedisClientType,
  state: GameState,
  explain: boolean,
  userId: string,
  ip: string,
) {
  if (
    !state.aiSeat ||
    state.turn !== state.aiSeat ||
    state.phase === 'hand_over' ||
    state.phase === 'game_over'
  ) return

  setTimeout(async () => {
    const fresh = await getState(redis, state.gameId)
    if (!fresh || fresh.turn !== fresh.aiSeat) return

    const allowed = await checkRateLimit(redis, userId, ip)
    if (!allowed) {
      io.to(fresh.gameId).emit('game:ai_thinking', { explanation: 'Límite de partidas alcanzado por hoy. Jugando automáticamente...' })
      const playerSeat: PlayerSeat = fresh.aiSeat! === 'p1' ? 'p2' : 'p1'
      const lowest = [...fresh.hands[fresh.aiSeat!]].sort((a, b) => cardPower(a) - cardPower(b))[0]
      if (lowest && fresh.phase === 'playing') {
        const updated = applyPlayCard(fresh, fresh.aiSeat!, lowest.id)
        await setState(redis, updated)
        broadcastState(io, updated)
      }
      return
    }

    try {
      const { move, explanation } = await getAiMove(fresh, explain)
      io.to(fresh.gameId).emit('game:ai_thinking', { explanation })

      let updated = fresh
      if (move.type === 'play_card') {
        updated = applyPlayCard(fresh, fresh.aiSeat!, move.cardId!)
      } else if (move.type === 'envido') {
        updated = applyEnvidoCall(fresh, fresh.aiSeat!, move.call! as EnvidoCall | CallResponse)
      } else if (move.type === 'truco') {
        updated = applyTrucoCall(fresh, fresh.aiSeat!, move.call! as TrucoCall | CallResponse)
      } else if (move.type === 'mazo') {
        const opponent: PlayerSeat = fresh.aiSeat === 'p1' ? 'p2' : 'p1'
        updated = {
          ...fresh,
          score: { ...fresh.score, [opponent]: fresh.score[opponent] + 1 },
          phase: 'hand_over',
        }
        scheduleNextHand(io, socket, redis, updated, explain, userId, ip)
      }

      await setState(redis, updated)
      broadcastState(io, updated)

      // If AI won the trick and must lead next, trigger another move
      if (
        updated.phase === 'playing' &&
        updated.aiSeat &&
        updated.turn === updated.aiSeat
      ) {
        await maybeRunAi(io, socket, redis, updated, explain, userId, ip)
      }
    } catch (e) {
      console.error('[ai-move]', e)
      io.to(fresh.gameId).emit('game:ai_thinking', {
        explanation: 'No pude conectarme con Claude. Jugando carta automáticamente...',
      })
      const lowest = [...fresh.hands[fresh.aiSeat!]]
        .sort((a, b) => cardPower(a) - cardPower(b))[0]
      if (lowest && fresh.phase === 'playing') {
        const updated = applyPlayCard(fresh, fresh.aiSeat!, lowest.id)
        await setState(redis, updated)
        broadcastState(io, updated)
        if (updated.phase === 'playing' && updated.aiSeat && updated.turn === updated.aiSeat) {
          await maybeRunAi(io, socket, redis, updated, explain, userId, ip)
        }
      }
    }
  }, 1200)
}
