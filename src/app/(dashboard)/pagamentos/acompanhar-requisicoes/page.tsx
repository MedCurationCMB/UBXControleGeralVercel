'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabaseBrowser as supabase } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Search, RefreshCw, ChevronRight, List, LayoutGrid, Info } from 'lucide-react'

interface Requisicao {
  id: number; empresa: string; categoria: string; descricao: string
  status: string; data_solicitacao: string
}

interface PedidoInfo {
  id: number; status: string; cancelado: boolean
}

interface ControleInfo {
  valor_pagar: number | null; valor_pagamento: number | null
}

const STATUS_OPTIONS = ['Aguardando Autorização', 'Autorizado', 'Não Autorizado']

const STATUS_BADGE: Record<string, string> = {
  'Autorizado': 'bg-green-100 text-green-700',
  'Não Autorizado': 'bg-red-100 text-red-700',
  'Aguardando Autorização': 'bg-yellow-100 text-yellow-700',
}

const fmtData = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString('pt-BR')

type Estagio = 'aguardando_autorizacao' | 'nao_autorizada' | 'aguardando_pedido'
  | 'pedido_aguardando_autorizacao' | 'aguardando_pagamento' | 'paga'

const COLUNAS: { key: Estagio; titulo: string }[] = [
  { key: 'aguardando_autorizacao', titulo: 'Aguardando Autorização' },
  { key: 'nao_autorizada', titulo: 'Não Autorizada' },
  { key: 'aguardando_pedido', titulo: 'Autorizada — Aguardando Pedido' },
  { key: 'pedido_aguardando_autorizacao', titulo: 'Pedido Criado — Aguardando Autorização' },
  { key: 'aguardando_pagamento', titulo: 'Aguardando Pagamento' },
  { key: 'paga', titulo: 'Paga' },
]

// Enquanto nenhum pedido foi vinculado, a requisição pode transitar livremente entre essas 3 colunas.
const COLUNAS_SEM_PEDIDO: Estagio[] = ['aguardando_autorizacao', 'nao_autorizada', 'aguardando_pedido']

const STATUS_POR_COLUNA: Partial<Record<Estagio, 'Aguardando Autorização' | 'Autorizado' | 'Não Autorizado'>> = {
  aguardando_autorizacao: 'Aguardando Autorização',
  nao_autorizada: 'Não Autorizado',
  aguardando_pedido: 'Autorizado',
}

function getEstagio(req: Requisicao, pedido: PedidoInfo | undefined, controles: ControleInfo[]): Estagio {
  if (req.status === 'Aguardando Autorização') return 'aguardando_autorizacao'
  if (req.status === 'Não Autorizado') return 'nao_autorizada'
  if (!pedido || pedido.cancelado) return 'aguardando_pedido'
  if (pedido.status !== 'Autorizado') return 'pedido_aguardando_autorizacao'
  const paga = controles.length > 0 && controles.every(c =>
    c.valor_pagamento != null && c.valor_pagar != null && c.valor_pagamento >= c.valor_pagar
  )
  return paga ? 'paga' : 'aguardando_pagamento'
}

export default function AcompanharRequisicoesPage() {
  const router = useRouter()
  const [view, setView] = useState<'lista' | 'kanban'>('lista')

  const [requisicoes, setRequisicoes] = useState<Requisicao[]>([])
  const [pedidosPorRequisicao, setPedidosPorRequisicao] = useState<Record<number, PedidoInfo>>({})
  const [controlesPorPedido, setControlesPorPedido] = useState<Record<number, ControleInfo[]>>({})
  const [loading, setLoading] = useState(true)
  const [isAdminOrOwner, setIsAdminOrOwner] = useState(false)
  const [username, setUsername] = useState('')

  const [searchId, setSearchId] = useState('')
  const [filtroEmpresa, setFiltroEmpresa] = useState('')
  const [filtroStatus, setFiltroStatus] = useState('')

  const [draggingId, setDraggingId] = useState<number | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const [{ data: reqs }, u] = await Promise.all([
      supabase.from('requisicoes').select('id, empresa, categoria, descricao, status, data_solicitacao').order('id', { ascending: false }),
      fetch('/api/auth/me').then(r => r.json()),
    ])
    setRequisicoes(reqs ?? [])
    setIsAdminOrOwner(u?.hierarquia === 'admin' || u?.hierarquia === 'owner')
    setUsername(u?.username ?? '')

    const { data: pedidos } = await supabase
      .from('pedidos_solicitados')
      .select('id, requisicao_id, status, cancelado')
      .not('requisicao_id', 'is', null)

    const pedidoMap: Record<number, PedidoInfo> = {}
    for (const p of (pedidos ?? [])) {
      pedidoMap[p.requisicao_id as number] = { id: p.id, status: p.status, cancelado: p.cancelado }
    }
    setPedidosPorRequisicao(pedidoMap)

    const pedidoIds = (pedidos ?? []).map(p => p.id)
    if (pedidoIds.length > 0) {
      const { data: controles } = await supabase
        .from('controle_pagamentos')
        .select('pedido_id, valor_pagar, valor_pagamento')
        .in('pedido_id', pedidoIds)
      const controleMap: Record<number, ControleInfo[]> = {}
      for (const c of (controles ?? [])) {
        if (!controleMap[c.pedido_id]) controleMap[c.pedido_id] = []
        controleMap[c.pedido_id].push({ valor_pagar: c.valor_pagar, valor_pagamento: c.valor_pagamento })
      }
      setControlesPorPedido(controleMap)
    } else {
      setControlesPorPedido({})
    }

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

  const comEstagio = useMemo(() => filtered.map(r => ({
    req: r,
    estagio: getEstagio(r, pedidosPorRequisicao[r.id], controlesPorPedido[pedidosPorRequisicao[r.id]?.id] ?? []),
  })), [filtered, pedidosPorRequisicao, controlesPorPedido])

  const handleMudarStatus = async (id: number, novoStatus: 'Aguardando Autorização' | 'Autorizado' | 'Não Autorizado') => {
    const hoje = new Date().toISOString().split('T')[0]
    await supabase.from('requisicoes').update({
      status: novoStatus,
      data_autorizacao: novoStatus === 'Aguardando Autorização' ? null : hoje,
      usuario_autorizador: novoStatus === 'Aguardando Autorização' ? null : username,
    }).eq('id', id)
    load()
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="page-title">Requisições</h1>
          <p className="page-subtitle">Todas as requisições e o andamento até o pagamento</p>
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
          <button onClick={load} className="btn-secondary p-2" title="Atualizar">
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
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
          {view === 'lista' && (
            <select className="input" value={filtroStatus} onChange={e => setFiltroStatus(e.target.value)}>
              <option value="">Todos os status</option>
              {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          )}
        </div>
      </div>

      {loading ? (
        <div className="card text-center py-12 text-slate-400">Carregando...</div>
      ) : filtered.length === 0 ? (
        <div className="card text-center py-12">
          <Search size={36} className="mx-auto text-slate-300 mb-3" />
          <p className="text-slate-500">Nenhuma requisição encontrada</p>
        </div>
      ) : view === 'lista' ? (
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
      ) : (
        <>
        <div className="flex items-start gap-2 p-3 bg-blue-50 border border-blue-200 rounded-md text-sm text-blue-700">
          <Info size={15} className="mt-0.5 shrink-0" />
          <p>
            Cada coluna é uma etapa da requisição até o pagamento. Enquanto nenhum pedido foi vinculado, o card pode ser
            movido livremente entre <strong>Aguardando Autorização</strong>, <strong>Não Autorizada</strong> e{' '}
            <strong>Autorizada — Aguardando Pedido</strong>. Assim que um pedido é criado para essa requisição, ela trava
            e as colunas seguintes avançam sozinhas conforme o pedido é autorizado e pago nas outras telas.
          </p>
        </div>
        <div className="flex gap-3 overflow-x-auto pb-2">
          {COLUNAS.map(col => {
            const cards = comEstagio.filter(c => c.estagio === col.key)
            const podeReceberDrop = isAdminOrOwner && COLUNAS_SEM_PEDIDO.includes(col.key)
            return (
              <div
                key={col.key}
                className="flex-shrink-0 w-64 bg-slate-50 rounded-lg border border-slate-200"
                onDragOver={podeReceberDrop ? e => e.preventDefault() : undefined}
                onDrop={podeReceberDrop ? e => {
                  e.preventDefault()
                  if (draggingId == null) return
                  const novoStatus = STATUS_POR_COLUNA[col.key]
                  if (novoStatus) handleMudarStatus(draggingId, novoStatus)
                  setDraggingId(null)
                } : undefined}
              >
                <div className="px-3 py-2.5 border-b border-slate-200">
                  <p className="text-xs font-semibold text-slate-600">{col.titulo}</p>
                  <p className="text-xs text-slate-400">{cards.length} requisição(ões)</p>
                </div>
                <div className="p-2 space-y-2 min-h-[80px]">
                  {cards.map(({ req }) => {
                    const arrastavel = isAdminOrOwner && COLUNAS_SEM_PEDIDO.includes(col.key)
                    return (
                      <div
                        key={req.id}
                        draggable={arrastavel}
                        onDragStart={arrastavel ? () => setDraggingId(req.id) : undefined}
                        onDragEnd={() => setDraggingId(null)}
                        onClick={() => router.push(`/pagamentos/acompanhar-requisicoes/${req.id}`)}
                        className={`bg-white rounded-md border border-slate-200 p-2.5 text-sm shadow-sm hover:shadow cursor-pointer ${arrastavel ? 'cursor-grab active:cursor-grabbing' : ''} ${draggingId === req.id ? 'opacity-40' : ''}`}
                      >
                        <p className="font-mono text-xs text-slate-400">#{req.id}</p>
                        <p className="font-medium text-slate-800 truncate">{req.empresa}</p>
                        <p className="text-xs text-slate-500 truncate">{req.categoria}</p>
                        <p className="text-xs text-slate-500 truncate mt-1">{req.descricao}</p>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
        </>
      )}
    </div>
  )
}
