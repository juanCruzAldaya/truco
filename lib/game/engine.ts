export type Suit = 'espada' | 'basto' | 'oro' | 'copa'
export type Card = { id: string; number: number; suit: Suit }

export type EnvidoCall = 'envido' | 'real_envido' | 'falta_envido'
export type TrucoCall = 'truco' | 'retruco' | 'vale4'
export type CallResponse = 'quiero' | 'no_quiero'

export type GamePhase =
  | 'waiting'
  | 'playing'
  | 'envido_pending'
  | 'truco_pending'
  | 'hand_over'
  | 'game_over'

export type PlayerSeat = 'p1' | 'p2'

export type Trick = {
  p1?: Card
  p2?: Card
  winner?: PlayerSeat | 'parda'
}

export type GameState = {
  gameId: string
  phase: GamePhase
  mano: PlayerSeat        // who leads (opens) the hand
  turn: PlayerSeat        // whose turn to act
  hands: { p1: Card[]; p2: Card[] }
  table: { p1: Card[]; p2: Card[] }
  tricks: Trick[]
  currentTrick: number
  envido: {
    chain: EnvidoCall[]
    pending: boolean
    caller?: PlayerSeat
    winner?: PlayerSeat
    revealed?: { p1: number; p2: number }
  }
  truco: {
    chain: TrucoCall[]
    pending: boolean
    caller?: PlayerSeat
    winner?: PlayerSeat
  }
  score: { p1: number; p2: number }
  handNumber: number
  players: { p1: string; p2: string }   // socket / user IDs
  aiSeat?: PlayerSeat
  lastMessage?: string
}

// ─── Card power table ────────────────────────────────────────────────────────

const SPECIFIC: Record<string, number> = {
  '1-espada': 14,
  '1-basto': 13,
  '7-espada': 12,
  '7-oro': 11,
}

const BY_NUMBER: Record<number, number> = {
  3: 10, 2: 9, 1: 8, 12: 7, 11: 6, 10: 5, 7: 4, 6: 3, 5: 2, 4: 1,
}

export function cardPower(card: Card): number {
  return SPECIFIC[`${card.number}-${card.suit}`] ?? BY_NUMBER[card.number] ?? 0
}

// ─── Envido value ────────────────────────────────────────────────────────────

function envidoValue(n: number): number {
  return n <= 7 ? n : 0
}

export function calculateEnvido(hand: Card[]): number {
  const suits = ['espada', 'basto', 'oro', 'copa'] as Suit[]
  let best = 0
  suits.forEach((suit) => {
    const suitCards = hand.filter((c) => c.suit === suit)
    if (suitCards.length >= 2) {
      const vals = suitCards.map((c) => envidoValue(c.number)).sort((a, b) => b - a)
      best = Math.max(best, 20 + vals[0] + vals[1])
    } else if (suitCards.length === 1) {
      best = Math.max(best, envidoValue(suitCards[0].number))
    }
  })
  return best
}

// ─── Deck ────────────────────────────────────────────────────────────────────

const SUITS: Suit[] = ['espada', 'basto', 'oro', 'copa']
const NUMBERS = [1, 2, 3, 4, 5, 6, 7, 10, 11, 12]

export function createDeck(): Card[] {
  const deck: Card[] = []
  SUITS.forEach((suit) => {
    NUMBERS.forEach((number) => {
      deck.push({ id: `${number}-${suit}`, number, suit })
    })
  })
  return deck.sort(() => Math.random() - 0.5)
}

// ─── Initial state for a new hand ────────────────────────────────────────────

export function dealHand(state: GameState): GameState {
  const deck = createDeck()
  return {
    ...state,
    phase: 'playing',
    turn: state.mano,
    hands: { p1: deck.slice(0, 3), p2: deck.slice(3, 6) },
    table: { p1: [], p2: [] },
    tricks: [],
    currentTrick: 0,
    envido: { chain: [], pending: false },
    truco: { chain: [], pending: false },
    handNumber: state.handNumber + 1,
    lastMessage: undefined,
  }
}

export function createInitialState(
  gameId: string,
  p1Id: string,
  p2Id: string,
  aiSeat?: PlayerSeat,
): GameState {
  const deck = createDeck()
  return {
    gameId,
    phase: 'playing',
    mano: 'p1',
    turn: 'p1',
    hands: { p1: deck.slice(0, 3), p2: deck.slice(3, 6) },
    table: { p1: [], p2: [] },
    tricks: [],
    currentTrick: 0,
    envido: { chain: [], pending: false },
    truco: { chain: [], pending: false },
    score: { p1: 0, p2: 0 },
    handNumber: 1,
    players: { p1: p1Id, p2: p2Id },
    aiSeat,
  }
}

// ─── Move validation ─────────────────────────────────────────────────────────

export function canPlayCard(state: GameState, seat: PlayerSeat): boolean {
  return (
    state.phase === 'playing' &&
    state.turn === seat &&
    !state.envido.pending &&
    !state.truco.pending
  )
}

export function canCallEnvido(state: GameState, seat: PlayerSeat): boolean {
  return (
    !state.envido.pending &&
    !state.envido.winner &&
    state.turn === seat &&
    state.table.p1.length === 0 &&   // before first card
    state.table.p2.length === 0
  )
}

export function canCallTruco(state: GameState, seat: PlayerSeat): boolean {
  if (state.truco.pending || state.turn !== seat) return false
  const last = state.truco.chain.at(-1)
  if (!last) return true
  if (last === 'truco' && state.truco.caller !== seat) return true  // raise allowed
  if (last === 'retruco' && state.truco.caller !== seat) return true
  return false
}

// ─── Apply moves ─────────────────────────────────────────────────────────────

export function applyPlayCard(state: GameState, seat: PlayerSeat, cardId: string): GameState {
  const card = state.hands[seat].find((c) => c.id === cardId)
  if (!card) throw new Error('Card not in hand')

  const newHands = {
    ...state.hands,
    [seat]: state.hands[seat].filter((c) => c.id !== cardId),
  }
  const newTable = {
    ...state.table,
    [seat]: [...state.table[seat], card],
  }

  const opponent: PlayerSeat = seat === 'p1' ? 'p2' : 'p1'

  // If opponent already played this trick, resolve it
  if (newTable[opponent].length === newTable[seat].length) {
    return resolveTrick({ ...state, hands: newHands, table: newTable })
  }

  return {
    ...state,
    hands: newHands,
    table: newTable,
    turn: opponent,
  }
}

function resolveTrick(state: GameState): GameState {
  const trickIdx = state.table.p1.length - 1
  const p1Card = state.table.p1[trickIdx]
  const p2Card = state.table.p2[trickIdx]
  const p1Power = cardPower(p1Card)
  const p2Power = cardPower(p2Card)
  const winner: PlayerSeat | 'parda' =
    p1Power > p2Power ? 'p1' : p2Power > p1Power ? 'p2' : 'parda'

  const tricks = [...state.tricks, { p1: p1Card, p2: p2Card, winner }]

  // Check if hand is over (2 of 3 tricks won, or 3 tricks played)
  const handWinner = evaluateHand(tricks, state.mano)
  if (handWinner || tricks.length === 3) {
    return applyHandResult(state, tricks, handWinner)
  }

  // Next trick — winner of last trick leads next (parda → mano leads)
  const nextTurn: PlayerSeat =
    winner === 'parda' ? state.mano : winner

  return {
    ...state,
    tricks,
    currentTrick: state.currentTrick + 1,
    turn: nextTurn,
  }
}

function evaluateHand(tricks: Trick[], mano: PlayerSeat): PlayerSeat | null {
  if (tricks.length < 2) return null
  let p1 = 0, p2 = 0
  for (const t of tricks) {
    if (t.winner === 'p1') p1++
    else if (t.winner === 'p2') p2++
  }
  if (p1 >= 2) return 'p1'
  if (p2 >= 2) return 'p2'
  if (tricks.length === 3) return p1 >= p2 ? 'p1' : 'p2'
  return null
}

function applyHandResult(state: GameState, tricks: Trick[], winner: PlayerSeat | null): GameState {
  // Truco points
  let trucoPoints = 1
  if (state.truco.chain.length > 0) {
    if (state.truco.winner) {
      // Accepted: truco=2, retruco=3, vale4=4
      trucoPoints = ['truco', 'retruco', 'vale4'].indexOf(state.truco.chain.at(-1)!) + 2
    } else {
      // Not accepted: one less than the call
      trucoPoints = state.truco.chain.length
    }
  }

  const trucoWinner = state.truco.winner ?? winner ?? state.mano
  const newScore = {
    p1: state.score.p1 + (trucoWinner === 'p1' ? trucoPoints : 0),
    p2: state.score.p2 + (trucoWinner === 'p2' ? trucoPoints : 0),
  }

  const gameOver = newScore.p1 >= 15 || newScore.p2 >= 15
  const nextMano: PlayerSeat = state.mano === 'p1' ? 'p2' : 'p1'

  if (gameOver) {
    return { ...state, tricks, score: newScore, phase: 'game_over', lastMessage: `Fin del juego.` }
  }

  // Deal next hand after a brief pause (handled by caller)
  return {
    ...state,
    tricks,
    score: newScore,
    phase: 'hand_over',
    mano: nextMano,
    lastMessage: `Mano ganada por ${trucoWinner === 'p1' ? 'Jugador 1' : 'Jugador 2'}.`,
  }
}

// ─── Envido / Truco call handling ─────────────────────────────────────────────

export function applyEnvidoCall(
  state: GameState,
  seat: PlayerSeat,
  call: EnvidoCall | CallResponse,
): GameState {
  if (call === 'no_quiero') {
    // Caller gets 1 point (or falta envido rules omitted for simplicity)
    const caller = state.envido.caller!
    const points = state.envido.chain.length === 1 ? 1 : state.envido.chain.length
    const newScore = { ...state.score, [caller]: state.score[caller] + points }
    return {
      ...state,
      score: newScore,
      envido: { ...state.envido, pending: false, winner: caller },
      phase: 'playing',
      turn: state.mano,
    }
  }

  if (call === 'quiero') {
    const p1Points = calculateEnvido(state.hands.p1)
    const p2Points = calculateEnvido(state.hands.p2)
    const winner: PlayerSeat = p1Points >= p2Points ? 'p1' : 'p2'
    const lastCall = state.envido.chain.at(-1)!
    const points = lastCall === 'envido' ? 2 : lastCall === 'real_envido' ? 3 : 3 // falta simplified
    const newScore = { ...state.score, [winner]: state.score[winner] + points }
    return {
      ...state,
      score: newScore,
      envido: {
        ...state.envido,
        pending: false,
        winner,
        revealed: { p1: p1Points, p2: p2Points },
      },
      phase: 'playing',
      turn: state.mano,
    }
  }

  // Escalate call
  const chain = [...state.envido.chain, call as EnvidoCall]
  return {
    ...state,
    envido: { chain, pending: true, caller: seat },
    turn: seat === 'p1' ? 'p2' : 'p1',
  }
}

export function applyTrucoCall(
  state: GameState,
  seat: PlayerSeat,
  call: TrucoCall | CallResponse,
): GameState {
  const opponent: PlayerSeat = seat === 'p1' ? 'p2' : 'p1'

  if (call === 'no_quiero') {
    const points = state.truco.chain.length  // truco=1, retruco=2, vale4=3
    const caller = state.truco.caller!
    const newScore = { ...state.score, [caller]: state.score[caller] + points }
    return applyHandResult(
      { ...state, truco: { ...state.truco, pending: false, winner: caller }, score: newScore },
      state.tricks,
      caller,
    )
  }

  if (call === 'quiero') {
    return {
      ...state,
      truco: { ...state.truco, pending: false },
      phase: 'playing',
      turn: opponent,
    }
  }

  const chain = [...state.truco.chain, call as TrucoCall]
  return {
    ...state,
    truco: { chain, pending: true, caller: seat },
    phase: 'truco_pending',
    turn: opponent,
  }
}
