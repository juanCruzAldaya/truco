'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { io, type Socket } from 'socket.io-client'
import type { GameState, PlayerSeat } from '@/lib/game/engine'

interface UseTrucoSocketOptions {
  gameId: string
  userId: string
  seat: PlayerSeat
}

export function useTrucoSocket({ gameId, userId, seat }: UseTrucoSocketOptions) {
  const socketRef = useRef<Socket | null>(null)
  const [state, setState] = useState<GameState | null>(null)
  const [aiMessage, setAiMessage] = useState<string | null>(null)
  const [connected, setConnected] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const socket = io()
    socketRef.current = socket

    socket.on('connect', () => {
      setConnected(true)
      socket.emit('game:rejoin', { gameId, userId })
    })

    socket.on('disconnect', () => setConnected(false))

    const stateEvent = `game:state:${seat}`
    socket.on(stateEvent, (s: GameState) => {
      setState(s)
      setError(null)
    })
    socket.on('game:ai_thinking', ({ explanation }: { explanation: string }) => {
      setAiMessage(explanation)
    })
    socket.on('game:message', ({ text }: { text: string }) => setAiMessage(text))
    socket.on('game:error', ({ message }: { message: string }) => setError(message))

    return () => { socket.disconnect() }
  }, [gameId, userId, seat])

  const playCard = useCallback((cardId: string) => {
    socketRef.current?.emit('game:play_card', { gameId, userId, cardId })
  }, [gameId, userId])

  const callEnvido = useCallback((call: string) => {
    socketRef.current?.emit('game:envido', { gameId, userId, call })
  }, [gameId, userId])

  const callTruco = useCallback((call: string) => {
    socketRef.current?.emit('game:truco', { gameId, userId, call })
  }, [gameId, userId])

  const irAlMazo = useCallback(() => {
    socketRef.current?.emit('game:mazo', { gameId, userId })
  }, [gameId, userId])

  return { state, aiMessage, connected, error, playCard, callEnvido, callTruco, irAlMazo }
}
