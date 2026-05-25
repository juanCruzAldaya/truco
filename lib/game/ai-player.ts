import Anthropic from '@anthropic-ai/sdk'
import {
  type GameState,
  type PlayerSeat,
  type Card,
  cardPower,
  calculateEnvido,
  canCallEnvido,
  canCallTruco,
} from './engine'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

type AiMove = {
  type: 'play_card' | 'envido' | 'truco' | 'mazo'
  cardId?: string
  call?: string
}

const SYSTEM_PROMPT = `Sos un jugador experto de Truco argentino (2 jugadores, sin Flor, a 15 tantos).
Recibís el estado del juego y debés devolver tu jugada como JSON en la PRIMERA línea,
y luego una explicación breve en castellano rioplatense para enseñarle al jugador humano.

Formato obligatorio:
{"type":"play_card","cardId":"3-espada"}
---
Tu explicación aquí...

Tipos de movimiento válidos:
- {"type":"play_card","cardId":"<id>"}  — tirar una carta de tu mano
- {"type":"envido","call":"envido|real_envido|falta_envido|quiero|no_quiero"}
- {"type":"truco","call":"truco|retruco|vale4|quiero|no_quiero"}
- {"type":"mazo"}  — irse al mazo

Reglas clave de Truco:
- Jerarquía (mayor a menor): 1espada > 1basto > 7espada > 7oro > 3 > 2 > 1copa=1oro > 12 > 11 > 10 > 7copa=7basto > 6 > 5 > 4
- Envido solo se puede cantar antes de tirar la primera carta
- Si hay envido pendiente (pending=true), solo podés responder con quiero/no_quiero/real_envido/falta_envido
- Si hay truco pendiente, solo podés responder con quiero/no_quiero/retruco/vale4
- Jugar bien implica: blufear a veces en envido, administrar las cartas fuertes, leer qué jugó el oponente
- Explicá tu razonamiento de forma didáctica pero en tono picaresco gaucho`

export async function getAiMove(
  state: GameState,
): Promise<{ move: AiMove; explanation: string }> {
  const aiSeat = state.aiSeat!
  const playerSeat: PlayerSeat = aiSeat === 'p1' ? 'p2' : 'p1'

  const context = {
    phase: state.phase,
    turn: state.turn,
    myHand: state.hands[aiSeat],
    tableCards: state.table,
    tricks: state.tricks,
    currentTrick: state.currentTrick,
    envido: state.envido,
    truco: state.truco,
    myScore: state.score[aiSeat],
    opponentScore: state.score[playerSeat],
    mano: state.mano,
    handNumber: state.handNumber,
    myEnvidoPoints: calculateEnvido(state.hands[aiSeat]),
    opponentTableCards: state.table[playerSeat],
  }

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 512,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: JSON.stringify(context, null, 2) }],
  })

  const raw = (response.content[0] as { text: string }).text.trim()
  const separatorIdx = raw.indexOf('---')
  const jsonLine = separatorIdx !== -1 ? raw.slice(0, separatorIdx).trim() : raw.split('\n')[0]
  const explanation = separatorIdx !== -1 ? raw.slice(separatorIdx + 3).trim() : '...'

  let move: AiMove
  try {
    move = JSON.parse(jsonLine) as AiMove
  } catch {
    // Fallback: play lowest card
    const lowest = [...state.hands[aiSeat]].sort((a, b) => cardPower(a) - cardPower(b))[0]
    move = { type: 'play_card', cardId: lowest.id }
  }

  // Safety: validate the move is legal
  move = validateMove(move, state, aiSeat)

  return { move, explanation }
}

function validateMove(move: AiMove, state: GameState, seat: PlayerSeat): AiMove {
  if (move.type === 'play_card') {
    const valid = state.hands[seat].some((c) => c.id === move.cardId)
    if (!valid) {
      const lowest = [...state.hands[seat]].sort((a, b) => cardPower(a) - cardPower(b))[0]
      return { type: 'play_card', cardId: lowest.id }
    }
  }
  return move
}
