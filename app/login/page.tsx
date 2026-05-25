'use client'

import { useState } from 'react'
import { signIn } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const result = await signIn('credentials', { email, password, redirect: false })
    if (result?.error) {
      setError('Email o contraseña incorrectos')
      setLoading(false)
    } else {
      router.push('/lobby')
    }
  }

  return (
    <main className="min-h-screen bg-[#0a0a1a] flex items-center justify-center p-8">
      <div className="w-full max-w-sm">
        <h1 className="text-3xl font-black text-center mb-8 text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-500">
          TRUCO.AI
        </h1>
        <form onSubmit={handleSubmit} className="bg-white/5 border border-white/10 rounded-2xl p-6 space-y-4">
          <input
            type="email" value={email} onChange={(e) => setEmail(e.target.value)}
            placeholder="Email" required
            className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-3 focus:outline-none focus:border-cyan-500"
          />
          <input
            type="password" value={password} onChange={(e) => setPassword(e.target.value)}
            placeholder="Contraseña" required
            className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-3 focus:outline-none focus:border-cyan-500"
          />
          {error && <p className="text-red-400 text-sm">{error}</p>}
          <button
            type="submit" disabled={loading}
            className="w-full py-3 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 font-bold disabled:opacity-50"
          >
            {loading ? 'Entrando...' : 'Entrar'}
          </button>
          <p className="text-center text-sm text-slate-500">
            ¿No tenés cuenta?{' '}
            <Link href="/register" className="text-cyan-400 hover:underline">Registrate</Link>
          </p>
        </form>
      </div>
    </main>
  )
}
