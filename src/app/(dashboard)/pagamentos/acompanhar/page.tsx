'use client'

import { useState, useEffect, useCallback } from 'react'
import { supabaseBrowser as supabase } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Search, Download, RefreshCw, ChevronRight, ChevronLeft, AlertTriangle } from 'lucide-react'

interface Pedido {
  id: number; empresa: string; categoria: string; fornecedor: string
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

export default function AcompanharPage() {
  const router = useRouter()
  const [pedidos, setPedidos] = useState<Pedido[]>([])
  const [loading, setLoading] = useState(true)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)

  // Dropdown options (fetched once)
  const [empresas, setEmpresas] = useState<string[]>([])
  const [categorias, setCategorias] = useState<string[]>([])
  const [fornecedores, setFornecedores] = useState<string[]>([])

  // ID search — applies on Enter, bypasses pagination
  const [searchId, setSearchId] = useState('')
  const [activeSearchId, setActiveSearchId] = useState('')

  // Dropdown filters + status select
  const [filtroEmpresa, setFiltroEmpresa] = useState('')
  const [filtroCategoria, setFiltroCategoria] = useState('')
  const [filtroFornecedor, setFiltroFornecedor] = useState('')
  const [filtroStatus, setFiltroStatus] = useState('')

  // Fetch distinct option values once on mount
  useEffect(() => {
    const fetchOpcoes = async () => {
      const [{ data: emp }, { data: cat }, { data: forn }] = await Promise.all([
        supabase.from('pedidos_solicitados').select('empresa').order('empresa').limit(1000),
        supabase.from('pedidos_solicitados').select('categoria').order('categoria').limit(1000),
        supabase.from('pedidos_solicitados').select('fornecedor').order('fornecedor').limit(1000),
      ])
      setEmpresas([...new Set(emp?.map(r => r.empresa).filter(Boolean) ?? [])].sort())
      setCategorias([...new Set(cat?.map(r => r.categoria).filter(Boolean) ?? [])].sort())
      setFornecedores([...new Set(forn?.map(r => r.fornecedor).filter(Boolean) ?? [])].sort())
    }
    fetchOpcoes()
  }, [])

  // Reset to page 0 whenever any filter changes
  useEffect(() => {
    setPage(0)
  }, [filtroEmpresa, filtroCategoria, filtroFornecedor, filtroStatus, activeSearchId])

  const load = useCallback(async () => {
    setLoading(true)

    // ID search: exact match, no pagination
    if (activeSearchId) {
      const idNum = parseInt(activeSearchId)
      if (isNaN(idNum)) {
        setPedidos([])
        setTotal(0)
        setLoading(false)
        return
      }
      const { data } = await supabase
        .from('pedidos_solicitados')
        .select('id, empresa, categoria, fornecedor, valor_pedido, status, emergencia, data_solicitacao, cancelado')
        .eq('id', idNum)
      setPedidos(data ?? [])
      setTotal(data?.length ?? 0)
      setLoading(false)
      return
    }

    let query = supabase
      .from('pedidos_solicitados')
      .select(
        'id, empresa, categoria, fornecedor, valor_pedido, status, emergencia, data_solicitacao, cancelado',
        { count: 'exact' }
      )
      .order('id', { ascending: false })
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)

    if (filtroEmpresa)    query = query.eq('empresa',   filtroEmpresa)
    if (filtroCategoria)  query = query.eq('categoria', filtroCategoria)
    if (filtroFornecedor) query = query.eq('fornecedor', filtroFornecedor)

    if (filtroStatus === 'Cancelado') {
      query = query.eq('cancelado', true)
    } else if (filtroStatus) {
      query = query.eq('status', filtroStatus).eq('cancelado', false)
    }

    const { data, count } = await query
    setPedidos(data ?? [])
    setTotal(count ?? 0)
    setLoading(false)
  }, [page, activeSearchId, filtroEmpresa, filtroCategoria, filtroFornecedor, filtroStatus])

  useEffect(() => { load() }, [load])

  const totalPages = Math.ceil(total / PAGE_SIZE)

  const handleSearchIdKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      setActiveSearchId(searchId.trim())
    }
  }

  const clearIdSearch = () => {
    setSearchId('')
    setActiveSearchId('')
  }

  const exportCSV = () => {
    const header = 'ID,Empresa,Categoria,Fornecedor,Valor,Status,Data Solicitação,Cancelado'
    const rows = pedidos.map(p =>
      `${p.id},"${p.empresa}","${p.categoria}","${p.fornecedor}",${p.valor_pedido},"${p.status}","${fmtData(p.data_solicitacao)}","${p.cancelado ? 'Sim' : 'Não'}"`
    )
    const csv = [header, ...rows].join('\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = 'pedidos.csv'; a.click()
    URL.revokeObjectURL(url)
  }

  const filtersActive = !!(activeSearchId || filtroEmpresa || filtroCategoria || filtroFornecedor || filtroStatus)

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="page-title">Acompanhar Pedidos</h1>
          <p className="page-subtitle">Todos os pedidos solicitados</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={exportCSV} className="btn-secondary gap-1.5 text-sm">
            <Download size={15} /> Exportar CSV
          </button>
          <button onClick={load} className="btn-secondary p-2" title="Atualizar">
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Filtros */}
      <div className="card">
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-3">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              className="input pl-9"
              type="number"
              min="0"
              placeholder="ID — pressione Enter"
              value={searchId}
              onChange={e => setSearchId(e.target.value)}
              onKeyDown={handleSearchIdKeyDown}
            />
          </div>
          <select
            className="input"
            value={filtroEmpresa}
            onChange={e => setFiltroEmpresa(e.target.value)}
            disabled={!!activeSearchId}
          >
            <option value="">Todas as empresas</option>
            {empresas.map(e => <option key={e} value={e}>{e}</option>)}
          </select>
          <select
            className="input"
            value={filtroCategoria}
            onChange={e => setFiltroCategoria(e.target.value)}
            disabled={!!activeSearchId}
          >
            <option value="">Todas as categorias</option>
            {categorias.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <select
            className="input"
            value={filtroFornecedor}
            onChange={e => setFiltroFornecedor(e.target.value)}
            disabled={!!activeSearchId}
          >
            <option value="">Todos os fornecedores</option>
            {fornecedores.map(f => <option key={f} value={f}>{f}</option>)}
          </select>
          <select
            className="input"
            value={filtroStatus}
            onChange={e => setFiltroStatus(e.target.value)}
            disabled={!!activeSearchId}
          >
            <option value="">Todos os status</option>
            {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>

        <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-100">
          <p className="text-sm text-slate-500">
            {loading
              ? 'Carregando...'
              : activeSearchId
              ? `${pedidos.length} resultado(s) para ID #${activeSearchId}`
              : `${total.toLocaleString('pt-BR')} pedido(s)${filtersActive ? ' encontrado(s)' : ' no total'} — página ${page + 1} de ${Math.max(1, totalPages)}`
            }
          </p>
          {activeSearchId && (
            <button onClick={clearIdSearch} className="text-xs text-blue-600 hover:underline">
              Limpar busca por ID
            </button>
          )}
        </div>
      </div>

      {/* Loading */}
      {loading && <div className="card text-center py-12 text-slate-400">Carregando...</div>}

      {/* Empty */}
      {!loading && pedidos.length === 0 && (
        <div className="card text-center py-12">
          <Search size={36} className="mx-auto text-slate-300 mb-3" />
          <p className="text-slate-500">Nenhum pedido encontrado</p>
        </div>
      )}

      {/* Table */}
      {!loading && pedidos.length > 0 && (
        <div className="card p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="table-header">
                  <th className="table-cell font-medium">ID</th>
                  <th className="table-cell font-medium">Empresa</th>
                  <th className="table-cell font-medium">Categoria</th>
                  <th className="table-cell font-medium">Fornecedor</th>
                  <th className="table-cell font-medium text-right">Valor</th>
                  <th className="table-cell font-medium">Status</th>
                  <th className="table-cell font-medium">Solicitação</th>
                  <th className="table-cell font-medium w-10"></th>
                </tr>
              </thead>
              <tbody>
                {pedidos.map(p => (
                  <tr
                    key={p.id}
                    className={`table-row cursor-pointer hover:bg-slate-50 ${p.cancelado ? 'opacity-60' : ''}`}
                    onClick={() => router.push(`/pagamentos/acompanhar/${p.id}`)}
                  >
                    <td className="table-cell font-mono text-xs text-slate-500">
                      <div className="flex items-center gap-1">
                        #{p.id}
                        {p.emergencia && <AlertTriangle size={11} className="text-orange-500 shrink-0" />}
                      </div>
                    </td>
                    <td className="table-cell font-medium max-w-[140px] truncate">{p.empresa}</td>
                    <td className="table-cell text-slate-600 max-w-[120px] truncate">{p.categoria}</td>
                    <td className="table-cell text-slate-600 max-w-[140px] truncate">{p.fornecedor}</td>
                    <td className="table-cell text-right font-medium">{fmtMoeda(p.valor_pedido)}</td>
                    <td className="table-cell">
                      <span className={`badge ${STATUS_BADGE[p.cancelado ? 'Cancelado' : p.status] ?? 'bg-slate-100 text-slate-600'}`}>
                        {p.cancelado ? 'Cancelado' : p.status}
                      </span>
                    </td>
                    <td className="table-cell text-slate-500">{fmtData(p.data_solicitacao)}</td>
                    <td className="table-cell">
                      <ChevronRight size={14} className="text-slate-400" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Paginação */}
          {!activeSearchId && totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 bg-slate-50">
              <button
                onClick={() => setPage(p => Math.max(0, p - 1))}
                disabled={page === 0}
                className="btn-secondary text-sm gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <ChevronLeft size={14} /> Anterior
              </button>
              <span className="text-sm text-slate-600">
                Página <span className="font-semibold">{page + 1}</span> de{' '}
                <span className="font-semibold">{totalPages}</span>
              </span>
              <button
                onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
                className="btn-secondary text-sm gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Próximo <ChevronRight size={14} />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
