'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { RefreshCw } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'

interface Bloco {
  orcamento: number; consumido: number; saldo: number
  aPagar: number; pago: number; emAberto: number; atrasadoValor: number; atrasadoQtd: number
  pedidos: Record<string, { qtd: number; valor: number }>
}
interface ProjetoDados { id: number; nome: string; pagamentos: Bloco; recebimentos: Bloco }
interface Mes { mes: string; pagamentos: { orcamento: number; consumido: number; pago: number }; recebimentos: { orcamento: number; consumido: number; pago: number } }
interface Painel {
  projetos: ProjetoDados[]; mensal: Mes[]
  topEmpresas: { pagamentos: { nome: string; consumido: number }[]; recebimentos: { nome: string; consumido: number }[] }
  todosProjetos: { id: number; nome: string; ativo: boolean }[]
}
type Modulo = 'pagamentos' | 'recebimentos'

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const compacto = (v: number) => Math.abs(v) >= 1e6 ? `${(v / 1e6).toFixed(1)} mi` : Math.abs(v) >= 1e3 ? `${(v / 1e3).toFixed(0)} mil` : String(v)
const STATUS = ['Aguardando Autorização', 'Aguardando Ajuste', 'Autorizado', 'Não Autorizado', 'Cancelado']
const ROTULO: Record<Modulo, { titulo: string; quitado: string; aberto: string }> = {
  pagamentos: { titulo: 'Pagamentos', quitado: 'Pago', aberto: 'A pagar em aberto' },
  recebimentos: { titulo: 'Recebimentos', quitado: 'Recebido', aberto: 'A receber em aberto' },
}

function somar(lista: ProjetoDados[], m: Modulo): Bloco {
  const t: Bloco = { orcamento: 0, consumido: 0, saldo: 0, aPagar: 0, pago: 0, emAberto: 0, atrasadoValor: 0, atrasadoQtd: 0, pedidos: {} }
  for (const p of lista) {
    const b = p[m]
    t.orcamento += b.orcamento; t.consumido += b.consumido; t.saldo += b.saldo
    t.aPagar += b.aPagar; t.pago += b.pago; t.emAberto += b.emAberto; t.atrasadoValor += b.atrasadoValor; t.atrasadoQtd += b.atrasadoQtd
    for (const [s, v] of Object.entries(b.pedidos)) {
      const x = (t.pedidos[s] ??= { qtd: 0, valor: 0 }); x.qtd += v.qtd; x.valor += v.valor
    }
  }
  return t
}

function Kpi({ rotulo, valor, tom }: { rotulo: string; valor: string; tom?: 'ruim' | 'bom' }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <p className="text-xs text-slate-500">{rotulo}</p>
      <p className={`text-lg font-semibold mt-0.5 ${tom === 'ruim' ? 'text-red-600' : tom === 'bom' ? 'text-green-700' : 'text-slate-900'}`}>{valor}</p>
    </div>
  )
}

export default function RelatoriosPage() {
  const ano = new Date().getFullYear()
  const [de, setDe] = useState(`${ano}-01`)
  const [ate, setAte] = useState(`${ano}-12`)
  const [selecionados, setSelecionados] = useState<number[] | null>(null) // null = todos
  const [dados, setDados] = useState<Painel | null>(null)
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState('')

  const carregar = useCallback(async () => {
    setLoading(true); setErro('')
    const qs = new URLSearchParams({ de, ate })
    if (selecionados) qs.set('projetos', selecionados.join(','))
    const r = await fetch(`/api/relatorios/painel?${qs}`)
    const d = await r.json().catch(() => ({}))
    if (!r.ok) setErro(d.error ?? 'Erro ao carregar')
    else setDados(d)
    setLoading(false)
  }, [de, ate, selecionados])

  useEffect(() => { carregar() }, [carregar])

  const marcados = useMemo(() => new Set(selecionados ?? dados?.todosProjetos.map(p => p.id) ?? []), [selecionados, dados])
  const alternar = (id: number) => {
    const todos = dados?.todosProjetos.map(p => p.id) ?? []
    const atual = new Set(selecionados ?? todos)
    if (atual.has(id)) atual.delete(id); else atual.add(id)
    setSelecionados(atual.size === todos.length ? null : [...atual])
  }

  const mensal = useMemo(() => (dados?.mensal ?? []).map(m => ({ ...m, rotulo: `${m.mes.slice(5)}/${m.mes.slice(2, 4)}` })), [dados])

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="page-title">Relatórios</h1>
          <p className="page-subtitle">Visão consolidada de todos os projetos (só owner)</p>
        </div>
        <button onClick={carregar} className="btn-secondary p-2" title="Atualizar"><RefreshCw size={16} className={loading ? 'animate-spin' : ''} /></button>
      </div>

      <div className="card">
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label className="label">De</label>
            <input type="month" className="input" value={de} onChange={e => e.target.value && setDe(e.target.value)} />
          </div>
          <div>
            <label className="label">Até</label>
            <input type="month" className="input" value={ate} onChange={e => e.target.value && setAte(e.target.value)} />
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {(dados?.todosProjetos ?? []).map(p => (
              <label key={p.id} className="flex items-center gap-1.5 text-sm text-slate-700 cursor-pointer">
                <input type="checkbox" className="accent-blue-600" checked={marcados.has(p.id)} onChange={() => alternar(p.id)} />
                {p.nome}{!p.ativo && <span className="text-xs text-slate-400">(desativado)</span>}
              </label>
            ))}
          </div>
        </div>
        {de > ate && <p className="text-sm text-red-600 mt-2">A data inicial deve ser anterior à final.</p>}
      </div>

      {erro && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{erro}</div>}
      {loading && !dados && <div className="card text-center py-12 text-slate-400">Carregando...</div>}

      {dados && (['pagamentos', 'recebimentos'] as Modulo[]).map(m => {
        const tot = somar(dados.projetos, m)
        const r = ROTULO[m]
        return (
          <section key={m} className={`space-y-3 ${loading ? 'opacity-60' : ''}`}>
            <h2 className="text-base font-semibold text-slate-800">{r.titulo}</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
              <Kpi rotulo="Orçamento" valor={brl(tot.orcamento)} />
              <Kpi rotulo="Consumido (pedidos)" valor={brl(tot.consumido)} />
              <Kpi rotulo="Saldo do orçamento" valor={brl(tot.saldo)} tom={tot.saldo < 0 ? 'ruim' : undefined} />
              <Kpi rotulo={`${r.quitado} (vencimentos no período)`} valor={brl(tot.pago)} tom="bom" />
              <Kpi rotulo={r.aberto} valor={brl(tot.emAberto)} />
              <Kpi rotulo={`Atrasado (${tot.atrasadoQtd})`} valor={brl(tot.atrasadoValor)} tom={tot.atrasadoValor > 0 ? 'ruim' : undefined} />
            </div>

            <div className="card">
              <p className="text-sm font-medium text-slate-700 mb-2">Por mês</p>
              <div style={{ width: '100%', height: 260 }}>
                <ResponsiveContainer>
                  <BarChart data={mensal.map(x => ({ rotulo: x.rotulo, Orçamento: x[m].orcamento, Consumido: x[m].consumido, [r.quitado]: x[m].pago }))} barGap={2}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="rotulo" tick={{ fontSize: 12 }} />
                    <YAxis tickFormatter={compacto} tick={{ fontSize: 12 }} width={60} />
                    <Tooltip formatter={(v) => brl(Number(v))} />
                    <Legend />
                    <Bar dataKey="Orçamento" fill="#94a3b8" />
                    <Bar dataKey="Consumido" fill="#3b82f6" />
                    <Bar dataKey={r.quitado} fill="#16a34a" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="card overflow-x-auto">
              <p className="text-sm font-medium text-slate-700 mb-2">Por projeto</p>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-slate-500 border-b border-slate-100">
                    <th className="table-cell font-medium">Projeto</th>
                    <th className="table-cell font-medium text-right">Orçamento</th>
                    <th className="table-cell font-medium text-right">Consumido</th>
                    <th className="table-cell font-medium text-right">Saldo</th>
                    <th className="table-cell font-medium text-right">{r.quitado}</th>
                    <th className="table-cell font-medium text-right">Em aberto</th>
                    <th className="table-cell font-medium text-right">Atrasado</th>
                    {STATUS.map(s => <th key={s} className="table-cell font-medium text-right whitespace-nowrap">{s.replace('Aguardando ', 'Aguard. ')}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {dados.projetos.map(p => {
                    const b = p[m]
                    return (
                      <tr key={p.id} className="border-b border-slate-50">
                        <td className="table-cell font-medium text-slate-800">{p.nome}</td>
                        <td className="table-cell text-right">{brl(b.orcamento)}</td>
                        <td className="table-cell text-right">{brl(b.consumido)}</td>
                        <td className={`table-cell text-right ${b.saldo < 0 ? 'text-red-600' : ''}`}>{brl(b.saldo)}</td>
                        <td className="table-cell text-right">{brl(b.pago)}</td>
                        <td className="table-cell text-right">{brl(b.emAberto)}</td>
                        <td className={`table-cell text-right ${b.atrasadoValor > 0 ? 'text-red-600' : ''}`}>{brl(b.atrasadoValor)} <span className="text-xs text-slate-400">({b.atrasadoQtd})</span></td>
                        {STATUS.map(s => <td key={s} className="table-cell text-right text-slate-600">{b.pedidos[s]?.qtd ?? 0}</td>)}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              <p className="text-xs text-slate-400 mt-2">
                Colunas de status = quantidade de pedidos solicitados no período. {r.quitado}/em aberto/atrasado seguem o vencimento das parcelas no período.
              </p>
            </div>

            {dados.topEmpresas[m].length > 0 && (
              <div className="card">
                <p className="text-sm font-medium text-slate-700 mb-2">Maiores consumos por centro de custo</p>
                <table className="w-full text-sm">
                  <tbody>
                    {dados.topEmpresas[m].map(e => {
                      const max = dados.topEmpresas[m][0].consumido
                      return (
                        <tr key={e.nome} className="border-b border-slate-50">
                          <td className="table-cell w-1/2 truncate max-w-0 text-slate-700">{e.nome}</td>
                          <td className="table-cell">
                            <div className="h-2 rounded bg-blue-100"><div className="h-2 rounded bg-blue-500" style={{ width: `${Math.max(2, (e.consumido / max) * 100)}%` }} /></div>
                          </td>
                          <td className="table-cell text-right whitespace-nowrap">{brl(e.consumido)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )
      })}
    </div>
  )
}
