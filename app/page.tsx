import Link from 'next/link'
import { auth } from '@/lib/auth'
import { Swords, Users, Bot } from 'lucide-react'

export default async function Home() {
  const session = await auth()

  return (
    <main className="min-h-screen bg-[#0a0a1a] text-slate-200 flex flex-col items-center justify-center p-8">
      <div className="text-center mb-12">
        <h1 className="text-6xl font-black text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-blue-500 to-purple-600 tracking-widest mb-3">
          TRUCO.AI
        </h1>
        <p className="text-slate-500 text-lg">El truco argentino. Aprendé jugando contra Claude.</p>
      </div>

      {session?.user ? (
        <div className="flex flex-col sm:flex-row gap-4 w-full max-w-lg">
          <Link
            href="/lobby/new?ai=true"
            className="flex-1 flex flex-col items-center gap-3 p-8 rounded-2xl bg-white/5 border border-white/10 hover:border-purple-500/50 hover:bg-purple-500/10 transition-all group"
          >
            <Bot className="w-10 h-10 text-purple-400 group-hover:scale-110 transition-transform" />
            <span className="font-bold text-lg">Jugar vs IA</span>
            <span className="text-xs text-slate-500 text-center">Claude analiza cada jugada y te explica la estrategia</span>
          </Link>

          <Link
            href="/lobby"
            className="flex-1 flex flex-col items-center gap-3 p-8 rounded-2xl bg-white/5 border border-white/10 hover:border-cyan-500/50 hover:bg-cyan-500/10 transition-all group"
          >
            <Users className="w-10 h-10 text-cyan-400 group-hover:scale-110 transition-transform" />
            <span className="font-bold text-lg">Multijugador</span>
            <span className="text-xs text-slate-500 text-center">Jugá contra otros en tiempo real con Socket.io</span>
          </Link>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-4">
          <Swords className="w-16 h-16 text-cyan-400 mb-4" />
          <Link
            href="/login"
            className="px-8 py-3 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 text-white font-bold text-lg hover:shadow-[0_0_30px_rgba(6,182,212,0.4)] transition-all"
          >
            Entrar a jugar
          </Link>
          <Link href="/register" className="text-sm text-slate-500 hover:text-slate-300 transition-colors">
            ¿No tenés cuenta? Registrate
          </Link>
        </div>
      )}
    </main>
  )
}
