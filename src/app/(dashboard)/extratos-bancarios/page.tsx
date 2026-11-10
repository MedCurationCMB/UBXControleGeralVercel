'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { Upload, Loader2, Landmark } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'

interface ExtratoResumo {
  id: number
  conta: string
  periodo_inicio: string
  periodo_fim: string
  saldo_inicial: number | null
  saldo_final: number | null
  formato_origem: string
  nome_arquivo: string
  criado_em: string
}

interface Lancamento {
  id?: number
  data: string
  descricao: string
  valor: number
  saldo_apos: number | null
  codigo_origem: string | null
  tipo?: 'pagar' | 'receber'
  vinculo?: { tipo: 'pagar' | 'receber'; contas: { conta_id: number; parte: string; valor: number }[] } | null
  candidatos?: Candidato[]
}

interface Candidato {
  id: number
  parte: string
  empresa: string
  data_vencimento: string | null
  data_pagamento: string | null
  valor: number
  sugerido: boolean
}

const cents = (n: number) => Math.round(n * 100)
const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const dataBr = (iso: string) => iso.slice(8, 10) + '/' + iso.slice(5, 7) + '/' + iso.slice(0, 4)
const rotuloConta = (tipo?: string) => (tipo === 'receber' ? 'Receber' : 'Pagar')

export default function ExtratosBancariosPage() {
  const [extratos, setExtratos] = useState<ExtratoResumo[]>([])
  const [selecionadoId, setSelecionadoId] = useState<number | null>(null)
  const [lancamentos, setLancamentos] = useState<Lancamento[]>([])
  const [enviando, setEnviando] = useState(false)
  const [carregandoLista, setCarregandoLista] = useState(true)
  const [mensagem, setMensagem] = useState<{ tipo: 'erro' | 'aviso'; texto: string } | null>(null)
  const [modal, setModal] = useState<Lancamento | null>(null)
  const [aba, setAba] = useState<'sem' | 'com' | 'todos'>('sem')
  const inputRef = useRef<HTMLInputElement>(null)

  const carregarLista = useCallback(async () => {
    setCarregandoLista(true)
    const r = await fetch('/api/extratos-bancarios')
    const d = await r.json().catch(() => ({}))
    if (r.ok) setExtratos(d.extratos ?? [])
    setCarregandoLista(false)
  }, [])

  useEffect(() => { carregarLista() }, [carregarLista])

  const abrirExtrato = useCallback(async (id: number) => {
    setSelecionadoId(id)
    const r = await fetch(`/api/extratos-bancarios/${id}`)
    const d = await r.json().catch(() => ({}))
    if (r.ok) setLancamentos(d.lancamentos ?? [])
  }, [])

  const handleUpload = async (file: File) => {
    setEnviando(true)
    setMensagem(null)
    const form = new FormData()
    form.append('file', file)
    const r = await fetch('/api/extratos-bancarios', { method: 'POST', body: form })
    const d = await r.json().catch(() => ({}))
    setEnviando(false)
    if (!r.ok) {
      setMensagem({ tipo: d.duplicado ? 'aviso' : 'erro', texto: d.error ?? 'Erro ao importar o extrato' })
      return
    }
    await abrirExtrato(d.extrato.id)
    await carregarLista()
  }

  const vincular = async (l: Lancamento, contaIds: number[]) => {
    setMensagem(null)
    const r = await fetch('/api/extratos-bancarios/vinculos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lancamento_id: l.id, conta_ids: contaIds }),
    })
    const d = await r.json().catch(() => ({}))
    if (!r.ok) setMensagem({ tipo: 'erro', texto: d.error ?? 'Erro ao vincular' })
    setModal(null)
    if (selecionadoId) await abrirExtrato(selecionadoId)
  }

  const desvincular = async (l: Lancamento) => {
    await fetch('/api/extratos-bancarios/vinculos', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lancamento_id: l.id }),
    })
    if (selecionadoId) await abrirExtrato(selecionadoId)
  }

  const semVinculo = lancamentos.filter(l => !l.vinculo).length
  const abas = [
    { id: 'sem', rotulo: 'Sem vínculo', qtd: semVinculo },
    { id: 'com', rotulo: 'Vinculados', qtd: lancamentos.length - semVinculo },
    { id: 'todos', rotulo: 'Todos', qtd: lancamentos.length },
  ] as const
  const visiveis = lancamentos.filter(l => aba === 'todos' || !l.vinculo === (aba === 'sem'))

  const graficoDiario = useMemo(() => {
    const porDia = new Map<string, { entradas: number; saidas: number }>()
    for (const l of lancamentos) {
      const atual = porDia.get(l.data) ?? { entradas: 0, saidas: 0 }
      if (l.valor >= 0) atual.entradas += l.valor
      else atual.saidas += Math.abs(l.valor)
      porDia.set(l.data, atual)
    }
    return [...porDia.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([data, v]) => ({ rotulo: dataBr(data).slice(0, 5), Entradas: v.entradas, Saídas: v.saidas }))
  }, [lancamentos])

  return (
    <div className="space-y-5">
      <div>
        <h1 className="page-title">Extratos Bancários</h1>
        <p className="page-subtitle">Envie o extrato exportado do banco (CSV, OFX ou TXT) para guardar os lançamentos e ver tabela e gráfico.</p>
      </div>

      <div className="card p-5 space-y-3">
        <input
          ref={inputRef}
          type="file"
          accept=".csv,.ofx,.txt"
          className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) handleUpload(f); e.target.value = '' }}
        />
        <button onClick={() => inputRef.current?.click()} disabled={enviando} className="btn-primary">
          {enviando ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
          {enviando ? 'Enviando...' : 'Enviar extrato (.csv, .ofx ou .txt)'}
        </button>
        {mensagem && (
          <p className={`text-sm ${mensagem.tipo === 'erro' ? 'text-red-600' : 'text-amber-600'}`}>{mensagem.texto}</p>
        )}
      </div>

      <div className="card p-5">
        <p className="text-sm font-medium text-slate-700 mb-3">Extratos importados</p>
        {carregandoLista ? (
          <p className="text-sm text-slate-400">Carregando...</p>
        ) : extratos.length === 0 ? (
          <p className="text-sm text-slate-400">Nenhum extrato importado ainda.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-500 border-b border-slate-100">
                  <th className="table-cell font-medium">Conta</th>
                  <th className="table-cell font-medium">Período</th>
                  <th className="table-cell font-medium">Formato</th>
                  <th className="table-cell font-medium text-right">Saldo final</th>
                </tr>
              </thead>
              <tbody>
                {extratos.map(e => (
                  <tr
                    key={e.id}
                    onClick={() => abrirExtrato(e.id)}
                    className={`table-row cursor-pointer ${selecionadoId === e.id ? 'bg-blue-50' : ''}`}
                  >
                    <td className="table-cell">{e.conta}</td>
                    <td className="table-cell">{dataBr(e.periodo_inicio)} a {dataBr(e.periodo_fim)}</td>
                    <td className="table-cell">{e.formato_origem}</td>
                    <td className="table-cell text-right">{e.saldo_final != null ? brl(e.saldo_final) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {selecionadoId && lancamentos.length > 0 && (
        <>
          <div className="card p-5">
            <p className="text-sm font-medium text-slate-700 mb-2">Entradas x Saídas por dia</p>
            <div style={{ width: '100%', height: 260 }}>
              <ResponsiveContainer>
                <BarChart data={graficoDiario} barGap={2}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="rotulo" tick={{ fontSize: 12 }} />
                  <YAxis tickFormatter={v => brl(Number(v))} tick={{ fontSize: 11 }} width={80} />
                  <Tooltip formatter={v => brl(Number(v))} />
                  <Legend />
                  <Bar dataKey="Entradas" fill="#16a34a" />
                  <Bar dataKey="Saídas" fill="#dc2626" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="card p-5">
            <p className="text-sm font-medium text-slate-700 mb-2 flex items-center gap-2">
              <Landmark size={16} /> Lançamentos
            </p>
            <div className="flex gap-2 mb-3">
              {abas.map(a => (
                <button
                  key={a.id}
                  onClick={() => setAba(a.id)}
                  className={`text-sm px-3 py-1 rounded-full border ${aba === a.id ? 'bg-blue-50 border-blue-300 text-blue-700' : 'border-slate-200 text-slate-500 hover:bg-slate-50'}`}
                >
                  {a.rotulo} ({a.qtd})
                </button>
              ))}
            </div>
            <div className="max-h-[70vh] overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-white">
                <tr className="text-left text-slate-500 border-b border-slate-100">
                  <th className="table-cell font-medium">Data</th>
                  <th className="table-cell font-medium">Descrição</th>
                  <th className="table-cell font-medium text-right">Valor</th>
                  <th className="table-cell font-medium text-right">Saldo após</th>
                  <th className="table-cell font-medium">Vínculo</th>
                </tr>
              </thead>
              <tbody>
                {visiveis.length === 0 && (
                  <tr><td colSpan={5} className="table-cell text-slate-400">Nenhum lançamento nesta aba.</td></tr>
                )}
                {visiveis.map((l, i) => (
                  <tr key={l.id ?? i} className="table-row">
                    <td className="table-cell whitespace-nowrap">{dataBr(l.data)}</td>
                    <td className="table-cell max-w-xs truncate" title={l.descricao}>{l.descricao}</td>
                    <td className={`table-cell text-right whitespace-nowrap ${l.valor < 0 ? 'text-red-600' : 'text-green-700'}`}>{brl(l.valor)}</td>
                    <td className="table-cell text-right whitespace-nowrap">{l.saldo_apos != null ? brl(l.saldo_apos) : '—'}</td>
                    <td className="table-cell min-w-56">
                      {l.vinculo ? (
                        <span className="text-green-700 block">
                          {l.vinculo.contas.length === 1 ? (
                            <>{rotuloConta(l.vinculo.tipo)} #{l.vinculo.contas[0].conta_id} · {l.vinculo.contas[0].parte}{' '}</>
                          ) : (
                            <details className="inline-block align-top">
                              <summary className="cursor-pointer">{rotuloConta(l.vinculo.tipo)} · {l.vinculo.contas.length} contas</summary>
                              <ul className="text-xs text-slate-600 mt-1 space-y-0.5">
                                {l.vinculo.contas.map(c => <li key={c.conta_id}>#{c.conta_id} · {c.parte} · {brl(c.valor)}</li>)}
                              </ul>
                            </details>
                          )}{' '}
                          <button onClick={() => desvincular(l)} title={l.vinculo.contas.length > 1 ? 'Solta todas as contas desta linha' : undefined} className="text-slate-400 hover:text-red-500 underline">
                            {l.vinculo.contas.length > 1 ? 'desvincular tudo' : 'desvincular'}
                          </button>
                        </span>
                      ) : (
                        <span className="text-amber-600 block">
                          {l.candidatos?.[0]?.sugerido && (
                            <>
                              Sugestão: #{l.candidatos[0].id} · {l.candidatos[0].parte}<br />
                              <button onClick={() => vincular(l, [l.candidatos![0].id])} className="text-blue-600 underline mr-2">confirmar</button>
                            </>
                          )}
                          <button onClick={() => setModal(l)} className="text-blue-600 underline">vincular...</button>
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </div>
        </>
      )}

      {modal && <VincularGrupoModal l={modal} onClose={() => setModal(null)} onConfirmar={ids => vincular(modal, ids)} />}
    </div>
  )
}

// Marca as contas do dia até a soma fechar com a linha do extrato (uma conta só é o caso comum; folha e rateio por centro são várias).
function VincularGrupoModal({ l, onClose, onConfirmar }: { l: Lancamento; onClose: () => void; onConfirmar: (ids: number[]) => void }) {
  const [contas, setContas] = useState<Candidato[] | null>(null)
  const [marcadas, setMarcadas] = useState<Set<number>>(new Set())
  const alvo = cents(Math.abs(l.valor))

  useEffect(() => {
    let vivo = true
    fetch(`/api/extratos-bancarios/vinculos?lancamento_id=${l.id}`)
      .then(r => r.json())
      .then(d => {
        if (!vivo) return
        const lista: Candidato[] = d.contas ?? []
        const unica = lista.filter(c => cents(c.valor) === alvo)
        setContas(lista)
        // pré-marca: o dia inteiro quando a soma já fecha (folha); senão a única conta com o valor da linha
        setMarcadas(new Set(lista.reduce((s, c) => s + cents(c.valor), 0) === alvo ? lista.map(c => c.id) : unica.length === 1 ? [unica[0].id] : []))
      })
      .catch(() => { if (vivo) setContas([]) })
    return () => { vivo = false }
  }, [l.id, alvo])

  const marcado = (contas ?? []).filter(c => marcadas.has(c.id)).reduce((s, c) => s + cents(c.valor), 0)
  const diferenca = alvo - marcado
  const alternar = (id: number) => setMarcadas(prev => { const n = new Set(prev); if (!n.delete(id)) n.add(id); return n })

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-lg max-w-2xl w-full p-6 space-y-3" onClick={e => e.stopPropagation()}>
        <p className="font-semibold text-slate-900">
          Vincular contas a {rotuloConta(l.tipo).toLowerCase()} — {dataBr(l.data)} · {brl(l.valor)}
        </p>
        <p className="text-xs text-slate-500 truncate" title={l.descricao}>{l.descricao}</p>
        {contas === null ? (
          <p className="text-sm text-slate-400">Carregando...</p>
        ) : contas.length === 0 ? (
          <p className="text-sm text-slate-500">Nenhuma conta sem vínculo para esta linha. Confira se a data de pagamento das contas é {dataBr(l.data)}; se estiver diferente, ajuste-a e tente de novo.</p>
        ) : (
          <>
            <p className="text-xs text-slate-500">
              Marque as contas que formam esta linha do banco. O botão libera quando a soma marcada fecha com o valor.{' '}
              <button onClick={() => setMarcadas(new Set(contas.map(c => c.id)))} className="text-blue-600 underline">marcar todas</button>{' · '}
              <button onClick={() => setMarcadas(new Set())} className="text-blue-600 underline">limpar</button>
            </p>
            <div className="max-h-[45vh] overflow-auto border border-slate-100 rounded">
              <table className="w-full text-sm">
                <tbody>
                  {contas.map(c => (
                    <tr key={c.id} className="table-row cursor-pointer" onClick={() => alternar(c.id)}>
                      <td className="table-cell w-8"><input type="checkbox" checked={marcadas.has(c.id)} onChange={() => alternar(c.id)} onClick={e => e.stopPropagation()} /></td>
                      <td className="table-cell">#{c.id}</td>
                      <td className="table-cell">{c.parte}<span className="block text-xs text-slate-400">{c.empresa}</span></td>
                      <td className="table-cell whitespace-nowrap text-xs text-slate-500">
                        {c.data_pagamento ? `pago ${dataBr(c.data_pagamento)}` : c.data_vencimento ? `venc. ${dataBr(c.data_vencimento)}` : 'sem data'}
                      </td>
                      <td className="table-cell text-right whitespace-nowrap">{brl(c.valor)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className={`text-sm ${diferenca === 0 && marcadas.size ? 'text-green-700' : 'text-slate-700'}`}>
              {marcadas.size} conta(s) · marcado {brl(marcado / 100)} de {brl(alvo / 100)} ·{' '}
              {diferenca === 0 && marcadas.size ? 'soma fechada' : `diferença ${brl(diferenca / 100)}`}
            </p>
          </>
        )}
        <div className="flex gap-2">
          {contas && contas.length > 0 && (
            <button onClick={() => onConfirmar([...marcadas])} disabled={diferenca !== 0 || marcadas.size === 0} className="btn-primary">
              Vincular {marcadas.size > 1 ? `${marcadas.size} contas` : 'conta'}
            </button>
          )}
          <button onClick={onClose} className="btn-secondary">Fechar</button>
        </div>
      </div>
    </div>
  )
}
