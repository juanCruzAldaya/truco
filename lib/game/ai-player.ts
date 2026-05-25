import Anthropic from '@anthropic-ai/sdk'
import {
  type GameState,
  type PlayerSeat,
  cardPower,
  calculateEnvido,
} from './engine'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

type AiMove = {
  type: 'play_card' | 'envido' | 'truco' | 'mazo'
  cardId?: string
  call?: string
}

const RULES = `Jerarquía: 1espada > 1basto > 7espada > 7oro > 3 > 2 > 1copa=1oro > 12 > 11 > 10 > 7copa=7basto > 6 > 5 > 4
Envido solo se puede cantar antes de tirar la primera carta.
Si hay envido pending, solo podés: quiero/no_quiero/real_envido/falta_envido.
Si hay truco pending, solo podés: quiero/no_quiero/retruco/vale4.`

const SYSTEM_SHORT = `Sos un jugador experto de Truco argentino (2 jugadores, sin Flor, a 15 tantos).
Devolvé SOLO el JSON del movimiento en la primera línea, luego "---" y UNA frase corta picaresca en castellano rioplatense (máximo 12 palabras, sin explicar estrategia).

Formato:
{"type":"play_card","cardId":"3-espada"}
---
¡Tomá, che!

${RULES}`

const SYSTEM_EXPLAIN = `Sos un jugador experto de Truco argentino (2 jugadores, sin Flor, a 15 tantos).
Devolvé el JSON del movimiento en la primera línea, luego "---" y una explicación breve en castellano rioplatense enseñando al jugador humano tu razonamiento (máximo 4 oraciones).

Formato:
{"type":"play_card","cardId":"3-espada"}
---
Tu explicación aquí...

${RULES}
Explicá tu razonamiento de forma didáctica pero en tono picaresco gaucho.`

export async function getAiMove(
  state: GameState,
  explain = false,
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
    max_tokens: explain ? 400 : 80,
    system: explain ? SYSTEM_EXPLAIN : SYSTEM_SHORT,
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
    const lowest = [...state.hands[aiSeat]].sort((a, b) => cardPower(a) - cardPower(b))[0]
    move = { type: 'play_card', cardId: lowest.id }
  }

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
