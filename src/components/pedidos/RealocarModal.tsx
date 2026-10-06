'use client'

import { useEffect, useMemo, useState } from 'react'
import { Plus, Trash2, AlertTriangle, XCircle } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import { supabaseBrowser as supabase } from '@/lib/supabase/client'
import { TAB_PEDIDO, type ModuloPedido } from '@/lib/ajuste'
import {
  CONTROLE_TAB, periodoLabel, solicitarRealocacao, totaisPorCentro,
  type DestinoRealocacao, type PlanoRealocacao,
} from '@/lib/realocacao'

const fmtMoeda = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
// aceita "1.234,56" e "1234.56"
const num = (s: string) => parseFloat(s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s)

interface Periodo { mes: number; ano: number; total: number }  // mes 0 = só o total (pedido sem linhas por mês)
interface Linha { empresa: string; v: string }               // v = percentual ou valor, como digitado
const chave = (p: Periodo) => `${p.mes}/${p.ano}`

export default function RealocarModal({ mod, pedido, usuario, onClose, onDone }: {
  mod: ModuloPedido
  pedido: { id: number; empresa: string; categoria: string; valor_pedido: number }
  usuario: string; onClose: () => void; onDone: (plano: PlanoRealocacao) => void
}) {
  const t = TAB_PEDIDO[mod]
  const [empresas, setEmpresas] = useState<{ nome: string; temCategoria: boolean }[]>([])
  const [periodos, setPeriodos] = useState<Periodo[]>([])
  const [atual, setAtual] = useState<[string, number][]>([])
  const [nContas, setNContas] = useState<number | null>(null)
  const [modo, setModo] = useState<'percentual' | 'valor'>('percentual')
  const [pct, setPct] = useState<Linha[]>([{ empresa: '', v: '' }, { empresa: '', v: '' }])
  const [val, setVal] = useState<Record<string, Linha[]>>({})
  const [obs, setObs] = useState('')
  const [plano, setPlano] = useState<PlanoRealocacao | null>(null)
  const [erro, setErro] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    ;(async () => {
      const [{ data: emps }, { data: cats }, { data: fl }, { count }] = await Promise.all([
        supabase.from('empresas').select('empresa').order('empresa'),
        supabase.from(t.categorias).select('empresa').eq('categoria', pedido.categoria),
        supabase.from(t.fluxo).select('empresa, mes, ano, valor_referente').eq('pedido_id', pedido.id),
        supabase.from(CONTROLE_TAB[mod]).select('id', { count: 'exact', head: true }).eq('pedido_id', pedido.id),
      ])
      const comCat = new Set((cats ?? []).map((c: { empresa: string }) => c.empresa))
      setEmpresas((emps ?? []).map((e: { empresa: string }) => ({ nome: e.empresa, temCategoria: comCat.has(e.empresa) })))
      setNContas(count ?? 0)

      const linhas = (fl ?? []) as { empresa: string; mes: number; ano: number; valor_referente: number }[]
      if (linhas.length > 0) {
        const m = new Map<string, Periodo>()
        for (const l of linhas) {
          const k = `${l.mes}/${l.ano}`
          m.set(k, { mes: l.mes, ano: l.ano, total: (m.get(k)?.total ?? 0) + Number(l.valor_referente) })
        }
        const ps = [...m.values()].sort((a, b) => a.ano - b.ano || a.mes - b.mes)
        setPeriodos(ps)
        setVal(Object.fromEntries(ps.map(p => [chave(p), [{ empresa: '', v: '' }]])))
        setAtual(totaisPorCentro(linhas.map(l => ({ empresa: l.empresa, valor: l.valor_referente }))))
      } else {
        // sem linhas por mês (Fluxo 3): vale o último rateio aplicado, ou 100% no centro do pedido
        const total = { mes: 0, ano: 0, total: Number(pedido.valor_pedido) }
        setPeriodos([total])
        setVal({ [chave(total)]: [{ empresa: '', v: '' }] })
        const { data: ult } = await supabase.from('realocacoes').select('id').eq('modulo', mod).eq('pedido_id', pedido.id)
          .eq('status', 'Autorizada').order('id', { ascending: false }).limit(1)
        const { data: its } = ult?.[0]
          ? await supabase.from('realocacao_itens').select('empresa, valor').eq('realocacao_id', ult[0].id).eq('lado', 'depois')
          : { data: null }
        setAtual(its?.length ? totaisPorCentro(its) : [[pedido.empresa, Number(pedido.valor_pedido)]])
      }
    })()
  }, [mod, pedido.id, pedido.categoria, pedido.empresa, pedido.valor_pedido, t.categorias, t.fluxo])

  const mudou = () => { setPlano(null); setErro('') }
  const setLinhaPct = (i: number, p: Partial<Linha>) => { mudou(); setPct(l => l.map((x, j) => j === i ? { ...x, ...p } : x)) }
  const setLinhaVal = (k: string, i: number, p: Partial<Linha>) => { mudou(); setVal(m => ({ ...m, [k]: m[k].map((x, j) => j === i ? { ...x, ...p } : x) })) }

  const somaPct = useMemo(() => pct.reduce((s, l) => s + (num(l.v) || 0), 0), [pct])
  const distribuido = (p: Periodo) => (val[chave(p)] ?? []).reduce((s, l) => s + (num(l.v) || 0), 0)

  // monta o que vai para a função do banco; as regras de verdade são validadas lá
  const montar = (): { destinos?: DestinoRealocacao[]; erro?: string } => {
    if (modo === 'percentual') {
      const ls = pct.filter(l => l.empresa || l.v)
      if (ls.some(l => !l.empresa || !(num(l.v) > 0))) return { erro: 'Informe o centro e o percentual de cada linha.' }
      return { destinos: ls.map(l => ({ empresa: l.empresa, percentual: num(l.v) })) }
    }
    const destinos: DestinoRealocacao[] = []
    for (const p of periodos) {
      for (const l of (val[chave(p)] ?? []).filter(l => l.empresa || l.v)) {
        if (!l.empresa || isNaN(num(l.v))) return { erro: `Informe o centro e o valor de cada linha (${periodoLabel(p.mes, p.ano)}).` }
        destinos.push({ empresa: l.empresa, valor: num(l.v), ...(p.mes ? { mes: p.mes, ano: p.ano } : {}) })
      }
    }
    return { destinos }
  }

  const enviar = async (simular: boolean) => {
    const m = montar()
    if (!m.destinos) { setErro(m.erro ?? ''); return }
    setBusy(true); setErro('')
    const { plano: p, erro: e } = await solicitarRealocacao(mod, pedido.id, modo, m.destinos, usuario, obs, simular)
    setBusy(false)
    if (e || !p) { setErro(e ?? 'Não foi possível concluir.'); return }
    if (simular || !p.ok) { setPlano(p); return }
    onDone(p)
  }

  // prévia: valor por centro e período
  const previa = useMemo(() => {
    const m = new Map<string, { empresa: string; mes: number | null; ano: number | null; valor: number }>()
    for (const i of plano?.depois ?? []) {
      const k = `${i.empresa}|${i.mes}|${i.ano}`
      m.set(k, { empresa: i.empresa, mes: i.mes, ano: i.ano, valor: (m.get(k)?.valor ?? 0) + Number(i.valor) })
    }
    return [...m.values()].sort((a, b) => (a.ano ?? 0) - (b.ano ?? 0) || (a.mes ?? 0) - (b.mes ?? 0) || a.empresa.localeCompare(b.empresa))
  }, [plano])

  // função (e não componente interno): evita remontar o select a cada digitação
  const centro = (value: string, onChange: (v: string) => void) => (
    <select className="input flex-1 min-w-0" value={value} onChange={e => onChange(e.target.value)}>
      <option value="">Centro de custo...</option>
      {empresas.map(e => <option key={e.nome} value={e.nome}>{e.nome}{e.temCategoria ? '' : ' — sem a categoria'}</option>)}
    </select>
  )

  return (
    <Modal open onClose={onClose} title={`Realocar centro de custo — Pedido #${pedido.id}`} size="lg">
      <div className="space-y-4 text-sm">
        <p className="text-slate-600">
          A realocação vale para o <strong>pedido inteiro</strong>{nContas ? ` (${nContas} conta${nContas > 1 ? 's' : ''})` : ''} e mantém a categoria{' '}
          <strong>{pedido.categoria}</strong>. O {t.parteRotulo.toLowerCase()} e os pagamentos não mudam; só a apropriação do orçamento.
        </p>

        <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
          <p className="text-xs text-slate-400 mb-1">Distribuição atual</p>
          {atual.map(([e, v]) => <p key={e}>{e} — <span className="font-medium">{fmtMoeda(v)}</span></p>)}
        </div>

        <div className="flex rounded-lg border border-slate-200 overflow-hidden w-fit">
          {(['percentual', 'valor'] as const).map(m => (
            <button key={m} onClick={() => { setModo(m); mudou() }}
              className={`px-4 py-1.5 ${modo === m ? 'bg-slate-800 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}>
              {m === 'percentual' ? 'Por percentual' : 'Por valor'}
            </button>
          ))}
        </div>

        {modo === 'percentual' ? (
          <div className="space-y-2">
            <p className="text-xs text-slate-500">A mesma proporção vale para cada mês do pedido. O total deve ser 100%.</p>
            {pct.map((l, i) => (
              <div key={i} className="flex gap-2 items-center">
                {centro(l.empresa, v => setLinhaPct(i, { empresa: v }))}
                <input className="input w-24 text-right" placeholder="%" value={l.v} onChange={e => setLinhaPct(i, { v: e.target.value })} />
                <button onClick={() => { mudou(); setPct(x => x.filter((_, j) => j !== i)) }} className="p-1.5 text-slate-400 hover:text-red-500" title="Remover"><Trash2 size={14} /></button>
              </div>
            ))}
            <div className="flex items-center justify-between">
              <button onClick={() => { mudou(); setPct(x => [...x, { empresa: '', v: '' }]) }} className="text-blue-600 text-xs inline-flex items-center gap-1"><Plus size={12} /> Adicionar centro</button>
              <span className={`text-xs font-medium ${Math.abs(somaPct - 100) < 0.0001 ? 'text-green-700' : 'text-red-600'}`}>Total: {somaPct.toLocaleString('pt-BR')}%</span>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-slate-500">
              {periodos[0]?.mes ? 'Em cada mês, a soma dos valores deve ser igual ao valor do pedido naquele mês.' : 'A soma dos valores deve ser igual ao valor do pedido.'}
            </p>
            {periodos.map(p => {
              const k = chave(p), resto = p.total - distribuido(p)
              return (
                <div key={k} className="border border-slate-200 rounded-lg p-3 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-slate-700">{periodoLabel(p.mes, p.ano)} — {fmtMoeda(p.total)}</span>
                    <span className={Math.abs(resto) < 0.005 ? 'text-green-700 font-medium' : 'text-red-600 font-medium'}>
                      {Math.abs(resto) < 0.005 ? 'Fechado' : `Faltam ${fmtMoeda(resto)}`}
                    </span>
                  </div>
                  {(val[k] ?? []).map((l, i) => (
                    <div key={i} className="flex gap-2 items-center">
                      {centro(l.empresa, v => setLinhaVal(k, i, { empresa: v }))}
                      <input className="input w-36 text-right" placeholder="Valor" value={l.v} onChange={e => setLinhaVal(k, i, { v: e.target.value })} />
                      <button onClick={() => { mudou(); setVal(m => ({ ...m, [k]: m[k].filter((_, j) => j !== i) })) }} className="p-1.5 text-slate-400 hover:text-red-500" title="Remover"><Trash2 size={14} /></button>
                    </div>
                  ))}
                  <button onClick={() => { mudou(); setVal(m => ({ ...m, [k]: [...(m[k] ?? []), { empresa: '', v: '' }] })) }} className="text-blue-600 text-xs inline-flex items-center gap-1"><Plus size={12} /> Adicionar centro</button>
                </div>
              )
            })}
          </div>
        )}

        <div>
          <label className="label">Observação (opcional)</label>
          <textarea className="input w-full min-h-[60px] resize-none" value={obs} onChange={e => setObs(e.target.value)} placeholder="Motivo da realocação..." />
        </div>

        {erro && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 flex gap-2"><XCircle size={16} className="shrink-0 mt-0.5" /><span>{erro}</span></div>}

        {plano && plano.problemas.length > 0 && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg space-y-1">
            <p className="font-semibold text-red-700 flex items-center gap-1.5"><XCircle size={15} /> Não é possível realocar — corrija os pontos abaixo:</p>
            <ul className="list-disc pl-5 text-red-700 space-y-0.5">{plano.problemas.map((p, i) => <li key={i}>{p.mensagem}</li>)}</ul>
          </div>
        )}
        {plano && plano.avisos.length > 0 && (
          <div className="p-3 bg-orange-50 border border-orange-200 rounded-lg space-y-1">
            <p className="font-semibold text-orange-700 flex items-center gap-1.5"><AlertTriangle size={15} /> Atenção: este fluxo não bloqueia por saldo, mas o orçamento ficará assim:</p>
            <ul className="list-disc pl-5 text-orange-700 space-y-0.5">{plano.avisos.map((p, i) => <li key={i}>{p.mensagem}</li>)}</ul>
          </div>
        )}
        {plano?.ok && (
          <div className="p-3 bg-green-50 border border-green-200 rounded-lg space-y-2">
            <p className="font-semibold text-green-700">
              {plano.direta ? 'Será aplicada na hora, sem autorização.' : 'Ficará aguardando autorização, com o saldo do destino reservado.'}
            </p>
            <table className="w-full text-xs">
              <thead><tr className="text-left text-slate-500"><th className="py-1">Centro de custo</th><th>Período</th><th className="text-right">Valor</th></tr></thead>
              <tbody>
                {previa.map((r, i) => (
                  <tr key={i} className="border-t border-green-100">
                    <td className="py-1">{r.empresa}</td><td>{periodoLabel(r.mes, r.ano)}</td><td className="text-right font-medium">{fmtMoeda(r.valor)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose} className="btn-secondary" disabled={busy}>Cancelar</button>
          <button onClick={() => enviar(true)} className="btn-secondary" disabled={busy}>{busy && !plano ? 'Calculando...' : 'Calcular prévia'}</button>
          <button onClick={() => enviar(false)} disabled={busy || !plano?.ok} className="btn-primary disabled:opacity-40">
            {busy && plano ? 'Enviando...' : plano?.direta ? 'Realocar agora' : 'Solicitar realocação'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
