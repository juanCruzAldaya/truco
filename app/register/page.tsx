'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { trpc } from '@/lib/trpc/client'
import { signIn } from 'next-auth/react'

export default function RegisterPage() {
  const router = useRouter()
  const [form, setForm] = useState({ name: '', email: '', password: '' })
  const [error, setError] = useState('')

  const register = trpc.auth.register.useMutation({
    onSuccess: async () => {
      await signIn('credentials', { email: form.email, password: form.password, redirect: false })
      router.push('/lobby')
    },
    onError: (e) => setError(e.message),
  })

  return (
    <main className="min-h-screen bg-[#0a0a1a] flex items-center justify-center p-8">
      <div className="w-full max-w-sm">
        <h1 className="text-3xl font-black text-center mb-8 text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-500">
          Registrarse
        </h1>
        <form onSubmit={(e) => { e.preventDefault(); register.mutate(form) }}
          className="bg-white/5 border border-white/10 rounded-2xl p-6 space-y-4">
          <input
            value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Nombre" required minLength={2}
            className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-3 focus:outline-none focus:border-cyan-500"
          />
          <input
            type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })}
            placeholder="Email" required
            className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-3 focus:outline-none focus:border-cyan-500"
          />
          <input
            type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })}
            placeholder="Contraseña (mín. 6 caracteres)" required minLength={6}
            className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-3 focus:outline-none focus:border-cyan-500"
          />
          {error && <p className="text-red-400 text-sm">{error}</p>}
          <button type="submit" disabled={register.isPending}
            className="w-full py-3 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 font-bold disabled:opacity-50">
            {register.isPending ? 'Creando cuenta...' : 'Crear cuenta'}
          </button>
          <p className="text-center text-sm text-slate-500">
            ¿Ya tenés cuenta?{' '}
            <Link href="/login" className="text-cyan-400 hover:underline">Entrar</Link>
          </p>
        </form>
      </div>
    </main>
  )
}
