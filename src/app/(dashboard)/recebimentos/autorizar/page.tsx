'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabaseBrowser as supabase } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { CheckCircle, XCircle, AlertTriangle, RefreshCw, Search, ChevronRight } from 'lucide-react'
import Confirm from '@/components/ui/Confirm'

interface Pedido {
  id: number; empresa: string; categoria: string; cliente: string
  valor_pedido: number; observacao: string | null; emergencia: boolean
  data_solicitacao: string
}

const fmtMoeda = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const fmtData = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString('pt-BR')

export default function AutorizarRecebimentosPage() {
  const router = useRouter()
  const [pedidos, setPedidos] = useState<Pedido[]>([])
  const [loading, setLoading] = useState(true)
  const [user, setUser] = useState<{ username: string } | null>(null)

  const [searchId, setSearchId] = useState('')
  const [filtroEmpresa, setFiltroEmpresa] = useState('')
  const [filtroCategoria, setFiltroCategoria] = useState('')
  const [filtroCliente, setFiltroCliente] = useState('')

  const [selected, setSelected] = useState<Set<number>>(new Set())

  const [confirm, setConfirm] = useState<{
    open: boolean; ids: number[]; acao: 'Autorizado' | 'Não Autorizado'
  }>({ open: false, ids: [], acao: 'Autorizado' })
  const [processing, setProcessing] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const [{ data: peds }, u] = await Promise.all([
      supabase
        .from('pedidos_solicitados_receita')
        .select('id, empresa, categoria, cliente, valor_pedido, observacao, emergencia, data_solicitacao')
        .eq('status', 'Aguardando Autorização')
        .eq('cancelado', false)
        .order('emergencia', { ascending: false })
        .order('id', { ascending: true }),
      fetch('/api/auth/me').then(r => r.json()),
    ])
    setPedidos(peds ?? [])
    setUser(u)
    setLoading(false)
    setSelected(new Set())
  }, [])

  useEffect(() => { load() }, [load])

  const empresas = useMemo(() => [...new Set(pedidos.map(p => p.empresa))].sort(), [pedidos])
  const categorias = useMemo(() => {
    const base = filtroEmpresa ? pedidos.filter(p => p.empresa === filtroEmpresa) : pedidos
    return [...new Set(base.map(p => p.categoria))].sort()
  }, [pedidos, filtroEmpresa])
  const clientes = useMemo(() => {
    const base = filtroEmpresa ? pedidos.filter(p => p.empresa === filtroEmpresa) : pedidos
    return [...new Set(base.map(p => p.cliente))].sort()
  }, [pedidos, filtroEmpresa])

  const filtered = useMemo(() => {
    const id = searchId.trim()
    if (id) return pedidos.filter(p => String(p.id) === id)
    return pedidos.filter(p =>
      (!filtroEmpresa || p.empresa === filtroEmpresa) &&
      (!filtroCategoria || p.categoria === filtroCategoria) &&
      (!filtroCliente || p.cliente === filtroCliente)
    )
  }, [pedidos, searchId, filtroEmpresa, filtroCategoria, filtroCliente])

  const toggleSelect = (id: number) =>
    setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })

  const allSelected = filtered.length > 0 && selected.size === filtered.length
  const toggleAll = () =>
    setSelected(allSelected ? new Set() : new Set(filtered.map(p => p.id)))

  const handleAcao = async () => {
    setProcessing(true)
    const novoStatus = confirm.acao
    const hoje = new Date().toISOString().split('T')[0]

    for (const id of confirm.ids) {
      await supabase.from('pedidos_solicitados_receita').update({
        status: novoStatus,
        data_autorizacao: hoje,
        usuario_autorizador: user?.username ?? '',
      }).eq('id', id)

      await supabase.from('pedidos_solicitados_fluxo_receita')
        .update({ status: novoStatus }).eq('pedido_id', id)

      if (novoStatus === 'Autorizado') {
        const { data: ex } = await supabase.from('controle_recebimento')
          .select('id').eq('pedido_id', id).maybeSingle()
        if (!ex) {
          const p = pedidos.find(p => p.id === id)
          await supabase.from('controle_recebimento').insert({
            pedido_id: id, valor_pagar: p?.valor_pedido, status_pagamento: 1,
          })
        }
      }
    }

    setProcessing(false)
    setConfirm({ open: false, ids: [], acao: 'Autorizado' })
    load()
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">Autorizar Pedidos</h1>
          <p className="page-subtitle">Pedidos de recebimento aguardando autorização</p>
        </div>
        <button onClick={load} className="btn-secondary p-2" title="Atualizar">
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Filtros */}
      <div className="card">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input className="input pl-9" type="number" min="0" placeholder="Buscar por ID..."
              value={searchId} onChange={e => setSearchId(e.target.value)} />
          </div>
          <select className="input" value={filtroEmpresa}
            onChange={e => { setFiltroEmpresa(e.target.value); setFiltroCategoria(''); setFiltroCliente('') }}
            disabled={!!searchId}>
            <option value="">Todas as empresas</option>
            {empresas.map(e => <option key={e} value={e}>{e}</option>)}
          </select>
          <select className="input" value={filtroCategoria}
            onChange={e => setFiltroCategoria(e.target.value)} disabled={!!searchId}>
            <option value="">Todas as categorias</option>
            {categorias.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <select className="input" value={filtroCliente}
            onChange={e => setFiltroCliente(e.target.value)} disabled={!!searchId}>
            <option value="">Todos os clientes</option>
            {clientes.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-100 flex-wrap gap-2">
          <span className="text-sm text-slate-500">{filtered.length} pedido(s)</span>
          {selected.size > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-slate-700">{selected.size} selecionado(s)</span>
              <button onClick={() => setConfirm({ open: true, ids: [...selected], acao: 'Autorizado' })}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-green-600 text-white rounded text-xs font-medium hover:bg-green-700">
                <CheckCircle size={12} /> Autorizar
              </button>
              <button onClick={() => setConfirm({ open: true, ids: [...selected], acao: 'Não Autorizado' })}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-red-200 bg-red-50 text-red-700 rounded text-xs font-medium hover:bg-red-100">
                <XCircle size={12} /> Rejeitar
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Empty / loading */}
      {loading && <div className="card text-center py-12 text-slate-400">Carregando...</div>}
      {!loading && filtered.length === 0 && (
        <div className="card text-center py-16">
          <CheckCircle size={40} className="mx-auto text-green-400 mb-3" />
          <p className="text-slate-600 font-medium">Nenhum pedido aguardando autorização</p>
        </div>
      )}

      {/* Cards */}
      {!loading && filtered.length > 0 && (
        <div className="space-y-3">
          <label className="flex items-center gap-2 px-1 cursor-pointer select-none">
            <input type="checkbox" className="w-4 h-4 accent-blue-600"
              checked={allSelected} onChange={toggleAll} />
            <span className="text-xs text-slate-500">Selecionar todos ({filtered.length})</span>
          </label>

          {filtered.map(p => (
            <div key={p.id}
              className={`card border transition-all ${p.emergencia ? 'border-orange-300 bg-orange-50' : 'border-slate-200'} ${selected.has(p.id) ? 'ring-2 ring-blue-400 ring-offset-1' : ''}`}>
              <div className="flex items-start gap-3">
                <input type="checkbox" className="w-4 h-4 mt-1 accent-blue-600 shrink-0"
                  checked={selected.has(p.id)} onChange={() => toggleSelect(p.id)} />

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                    <span className="text-xs font-bold text-slate-600">Pedido #{p.id}</span>
                    {p.emergencia && (
                      <span className="badge bg-orange-100 text-orange-700 flex items-center gap-1">
                        <AlertTriangle size={10} /> Emergência
                      </span>
                    )}
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

                  {p.observacao && (
                    <p className="text-xs text-slate-500 mt-2 bg-white/70 rounded px-2 py-1 border border-slate-100 line-clamp-1">
                      {p.observacao}
                    </p>
                  )}
                </div>

                <div className="flex flex-col gap-1.5 shrink-0">
                  <button onClick={() => setConfirm({ open: true, ids: [p.id], acao: 'Autorizado' })}
                    className="inline-flex items-center gap-1 px-3 py-1.5 bg-green-600 text-white rounded text-xs font-medium hover:bg-green-700">
                    <CheckCircle size={12} /> Autorizar
                  </button>
                  <button onClick={() => setConfirm({ open: true, ids: [p.id], acao: 'Não Autorizado' })}
                    className="inline-flex items-center gap-1 px-3 py-1.5 border border-red-200 bg-red-50 text-red-700 rounded text-xs font-medium hover:bg-red-100">
                    <XCircle size={12} /> Rejeitar
                  </button>
                  <button onClick={() => router.push(`/recebimentos/autorizar/${p.id}`)}
                    className="inline-flex items-center gap-1 px-3 py-1.5 bg-slate-100 text-slate-700 rounded text-xs font-medium hover:bg-slate-200">
                    Detalhes <ChevronRight size={12} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Confirm
        open={confirm.open}
        onClose={() => setConfirm(c => ({ ...c, open: false }))}
        onConfirm={handleAcao}
        title={confirm.acao === 'Autorizado'
          ? `Autorizar ${confirm.ids.length > 1 ? confirm.ids.length + ' pedidos' : 'pedido'}`
          : `Rejeitar ${confirm.ids.length > 1 ? confirm.ids.length + ' pedidos' : 'pedido'}`}
        message={confirm.acao === 'Autorizado'
          ? `Confirma a autorização de ${confirm.ids.length === 1 ? `#${confirm.ids[0]}` : `${confirm.ids.length} pedidos selecionados`}?`
          : `Confirma a rejeição de ${confirm.ids.length === 1 ? `#${confirm.ids[0]}` : `${confirm.ids.length} pedidos selecionados`}?`}
        confirmLabel={confirm.acao === 'Autorizado' ? 'Autorizar' : 'Rejeitar'}
        loading={processing}
      />
    </div>
  )
}
