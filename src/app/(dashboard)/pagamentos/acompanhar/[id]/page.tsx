'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabaseBrowser as supabase } from '@/lib/supabase/client'
import {
  ArrowLeft, AlertTriangle, RefreshCw, MessageSquare, FileText,
  Printer, Brain, FileSignature, X, ChevronDown, ChevronUp,
  ExternalLink, Upload, Download, CreditCard, Check, Edit2, Building2, Send,
} from 'lucide-react'
import Modal from '@/components/ui/Modal'
import Confirm from '@/components/ui/Confirm'

// --- Types ---
interface Pedido {
  id: number; empresa: string; categoria: string; fornecedor: string
  valor_pedido: number; observacao: string | null; emergencia: boolean
  data_solicitacao: string; data_autorizacao: string | null; status: string
  cancelado: boolean; usuario_autorizador: string | null
  pedido_status: number | null; arquivo_texto: string | null
  arquivos_pdf_ids: string[] | null
}
interface FluxoRow { id: number; mes: number; ano: number; valor_referente: number; status: string }
interface Comentario {
  id: number; comentario: string; usuario: string; data_comentario: string
  anexo_url: string | null; documento_id: number | null
}
interface Documento {
  id: number; nome_documento: string; anexo_id: string | null; anexo_url: string | null
  tipo_documento: number | null; tipo_nome?: string; data_upload: string
  comentario_id: number | null
}
interface TipoDoc { id: number; tipo: string }
interface Pagamento {
  id: number; pedido_id: number; data_vencimento: string | null; valor_pagar: number
  data_pagamento: string | null; valor_pagamento: number | null
  status_pagamento: number | null; tipo_pagamento: number | null; anexo_url: string | null
}
interface PagamentoStatus { id: number; nome_status: string }
interface TipoPagamento { id: number; tipos: string }
interface ModeloContrato { id: number; nome: string; estilo: 'variavel' | 'estatico' }
interface Fornecedor {
  id: number; nome: string; cnpj_cpf: string | null
  rua_avenida: string | null; numero: string | null; complemento: string | null
  bairro: string | null; cidade: string | null; estado: string | null; cep: string | null
  tipo_chave: string | null; chave_pix: string | null
}

const fmtMoeda = (v: number | null) =>
  v != null ? Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '—'
const fmtData = (d: string | null) =>
  d ? new Date(d.includes('T') ? d : d + 'T12:00:00').toLocaleDateString('pt-BR') : '—'

function InfoField({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs text-slate-400 mb-0.5">{label}</p>
      <p className="text-sm font-medium text-slate-800">{value ?? '—'}</p>
    </div>
  )
}

// --- Controle de Pagamentos Modal ---
function ControlePagamentosModal({
  open, onClose, pedidoId, username,
}: {
  open: boolean; onClose: () => void; pedidoId: number; username: string
}) {
  const [tab, setTab] = useState<'individual' | 'lote' | 'comprovante'>('individual')
  const [pagamentos, setPagamentos] = useState<Pagamento[]>([])
  const [statusList, setStatusList] = useState<PagamentoStatus[]>([])
  const [tiposList, setTiposList] = useState<TipoPagamento[]>([])
  const [loading, setLoading] = useState(false)

  // Add individual form
  const [dataVenc, setDataVenc] = useState(new Date().toISOString().split('T')[0])
  const [valorPagar, setValorPagar] = useState('')
  const [tipoAdd, setTipoAdd] = useState<number | ''>('')
  const [adding, setAdding] = useState(false)

  // Edit row
  const [editId, setEditId] = useState<number | null>(null)
  const [editForm, setEditForm] = useState<Partial<Pagamento>>({})

  // Bulk status change
  const [bulkSelected, setBulkSelected] = useState<Set<number>>(new Set())
  const [bulkFilterStatus, setBulkFilterStatus] = useState('')
  const [bulkNewStatus, setBulkNewStatus] = useState<number | ''>('')
  const [bulkApplying, setBulkApplying] = useState(false)

  // Comprovante tab
  const [comprovantePayId, setComprovantePayId] = useState<number | ''>('')
  const [comprovanteFile, setComprovanteFile] = useState<File | null>(null)
  const [comprovanteUploading, setComprovanteUploading] = useState(false)
  const [comprovanteMsg, setComprovanteMsg] = useState('')
  const comprFileRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const [{ data: pags }, { data: st }, { data: tipos }] = await Promise.all([
      supabase.from('controle_pagamentos').select('*').eq('pedido_id', pedidoId).order('data_vencimento'),
      supabase.from('pagamento_status').select('id, nome_status').order('id'),
      supabase.from('tipos_pagamento').select('id, tipos').order('id'),
    ])
    setPagamentos(pags ?? [])
    setStatusList(st ?? [])
    setTiposList(tipos ?? [])
    setLoading(false)
  }, [pedidoId])

  useEffect(() => { if (open) load() }, [open, load])

  const statusMap = Object.fromEntries(statusList.map(s => [s.id, s.nome_status]))
  const tiposMap = Object.fromEntries(tiposList.map(t => [t.id, t.tipos]))

  const pagsFiltrados = bulkFilterStatus
    ? pagamentos.filter(p => p.status_pagamento === Number(bulkFilterStatus))
    : pagamentos

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!valorPagar || tipoAdd === '') return
    setAdding(true)
    await supabase.from('controle_pagamentos').insert({
      pedido_id: pedidoId,
      data_vencimento: dataVenc || null,
      valor_pagar: parseFloat(valorPagar),
      tipo_pagamento: tipoAdd,
    })
    setDataVenc(new Date().toISOString().split('T')[0])
    setValorPagar('')
    setTipoAdd('')
    setAdding(false)
    load()
  }

  const startEdit = (p: Pagamento) => {
    setEditId(p.id)
    setEditForm({
      data_pagamento: p.data_pagamento,
      valor_pagamento: p.valor_pagamento,
      status_pagamento: p.status_pagamento,
      tipo_pagamento: p.tipo_pagamento,
    })
  }

  const saveEdit = async () => {
    if (!editId) return
    await supabase.from('controle_pagamentos').update(editForm).eq('id', editId)
    setEditId(null)
    load()
  }

  const handleBulkApply = async () => {
    if (!bulkNewStatus || bulkSelected.size === 0) return
    setBulkApplying(true)
    await supabase.from('controle_pagamentos')
      .update({ status_pagamento: bulkNewStatus })
      .in('id', [...bulkSelected])
    setBulkSelected(new Set())
    setBulkApplying(false)
    load()
  }

  const handleUploadComprovante = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!comprovanteFile || comprovantePayId === '') return
    setComprovanteUploading(true)
    const fd = new FormData()
    fd.append('file', comprovanteFile)
    fd.append('pedido_id', String(pedidoId))
    fd.append('pagamento_id', String(comprovantePayId))
    fd.append('tipo_documento', '-2')
    const r = await fetch('/api/documentos/upload', { method: 'POST', body: fd })
    setComprovanteUploading(false)
    setComprovanteFile(null)
    if (comprFileRef.current) comprFileRef.current.value = ''
    if (r.ok) {
      setComprovanteMsg('Comprovante enviado!')
      setTimeout(() => setComprovanteMsg(''), 2000)
    }
  }

  const tabs = [
    { id: 'individual', label: 'Adicionar Pagamento' },
    { id: 'lote', label: 'Alterar Status em Lote' },
    { id: 'comprovante', label: 'Comprovante' },
  ] as const

  return (
    <Modal open={open} onClose={onClose} title={`Controle de Pagamentos — Pedido #${pedidoId}`} size="lg">
      <div className="flex border-b border-slate-200 mb-4 -mx-5 px-5">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${tab === t.id ? 'border-blue-500 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab: Adicionar Individual */}
      {tab === 'individual' && (
        <div className="space-y-4">
          <form onSubmit={handleAdd} className="p-4 bg-slate-50 rounded-lg border border-slate-200">
            <p className="text-xs font-semibold text-slate-600 mb-3">Novo pagamento</p>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="label">Vencimento</label>
                <input className="input" type="date" value={dataVenc} onChange={e => setDataVenc(e.target.value)} />
              </div>
              <div>
                <label className="label">Valor (R$)</label>
                <input className="input" type="number" step="0.01" min="0.01" placeholder="0,00"
                  value={valorPagar} onChange={e => setValorPagar(e.target.value)} required />
              </div>
              <div>
                <label className="label">Tipo</label>
                <select className="input" value={tipoAdd} onChange={e => setTipoAdd(e.target.value === '' ? '' : Number(e.target.value))} required>
                  <option value="">Selecionar...</option>
                  {tiposList.map(t => <option key={t.id} value={t.id}>{t.tipos}</option>)}
                </select>
              </div>
            </div>
            <button type="submit" disabled={adding} className="btn-primary mt-3 text-sm">
              {adding ? 'Adicionando...' : '+ Adicionar Pagamento'}
            </button>
          </form>

          {loading ? (
            <p className="text-slate-400 text-sm">Carregando...</p>
          ) : pagamentos.length === 0 ? (
            <p className="text-slate-400 text-sm text-center py-6">Nenhum pagamento cadastrado.</p>
          ) : (
            <div className="overflow-auto max-h-64 border border-slate-200 rounded-lg">
              <table className="w-full text-xs">
                <thead className="sticky top-0 z-10 table-header">
                  <tr>
                    <th className="table-cell font-medium">ID</th>
                    <th className="table-cell font-medium">Vencimento</th>
                    <th className="table-cell font-medium text-right">A Pagar</th>
                    <th className="table-cell font-medium">Status</th>
                    <th className="table-cell font-medium">Tipo</th>
                    <th className="table-cell font-medium">Data Pag.</th>
                    <th className="table-cell font-medium text-right">Pago</th>
                    <th className="table-cell font-medium w-16"></th>
                  </tr>
                </thead>
                <tbody>
                  {pagamentos.map(p => (
                    editId === p.id ? (
                      <tr key={p.id} className="bg-blue-50">
                        <td className="table-cell">{p.id}</td>
                        <td className="table-cell">{fmtData(p.data_vencimento)}</td>
                        <td className="table-cell text-right">{fmtMoeda(p.valor_pagar)}</td>
                        <td className="table-cell">
                          <select className="input text-xs py-0.5 px-1" value={editForm.status_pagamento ?? ''}
                            onChange={e => setEditForm(f => ({ ...f, status_pagamento: e.target.value ? Number(e.target.value) : null }))}>
                            <option value="">—</option>
                            {statusList.map(s => <option key={s.id} value={s.id}>{s.nome_status}</option>)}
                          </select>
                        </td>
                        <td className="table-cell">
                          <select className="input text-xs py-0.5 px-1" value={editForm.tipo_pagamento ?? ''}
                            onChange={e => setEditForm(f => ({ ...f, tipo_pagamento: e.target.value ? Number(e.target.value) : null }))}>
                            <option value="">—</option>
                            {tiposList.map(t => <option key={t.id} value={t.id}>{t.tipos}</option>)}
                          </select>
                        </td>
                        <td className="table-cell">
                          <input className="input text-xs py-0.5 px-1" type="date" value={editForm.data_pagamento ?? ''}
                            onChange={e => setEditForm(f => ({ ...f, data_pagamento: e.target.value || null }))} />
                        </td>
                        <td className="table-cell">
                          <input className="input text-xs py-0.5 px-1 w-20" type="number" step="0.01"
                            value={editForm.valor_pagamento ?? ''}
                            onChange={e => setEditForm(f => ({ ...f, valor_pagamento: e.target.value ? parseFloat(e.target.value) : null }))} />
                        </td>
                        <td className="table-cell">
                          <div className="flex items-center gap-1">
                            <button onClick={saveEdit} className="p-1 text-green-600 hover:bg-green-50 rounded"><Check size={13} /></button>
                            <button onClick={() => setEditId(null)} className="p-1 text-slate-400 hover:bg-slate-100 rounded"><X size={13} /></button>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      <tr key={p.id} className="table-row">
                        <td className="table-cell text-slate-500">{p.id}</td>
                        <td className="table-cell">{fmtData(p.data_vencimento)}</td>
                        <td className="table-cell text-right font-medium">{fmtMoeda(p.valor_pagar)}</td>
                        <td className="table-cell">
                          <span className={`badge text-xs ${p.status_pagamento ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-500'}`}>
                            {p.status_pagamento ? statusMap[p.status_pagamento] ?? '?' : '—'}
                          </span>
                        </td>
                        <td className="table-cell text-slate-600">{p.tipo_pagamento ? tiposMap[p.tipo_pagamento] ?? '?' : '—'}</td>
                        <td className="table-cell">{fmtData(p.data_pagamento)}</td>
                        <td className="table-cell text-right">{fmtMoeda(p.valor_pagamento)}</td>
                        <td className="table-cell">
                          <button onClick={() => startEdit(p)} className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded"><Edit2 size={13} /></button>
                        </td>
                      </tr>
                    )
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Tab: Alterar Status em Lote */}
      {tab === 'lote' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Filtrar por status atual</label>
              <select className="input" value={bulkFilterStatus} onChange={e => { setBulkFilterStatus(e.target.value); setBulkSelected(new Set()) }}>
                <option value="">Todos</option>
                {statusList.map(s => <option key={s.id} value={s.id}>{s.nome_status}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Novo status</label>
              <select className="input" value={bulkNewStatus} onChange={e => setBulkNewStatus(e.target.value === '' ? '' : Number(e.target.value))}>
                <option value="">Selecionar...</option>
                {statusList.map(s => <option key={s.id} value={s.id}>{s.nome_status}</option>)}
              </select>
            </div>
          </div>

          {pagsFiltrados.length === 0 ? (
            <p className="text-slate-400 text-sm text-center py-6">Nenhum pagamento.</p>
          ) : (
            <>
              <label className="flex items-center gap-2 cursor-pointer text-sm text-slate-600">
                <input type="checkbox" className="w-4 h-4 accent-blue-600"
                  checked={bulkSelected.size === pagsFiltrados.length}
                  onChange={() => setBulkSelected(bulkSelected.size === pagsFiltrados.length ? new Set() : new Set(pagsFiltrados.map(p => p.id)))} />
                Selecionar todos ({pagsFiltrados.length})
              </label>

              <div className="space-y-1 max-h-56 overflow-y-auto">
                {pagsFiltrados.map(p => (
                  <label key={p.id} className={`flex items-center gap-3 p-2 rounded border cursor-pointer ${bulkSelected.has(p.id) ? 'bg-blue-50 border-blue-200' : 'border-slate-100 hover:bg-slate-50'}`}>
                    <input type="checkbox" className="w-4 h-4 accent-blue-600 shrink-0"
                      checked={bulkSelected.has(p.id)}
                      onChange={() => setBulkSelected(prev => { const n = new Set(prev); n.has(p.id) ? n.delete(p.id) : n.add(p.id); return n })} />
                    <span className="text-sm flex-1">#{p.id} — {fmtData(p.data_vencimento)} — {fmtMoeda(p.valor_pagar)}</span>
                    <span className="text-xs text-slate-500">{p.status_pagamento ? statusMap[p.status_pagamento] : 'Sem status'}</span>
                  </label>
                ))}
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-slate-200">
                <span className="text-sm text-slate-600">{bulkSelected.size} selecionado(s)</span>
                <button onClick={handleBulkApply}
                  disabled={bulkApplying || bulkSelected.size === 0 || bulkNewStatus === ''}
                  className="btn-primary text-sm gap-1.5">
                  {bulkApplying ? 'Aplicando...' : 'Aplicar Status'}
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Tab: Comprovante */}
      {tab === 'comprovante' && (
        <div className="space-y-4">
          <form onSubmit={handleUploadComprovante} className="p-4 bg-slate-50 rounded-lg border border-slate-200">
            <p className="text-xs font-semibold text-slate-600 mb-3">Anexar comprovante de pagamento</p>
            <div className="space-y-3">
              <div>
                <label className="label">Pagamento *</label>
                <select className="input" value={comprovantePayId}
                  onChange={e => setComprovantePayId(e.target.value === '' ? '' : Number(e.target.value))}>
                  <option value="">Selecionar...</option>
                  {pagamentos.map(p => (
                    <option key={p.id} value={p.id}>
                      #{p.id} — Venc. {fmtData(p.data_vencimento)} — {fmtMoeda(p.valor_pagar)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Arquivo PDF *</label>
                <input ref={comprFileRef} type="file" accept=".pdf" className="hidden"
                  onChange={e => setComprovanteFile(e.target.files?.[0] ?? null)} />
                <button type="button" onClick={() => comprFileRef.current?.click()}
                  className="btn-secondary text-sm gap-1.5">
                  <Upload size={14} /> {comprovanteFile ? comprovanteFile.name.slice(0, 30) : 'Selecionar PDF'}
                </button>
              </div>
              {comprovanteMsg && <p className="text-sm text-green-600">{comprovanteMsg}</p>}
              <button type="submit" disabled={!comprovanteFile || comprovantePayId === '' || comprovanteUploading}
                className="btn-primary text-sm">
                {comprovanteUploading ? 'Enviando...' : 'Anexar Comprovante'}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="flex justify-end mt-4 pt-4 border-t border-slate-200">
        <button onClick={onClose} className="btn-secondary text-sm">Fechar</button>
      </div>
    </Modal>
  )
}

// --- Comments Modal ---
function ComentariosModal({ open, onClose, pedidoId, username }: {
  open: boolean; onClose: () => void; pedidoId: number; username: string
}) {
  const [comentarios, setComentarios] = useState<Comentario[]>([])
  const [tiposDocs, setTiposDocs] = useState<TipoDoc[]>([])
  // map of comentario_id -> anexo_id (from documentos table)
  const [docByComment, setDocByComment] = useState<Record<number, string>>({})
  const [loading, setLoading] = useState(false)
  const [texto, setTexto] = useState('')
  const [tipoId, setTipoId] = useState<number | ''>('')
  const [file, setFile] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const [{ data: coms }, { data: tipos }, { data: docs }] = await Promise.all([
      supabase.from('comentarios').select('*').eq('pedido_id', pedidoId).order('data_comentario', { ascending: false }),
      supabase.from('tipos_documento').select('id, tipo').order('tipo'),
      supabase.from('documentos').select('comentario_id, anexo_id').eq('pedido_id', pedidoId).not('comentario_id', 'is', null),
    ])
    setComentarios(coms ?? [])
    setTiposDocs(tipos ?? [])
    // Build map: comentario_id -> anexo_id
    const map: Record<number, string> = {}
    for (const d of (docs ?? [])) {
      if (d.comentario_id && d.anexo_id) map[d.comentario_id] = d.anexo_id
    }
    setDocByComment(map)
    setLoading(false)
  }, [pedidoId])

  useEffect(() => { if (open) load() }, [open, load])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!texto.trim()) return
    setSaving(true)

    // Insert comment first to get its id
    const { data: newCom } = await supabase.from('comentarios').insert({
      pedido_id: pedidoId, comentario: texto.trim(), usuario: username,
      data_comentario: new Date().toISOString(),
    }).select().single()

    if (newCom && file) {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('pedido_id', String(pedidoId))
      fd.append('tipo_documento', tipoId !== '' ? String(tipoId) : '-1')
      fd.append('comentario_id', String(newCom.id))
      await fetch('/api/documentos/upload', { method: 'POST', body: fd })
    }

    setTexto(''); setTipoId(''); setFile(null)
    if (fileRef.current) fileRef.current.value = ''
    setSaving(false); load()
  }

  return (
    <Modal open={open} onClose={onClose} title={`Comentários — Pedido #${pedidoId}`} size="lg">
      <div className="space-y-4">
        <div className="max-h-64 overflow-y-auto space-y-3 pr-1">
          {loading && <p className="text-slate-400 text-sm">Carregando...</p>}
          {!loading && comentarios.length === 0 && <p className="text-slate-400 text-sm text-center py-6">Nenhum comentário.</p>}
          {comentarios.map(c => (
            <div key={c.id} className="bg-slate-50 rounded-lg p-3 border border-slate-200">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-semibold text-slate-700">{c.usuario}</span>
                <span className="text-xs text-slate-400">{fmtData(c.data_comentario)}</span>
              </div>
              <p className="text-sm text-slate-800 whitespace-pre-wrap">{c.comentario}</p>
              {docByComment[c.id] && (
                <a href={`/api/b2/file?fileId=${docByComment[c.id]}`} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 mt-2 text-xs text-blue-600 hover:underline">
                  <ExternalLink size={11} /> Ver anexo
                </a>
              )}
            </div>
          ))}
        </div>
        <div className="border-t border-slate-200 pt-4">
          <p className="text-xs font-semibold text-slate-600 mb-3">Adicionar comentário</p>
          <form onSubmit={handleSubmit} className="space-y-3">
            <textarea className="input resize-none" rows={3} placeholder="Escreva um comentário..."
              value={texto} onChange={e => setTexto(e.target.value)} required />
            <div className="grid grid-cols-2 gap-3">
              <select className="input" value={tipoId} onChange={e => setTipoId(e.target.value === '' ? '' : Number(e.target.value))}>
                <option value="">Tipo de arquivo (opcional)</option>
                {tiposDocs.map(t => <option key={t.id} value={t.id}>{t.tipo}</option>)}
              </select>
              <div>
                <input ref={fileRef} type="file" className="hidden" onChange={e => setFile(e.target.files?.[0] ?? null)} />
                <button type="button" onClick={() => fileRef.current?.click()} className="btn-secondary w-full text-xs gap-1">
                  <Upload size={12} /> {file ? file.name.slice(0, 20) + '…' : 'Anexar arquivo'}
                </button>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={onClose} className="btn-secondary text-sm">Fechar</button>
              <button type="submit" disabled={saving || !texto.trim()} className="btn-primary text-sm">
                {saving ? 'Enviando...' : 'Adicionar'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </Modal>
  )
}

// --- Documents Modal ---
function DocumentosModal({
  open, onClose, pedidoId, pedidoArquivosIds, pagamentos,
}: {
  open: boolean; onClose: () => void; pedidoId: number
  pedidoArquivosIds: string[] | null; pagamentos: Pagamento[]
}) {
  const [docs, setDocs] = useState<Documento[]>([])
  const [tiposDocs, setTiposDocs] = useState<TipoDoc[]>([])
  const [loading, setLoading] = useState(false)
  const [tipoId, setTipoId] = useState<number | ''>('')
  const [pagamentoId, setPagamentoId] = useState<number | ''>('')
  const [file, setFile] = useState<File | null>(null)
  const [comentario, setComentario] = useState('')
  const [uploading, setUploading] = useState(false)
  const [uploadMsg, setUploadMsg] = useState('')
  const [uploadError, setUploadError] = useState('')
  const [expanded, setExpanded] = useState<Set<string>>(new Set(['Documentos de Solicitação']))
  const fileRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const [{ data: d }, { data: t }] = await Promise.all([
      supabase.from('documentos').select('*').eq('pedido_id', pedidoId).order('data_upload', { ascending: false }),
      supabase.from('tipos_documento').select('id, tipo').order('tipo'),
    ])
    const tipos = (t ?? []) as TipoDoc[]
    const tipoMap = Object.fromEntries(tipos.map(x => [x.id, x.tipo]))
    setDocs((d ?? []).map((doc: Documento) => ({
      ...doc,
      tipo_nome: doc.tipo_documento != null ? tipoMap[doc.tipo_documento] ?? 'Outros' : 'Sem tipo',
    })))
    setTiposDocs(tipos)
    setLoading(false)
  }, [pedidoId])

  useEffect(() => { if (open) load() }, [open, load])

  const isBoleto = tipoId === 4

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault()
    setUploadError('')
    if (!file) { setUploadError('Selecione um arquivo.'); return }
    if (tipoId === '') { setUploadError('Selecione o tipo de documento.'); return }
    if (isBoleto && pagamentoId === '') { setUploadError('Selecione o pagamento para associar o boleto.'); return }

    // Check if payment already has boleto
    if (isBoleto) {
      const { data: existing } = await supabase.from('documentos')
        .select('id').eq('tipo_documento', 4).eq('pedido_id', pedidoId).eq('pagamento_id', pagamentoId)
      if (existing && existing.length > 0) {
        setUploadError('Este pagamento já possui boleto anexado. Apague o existente para enviar outro.')
        return
      }
    }

    setUploading(true)
    const fd = new FormData()
    fd.append('file', file)
    fd.append('pedido_id', String(pedidoId))
    fd.append('tipo_documento', String(tipoId))
    if (isBoleto && pagamentoId !== '') fd.append('pagamento_id', String(pagamentoId))

    const r = await fetch('/api/documentos/upload', { method: 'POST', body: fd })
    const resData = await r.json()
    setUploading(false)

    if (!r.ok) { setUploadError(resData.error ?? 'Erro ao enviar.'); return }

    // If comment was provided, link it to the document
    if (comentario.trim() && resData.documento?.id) {
      await supabase.from('comentarios').insert({
        pedido_id: pedidoId, comentario: comentario.trim(),
        data_comentario: new Date().toISOString(),
        documento_id: resData.documento.id,
        anexo_url: resData.documento.anexo_url,
      })
    }

    setFile(null); if (fileRef.current) fileRef.current.value = ''
    setTipoId(''); setPagamentoId(''); setComentario('')
    setUploadMsg('Documento enviado!')
    setTimeout(() => setUploadMsg(''), 2000)
    load()
  }

  // Group documents by tipo_nome
  const grouped: Record<string, Documento[]> = {}
  tiposDocs.forEach(t => {
    const items = docs.filter(d => d.tipo_documento === t.id)
    if (items.length) grouped[t.tipo] = items
  })
  const semTipo = docs.filter(d => d.tipo_documento == null)
  if (semTipo.length) grouped['Sem tipo'] = semTipo

  const toggle = (n: string) => setExpanded(p => { const s = new Set(p); s.has(n) ? s.delete(n) : s.add(n); return s })

  return (
    <Modal open={open} onClose={onClose} title={`Documentos — Pedido #${pedidoId}`} size="lg">
      <div className="space-y-4">
        {/* Upload form */}
        <form onSubmit={handleUpload} className="p-3 bg-slate-50 rounded-lg border border-slate-200 space-y-3">
          <p className="text-xs font-semibold text-slate-600">Adicionar documento</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Tipo de Documento *</label>
              <select className="input" value={tipoId} onChange={e => { setTipoId(e.target.value === '' ? '' : Number(e.target.value)); setPagamentoId('') }}>
                <option value="">Selecionar tipo...</option>
                {tiposDocs.filter(t => t.id > 0).map(t => <option key={t.id} value={t.id}>{t.tipo}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Arquivo *</label>
              <div className="flex gap-2">
                <input ref={fileRef} type="file" className="hidden" onChange={e => setFile(e.target.files?.[0] ?? null)} />
                <button type="button" onClick={() => fileRef.current?.click()} className="btn-secondary text-xs gap-1 flex-1 truncate">
                  <Upload size={12} />{file ? file.name.slice(0, 18) + '…' : 'Selecionar'}
                </button>
              </div>
            </div>
          </div>

          {isBoleto && (
            <div>
              <label className="label">Pagamento associado *</label>
              <select className="input" value={pagamentoId} onChange={e => setPagamentoId(e.target.value === '' ? '' : Number(e.target.value))}>
                <option value="">Selecionar pagamento...</option>
                {pagamentos.map(p => (
                  <option key={p.id} value={p.id}>
                    #{p.id} — Venc. {fmtData(p.data_vencimento)} — {fmtMoeda(p.valor_pagar)}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="label">Comentário (opcional)</label>
            <textarea className="input resize-none" rows={2} placeholder="Observação sobre este documento..."
              value={comentario} onChange={e => setComentario(e.target.value)} />
          </div>

          {uploadError && <p className="text-xs text-red-600">{uploadError}</p>}
          {uploadMsg && <p className="text-xs text-green-600">{uploadMsg}</p>}
          <button type="submit" disabled={uploading || !file || tipoId === ''} className="btn-primary text-sm gap-1">
            <Upload size={13} /> {uploading ? 'Enviando...' : 'Enviar Documento'}
          </button>
        </form>

        {/* Documentos de Solicitação (arquivos_pdf_ids) */}
        {pedidoArquivosIds && pedidoArquivosIds.length > 0 && (
          <div className="border border-slate-200 rounded-lg overflow-hidden">
            <button onClick={() => toggle('Documentos de Solicitação')}
              className="w-full flex items-center justify-between px-3 py-2 bg-blue-50 text-sm font-medium text-blue-800">
              <span>Documentos de Solicitação ({pedidoArquivosIds.length})</span>
              {expanded.has('Documentos de Solicitação') ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
            {expanded.has('Documentos de Solicitação') && (
              <div className="divide-y divide-slate-100">
                {pedidoArquivosIds.map((fileId, i) => (
                  <div key={i} className="flex items-center justify-between px-3 py-2">
                    <p className="text-xs text-slate-600">Documento de solicitação #{i + 1}</p>
                    <a href={`/api/b2/file?fileId=${fileId}`} target="_blank" rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline shrink-0 ml-2">
                      <ExternalLink size={11} /> Ver
                    </a>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Document groups */}
        <div className="max-h-72 overflow-y-auto space-y-2">
          {loading && <p className="text-slate-400 text-sm">Carregando...</p>}
          {!loading && docs.length === 0 && Object.keys(grouped).length === 0 && (
            <p className="text-slate-400 text-sm text-center py-6">Nenhum documento enviado.</p>
          )}
          {Object.entries(grouped).map(([tipo, items]) => (
            <div key={tipo} className="border border-slate-200 rounded-lg overflow-hidden">
              <button onClick={() => toggle(tipo)}
                className="w-full flex items-center justify-between px-3 py-2 bg-slate-100 text-sm font-medium text-slate-700">
                <span>{tipo} ({items.length})</span>
                {expanded.has(tipo) ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </button>
              {expanded.has(tipo) && (
                <div className="divide-y divide-slate-100">
                  {items.map(doc => (
                    <div key={doc.id} className="px-3 py-2">
                      <div className="flex items-center justify-between">
                        <div className="min-w-0">
                          <p className="text-xs text-slate-700 truncate">{doc.nome_documento}</p>
                          <p className="text-xs text-slate-400">{fmtData(doc.data_upload)}</p>
                        </div>
                        {doc.anexo_id && (
                          <a href={`/api/b2/file?fileId=${doc.anexo_id}`} target="_blank" rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline shrink-0 ml-2">
                            <ExternalLink size={11} /> Ver
                          </a>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="flex justify-end">
          <button onClick={onClose} className="btn-secondary text-sm">Fechar</button>
        </div>
      </div>
    </Modal>
  )
}

// --- Analysis Modal ---
function AnaliseModal({ open, onClose, pedidoId }: { open: boolean; onClose: () => void; pedidoId: number }) {
  const [analise, setAnalise] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const fetchAnalise = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const r = await fetch(`/api/pedidos/${pedidoId}/analise`)
      const d = await r.json()
      if (r.status === 429) setError(d.error)
      else if (d.sem_documento) setError('Sem texto de documento disponível para análise.')
      else if (d.error) setError(d.error)
      else setAnalise(d.analise)
    } catch { setError('Erro ao buscar análise.') }
    setLoading(false)
  }, [pedidoId])

  useEffect(() => { if (open) fetchAnalise() }, [open, fetchAnalise])

  return (
    <Modal open={open} onClose={onClose} title="Análise IA — Documento" size="lg">
      <div className="space-y-4">
        {loading && (
          <div className="text-center py-12">
            <Brain size={32} className="mx-auto text-blue-400 animate-pulse mb-3" />
            <p className="text-slate-500 text-sm">Analisando documento...</p>
          </div>
        )}
        {error && <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>}
        {analise && !loading && (
          <>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 max-h-96 overflow-y-auto">
              <p className="text-sm text-slate-800 whitespace-pre-wrap">{analise}</p>
            </div>
            <button onClick={fetchAnalise} className="btn-secondary text-xs gap-1.5">
              <RefreshCw size={12} /> Reanalisar
            </button>
          </>
        )}
        <div className="flex justify-end"><button onClick={onClose} className="btn-secondary text-sm">Fechar</button></div>
      </div>
    </Modal>
  )
}

// --- Preencher Dados Fornecedor Modal ---
function PreencherFornecedorModal({
  open, onClose, fornecedorNome, onSaved,
}: {
  open: boolean; onClose: () => void; fornecedorNome: string; onSaved: () => void
}) {
  const [form, setForm] = useState<Partial<Fornecedor>>({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [fornecedorId, setFornecedorId] = useState<number | null>(null)

  const UFs = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO']
  const tiposChave = ['CPF', 'CNPJ', 'E-mail', 'Telefone', 'Chave Aleatória']

  useEffect(() => {
    if (!open) return
    supabase.from('fornecedores').select('*').ilike('nome', fornecedorNome).maybeSingle().then(({ data }) => {
      if (data) { setFornecedorId(data.id); setForm(data) }
    })
  }, [open, fornecedorNome])

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true); setError('')
    if (!fornecedorId) { setError('Fornecedor não encontrado.'); setSaving(false); return }
    const { error: err } = await supabase.from('fornecedores').update(form).eq('id', fornecedorId)
    setSaving(false)
    if (err) { setError(err.message); return }
    onSaved()
    onClose()
  }

  const set = (field: keyof Fornecedor) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(f => ({ ...f, [field]: e.target.value || null }))

  return (
    <Modal open={open} onClose={onClose} title={`Dados do Fornecedor — ${fornecedorNome}`} size="lg">
      <form onSubmit={handleSave} className="space-y-4">
        <p className="text-sm text-orange-700 bg-orange-50 border border-orange-200 rounded-lg p-3">
          Os dados deste fornecedor estão incompletos. Preencha as informações abaixo para continuar.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className="label">CPF / CNPJ</label>
            <input className="input" value={form.cnpj_cpf ?? ''} onChange={set('cnpj_cpf')} placeholder="Apenas números" />
          </div>
          <div className="col-span-2">
            <label className="label">Rua / Avenida</label>
            <input className="input" value={form.rua_avenida ?? ''} onChange={set('rua_avenida')} />
          </div>
          <div>
            <label className="label">Número</label>
            <input className="input" value={form.numero ?? ''} onChange={set('numero')} />
          </div>
          <div>
            <label className="label">Complemento</label>
            <input className="input" value={form.complemento ?? ''} onChange={set('complemento')} />
          </div>
          <div>
            <label className="label">Bairro</label>
            <input className="input" value={form.bairro ?? ''} onChange={set('bairro')} />
          </div>
          <div>
            <label className="label">Cidade</label>
            <input className="input" value={form.cidade ?? ''} onChange={set('cidade')} />
          </div>
          <div>
            <label className="label">Estado</label>
            <select className="input" value={form.estado ?? ''} onChange={set('estado')}>
              <option value="">Selecionar</option>
              {UFs.map(uf => <option key={uf} value={uf}>{uf}</option>)}
            </select>
          </div>
          <div>
            <label className="label">CEP</label>
            <input className="input" value={form.cep ?? ''} onChange={set('cep')} placeholder="00000-000" />
          </div>
          <div>
            <label className="label">Tipo de Chave PIX</label>
            <select className="input" value={form.tipo_chave ?? ''} onChange={set('tipo_chave')}>
              <option value="">Selecionar</option>
              {tiposChave.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Chave PIX</label>
            <input className="input" value={form.chave_pix ?? ''} onChange={set('chave_pix')} />
          </div>
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="btn-secondary text-sm">Cancelar</button>
          <button type="submit" disabled={saving} className="btn-primary text-sm gap-1.5">
            <Building2 size={14} /> {saving ? 'Salvando...' : 'Salvar e Continuar'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

// --- Contrato Modal (template-based DOCX) ---
function ContratoModal({
  open, onClose, pedido,
}: {
  open: boolean; onClose: () => void; pedido: Pedido
}) {
  const [step, setStep] = useState<'check' | 'fill' | 'select' | 'generate'>('check')
  const [modelos, setModelos] = useState<ModeloContrato[]>([])
  const [modeloVarId, setModeloVarId] = useState<number | ''>('')
  const [modeloEstId, setModeloEstId] = useState<number | ''>('')
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState('')
  const [showFillModal, setShowFillModal] = useState(false)

  const modelosVar = modelos.filter(m => m.estilo === 'variavel')
  const modelosEst = modelos.filter(m => m.estilo === 'estatico')

  const isFornecedorComplete = useCallback(async () => {
    const { data } = await supabase.from('fornecedores')
      .select('cnpj_cpf,rua_avenida,numero,bairro,cidade,estado,cep,tipo_chave,chave_pix')
      .ilike('nome', pedido.fornecedor)
      .maybeSingle()
    if (!data) return false
    const fields = ['cnpj_cpf','rua_avenida','numero','bairro','cidade','estado','cep','tipo_chave','chave_pix'] as const
    return fields.every(f => data[f])
  }, [pedido.fornecedor])

  useEffect(() => {
    if (!open) return
    setStep('check'); setError(''); setModeloVarId(''); setModeloEstId('')

    Promise.all([
      isFornecedorComplete(),
      supabase.from('modelo_contrato').select('id, nome, estilo').order('nome'),
    ]).then(([complete, { data: mods }]) => {
      setModelos(mods ?? [])
      if (!complete) {
        setStep('fill')
      } else {
        setStep('select')
      }
    })
  }, [open, isFornecedorComplete])

  const handleGerar = async () => {
    if (modeloVarId === '' || modeloEstId === '') {
      setError('Selecione um modelo variável e um modelo estático.')
      return
    }
    setGenerating(true); setError('')
    try {
      const r = await fetch(`/api/pedidos/${pedido.id}/gerar-contrato`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modelo_variavel_id: modeloVarId, modelo_estatico_id: modeloEstId }),
      })
      if (!r.ok) {
        const d = await r.json()
        setError(d.error ?? 'Erro ao gerar contrato.')
        setGenerating(false); return
      }
      const blob = await r.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = `contrato_pedido_${pedido.id}.docx`; a.click()
      URL.revokeObjectURL(url)
      setGenerating(false); onClose()
    } catch {
      setError('Erro ao gerar contrato.')
      setGenerating(false)
    }
  }

  return (
    <>
      <Modal open={open && step !== 'fill'} onClose={onClose} title="Gerar Contrato" size="md">
        {step === 'check' && (
          <div className="text-center py-8 text-slate-400">Verificando dados...</div>
        )}

        {step === 'select' && (
          <div className="space-y-4">
            <p className="text-sm text-slate-600">
              Selecione os modelos para gerar o contrato do pedido #{pedido.id} — {pedido.fornecedor}.
            </p>

            {modelos.length === 0 ? (
              <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-yellow-800">
                Nenhum modelo de contrato cadastrado. Acesse a página de Modelos de Contrato para importar.
              </div>
            ) : (
              <>
                <div>
                  <label className="label">Modelo Variável (com dados do pedido)</label>
                  <select className="input" value={modeloVarId}
                    onChange={e => setModeloVarId(e.target.value === '' ? '' : Number(e.target.value))}>
                    <option value="">Selecionar modelo variável...</option>
                    {modelosVar.map(m => <option key={m.id} value={m.id}>{m.nome}</option>)}
                  </select>
                  {modelosVar.length === 0 && (
                    <p className="text-xs text-slate-400 mt-1">Nenhum modelo variável cadastrado.</p>
                  )}
                </div>
                <div>
                  <label className="label">Modelo Estático (termos e condições)</label>
                  <select className="input" value={modeloEstId}
                    onChange={e => setModeloEstId(e.target.value === '' ? '' : Number(e.target.value))}>
                    <option value="">Selecionar modelo estático...</option>
                    {modelosEst.map(m => <option key={m.id} value={m.id}>{m.nome}</option>)}
                  </select>
                  {modelosEst.length === 0 && (
                    <p className="text-xs text-slate-400 mt-1">Nenhum modelo estático cadastrado.</p>
                  )}
                </div>

                <div className="p-3 bg-blue-50 border border-blue-100 rounded-lg text-xs text-blue-700 space-y-1">
                  <p className="font-semibold">Variáveis disponíveis no modelo variável:</p>
                  <p className="font-mono">{'{id}'} {'{empresa}'} {'{categoria}'} {'{fornecedor}'} {'{valor_pedido}'} {'{status}'} {'{data_solicitacao}'} {'{data_autorizacao}'} {'{emergencia}'} {'{observacao}'}</p>
                  <p className="font-mono">{'{mes_ano_1}'} {'{valor_referente_1}'} {'{valor_total_fluxo}'} (e demais índices)</p>
                </div>

                {error && <p className="text-sm text-red-600">{error}</p>}
              </>
            )}

            <div className="flex justify-end gap-2">
              <button onClick={onClose} className="btn-secondary text-sm">Cancelar</button>
              {modelos.length > 0 && (
                <button onClick={handleGerar} disabled={generating || modeloVarId === '' || modeloEstId === ''}
                  className="btn-primary text-sm gap-1.5">
                  <FileSignature size={14} />
                  {generating ? 'Gerando...' : 'Gerar Contrato DOCX'}
                </button>
              )}
            </div>
          </div>
        )}
      </Modal>

      {/* Preencher dados fornecedor (shown when supplier is incomplete) */}
      {open && step === 'fill' && (
        <PreencherFornecedorModal
          open
          onClose={onClose}
          fornecedorNome={pedido.fornecedor}
          onSaved={() => setStep('select')}
        />
      )}
    </>
  )
}

// --- Main Page ---
export default function AcompanharDetalhePage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const pedidoId = parseInt(id)

  const [pedido, setPedido] = useState<Pedido | null>(null)
  const [fluxo, setFluxo] = useState<FluxoRow[]>([])
  const [pagamentos, setPagamentos] = useState<Pagamento[]>([])
  const [statusNome, setStatusNome] = useState<string | null>(null)
  const [user, setUser] = useState<{ username: string } | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [showPagamentos, setShowPagamentos] = useState(false)
  const [showComents, setShowComents] = useState(false)
  const [showDocs, setShowDocs] = useState(false)
  const [showAnalise, setShowAnalise] = useState(false)
  const [showContrato, setShowContrato] = useState(false)
  const [confirmCancel, setConfirmCancel] = useState(false)
  const [cancelling, setCancelling] = useState(false)

  // Ajuste state
  const [comentariosAjuste, setComentariosAjuste] = useState<Comentario[]>([])
  const [editando, setEditando] = useState(false)
  const [editForm, setEditFormAjuste] = useState({ empresa: '', categoria: '', fornecedor: '', valor_pedido: '', observacao: '' })
  const [editEmpresas, setEditEmpresas] = useState<string[]>([])
  const [editCategorias, setEditCategorias] = useState<string[]>([])
  const [editFornecedores, setEditFornecedores] = useState<string[]>([])
  const [savingEdit, setSavingEdit] = useState(false)
  const [reenviando, setReenviando] = useState(false)

  const load = useCallback(async () => {
    setLoading(true); setError('')
    const [{ data: p, error: pErr }, { data: fl }, { data: pags }, u] = await Promise.all([
      supabase.from('pedidos_solicitados').select('*').eq('id', pedidoId).maybeSingle(),
      supabase.from('pedidos_solicitados_fluxo').select('*').eq('pedido_id', pedidoId).order('ano').order('mes'),
      supabase.from('controle_pagamentos').select('*').eq('pedido_id', pedidoId).order('data_vencimento'),
      fetch('/api/auth/me').then(r => r.json()),
    ])
    if (pErr || !p) { setError('Pedido não encontrado.'); setLoading(false); return }
    setPedido(p as Pedido); setFluxo(fl ?? []); setPagamentos(pags ?? []); setUser(u)
    if ((p as Pedido).pedido_status) {
      const { data: st } = await supabase.from('pedido_status').select('nome_status').eq('id', (p as Pedido).pedido_status).maybeSingle()
      setStatusNome((st as { nome_status: string } | null)?.nome_status ?? null)
    }
    // Load comentários de ajuste (do gestor) — todos, para histórico
    if ((p as Pedido).status === 'Aguardando Ajuste') {
      const { data: coms } = await supabase.from('comentarios')
        .select('id, comentario, usuario, data_comentario, anexo_url, documento_id')
        .eq('pedido_id', pedidoId)
        .order('data_comentario', { ascending: false })
      setComentariosAjuste(coms ?? [])
      // Pre-fill edit form
      setEditFormAjuste({
        empresa: (p as Pedido).empresa,
        categoria: (p as Pedido).categoria,
        fornecedor: (p as Pedido).fornecedor,
        valor_pedido: String((p as Pedido).valor_pedido),
        observacao: (p as Pedido).observacao ?? '',
      })
      // Load reference data for edit dropdowns
      const [{ data: emps }, { data: fors }] = await Promise.all([
        supabase.from('pedidos_solicitados').select('empresa').order('empresa'),
        supabase.from('fornecedores').select('nome').order('nome'),
      ])
      setEditEmpresas([...new Set((emps ?? []).map((r: { empresa: string }) => r.empresa).filter(Boolean))])
      setEditFornecedores((fors ?? []).map((r: { nome: string }) => r.nome))
    } else {
      setComentariosAjuste([])
    }
    setLoading(false)
  }, [pedidoId])

  useEffect(() => { if (!isNaN(pedidoId)) load() }, [load, pedidoId])

  const handlePrint = async () => {
    if (!pedido) return
    const { jsPDF } = await import('jspdf')
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
    doc.setFontSize(16); doc.setFont('helvetica', 'bold')
    doc.text('PEDIDO DE PAGAMENTO', 105, 18, { align: 'center' })
    doc.setFontSize(10); doc.setFont('helvetica', 'normal')
    const fields: [string, string][] = [
      ['Pedido ID', `#${pedido.id}`], ['Empresa', pedido.empresa], ['Categoria', pedido.categoria],
      ['Fornecedor', pedido.fornecedor], ['Valor', fmtMoeda(pedido.valor_pedido)],
      ['Status', pedido.status], ['Data Solicitação', fmtData(pedido.data_solicitacao)],
      ['Data Autorização', fmtData(pedido.data_autorizacao)],
      ['Emergência', pedido.emergencia ? 'Sim' : 'Não'],
      ['Cancelado', pedido.cancelado ? 'Sim' : 'Não'],
    ]
    if (pedido.observacao) fields.push(['Observação', pedido.observacao])
    if (statusNome) fields.push(['Status do Pedido', statusNome])
    if (pedido.usuario_autorizador) fields.push(['Autorizado por', pedido.usuario_autorizador])
    let y = 32
    fields.forEach(([k, v]) => { doc.setFont('helvetica', 'bold'); doc.text(k + ':', 20, y); doc.setFont('helvetica', 'normal'); doc.text(v ?? '—', 70, y); y += 7 })
    if (fluxo.length > 0) {
      y += 5; doc.setFont('helvetica', 'bold'); doc.text('Cronograma de Pagamentos', 20, y); y += 7
      doc.setFont('helvetica', 'normal')
      fluxo.forEach(r => { doc.text(`${r.mes}/${r.ano}`, 25, y); doc.text(fmtMoeda(Number(r.valor_referente)), 80, y); doc.text(r.status, 140, y); y += 6 })
    }
    doc.save(`pedido_${pedido.id}.pdf`)
  }

  const handleCancel = async () => {
    if (!pedido) return
    setCancelling(true)
    await supabase.from('pedidos_solicitados').update({ cancelado: true, status: 'Cancelado' }).eq('id', pedidoId)
    await supabase.from('pedidos_solicitados_fluxo').update({ status: 'Cancelado' }).eq('pedido_id', pedidoId)
    setCancelling(false); setConfirmCancel(false); load()
  }

  const handleEmpresaChange = async (empresa: string) => {
    setEditFormAjuste(f => ({ ...f, empresa, categoria: '' }))
    const { data } = await supabase.from('pedidos_solicitados').select('categoria').eq('empresa', empresa).order('categoria')
    setEditCategorias([...new Set((data ?? []).map((r: { categoria: string }) => r.categoria).filter(Boolean))])
  }

  const handleSaveEdit = async () => {
    if (!pedido) return
    setSavingEdit(true)
    await supabase.from('pedidos_solicitados').update({
      empresa: editForm.empresa,
      categoria: editForm.categoria,
      fornecedor: editForm.fornecedor,
      valor_pedido: parseFloat(editForm.valor_pedido) || pedido.valor_pedido,
      observacao: editForm.observacao || null,
    }).eq('id', pedidoId)
    setSavingEdit(false)
    setEditando(false)
    load()
  }

  const handleReenviar = async () => {
    if (!pedido || !user) return
    setReenviando(true)
    await supabase.from('pedidos_solicitados')
      .update({ status: 'Aguardando Autorização' })
      .eq('id', pedidoId)
    await supabase.from('comentarios').insert({
      pedido_id: pedidoId,
      comentario: 'Pedido reenviado para aprovação após ajustes.',
      usuario: user?.username ?? 'sistema',
      data_comentario: new Date().toISOString(),
      tipo_documento: null,
    })
    setReenviando(false)
    load()
  }

  if (loading) return <div className="card text-center py-16 text-slate-400">Carregando...</div>
  if (error || !pedido) return (
    <div className="card text-center py-12">
      <p className="text-red-600 mb-4">{error || 'Pedido não encontrado'}</p>
      <button onClick={() => router.back()} className="btn-secondary gap-1.5"><ArrowLeft size={14} /> Voltar</button>
    </div>
  )

  const isCancelado = pedido.cancelado || pedido.status === 'Cancelado'
  const canCancel = !isCancelado && pedido.status !== 'Não Autorizado'
  const hasDoc = !!(pedido.arquivo_texto || (pedido.arquivos_pdf_ids && pedido.arquivos_pdf_ids.length > 0))

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <button onClick={() => router.back()} className="btn-secondary p-2"><ArrowLeft size={16} /></button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="page-title">Pedido #{pedido.id}</h1>
              {pedido.emergencia && <span className="badge bg-orange-100 text-orange-700 flex items-center gap-1"><AlertTriangle size={10} /> Emergência</span>}
              {isCancelado && <span className="badge bg-red-100 text-red-700">Cancelado</span>}
            </div>
            <p className="page-subtitle">{pedido.empresa} · {pedido.categoria}</p>
          </div>
        </div>
        <span className={`badge text-sm px-3 py-1 ${
          pedido.status === 'Autorizado' ? 'bg-green-100 text-green-700' :
          pedido.status === 'Não Autorizado' ? 'bg-red-100 text-red-700' :
          pedido.status === 'Cancelado' ? 'bg-slate-200 text-slate-600' :
          pedido.status === 'Aguardando Ajuste' ? 'bg-orange-100 text-orange-700' :
          'bg-yellow-100 text-yellow-700'
        }`}>{pedido.status}</span>
      </div>

      {/* Action buttons */}
      <div className="flex flex-wrap gap-2">
        <button onClick={() => setShowPagamentos(true)}
          className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700">
          <CreditCard size={15} /> Controle de Pagamentos
        </button>
        {hasDoc && (
          <button onClick={() => setShowAnalise(true)}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700">
            <Brain size={15} /> Analisar Documento
          </button>
        )}
        <button onClick={handlePrint}
          className="inline-flex items-center gap-1.5 px-4 py-2 bg-slate-700 text-white rounded-lg text-sm font-medium hover:bg-slate-800">
          <Printer size={15} /> Imprimir Pedido
        </button>
        <button onClick={() => setShowContrato(true)}
          className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">
          <FileSignature size={15} /> Gerar Contrato
        </button>
        <button onClick={() => setShowComents(true)}
          className="inline-flex items-center gap-1.5 px-4 py-2 bg-slate-100 text-slate-700 border border-slate-200 rounded-lg text-sm font-medium hover:bg-slate-200">
          <MessageSquare size={15} /> Comentários
        </button>
        <button onClick={() => setShowDocs(true)}
          className="inline-flex items-center gap-1.5 px-4 py-2 bg-slate-100 text-slate-700 border border-slate-200 rounded-lg text-sm font-medium hover:bg-slate-200">
          <FileText size={15} /> Documentos
        </button>
      </div>

      {/* Banner de Ajuste */}
      {pedido.status === 'Aguardando Ajuste' && (
        <div className="border border-orange-200 bg-orange-50 rounded-xl p-5 space-y-4">
          <div className="flex items-start gap-3">
            <AlertTriangle size={20} className="text-orange-500 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-orange-800 mb-1">Este pedido aguarda ajustes solicitados pelo gestor</p>
              <p className="text-xs text-orange-700">Edite os campos necessários abaixo e clique em "Reenviar para Aprovação".</p>
            </div>
          </div>

          {/* Histórico de comentários de ajuste */}
          {comentariosAjuste.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-orange-800 uppercase tracking-wide">Comentários do Gestor</p>
              {comentariosAjuste.map(c => (
                <div key={c.id} className="bg-white border border-orange-200 rounded-lg px-4 py-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium text-slate-700">{c.usuario}</span>
                    <span className="text-xs text-slate-400">
                      {new Date(c.data_comentario).toLocaleString('pt-BR')}
                    </span>
                  </div>
                  <p className="text-sm text-slate-800 whitespace-pre-wrap">{c.comentario}</p>
                </div>
              ))}
            </div>
          )}

          {/* Formulário de edição */}
          {!editando ? (
            <button onClick={() => setEditando(true)} className="btn-secondary gap-1.5 text-sm">
              <Edit2 size={14} /> Editar Pedido
            </button>
          ) : (
            <div className="bg-white border border-orange-200 rounded-lg p-4 space-y-3">
              <p className="text-xs font-semibold text-slate-700 uppercase tracking-wide">Editar Dados do Pedido</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="label">Empresa</label>
                  <select className="input" value={editForm.empresa}
                    onChange={e => handleEmpresaChange(e.target.value)}>
                    <option value="">Selecionar...</option>
                    {editEmpresas.map(e => <option key={e} value={e}>{e}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">Categoria</label>
                  <select className="input" value={editForm.categoria}
                    onChange={e => setEditFormAjuste(f => ({ ...f, categoria: e.target.value }))}>
                    <option value="">Selecionar...</option>
                    {editCategorias.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">Fornecedor</label>
                  <select className="input" value={editForm.fornecedor}
                    onChange={e => setEditFormAjuste(f => ({ ...f, fornecedor: e.target.value }))}>
                    <option value="">Selecionar...</option>
                    {editFornecedores.map(f => <option key={f} value={f}>{f}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">Valor do Pedido (R$)</label>
                  <input type="number" step="0.01" className="input" value={editForm.valor_pedido}
                    onChange={e => setEditFormAjuste(f => ({ ...f, valor_pedido: e.target.value }))} />
                </div>
                <div className="md:col-span-2">
                  <label className="label">Observação</label>
                  <textarea className="input resize-none h-24" value={editForm.observacao}
                    onChange={e => setEditFormAjuste(f => ({ ...f, observacao: e.target.value }))} />
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={handleSaveEdit} disabled={savingEdit} className="btn-primary gap-1.5 text-sm">
                  {savingEdit ? <><RefreshCw size={13} className="animate-spin" /> Salvando...</> : <><Check size={13} /> Salvar Alterações</>}
                </button>
                <button onClick={() => setEditando(false)} className="btn-secondary text-sm">Cancelar</button>
              </div>
            </div>
          )}

          {/* Botão reenviar */}
          {!editando && (
            <button onClick={handleReenviar} disabled={reenviando}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-orange-500 text-white rounded-lg text-sm font-medium hover:bg-orange-600 disabled:opacity-50">
              {reenviando ? <><RefreshCw size={14} className="animate-spin" /> Reenviando...</> : <><Send size={14} /> Reenviar para Aprovação</>}
            </button>
          )}
        </div>
      )}

      {/* Info grid */}
      <div className="card">
        <h2 className="text-sm font-semibold text-slate-700 mb-4">Informações do Pedido</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-x-8 gap-y-4">
          <InfoField label="Empresa" value={pedido.empresa} />
          <InfoField label="Categoria" value={pedido.categoria} />
          <InfoField label="Fornecedor" value={pedido.fornecedor} />
          <InfoField label="Valor do Pedido" value={<span className="text-lg font-bold">{fmtMoeda(pedido.valor_pedido)}</span>} />
          <InfoField label="Status Autorização" value={pedido.status} />
          <InfoField label="Status do Pedido" value={statusNome ?? '—'} />
          <InfoField label="Data Solicitação" value={fmtData(pedido.data_solicitacao)} />
          <InfoField label="Data Autorização" value={fmtData(pedido.data_autorizacao)} />
          <InfoField label="Autorizado por" value={pedido.usuario_autorizador} />
          <InfoField label="Emergência" value={pedido.emergencia ? '⚠️ Sim' : 'Não'} />
          <InfoField label="Cancelado" value={isCancelado ? '❌ Sim' : 'Não'} />
          {pedido.observacao && (
            <div className="col-span-2 md:col-span-3">
              <p className="text-xs text-slate-400 mb-0.5">Observação</p>
              <p className="text-sm text-slate-800 bg-slate-50 rounded px-3 py-2 border border-slate-100 whitespace-pre-wrap">{pedido.observacao}</p>
            </div>
          )}
        </div>
      </div>

      {/* Fluxo table */}
      {fluxo.length > 0 && (
        <div className="card">
          <h2 className="text-sm font-semibold text-slate-700 mb-4">Cronograma de Pagamentos</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="table-header">
                  <th className="table-cell font-medium">Mês/Ano</th>
                  <th className="table-cell font-medium text-right">Valor</th>
                  <th className="table-cell font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {fluxo.map(r => (
                  <tr key={r.id} className="table-row">
                    <td className="table-cell">{r.mes}/{r.ano}</td>
                    <td className="table-cell text-right font-medium">{fmtMoeda(Number(r.valor_referente))}</td>
                    <td className="table-cell">
                      <span className={`badge ${r.status === 'Autorizado' ? 'bg-green-100 text-green-700' : r.status === 'Não Autorizado' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'}`}>{r.status}</span>
                    </td>
                  </tr>
                ))}
                <tr className="table-row bg-slate-50">
                  <td className="table-cell font-semibold">Total</td>
                  <td className="table-cell text-right font-bold">{fmtMoeda(fluxo.reduce((s, r) => s + Number(r.valor_referente), 0))}</td>
                  <td className="table-cell" />
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Cancel section */}
      {canCancel && (
        <div className="card border border-red-100">
          <h2 className="text-sm font-semibold text-slate-700 mb-3">Ações</h2>
          {pedido.status === 'Autorizado' && (
            <div className="mb-3 p-3 bg-orange-50 border border-orange-200 rounded-lg text-sm text-orange-800">
              ⚠️ Este pedido já foi autorizado. Ao cancelar, comunique imediatamente o fornecedor e verifique se há pagamentos pendentes.
            </div>
          )}
          <button onClick={() => setConfirmCancel(true)} className="btn-danger gap-1.5">
            <X size={14} /> Cancelar Pedido
          </button>
        </div>
      )}

      {/* Modals */}
      <ControlePagamentosModal open={showPagamentos} onClose={() => setShowPagamentos(false)}
        pedidoId={pedidoId} username={user?.username ?? ''} />
      <ComentariosModal open={showComents} onClose={() => setShowComents(false)}
        pedidoId={pedidoId} username={user?.username ?? ''} />
      <DocumentosModal open={showDocs} onClose={() => setShowDocs(false)}
        pedidoId={pedidoId} pedidoArquivosIds={pedido.arquivos_pdf_ids}
        pagamentos={pagamentos} />
      <AnaliseModal open={showAnalise} onClose={() => setShowAnalise(false)} pedidoId={pedidoId} />
      {pedido && (
        <ContratoModal open={showContrato} onClose={() => setShowContrato(false)} pedido={pedido} />
      )}

      <Confirm
        open={confirmCancel}
        onClose={() => setConfirmCancel(false)}
        onConfirm={handleCancel}
        title="Cancelar Pedido"
        message={`Confirma o cancelamento do pedido #${pedidoId}? Esta ação não pode ser desfeita.`}
        confirmLabel="Cancelar Pedido"
        loading={cancelling}
      />
    </div>
  )
}
