'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { trpc } from '@/lib/trpc/client'
import { Users, Bot, Plus, LogIn } from 'lucide-react'

export default function LobbyPage() {
  const router = useRouter()
  const [joiningId, setJoiningId] = useState('')
  const createGame = trpc.game.create.useMutation({
    onSuccess: ({ gameId }) => router.push(`/game/${gameId}`),
  })
  const joinGame = trpc.game.join.useMutation({
    onSuccess: ({ gameId }) => router.push(`/game/${gameId}`),
  })
  const { data: openGames } = trpc.game.listOpen.useQuery(undefined, { refetchInterval: 3000 })

  return (
    <main className="min-h-screen bg-[#0a0a1a] text-slate-200 p-8">
      <h1 className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-500 mb-8">
        Lobby
      </h1>

      <div className="grid md:grid-cols-2 gap-6 max-w-4xl">
        {/* Create */}
        <div className="bg-white/5 border border-white/10 rounded-2xl p-6 space-y-4">
          <h2 className="font-bold text-lg flex items-center gap-2">
            <Plus className="w-5 h-5 text-cyan-400" /> Nueva partida
          </h2>
          <button
            onClick={() => createGame.mutate({ vsAi: false })}
            disabled={createGame.isPending}
            className="w-full py-3 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 font-bold hover:shadow-[0_0_20px_rgba(6,182,212,0.4)] transition-all disabled:opacity-50 flex items-center justify-center gap-2"
          >
            <Users className="w-5 h-5" /> Crear sala multijugador
          </button>
          <button
            onClick={() => createGame.mutate({ vsAi: true })}
            disabled={createGame.isPending}
            className="w-full py-3 rounded-xl bg-gradient-to-r from-purple-600 to-pink-600 font-bold hover:shadow-[0_0_20px_rgba(139,92,246,0.4)] transition-all disabled:opacity-50 flex items-center justify-center gap-2"
          >
            <Bot className="w-5 h-5" /> Jugar vs Claude
          </button>
        </div>

        {/* Join */}
        <div className="bg-white/5 border border-white/10 rounded-2xl p-6 space-y-4">
          <h2 className="font-bold text-lg flex items-center gap-2">
            <LogIn className="w-5 h-5 text-green-400" /> Unirse
          </h2>
          <div className="flex gap-2">
            <input
              value={joiningId}
              onChange={(e) => setJoiningId(e.target.value)}
              placeholder="ID de la partida"
              className="flex-1 bg-white/10 border border-white/20 rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-cyan-500"
            />
            <button
              onClick={() => joinGame.mutate({ gameId: joiningId })}
              disabled={!joiningId || joinGame.isPending}
              className="px-4 py-2 rounded-xl bg-green-600 font-bold disabled:opacity-50"
            >
              OK
            </button>
          </div>

          {openGames && openGames.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs text-slate-500 uppercase tracking-wider">Salas abiertas</p>
              {openGames.map((g) => (
                <div key={g.id} className="flex items-center justify-between bg-white/5 rounded-xl px-4 py-3">
                  <span className="text-sm">{g.player1.name}</span>
                  <button
                    onClick={() => joinGame.mutate({ gameId: g.id })}
                    className="text-xs px-3 py-1 rounded-lg bg-cyan-600 hover:bg-cyan-500 transition-colors"
                  >
                    Unirse
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  )
}
