'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { supabaseBrowser as supabase } from '@/lib/supabase/client'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer,
} from 'recharts'
import { CheckCircle, Clock, XCircle, ListOrdered, RefreshCw } from 'lucide-react'

const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
const ANO_ATUAL = new Date().getFullYear()
const ANOS_DISPONIVEIS = Array.from({ length: 6 }, (_, i) => ANO_ATUAL - 1 + i)

interface Pedido {
  id: number; empresa: string; categoria: string; fornecedor: string
  valor_pedido: number; status: string
}
interface Fluxo {
  empresa: string; categoria: string; mes: number; ano: number
  valor_referente: number; status: string
}
interface OrcRow {
  empresa: string; categoria: string; mes: number; ano: number
  valor_orcamento: number; saldo: number
}
interface CatRow { id: string; empresa: string; categoria: string }

const fmtMoeda = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

function TooltipMoeda({ active, payload, label }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white border border-slate-200 rounded-lg shadow-lg p-3 text-sm">
      <p className="font-medium text-slate-700 mb-2">{label}</p>
      {payload.map((p) => (
        <div key={p.name} className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full inline-block" style={{ background: p.color }} />
          <span className="text-slate-500">{p.name}:</span>
          <span className="font-medium">{fmtMoeda(p.value)}</span>
        </div>
      ))}
    </div>
  )
}

export default function PagamentosPage() {
  const [pedidos, setPedidos] = useState<Pedido[]>([])
  const [fluxo, setFluxo] = useState<Fluxo[]>([])
  const [controleOrc, setControleOrc] = useState<OrcRow[]>([])
  const [categorias, setCategorias] = useState<CatRow[]>([])
  const [loading, setLoading] = useState(true)

  const [filtroEmpresa, setFiltroEmpresa] = useState('')
  const [filtroCategoria, setFiltroCategoria] = useState('')
  const [filtroStatus, setFiltroStatus] = useState('')
  const [anos, setAnos] = useState<number[]>([ANO_ATUAL])

  const load = useCallback(async () => {
    setLoading(true)
    const [{ data: peds }, { data: flx }, { data: orc }, { data: cats }] = await Promise.all([
      supabase
        .from('pedidos_solicitados')
        .select('id, empresa, categoria, fornecedor, valor_pedido, status')
        .eq('cancelado', false),
      supabase.from('pedidos_solicitados_fluxo').select('empresa, categoria, mes, ano, valor_referente, status'),
      supabase.from('controle_orcamento').select('empresa, categoria, mes, ano, valor_orcamento, saldo'),
      supabase.from('categorias').select('*').order('empresa').order('categoria'),
    ])
    setPedidos(peds ?? [])
    setFluxo(flx ?? [])
    setControleOrc(orc ?? [])
    setCategorias(cats ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  // Derived: filter options
  const empresas = useMemo(
    () => [...new Set(categorias.map(c => c.empresa))].sort(),
    [categorias],
  )
  const categoriasFiltradas = useMemo(() => {
    const base = filtroEmpresa
      ? categorias.filter(c => c.empresa === filtroEmpresa)
      : categorias
    return [...new Set(base.map(c => c.categoria))].sort()
  }, [categorias, filtroEmpresa])

  // Metrics: filtered only by empresa + categoria (not status — same as Streamlit)
  const metricasPedidos = useMemo(() =>
    pedidos.filter(p =>
      (!filtroEmpresa || p.empresa === filtroEmpresa) &&
      (!filtroCategoria || p.categoria === filtroCategoria)
    ), [pedidos, filtroEmpresa, filtroCategoria])

  const metricas = useMemo(() => ({
    total: metricasPedidos.length,
    autorizados: metricasPedidos.filter(p => p.status === 'Autorizado').length,
    aguardando: metricasPedidos.filter(p => p.status === 'Aguardando Autorização').length,
    naoAutorizados: metricasPedidos.filter(p => p.status === 'Não Autorizado').length,
  }), [metricasPedidos])

  // Table: filtered by all 3 (empresa + categoria + status)
  const pedidosTabela = useMemo(() =>
    pedidos.filter(p =>
      (!filtroEmpresa || p.empresa === filtroEmpresa) &&
      (!filtroCategoria || p.categoria === filtroCategoria) &&
      (!filtroStatus || p.status === filtroStatus)
    ), [pedidos, filtroEmpresa, filtroCategoria, filtroStatus])

  // Chart 1: Autorizado + Aguardando + Saldo por período
  const chartValores = useMemo(() => {
    const periodos: string[] = []
    for (const ano of [...anos].sort()) {
      for (let m = 1; m <= 12; m++) periodos.push(`${MESES[m - 1]}/${ano}`)
    }

    const fluxoFiltrado = fluxo.filter(f =>
      (!filtroEmpresa || f.empresa === filtroEmpresa) &&
      (!filtroCategoria || f.categoria === filtroCategoria) &&
      anos.includes(f.ano)
    )
    const orcFiltrado = controleOrc.filter(o =>
      (!filtroEmpresa || o.empresa === filtroEmpresa) &&
      (!filtroCategoria || o.categoria === filtroCategoria) &&
      anos.includes(o.ano)
    )

    return periodos.map(periodo => {
      const mesIdx = MESES.indexOf(periodo.split('/')[0]) + 1
      const ano = parseInt(periodo.split('/')[1])

      const autorizado = fluxoFiltrado
        .filter(f => f.mes === mesIdx && f.ano === ano && f.status === 'Autorizado')
        .reduce((s, f) => s + f.valor_referente, 0)

      const aguardando = fluxoFiltrado
        .filter(f => f.mes === mesIdx && f.ano === ano && f.status === 'Aguardando Autorização')
        .reduce((s, f) => s + f.valor_referente, 0)

      const saldo = orcFiltrado
        .filter(o => o.mes === mesIdx && o.ano === ano)
        .reduce((s, o) => s + o.saldo, 0)

      return { periodo, Autorizado: autorizado, Aguardando: aguardando, Saldo: saldo }
    })
  }, [fluxo, controleOrc, filtroEmpresa, filtroCategoria, anos])

  // Chart 2: Orçamento por período
  const chartOrcamento = useMemo(() => {
    const periodos: string[] = []
    for (const ano of [...anos].sort()) {
      for (let m = 1; m <= 12; m++) periodos.push(`${MESES[m - 1]}/${ano}`)
    }

    const orcFiltrado = controleOrc.filter(o =>
      (!filtroEmpresa || o.empresa === filtroEmpresa) &&
      (!filtroCategoria || o.categoria === filtroCategoria) &&
      anos.includes(o.ano)
    )

    return periodos.map(periodo => {
      const mesIdx = MESES.indexOf(periodo.split('/')[0]) + 1
      const ano = parseInt(periodo.split('/')[1])
      const orcamento = orcFiltrado
        .filter(o => o.mes === mesIdx && o.ano === ano)
        .reduce((s, o) => s + o.valor_orcamento, 0)
      return { periodo, 'Orçamento': orcamento }
    })
  }, [controleOrc, filtroEmpresa, filtroCategoria, anos])

  const toggleAno = (ano: number) =>
    setAnos(prev => prev.includes(ano) ? prev.filter(a => a !== ano) : [...prev, ano])

  const STATUS_BADGE: Record<string, string> = {
    'Autorizado': 'bg-green-100 text-green-700',
    'Não Autorizado': 'bg-red-100 text-red-700',
    'Aguardando Autorização': 'bg-yellow-100 text-yellow-700',
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">Pagamentos — Visão Geral</h1>
          <p className="page-subtitle">Resumo e análise dos pedidos de pagamento</p>
        </div>
        <button onClick={load} className="btn-secondary p-2" disabled={loading} title="Atualizar">
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Filtros */}
      <div className="card">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="label">Empresa</label>
            <select className="input" value={filtroEmpresa}
              onChange={e => { setFiltroEmpresa(e.target.value); setFiltroCategoria('') }}>
              <option value="">Todas</option>
              {empresas.map(e => <option key={e} value={e}>{e}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Categoria</label>
            <select className="input" value={filtroCategoria}
              onChange={e => setFiltroCategoria(e.target.value)}>
              <option value="">Todas</option>
              {categoriasFiltradas.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Status (tabela)</label>
            <select className="input" value={filtroStatus} onChange={e => setFiltroStatus(e.target.value)}>
              <option value="">Todos</option>
              <option>Autorizado</option>
              <option>Aguardando Autorização</option>
              <option>Não Autorizado</option>
            </select>
          </div>
        </div>
      </div>

      {/* Métricas */}
      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="stat-card animate-pulse">
              <div className="h-4 bg-slate-200 rounded w-2/3 mb-3" />
              <div className="h-8 bg-slate-200 rounded w-1/2" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'Total de Solicitações', value: metricas.total, icon: ListOrdered, bg: 'bg-blue-50', color: 'text-blue-600' },
            { label: 'Autorizadas', value: metricas.autorizados, icon: CheckCircle, bg: 'bg-green-50', color: 'text-green-600' },
            { label: 'Aguardando', value: metricas.aguardando, icon: Clock, bg: 'bg-yellow-50', color: 'text-yellow-600' },
            { label: 'Não Autorizadas', value: metricas.naoAutorizados, icon: XCircle, bg: 'bg-red-50', color: 'text-red-600' },
          ].map(s => {
            const Icon = s.icon
            return (
              <div key={s.label} className="stat-card">
                <div className={`w-9 h-9 rounded-lg ${s.bg} flex items-center justify-center mb-2`}>
                  <Icon size={18} className={s.color} />
                </div>
                <p className="stat-value">{s.value}</p>
                <p className="stat-label">{s.label}</p>
              </div>
            )
          })}
        </div>
      )}

      {/* Seletor de anos */}
      <div className="card">
        <label className="label mb-2">Anos exibidos nos gráficos</label>
        <div className="flex flex-wrap gap-2">
          {ANOS_DISPONIVEIS.map(ano => (
            <button key={ano} onClick={() => toggleAno(ano)}
              className={`px-3 py-1 rounded-full text-sm font-medium border transition-colors ${anos.includes(ano)
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-white text-slate-600 border-slate-300 hover:border-blue-400'}`}>
              {ano}
            </button>
          ))}
        </div>
        {anos.length === 0 && (
          <p className="text-sm text-amber-600 mt-2">Selecione pelo menos um ano para exibir os gráficos.</p>
        )}
      </div>

      {/* Gráfico 1 — Valores por Período */}
      {anos.length > 0 && (
        <div className="card">
          <h2 className="text-sm font-semibold text-slate-700 mb-4">Valores por Período</h2>
          <ResponsiveContainer width="100%" height={380}>
            <BarChart data={chartValores} margin={{ bottom: 60 }} barGap={2}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="periodo" tick={{ fontSize: 11, fill: '#64748b' }} angle={-45} textAnchor="end" interval={0} />
              <YAxis tickFormatter={v => `R$${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11, fill: '#64748b' }} width={70} />
              <Tooltip content={<TooltipMoeda />} />
              <Legend wrapperStyle={{ paddingTop: 24, fontSize: 13 }} />
              <Bar dataKey="Autorizado" stackId="a" fill="#22c55e" radius={[0, 0, 0, 0]} />
              <Bar dataKey="Aguardando" stackId="a" fill="#facc15" radius={[0, 0, 0, 0]} />
              <Bar dataKey="Saldo" fill="#94a3b8" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Gráfico 2 — Orçamento por Período */}
      {anos.length > 0 && (
        <div className="card">
          <h2 className="text-sm font-semibold text-slate-700 mb-4">Orçamento por Período</h2>
          <ResponsiveContainer width="100%" height={380}>
            <BarChart data={chartOrcamento} margin={{ bottom: 60 }} barGap={2}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="periodo" tick={{ fontSize: 11, fill: '#64748b' }} angle={-45} textAnchor="end" interval={0} />
              <YAxis tickFormatter={v => `R$${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11, fill: '#64748b' }} width={70} />
              <Tooltip content={<TooltipMoeda />} />
              <Legend wrapperStyle={{ paddingTop: 24, fontSize: 13 }} />
              <Bar dataKey="Orçamento" fill="#7dd3fc" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Tabela de pedidos */}
      <div className="card p-0 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100">
          <h2 className="text-sm font-semibold text-slate-700">
            Pedidos Solicitados
            <span className="ml-2 text-slate-400 font-normal">({pedidosTabela.length})</span>
          </h2>
        </div>
        {loading ? (
          <div className="text-center py-12 text-slate-400">Carregando...</div>
        ) : pedidosTabela.length === 0 ? (
          <div className="text-center py-12 text-slate-400">Nenhum pedido encontrado.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="table-header">
                <tr>
                  <th className="table-cell text-left">ID</th>
                  <th className="table-cell text-left">Empresa</th>
                  <th className="table-cell text-left">Categoria</th>
                  <th className="table-cell text-left">Fornecedor</th>
                  <th className="table-cell text-right">Valor</th>
                  <th className="table-cell text-left">Status</th>
                </tr>
              </thead>
              <tbody>
                {pedidosTabela.slice(0, 100).map(p => (
                  <tr key={p.id} className="table-row">
                    <td className="table-cell text-slate-400">#{p.id}</td>
                    <td className="table-cell">{p.empresa}</td>
                    <td className="table-cell">{p.categoria}</td>
                    <td className="table-cell font-medium">{p.fornecedor}</td>
                    <td className="table-cell text-right">{fmtMoeda(p.valor_pedido)}</td>
                    <td className="table-cell">
                      <span className={`badge ${STATUS_BADGE[p.status] ?? 'bg-slate-100 text-slate-600'}`}>
                        {p.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {pedidosTabela.length > 100 && (
              <p className="text-center text-xs text-slate-400 py-3">
                Exibindo 100 de {pedidosTabela.length} pedidos. Use os filtros para refinar.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
