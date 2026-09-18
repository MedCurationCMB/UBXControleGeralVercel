'use client'

import { useState, useEffect, useCallback } from 'react'
import { supabaseBrowser as supabase } from '@/lib/supabase/client'
import { CheckCircle, Info } from 'lucide-react'

interface Requisicao {
  id: number; empresa: string; categoria: string; descricao: string
  status: string; data_solicitacao: string
}

const fmtData = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString('pt-BR')

const STATUS_BADGE: Record<string, string> = {
  'Autorizado': 'bg-green-100 text-green-700',
  'Não Autorizado': 'bg-red-100 text-red-700',
  'Aguardando Autorização': 'bg-amber-100 text-amber-700',
}

export default function RequisicoesPage() {
  const [fluxoAtivo, setFluxoAtivo] = useState<boolean | null>(null)

  const [empresas, setEmpresas] = useState<string[]>([])
  const [categoriasPorEmpresa, setCategoriasPorEmpresa] = useState<Record<string, string[]>>({})
  const [requisicoes, setRequisicoes] = useState<Requisicao[]>([])
  const [loading, setLoading] = useState(true)

  const [empresa, setEmpresa] = useState('')
  const [categoria, setCategoria] = useState('')
  const [descricao, setDescricao] = useState('')

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [successInfo, setSuccessInfo] = useState<{ empresa: string; categoria: string } | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const [{ data: cfg }, { data: cats }, { data: reqs }] = await Promise.all([
      supabase.from('config').select('valor').eq('chave', 'fluxo_sistema').maybeSingle(),
      supabase.from('categorias').select('empresa, categoria').order('empresa').order('categoria'),
      supabase.from('requisicoes').select('id, empresa, categoria, descricao, status, data_solicitacao').order('id', { ascending: false }),
    ])
    setFluxoAtivo(cfg?.valor === '4')
    const emps = [...new Set((cats ?? []).map(r => r.empresa).filter(Boolean))].sort() as string[]
    const catMap: Record<string, string[]> = {}
    for (const row of (cats ?? [])) {
      if (row.empresa && row.categoria) {
        if (!catMap[row.empresa]) catMap[row.empresa] = []
        if (!catMap[row.empresa].includes(row.categoria)) catMap[row.empresa].push(row.categoria)
      }
    }
    setEmpresas(emps)
    setCategoriasPorEmpresa(catMap)
    setRequisicoes(reqs ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const categorias = categoriasPorEmpresa[empresa] ?? []

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!empresa) { setError('Selecione a empresa'); return }
    if (!categoria) { setError('Selecione a categoria'); return }
    if (!descricao.trim()) { setError('Informe a descrição'); return }

    setSaving(true)
    const { error: err } = await supabase.from('requisicoes').insert({
      empresa, categoria, descricao: descricao.trim(),
      status: 'Aguardando Autorização',
      data_solicitacao: new Date().toISOString().split('T')[0],
    })
    setSaving(false)
    if (err) { setError(err.message); return }

    setSuccessInfo({ empresa, categoria })
    setEmpresa('')
    setCategoria('')
    setDescricao('')
    setTimeout(() => setSuccessInfo(null), 6000)
    load()
  }

  if (fluxoAtivo === null) {
    return <p className="text-slate-400 text-sm">Carregando...</p>
  }

  if (!fluxoAtivo) {
    return (
      <div className="card flex items-start gap-2 p-4 bg-amber-50 border border-amber-200 text-amber-800">
        <Info size={16} className="mt-0.5 shrink-0" />
        <p className="text-sm">
          Esta tela só está disponível quando o Fluxo 4 está ativo. Ative-o em Painel Administrativo → Configurações.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title">Requisitar</h1>
        <p className="page-subtitle">Solicite uma requisição para depois vincular a um pedido</p>
      </div>

      {successInfo && (
        <div className="flex items-start gap-3 p-4 bg-green-50 border border-green-200 rounded-lg text-green-800">
          <CheckCircle size={20} className="mt-0.5 shrink-0" />
          <div className="text-sm">
            <p className="font-semibold">Requisição enviada para autorização!</p>
            <p>{successInfo.empresa} · {successInfo.categoria}</p>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="card space-y-5">
        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div>
            <label className="label">Empresa *</label>
            <select
              className="input" value={empresa}
              onChange={e => { setEmpresa(e.target.value); setCategoria('') }}
            >
              <option value="">Selecionar...</option>
              {empresas.map(e => <option key={e} value={e}>{e}</option>)}
            </select>
          </div>

          <div>
            <label className="label">Categoria *</label>
            <select
              className="input" value={categoria}
              onChange={e => setCategoria(e.target.value)}
              disabled={!empresa}
            >
              <option value="">Selecionar...</option>
              {categorias.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>

        <div>
          <label className="label">Descrição *</label>
          <textarea
            className="input min-h-[80px] resize-y"
            placeholder="Descreva a necessidade..."
            value={descricao}
            onChange={e => setDescricao(e.target.value)}
          />
        </div>

        <button type="submit" disabled={saving} className="btn-primary">
          {saving ? 'Enviando...' : 'Enviar Requisição'}
        </button>
      </form>

      <div className="card">
        <h2 className="text-sm font-semibold text-slate-700 mb-4">Minhas Requisições</h2>
        {loading ? (
          <p className="text-slate-400 text-sm text-center py-6">Carregando...</p>
        ) : requisicoes.length === 0 ? (
          <p className="text-slate-400 text-sm text-center py-6">Nenhuma requisição cadastrada.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="table-header">
                <tr>
                  <th className="table-cell text-left">#</th>
                  <th className="table-cell text-left">Empresa</th>
                  <th className="table-cell text-left">Categoria</th>
                  <th className="table-cell text-left">Descrição</th>
                  <th className="table-cell text-left">Data</th>
                  <th className="table-cell text-center">Status</th>
                </tr>
              </thead>
              <tbody>
                {requisicoes.map(r => (
                  <tr key={r.id} className="table-row">
                    <td className="table-cell">#{r.id}</td>
                    <td className="table-cell">{r.empresa}</td>
                    <td className="table-cell">{r.categoria}</td>
                    <td className="table-cell max-w-xs truncate" title={r.descricao}>{r.descricao}</td>
                    <td className="table-cell">{fmtData(r.data_solicitacao)}</td>
                    <td className="table-cell text-center">
                      <span className={`badge ${STATUS_BADGE[r.status] ?? 'bg-slate-100 text-slate-500'}`}>{r.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
