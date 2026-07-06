'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabaseBrowser as supabase } from '@/lib/supabase/client'
import { X, Download, Upload, RefreshCw, AlertTriangle, CheckCircle, FileText, Info } from 'lucide-react'

// ─── Types ──────────────────────────────────────────────────────────────────

interface ContaPagador {
  id: number; nome_empresa: string
}

interface Fornecedor {
  nome: string; chave_pix: string | null; cnpj_cpf: string | null; tipo_chave: number | null
}

interface TipoChave { id: number; tipo: string }

interface PagamentoRow {
  id: number; pedido_id: number | null
  data_vencimento: string | null; valor_pagar: number | null
  tipo_pagamento: number | null; status_pagamento: number | null
  empresa: string; fornecedor: string; categoria: string
}

interface PreviewRow {
  pagamento_id: number; pedido_id: number | null; fornecedor: string; empresa: string
  data_pagamento: string; valor_pagamento: number; tipo_pagamento: number
  forma_iniciacao: string; tipo_doc_fav: string; doc_fav: string; chave_pix: string
  doc_empresa: string
}

interface ParsedRecord {
  docEmpresa: string; dataPagamento: string; valorNominal: number
  dataEfetivacao: string; valorEfetivo: number; ocorrencia: string
  status: 'Pago' | 'Não Pago'
}

interface ArquivoDoc {
  id: number; nome: string; tipo: string; file_id: string; data_upload: string
}

// ─── Helpers ────────────────────────────────────────────────────────────────

const FORMA_INICIACAO_MAP: Record<string, string> = {
  telefone: '01', celular: '01', email: '02', 'e-mail': '02',
  cpf: '03', cnpj: '03', 'cpf/cnpj': '03',
  aleatoria: '04', aleatória: '04', 'chave aleatoria': '04', 'chave aleatória': '04',
  'dados bancarios': '05', 'dados bancários': '05',
}

const FORMA_OPTIONS = [
  { code: '01', label: '01 - Telefone' },
  { code: '02', label: '02 - E-mail' },
  { code: '03', label: '03 - CPF/CNPJ' },
  { code: '04', label: '04 - Chave Aleatória' },
  { code: '05', label: '05 - Dados Bancários' },
]

const fmtMoeda = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const fmtData = (d: string | null | undefined) =>
  d ? new Date(d + 'T12:00:00').toLocaleDateString('pt-BR') : '-'

function getFormaIniciacao(tipoChaveId: number | null, tiposChaveMap: Record<number, string>): string {
  if (!tipoChaveId) return '03'
  const nome = (tiposChaveMap[tipoChaveId] ?? '').toLowerCase().trim()
  return FORMA_INICIACAO_MAP[nome] ?? '03'
}

function cleanDoc(doc: string | null | undefined): string {
  return String(doc ?? '').replace(/\D/g, '')
}

function getTipoDocFav(cnpjCpf: string | null): string {
  return cleanDoc(cnpjCpf).length <= 11 ? '1' : '2'
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function RemessaRetornoModal({ onClose, onUpdated }: {
  onClose: () => void; onUpdated: () => void
}) {
  const [tab, setTab] = useState<'remessa' | 'retorno' | 'arquivos'>('remessa')
  const [loading, setLoading] = useState(true)

  // Reference data
  const [contas, setContas] = useState<ContaPagador[]>([])
  const [fornecedoresMap, setFornecedoresMap] = useState<Record<string, Fornecedor>>({})
  const [tiposChaveMap, setTiposChaveMap] = useState<Record<number, string>>({})
  const [boletosComAnexo, setBoletosComAnexo] = useState<Set<number>>(new Set())
  const [allPagamentos, setAllPagamentos] = useState<PagamentoRow[]>([])

  // Remessa state
  const [contaId, setContaId] = useState('')
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [filtroEmpresa, setFiltroEmpresa] = useState('')
  const [filtroFornecedor, setFiltroFornecedor] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [previewRows, setPreviewRows] = useState<PreviewRow[] | null>(null)
  const [generating, setGenerating] = useState(false)
  const [geradoNome, setGeradoNome] = useState('')

  // Retorno state
  const [retornoFile, setRetornoFile] = useState<File | null>(null)
  const [retornoParsed, setRetornoParsed] = useState<ParsedRecord[] | null>(null)
  const [importando, setImportando] = useState(false)
  const [retornoMsg, setRetornoMsg] = useState('')
  const [retornoError, setRetornoError] = useState('')

  // Arquivos state
  const [arquivos, setArquivos] = useState<ArquivoDoc[]>([])
  const [arquivosLoading, setArquivosLoading] = useState(false)

  // ─── Load data on open ────────────────────────────────────────────────────

  const loadData = useCallback(async () => {
    setLoading(true)

    const [contasRes, pgRes, fornRes, tiposChaveRes] = await Promise.all([
      supabase.from('conta_pagador').select('id, nome_empresa').order('id'),
      supabase.from('controle_pagamentos')
        .select('id, pedido_id, data_vencimento, valor_pagar, tipo_pagamento, status_pagamento')
        .eq('status_pagamento', 1),
      supabase.from('fornecedores').select('nome, chave_pix, cnpj_cpf, tipo_chave'),
      supabase.from('tipos_chave').select('id, tipo'),
    ])

    setContas(contasRes.data ?? [])
    if (contasRes.data?.[0]) setContaId(String(contasRes.data[0].id))

    const tckMap: Record<number, string> = {}
    for (const tc of tiposChaveRes.data ?? []) tckMap[tc.id] = tc.tipo
    setTiposChaveMap(tckMap)

    const fMap: Record<string, Fornecedor> = {}
    for (const f of fornRes.data ?? []) fMap[f.nome] = f
    setFornecedoresMap(fMap)

    const pgList = pgRes.data ?? []

    // Fetch pedido data for these payments
    const pedidoIds = [...new Set(pgList.filter(p => p.pedido_id).map(p => p.pedido_id as number))]
    const pedidoMap: Record<number, { empresa: string; fornecedor: string; categoria: string }> = {}
    if (pedidoIds.length > 0) {
      const { data: peds } = await supabase
        .from('pedidos_solicitados')
        .select('id, empresa, fornecedor, categoria')
        .in('id', pedidoIds)
      for (const p of peds ?? []) pedidoMap[p.id] = { empresa: p.empresa, fornecedor: p.fornecedor, categoria: p.categoria }
    }

    const enriched: PagamentoRow[] = pgList.map(p => ({
      ...p,
      empresa: p.pedido_id ? pedidoMap[p.pedido_id]?.empresa ?? '' : '',
      fornecedor: p.pedido_id ? pedidoMap[p.pedido_id]?.fornecedor ?? '' : '',
      categoria: p.pedido_id ? pedidoMap[p.pedido_id]?.categoria ?? '' : '',
    }))
    setAllPagamentos(enriched)

    // Check which boleto payments have attachments
    const boletoPayIds = pgList.filter(p => p.tipo_pagamento === 3).map(p => p.id)
    if (boletoPayIds.length > 0) {
      const { data: docs } = await supabase
        .from('documentos')
        .select('pagamento_id')
        .eq('tipo_documento', 4)
        .in('pagamento_id', boletoPayIds)
      setBoletosComAnexo(new Set((docs ?? []).map(d => d.pagamento_id).filter(Boolean)))
    }

    setLoading(false)
  }, [])

  useEffect(() => { loadData() }, [loadData])

  const loadArquivos = useCallback(async () => {
    setArquivosLoading(true)
    const res = await fetch('/api/remessa/arquivos')
    const data = await res.json()
    setArquivos(Array.isArray(data) ? data : [])
    setArquivosLoading(false)
  }, [])

  useEffect(() => {
    if (tab === 'arquivos') loadArquivos()
  }, [tab, loadArquivos])

  // ─── Eligibility ─────────────────────────────────────────────────────────

  const { semPix, semBoleto, manuais, elegiveis } = useMemo(() => {
    const semPix: PagamentoRow[] = []
    const semBoleto: PagamentoRow[] = []
    const manuais: PagamentoRow[] = []
    const inelegivelIds = new Set<number>()

    for (const p of allPagamentos) {
      if (p.tipo_pagamento === 1) {
        const forn = fornecedoresMap[p.fornecedor]
        if (!forn?.chave_pix) { semPix.push(p); inelegivelIds.add(p.id) }
      } else if (p.tipo_pagamento === 3) {
        if (!boletosComAnexo.has(p.id)) { semBoleto.push(p); inelegivelIds.add(p.id) }
      } else {
        manuais.push(p); inelegivelIds.add(p.id)
      }
    }

    const elegiveis = allPagamentos.filter(
      p => !inelegivelIds.has(p.id) && (p.tipo_pagamento === 1 || p.tipo_pagamento === 3)
    )

    return { semPix, semBoleto, manuais, elegiveis }
  }, [allPagamentos, fornecedoresMap, boletosComAnexo])

  // ─── Filtered list for selection ──────────────────────────────────────────

  const empresasOpts = useMemo(() => [...new Set(elegiveis.map(p => p.empresa).filter(Boolean))].sort(), [elegiveis])
  const fornecedoresOpts = useMemo(() => {
    const base = filtroEmpresa ? elegiveis.filter(p => p.empresa === filtroEmpresa) : elegiveis
    return [...new Set(base.map(p => p.fornecedor).filter(Boolean))].sort()
  }, [elegiveis, filtroEmpresa])

  const filteredElegiveis = useMemo(() => {
    let list = elegiveis
    if (filtroEmpresa) list = list.filter(p => p.empresa === filtroEmpresa)
    if (filtroFornecedor) list = list.filter(p => p.fornecedor === filtroFornecedor)
    if (dateFrom) list = list.filter(p => p.data_vencimento && p.data_vencimento >= dateFrom)
    if (dateTo) list = list.filter(p => p.data_vencimento && p.data_vencimento <= dateTo)
    return list
  }, [elegiveis, filtroEmpresa, filtroFornecedor, dateFrom, dateTo])

  const allSelected = filteredElegiveis.length > 0 && filteredElegiveis.every(p => selected.has(p.id))
  const toggleAll = () => {
    if (allSelected) setSelected(prev => { const n = new Set(prev); filteredElegiveis.forEach(p => n.delete(p.id)); return n })
    else setSelected(prev => { const n = new Set(prev); filteredElegiveis.forEach(p => n.add(p.id)); return n })
  }
  const toggle = (id: number) => setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })

  // ─── Build preview ────────────────────────────────────────────────────────

  const buildPreview = () => {
    const rows: PreviewRow[] = []
    for (const id of selected) {
      const p = elegiveis.find(e => e.id === id)
      if (!p) continue
      const forn = fornecedoresMap[p.fornecedor] ?? {}
      const forma = getFormaIniciacao(forn.tipo_chave ?? null, tiposChaveMap)
      const docFav = cleanDoc(forn.cnpj_cpf)
      rows.push({
        pagamento_id: p.id,
        pedido_id: p.pedido_id,
        fornecedor: p.fornecedor,
        empresa: p.empresa,
        data_pagamento: p.data_vencimento ?? new Date().toISOString().split('T')[0],
        valor_pagamento: p.valor_pagar ?? 0,
        tipo_pagamento: p.tipo_pagamento ?? 1,
        forma_iniciacao: forma,
        tipo_doc_fav: getTipoDocFav(forn.cnpj_cpf ?? null),
        doc_fav: docFav,
        chave_pix: forn.chave_pix ?? '',
        doc_empresa: String(p.id),
      })
    }
    setPreviewRows(rows)
  }

  const updatePreviewRow = (idx: number, field: keyof PreviewRow, value: string | number) => {
    setPreviewRows(prev => prev ? prev.map((r, i) => i === idx ? { ...r, [field]: value } : r) : prev)
  }

  // ─── Generate remessa ─────────────────────────────────────────────────────

  const handleGerar = async () => {
    if (!previewRows?.length || !contaId) return
    setGenerating(true)
    try {
      const res = await fetch('/api/remessa/gerar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conta_id: parseInt(contaId),
          transactions: previewRows.map(r => ({
            pagamento_id: r.pagamento_id,
            data_pagamento: r.data_pagamento,
            valor_pagamento: r.valor_pagamento,
            tipo_pagamento: r.tipo_pagamento,
            forma_iniciacao: r.forma_iniciacao,
            tipo_doc_fav: r.tipo_doc_fav,
            doc_fav: r.doc_fav,
            chave_pix: r.chave_pix,
            doc_empresa: r.doc_empresa,
          })),
        }),
      })
      const data = await res.json()
      if (!res.ok || !data.ok) throw new Error(data.error ?? 'Erro ao gerar')

      // Trigger download
      const blob = new Blob([data.file_content], { type: 'text/plain' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = data.file_name; a.click()
      URL.revokeObjectURL(url)

      setGeradoNome(data.file_name)
      setPreviewRows(null)
      setSelected(new Set())
      onUpdated()
      loadData()
    } catch (e) {
      alert(String(e))
    }
    setGenerating(false)
  }

  // ─── Import retorno ───────────────────────────────────────────────────────

  const handleRetornoUpload = async (file: File) => {
    setRetornoFile(file)
    setRetornoParsed(null)
    setRetornoMsg('')
    setRetornoError('')

    const form = new FormData()
    form.append('file', file)
    form.append('parse_only', 'true')

    // Parse client-side by sending to API with a special flag — actually just POST directly
    // We'll preview then confirm
    const buffer = await file.arrayBuffer()
    let text: string
    try { text = new TextDecoder('utf-8').decode(buffer) }
    catch { text = new TextDecoder('latin1').decode(buffer) }

    const records = parseRetClient(text)
    setRetornoParsed(records)
  }

  const handleRetornoImportar = async () => {
    if (!retornoFile) return
    setImportando(true)
    setRetornoMsg('')
    setRetornoError('')
    const form = new FormData()
    form.append('file', retornoFile)
    try {
      const res = await fetch('/api/remessa/importar-retorno', { method: 'POST', body: form })
      const data = await res.json()
      if (!res.ok) { setRetornoError(data.error ?? 'Erro ao importar'); return }
      setRetornoMsg(`${data.updated_count} pagamento(s) atualizados com sucesso!`)
      setRetornoParsed(data.records)
      onUpdated()
    } catch (e) {
      setRetornoError(String(e))
    }
    setImportando(false)
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-5xl max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 shrink-0">
          <h2 className="text-lg font-semibold text-slate-900">Arquivo Remessa / Retorno CNAB 240</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-200 shrink-0 px-6">
          {([['remessa', 'Gerar Remessa'], ['retorno', 'Importar Retorno'], ['arquivos', 'Arquivos']] as const).map(([key, label]) => (
            <button key={key} onClick={() => setTab(key)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${tab === key
                ? 'border-primary-500 text-primary-600'
                : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
              {label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-5">

          {/* ── Tab: Gerar Remessa ──────────────────────────────────────────── */}
          {tab === 'remessa' && (
            <>
              {loading ? (
                <div className="text-center py-12 text-slate-400">Carregando dados...</div>
              ) : (
                <>
                  {/* Elegibilidade */}
                  <div className="space-y-3">
                    <h3 className="text-sm font-semibold text-slate-700">Elegibilidade para Remessa</h3>
                    <p className="text-xs text-slate-500">
                      Para constar no arquivo, o pagamento deve estar com status "À Pagar", ser do tipo PIX ou Boleto,
                      ter chave PIX cadastrada (PIX) ou boleto anexado (Boleto).
                    </p>

                    {semPix.length > 0 && (
                      <div className="border border-amber-200 bg-amber-50 rounded-lg p-3">
                        <div className="flex items-center gap-2 mb-2">
                          <AlertTriangle size={14} className="text-amber-600 shrink-0" />
                          <span className="text-xs font-semibold text-amber-800">{semPix.length} pagamento(s) PIX sem chave PIX cadastrada</span>
                        </div>
                        <div className="text-xs text-amber-700 space-y-0.5">
                          {semPix.slice(0, 5).map(p => (
                            <div key={p.id}>#{p.id} — {p.fornecedor} — {fmtMoeda(p.valor_pagar ?? 0)}</div>
                          ))}
                          {semPix.length > 5 && <div>... e mais {semPix.length - 5}</div>}
                        </div>
                      </div>
                    )}

                    {semBoleto.length > 0 && (
                      <div className="border border-amber-200 bg-amber-50 rounded-lg p-3">
                        <div className="flex items-center gap-2 mb-2">
                          <AlertTriangle size={14} className="text-amber-600 shrink-0" />
                          <span className="text-xs font-semibold text-amber-800">{semBoleto.length} pagamento(s) Boleto sem arquivo anexado</span>
                        </div>
                        <div className="text-xs text-amber-700 space-y-0.5">
                          {semBoleto.slice(0, 5).map(p => (
                            <div key={p.id}>#{p.id} — {p.fornecedor} — {fmtMoeda(p.valor_pagar ?? 0)}</div>
                          ))}
                          {semBoleto.length > 5 && <div>... e mais {semBoleto.length - 5}</div>}
                        </div>
                      </div>
                    )}

                    {manuais.length > 0 && (
                      <div className="border border-slate-200 bg-slate-50 rounded-lg p-3">
                        <div className="flex items-center gap-2 mb-1">
                          <Info size={14} className="text-slate-500 shrink-0" />
                          <span className="text-xs font-semibold text-slate-700">{manuais.length} pagamento(s) com método manual (Dinheiro, Cartão, Indefinido)</span>
                        </div>
                        <p className="text-xs text-slate-500">Esses pagamentos devem ser processados manualmente.</p>
                      </div>
                    )}

                    {semPix.length === 0 && semBoleto.length === 0 && manuais.length === 0 && (
                      <div className="flex items-center gap-2 text-xs text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                        <CheckCircle size={14} /> Todos os pagamentos pendentes estão elegíveis para remessa.
                      </div>
                    )}
                  </div>

                  <hr className="border-slate-200" />

                  {/* Passo 1: Conta pagadora */}
                  <div>
                    <h3 className="text-sm font-semibold text-slate-700 mb-2">Passo 1 — Conta Pagadora</h3>
                    {contas.length === 0 ? (
                      <p className="text-sm text-red-600">Nenhuma conta pagadora cadastrada no sistema.</p>
                    ) : (
                      <select className="input max-w-xs" value={contaId} onChange={e => setContaId(e.target.value)}>
                        {contas.map(c => <option key={c.id} value={c.id}>{c.nome_empresa}</option>)}
                      </select>
                    )}
                  </div>

                  <hr className="border-slate-200" />

                  {/* Passo 2: Selecionar pagamentos */}
                  <div>
                    <h3 className="text-sm font-semibold text-slate-700 mb-2">
                      Passo 2 — Selecionar Pagamentos ({elegiveis.length} elegíveis)
                    </h3>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
                      <select className="input text-xs" value={filtroEmpresa}
                        onChange={e => { setFiltroEmpresa(e.target.value); setFiltroFornecedor('') }}>
                        <option value="">Todas as empresas</option>
                        {empresasOpts.map(e => <option key={e} value={e}>{e}</option>)}
                      </select>
                      <select className="input text-xs" value={filtroFornecedor}
                        onChange={e => setFiltroFornecedor(e.target.value)}>
                        <option value="">Todos os fornecedores</option>
                        {fornecedoresOpts.map(f => <option key={f} value={f}>{f}</option>)}
                      </select>
                      <input type="date" className="input text-xs" value={dateFrom}
                        onChange={e => setDateFrom(e.target.value)} placeholder="Venc. de" />
                      <input type="date" className="input text-xs" value={dateTo}
                        onChange={e => setDateTo(e.target.value)} placeholder="Venc. até" />
                    </div>

                    {filteredElegiveis.length === 0 ? (
                      <p className="text-sm text-slate-400 py-4 text-center">Nenhum pagamento elegível.</p>
                    ) : (
                      <div className="border border-slate-200 rounded-lg overflow-hidden">
                        <div className="overflow-y-auto max-h-64">
                          <table className="w-full text-xs">
                            <thead className="sticky top-0 bg-slate-50">
                              <tr>
                                <th className="table-cell w-8">
                                  <input type="checkbox" className="w-3.5 h-3.5" checked={allSelected} onChange={toggleAll} />
                                </th>
                                <th className="table-cell font-medium text-left">ID / Pedido</th>
                                <th className="table-cell font-medium text-left">Fornecedor</th>
                                <th className="table-cell font-medium text-left">Tipo</th>
                                <th className="table-cell font-medium text-left">Vencimento</th>
                                <th className="table-cell font-medium text-right">Valor</th>
                              </tr>
                            </thead>
                            <tbody>
                              {filteredElegiveis.map(p => (
                                <tr key={p.id}
                                  className={`table-row cursor-pointer ${selected.has(p.id) ? 'bg-blue-50' : ''}`}
                                  onClick={() => toggle(p.id)}>
                                  <td className="table-cell" onClick={e => e.stopPropagation()}>
                                    <input type="checkbox" className="w-3.5 h-3.5" checked={selected.has(p.id)} onChange={() => toggle(p.id)} />
                                  </td>
                                  <td className="table-cell font-mono text-slate-500">#{p.id} / #{p.pedido_id}</td>
                                  <td className="table-cell max-w-[120px] truncate">{p.fornecedor}</td>
                                  <td className="table-cell">
                                    <span className={`badge text-xs ${p.tipo_pagamento === 1 ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600'}`}>
                                      {p.tipo_pagamento === 1 ? 'PIX' : 'Boleto'}
                                    </span>
                                  </td>
                                  <td className="table-cell">{fmtData(p.data_vencimento)}</td>
                                  <td className="table-cell text-right font-medium">{fmtMoeda(p.valor_pagar ?? 0)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        <div className="px-3 py-2 border-t border-slate-100 bg-slate-50 text-xs text-slate-500">
                          {selected.size} selecionado(s) de {filteredElegiveis.length}
                        </div>
                      </div>
                    )}

                    {selected.size > 0 && !previewRows && (
                      <button onClick={buildPreview} className="btn-primary mt-3 text-sm">
                        Visualizar Remessa ({selected.size} pagamentos)
                      </button>
                    )}
                  </div>

                  {/* Passo 3: Preview / edit */}
                  {previewRows && (
                    <>
                      <hr className="border-slate-200" />
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <h3 className="text-sm font-semibold text-slate-700">Passo 3 — Revisar e Editar</h3>
                          <button onClick={() => setPreviewRows(null)} className="text-xs text-slate-400 hover:text-slate-600">
                            ← Voltar à seleção
                          </button>
                        </div>

                        <div className="overflow-x-auto border border-slate-200 rounded-lg">
                          <table className="w-full text-xs">
                            <thead className="bg-slate-50">
                              <tr>
                                <th className="table-cell font-medium">ID</th>
                                <th className="table-cell font-medium">Fornecedor</th>
                                <th className="table-cell font-medium">Tipo</th>
                                <th className="table-cell font-medium">Data Pgto</th>
                                <th className="table-cell font-medium">Valor (R$)</th>
                                <th className="table-cell font-medium">Forma Inic.</th>
                                <th className="table-cell font-medium">Tipo Doc</th>
                                <th className="table-cell font-medium">CPF/CNPJ</th>
                                <th className="table-cell font-medium">Chave PIX</th>
                              </tr>
                            </thead>
                            <tbody>
                              {previewRows.map((r, i) => (
                                <tr key={r.pagamento_id} className="table-row">
                                  <td className="table-cell font-mono text-slate-500">#{r.pagamento_id}</td>
                                  <td className="table-cell max-w-[100px] truncate">{r.fornecedor}</td>
                                  <td className="table-cell">
                                    <span className={`badge text-xs ${r.tipo_pagamento === 1 ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600'}`}>
                                      {r.tipo_pagamento === 1 ? 'PIX' : 'Boleto'}
                                    </span>
                                  </td>
                                  <td className="table-cell">
                                    <input type="date" className="input text-xs py-1 w-32"
                                      value={r.data_pagamento}
                                      onChange={e => updatePreviewRow(i, 'data_pagamento', e.target.value)} />
                                  </td>
                                  <td className="table-cell">
                                    <input type="number" step="0.01" className="input text-xs py-1 w-24"
                                      value={r.valor_pagamento}
                                      onChange={e => updatePreviewRow(i, 'valor_pagamento', parseFloat(e.target.value) || 0)} />
                                  </td>
                                  <td className="table-cell">
                                    {r.tipo_pagamento === 1 ? (
                                      <select className="input text-xs py-1"
                                        value={r.forma_iniciacao}
                                        onChange={e => updatePreviewRow(i, 'forma_iniciacao', e.target.value)}>
                                        {FORMA_OPTIONS.map(o => <option key={o.code} value={o.code}>{o.label}</option>)}
                                      </select>
                                    ) : <span className="text-slate-400">—</span>}
                                  </td>
                                  <td className="table-cell">
                                    {r.tipo_pagamento === 1 ? (
                                      <select className="input text-xs py-1"
                                        value={r.tipo_doc_fav}
                                        onChange={e => updatePreviewRow(i, 'tipo_doc_fav', e.target.value)}>
                                        <option value="1">CPF</option>
                                        <option value="2">CNPJ</option>
                                      </select>
                                    ) : <span className="text-slate-400">—</span>}
                                  </td>
                                  <td className="table-cell">
                                    <input type="text" className="input text-xs py-1 w-36"
                                      value={r.doc_fav}
                                      onChange={e => updatePreviewRow(i, 'doc_fav', e.target.value.replace(/\D/g, ''))} />
                                  </td>
                                  <td className="table-cell">
                                    {r.tipo_pagamento === 1 ? (
                                      <input type="text" className="input text-xs py-1 w-40"
                                        value={r.chave_pix}
                                        onChange={e => updatePreviewRow(i, 'chave_pix', e.target.value)} />
                                    ) : <span className="text-slate-400">—</span>}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>

                        {geradoNome && (
                          <p className="text-sm text-green-600 mt-2">
                            Arquivo <strong>{geradoNome}</strong> gerado e baixado com sucesso.
                          </p>
                        )}

                        <button
                          onClick={handleGerar}
                          disabled={generating || !contaId}
                          className="btn-primary mt-3 gap-2 text-sm">
                          {generating ? <><RefreshCw size={14} className="animate-spin" /> Gerando...</> : <><Download size={14} /> Gerar Arquivo Remessa</>}
                        </button>
                      </div>
                    </>
                  )}
                </>
              )}
            </>
          )}

          {/* ── Tab: Importar Retorno ───────────────────────────────────────── */}
          {tab === 'retorno' && (
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-semibold text-slate-700 mb-1">Importar Arquivo de Retorno</h3>
                <p className="text-xs text-slate-500">
                  O arquivo de retorno do banco contém as confirmações de pagamento (Segmento A).
                  Pagamentos efetivados terão sua data e valor atualizados e status alterado para Pago.
                </p>
              </div>

              <div
                className="border-2 border-dashed border-slate-300 rounded-lg p-6 text-center cursor-pointer hover:border-blue-400 transition-colors"
                onClick={() => document.getElementById('retorno-file-input')?.click()}>
                {retornoFile ? (
                  <div className="flex items-center justify-center gap-2">
                    <FileText size={18} className="text-slate-600" />
                    <span className="text-sm text-slate-700">{retornoFile.name}</span>
                    <button onClick={e => { e.stopPropagation(); setRetornoFile(null); setRetornoParsed(null) }}
                      className="text-slate-400 hover:text-red-500"><X size={14} /></button>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2 text-slate-400">
                    <Upload size={22} />
                    <span className="text-sm">Clique para selecionar arquivo (.ret ou .rem)</span>
                  </div>
                )}
              </div>
              <input id="retorno-file-input" type="file" className="hidden" accept=".ret,.rem"
                onChange={e => { const f = e.target.files?.[0]; if (f) handleRetornoUpload(f) }} />

              {retornoParsed && retornoParsed.length > 0 && (
                <>
                  <div className="border border-slate-200 rounded-lg overflow-hidden">
                    <div className="overflow-x-auto max-h-60">
                      <table className="w-full text-xs">
                        <thead className="sticky top-0 bg-slate-50">
                          <tr>
                            <th className="table-cell font-medium">Nº Documento</th>
                            <th className="table-cell font-medium">Data Pgto</th>
                            <th className="table-cell font-medium text-right">Valor Nominal</th>
                            <th className="table-cell font-medium">Data Efetivação</th>
                            <th className="table-cell font-medium text-right">Valor Efetivo</th>
                            <th className="table-cell font-medium">Ocorrência</th>
                            <th className="table-cell font-medium">Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {retornoParsed.map((r, i) => (
                            <tr key={i} className="table-row">
                              <td className="table-cell font-mono">{r.docEmpresa}</td>
                              <td className="table-cell">{r.dataPagamento}</td>
                              <td className="table-cell text-right">{fmtMoeda(r.valorNominal)}</td>
                              <td className="table-cell">{r.dataEfetivacao}</td>
                              <td className="table-cell text-right">{fmtMoeda(r.valorEfetivo)}</td>
                              <td className="table-cell font-mono text-slate-500">{r.ocorrencia}</td>
                              <td className="table-cell">
                                <span className={`badge text-xs ${r.status === 'Pago' ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
                                  {r.status}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    <div className="text-sm text-slate-600">
                      <strong>{retornoParsed.filter(r => r.status === 'Pago').length}</strong> pagos ·{' '}
                      <strong>{retornoParsed.filter(r => r.status === 'Não Pago').length}</strong> pendentes ·{' '}
                      <strong>{fmtMoeda(retornoParsed.filter(r => r.status === 'Pago').reduce((s, r) => s + r.valorEfetivo, 0))}</strong> total efetivado
                    </div>
                  </div>

                  {retornoError && <p className="text-sm text-red-600">{retornoError}</p>}
                  {retornoMsg && <p className="text-sm text-green-600">{retornoMsg}</p>}

                  {!retornoMsg && (
                    <button onClick={handleRetornoImportar} disabled={importando} className="btn-primary gap-2 text-sm">
                      {importando ? <><RefreshCw size={14} className="animate-spin" /> Importando...</> : 'Atualizar Pagamentos no Sistema'}
                    </button>
                  )}
                </>
              )}

              {retornoParsed?.length === 0 && (
                <p className="text-sm text-amber-600">Nenhum Segmento A encontrado no arquivo.</p>
              )}
            </div>
          )}

          {/* ── Tab: Arquivos ───────────────────────────────────────────────── */}
          {tab === 'arquivos' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-700">Arquivos Gerados e Importados</h3>
                <button onClick={loadArquivos} className="btn-secondary p-1.5">
                  <RefreshCw size={14} className={arquivosLoading ? 'animate-spin' : ''} />
                </button>
              </div>

              {arquivosLoading ? (
                <div className="text-center py-8 text-slate-400 text-sm">Carregando...</div>
              ) : arquivos.length === 0 ? (
                <div className="text-center py-8 text-slate-400 text-sm">Nenhum arquivo encontrado.</div>
              ) : (
                <div className="border border-slate-200 rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="table-cell font-medium text-left">Arquivo</th>
                        <th className="table-cell font-medium text-left">Tipo</th>
                        <th className="table-cell font-medium text-left">Data</th>
                        <th className="table-cell font-medium w-20"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {arquivos.map(a => (
                        <tr key={a.id} className="table-row">
                          <td className="table-cell font-mono text-xs text-slate-600">{a.nome}</td>
                          <td className="table-cell">
                            <span className={`badge text-xs ${
                              a.tipo === 'Arquivo de Remessa' ? 'bg-blue-100 text-blue-700' :
                              a.tipo === 'Arquivo de Retorno' ? 'bg-green-100 text-green-700' :
                              'bg-purple-100 text-purple-700'
                            }`}>{a.tipo}</span>
                          </td>
                          <td className="table-cell text-slate-500 text-xs">
                            {a.data_upload ? new Date(a.data_upload).toLocaleDateString('pt-BR') : '-'}
                          </td>
                          <td className="table-cell">
                            <a href={`/api/b2/file?fileId=${encodeURIComponent(a.file_id)}`}
                              target="_blank" rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline">
                              <Download size={12} /> Baixar
                            </a>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

        </div>
      </div>
    </div>
  )
}

// ─── Client-side retorno parser (for preview) ────────────────────────────────

function parseRetClient(text: string): ParsedRecord[] {
  const lines = text.split(/\r?\n/).map(l => l.padEnd(240, ' ')).filter(l => l.trim())
  const records: ParsedRecord[] = []
  for (const line of lines) {
    if (line[7] !== '3' || line[13] !== 'A') continue
    const nominalStr = line.slice(119, 134).trim()
    const efetivoStr = line.slice(162, 177).trim()
    const dataEfetivacao = line.slice(154, 162).trim()
    records.push({
      docEmpresa: line.slice(73, 93).trim(),
      dataPagamento: line.slice(93, 101).trim(),
      valorNominal: (parseInt(nominalStr) || 0) / 100,
      dataEfetivacao,
      valorEfetivo: (parseInt(efetivoStr) || 0) / 100,
      ocorrencia: line.slice(230, 240).trim(),
      status: dataEfetivacao && dataEfetivacao !== '00000000' ? 'Pago' : 'Não Pago',
    })
  }
  return records
}
