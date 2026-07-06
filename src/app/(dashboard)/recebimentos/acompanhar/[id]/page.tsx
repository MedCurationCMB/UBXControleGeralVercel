'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabaseBrowser as supabase } from '@/lib/supabase/client'
import {
  ArrowLeft, AlertTriangle, RefreshCw,
  MessageSquare, FileText, Upload, ExternalLink,
  X, ChevronDown, ChevronUp, CreditCard, Check, Edit2,
} from 'lucide-react'
import Modal from '@/components/ui/Modal'
import Confirm from '@/components/ui/Confirm'

// --- Types ---
interface Pedido {
  id: number; empresa: string; categoria: string; cliente: string
  valor_pedido: number; observacao: string | null; emergencia: boolean
  data_solicitacao: string; data_autorizacao: string | null; status: string
  cancelado: boolean; usuario_autorizador: string | null
  pedido_status_receita: number | null; arquivo_texto: string | null; analise_texto: string | null
  arquivos_pdf_ids: string[] | null
}
interface FluxoRow { id: number; mes: number; ano: number; valor_referente: number; status: string }
interface Comentario {
  id: number; comentario: string; usuario: string; data_comentario: string
  tipo_documento: number | null; anexo_id: string | null
}
interface Documento {
  id: number; nome_documento: string; anexo_id: string | null; anexo_url: string | null
  tipo_documento: number | null; tipo_nome?: string; data_upload: string; comentario_id: number | null
}
interface TipoDoc { id: number; tipo: string }
interface Recebimento {
  id: number; pedido_id: number; data_vencimento: string | null; valor_pagar: number
  data_pagamento: string | null; valor_pagamento: number | null
  status_pagamento: number | null; tipo_pagamento: number | null; anexo_url: string | null
}
interface RecebimentoStatus { id: number; nome_status: string }
interface TipoRecebimento { id: number; tipos: string }
interface StatusPedido { id: number; nome_status: string }

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

// --- Controle de Recebimentos Modal ---
function ControleRecebimentosModal({
  open, onClose, pedidoId,
}: {
  open: boolean; onClose: () => void; pedidoId: number
}) {
  const [tab, setTab] = useState<'individual' | 'lote' | 'comprovante'>('individual')
  const [recebimentos, setRecebimentos] = useState<Recebimento[]>([])
  const [statusList, setStatusList] = useState<RecebimentoStatus[]>([])
  const [tiposList, setTiposList] = useState<TipoRecebimento[]>([])
  const [loading, setLoading] = useState(false)

  const [dataVenc, setDataVenc] = useState(new Date().toISOString().split('T')[0])
  const [valorPagar, setValorPagar] = useState('')
  const [tipoAdd, setTipoAdd] = useState<number | ''>('')
  const [adding, setAdding] = useState(false)

  const [editId, setEditId] = useState<number | null>(null)
  const [editForm, setEditForm] = useState<Partial<Recebimento>>({})

  const [bulkSelected, setBulkSelected] = useState<Set<number>>(new Set())
  const [bulkFilterStatus, setBulkFilterStatus] = useState('')
  const [bulkNewStatus, setBulkNewStatus] = useState<number | ''>('')
  const [bulkApplying, setBulkApplying] = useState(false)

  const [comprovantePayId, setComprovantePayId] = useState<number | ''>('')
  const [comprovanteFile, setComprovanteFile] = useState<File | null>(null)
  const [comprovanteUploading, setComprovanteUploading] = useState(false)
  const [comprovanteMsg, setComprovanteMsg] = useState('')
  const comprFileRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const [{ data: recs }, { data: st }, { data: tipos }] = await Promise.all([
      supabase.from('controle_recebimento').select('*').eq('pedido_id', pedidoId).order('data_vencimento'),
      supabase.from('recebimento_status').select('id, nome_status').order('id'),
      supabase.from('tipos_recebimento').select('id, tipos').order('id'),
    ])
    setRecebimentos(recs ?? [])
    setStatusList(st ?? [])
    setTiposList(tipos ?? [])
    setLoading(false)
  }, [pedidoId])

  useEffect(() => { if (open) load() }, [open, load])

  const statusMap = Object.fromEntries(statusList.map(s => [s.id, s.nome_status]))
  const tiposMap = Object.fromEntries(tiposList.map(t => [t.id, t.tipos]))

  const recsFiltrados = bulkFilterStatus
    ? recebimentos.filter(r => r.status_pagamento === Number(bulkFilterStatus))
    : recebimentos

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!valorPagar || tipoAdd === '') return
    setAdding(true)
    await supabase.from('controle_recebimento').insert({
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

  const startEdit = (r: Recebimento) => {
    setEditId(r.id)
    setEditForm({
      data_pagamento: r.data_pagamento,
      valor_pagamento: r.valor_pagamento,
      status_pagamento: r.status_pagamento,
      tipo_pagamento: r.tipo_pagamento,
    })
  }

  const saveEdit = async () => {
    if (!editId) return
    await supabase.from('controle_recebimento').update(editForm).eq('id', editId)
    setEditId(null)
    load()
  }

  const handleBulkApply = async () => {
    if (!bulkNewStatus || bulkSelected.size === 0) return
    setBulkApplying(true)
    await supabase.from('controle_recebimento')
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
    fd.append('modulo', 'recebimentos')
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
    { id: 'individual', label: 'Adicionar Recebimento' },
    { id: 'lote', label: 'Alterar Status em Lote' },
    { id: 'comprovante', label: 'Comprovante' },
  ] as const

  return (
    <Modal open={open} onClose={onClose} title={`Controle de Recebimentos — Pedido #${pedidoId}`} size="lg">
      <div className="flex border-b border-slate-200 mb-4 -mx-5 px-5">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${tab === t.id ? 'border-blue-500 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'individual' && (
        <div className="space-y-4">
          <form onSubmit={handleAdd} className="p-4 bg-slate-50 rounded-lg border border-slate-200">
            <p className="text-xs font-semibold text-slate-600 mb-3">Novo recebimento</p>
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
              {adding ? 'Adicionando...' : '+ Adicionar Recebimento'}
            </button>
          </form>

          {loading ? (
            <p className="text-slate-400 text-sm">Carregando...</p>
          ) : recebimentos.length === 0 ? (
            <p className="text-slate-400 text-sm text-center py-6">Nenhum recebimento cadastrado.</p>
          ) : (
            <div className="overflow-auto max-h-64 border border-slate-200 rounded-lg">
              <table className="w-full text-xs">
                <thead className="sticky top-0 z-10 table-header">
                  <tr>
                    <th className="table-cell font-medium">ID</th>
                    <th className="table-cell font-medium">Vencimento</th>
                    <th className="table-cell font-medium text-right">A Receber</th>
                    <th className="table-cell font-medium">Status</th>
                    <th className="table-cell font-medium">Tipo</th>
                    <th className="table-cell font-medium">Data Rec.</th>
                    <th className="table-cell font-medium text-right">Recebido</th>
                    <th className="table-cell font-medium w-16"></th>
                  </tr>
                </thead>
                <tbody>
                  {recebimentos.map(r => (
                    editId === r.id ? (
                      <tr key={r.id} className="bg-blue-50">
                        <td className="table-cell">{r.id}</td>
                        <td className="table-cell">{fmtData(r.data_vencimento)}</td>
                        <td className="table-cell text-right">{fmtMoeda(r.valor_pagar)}</td>
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
                      <tr key={r.id} className="table-row">
                        <td className="table-cell text-slate-500">{r.id}</td>
                        <td className="table-cell">{fmtData(r.data_vencimento)}</td>
                        <td className="table-cell text-right font-medium">{fmtMoeda(r.valor_pagar)}</td>
                        <td className="table-cell">
                          <span className={`badge text-xs ${r.status_pagamento ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-500'}`}>
                            {r.status_pagamento ? statusMap[r.status_pagamento] ?? '?' : '—'}
                          </span>
                        </td>
                        <td className="table-cell text-slate-600">{r.tipo_pagamento ? tiposMap[r.tipo_pagamento] ?? '?' : '—'}</td>
                        <td className="table-cell">{fmtData(r.data_pagamento)}</td>
                        <td className="table-cell text-right">{fmtMoeda(r.valor_pagamento)}</td>
                        <td className="table-cell">
                          <button onClick={() => startEdit(r)} className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded"><Edit2 size={13} /></button>
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

          {recsFiltrados.length === 0 ? (
            <p className="text-slate-400 text-sm text-center py-6">Nenhum recebimento.</p>
          ) : (
            <>
              <label className="flex items-center gap-2 cursor-pointer text-sm text-slate-600">
                <input type="checkbox" className="w-4 h-4 accent-blue-600"
                  checked={bulkSelected.size === recsFiltrados.length}
                  onChange={() => setBulkSelected(bulkSelected.size === recsFiltrados.length ? new Set() : new Set(recsFiltrados.map(r => r.id)))} />
                Selecionar todos ({recsFiltrados.length})
              </label>

              <div className="space-y-1 max-h-56 overflow-y-auto">
                {recsFiltrados.map(r => (
                  <label key={r.id} className={`flex items-center gap-3 p-2 rounded border cursor-pointer ${bulkSelected.has(r.id) ? 'bg-blue-50 border-blue-200' : 'border-slate-100 hover:bg-slate-50'}`}>
                    <input type="checkbox" className="w-4 h-4 accent-blue-600 shrink-0"
                      checked={bulkSelected.has(r.id)}
                      onChange={() => setBulkSelected(prev => { const n = new Set(prev); n.has(r.id) ? n.delete(r.id) : n.add(r.id); return n })} />
                    <span className="text-sm flex-1">#{r.id} — {fmtData(r.data_vencimento)} — {fmtMoeda(r.valor_pagar)}</span>
                    <span className="text-xs text-slate-500">{r.status_pagamento ? statusMap[r.status_pagamento] : 'Sem status'}</span>
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

      {tab === 'comprovante' && (
        <div className="space-y-4">
          <form onSubmit={handleUploadComprovante} className="p-4 bg-slate-50 rounded-lg border border-slate-200">
            <p className="text-xs font-semibold text-slate-600 mb-3">Anexar comprovante de recebimento</p>
            <div className="space-y-3">
              <div>
                <label className="label">Recebimento *</label>
                <select className="input" value={comprovantePayId}
                  onChange={e => setComprovantePayId(e.target.value === '' ? '' : Number(e.target.value))}>
                  <option value="">Selecionar...</option>
                  {recebimentos.map(r => (
                    <option key={r.id} value={r.id}>
                      #{r.id} — Venc. {fmtData(r.data_vencimento)} — {fmtMoeda(r.valor_pagar)}
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

// --- Comentários Modal ---
function ComentariosModal({ open, onClose, pedidoId, username }: {
  open: boolean; onClose: () => void; pedidoId: number; username: string
}) {
  const [comentarios, setComentarios] = useState<Comentario[]>([])
  const [tiposDocs, setTiposDocs] = useState<TipoDoc[]>([])
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
      supabase.from('comentarios_receita').select('*').eq('pedido_id', pedidoId).order('data_comentario', { ascending: false }),
      supabase.from('tipos_documento').select('id, tipo').order('tipo'),
      supabase.from('documentos_receita').select('comentario_id, anexo_id').eq('pedido_id', pedidoId).not('comentario_id', 'is', null),
    ])
    setComentarios(coms ?? [])
    setTiposDocs(tipos ?? [])
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

    let anexo_id: string | null = null

    if (file) {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('pedido_id', String(pedidoId))
      fd.append('tipo_documento', tipoId !== '' ? String(tipoId) : '-1')
      fd.append('modulo', 'recebimentos')
      const r = await fetch('/api/documentos/upload', { method: 'POST', body: fd })
      if (r.ok) {
        const d = await r.json()
        anexo_id = d.documento?.anexo_id ?? null
      }
    }

    const { data: newCom } = await supabase.from('comentarios_receita').insert({
      pedido_id: pedidoId,
      comentario: texto.trim(),
      usuario: username,
      data_comentario: new Date().toISOString(),
      tipo_documento: tipoId !== '' ? tipoId : null,
      anexo_id,
    }).select().single()

    if (newCom && anexo_id) {
      await supabase.from('documentos_receita')
        .update({ comentario_id: newCom.id })
        .eq('pedido_id', pedidoId)
        .eq('anexo_id', anexo_id)
    }

    setTexto('')
    setTipoId('')
    setFile(null)
    if (fileRef.current) fileRef.current.value = ''
    setSaving(false)
    load()
  }

  return (
    <Modal open={open} onClose={onClose} title={`Comentários — Pedido #${pedidoId}`} size="lg">
      <div className="space-y-4">
        <div className="max-h-64 overflow-y-auto space-y-3 pr-1">
          {loading && <p className="text-slate-400 text-sm">Carregando...</p>}
          {!loading && comentarios.length === 0 && (
            <p className="text-slate-400 text-sm text-center py-6">Nenhum comentário ainda.</p>
          )}
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
                <option value="">Tipo de documento (opcional)</option>
                {tiposDocs.map(t => <option key={t.id} value={t.id}>{t.tipo}</option>)}
              </select>
              <div>
                <input ref={fileRef} type="file" className="hidden" onChange={e => setFile(e.target.files?.[0] ?? null)} />
                <button type="button" onClick={() => fileRef.current?.click()}
                  className="btn-secondary w-full justify-center text-xs gap-1.5">
                  <Upload size={13} /> {file ? file.name.slice(0, 20) + '…' : 'Anexar arquivo'}
                </button>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={onClose} className="btn-secondary text-sm">Fechar</button>
              <button type="submit" disabled={saving || !texto.trim()} className="btn-primary text-sm">
                {saving ? 'Salvando...' : 'Adicionar'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </Modal>
  )
}

// --- Documentos Modal ---
function DocumentosModal({
  open, onClose, pedidoId, pedidoArquivosIds,
}: {
  open: boolean; onClose: () => void; pedidoId: number
  pedidoArquivosIds: string[] | null
}) {
  const [docs, setDocs] = useState<Documento[]>([])
  const [tiposDocs, setTiposDocs] = useState<TipoDoc[]>([])
  const [loading, setLoading] = useState(false)
  const [tipoId, setTipoId] = useState<number | ''>('')
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadMsg, setUploadMsg] = useState('')
  const [uploadError, setUploadError] = useState('')
  const [expanded, setExpanded] = useState<Set<string>>(new Set(['Documentos de Solicitação']))
  const fileRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const [{ data: d }, { data: t }] = await Promise.all([
      supabase.from('documentos_receita').select('*').eq('pedido_id', pedidoId).order('data_upload', { ascending: false }),
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

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault()
    setUploadError('')
    if (!file) { setUploadError('Selecione um arquivo.'); return }
    if (tipoId === '') { setUploadError('Selecione o tipo de documento.'); return }

    setUploading(true)
    const fd = new FormData()
    fd.append('file', file)
    fd.append('pedido_id', String(pedidoId))
    fd.append('tipo_documento', String(tipoId))
    fd.append('modulo', 'recebimentos')

    const r = await fetch('/api/documentos/upload', { method: 'POST', body: fd })
    setUploading(false)

    if (!r.ok) { setUploadError('Erro ao enviar.'); return }

    setFile(null); if (fileRef.current) fileRef.current.value = ''
    setTipoId('')
    setUploadMsg('Documento enviado!')
    setTimeout(() => setUploadMsg(''), 2000)
    load()
  }

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
        <form onSubmit={handleUpload} className="p-3 bg-slate-50 rounded-lg border border-slate-200 space-y-3">
          <p className="text-xs font-semibold text-slate-600">Adicionar documento</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Tipo de Documento *</label>
              <select className="input" value={tipoId} onChange={e => setTipoId(e.target.value === '' ? '' : Number(e.target.value))}>
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

          {uploadError && <p className="text-xs text-red-600">{uploadError}</p>}
          {uploadMsg && <p className="text-xs text-green-600">{uploadMsg}</p>}
          <button type="submit" disabled={uploading || !file || tipoId === ''} className="btn-primary text-sm gap-1">
            <Upload size={13} /> {uploading ? 'Enviando...' : 'Enviar Documento'}
          </button>
        </form>

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

// --- Cancel section ---
function CancelarSection({ pedido, onCancel }: { pedido: Pedido; onCancel: () => void }) {
  const [confirmCancel, setConfirmCancel] = useState(false)
  const [cancelling, setCancelling] = useState(false)

  const handleCancel = async () => {
    setCancelling(true)
    await supabase.from('pedidos_solicitados_receita')
      .update({ cancelado: true, status: 'Cancelado' })
      .eq('id', pedido.id)
    await supabase.from('pedidos_solicitados_fluxo_receita')
      .update({ status: 'Cancelado' })
      .eq('pedido_id', pedido.id)
    setCancelling(false)
    setConfirmCancel(false)
    onCancel()
  }

  const isCancelado = pedido.cancelado || pedido.status === 'Cancelado'
  if (isCancelado) return null

  return (
    <div className="card border border-red-100">
      <h2 className="text-sm font-semibold text-slate-700 mb-3">Cancelar Pedido</h2>
      {pedido.status === 'Autorizado' && (
        <div className="mb-3 p-3 bg-orange-50 border border-orange-200 rounded-lg text-sm text-orange-800">
          ⚠️ Este pedido já foi autorizado. Ao cancelar, comunique imediatamente o cliente e verifique se há recebimentos pendentes.
        </div>
      )}
      <button onClick={() => setConfirmCancel(true)} className="btn-danger gap-1.5">
        <X size={14} /> Cancelar Pedido
      </button>
      <Confirm
        open={confirmCancel}
        onClose={() => setConfirmCancel(false)}
        onConfirm={handleCancel}
        title="Cancelar Pedido"
        message={`Confirma o cancelamento do pedido #${pedido.id}? Esta ação não pode ser desfeita.`}
        confirmLabel="Cancelar Pedido"
        loading={cancelling}
      />
    </div>
  )
}

// --- Main Page ---
export default function AcompanharRecebimentoDetalhePage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const pedidoId = parseInt(id)

  const [pedido, setPedido] = useState<Pedido | null>(null)
  const [fluxo, setFluxo] = useState<FluxoRow[]>([])
  const [statusNome, setStatusNome] = useState<string | null>(null)
  const [user, setUser] = useState<{ username: string } | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [showRecebimentos, setShowRecebimentos] = useState(false)
  const [showComents, setShowComents] = useState(false)
  const [showDocs, setShowDocs] = useState(false)

  const load = useCallback(async () => {
    setLoading(true); setError('')
    const [{ data: p, error: pErr }, { data: fl }, u] = await Promise.all([
      supabase.from('pedidos_solicitados_receita').select('*').eq('id', pedidoId).maybeSingle(),
      supabase.from('pedidos_solicitados_fluxo_receita').select('*').eq('pedido_id', pedidoId).order('ano').order('mes'),
      fetch('/api/auth/me').then(r => r.json()),
    ])
    if (pErr || !p) { setError('Pedido não encontrado.'); setLoading(false); return }
    setPedido(p as Pedido); setFluxo(fl ?? []); setUser(u)
    if ((p as Pedido).pedido_status_receita) {
      const { data: st } = await supabase.from('pedido_status_receita').select('nome_status').eq('id', (p as Pedido).pedido_status_receita).maybeSingle()
      setStatusNome((st as StatusPedido | null)?.nome_status ?? null)
    }
    setLoading(false)
  }, [pedidoId])

  useEffect(() => { if (!isNaN(pedidoId)) load() }, [load, pedidoId])

  if (loading) return <div className="card text-center py-16 text-slate-400">Carregando...</div>
  if (error || !pedido) return (
    <div className="card text-center py-12">
      <p className="text-red-600 mb-4">{error || 'Pedido não encontrado'}</p>
      <button onClick={() => router.back()} className="btn-secondary gap-1.5"><ArrowLeft size={14} /> Voltar</button>
    </div>
  )

  const isCancelado = pedido.cancelado || pedido.status === 'Cancelado'

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <button onClick={() => router.back()} className="btn-secondary p-2"><ArrowLeft size={16} /></button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="page-title">Pedido #{pedido.id}</h1>
              {pedido.emergencia && (
                <span className="badge bg-orange-100 text-orange-700 flex items-center gap-1">
                  <AlertTriangle size={10} /> Emergência
                </span>
              )}
              {isCancelado && <span className="badge bg-red-100 text-red-700">Cancelado</span>}
            </div>
            <p className="page-subtitle">{pedido.empresa} · {pedido.categoria}</p>
          </div>
        </div>
        <span className={`badge text-sm px-3 py-1 ${
          pedido.status === 'Autorizado' ? 'bg-green-100 text-green-700' :
          pedido.status === 'Não Autorizado' ? 'bg-red-100 text-red-700' :
          pedido.status === 'Cancelado' ? 'bg-slate-200 text-slate-600' :
          'bg-yellow-100 text-yellow-700'
        }`}>{pedido.status}</span>
      </div>

      {/* Action buttons */}
      <div className="flex flex-wrap gap-2">
        <button onClick={() => setShowRecebimentos(true)}
          className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700">
          <CreditCard size={15} /> Controle de Recebimentos
        </button>
        <button onClick={() => setShowComents(true)}
          className="inline-flex items-center gap-1.5 px-4 py-2 bg-slate-100 text-slate-700 border border-slate-200 rounded-lg text-sm font-medium hover:bg-slate-200">
          <MessageSquare size={15} /> Comentários
        </button>
        <button onClick={() => setShowDocs(true)}
          className="inline-flex items-center gap-1.5 px-4 py-2 bg-slate-100 text-slate-700 border border-slate-200 rounded-lg text-sm font-medium hover:bg-slate-200">
          <FileText size={15} /> Documentos
        </button>
        <button onClick={load} className="btn-secondary p-2" title="Atualizar">
          <RefreshCw size={16} />
        </button>
      </div>

      {/* Info grid */}
      <div className="card">
        <h2 className="text-sm font-semibold text-slate-700 mb-4">Informações do Pedido</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-x-8 gap-y-4">
          <InfoField label="Empresa" value={pedido.empresa} />
          <InfoField label="Categoria" value={pedido.categoria} />
          <InfoField label="Cliente" value={pedido.cliente} />
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
          <h2 className="text-sm font-semibold text-slate-700 mb-4">Cronograma de Recebimentos</h2>
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
                      <span className={`badge ${
                        r.status === 'Autorizado' ? 'bg-green-100 text-green-700' :
                        r.status === 'Não Autorizado' ? 'bg-red-100 text-red-700' :
                        'bg-yellow-100 text-yellow-700'
                      }`}>{r.status}</span>
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

      {/* Cancel section (view-only page still allows cancellation) */}
      <CancelarSection pedido={pedido} onCancel={load} />

      {/* Modals */}
      <ControleRecebimentosModal open={showRecebimentos} onClose={() => setShowRecebimentos(false)}
        pedidoId={pedidoId} />
      <ComentariosModal open={showComents} onClose={() => setShowComents(false)}
        pedidoId={pedidoId} username={user?.username ?? ''} />
      <DocumentosModal open={showDocs} onClose={() => setShowDocs(false)}
        pedidoId={pedidoId} pedidoArquivosIds={pedido.arquivos_pdf_ids} />
    </div>
  )
}
