'use client'

import { useCallback, useEffect, useState } from 'react'
import { Shuffle, Clock } from 'lucide-react'
import { supabaseBrowser as supabase } from '@/lib/supabase/client'
import { TAB_PEDIDO, type ModuloPedido } from '@/lib/ajuste'
import { totaisPorCentro, type Realocacao, type RealocacaoItem } from '@/lib/realocacao'
import RealocarModal from './RealocarModal'

const fmtMoeda = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const fmtDataHora = (d: string) => new Date(d).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
const STATUS_BADGE: Record<string, string> = {
  'Aguardando Autorização': 'bg-yellow-100 text-yellow-700', Autorizada: 'bg-green-100 text-green-700', Recusada: 'bg-red-100 text-red-700',
}
const resumo = (itens: RealocacaoItem[]) => totaisPorCentro(itens).map(([e, v]) => `${e} ${fmtMoeda(v)}`).join(' · ')

// Cartão do pedido: distribuição atual por centro de custo, botão de realocar, realocação pendente e histórico.
// Aberto também por ?realocar=1 (botão de editar do Controle).
export default function RealocacaoPedido({ mod, pedido, usuario, onPendente, onChanged }: {
  mod: ModuloPedido
  pedido: { id: number; empresa: string; categoria: string; valor_pedido: number; status: string; cancelado: boolean }
  usuario: string; onPendente: (pendente: boolean) => void; onChanged: () => void
}) {
  const t = TAB_PEDIDO[mod]
  const [hist, setHist] = useState<Realocacao[]>([])
  const [itens, setItens] = useState<RealocacaoItem[]>([])
  const [atual, setAtual] = useState<[string, number][]>([])
  const [aberto, setAberto] = useState(false)
  const [msg, setMsg] = useState('')
  const [carregado, setCarregado] = useState(false)

  const pendente = hist.find(r => r.status === 'Aguardando Autorização')
  const podeRealocar = pedido.status === 'Autorizado' && !pedido.cancelado && !pendente

  const load = useCallback(async () => {
    const [{ data: rs }, { data: fl }] = await Promise.all([
      supabase.from('realocacoes').select('*').eq('modulo', mod).eq('pedido_id', pedido.id).order('id', { ascending: false }),
      supabase.from(t.fluxo).select('empresa, valor_referente').eq('pedido_id', pedido.id),
    ])
    const lista = (rs ?? []) as Realocacao[]
    setHist(lista)
    onPendente(lista.some(r => r.status === 'Aguardando Autorização'))
    const { data: its } = lista.length
      ? await supabase.from('realocacao_itens').select('*').in('realocacao_id', lista.map(r => r.id)).order('id')
      : { data: [] }
    const todos = (its ?? []) as RealocacaoItem[]
    setItens(todos)
    if (fl?.length) setAtual(totaisPorCentro((fl as { empresa: string; valor_referente: number }[]).map(l => ({ empresa: l.empresa, valor: l.valor_referente }))))
    else {
      // sem linhas por mês: o último rateio aplicado, ou 100% no centro do pedido
      const ult = lista.find(r => r.status === 'Autorizada')
      const dep = todos.filter(i => i.realocacao_id === ult?.id && i.lado === 'depois')
      setAtual(dep.length ? totaisPorCentro(dep) : [[pedido.empresa, Number(pedido.valor_pedido)]])
    }
    setCarregado(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mod, pedido.id, pedido.empresa, pedido.valor_pedido, t.fluxo])

  useEffect(() => { load() }, [load])

  // ?realocar=1 abre o modal uma vez, assim que der para realocar
  useEffect(() => {
    if (!carregado || !podeRealocar) return
    const q = new URLSearchParams(window.location.search)
    if (q.get('realocar') === '1') {
      setAberto(true)
      q.delete('realocar')
      window.history.replaceState(null, '', window.location.pathname + (q.toString() ? `?${q}` : ''))
    }
  }, [carregado, podeRealocar])

  const doItens = (id: number, lado: 'antes' | 'depois') => itens.filter(i => i.realocacao_id === id && i.lado === lado)

  return (
    <div className="card">
      <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
        <h2 className="text-sm font-semibold text-slate-700">Centro de custo</h2>
        {podeRealocar && (
          <button onClick={() => { setMsg(''); setAberto(true) }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 text-white rounded-lg text-xs font-medium hover:bg-slate-900">
            <Shuffle size={13} /> Realocar centro de custo
          </button>
        )}
      </div>

      <div className="space-y-0.5 text-sm">
        {atual.map(([e, v]) => <p key={e}>{e} <span className="text-slate-400">—</span> <span className="font-medium">{fmtMoeda(v)}</span></p>)}
      </div>

      {msg && <p className="mt-3 text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">{msg}</p>}

      {pendente && (
        <div className="mt-3 p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-yellow-800 space-y-1">
          <p className="font-semibold flex items-center gap-1.5"><Clock size={14} /> Realocação aguardando autorização</p>
          <p>Solicitada por {pendente.solicitante} em {fmtDataHora(pendente.data_solicitacao)}. O saldo do destino está reservado.</p>
          <p>Proposta: {resumo(doItens(pendente.id, 'depois'))}</p>
          {pendente.observacao && <p className="italic">“{pendente.observacao}”</p>}
        </div>
      )}

      {hist.some(r => r.status !== 'Aguardando Autorização') && (
        <div className="mt-4">
          <p className="text-xs font-semibold text-slate-500 mb-2">Histórico de realocações</p>
          <div className="space-y-2">
            {hist.filter(r => r.status !== 'Aguardando Autorização').map(r => (
              <div key={r.id} className="text-xs border border-slate-100 rounded-lg p-2.5 space-y-0.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`badge ${STATUS_BADGE[r.status]}`}>{r.status}</span>
                  <span className="text-slate-500">
                    {fmtDataHora(r.data_solicitacao)} · solicitada por {r.solicitante}
                    {r.data_decisao && (r.autorizador ? ` · decidida por ${r.autorizador} em ${fmtDataHora(r.data_decisao)}` : ' · aplicada direto, sem autorização')}
                  </span>
                </div>
                <p><span className="text-slate-400">Antes:</span> {resumo(doItens(r.id, 'antes'))}</p>
                <p><span className="text-slate-400">Depois:</span> {resumo(doItens(r.id, 'depois'))}</p>
                {r.motivo_recusa && <p className="text-red-600">Motivo da recusa: {r.motivo_recusa}</p>}
                {r.observacao && <p className="italic text-slate-500">“{r.observacao}”</p>}
              </div>
            ))}
          </div>
        </div>
      )}

      {aberto && (
        <RealocarModal mod={mod} pedido={pedido} usuario={usuario} onClose={() => setAberto(false)}
          onDone={plano => {
            setAberto(false)
            setMsg(plano.direta ? 'Realocação aplicada.' : 'Realocação solicitada. Aguarde a autorização; o saldo do destino ficou reservado.')
            load(); onChanged()
          }} />
      )}
    </div>
  )
}
