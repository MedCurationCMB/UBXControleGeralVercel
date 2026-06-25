'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Image from 'next/image'

export default function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const redirect = searchParams.get('redirect') ?? '/pagamentos'
  const statusPendente = searchParams.get('status') === 'pendente'

  const [tab, setTab] = useState<'login' | 'cadastro' | 'recuperar'>('login')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const [loginForm, setLoginForm] = useState({ email: '', password: '' })
  const [cadastroForm, setCadastroForm] = useState({ username: '', email: '', password: '', confirmPassword: '' })
  const [recuperarEmail, setRecuperarEmail] = useState('')

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(loginForm),
    })

    const data = await res.json()
    setLoading(false)

    if (!res.ok) {
      setError(data.error ?? 'Erro ao fazer login')
      return
    }

    router.push(redirect)
    router.refresh()
  }

  async function handleCadastro(e: React.FormEvent) {
    e.preventDefault()
    if (cadastroForm.password !== cadastroForm.confirmPassword) {
      setError('As senhas não coincidem')
      return
    }

    setLoading(true)
    setError(null)

    const res = await fetch('/api/auth/cadastro', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: cadastroForm.username,
        email: cadastroForm.email,
        password: cadastroForm.password,
      }),
    })

    const data = await res.json()
    setLoading(false)

    if (!res.ok) {
      setError(data.error ?? 'Erro ao criar conta')
      return
    }

    setSuccess('Cadastro realizado! Aguarde a aprovação do administrador.')
    setTab('login')
  }

  async function handleRecuperar(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const res = await fetch('/api/auth/recuperar-senha', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: recuperarEmail }),
    })

    setLoading(false)

    if (res.ok) {
      setSuccess('Se o email estiver cadastrado, você receberá as instruções em breve.')
      setTab('login')
    } else {
      setError('Erro ao solicitar recuperação de senha')
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="flex justify-center mb-8">
          <Image src="/assets/logo.png" alt="CMB Capital" width={160} height={60} className="object-contain" />
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="flex border-b border-slate-200">
            {(['login', 'cadastro', 'recuperar'] as const).map((t) => (
              <button
                key={t}
                onClick={() => { setTab(t); setError(null); setSuccess(null) }}
                className={`flex-1 py-3 text-sm font-medium transition-colors ${
                  tab === t
                    ? 'text-primary-600 border-b-2 border-primary-500 bg-white'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {t === 'login' ? 'Entrar' : t === 'cadastro' ? 'Cadastrar' : 'Recuperar Senha'}
              </button>
            ))}
          </div>

          <div className="p-6">
            {statusPendente && (
              <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-md text-sm text-yellow-800">
                Seu cadastro ainda está aguardando aprovação do administrador.
              </div>
            )}
            {error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-700">
                {error}
              </div>
            )}
            {success && (
              <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-md text-sm text-green-700">
                {success}
              </div>
            )}

            {tab === 'login' && (
              <form onSubmit={handleLogin} className="space-y-4">
                <div>
                  <label className="label">E-mail</label>
                  <input className="input" type="email" placeholder="seu@email.com" required
                    value={loginForm.email}
                    onChange={(e) => setLoginForm({ ...loginForm, email: e.target.value })} />
                </div>
                <div>
                  <label className="label">Senha</label>
                  <input className="input" type="password" placeholder="Sua senha" required
                    value={loginForm.password}
                    onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })} />
                </div>
                <button type="submit" className="btn-primary w-full justify-center" disabled={loading}>
                  {loading ? 'Entrando...' : 'Entrar'}
                </button>
              </form>
            )}

            {tab === 'cadastro' && (
              <form onSubmit={handleCadastro} className="space-y-4">
                <div>
                  <label className="label">Usuário</label>
                  <input className="input" type="text" placeholder="Escolha um usuário" required
                    value={cadastroForm.username}
                    onChange={(e) => setCadastroForm({ ...cadastroForm, username: e.target.value })} />
                </div>
                <div>
                  <label className="label">Email</label>
                  <input className="input" type="email" placeholder="seu@email.com" required
                    value={cadastroForm.email}
                    onChange={(e) => setCadastroForm({ ...cadastroForm, email: e.target.value })} />
                </div>
                <div>
                  <label className="label">Senha</label>
                  <input className="input" type="password" placeholder="Crie uma senha" required
                    value={cadastroForm.password}
                    onChange={(e) => setCadastroForm({ ...cadastroForm, password: e.target.value })} />
                </div>
                <div>
                  <label className="label">Confirmar Senha</label>
                  <input className="input" type="password" placeholder="Repita a senha" required
                    value={cadastroForm.confirmPassword}
                    onChange={(e) => setCadastroForm({ ...cadastroForm, confirmPassword: e.target.value })} />
                </div>
                <button type="submit" className="btn-primary w-full justify-center" disabled={loading}>
                  {loading ? 'Cadastrando...' : 'Criar Conta'}
                </button>
              </form>
            )}

            {tab === 'recuperar' && (
              <form onSubmit={handleRecuperar} className="space-y-4">
                <p className="text-sm text-slate-600">
                  Informe seu email e enviaremos as instruções para redefinir sua senha.
                </p>
                <div>
                  <label className="label">Email</label>
                  <input className="input" type="email" placeholder="seu@email.com" required
                    value={recuperarEmail}
                    onChange={(e) => setRecuperarEmail(e.target.value)} />
                </div>
                <button type="submit" className="btn-primary w-full justify-center" disabled={loading}>
                  {loading ? 'Enviando...' : 'Enviar Instruções'}
                </button>
              </form>
            )}
          </div>
        </div>

        <p className="text-center text-xs text-slate-400 mt-6">CMB Gestão © {new Date().getFullYear()}</p>
      </div>
    </div>
  )
}
