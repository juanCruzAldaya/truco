'use client'

import { useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { trpc } from '@/lib/trpc/client'
import { Bot, Users } from 'lucide-react'

export default function NewGamePage() {
  const router = useRouter()
  const params = useSearchParams()
  const vsAi = params.get('ai') === 'true'

  const createGame = trpc.game.create.useMutation({
    onSuccess: ({ gameId }) => router.replace(`/game/${gameId}`),
    onError: () => router.replace('/lobby'),
  })

  useEffect(() => {
    createGame.mutate({ vsAi })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="min-h-screen bg-[#0a0a1a] flex flex-col items-center justify-center gap-4 text-slate-400">
      {vsAi
        ? <Bot className="w-10 h-10 text-purple-400 animate-pulse" />
        : <Users className="w-10 h-10 text-cyan-400 animate-pulse" />}
      <p className="font-mono text-sm tracking-widest uppercase">
        {vsAi ? 'Preparando partida vs Claude...' : 'Creando sala...'}
      </p>
    </div>
  )
}
