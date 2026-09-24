'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { supabaseBrowser as supabase } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import {
  Search, Download, RefreshCw, ChevronRight, ChevronLeft, AlertTriangle,
  List, LayoutGrid, Info, X,
} from 'lucide-react'
import SearchableSelect from '@/components/ui/SearchableSelect'

interface Pedido {
  id: number; empresa: string; categoria: string; fornecedor: string
  valor_pedido: number; status: string; emergencia: boolean
  data_solicitacao: string; cancelado: boolean
}

interface ControleInfo {
  valor_pagar: number | null; valor_pagamento: number | null
}

const PAGE_SIZE = 100
const KANBAN_PASSO = 300
const STORAGE_KEY = 'acompanhar-pagamentos-v1'

type Ordem = 'recentes' | 'antigos' | 'valor_desc' | 'valor_asc' | 'empresa' | 'parte'

// "Empresa" é o centro de custo do pedido.
const ORDEM_SQL: Record<Ordem, { col: string; asc: boolean; label: string }> = {
  recentes:   { col: 'data_solicitacao', asc: false, label: 'Data: mais recente → mais antigo' },
  antigos:    { col: 'data_solicitacao', asc: true,  label: 'Data: mais antigo → mais recente' },
  valor_desc: { col: 'valor_pedido',     asc: false, label: 'Valor: maior → menor' },
  valor_asc:  { col: 'valor_pedido',     asc: true,  label: 'Valor: menor → maior' },
  empresa:    { col: 'empresa',          asc: true,  label: 'Centro de custo (A–Z)' },
  parte:      { col: 'fornecedor',        asc: true,  label: 'Fornecedor (A–Z)' },
}

const chaveFiltros = (...v: (string | undefined)[]) => JSON.stringify(v.map(x => x ?? ''))

const STATUS_OPTIONS = [
  'Aguardando Autorização',
  'Aguardando Ajuste',
  'Autorizado',
  'Não Autorizado',
  'Cancelado',
]

const STATUS_BADGE: Record<string, string> = {
  'Autorizado': 'bg-green-100 text-green-700',
  'Não Autorizado': 'bg-red-100 text-red-700',
  'Aguardando Autorização': 'bg-yellow-100 text-yellow-700',
  'Aguardando Ajuste': 'bg-orange-100 text-orange-700',
  'Cancelado': 'bg-slate-200 text-slate-600',
}

const fmtMoeda = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const fmtData = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString('pt-BR')

type EstagioPedido = 'aguardando_autorizacao' | 'aguardando_ajuste' | 'nao_autorizado'
  | 'aguardando_pagamento' | 'pago' | 'cancelado'

const COLUNAS_PEDIDO: { key: EstagioPedido; titulo: string }[] = [
  { key: 'aguardando_autorizacao', titulo: 'Aguardando Autorização' },
  { key: 'aguardando_ajuste', titulo: 'Aguardando Ajuste' },
  { key: 'nao_autorizado', titulo: 'Não Autorizado' },
  { key: 'aguardando_pagamento', titulo: 'Autorizado — Aguardando Pagamento' },
  { key: 'pago', titulo: 'Pago' },
  { key: 'cancelado', titulo: 'Cancelado' },
]

// Enquanto o pedido não é autorizado, ele pode transitar livremente entre essas 3 colunas.
const COLUNAS_LIVRES: EstagioPedido[] = ['aguardando_autorizacao', 'aguardando_ajuste', 'nao_autorizado']

function getEstagioPedido(p: Pedido, controles: ControleInfo[]): EstagioPedido {
  if (p.cancelado) return 'cancelado'
  if (p.status === 'Aguardando Autorização') return 'aguardando_autorizacao'
  if (p.status === 'Aguardando Ajuste') return 'aguardando_ajuste'
  if (p.status === 'Não Autorizado') return 'nao_autorizado'
  const pago = controles.length > 0 && controles.every(c =>
    c.valor_pagamento != null && c.valor_pagar != null && c.valor_pagamento >= c.valor_pagar
  )
  return pago ? 'pago' : 'aguardando_pagamento'
}

export default function AcompanharPage() {
  const router = useRouter()
  const [view, setView] = useState<'lista' | 'kanban'>('lista')
  const [pedidos, setPedidos] = useState<Pedido[]>([])
  const [loading, setLoading] = useState(true)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)

  const [isAdminOrOwner, setIsAdminOrOwner] = useState(false)
  const [username, setUsername] = useState('')

  // Kanban
  const [kanbanPedidos, setKanbanPedidos] = useState<Pedido[]>([])
  const [controlesPorPedido, setControlesPorPedido] = useState<Record<number, ControleInfo[]>>({})
  const [kanbanLoading, setKanbanLoading] = useState(true)
  const [draggingId, setDraggingId] = useState<number | null>(null)
  const [ajusteModal, setAjusteModal] = useState<{ id: number; comentario: string; processing: boolean; error: string } | null>(null)

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
  const [ordem, setOrdem] = useState<Ordem>('recentes')
  const [kanbanLimit, setKanbanLimit] = useState(KANBAN_PASSO)
  const [kanbanTotal, setKanbanTotal] = useState(0)
  const [restaurado, setRestaurado] = useState(false)

  // Fetch distinct option values + current user once on mount
  useEffect(() => {
    const fetchOpcoes = async () => {
      const [{ data: emp }, { data: cat }, { data: forn }, u] = await Promise.all([
        supabase.rpc('pedidos_solicitados_valores_distintos', { coluna: 'empresa' }),
        supabase.rpc('pedidos_solicitados_valores_distintos', { coluna: 'categoria' }),
        supabase.rpc('pedidos_solicitados_valores_distintos', { coluna: 'fornecedor' }),
        fetch('/api/auth/me').then(r => r.json()),
      ])
      setEmpresas(emp?.map((r: { valor: string }) => r.valor) ?? [])
      setCategorias(cat?.map((r: { valor: string }) => r.valor) ?? [])
      setFornecedores(forn?.map((r: { valor: string }) => r.valor) ?? [])
      setIsAdminOrOwner(u?.hierarquia === 'admin' || u?.hierarquia === 'owner')
      setUsername(u?.username ?? '')
    }
    fetchOpcoes()
  }, [])

  const filtrosKey = chaveFiltros(filtroEmpresa, filtroCategoria, filtroFornecedor, filtroStatus, activeSearchId, ordem)
  const filtrosAnterior = useRef(filtrosKey)

  // Volta para a página 0 (e para o primeiro lote do kanban) quando algum filtro/ordem muda
  useEffect(() => {
    if (filtrosAnterior.current === filtrosKey) return
    filtrosAnterior.current = filtrosKey
    setPage(0)
    setKanbanLimit(KANBAN_PASSO)
  }, [filtrosKey])

  // Restaura visão, filtros e ordenação ao voltar do detalhe do pedido
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY)
      if (raw) {
        const s = JSON.parse(raw)
        const ordemOk: Ordem = s.ordem in ORDEM_SQL ? s.ordem : 'recentes'
        filtrosAnterior.current = chaveFiltros(s.filtroEmpresa, s.filtroCategoria, s.filtroFornecedor, s.filtroStatus, s.activeSearchId, ordemOk)
        setView(s.view === 'kanban' ? 'kanban' : 'lista')
        setPage(Number(s.page) || 0)
        setSearchId(s.searchId ?? '')
        setActiveSearchId(s.activeSearchId ?? '')
        setFiltroEmpresa(s.filtroEmpresa ?? '')
        setFiltroCategoria(s.filtroCategoria ?? '')
        setFiltroFornecedor(s.filtroFornecedor ?? '')
        setFiltroStatus(s.filtroStatus ?? '')
        setOrdem(ordemOk)
        setKanbanLimit(Number(s.kanbanLimit) || KANBAN_PASSO)
      }
    } catch {}
    setRestaurado(true)
  }, [])

  useEffect(() => {
    if (!restaurado) return
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({
        view, page, searchId, activeSearchId, filtroEmpresa, filtroCategoria, filtroFornecedor, filtroStatus, ordem, kanbanLimit,
      }))
    } catch {}
  }, [restaurado, view, page, searchId, activeSearchId, filtroEmpresa, filtroCategoria, filtroFornecedor, filtroStatus, ordem, kanbanLimit])

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
      .order(ORDEM_SQL[ordem].col, { ascending: ORDEM_SQL[ordem].asc, nullsFirst: false })
      .order('id', { ascending: ordem === 'antigos' })
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
  }, [page, activeSearchId, filtroEmpresa, filtroCategoria, filtroFornecedor, filtroStatus, ordem])

  useEffect(() => { if (restaurado && view === 'lista') load() }, [restaurado, view, load])

  const loadKanban = useCallback(async () => {
    setKanbanLoading(true)
    const o = ORDEM_SQL[ordem]
    const todos: Pedido[] = []
    let count = 0
    // O Supabase devolve no máximo 1000 linhas por consulta, então busca em blocos.
    for (let from = 0; from < kanbanLimit; from += 1000) {
      const to = Math.min(from + 999, kanbanLimit - 1)
      let query = supabase
        .from('pedidos_solicitados')
        .select('id, empresa, categoria, fornecedor, valor_pedido, status, emergencia, data_solicitacao, cancelado', { count: 'exact' })
        .order(o.col, { ascending: o.asc, nullsFirst: false })
        .order('id', { ascending: ordem === 'antigos' })
        .range(from, to)

      if (filtroEmpresa)   query = query.eq('empresa', filtroEmpresa)
      if (filtroCategoria) query = query.eq('categoria', filtroCategoria)
      if (filtroFornecedor) query = query.eq('fornecedor', filtroFornecedor)

      const { data, count: total } = await query
      todos.push(...(data ?? []))
      count = total ?? count
      if ((data?.length ?? 0) < to - from + 1) break
    }
    setKanbanPedidos(todos)
    setKanbanTotal(count)

    // .in() vai na URL, então busca os controles em blocos de pedidos
    const ids = todos.map(p => p.id)
    const blocos: number[][] = []
    for (let i = 0; i < ids.length; i += 100) blocos.push(ids.slice(i, i + 100))
    const respostas = await Promise.all(blocos.map(b =>
      supabase.from('controle_pagamentos').select('pedido_id, valor_pagar, valor_pagamento').in('pedido_id', b)))
    const map: Record<number, ControleInfo[]> = {}
    for (const { data: controles } of respostas) {
      for (const c of (controles ?? [])) {
        if (!map[c.pedido_id]) map[c.pedido_id] = []
        map[c.pedido_id].push({ valor_pagar: c.valor_pagar, valor_pagamento: c.valor_pagamento })
      }
    }
    setControlesPorPedido(map)
    setKanbanLoading(false)
  }, [filtroEmpresa, filtroCategoria, filtroFornecedor, ordem, kanbanLimit])

  useEffect(() => { if (restaurado && view === 'kanban') loadKanban() }, [restaurado, view, loadKanban])

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

  const handleMudarStatusPedido = async (id: number, novoStatus: 'Aguardando Autorização' | 'Autorizado' | 'Não Autorizado') => {
    const hoje = new Date().toISOString().split('T')[0]
    await supabase.from('pedidos_solicitados').update({
      status: novoStatus,
      data_autorizacao: novoStatus === 'Aguardando Autorização' ? null : hoje,
      usuario_autorizador: novoStatus === 'Aguardando Autorização' ? null : username,
    }).eq('id', id)
    await supabase.from('pedidos_solicitados_fluxo').update({ status: novoStatus }).eq('pedido_id', id)

    if (novoStatus === 'Autorizado') {
      const { data: existente } = await supabase.from('controle_pagamentos').select('id').eq('pedido_id', id).maybeSingle()
      if (!existente) {
        const pedido = kanbanPedidos.find(p => p.id === id)
        await supabase.from('controle_pagamentos').insert({ pedido_id: id, valor_pagar: pedido?.valor_pedido, status_pagamento: 1 })
      }
    }
    loadKanban()
  }

  const handleAjusteConfirm = async () => {
    if (!ajusteModal || !ajusteModal.comentario.trim()) {
      setAjusteModal(m => m ? { ...m, error: 'O comentário é obrigatório.' } : m)
      return
    }
    setAjusteModal(m => m ? { ...m, processing: true, error: '' } : m)
    await supabase.from('pedidos_solicitados').update({ status: 'Aguardando Ajuste' }).eq('id', ajusteModal.id)
    await supabase.from('pedidos_solicitados_fluxo').update({ status: 'Aguardando Ajuste' }).eq('pedido_id', ajusteModal.id)
    await supabase.from('comentarios').insert({
      pedido_id: ajusteModal.id, comentario: ajusteModal.comentario.trim(),
      usuario: username, data_comentario: new Date().toISOString(), tipo_documento: null,
    })
    setAjusteModal(null)
    loadKanban()
  }

  const comEstagio = kanbanPedidos.map(p => ({
    pedido: p,
    estagio: getEstagioPedido(p, controlesPorPedido[p.id] ?? []),
  }))

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="page-title">Acompanhar Pedidos</h1>
          <p className="page-subtitle">Todos os pedidos solicitados</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-slate-200 overflow-hidden">
            <button
              onClick={() => setView('lista')}
              className={`px-3 py-1.5 text-sm flex items-center gap-1.5 ${view === 'lista' ? 'bg-slate-800 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}
            >
              <List size={14} /> Lista
            </button>
            <button
              onClick={() => setView('kanban')}
              className={`px-3 py-1.5 text-sm flex items-center gap-1.5 ${view === 'kanban' ? 'bg-slate-800 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}
            >
              <LayoutGrid size={14} /> Kanban
            </button>
          </div>
          {view === 'lista' && (
            <button onClick={exportCSV} className="btn-secondary gap-1.5 text-sm">
              <Download size={15} /> Exportar CSV
            </button>
          )}
          <button onClick={view === 'lista' ? load : loadKanban} className="btn-secondary p-2" title="Atualizar">
            <RefreshCw size={16} className={(view === 'lista' ? loading : kanbanLoading) ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Filtros */}
      <div className="card">
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-3">
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
              disabled={view === 'kanban'}
            />
          </div>
          <SearchableSelect
            value={filtroEmpresa}
            onChange={setFiltroEmpresa}
            options={empresas}
            placeholder="Todas as empresas"
            disabled={!!activeSearchId}
          />
          <select
            className="input"
            value={filtroCategoria}
            onChange={e => setFiltroCategoria(e.target.value)}
            disabled={!!activeSearchId}
          >
            <option value="">Todas as categorias</option>
            {categorias.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <SearchableSelect
            value={filtroFornecedor}
            onChange={setFiltroFornecedor}
            options={fornecedores}
            placeholder="Todos os fornecedores"
            disabled={!!activeSearchId}
          />
          {view === 'lista' && (
            <select
              className="input"
              value={filtroStatus}
              onChange={e => setFiltroStatus(e.target.value)}
              disabled={!!activeSearchId}
            >
              <option value="">Todos os status</option>
              {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          )}
          <select
            className="input"
            value={ordem}
            onChange={e => setOrdem(e.target.value as Ordem)}
            disabled={!!activeSearchId}
            title="Ordenar por"
          >
            {(Object.keys(ORDEM_SQL) as Ordem[]).map(k => <option key={k} value={k}>{ORDEM_SQL[k].label}</option>)}
          </select>
        </div>

        {view === 'lista' && (
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
        )}
      </div>

      {view === 'lista' ? (
        <>
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
        </>
      ) : (
        <>
          <div className="flex items-start gap-2 p-3 bg-blue-50 border border-blue-200 rounded-md text-sm text-blue-700">
            <Info size={15} className="mt-0.5 shrink-0" />
            <p>
              Enquanto não é autorizado, o card pode ser movido livremente entre <strong>Aguardando Autorização</strong>,{' '}
              <strong>Aguardando Ajuste</strong> e <strong>Não Autorizado</strong>, ou arrastado para{' '}
              <strong>Autorizado — Aguardando Pagamento</strong> para autorizar (isso já cria a conta a pagar). A partir
              daí o card trava — pagamento é controlado em Controle de Pagamentos, e cancelamento continua sendo feito
              pelo detalhe do pedido.
            </p>
          </div>

          {kanbanLoading && kanbanPedidos.length === 0 ? (
            <div className="card text-center py-12 text-slate-400">Carregando...</div>
          ) : kanbanPedidos.length === 0 ? (
            <div className="card text-center py-12">
              <Search size={36} className="mx-auto text-slate-300 mb-3" />
              <p className="text-slate-500">Nenhum pedido encontrado</p>
            </div>
          ) : (
            <div className={`flex gap-3 overflow-x-auto pb-2 ${kanbanLoading ? 'opacity-60' : ''}`}>
              {COLUNAS_PEDIDO.map(col => {
                const cards = comEstagio.filter(c => c.estagio === col.key)
                const podeReceberDrop = isAdminOrOwner && (COLUNAS_LIVRES.includes(col.key) || col.key === 'aguardando_pagamento')
                return (
                  <div
                    key={col.key}
                    className="flex-shrink-0 w-64 bg-slate-50 rounded-lg border border-slate-200 flex flex-col max-h-[70vh]"
                    onDragOver={podeReceberDrop ? e => e.preventDefault() : undefined}
                    onDrop={podeReceberDrop ? e => {
                      e.preventDefault()
                      if (draggingId == null) return
                      if (col.key === 'aguardando_ajuste') {
                        setAjusteModal({ id: draggingId, comentario: '', processing: false, error: '' })
                      } else if (col.key === 'aguardando_pagamento') {
                        handleMudarStatusPedido(draggingId, 'Autorizado')
                      } else if (col.key === 'nao_autorizado') {
                        handleMudarStatusPedido(draggingId, 'Não Autorizado')
                      } else if (col.key === 'aguardando_autorizacao') {
                        handleMudarStatusPedido(draggingId, 'Aguardando Autorização')
                      }
                      setDraggingId(null)
                    } : undefined}
                  >
                    <div className="px-3 py-2.5 border-b border-slate-200 shrink-0">
                      <p className="text-xs font-semibold text-slate-600">{col.titulo}</p>
                      <p className="text-xs text-slate-400">{cards.length} pedido(s)</p>
                    </div>
                    <div className="p-2 space-y-2 min-h-[80px] overflow-y-auto">
                      {cards.map(({ pedido: p }) => {
                        const arrastavel = isAdminOrOwner && COLUNAS_LIVRES.includes(col.key)
                        return (
                          <div
                            key={p.id}
                            draggable={arrastavel}
                            onDragStart={arrastavel ? () => setDraggingId(p.id) : undefined}
                            onDragEnd={() => setDraggingId(null)}
                            onClick={() => router.push(`/pagamentos/acompanhar/${p.id}`)}
                            className={`bg-white rounded-md border border-slate-200 p-2.5 text-sm shadow-sm hover:shadow cursor-pointer ${arrastavel ? 'cursor-grab active:cursor-grabbing' : ''} ${draggingId === p.id ? 'opacity-40' : ''}`}
                          >
                            <div className="flex items-center gap-1">
                              <p className="font-mono text-xs text-slate-400">#{p.id}</p>
                              {p.emergencia && <AlertTriangle size={11} className="text-orange-500 shrink-0" />}
                            </div>
                            <p className="font-medium text-slate-800 truncate">{p.empresa}</p>
                            <p className="text-xs text-slate-500 truncate">{p.categoria} · {p.fornecedor}</p>
                            <p className="text-xs font-semibold text-slate-700 mt-1">{fmtMoeda(p.valor_pedido)}</p>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
          {kanbanPedidos.length > 0 && (
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm text-slate-500">
                Mostrando {kanbanPedidos.length.toLocaleString('pt-BR')} de {kanbanTotal.toLocaleString('pt-BR')} pedido(s)
              </p>
              {kanbanPedidos.length < kanbanTotal && (
                <button
                  onClick={() => setKanbanLimit(l => l + KANBAN_PASSO)}
                  disabled={kanbanLoading}
                  className="btn-secondary text-sm disabled:opacity-40"
                >
                  {kanbanLoading ? 'Carregando...' : `Carregar mais ${KANBAN_PASSO}`}
                </button>
              )}
            </div>
          )}
        </>
      )}

      {/* Modal Solicitar Ajuste (drag para a coluna Aguardando Ajuste) */}
      {ajusteModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-slate-900">Solicitar Ajuste — Pedido #{ajusteModal.id}</h2>
              <button onClick={() => setAjusteModal(null)} className="text-slate-400 hover:text-slate-600">
                <X size={18} />
              </button>
            </div>
            <p className="text-sm text-slate-500">Descreva o que precisa ser ajustado. O solicitante receberá este comentário.</p>
            <textarea
              className="input w-full min-h-[100px] resize-none"
              placeholder="Comentário obrigatório..."
              value={ajusteModal.comentario}
              onChange={e => setAjusteModal(m => m ? { ...m, comentario: e.target.value, error: '' } : m)}
            />
            {ajusteModal.error && <p className="text-xs text-red-600">{ajusteModal.error}</p>}
            <div className="flex justify-end gap-2">
              <button onClick={() => setAjusteModal(null)} className="btn-secondary text-sm">Cancelar</button>
              <button
                onClick={handleAjusteConfirm}
                disabled={ajusteModal.processing}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-orange-500 text-white rounded-lg text-sm font-medium hover:bg-orange-600 disabled:opacity-50"
              >
                {ajusteModal.processing ? 'Enviando...' : 'Solicitar Ajuste'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
