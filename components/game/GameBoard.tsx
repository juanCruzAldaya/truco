'use client'

import { useEffect, useRef } from 'react'
import { Bot, User, MessageSquare, Wifi, WifiOff } from 'lucide-react'
import { PlayingCard } from './PlayingCard'
import { useTrucoSocket } from '@/hooks/use-truco-socket'
import type { PlayerSeat } from '@/lib/game/engine'

interface GameBoardProps {
  gameId: string
  userId: string
  seat: PlayerSeat
  userName: string
}

export function GameBoard({ gameId, userId, seat, userName }: GameBoardProps) {
  const { state, aiMessage, connected, error, playCard, callEnvido, callTruco, irAlMazo } =
    useTrucoSocket({ gameId, userId, seat })

  const chatRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    chatRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [aiMessage])

  if (!state) {
    return (
      <div className="min-h-screen bg-[#0a0a1a] flex items-center justify-center text-slate-400">
        Conectando...
      </div>
    )
  }

  const opponentSeat: PlayerSeat = seat === 'p1' ? 'p2' : 'p1'
  const myHand = state.hands[seat]
  const opponentHandCount = state.hands[opponentSeat].filter((c) => c.id !== 'hidden').length || 3
  const myCards = state.table[seat]
  const opponentCards = state.table[opponentSeat]
  const myScore = state.score[seat]
  const opponentScore = state.score[opponentSeat]
  const isMyTurn = state.turn === seat
  const isHandOver = state.phase === 'hand_over' || state.phase === 'game_over'

  const envidoPending = state.envido.pending
  const trucoPending = state.truco.pending
  const iAmCaller = state.envido.caller === seat || state.truco.caller === seat

  // What actions am I allowed?
  const canPlayCard = isMyTurn && !envidoPending && !trucoPending && !isHandOver
  const canCallEnvidoNow = isMyTurn && !envidoPending && !state.envido.winner &&
    state.table.p1.length === 0 && state.table.p2.length === 0
  const canCallTrucoNow = isMyTurn && !trucoPending && !state.truco.winner
  const canRespond = isMyTurn && (envidoPending || trucoPending) && !iAmCaller

  return (
    <div className="min-h-screen bg-[#0a0a1a] text-slate-200 flex flex-col md:flex-row">
      {/* GAME AREA */}
      <div className="flex-1 flex flex-col items-center justify-between p-4 md:p-8 relative overflow-hidden">
        {/* Background glow */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[50vw] h-[50vw] bg-cyan-900/20 rounded-full blur-[100px] pointer-events-none" />

        {/* Scoreboard */}
        <div className="w-full max-w-3xl flex justify-between items-center bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-4 shadow-2xl z-10">
          <PlayerBadge name={userName} score={myScore} icon="user" isActive={isMyTurn} />

          <div className="text-center">
            <h1 className="text-2xl md:text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-blue-500 to-purple-600 tracking-widest">
              TRUCO.AI
            </h1>
            <p className="text-[10px] uppercase tracking-[0.3em] text-slate-500">A 15 Tantos</p>
            <div className="mt-1 flex items-center justify-center gap-1">
              {connected
                ? <Wifi className="w-3 h-3 text-green-400" />
                : <WifiOff className="w-3 h-3 text-red-400" />}
              <span className="text-[9px] text-slate-500">{connected ? 'online' : 'offline'}</span>
            </div>
          </div>

          <PlayerBadge name={state.isAiGame ? 'Claude AI' : 'Oponente'} score={opponentScore} icon="ai" isActive={!isMyTurn} />
        </div>

        {/* Opponent hand (face-down) */}
        <div className="flex justify-center gap-2 mt-6 z-10">
          {Array.from({ length: state.hands[opponentSeat].length || 3 }).map((_, i) => (
            <PlayingCard key={i} faceDown small />
          ))}
        </div>

        {/* Table / Mesa */}
        <div className="flex-1 w-full max-w-4xl relative flex items-center justify-center min-h-[280px] z-10">
          <div className="absolute inset-0 border border-white/5 rounded-[40px] bg-white/[0.02] shadow-[inset_0_0_50px_rgba(0,0,0,0.5)]" />

          {/* Opponent's played cards */}
          <div className="absolute top-6 left-1/2 -translate-x-1/2 flex gap-3">
            {opponentCards.map((card, i) => (
              <PlayingCard key={i} card={card} small className="-rotate-3" />
            ))}
          </div>

          {/* My played cards */}
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex gap-3">
            {myCards.map((card, i) => (
              <PlayingCard key={i} card={card} small className="rotate-3" />
            ))}
          </div>

          {/* Phase overlay */}
          {isHandOver && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/50 backdrop-blur-sm rounded-[40px] z-20">
              <p className="text-4xl font-black text-white drop-shadow-lg">
                {state.phase === 'game_over' ? '¡Fin del juego!' : state.lastMessage ?? 'Mano terminada'}
              </p>
            </div>
          )}

          {/* Pending call badge */}
          {(envidoPending || trucoPending) && (
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-amber-500/20 border border-amber-500/50 rounded-xl px-6 py-3 text-amber-300 font-bold text-lg">
              {trucoPending
                ? `¡${state.truco.chain.at(-1)?.toUpperCase()}!`
                : `¡${state.envido.chain.map((c) => c === 'envido' ? 'Envido' : c === 'real_envido' ? 'Real Envido' : 'Falta Envido').join(' + ')}!`}
            </div>
          )}
        </div>

        {/* Action buttons */}
        <div className="w-full max-w-3xl flex flex-col items-center gap-4 mb-4 z-10">
          <div className="flex flex-wrap justify-center gap-3 bg-white/5 p-3 rounded-2xl backdrop-blur-md border border-white/10">
            {/* Envido calls */}
            {canCallEnvidoNow && (
              <>
                <ActionButton label="ENVIDO" onClick={() => callEnvido('envido')} color="blue" />
                <ActionButton label="REAL ENVIDO" onClick={() => callEnvido('real_envido')} color="indigo" />
                <ActionButton label="FALTA ENVIDO" onClick={() => callEnvido('falta_envido')} color="violet" />
              </>
            )}

            {/* Respond to envido */}
            {canRespond && envidoPending && (
              <>
                <ActionButton label="QUIERO" onClick={() => callEnvido('quiero')} color="green" />
                <ActionButton label="NO QUIERO" onClick={() => callEnvido('no_quiero')} color="red" />
                {state.envido.chain.at(-1) === 'envido' && (
                  <ActionButton label="REAL ENVIDO" onClick={() => callEnvido('real_envido')} color="indigo" />
                )}
                {state.envido.chain.at(-1) !== 'falta_envido' && (
                  <ActionButton label="FALTA ENVIDO" onClick={() => callEnvido('falta_envido')} color="violet" />
                )}
              </>
            )}

            {/* Truco calls */}
            {canCallTrucoNow && !envidoPending && (
              <>
                {!state.truco.chain.length && <ActionButton label="TRUCO" onClick={() => callTruco('truco')} color="cyan" />}
                {state.truco.chain.at(-1) === 'truco' && !iAmCaller && (
                  <ActionButton label="RETRUCO" onClick={() => callTruco('retruco')} color="cyan" />
                )}
                {state.truco.chain.at(-1) === 'retruco' && !iAmCaller && (
                  <ActionButton label="VALE 4" onClick={() => callTruco('vale4')} color="cyan" />
                )}
              </>
            )}

            {/* Respond to truco */}
            {canRespond && trucoPending && (
              <>
                <ActionButton label="QUIERO" onClick={() => callTruco('quiero')} color="green" />
                <ActionButton label="NO QUIERO" onClick={() => callTruco('no_quiero')} color="red" />
                {state.truco.chain.at(-1) === 'truco' && (
                  <ActionButton label="RETRUCO" onClick={() => callTruco('retruco')} color="cyan" />
                )}
                {state.truco.chain.at(-1) === 'retruco' && (
                  <ActionButton label="VALE 4" onClick={() => callTruco('vale4')} color="cyan" />
                )}
              </>
            )}

            {/* Ir al mazo */}
            {isMyTurn && !isHandOver && (
              <ActionButton label="IR AL MAZO" onClick={irAlMazo} color="ghost" />
            )}
          </div>

          {/* My hand */}
          <div className="flex justify-center gap-2 md:gap-4 h-40">
            {myHand.map((card, i) => (
              <PlayingCard
                key={card.id}
                card={card}
                isPlayable={canPlayCard}
                onClick={() => playCard(card.id)}
              />
            ))}
          </div>
        </div>
      </div>

      {/* AI TERMINAL PANEL */}
      <div className="w-full md:w-80 bg-[#050510] border-t md:border-t-0 md:border-l border-white/10 flex flex-col">
        <div className="p-4 border-b border-white/10 flex items-center gap-2 bg-black/20">
          <MessageSquare className="w-5 h-5 text-purple-400" />
          <h2 className="font-mono font-bold text-sm tracking-widest text-purple-400">IA TERMINAL</h2>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4 font-mono text-xs">
          {aiMessage && (
            <div className="flex flex-col items-start">
              <span className="text-[9px] uppercase tracking-wider mb-1 text-purple-500">
                Claude — Truco Engine
              </span>
              <div className="p-3 rounded-lg bg-purple-900/30 border border-purple-500/30 text-purple-100 max-w-[90%]">
                {aiMessage}
              </div>
            </div>
          )}
          {error && (
            <div className="p-3 rounded-lg bg-red-900/30 border border-red-500/30 text-red-300 text-xs">
              {error}
            </div>
          )}
          <div ref={chatRef} />
        </div>

        <div className="p-4 border-t border-white/10 bg-black/20 text-xs font-mono text-slate-600">
          Mano #{state.handNumber} · {state.phase}
        </div>
      </div>
    </div>
  )
}

function PlayerBadge({ name, score, icon, isActive }: { name: string; score: number; icon: 'user' | 'ai'; isActive: boolean }) {
  return (
    <div className={`flex items-center gap-3 ${icon === 'ai' ? 'flex-row-reverse text-right' : ''}`}>
      <div className={`p-2 rounded-lg ${icon === 'user'
        ? 'bg-gradient-to-br from-cyan-500 to-blue-600'
        : 'bg-gradient-to-br from-purple-500 to-pink-600'} relative`}>
        {icon === 'user' ? <User className="w-6 h-6 text-white" /> : <Bot className="w-6 h-6 text-white" />}
        {isActive && (
          <span className="absolute -top-1 -right-1 flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-3 w-3 bg-cyan-500" />
          </span>
        )}
      </div>
      <div>
        <p className={`text-xs font-mono uppercase tracking-wider ${icon === 'user' ? 'text-cyan-300' : 'text-purple-400'}`}>
          {name}
        </p>
        <p className="text-2xl font-bold text-white">{score}</p>
      </div>
    </div>
  )
}

const COLOR_MAP = {
  blue: 'from-blue-600 to-blue-500 hover:shadow-[0_0_20px_rgba(59,130,246,0.5)]',
  indigo: 'from-indigo-600 to-indigo-500 hover:shadow-[0_0_20px_rgba(99,102,241,0.5)]',
  violet: 'from-violet-600 to-violet-500 hover:shadow-[0_0_20px_rgba(139,92,246,0.5)]',
  cyan: 'from-cyan-600 to-cyan-500 hover:shadow-[0_0_20px_rgba(6,182,212,0.5)]',
  green: 'from-green-600 to-green-500 hover:shadow-[0_0_20px_rgba(34,197,94,0.5)]',
  red: 'from-red-600 to-red-500 hover:shadow-[0_0_20px_rgba(239,68,68,0.5)]',
  ghost: 'bg-white/10 hover:bg-red-500/80 hover:shadow-[0_0_20px_rgba(239,68,68,0.5)]',
}

function ActionButton({ label, onClick, color }: { label: string; onClick: () => void; color: keyof typeof COLOR_MAP }) {
  const base = 'px-5 py-2 rounded-xl text-white font-bold text-sm transition-all disabled:opacity-50'
  const gradient = color === 'ghost' ? COLOR_MAP.ghost : `bg-gradient-to-r ${COLOR_MAP[color]}`
  return (
    <button onClick={onClick} className={`${base} ${gradient}`}>
      {label}
    </button>
  )
}
