'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { LogOut, User } from 'lucide-react'
import type { TipoHierarquia } from '@/types/database'

interface HeaderProps {
  username: string
  hierarquia: TipoHierarquia
  projetoId: number
  projetoNome: string
}

const hierarquiaLabel: Record<TipoHierarquia, string> = {
  user: 'Usuário',
  admin: 'Administrador',
  owner: 'Owner',
}

export default function Header({ username, hierarquia, projetoId, projetoNome }: HeaderProps) {
  const router = useRouter()
  const [projetos, setProjetos] = useState<{ id: number; nome: string }[]>([])

  useEffect(() => {
    fetch('/api/projetos').then(r => r.json()).then(d => setProjetos(d?.projetos ?? [])).catch(() => {})
  }, [])

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/login')
    router.refresh()
  }

  // Recarrega a página inteira: telas, filtros e caches em memória são do projeto anterior
  async function trocarProjeto(id: number) {
    const r = await fetch('/api/auth/projeto', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projetoId: id }),
    })
    if (r.ok) window.location.href = '/inicio'
  }

  return (
    <header className="h-14 flex-shrink-0 bg-white border-b border-slate-200 flex items-center justify-between px-6">
      <div className="text-sm">
        {projetos.length > 1 ? (
          <select
            className="input py-1 w-auto font-medium"
            value={projetoId}
            onChange={e => trocarProjeto(Number(e.target.value))}
            title="Projeto"
          >
            {projetos.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
          </select>
        ) : (
          <span className="font-medium text-slate-600">{projetoNome}</span>
        )}
      </div>
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 text-sm">
          <div className="w-8 h-8 rounded-full bg-primary-100 flex items-center justify-center">
            <User size={14} className="text-primary-600" />
          </div>
          <div className="text-right">
            <p className="font-medium text-slate-800 leading-none">{username}</p>
            <p className="text-xs text-slate-400 mt-0.5">{hierarquiaLabel[hierarquia]}</p>
          </div>
        </div>
        <button
          onClick={handleLogout}
          className="p-2 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
          title="Sair"
        >
          <LogOut size={16} />
        </button>
      </div>
    </header>
  )
}
