'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabaseBrowser as supabase } from '@/lib/supabase/client'
import {
  ArrowLeft, AlertTriangle, RefreshCw, MessageSquare, FileText,
  Printer, Brain, FileSignature, X, ExternalLink, Upload,
  CreditCard, Check, Edit2,
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
interface Recebimento {
  id: number; pedido_id: number; data_vencimento: string | null; valor_pagar: number
  data_recebimento: string | null; valor_recebimento: number | null
  status_pagamento: number | null; tipo_recebimento: number | null
}
interface RecebimentoStatus { id: number; nome_status: string }
interface TipoRecebimento { id: number; tipos: string }
interface ModeloContrato { id: number; nome: string; estilo: string }
interface PedidoStatusReceita { id: number; nome_status: string }

const fmtMoeda = (v: number | null) =>
  v != null ? Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '—'
const fmtData = (d: string | null) =>
  d ? new Date(d.includes('T') ? d : d + 'T12:00:00').toLocaleDateString('pt-BR') : '—'
const MESES = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']

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
  open, onClose, pedidoId, username,
}: {
  open: boolean; onClose: () => void; pedidoId: number; username: string
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
      tipo_recebimento: tipoAdd,
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
      data_recebimento: r.data_recebimento,
      valor_recebimento: r.valor_recebimento,
      status_pagamento: r.status_pagamento,
      tipo_recebimento: r.tipo_recebimento,
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
    await fetch('/api/documentos/upload', { method: 'POST', body: fd })
    setComprovanteUploading(false)
    setComprovanteFile(null)
    if (comprFileRef.current) comprFileRef.current.value = ''
    setComprovanteMsg('Comprovante enviado!')
    setTimeout(() => setComprovanteMsg(''), 2500)
  }

  const tabs = [
    { id: 'individual', label: 'Adicionar Recebimento' },
    { id: 'lote', label: 'Alterar Status em Lote' },
    { id: 'comprovante', label: 'Comprovante' },
  ] as const

  return (
    <Modal open={open} onClose={onClose} title={`Controle de Recebimentos — Pedido #${pedidoId}`} size="lg">
      <div className="flex border-b border-slate-200 mb-4 -mx-5 px-5 overflow-x-auto">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${tab === t.id ? 'border-blue-500 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab: Adicionar Individual */}
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
                <select className="input" value={tipoAdd}
                  onChange={e => setTipoAdd(e.target.value === '' ? '' : Number(e.target.value))} required>
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
                          <select className="input text-xs py-0.5 px-1" value={editForm.tipo_recebimento ?? ''}
                            onChange={e => setEditForm(f => ({ ...f, tipo_recebimento: e.target.value ? Number(e.target.value) : null }))}>
                            <option value="">—</option>
                            {tiposList.map(t => <option key={t.id} value={t.id}>{t.tipos}</option>)}
                          </select>
                        </td>
                        <td className="table-cell">
                          <input className="input text-xs py-0.5 px-1" type="date" value={editForm.data_recebimento ?? ''}
                            onChange={e => setEditForm(f => ({ ...f, data_recebimento: e.target.value || null }))} />
                        </td>
                        <td className="table-cell">
                          <input className="input text-xs py-0.5 px-1 w-20" type="number" step="0.01"
                            value={editForm.valor_recebimento ?? ''}
                            onChange={e => setEditForm(f => ({ ...f, valor_recebimento: e.target.value ? parseFloat(e.target.value) : null }))} />
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
                        <td className="table-cell text-slate-600">{r.tipo_recebimento ? tiposMap[r.tipo_recebimento] ?? '?' : '—'}</td>
                        <td className="table-cell">{fmtData(r.data_recebimento)}</td>
                        <td className="table-cell text-right">{fmtMoeda(r.valor_recebimento)}</td>
                        <td className="table-cell">
                          <button onClick={() => startEdit(r)} className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded">
                            <Edit2 size={13} />
                          </button>
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
              <select className="input" value={bulkFilterStatus}
                onChange={e => { setBulkFilterStatus(e.target.value); setBulkSelected(new Set()) }}>
                <option value="">Todos</option>
                {statusList.map(s => <option key={s.id} value={s.id}>{s.nome_status}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Novo status</label>
              <select className="input" value={bulkNewStatus}
                onChange={e => setBulkNewStatus(e.target.value === '' ? '' : Number(e.target.value))}>
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
                  onChange={() => setBulkSelected(
                    bulkSelected.size === recsFiltrados.length ? new Set() : new Set(recsFiltrados.map(r => r.id))
                  )} />
                Selecionar todos ({recsFiltrados.length})
              </label>
              <div className="space-y-1 max-h-56 overflow-y-auto">
                {recsFiltrados.map(r => (
                  <label key={r.id}
                    className={`flex items-center gap-3 p-2 rounded border cursor-pointer ${bulkSelected.has(r.id) ? 'bg-blue-50 border-blue-200' : 'border-slate-100 hover:bg-slate-50'}`}>
                    <input type="checkbox" className="w-4 h-4 accent-blue-600 shrink-0"
                      checked={bulkSelected.has(r.id)}
                      onChange={() => setBulkSelected(prev => {
                        const n = new Set(prev); n.has(r.id) ? n.delete(r.id) : n.add(r.id); return n
                      })} />
                    <span className="text-sm flex-1">#{r.id} — {fmtData(r.data_vencimento)} — {fmtMoeda(r.valor_pagar)}</span>
                    <span className="text-xs text-slate-500">
                      {r.status_pagamento ? statusMap[r.status_pagamento] : 'Sem status'}
                    </span>
                  </label>
                ))}
              </div>
              <div className="flex items-center justify-between pt-2 border-t border-slate-200">
                <span className="text-sm text-slate-600">{bulkSelected.size} selecionado(s)</span>
                <button onClick={handleBulkApply}
                  disabled={bulkApplying || bulkSelected.size === 0 || bulkNewStatus === ''}
                  className="btn-primary text-sm">
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
              <button type="submit"
                disabled={!comprovanteFile || comprovantePayId === '' || comprovanteUploading}
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

// --- Comentarios Modal ---
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
    const { data: newCom } = await supabase.from('comentarios_receita').insert({
      pedido_id: pedidoId, comentario: texto.trim(), usuario: username,
      data_comentario: new Date().toISOString(),
    }).select().single()

    if (newCom && file) {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('pedido_id', String(pedidoId))
      fd.append('tipo_documento', tipoId !== '' ? String(tipoId) : '-1')
      fd.append('comentario_id', String(newCom.id))
      fd.append('modulo', 'recebimentos')
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
              <select className="input" value={tipoId}
                onChange={e => setTipoId(e.target.value === '' ? '' : Number(e.target.value))}>
                <option value="">Tipo de arquivo (opcional)</option>
                {tiposDocs.map(t => <option key={t.id} value={t.id}>{t.tipo}</option>)}
              </select>
              <div>
                <input ref={fileRef} type="file" className="hidden"
                  onChange={e => setFile(e.target.files?.[0] ?? null)} />
                <button type="button" onClick={() => fileRef.current?.click()}
                  className="btn-secondary w-full text-xs gap-1">
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

// --- Documentos Modal ---
function DocumentosModal({ open, onClose, pedidoId }: {
  open: boolean; onClose: () => void; pedidoId: number
}) {
  const [docs, setDocs] = useState<Documento[]>([])
  const [tiposDocs, setTiposDocs] = useState<TipoDoc[]>([])
  const [loading, setLoading] = useState(false)
  const [tipoId, setTipoId] = useState<number | ''>('')
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadMsg, setUploadMsg] = useState('')
  const [uploadError, setUploadError] = useState('')
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
    const resData = await r.json()
    setUploading(false)
    if (!r.ok) { setUploadError(resData.error ?? 'Erro ao enviar.'); return }
    setFile(null)
    if (fileRef.current) fileRef.current.value = ''
    setTipoId('')
    setUploadMsg('Documento enviado!')
    setTimeout(() => setUploadMsg(''), 2500)
    load()
  }

  const grouped = docs.reduce<Record<string, Documento[]>>((acc, doc) => {
    const key = doc.tipo_nome ?? 'Sem tipo'
    if (!acc[key]) acc[key] = []
    acc[key].push(doc)
    return acc
  }, {})

  return (
    <Modal open={open} onClose={onClose} title={`Documentos — Pedido #${pedidoId}`} size="lg">
      <div className="space-y-4">
        <form onSubmit={handleUpload} className="p-4 bg-slate-50 rounded-lg border border-slate-200 space-y-3">
          <p className="text-xs font-semibold text-slate-600">Enviar documento</p>
          <div className="grid grid-cols-2 gap-3">
            <select className="input" value={tipoId}
              onChange={e => setTipoId(e.target.value === '' ? '' : Number(e.target.value))} required>
              <option value="">Tipo de documento *</option>
              {tiposDocs.map(t => <option key={t.id} value={t.id}>{t.tipo}</option>)}
            </select>
            <div>
              <input ref={fileRef} type="file" className="hidden"
                onChange={e => setFile(e.target.files?.[0] ?? null)} />
              <button type="button" onClick={() => fileRef.current?.click()}
                className="btn-secondary w-full text-sm gap-1.5">
                <Upload size={14} /> {file ? file.name.slice(0, 25) + '…' : 'Selecionar arquivo'}
              </button>
            </div>
          </div>
          {uploadError && <p className="text-sm text-red-600">{uploadError}</p>}
          {uploadMsg && <p className="text-sm text-green-600">{uploadMsg}</p>}
          <button type="submit" disabled={uploading || !file || tipoId === ''} className="btn-primary text-sm">
            {uploading ? 'Enviando...' : 'Enviar'}
          </button>
        </form>

        {loading ? (
          <p className="text-slate-400 text-sm">Carregando...</p>
        ) : docs.length === 0 ? (
          <p className="text-slate-400 text-sm text-center py-6">Nenhum documento.</p>
        ) : (
          <div className="space-y-3 max-h-72 overflow-y-auto">
            {Object.entries(grouped).map(([tipo, grupo]) => (
              <div key={tipo}>
                <p className="text-xs font-semibold text-slate-500 mb-1">{tipo}</p>
                <div className="space-y-1">
                  {grupo.map(doc => (
                    <div key={doc.id} className="flex items-center justify-between p-2 bg-white border border-slate-200 rounded text-xs">
                      <span className="text-slate-700 truncate max-w-xs">{doc.nome_documento}</span>
                      <div className="flex items-center gap-2 shrink-0 ml-2">
                        <span className="text-slate-400">{fmtData(doc.data_upload)}</span>
                        {doc.anexo_id && (
                          <a href={`/api/b2/file?fileId=${doc.anexo_id}`} target="_blank" rel="noopener noreferrer"
                            className="text-blue-600 hover:underline flex items-center gap-0.5">
                            <ExternalLink size={11} /> Ver
                          </a>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="flex justify-end pt-3 border-t border-slate-200">
          <button onClick={onClose} className="btn-secondary text-sm">Fechar</button>
        </div>
      </div>
    </Modal>
  )
}

// --- Analise Modal ---
function AnaliseModal({ open, onClose, pedidoId }: {
  open: boolean; onClose: () => void; pedidoId: number
}) {
  const [analise, setAnalise] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [semDoc, setSemDoc] = useState(false)
  const [error, setError] = useState('')
  const [cached, setCached] = useState(false)

  useEffect(() => {
    if (!open) return
    setAnalise(null); setSemDoc(false); setError(''); setCached(false)
    setLoading(true)
    fetch(`/api/pedidos-receita/${pedidoId}/analise`)
      .then(r => r.json())
      .then(data => {
        if (data.sem_documento) setSemDoc(true)
        else if (data.error) setError(data.error)
        else { setAnalise(data.analise); setCached(data.cached) }
      })
      .catch(() => setError('Erro ao buscar análise.'))
      .finally(() => setLoading(false))
  }, [open, pedidoId])

  return (
    <Modal open={open} onClose={onClose} title={`Análise do Documento — Pedido #${pedidoId}`} size="lg">
      <div className="space-y-3">
        {loading && <p className="text-slate-400 text-sm text-center py-8">Analisando documento com IA...</p>}
        {semDoc && <p className="text-slate-500 text-sm text-center py-8">Nenhum documento encontrado para análise.</p>}
        {error && <p className="text-red-600 text-sm">{error}</p>}
        {analise && (
          <>
            {cached && <p className="text-xs text-slate-400 text-right">Análise em cache</p>}
            <div className="bg-slate-50 rounded-lg p-4 border border-slate-200 max-h-96 overflow-y-auto">
              <p className="text-sm text-slate-800 whitespace-pre-wrap">{analise}</p>
            </div>
          </>
        )}
        <div className="flex justify-end pt-2 border-t border-slate-200">
          <button onClick={onClose} className="btn-secondary text-sm">Fechar</button>
        </div>
      </div>
    </Modal>
  )
}

// --- Contrato Modal ---
function ContratoModal({ open, onClose, pedido }: {
  open: boolean; onClose: () => void; pedido: Pedido | null
}) {
  const [modelos, setModelos] = useState<ModeloContrato[]>([])
  const [modeloId, setModeloId] = useState<number | ''>('')
  const [loading, setLoading] = useState(false)
  const [generating, setGenerating] = useState(false)

  useEffect(() => {
    if (!open) return
    setLoading(true)
    supabase.from('modelo_contrato_venda').select('id, nome, estilo').order('nome')
      .then(({ data }) => { setModelos(data ?? []); setLoading(false) })
  }, [open])

  const handleGerar = async () => {
    if (!pedido || modeloId === '') return
    const modelo = modelos.find(m => m.id === modeloId)
    if (!modelo) return
    setGenerating(true)

    const { jsPDF } = await import('jspdf')
    const doc = new jsPDF()

    if (modelo.estilo === 'estatico') {
      const { data } = await supabase
        .from('modelo_contrato_venda')
        .select('conteudo')
        .eq('id', modeloId)
        .single()
      doc.setFontSize(12)
      const lines = doc.splitTextToSize(data?.conteudo ?? '', 180)
      doc.text(lines, 15, 20)
    } else {
      doc.setFontSize(14)
      doc.text(`Contrato — ${modelo.nome}`, 15, 20)
      doc.setFontSize(11)
      const info = [
        `Pedido: #${pedido.id}`,
        `Empresa: ${pedido.empresa}`,
        `Categoria: ${pedido.categoria}`,
        `Cliente: ${pedido.cliente}`,
        `Valor: ${fmtMoeda(pedido.valor_pedido)}`,
        `Data: ${fmtData(pedido.data_solicitacao)}`,
        pedido.observacao ? `Observação: ${pedido.observacao}` : '',
      ].filter(Boolean)
      info.forEach((line, i) => doc.text(line, 15, 35 + i * 8))
    }

    doc.save(`contrato_pedido_${pedido.id}.pdf`)
    setGenerating(false)
  }

  return (
    <Modal open={open} onClose={onClose} title="Gerar Contrato" size="md">
      <div className="space-y-4">
        {loading ? (
          <p className="text-slate-400 text-sm">Carregando modelos...</p>
        ) : modelos.length === 0 ? (
          <p className="text-slate-500 text-sm text-center py-6">Nenhum modelo de contrato cadastrado.</p>
        ) : (
          <>
            <div>
              <label className="label">Modelo de contrato</label>
              <select className="input" value={modeloId}
                onChange={e => setModeloId(e.target.value === '' ? '' : Number(e.target.value))}>
                <option value="">Selecionar...</option>
                {modelos.map(m => (
                  <option key={m.id} value={m.id}>{m.nome} ({m.estilo})</option>
                ))}
              </select>
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
              <button onClick={onClose} className="btn-secondary text-sm">Cancelar</button>
              <button onClick={handleGerar} disabled={modeloId === '' || generating}
                className="btn-primary text-sm gap-1.5">
                <FileSignature size={14} />
                {generating ? 'Gerando...' : 'Gerar PDF'}
              </button>
            </div>
          </>
        )}
      </div>
    </Modal>
  )
}

// --- Main Page ---
export default function AcompanharRecebimentoDetalhe() {
  const params = useParams()
  const router = useRouter()
  const pedidoId = parseInt(params.id as string)

  const [pedido, setPedido] = useState<Pedido | null>(null)
  const [fluxo, setFluxo] = useState<FluxoRow[]>([])
  const [statusOpcoes, setStatusOpcoes] = useState<PedidoStatusReceita[]>([])
  const [loading, setLoading] = useState(true)
  const [user, setUser] = useState<{ username: string; role: string } | null>(null)

  const [modalComentarios, setModalComentarios] = useState(false)
  const [modalDocumentos, setModalDocumentos] = useState(false)
  const [modalAnalise, setModalAnalise] = useState(false)
  const [modalContrato, setModalContrato] = useState(false)
  const [modalControle, setModalControle] = useState(false)

  const [confirmCancelar, setConfirmCancelar] = useState(false)
  const [processing, setProcessing] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const [{ data: ped }, { data: fl }, { data: st }, u] = await Promise.all([
      supabase.from('pedidos_solicitados_receita')
        .select('id, empresa, categoria, cliente, valor_pedido, observacao, emergencia, data_solicitacao, data_autorizacao, status, cancelado, usuario_autorizador, pedido_status_receita, arquivo_texto, analise_texto')
        .eq('id', pedidoId).maybeSingle(),
      supabase.from('pedidos_solicitados_fluxo_receita')
        .select('id, mes, ano, valor_referente, status').eq('pedido_id', pedidoId).order('ano').order('mes'),
      supabase.from('pedido_status_receita').select('id, nome_status').order('id'),
      fetch('/api/auth/me').then(r => r.json()),
    ])
    setPedido(ped ?? null)
    setFluxo(fl ?? [])
    setStatusOpcoes(st ?? [])
    setUser(u)
    setLoading(false)
  }, [pedidoId])

  useEffect(() => { load() }, [load])

  const handleCancelar = async () => {
    setProcessing(true)
    await supabase.from('pedidos_solicitados_receita')
      .update({ cancelado: true }).eq('id', pedidoId)
    await supabase.from('pedidos_solicitados_fluxo_receita')
      .update({ status: 'Cancelado' }).eq('pedido_id', pedidoId)
    setProcessing(false)
    setConfirmCancelar(false)
    load()
  }

  const handlePrint = () => window.print()

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <RefreshCw size={20} className="animate-spin text-slate-400" />
      </div>
    )
  }

  if (!pedido) {
    return (
      <div className="card text-center py-16">
        <p className="text-slate-500">Pedido não encontrado.</p>
        <button onClick={() => router.back()} className="btn-secondary mt-4 gap-1.5"><ArrowLeft size={14} /> Voltar</button>
      </div>
    )
  }

  const statusDisplay = pedido.cancelado ? 'Cancelado' : pedido.status
  const STATUS_BADGE: Record<string, string> = {
    'Autorizado': 'bg-green-100 text-green-700',
    'Não Autorizado': 'bg-red-100 text-red-700',
    'Aguardando Autorização': 'bg-yellow-100 text-yellow-700',
    'Cancelado': 'bg-slate-200 text-slate-600',
  }
  const statusNomeMap = Object.fromEntries(statusOpcoes.map(s => [s.id, s.nome_status]))

  return (
    <div className="space-y-5 max-w-4xl">
      {/* Header */}
      <div className="flex items-start gap-3">
        <button onClick={() => router.back()} className="btn-secondary p-2 mt-0.5 shrink-0">
          <ArrowLeft size={16} />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="page-title">Pedido #{pedido.id}</h1>
            {pedido.emergencia && !pedido.cancelado && (
              <span className="badge bg-orange-100 text-orange-700 flex items-center gap-1">
                <AlertTriangle size={11} /> Emergência
              </span>
            )}
            <span className={`badge ${STATUS_BADGE[statusDisplay] ?? 'bg-slate-100 text-slate-600'}`}>
              {statusDisplay}
            </span>
          </div>
          <p className="page-subtitle">Acompanhar Recebimentos</p>
        </div>
        <button onClick={load} className="btn-secondary p-2 shrink-0" title="Atualizar">
          <RefreshCw size={15} />
        </button>
      </div>

      {/* Info Card */}
      <div className="card">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <InfoField label="Empresa" value={pedido.empresa} />
          <InfoField label="Categoria" value={pedido.categoria} />
          <InfoField label="Cliente" value={pedido.cliente} />
          <InfoField label="Valor do Pedido" value={fmtMoeda(pedido.valor_pedido)} />
          <InfoField label="Data de Solicitação" value={fmtData(pedido.data_solicitacao)} />
          <InfoField label="Data de Autorização" value={fmtData(pedido.data_autorizacao)} />
          {pedido.usuario_autorizador && (
            <InfoField label="Autorizado por" value={pedido.usuario_autorizador} />
          )}
          {pedido.pedido_status_receita != null && (
            <InfoField label="Status do Pedido" value={statusNomeMap[pedido.pedido_status_receita] ?? pedido.pedido_status_receita} />
          )}
        </div>
        {pedido.observacao && (
          <div className="mt-4 pt-4 border-t border-slate-100">
            <p className="text-xs text-slate-400 mb-1">Observação</p>
            <p className="text-sm text-slate-700 whitespace-pre-wrap">{pedido.observacao}</p>
          </div>
        )}
      </div>

      {/* Fluxo de Caixa */}
      {fluxo.length > 0 && (
        <div className="card">
          <h2 className="text-sm font-semibold text-slate-700 mb-3">Fluxo de Caixa</h2>
          <div className="overflow-auto">
            <table className="w-full text-xs">
              <thead className="table-header">
                <tr>
                  <th className="table-cell font-medium">Mês/Ano</th>
                  <th className="table-cell font-medium text-right">Valor</th>
                  <th className="table-cell font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {fluxo.map(f => (
                  <tr key={f.id} className="table-row">
                    <td className="table-cell">{MESES[(f.mes ?? 1) - 1]}/{f.ano}</td>
                    <td className="table-cell text-right font-medium">{fmtMoeda(f.valor_referente)}</td>
                    <td className="table-cell">
                      <span className={`badge text-xs ${STATUS_BADGE[f.status] ?? 'bg-slate-100 text-slate-600'}`}>
                        {f.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Ações */}
      <div className="card">
        <h2 className="text-sm font-semibold text-slate-700 mb-3">Ações</h2>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setModalAnalise(true)}
            className="btn-secondary gap-1.5 text-sm">
            <Brain size={14} /> Analisar Documento
          </button>
          <button onClick={handlePrint}
            className="btn-secondary gap-1.5 text-sm">
            <Printer size={14} /> Imprimir Pedido
          </button>
          <button onClick={() => setModalContrato(true)}
            className="btn-secondary gap-1.5 text-sm">
            <FileSignature size={14} /> Gerar Contrato
          </button>
          <button onClick={() => setModalComentarios(true)}
            className="btn-secondary gap-1.5 text-sm">
            <MessageSquare size={14} /> Comentários
          </button>
          <button onClick={() => setModalDocumentos(true)}
            className="btn-secondary gap-1.5 text-sm">
            <FileText size={14} /> Documentos
          </button>
          <button onClick={() => setModalControle(true)}
            className="btn-secondary gap-1.5 text-sm">
            <CreditCard size={14} /> Controle de Recebimentos
          </button>
          {!pedido.cancelado && (
            <button onClick={() => setConfirmCancelar(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-red-200 bg-red-50 text-red-700 rounded text-sm font-medium hover:bg-red-100">
              <X size={14} /> Cancelar Pedido
            </button>
          )}
        </div>
      </div>

      {/* Modais */}
      <ComentariosModal
        open={modalComentarios} onClose={() => setModalComentarios(false)}
        pedidoId={pedidoId} username={user?.username ?? ''} />

      <DocumentosModal
        open={modalDocumentos} onClose={() => setModalDocumentos(false)}
        pedidoId={pedidoId} />

      <AnaliseModal
        open={modalAnalise} onClose={() => setModalAnalise(false)}
        pedidoId={pedidoId} />

      <ContratoModal
        open={modalContrato} onClose={() => setModalContrato(false)}
        pedido={pedido} />

      <ControleRecebimentosModal
        open={modalControle} onClose={() => setModalControle(false)}
        pedidoId={pedidoId} username={user?.username ?? ''} />

      <Confirm
        open={confirmCancelar}
        onClose={() => setConfirmCancelar(false)}
        onConfirm={handleCancelar}
        title="Cancelar Pedido"
        message={`Confirma o cancelamento do pedido #${pedidoId}? Esta ação não pode ser desfeita.`}
        confirmLabel="Cancelar Pedido"
        loading={processing}
      />
    </div>
  )
}
