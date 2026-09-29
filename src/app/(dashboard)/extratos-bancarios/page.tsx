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
}

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const dataBr = (iso: string) => iso.slice(8, 10) + '/' + iso.slice(5, 7) + '/' + iso.slice(0, 4)

export default function ExtratosBancariosPage() {
  const [extratos, setExtratos] = useState<ExtratoResumo[]>([])
  const [selecionadoId, setSelecionadoId] = useState<number | null>(null)
  const [lancamentos, setLancamentos] = useState<Lancamento[]>([])
  const [enviando, setEnviando] = useState(false)
  const [carregandoLista, setCarregandoLista] = useState(true)
  const [mensagem, setMensagem] = useState<{ tipo: 'erro' | 'aviso'; texto: string } | null>(null)
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
    setLancamentos(d.lancamentos)
    setSelecionadoId(d.extrato.id)
    await carregarLista()
  }

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
                    <td className="table-cell uppercase">{e.formato_origem}</td>
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

          <div className="card p-5 overflow-x-auto">
            <p className="text-sm font-medium text-slate-700 mb-2 flex items-center gap-2">
              <Landmark size={16} /> Lançamentos ({lancamentos.length})
            </p>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-500 border-b border-slate-100">
                  <th className="table-cell font-medium">Data</th>
                  <th className="table-cell font-medium">Descrição</th>
                  <th className="table-cell font-medium text-right">Valor</th>
                  <th className="table-cell font-medium text-right">Saldo após</th>
                </tr>
              </thead>
              <tbody>
                {lancamentos.map((l, i) => (
                  <tr key={l.id ?? i} className="table-row">
                    <td className="table-cell whitespace-nowrap">{dataBr(l.data)}</td>
                    <td className="table-cell max-w-md truncate" title={l.descricao}>{l.descricao}</td>
                    <td className={`table-cell text-right whitespace-nowrap ${l.valor < 0 ? 'text-red-600' : 'text-green-700'}`}>{brl(l.valor)}</td>
                    <td className="table-cell text-right whitespace-nowrap">{l.saldo_apos != null ? brl(l.saldo_apos) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
