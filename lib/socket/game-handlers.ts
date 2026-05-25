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
} from '../game/engine'
import { getAiMove } from '../game/ai-player'

const GAME_TTL = 60 * 60 * 2 // 2 hours

async function getState(redis: RedisClientType, gameId: string): Promise<GameState | null> {
  const raw = await redis.get(`game:${gameId}`)
  return raw ? (JSON.parse(raw) as GameState) : null
}

async function setState(redis: RedisClientType, state: GameState): Promise<void> {
  await redis.set(`game:${state.gameId}`, JSON.stringify(state), { EX: GAME_TTL })
}

export function registerGameHandlers(
  io: Server,
  socket: Socket,
  redis: RedisClientType,
) {
  // ── Create game ──────────────────────────────────────────────────────────
  socket.on('game:create', async ({ userId, vsAi }: { userId: string; vsAi: boolean }) => {
    const gameId = `g_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
    const p2Id = vsAi ? 'ai' : ''
    const state = createInitialState(gameId, userId, p2Id, vsAi ? 'p2' : undefined)
    await setState(redis, state)
    socket.join(gameId)
    await redis.set(`seat:${gameId}:${userId}`, 'p1', { EX: GAME_TTL })
    socket.emit('game:created', { gameId })
    socket.emit('game:state', stateForPlayer(state, 'p1'))

    if (vsAi) {
      socket.emit('game:ready', { gameId })
    }
  })

  // ── Join game ────────────────────────────────────────────────────────────
  socket.on('game:join', async ({ gameId, userId }: { gameId: string; userId: string }) => {
    const state = await getState(redis, gameId)
    if (!state) return socket.emit('game:error', { message: 'Partida no encontrada' })
    if (state.phase !== 'waiting' && state.players.p2 && state.players.p2 !== userId) {
      return socket.emit('game:error', { message: 'Partida llena' })
    }

    const updated: GameState = { ...state, players: { ...state.players, p2: userId } }
    await setState(redis, updated)
    await redis.set(`seat:${gameId}:${userId}`, 'p2', { EX: GAME_TTL })
    socket.join(gameId)

    socket.emit('game:state', stateForPlayer(updated, 'p2'))
    io.to(gameId).emit('game:ready', { gameId })
    io.to(gameId).emit('game:message', { text: 'Oponente conectado — ¡Que empiece el juego!' })
  })

  // ── Rejoin ───────────────────────────────────────────────────────────────
  socket.on('game:rejoin', async ({ gameId, userId }: { gameId: string; userId: string }) => {
    const seatRaw = await redis.get(`seat:${gameId}:${userId}`)
    const seat = (seatRaw ?? 'p1') as PlayerSeat
    const state = await getState(redis, gameId)
    if (!state) return socket.emit('game:error', { message: 'Partida no encontrada' })
    socket.join(gameId)
    socket.emit('game:state', stateForPlayer(state, seat))
  })

  // ── Play card ────────────────────────────────────────────────────────────
  socket.on('game:play_card', async ({ gameId, userId, cardId }: { gameId: string; userId: string; cardId: string }) => {
    let state = await getState(redis, gameId)
    if (!state) return

    const seatRaw = await redis.get(`seat:${gameId}:${userId}`)
    const seat = (seatRaw ?? 'p1') as PlayerSeat
    if (state.turn !== seat) return socket.emit('game:error', { message: 'No es tu turno' })

    state = applyPlayCard(state, seat, cardId)
    await setState(redis, state)
    broadcastState(io, state)
    await maybeRunAi(io, socket, redis, state)
  })

  // ── Envido call ──────────────────────────────────────────────────────────
  socket.on('game:envido', async ({ gameId, userId, call }: { gameId: string; userId: string; call: EnvidoCall | CallResponse }) => {
    let state = await getState(redis, gameId)
    if (!state) return

    const seatRaw = await redis.get(`seat:${gameId}:${userId}`)
    const seat = (seatRaw ?? 'p1') as PlayerSeat

    state = applyEnvidoCall(state, seat, call)
    await setState(redis, state)
    broadcastState(io, state)
    await maybeRunAi(io, socket, redis, state)
  })

  // ── Truco call ───────────────────────────────────────────────────────────
  socket.on('game:truco', async ({ gameId, userId, call }: { gameId: string; userId: string; call: TrucoCall | CallResponse }) => {
    let state = await getState(redis, gameId)
    if (!state) return

    const seatRaw = await redis.get(`seat:${gameId}:${userId}`)
    const seat = (seatRaw ?? 'p1') as PlayerSeat

    state = applyTrucoCall(state, seat, call)
    await setState(redis, state)
    broadcastState(io, state)
    await maybeRunAi(io, socket, redis, state)
  })

  // ── Ir al mazo ───────────────────────────────────────────────────────────
  socket.on('game:mazo', async ({ gameId, userId }: { gameId: string; userId: string }) => {
    let state = await getState(redis, gameId)
    if (!state) return

    const seatRaw = await redis.get(`seat:${gameId}:${userId}`)
    const seat = (seatRaw ?? 'p1') as PlayerSeat
    const opponent: PlayerSeat = seat === 'p1' ? 'p2' : 'p1'

    state = {
      ...state,
      score: { ...state.score, [opponent]: state.score[opponent] + 1 },
      phase: 'hand_over',
      lastMessage: `${seat === 'p1' ? 'Jugador 1' : 'Jugador 2'} se fue al mazo.`,
    }
    await setState(redis, state)
    broadcastState(io, state)
    scheduleNextHand(io, redis, state)
  })

  // ── Next hand (after hand_over) ───────────────────────────────────────────
  socket.on('game:next_hand', async ({ gameId }: { gameId: string }) => {
    let state = await getState(redis, gameId)
    if (!state || state.phase !== 'hand_over') return
    state = dealHand(state)
    await setState(redis, state)
    broadcastState(io, state)
    await maybeRunAi(io, socket, redis, state)
  })
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function broadcastState(io: Server, state: GameState) {
  io.to(state.gameId).emit('game:state', state)  // full state to server side
  // Per-player masked views
  io.to(state.gameId).emit('game:state:p1', stateForPlayer(state, 'p1'))
  io.to(state.gameId).emit('game:state:p2', stateForPlayer(state, 'p2'))
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

function scheduleNextHand(io: Server, redis: RedisClientType, state: GameState) {
  setTimeout(async () => {
    const fresh = await getState(redis, state.gameId)
    if (!fresh || fresh.phase !== 'hand_over') return
    const next = dealHand(fresh)
    await setState(redis, next)
    broadcastState(io, next)
  }, 3000)
}

async function maybeRunAi(
  io: Server,
  socket: Socket,
  redis: RedisClientType,
  state: GameState,
) {
  if (!state.aiSeat || state.turn !== state.aiSeat || state.phase === 'hand_over' || state.phase === 'game_over') return

  // Small delay so the UI can show the state before AI acts
  setTimeout(async () => {
    const fresh = await getState(redis, state.gameId)
    if (!fresh || fresh.turn !== fresh.aiSeat) return

    try {
      const { move, explanation } = await getAiMove(fresh)
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
        scheduleNextHand(io, redis, updated)
      }

      await setState(redis, updated)
      broadcastState(io, updated)
    } catch (e) {
      console.error('[ai-move]', e)
    }
  }, 1200)
}
