'use client'

import { useState, useEffect, useCallback } from 'react'
import { supabaseBrowser as supabase } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Search, RefreshCw, ChevronRight, ChevronLeft, AlertTriangle } from 'lucide-react'

interface Pedido {
  id: number; empresa: string; categoria: string; cliente: string
  valor_pedido: number; status: string; emergencia: boolean
  data_solicitacao: string; cancelado: boolean
}

const PAGE_SIZE = 100

const STATUS_OPTIONS = [
  'Aguardando Autorização',
  'Autorizado',
  'Não Autorizado',
  'Cancelado',
]

const STATUS_BADGE: Record<string, string> = {
  'Autorizado': 'bg-green-100 text-green-700',
  'Não Autorizado': 'bg-red-100 text-red-700',
  'Aguardando Autorização': 'bg-yellow-100 text-yellow-700',
  'Cancelado': 'bg-slate-200 text-slate-600',
}

const fmtMoeda = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const fmtData = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString('pt-BR')

export default function AcompanharRecebimentosPage() {
  const router = useRouter()
  const [pedidos, setPedidos] = useState<Pedido[]>([])
  const [loading, setLoading] = useState(true)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)

  const [empresas, setEmpresas] = useState<string[]>([])
  const [categorias, setCategorias] = useState<string[]>([])
  const [clientes, setClientes] = useState<string[]>([])

  const [searchId, setSearchId] = useState('')
  const [activeSearchId, setActiveSearchId] = useState('')

  const [filtroEmpresa, setFiltroEmpresa] = useState('')
  const [filtroCategoria, setFiltroCategoria] = useState('')
  const [filtroCliente, setFiltroCliente] = useState('')
  const [filtroStatus, setFiltroStatus] = useState('')

  useEffect(() => {
    const fetchOpcoes = async () => {
      const [{ data: emp }, { data: cat }, { data: cli }] = await Promise.all([
        supabase.from('pedidos_solicitados_receita').select('empresa').order('empresa').limit(1000),
        supabase.from('pedidos_solicitados_receita').select('categoria').order('categoria').limit(1000),
        supabase.from('pedidos_solicitados_receita').select('cliente').order('cliente').limit(1000),
      ])
      setEmpresas([...new Set(emp?.map(r => r.empresa).filter(Boolean) ?? [])].sort())
      setCategorias([...new Set(cat?.map(r => r.categoria).filter(Boolean) ?? [])].sort())
      setClientes([...new Set(cli?.map(r => r.cliente).filter(Boolean) ?? [])].sort())
    }
    fetchOpcoes()
  }, [])

  useEffect(() => { setPage(0) }, [filtroEmpresa, filtroCategoria, filtroCliente, filtroStatus, activeSearchId])

  const load = useCallback(async () => {
    setLoading(true)

    if (activeSearchId) {
      const idNum = parseInt(activeSearchId)
      if (isNaN(idNum)) {
        setPedidos([]); setTotal(0); setLoading(false); return
      }
      const { data } = await supabase
        .from('pedidos_solicitados_receita')
        .select('id, empresa, categoria, cliente, valor_pedido, status, emergencia, data_solicitacao, cancelado')
        .eq('id', idNum)
      setPedidos(data ?? []); setTotal(data?.length ?? 0); setLoading(false); return
    }

    let query = supabase
      .from('pedidos_solicitados_receita')
      .select(
        'id, empresa, categoria, cliente, valor_pedido, status, emergencia, data_solicitacao, cancelado',
        { count: 'exact' }
      )
      .order('id', { ascending: false })
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)

    if (filtroEmpresa)   query = query.eq('empresa', filtroEmpresa)
    if (filtroCategoria) query = query.eq('categoria', filtroCategoria)
    if (filtroCliente)   query = query.eq('cliente', filtroCliente)

    if (filtroStatus === 'Cancelado') {
      query = query.eq('cancelado', true)
    } else if (filtroStatus) {
      query = query.eq('status', filtroStatus).eq('cancelado', false)
    }

    const { data, count } = await query
    setPedidos(data ?? []); setTotal(count ?? 0); setLoading(false)
  }, [page, activeSearchId, filtroEmpresa, filtroCategoria, filtroCliente, filtroStatus])

  useEffect(() => { load() }, [load])

  const totalPages = Math.ceil(total / PAGE_SIZE)
  const statusDisplay = (p: Pedido) => p.cancelado ? 'Cancelado' : p.status

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">Acompanhar Pedidos</h1>
          <p className="page-subtitle">Recebimentos — todos os pedidos</p>
        </div>
        <button onClick={load} className="btn-secondary p-2" title="Atualizar">
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Filtros */}
      <div className="card">
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {/* ID search */}
          <div className="relative lg:col-span-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input className="input pl-9" type="number" min="0" placeholder="Buscar ID..."
              value={searchId}
              onChange={e => setSearchId(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') setActiveSearchId(searchId) }}
            />
          </div>
          <button
            onClick={() => setActiveSearchId(searchId)}
            className="btn-secondary text-sm lg:col-span-1">
            Buscar
          </button>
          <select className="input" value={filtroEmpresa}
            onChange={e => { setFiltroEmpresa(e.target.value); setFiltroCategoria(''); setFiltroCliente('') }}
            disabled={!!activeSearchId}>
            <option value="">Todas as empresas</option>
            {empresas.map(e => <option key={e} value={e}>{e}</option>)}
          </select>
          <select className="input" value={filtroCategoria}
            onChange={e => setFiltroCategoria(e.target.value)} disabled={!!activeSearchId}>
            <option value="">Todas as categorias</option>
            {categorias.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <select className="input" value={filtroCliente}
            onChange={e => setFiltroCliente(e.target.value)} disabled={!!activeSearchId}>
            <option value="">Todos os clientes</option>
            {clientes.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <select className="input" value={filtroStatus}
            onChange={e => setFiltroStatus(e.target.value)} disabled={!!activeSearchId}>
            <option value="">Todos os status</option>
            {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>

        {activeSearchId && (
          <div className="mt-3 pt-3 border-t border-slate-100 flex items-center gap-2">
            <span className="text-sm text-slate-500">Buscando por ID: <strong>{activeSearchId}</strong></span>
            <button onClick={() => { setSearchId(''); setActiveSearchId('') }}
              className="text-xs text-blue-600 hover:underline">Limpar</button>
          </div>
        )}

        <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-100">
          <span className="text-sm text-slate-500">{total} pedido(s)</span>
          {!activeSearchId && totalPages > 1 && (
            <div className="flex items-center gap-2">
              <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}
                className="btn-secondary p-1 disabled:opacity-40"><ChevronLeft size={14} /></button>
              <span className="text-xs text-slate-500">Pág. {page + 1}/{totalPages}</span>
              <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}
                className="btn-secondary p-1 disabled:opacity-40"><ChevronRight size={14} /></button>
            </div>
          )}
        </div>
      </div>

      {loading && <div className="card text-center py-12 text-slate-400">Carregando...</div>}
      {!loading && pedidos.length === 0 && (
        <div className="card text-center py-16">
          <p className="text-slate-500 font-medium">Nenhum pedido encontrado</p>
        </div>
      )}

      {!loading && pedidos.length > 0 && (
        <div className="space-y-3">
          {pedidos.map(p => {
            const st = statusDisplay(p)
            return (
              <div key={p.id}
                className={`card border transition-all ${p.emergencia && !p.cancelado ? 'border-orange-300 bg-orange-50' : 'border-slate-200'}`}>
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      <span className="text-xs font-bold text-slate-600">Pedido #{p.id}</span>
                      {p.emergencia && !p.cancelado && (
                        <span className="badge bg-orange-100 text-orange-700 flex items-center gap-1">
                          <AlertTriangle size={10} /> Emergência
                        </span>
                      )}
                      <span className={`badge ${STATUS_BADGE[st] ?? 'bg-slate-100 text-slate-600'}`}>{st}</span>
                      <span className="text-xs text-slate-400 ml-auto">{fmtData(p.data_solicitacao)}</span>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      <div>
                        <p className="text-xs text-slate-400">Empresa</p>
                        <p className="text-sm font-medium truncate">{p.empresa}</p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-400">Categoria</p>
                        <p className="text-sm truncate">{p.categoria}</p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-400">Cliente</p>
                        <p className="text-sm truncate">{p.cliente}</p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-400">Valor</p>
                        <p className="text-base font-bold text-slate-900">{fmtMoeda(p.valor_pedido)}</p>
                      </div>
                    </div>
                  </div>

                  <button onClick={() => router.push(`/recebimentos/acompanhar/${p.id}`)}
                    className="inline-flex items-center gap-1 px-3 py-1.5 bg-slate-100 text-slate-700 rounded text-xs font-medium hover:bg-slate-200 shrink-0">
                    Detalhes <ChevronRight size={12} />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {!activeSearchId && totalPages > 1 && (
        <div className="flex items-center justify-center gap-3">
          <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}
            className="btn-secondary gap-1.5 disabled:opacity-40">
            <ChevronLeft size={14} /> Anterior
          </button>
          <span className="text-sm text-slate-600">Pág. {page + 1} de {totalPages}</span>
          <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}
            className="btn-secondary gap-1.5 disabled:opacity-40">
            Próxima <ChevronRight size={14} />
          </button>
        </div>
      )}
    </div>
  )
}
