'use client'

import { useState, useEffect, useCallback } from 'react'
import { Plus, Trash2, Pencil, Check, X, RefreshCw } from 'lucide-react'

interface Projeto { id: number; nome: string; ativo: boolean; membros: number }
interface Membro { usuario_id: number; papel: 'admin' | 'user'; username: string; email: string; status: string }

async function chamar(url: string, method: string, body?: unknown) {
  const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })
  const d = await r.json().catch(() => ({}))
  return { ok: r.ok, erro: (d?.error as string | undefined) ?? '', d }
}

export default function ProjetosPage() {
  const [ehOwner, setEhOwner] = useState(false)
  const [ativo, setAtivo] = useState<number | null>(null)
  const [projetos, setProjetos] = useState<Projeto[]>([])
  const [selecionado, setSelecionado] = useState<number | null>(null)
  const [membros, setMembros] = useState<Membro[]>([])
  const [voce, setVoce] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null)

  const [novoNome, setNovoNome] = useState('')
  const [renomeando, setRenomeando] = useState<{ id: number; nome: string } | null>(null)
  const [email, setEmail] = useState('')
  const [papel, setPapel] = useState<'admin' | 'user'>('user')

  const aviso = (tipo: 'ok' | 'erro', texto: string) => setMsg({ tipo, texto })

  const carregarProjetos = useCallback(async () => {
    const me = await fetch('/api/auth/me').then(r => r.json())
    const owner = me?.hierarquia === 'owner'
    setEhOwner(owner)
    setAtivo(me?.projetoId ?? null)
    if (owner) {
      const { d } = await chamar('/api/admin/projetos', 'GET')
      setProjetos(d.projetos ?? [])
    } else {
      setProjetos([{ id: me.projetoId, nome: me.projetoNome, ativo: true, membros: 0 }])
    }
    setSelecionado(s => s ?? me?.projetoId ?? null)
    setLoading(false)
  }, [])

  const carregarMembros = useCallback(async (id: number) => {
    const { ok, d, erro } = await chamar(`/api/admin/projetos/${id}/membros`, 'GET')
    if (!ok) { aviso('erro', erro); setMembros([]); return }
    setMembros(d.membros ?? [])
    setVoce(d.voce ?? null)
  }, [])

  useEffect(() => { carregarProjetos() }, [carregarProjetos])
  useEffect(() => { if (selecionado != null) carregarMembros(selecionado) }, [selecionado, carregarMembros])

  const criar = async () => {
    setMsg(null)
    const { ok, erro } = await chamar('/api/admin/projetos', 'POST', { nome: novoNome })
    if (!ok) return aviso('erro', erro)
    setNovoNome('')
    aviso('ok', 'Projeto criado. Adicione os usuários e cadastre empresas, categorias e orçamento nas telas do projeto.')
    carregarProjetos()
  }

  const salvarNome = async () => {
    if (!renomeando) return
    const { ok, erro } = await chamar(`/api/admin/projetos/${renomeando.id}`, 'PATCH', { nome: renomeando.nome })
    if (!ok) return aviso('erro', erro)
    setRenomeando(null)
    carregarProjetos()
    // o nome no cabeçalho vem da sessão: atualiza no próximo login ou troca de projeto
  }

  const alternarAtivo = async (p: Projeto) => {
    if (p.ativo && !window.confirm(`Desativar "${p.nome}"? Os usuários deixam de conseguir abrir este projeto.`)) return
    const { ok, erro } = await chamar(`/api/admin/projetos/${p.id}`, 'PATCH', { ativo: !p.ativo })
    if (!ok) return aviso('erro', erro)
    carregarProjetos()
  }

  const adicionar = async () => {
    if (selecionado == null) return
    setMsg(null)
    const { ok, erro, d } = await chamar(`/api/admin/projetos/${selecionado}/membros`, 'POST', { email, papel })
    if (!ok) return aviso('erro', erro)
    setEmail('')
    aviso('ok', `${d.username} agora tem acesso ao projeto.`)
    carregarMembros(selecionado)
    if (ehOwner) carregarProjetos()
  }

  const mudarPapel = async (m: Membro, novo: 'admin' | 'user') => {
    if (selecionado == null) return
    const { ok, erro } = await chamar(`/api/admin/projetos/${selecionado}/membros/${m.usuario_id}`, 'PATCH', { papel: novo })
    if (!ok) aviso('erro', erro)
    carregarMembros(selecionado)
  }

  const remover = async (m: Membro) => {
    if (selecionado == null || !window.confirm(`Remover o acesso de ${m.username} a este projeto?`)) return
    const { ok, erro } = await chamar(`/api/admin/projetos/${selecionado}/membros/${m.usuario_id}`, 'DELETE')
    if (!ok) return aviso('erro', erro)
    carregarMembros(selecionado)
    if (ehOwner) carregarProjetos()
  }

  if (loading) return <div className="card text-center py-12 text-slate-400">Carregando...</div>
  const projetoSel = projetos.find(p => p.id === selecionado)

  return (
    <div className="space-y-5">
      <div>
        <h1 className="page-title">Projetos e Acessos</h1>
        <p className="page-subtitle">
          {ehOwner ? 'Crie projetos e defina quem acessa cada um' : 'Quem tem acesso a este projeto'}
        </p>
      </div>

      {msg && (
        <div className={`rounded-lg border px-4 py-3 text-sm ${msg.tipo === 'ok' ? 'bg-green-50 border-green-200 text-green-800' : 'bg-red-50 border-red-200 text-red-700'}`}>
          {msg.texto}
        </div>
      )}

      {ehOwner && (
        <div className="card">
          <h2 className="text-sm font-semibold text-slate-700 mb-3">Projetos</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-500 border-b border-slate-100">
                  <th className="table-cell font-medium">Projeto</th>
                  <th className="table-cell font-medium">Situação</th>
                  <th className="table-cell font-medium">Usuários</th>
                  <th className="table-cell font-medium" />
                </tr>
              </thead>
              <tbody>
                {projetos.map(p => (
                  <tr key={p.id} className={`border-b border-slate-50 ${p.id === selecionado ? 'bg-slate-50' : ''}`}>
                    <td className="table-cell">
                      {renomeando?.id === p.id ? (
                        <span className="inline-flex items-center gap-1">
                          <input className="input py-1" value={renomeando.nome} onChange={e => setRenomeando({ id: p.id, nome: e.target.value })} />
                          <button onClick={salvarNome} className="text-green-600 p-1" title="Salvar"><Check size={15} /></button>
                          <button onClick={() => setRenomeando(null)} className="text-slate-400 p-1" title="Cancelar"><X size={15} /></button>
                        </span>
                      ) : (
                        <span className="font-medium text-slate-800">
                          {p.nome}{p.id === ativo && <span className="ml-2 text-xs text-slate-400">(ativo agora)</span>}
                        </span>
                      )}
                    </td>
                    <td className="table-cell">
                      <span className={`badge ${p.ativo ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>{p.ativo ? 'Ativo' : 'Desativado'}</span>
                    </td>
                    <td className="table-cell">{p.membros}</td>
                    <td className="table-cell text-right whitespace-nowrap">
                      <button onClick={() => setSelecionado(p.id)} className="btn-secondary text-xs mr-2">Gerenciar acessos</button>
                      <button onClick={() => setRenomeando({ id: p.id, nome: p.nome })} className="text-slate-400 hover:text-slate-700 p-1 mr-1" title="Renomear"><Pencil size={14} /></button>
                      <button onClick={() => alternarAtivo(p)} className="text-xs text-slate-500 hover:text-slate-800 underline">{p.ativo ? 'Desativar' : 'Reativar'}</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center gap-2 mt-4 pt-4 border-t border-slate-100">
            <input className="input max-w-xs" placeholder="Nome do novo projeto" value={novoNome}
              onChange={e => setNovoNome(e.target.value)} onKeyDown={e => e.key === 'Enter' && criar()} />
            <button onClick={criar} disabled={novoNome.trim().length < 2} className="btn-primary gap-1.5 text-sm"><Plus size={14} /> Criar projeto</button>
          </div>
        </div>
      )}

      <div className="card">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-slate-700">Acessos{projetoSel ? ` — ${projetoSel.nome}` : ''}</h2>
          <button onClick={() => selecionado != null && carregarMembros(selecionado)} className="btn-secondary p-2" title="Atualizar"><RefreshCw size={14} /></button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500 border-b border-slate-100">
                <th className="table-cell font-medium">Usuário</th>
                <th className="table-cell font-medium">E-mail</th>
                <th className="table-cell font-medium">Papel no projeto</th>
                <th className="table-cell font-medium" />
              </tr>
            </thead>
            <tbody>
              {membros.length === 0 && (
                <tr><td colSpan={4} className="table-cell text-slate-400 text-center py-6">Nenhum usuário neste projeto.</td></tr>
              )}
              {membros.map(m => (
                <tr key={m.usuario_id} className="border-b border-slate-50">
                  <td className="table-cell font-medium text-slate-800">{m.username}{m.usuario_id === voce && <span className="ml-2 text-xs text-slate-400">(você)</span>}</td>
                  <td className="table-cell text-slate-500">{m.email}</td>
                  <td className="table-cell">
                    <select className="input py-1 w-auto" value={m.papel} disabled={m.usuario_id === voce}
                      onChange={e => mudarPapel(m, e.target.value as 'admin' | 'user')}>
                      <option value="user">Usuário</option>
                      <option value="admin">Administrador</option>
                    </select>
                  </td>
                  <td className="table-cell text-right">
                    {m.usuario_id !== voce && (
                      <button onClick={() => remover(m)} className="text-slate-400 hover:text-red-600 p-1" title="Remover acesso"><Trash2 size={15} /></button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap items-center gap-2 mt-4 pt-4 border-t border-slate-100">
          <input className="input max-w-xs" type="email" placeholder="E-mail do usuário (já cadastrado)" value={email}
            onChange={e => setEmail(e.target.value)} onKeyDown={e => e.key === 'Enter' && adicionar()} />
          <select className="input w-auto" value={papel} onChange={e => setPapel(e.target.value as 'admin' | 'user')}>
            <option value="user">Usuário</option>
            <option value="admin">Administrador</option>
          </select>
          <button onClick={adicionar} disabled={!email.trim() || selecionado == null} className="btn-primary gap-1.5 text-sm"><Plus size={14} /> Adicionar acesso</button>
        </div>
        <p className="text-xs text-slate-400 mt-2">
          O usuário precisa ter feito o cadastro e estar autorizado pelo owner. Administrador do projeto gerencia os acessos e as configurações dele.
        </p>
      </div>
    </div>
  )
}
