'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabaseBrowser as supabase } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { CheckCircle, XCircle, AlertTriangle, RefreshCw, Search, ChevronRight } from 'lucide-react'
import Confirm from '@/components/ui/Confirm'
import AjusteModal from '@/components/pedidos/AjusteModal'

interface Pedido {
  id: number; empresa: string; categoria: string; fornecedor: string
  valor_pedido: number; observacao: string | null; emergencia: boolean
  data_solicitacao: string; usuario_solicitante?: string | null; ajuste_reenviado?: boolean
}

const fmtMoeda = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const fmtData = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString('pt-BR')

export default function AutorizarPage() {
  const router = useRouter()
  const [pedidos, setPedidos] = useState<Pedido[]>([])
  const [loading, setLoading] = useState(true)
  const [aba, setAba] = useState<'autorizacao' | 'ajuste'>('autorizacao')
  const [contagem, setContagem] = useState({ autorizacao: 0, ajuste: 0 })
  const emAjuste = aba === 'ajuste'
  const [user, setUser] = useState<{ username: string } | null>(null)

  const [searchId, setSearchId] = useState('')
  const [filtroEmpresa, setFiltroEmpresa] = useState('')
  const [filtroCategoria, setFiltroCategoria] = useState('')
  const [filtroFornecedor, setFiltroFornecedor] = useState('')

  const [selected, setSelected] = useState<Set<number>>(new Set())

  const [confirm, setConfirm] = useState<{
    open: boolean; ids: number[]; acao: 'Autorizado' | 'Não Autorizado'
  }>({ open: false, ids: [], acao: 'Autorizado' })
  const [processing, setProcessing] = useState(false)

  const [ajusteId, setAjusteId] = useState<number | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const contar = (status: string) => supabase.from('pedidos_solicitados')
      .select('id', { count: 'exact', head: true }).eq('status', status).eq('cancelado', false)
    const [{ data: peds }, cAut, cAju, u] = await Promise.all([
      supabase
        .from('pedidos_solicitados')
        .select('*')
        .eq('status', aba === 'ajuste' ? 'Aguardando Ajuste' : 'Aguardando Autorização')
        .eq('cancelado', false)
        .order('emergencia', { ascending: false })
        .order('id', { ascending: true }),
      contar('Aguardando Autorização'),
      contar('Aguardando Ajuste'),
      fetch('/api/auth/me').then(r => r.json()),
    ])
    setPedidos(peds ?? [])
    setContagem({ autorizacao: cAut.count ?? 0, ajuste: cAju.count ?? 0 })
    setUser(u)
    setLoading(false)
    setSelected(new Set())
  }, [aba])

  useEffect(() => { load() }, [load])

  const empresas = useMemo(() => [...new Set(pedidos.map(p => p.empresa))].sort(), [pedidos])
  const categorias = useMemo(() => {
    const base = filtroEmpresa ? pedidos.filter(p => p.empresa === filtroEmpresa) : pedidos
    return [...new Set(base.map(p => p.categoria))].sort()
  }, [pedidos, filtroEmpresa])
  const fornecedores = useMemo(() => {
    const base = filtroEmpresa ? pedidos.filter(p => p.empresa === filtroEmpresa) : pedidos
    return [...new Set(base.map(p => p.fornecedor))].sort()
  }, [pedidos, filtroEmpresa])

  const filtered = useMemo(() => {
    const id = searchId.trim()
    if (id) return pedidos.filter(p => String(p.id) === id)
    return pedidos.filter(p =>
      (!filtroEmpresa || p.empresa === filtroEmpresa) &&
      (!filtroCategoria || p.categoria === filtroCategoria) &&
      (!filtroFornecedor || p.fornecedor === filtroFornecedor)
    )
  }, [pedidos, searchId, filtroEmpresa, filtroCategoria, filtroFornecedor])

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
      await supabase.from('pedidos_solicitados').update({
        status: novoStatus,
        data_autorizacao: hoje,
        usuario_autorizador: user?.username ?? '',
      }).eq('id', id)

      await supabase.from('pedidos_solicitados_fluxo')
        .update({ status: novoStatus }).eq('pedido_id', id)

      if (novoStatus === 'Autorizado') {
        const { data: ex } = await supabase.from('controle_pagamentos')
          .select('id').eq('pedido_id', id).maybeSingle()
        if (!ex) {
          const p = pedidos.find(p => p.id === id)
          await supabase.from('controle_pagamentos').insert({
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
          <p className="page-subtitle">{emAjuste ? 'Pedidos devolvidos ao solicitante para ajuste' : 'Pedidos aguardando autorização'}</p>
        </div>
        <button onClick={load} className="btn-secondary p-2" title="Atualizar">
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Abas */}
      <div className="flex rounded-lg border border-slate-200 overflow-hidden w-fit">
        <button onClick={() => setAba('autorizacao')}
          className={`px-4 py-1.5 text-sm ${aba === 'autorizacao' ? 'bg-slate-800 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}>
          Aguardando autorização ({contagem.autorizacao})
        </button>
        <button onClick={() => setAba('ajuste')}
          className={`px-4 py-1.5 text-sm ${aba === 'ajuste' ? 'bg-slate-800 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}>
          Aguardando ajuste ({contagem.ajuste})
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
            onChange={e => { setFiltroEmpresa(e.target.value); setFiltroCategoria(''); setFiltroFornecedor('') }}
            disabled={!!searchId}>
            <option value="">Todas as empresas</option>
            {empresas.map(e => <option key={e} value={e}>{e}</option>)}
          </select>
          <select className="input" value={filtroCategoria}
            onChange={e => setFiltroCategoria(e.target.value)} disabled={!!searchId}>
            <option value="">Todas as categorias</option>
            {categorias.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <select className="input" value={filtroFornecedor}
            onChange={e => setFiltroFornecedor(e.target.value)} disabled={!!searchId}>
            <option value="">Todos os fornecedores</option>
            {fornecedores.map(f => <option key={f} value={f}>{f}</option>)}
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
          <p className="text-slate-600 font-medium">{emAjuste ? 'Nenhum pedido aguardando ajuste' : 'Nenhum pedido aguardando autorização'}</p>
        </div>
      )}

      {/* Cards */}
      {!loading && filtered.length > 0 && (
        <div className="space-y-3">
          {/* Select-all bar */}
          {!emAjuste && <label className="flex items-center gap-2 px-1 cursor-pointer select-none">
            <input type="checkbox" className="w-4 h-4 accent-blue-600"
              checked={allSelected} onChange={toggleAll} />
            <span className="text-xs text-slate-500">Selecionar todos ({filtered.length})</span>
          </label>}

          {filtered.map(p => (
            <div key={p.id}
              className={`card border transition-all ${p.emergencia ? 'border-orange-300 bg-orange-50' : 'border-slate-200'} ${selected.has(p.id) ? 'ring-2 ring-blue-400 ring-offset-1' : ''}`}>
              <div className="flex items-start gap-3">
                {!emAjuste && <input type="checkbox" className="w-4 h-4 mt-1 accent-blue-600 shrink-0"
                  checked={selected.has(p.id)} onChange={() => toggleSelect(p.id)} />}

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                    <span className="text-xs font-bold text-slate-600">Pedido #{p.id}</span>
                    {p.emergencia && (
                      <span className="badge bg-orange-100 text-orange-700 flex items-center gap-1">
                        <AlertTriangle size={10} /> Emergência
                      </span>
                    )}
                    {p.ajuste_reenviado && !emAjuste && (
                      <span className="badge bg-blue-100 text-blue-700">Reenviado após ajuste</span>
                    )}
                    {emAjuste && (
                      <span className="badge bg-orange-100 text-orange-700">
                        Com {p.usuario_solicitante ?? 'o solicitante'}
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
                      <p className="text-xs text-slate-400">Fornecedor</p>
                      <p className="text-sm truncate">{p.fornecedor}</p>
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
                  {!emAjuste && <>
                  <button onClick={() => setConfirm({ open: true, ids: [p.id], acao: 'Autorizado' })}
                    className="inline-flex items-center gap-1 px-3 py-1.5 bg-green-600 text-white rounded text-xs font-medium hover:bg-green-700">
                    <CheckCircle size={12} /> Autorizar
                  </button>
                  <button onClick={() => setConfirm({ open: true, ids: [p.id], acao: 'Não Autorizado' })}
                    className="inline-flex items-center gap-1 px-3 py-1.5 border border-red-200 bg-red-50 text-red-700 rounded text-xs font-medium hover:bg-red-100">
                    <XCircle size={12} /> Rejeitar
                  </button>
                  <button onClick={() => setAjusteId(p.id)}
                    className="inline-flex items-center gap-1 px-3 py-1.5 border border-orange-200 bg-orange-50 text-orange-700 rounded text-xs font-medium hover:bg-orange-100">
                    Solicitar Ajuste
                  </button>
                  </>}
                  <button onClick={() => router.push(`/pagamentos/autorizar/${p.id}`)}
                    className="inline-flex items-center gap-1 px-3 py-1.5 bg-slate-100 text-slate-700 rounded text-xs font-medium hover:bg-slate-200">
                    Detalhes <ChevronRight size={12} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {ajusteId !== null && (
        <AjusteModal mod="pagamentos" pedidoId={ajusteId} usuario={user?.username ?? ''}
          onClose={() => setAjusteId(null)} onDone={() => { setAjusteId(null); load() }} />
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
