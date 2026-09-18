'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabaseBrowser as supabase } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Search, RefreshCw, ChevronRight } from 'lucide-react'

interface Requisicao {
  id: number; empresa: string; categoria: string; descricao: string
  status: string; data_solicitacao: string
}

const STATUS_OPTIONS = ['Aguardando Autorização', 'Autorizado', 'Não Autorizado']

const STATUS_BADGE: Record<string, string> = {
  'Autorizado': 'bg-green-100 text-green-700',
  'Não Autorizado': 'bg-red-100 text-red-700',
  'Aguardando Autorização': 'bg-yellow-100 text-yellow-700',
}

const fmtData = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString('pt-BR')

export default function AcompanharRequisicoesPage() {
  const router = useRouter()
  const [requisicoes, setRequisicoes] = useState<Requisicao[]>([])
  const [loading, setLoading] = useState(true)

  const [searchId, setSearchId] = useState('')
  const [filtroEmpresa, setFiltroEmpresa] = useState('')
  const [filtroStatus, setFiltroStatus] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('requisicoes')
      .select('id, empresa, categoria, descricao, status, data_solicitacao')
      .order('id', { ascending: false })
    setRequisicoes(data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const empresas = useMemo(() => [...new Set(requisicoes.map(r => r.empresa))].sort(), [requisicoes])

  const filtered = useMemo(() => {
    const id = searchId.trim()
    if (id) return requisicoes.filter(r => String(r.id) === id)
    return requisicoes.filter(r =>
      (!filtroEmpresa || r.empresa === filtroEmpresa) &&
      (!filtroStatus || r.status === filtroStatus)
    )
  }, [requisicoes, searchId, filtroEmpresa, filtroStatus])

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="page-title">Requisições</h1>
          <p className="page-subtitle">Todas as requisições e o status de autorização</p>
        </div>
        <button onClick={load} className="btn-secondary p-2" title="Atualizar">
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      <div className="card">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input className="input pl-9" type="number" min="0" placeholder="Buscar por ID..."
              value={searchId} onChange={e => setSearchId(e.target.value)} />
          </div>
          <select className="input" value={filtroEmpresa} onChange={e => setFiltroEmpresa(e.target.value)}>
            <option value="">Todas as empresas</option>
            {empresas.map(e => <option key={e} value={e}>{e}</option>)}
          </select>
          <select className="input" value={filtroStatus} onChange={e => setFiltroStatus(e.target.value)}>
            <option value="">Todos os status</option>
            {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>

      {loading ? (
        <div className="card text-center py-12 text-slate-400">Carregando...</div>
      ) : filtered.length === 0 ? (
        <div className="card text-center py-12">
          <Search size={36} className="mx-auto text-slate-300 mb-3" />
          <p className="text-slate-500">Nenhuma requisição encontrada</p>
        </div>
      ) : (
        <div className="card p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="table-header">
                  <th className="table-cell font-medium">ID</th>
                  <th className="table-cell font-medium">Empresa</th>
                  <th className="table-cell font-medium">Categoria</th>
                  <th className="table-cell font-medium">Descrição</th>
                  <th className="table-cell font-medium">Data</th>
                  <th className="table-cell font-medium">Status</th>
                  <th className="table-cell font-medium w-10"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(r => (
                  <tr
                    key={r.id}
                    className="table-row cursor-pointer hover:bg-slate-50"
                    onClick={() => router.push(`/pagamentos/acompanhar-requisicoes/${r.id}`)}
                  >
                    <td className="table-cell font-mono text-xs text-slate-500">#{r.id}</td>
                    <td className="table-cell font-medium max-w-[140px] truncate">{r.empresa}</td>
                    <td className="table-cell text-slate-600 max-w-[120px] truncate">{r.categoria}</td>
                    <td className="table-cell text-slate-600 max-w-[240px] truncate">{r.descricao}</td>
                    <td className="table-cell text-slate-500">{fmtData(r.data_solicitacao)}</td>
                    <td className="table-cell">
                      <span className={`badge ${STATUS_BADGE[r.status] ?? 'bg-slate-100 text-slate-600'}`}>{r.status}</span>
                    </td>
                    <td className="table-cell">
                      <ChevronRight size={14} className="text-slate-400" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
