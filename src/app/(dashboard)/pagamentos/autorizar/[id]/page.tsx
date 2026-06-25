'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabaseBrowser as supabase } from '@/lib/supabase/client'
import {
  ArrowLeft, CheckCircle, XCircle, AlertTriangle, RefreshCw,
  MessageSquare, FileText, Printer, Brain, Upload, Download,
  ExternalLink, X, ChevronDown, ChevronUp, FileSignature,
} from 'lucide-react'
import Modal from '@/components/ui/Modal'
import Confirm from '@/components/ui/Confirm'

// --- Types ---
interface Pedido {
  id: number; empresa: string; categoria: string; fornecedor: string
  valor_pedido: number; observacao: string | null; emergencia: boolean
  data_solicitacao: string; data_autorizacao: string | null; status: string
  cancelado: boolean; usuario_autorizador: string | null
  pedido_status: number | null; arquivo_texto: string | null; analise_texto: string | null
}
interface FluxoRow { id: number; mes: number; ano: number; valor_referente: number; status: string }
interface Comentario { id: number; comentario: string; usuario: string; data_comentario: string; tipo_documento: number | null }
interface Documento { id: number; nome_documento: string; anexo_id: string | null; anexo_url: string | null; tipo_documento: number | null; tipo_nome?: string; data_upload: string }
interface TipoDoc { id: number; tipo: string }
interface StatusPedido { id: number; nome_status: string }
interface ModeloContrato { id: number; nome: string; tipo: string; anexo_url: string }

const fmtMoeda = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const fmtData = (d: string | null) =>
  d ? new Date(d.includes('T') ? d : d + 'T12:00:00').toLocaleDateString('pt-BR') : '—'

// --- Subcomponents ---

function InfoField({ label, value, className }: { label: string; value: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <p className="text-xs text-slate-400 mb-0.5">{label}</p>
      <p className="text-sm font-medium text-slate-800">{value ?? '—'}</p>
    </div>
  )
}

// --- Comments Modal ---
function ComentariosModal({
  open, onClose, pedidoId, username,
}: {
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
    const [{ data: coms }, { data: tipos }, { data: docAnexos }] = await Promise.all([
      supabase.from('comentarios').select('*').eq('pedido_id', pedidoId).order('data_comentario', { ascending: false }),
      supabase.from('tipos_documento').select('id, tipo').order('tipo'),
      supabase.from('documentos').select('comentario_id, anexo_id').eq('pedido_id', pedidoId).not('comentario_id', 'is', null),
    ])
    setComentarios(coms ?? [])
    setTiposDocs(tipos ?? [])
    const map: Record<number, string> = {}
    for (const d of (docAnexos ?? [])) {
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

    let anexo_url: string | null = null

    if (file) {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('pedido_id', String(pedidoId))
      if (tipoId !== '') fd.append('tipo_documento', String(tipoId))
      const r = await fetch('/api/documentos/upload', { method: 'POST', body: fd })
      if (r.ok) {
        const d = await r.json()
        anexo_url = d.url ?? null
      }
    }

    await supabase.from('comentarios').insert({
      pedido_id: pedidoId,
      comentario: texto.trim(),
      usuario: username,
      data_comentario: new Date().toISOString(),
      tipo_documento: tipoId !== '' ? tipoId : null,
      anexo_url,
    })

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
        {/* History */}
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

// --- Documents Modal ---
function DocumentosModal({
  open, onClose, pedidoId,
}: {
  open: boolean; onClose: () => void; pedidoId: number
}) {
  const [docs, setDocs] = useState<Documento[]>([])
  const [tiposDocs, setTiposDocs] = useState<TipoDoc[]>([])
  const [loading, setLoading] = useState(false)
  const [tipoId, setTipoId] = useState<number | ''>('')
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [expandedTipos, setExpandedTipos] = useState<Set<string>>(new Set(['todos']))
  const fileRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const [{ data: d }, { data: t }] = await Promise.all([
      supabase.from('documentos').select('*').eq('pedido_id', pedidoId).order('data_upload', { ascending: false }),
      supabase.from('tipos_documento').select('id, tipo').order('tipo'),
    ])
    const tipos = (t ?? []) as TipoDoc[]
    const tipoMap = Object.fromEntries(tipos.map(x => [x.id, x.tipo]))
    const docsComTipo: Documento[] = (d ?? []).map((doc: Documento) => ({
      ...doc,
      tipo_nome: doc.tipo_documento ? tipoMap[doc.tipo_documento] ?? 'Outros' : 'Sem tipo',
    }))
    setDocs(docsComTipo)
    setTiposDocs(tipos)
    setLoading(false)
  }, [pedidoId])

  useEffect(() => { if (open) load() }, [open, load])

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!file) return
    setUploading(true)

    const fd = new FormData()
    fd.append('file', file)
    fd.append('pedido_id', String(pedidoId))
    if (tipoId !== '') fd.append('tipo_documento', String(tipoId))
    await fetch('/api/documentos/upload', { method: 'POST', body: fd })

    setFile(null)
    if (fileRef.current) fileRef.current.value = ''
    setTipoId('')
    setUploading(false)
    load()
  }

  const grouped = tiposDocs.reduce<Record<string, Documento[]>>((acc, t) => {
    const docsDeTipo = docs.filter(d => d.tipo_documento === t.id)
    if (docsDeTipo.length) acc[t.tipo] = docsDeTipo
    return acc
  }, {})
  const semTipo = docs.filter(d => !d.tipo_documento)
  if (semTipo.length) grouped['Sem tipo'] = semTipo

  const toggleExpand = (nome: string) =>
    setExpandedTipos(prev => { const n = new Set(prev); n.has(nome) ? n.delete(nome) : n.add(nome); return n })

  return (
    <Modal open={open} onClose={onClose} title={`Documentos — Pedido #${pedidoId}`} size="lg">
      <div className="space-y-4">
        {/* Upload form */}
        <form onSubmit={handleUpload} className="p-3 bg-slate-50 rounded-lg border border-slate-200">
          <p className="text-xs font-semibold text-slate-600 mb-2">Adicionar documento</p>
          <div className="flex items-center gap-2">
            <select className="input flex-1" value={tipoId} onChange={e => setTipoId(e.target.value === '' ? '' : Number(e.target.value))}>
              <option value="">Tipo de documento</option>
              {tiposDocs.map(t => <option key={t.id} value={t.id}>{t.tipo}</option>)}
            </select>
            <div>
              <input ref={fileRef} type="file" className="hidden" onChange={e => setFile(e.target.files?.[0] ?? null)} />
              <button type="button" onClick={() => fileRef.current?.click()} className="btn-secondary text-xs gap-1">
                <Upload size={12} /> {file ? file.name.slice(0, 16) + '…' : 'Arquivo'}
              </button>
            </div>
            <button type="submit" disabled={!file || uploading} className="btn-primary text-xs px-3 gap-1">
              <Upload size={12} /> {uploading ? '...' : 'Enviar'}
            </button>
          </div>
        </form>

        {/* Document list */}
        <div className="max-h-72 overflow-y-auto space-y-2">
          {loading && <p className="text-slate-400 text-sm">Carregando...</p>}
          {!loading && docs.length === 0 && (
            <p className="text-slate-400 text-sm text-center py-8">Nenhum documento.</p>
          )}
          {Object.entries(grouped).map(([tipo, items]) => (
            <div key={tipo} className="border border-slate-200 rounded-lg overflow-hidden">
              <button onClick={() => toggleExpand(tipo)}
                className="w-full flex items-center justify-between px-3 py-2 bg-slate-100 text-sm font-medium text-slate-700">
                <span>{tipo} ({items.length})</span>
                {expandedTipos.has(tipo) ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </button>
              {expandedTipos.has(tipo) && (
                <div className="divide-y divide-slate-100">
                  {items.map(doc => (
                    <div key={doc.id} className="flex items-center justify-between px-3 py-2">
                      <div className="min-w-0">
                        <p className="text-xs text-slate-700 truncate">{doc.nome_documento}</p>
                        <p className="text-xs text-slate-400">{fmtData(doc.data_upload)}</p>
                      </div>
                      <a href={`/api/b2/file?fileId=${doc.anexo_id}`} target="_blank" rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline shrink-0 ml-2">
                        <Download size={11} /> Ver
                      </a>
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
function AnaliseModal({
  open, onClose, pedidoId, temDocumento,
}: {
  open: boolean; onClose: () => void; pedidoId: number; temDocumento: boolean
}) {
  const [analise, setAnalise] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const fetchAnalise = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const r = await fetch(`/api/pedidos/${pedidoId}/analise`)
      const d = await r.json()
      if (d.sem_documento) {
        setError('Este pedido não possui texto de documento para análise.')
      } else if (d.error) {
        setError(d.error)
      } else {
        setAnalise(d.analise)
      }
    } catch {
      setError('Erro ao buscar análise.')
    }
    setLoading(false)
  }, [pedidoId])

  useEffect(() => { if (open) fetchAnalise() }, [open, fetchAnalise])

  return (
    <Modal open={open} onClose={onClose} title="Análise de Documento — IA" size="lg">
      <div className="space-y-4">
        {loading && (
          <div className="text-center py-12">
            <Brain size={32} className="mx-auto text-blue-400 animate-pulse mb-3" />
            <p className="text-slate-500 text-sm">Analisando documento com IA...</p>
          </div>
        )}
        {error && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>
        )}
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
        <div className="flex justify-end">
          <button onClick={onClose} className="btn-secondary text-sm">Fechar</button>
        </div>
      </div>
    </Modal>
  )
}

// --- Contract Modal ---
function ContratoModal({
  open, onClose, pedido, fluxo,
}: {
  open: boolean; onClose: () => void
  pedido: Pedido; fluxo: FluxoRow[]
}) {
  const [modelos, setModelos] = useState<ModeloContrato[]>([])
  const [modeloVar, setModeloVar] = useState('')
  const [modeloEst, setModeloEst] = useState('')
  const [loading, setLoading] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setLoading(true)
    supabase.from('modelo_contrato').select('*').then(({ data }) => {
      setModelos(data ?? [])
      setLoading(false)
    })
  }, [open])

  const handleGerar = async () => {
    setGenerating(true)
    setError('')
    try {
      // Build placeholders
      const valorTotal = fluxo.reduce((s, r) => s + Number(r.valor_referente), 0)
      const fluxoPlaceholders: Record<string, string> = {}
      fluxo.forEach((r, i) => {
        fluxoPlaceholders[`mes_ano_${i + 1}`] = `${r.mes}/${r.ano}`
        fluxoPlaceholders[`valor_referente_${i + 1}`] = fmtMoeda(Number(r.valor_referente))
      })

      const vars: Record<string, string> = {
        id: String(pedido.id),
        empresa: pedido.empresa,
        categoria: pedido.categoria,
        fornecedor: pedido.fornecedor,
        valor_pedido: fmtMoeda(Number(pedido.valor_pedido)),
        status: pedido.status,
        data_solicitacao: fmtData(pedido.data_solicitacao),
        data_autorizacao: fmtData(pedido.data_autorizacao),
        emergencia: pedido.emergencia ? 'Sim' : 'Não',
        observacao: pedido.observacao ?? '',
        valor_total_fluxo: fmtMoeda(valorTotal),
        ...fluxoPlaceholders,
      }

      // Generate PDF in browser
      const { jsPDF } = await import('jspdf')
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })

      const fillTemplate = (text: string) =>
        text.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? `{${k}}`)

      // Header
      doc.setFontSize(16)
      doc.setFont('helvetica', 'bold')
      doc.text('CONTRATO DE PRESTAÇÃO DE SERVIÇOS / FORNECIMENTO', 105, 20, { align: 'center' })

      doc.setFontSize(10)
      doc.setFont('helvetica', 'normal')
      doc.text(`Pedido: #${pedido.id}`, 20, 35)
      doc.text(`Data: ${fmtData(pedido.data_solicitacao)}`, 20, 42)
      doc.text(`Empresa: ${pedido.empresa}`, 20, 49)
      doc.text(`Fornecedor: ${pedido.fornecedor}`, 20, 56)
      doc.text(`Categoria: ${pedido.categoria}`, 20, 63)
      doc.text(`Valor Total: ${fmtMoeda(Number(pedido.valor_pedido))}`, 20, 70)
      if (pedido.observacao) doc.text(`Observação: ${pedido.observacao}`, 20, 77)

      // Fluxo
      if (fluxo.length > 0) {
        let y = 90
        doc.setFont('helvetica', 'bold')
        doc.text('Cronograma de Pagamentos', 20, y)
        y += 8
        doc.setFont('helvetica', 'normal')
        fluxo.forEach(r => {
          doc.text(`${r.mes}/${r.ano}  —  ${fmtMoeda(Number(r.valor_referente))}`, 25, y)
          y += 7
        })
        y += 5
        doc.setFont('helvetica', 'bold')
        doc.text(`Total: ${fmtMoeda(valorTotal)}`, 20, y)
      }

      // Signature lines
      const sigY = 240
      doc.line(20, sigY, 90, sigY)
      doc.line(120, sigY, 190, sigY)
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(9)
      doc.text(pedido.empresa, 55, sigY + 5, { align: 'center' })
      doc.text(pedido.fornecedor, 155, sigY + 5, { align: 'center' })

      doc.save(fillTemplate(`contrato_pedido_${pedido.id}.pdf`))
    } catch (e) {
      console.error(e)
      setError('Erro ao gerar contrato.')
    }
    setGenerating(false)
  }

  return (
    <Modal open={open} onClose={onClose} title="Gerar Contrato" size="md">
      <div className="space-y-4">
        {loading ? (
          <p className="text-slate-400 text-sm">Carregando modelos...</p>
        ) : modelos.length === 0 ? (
          <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-yellow-800">
            Nenhum modelo de contrato cadastrado. Será gerado um PDF padrão.
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <label className="label">Modelo Variável</label>
              <select className="input" value={modeloVar} onChange={e => setModeloVar(e.target.value)}>
                <option value="">Selecionar...</option>
                {modelos.filter(m => m.tipo === 'variavel').map(m => (
                  <option key={m.id} value={m.id}>{m.nome}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Modelo Estático</label>
              <select className="input" value={modeloEst} onChange={e => setModeloEst(e.target.value)}>
                <option value="">Selecionar...</option>
                {modelos.filter(m => m.tipo === 'estatico').map(m => (
                  <option key={m.id} value={m.id}>{m.nome}</option>
                ))}
              </select>
            </div>
          </div>
        )}

        {error && <p className="text-red-600 text-sm">{error}</p>}

        <div className="text-xs text-slate-500">
          O contrato será gerado como PDF com os dados do pedido #{pedido.id}.
        </div>

        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="btn-secondary text-sm">Cancelar</button>
          <button onClick={handleGerar} disabled={generating} className="btn-primary text-sm gap-1.5">
            <FileSignature size={14} /> {generating ? 'Gerando...' : 'Gerar PDF'}
          </button>
        </div>
      </div>
    </Modal>
  )
}

// --- Main Page ---
export default function DetalhePedidoPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const pedidoId = parseInt(id)

  const [pedido, setPedido] = useState<Pedido | null>(null)
  const [fluxo, setFluxo] = useState<FluxoRow[]>([])
  const [statusNome, setStatusNome] = useState<string | null>(null)
  const [user, setUser] = useState<{ username: string; hierarquia: string } | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Modal states
  const [showComents, setShowComents] = useState(false)
  const [showDocs, setShowDocs] = useState(false)
  const [showAnalise, setShowAnalise] = useState(false)
  const [showContrato, setShowContrato] = useState(false)

  // Confirm states
  const [confirmAcao, setConfirmAcao] = useState<{
    open: boolean; acao: 'Autorizado' | 'Não Autorizado' | 'cancelar'
  }>({ open: false, acao: 'Autorizado' })
  const [processing, setProcessing] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')

    const [{ data: p, error: pErr }, { data: fl }, u] = await Promise.all([
      supabase.from('pedidos_solicitados').select('*').eq('id', pedidoId).maybeSingle(),
      supabase.from('pedidos_solicitados_fluxo').select('*').eq('pedido_id', pedidoId).order('ano').order('mes'),
      fetch('/api/auth/me').then(r => r.json()),
    ])

    if (pErr || !p) {
      setError('Pedido não encontrado.')
      setLoading(false)
      return
    }

    setPedido(p as Pedido)
    setFluxo(fl ?? [])
    setUser(u)

    // Fetch pedido_status name if set
    if ((p as Pedido).pedido_status) {
      const { data: st } = await supabase
        .from('pedido_status')
        .select('nome_status')
        .eq('id', (p as Pedido).pedido_status)
        .maybeSingle()
      setStatusNome((st as StatusPedido | null)?.nome_status ?? null)
    }

    setLoading(false)
  }, [pedidoId])

  useEffect(() => { if (!isNaN(pedidoId)) load() }, [load, pedidoId])

  const handlePrint = async () => {
    if (!pedido) return
    const { jsPDF } = await import('jspdf')
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })

    doc.setFontSize(16)
    doc.setFont('helvetica', 'bold')
    doc.text('PEDIDO DE PAGAMENTO', 105, 18, { align: 'center' })

    doc.setFontSize(10)
    doc.setFont('helvetica', 'normal')

    const fields: [string, string][] = [
      ['Pedido ID', `#${pedido.id}`],
      ['Empresa', pedido.empresa],
      ['Categoria', pedido.categoria],
      ['Fornecedor', pedido.fornecedor],
      ['Valor', fmtMoeda(Number(pedido.valor_pedido))],
      ['Status', pedido.status],
      ['Data Solicitação', fmtData(pedido.data_solicitacao)],
      ['Data Autorização', fmtData(pedido.data_autorizacao)],
      ['Emergência', pedido.emergencia ? 'Sim' : 'Não'],
      ['Cancelado', pedido.cancelado ? 'Sim' : 'Não'],
    ]
    if (pedido.observacao) fields.push(['Observação', pedido.observacao])
    if (statusNome) fields.push(['Status do Pedido', statusNome])
    if (pedido.usuario_autorizador) fields.push(['Autorizado por', pedido.usuario_autorizador])

    let y = 32
    fields.forEach(([k, v]) => {
      doc.setFont('helvetica', 'bold')
      doc.text(`${k}:`, 20, y)
      doc.setFont('helvetica', 'normal')
      doc.text(v ?? '—', 70, y)
      y += 7
    })

    if (fluxo.length > 0) {
      y += 5
      doc.setFont('helvetica', 'bold')
      doc.text('Cronograma de Pagamentos', 20, y)
      y += 7
      doc.setFont('helvetica', 'normal')
      fluxo.forEach(r => {
        doc.text(`${r.mes}/${r.ano}`, 25, y)
        doc.text(fmtMoeda(Number(r.valor_referente)), 80, y)
        doc.text(r.status, 140, y)
        y += 6
      })
    }

    doc.save(`pedido_${pedido.id}.pdf`)
  }

  const handleAcao = async () => {
    if (!pedido || !user) return
    setProcessing(true)
    const hoje = new Date().toISOString().split('T')[0]

    if (confirmAcao.acao === 'cancelar') {
      await supabase.from('pedidos_solicitados')
        .update({ cancelado: true, status: 'Cancelado' })
        .eq('id', pedidoId)
      await supabase.from('pedidos_solicitados_fluxo')
        .update({ status: 'Cancelado' })
        .eq('pedido_id', pedidoId)
    } else {
      const novoStatus = confirmAcao.acao
      await supabase.from('pedidos_solicitados').update({
        status: novoStatus,
        data_autorizacao: hoje,
        usuario_autorizador: user.username,
      }).eq('id', pedidoId)

      await supabase.from('pedidos_solicitados_fluxo')
        .update({ status: novoStatus }).eq('pedido_id', pedidoId)

      if (novoStatus === 'Autorizado') {
        const { data: ex } = await supabase.from('controle_pagamentos')
          .select('id').eq('pedido_id', pedidoId).maybeSingle()
        if (!ex) {
          await supabase.from('controle_pagamentos').insert({
            pedido_id: pedidoId, valor_pagar: pedido.valor_pedido, status_pagamento: 1,
          })
        }
      }
    }

    setProcessing(false)
    setConfirmAcao(c => ({ ...c, open: false }))
    load()
  }

  if (loading) {
    return (
      <div className="card text-center py-16 text-slate-400">Carregando...</div>
    )
  }

  if (error || !pedido) {
    return (
      <div className="card text-center py-12">
        <p className="text-red-600 mb-4">{error || 'Pedido não encontrado'}</p>
        <button onClick={() => router.back()} className="btn-secondary gap-1.5">
          <ArrowLeft size={14} /> Voltar
        </button>
      </div>
    )
  }

  const isPending = pedido.status === 'Aguardando Autorização' && !pedido.cancelado
  const isAutorizado = pedido.status === 'Autorizado'
  const isCancelado = pedido.cancelado

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <button onClick={() => router.back()} className="btn-secondary p-2">
            <ArrowLeft size={16} />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="page-title">Pedido #{pedido.id}</h1>
              {pedido.emergencia && (
                <span className="badge bg-orange-100 text-orange-700 flex items-center gap-1">
                  <AlertTriangle size={10} /> Emergência
                </span>
              )}
              {isCancelado && (
                <span className="badge bg-red-100 text-red-700">Cancelado</span>
              )}
            </div>
            <p className="page-subtitle">{pedido.empresa} · {pedido.categoria}</p>
          </div>
        </div>

        {/* Status badge */}
        <span className={`badge text-sm px-3 py-1 ${
          pedido.status === 'Autorizado' ? 'bg-green-100 text-green-700' :
          pedido.status === 'Não Autorizado' ? 'bg-red-100 text-red-700' :
          pedido.status === 'Cancelado' ? 'bg-slate-200 text-slate-600' :
          'bg-yellow-100 text-yellow-700'
        }`}>
          {pedido.status}
        </span>
      </div>

      {/* Action buttons row */}
      <div className="flex flex-wrap gap-2">
        {pedido.arquivo_texto && (
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

      {/* Info grid */}
      <div className="card">
        <h2 className="text-sm font-semibold text-slate-700 mb-4">Informações do Pedido</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-x-8 gap-y-4">
          <InfoField label="Empresa" value={pedido.empresa} />
          <InfoField label="Categoria" value={pedido.categoria} />
          <InfoField label="Fornecedor" value={pedido.fornecedor} />
          <InfoField label="Valor do Pedido" value={<span className="text-lg font-bold">{fmtMoeda(Number(pedido.valor_pedido))}</span>} />
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
                  <td className="table-cell text-right font-bold text-slate-900">
                    {fmtMoeda(fluxo.reduce((s, r) => s + Number(r.valor_referente), 0))}
                  </td>
                  <td className="table-cell" />
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Authorize / Reject / Cancel actions */}
      <div className="card border-t-4 border-slate-200">
        <h2 className="text-sm font-semibold text-slate-700 mb-4">Ações</h2>
        <div className="flex flex-wrap gap-3">
          {isPending && (
            <>
              <button onClick={() => setConfirmAcao({ open: true, acao: 'Autorizado' })}
                className="btn-primary gap-1.5">
                <CheckCircle size={15} /> Autorizar Pedido
              </button>
              <button onClick={() => setConfirmAcao({ open: true, acao: 'Não Autorizado' })}
                className="inline-flex items-center gap-1.5 px-4 py-2 border border-red-200 bg-red-50 text-red-700 rounded-lg text-sm font-medium hover:bg-red-100">
                <XCircle size={15} /> Rejeitar Pedido
              </button>
            </>
          )}
          {!isCancelado && (
            <button onClick={() => setConfirmAcao({ open: true, acao: 'cancelar' })}
              className="btn-danger gap-1.5">
              <X size={15} /> Cancelar Pedido
            </button>
          )}
          {isCancelado && (
            <p className="text-sm text-slate-500">Este pedido foi cancelado e não pode ser modificado.</p>
          )}
          {!isPending && !isCancelado && (
            <p className="text-sm text-slate-500">
              Este pedido já foi {pedido.status.toLowerCase()} e não requer novas ações de autorização.
            </p>
          )}
        </div>
      </div>

      {/* Modals */}
      <ComentariosModal open={showComents} onClose={() => setShowComents(false)}
        pedidoId={pedidoId} username={user?.username ?? ''} />

      <DocumentosModal open={showDocs} onClose={() => setShowDocs(false)}
        pedidoId={pedidoId} />

      <AnaliseModal open={showAnalise} onClose={() => setShowAnalise(false)}
        pedidoId={pedidoId} temDocumento={!!pedido.arquivo_texto} />

      <ContratoModal open={showContrato} onClose={() => setShowContrato(false)}
        pedido={pedido} fluxo={fluxo} />

      <Confirm
        open={confirmAcao.open}
        onClose={() => setConfirmAcao(c => ({ ...c, open: false }))}
        onConfirm={handleAcao}
        title={
          confirmAcao.acao === 'Autorizado' ? 'Autorizar Pedido' :
          confirmAcao.acao === 'Não Autorizado' ? 'Rejeitar Pedido' : 'Cancelar Pedido'
        }
        message={
          confirmAcao.acao === 'cancelar' && isAutorizado
            ? `⚠️ Atenção: Este pedido já foi autorizado. Cancelar irá reverter a autorização e remover do controle de pagamentos. Confirma?`
            : confirmAcao.acao === 'cancelar'
            ? `Confirma o cancelamento do pedido #${pedidoId}? Esta ação não pode ser desfeita.`
            : confirmAcao.acao === 'Autorizado'
            ? `Confirma a autorização do pedido #${pedidoId} — ${pedido.fornecedor} — ${fmtMoeda(Number(pedido.valor_pedido))}?`
            : `Confirma a rejeição do pedido #${pedidoId}?`
        }
        confirmLabel={
          confirmAcao.acao === 'Autorizado' ? 'Autorizar' :
          confirmAcao.acao === 'Não Autorizado' ? 'Rejeitar' : 'Cancelar'
        }
        loading={processing}
      />
    </div>
  )
}
