'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { CheckCircle, XCircle, CheckSquare } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import Confirm from '@/components/ui/Confirm'
import { supabaseBrowser as supabase } from '@/lib/supabase/client'
import { TAB_PEDIDO, type ModuloPedido } from '@/lib/ajuste'
import {
  autorizarRealocacao, recusarRealocacao, periodoLabel, type Realocacao, type RealocacaoItem,
} from '@/lib/realocacao'

const fmtMoeda = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const fmtDataHora = (d: string) => new Date(d).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })

interface PedidoInfo { id: number; empresa: string; categoria: string; valor_pedido: number; parte: string }
interface Orc { empresa: string; categoria: string; mes: number; ano: number; valor_orcamento: number; valor_pedidos_solicitados: number }
interface Linha { empresa: string; categoria: string; mes: number; ano: number; antes: number; depois: number }

// Realocações de centro de custo aguardando autorização (aba da tela Autorizar Pedidos).
export default function RealocacoesPendentes({ mod, usuario, onChanged }: { mod: ModuloPedido; usuario: string; onChanged: () => void }) {
  const t = TAB_PEDIDO[mod]
  const [loading, setLoading] = useState(true)
  const [rs, setRs] = useState<Realocacao[]>([])
  const [itens, setItens] = useState<RealocacaoItem[]>([])
  const [pedidos, setPedidos] = useState<Record<number, PedidoInfo>>({})
  const [orc, setOrc] = useState<Orc[]>([])
  const [confirmar, setConfirmar] = useState<Realocacao | null>(null)
  const [recusar, setRecusar] = useState<Realocacao | null>(null)
  const [motivo, setMotivo] = useState('')
  const [busy, setBusy] = useState(false)
  const [erro, setErro] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase.from('realocacoes').select('*').eq('modulo', mod).eq('status', 'Aguardando Autorização').order('id')
    const lista = (data ?? []) as Realocacao[]
    setRs(lista)
    if (lista.length === 0) { setItens([]); setPedidos({}); setOrc([]); setLoading(false); return }
    const [{ data: its }, { data: peds }] = await Promise.all([
      supabase.from('realocacao_itens').select('*').in('realocacao_id', lista.map(r => r.id)).order('id'),
      supabase.from(t.pedido).select(`id, empresa, categoria, valor_pedido, ${t.parte}`).in('id', lista.map(r => r.pedido_id)),
    ])
    const todos = (its ?? []) as RealocacaoItem[]
    setItens(todos)
    setPedidos(Object.fromEntries(((peds ?? []) as unknown as Record<string, unknown>[]).map(p => [p.id as number, {
      id: p.id as number, empresa: p.empresa as string, categoria: p.categoria as string,
      valor_pedido: Number(p.valor_pedido), parte: p[t.parte] as string,
    }])))
    const { data: o } = await supabase.from(t.orcamento)
      .select('empresa, categoria, mes, ano, valor_orcamento, valor_pedidos_solicitados')
      .in('empresa', [...new Set(todos.filter(i => i.lado === 'depois').map(i => i.empresa))])
    setOrc((o ?? []) as Orc[])
    setLoading(false)
  }, [mod, t.pedido, t.parte, t.orcamento])

  useEffect(() => { load() }, [load])

  // uma linha por centro/categoria/período, com o valor de antes e de depois
  const linhasDe = (id: number): Linha[] => {
    const m = new Map<string, Linha>()
    for (const i of itens.filter(x => x.realocacao_id === id)) {
      const k = `${i.empresa}|${i.categoria}|${i.mes ?? 0}|${i.ano ?? 0}`
      const l = m.get(k) ?? { empresa: i.empresa, categoria: i.categoria, mes: i.mes ?? 0, ano: i.ano ?? 0, antes: 0, depois: 0 }
      l[i.lado] += Number(i.valor)
      m.set(k, l)
    }
    return [...m.values()].sort((a, b) => a.ano - b.ano || a.mes - b.mes || a.empresa.localeCompare(b.empresa))
  }

  // situação do saldo onde entra valor a mais (o saldo do destino já está reservado: o consumo do orçamento inclui esta realocação)
  const situacao = (l: Linha) => {
    const dif = l.depois - l.antes
    if (dif <= 0) return { texto: dif < 0 ? `Libera ${fmtMoeda(-dif)} ao aplicar` : 'Sem mudança', cor: 'text-slate-500' }
    const o = orc.find(x => x.empresa === l.empresa && x.categoria === l.categoria && x.mes === l.mes && x.ano === l.ano)
    if (!o) return { texto: 'Sem orçamento cadastrado', cor: 'text-orange-600' }
    const saldo = Number(o.valor_orcamento) - Number(o.valor_pedidos_solicitados)
    return saldo < 0
      ? { texto: `Reservado — saldo do centro negativo (${fmtMoeda(saldo)})`, cor: 'text-orange-600' }
      : { texto: `Reservado — saldo restante ${fmtMoeda(saldo)}`, cor: 'text-green-700' }
  }

  const decidir = async (autorizar: boolean) => {
    const r = autorizar ? confirmar : recusar
    if (!r) return
    setBusy(true)
    const e = autorizar ? await autorizarRealocacao(r.id, usuario) : await recusarRealocacao(r.id, usuario, motivo)
    setBusy(false)
    if (e) { setErro(e); return }
    setConfirmar(null); setRecusar(null); setMotivo(''); setErro('')
    await load(); onChanged()
  }

  if (loading) return <div className="card text-center py-12 text-slate-400">Carregando...</div>
  if (rs.length === 0) return (
    <div className="card text-center py-16">
      <CheckCircle size={40} className="mx-auto text-green-400 mb-3" />
      <p className="text-slate-600 font-medium">Nenhuma realocação aguardando autorização</p>
    </div>
  )

  return (
    <div className="space-y-3">
      {erro && !confirmar && !recusar && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{erro}</div>}
      {rs.map(r => {
        const p = pedidos[r.pedido_id]
        return (
          <div key={r.id} className="card border border-slate-200 space-y-3">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div>
                <p className="text-xs font-bold text-slate-600 flex items-center gap-1.5">
                  <CheckSquare size={12} /> Realocação do{' '}
                  <Link href={`/${mod}/acompanhar/${r.pedido_id}`} className="text-blue-600 hover:underline">Pedido #{r.pedido_id}</Link>
                </p>
                {p && <p className="text-sm text-slate-700">{p.parte} · {p.categoria} · <span className="font-semibold">{fmtMoeda(p.valor_pedido)}</span></p>}
                <p className="text-xs text-slate-500">
                  Solicitada por {r.solicitante} em {fmtDataHora(r.data_solicitacao)} · distribuição {r.modo === 'percentual' ? 'por percentual' : 'por valor'}
                </p>
              </div>
              <div className="flex gap-1.5">
                <button onClick={() => { setErro(''); setConfirmar(r) }}
                  className="inline-flex items-center gap-1 px-3 py-1.5 bg-green-600 text-white rounded text-xs font-medium hover:bg-green-700">
                  <CheckCircle size={12} /> Autorizar
                </button>
                <button onClick={() => { setErro(''); setRecusar(r) }}
                  className="inline-flex items-center gap-1 px-3 py-1.5 border border-red-200 bg-red-50 text-red-700 rounded text-xs font-medium hover:bg-red-100">
                  <XCircle size={12} /> Recusar
                </button>
              </div>
            </div>
            {r.observacao && <p className="text-xs text-slate-500 bg-slate-50 rounded px-2 py-1 border border-slate-100">{r.observacao}</p>}
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-slate-500 border-b border-slate-100">
                    <th className="py-1 pr-2">Centro de custo</th><th className="pr-2">Período</th>
                    <th className="pr-2 text-right">Atual</th><th className="pr-2 text-right">Proposto</th><th className="pr-2 text-right">Diferença</th><th>Disponibilidade</th>
                  </tr>
                </thead>
                <tbody>
                  {linhasDe(r.id).map((l, i) => {
                    const s = situacao(l), dif = l.depois - l.antes
                    return (
                      <tr key={i} className="border-b border-slate-50">
                        <td className="py-1 pr-2">{l.empresa}</td>
                        <td className="pr-2 whitespace-nowrap">{periodoLabel(l.mes, l.ano)}</td>
                        <td className="pr-2 text-right">{fmtMoeda(l.antes)}</td>
                        <td className="pr-2 text-right font-medium">{fmtMoeda(l.depois)}</td>
                        <td className={`pr-2 text-right ${dif > 0 ? 'text-slate-800' : 'text-slate-500'}`}>{dif > 0 ? '+' : ''}{fmtMoeda(dif)}</td>
                        <td className={s.cor}>{s.texto}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )
      })}

      <Confirm open={!!confirmar} onClose={() => { setConfirmar(null); setErro('') }} onConfirm={() => decidir(true)}
        title="Autorizar realocação"
        message={`Confirma a realocação do pedido #${confirmar?.pedido_id}? A distribuição por centro de custo será aplicada agora.${erro ? ` Não foi possível: ${erro}` : ''}`}
        confirmLabel="Autorizar" loading={busy} />

      <Modal open={!!recusar} onClose={() => { setRecusar(null); setErro('') }} title={`Recusar realocação — Pedido #${recusar?.pedido_id}`} size="sm">
        <p className="text-sm text-slate-600 mb-3">O pedido continua com a distribuição atual e o saldo reservado é liberado.</p>
        <textarea className="input w-full min-h-[80px] resize-none" placeholder="Motivo (opcional)" value={motivo} onChange={e => setMotivo(e.target.value)} />
        {erro && <p className="text-xs text-red-600 mt-2">{erro}</p>}
        <div className="flex justify-end gap-3 mt-4">
          <button onClick={() => { setRecusar(null); setErro('') }} className="btn-secondary" disabled={busy}>Cancelar</button>
          <button onClick={() => decidir(false)} className="btn-danger" disabled={busy}>{busy ? 'Aguarde...' : 'Recusar'}</button>
        </div>
      </Modal>
    </div>
  )
}
