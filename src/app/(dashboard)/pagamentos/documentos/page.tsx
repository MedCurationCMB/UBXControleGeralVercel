'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { supabaseBrowser as supabase } from '@/lib/supabase/client'
import { Upload, Download, Trash2, FileText, Search, RefreshCw } from 'lucide-react'
import Confirm from '@/components/ui/Confirm'

interface TipoDoc { id: number; tipo: string }
interface Documento {
  id: number; pedido_id: number | null; tipo_documento: number; nome_documento: string | null
  usuario: string; data_upload: string | null; anexo_url: string | null; pagamento_id: number | null
}
interface Pedido { id: number; empresa: string; fornecedor: string }

const fmtData = (d: string | null) => d ? new Date(d).toLocaleDateString('pt-BR') : '-'

export default function DocumentosPage() {
  const [documentos, setDocumentos] = useState<Documento[]>([])
  const [pedidos, setPedidos] = useState<Pedido[]>([])
  const [tiposDoc, setTiposDoc] = useState<TipoDoc[]>([])
  const [loading, setLoading] = useState(true)
  const [pedidoId, setPedidoId] = useState('')
  const [tipoFiltro, setTipoFiltro] = useState('')
  const [search, setSearch] = useState('')
  const [uploading, setUploading] = useState(false)
  const [tipoUpload, setTipoUpload] = useState('')
  const [pedidoUpload, setPedidoUpload] = useState('')
  const [uploadError, setUploadError] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<Documento | null>(null)
  const [deleting, setDeleting] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    setLoading(true)
    let query = supabase.from('documentos').select('*').order('data_upload', { ascending: false }).limit(100)
    if (pedidoId) query = query.eq('pedido_id', pedidoId)
    if (tipoFiltro) query = query.eq('tipo_documento', tipoFiltro)

    const [{ data: docs }, { data: tipos }, { data: peds }] = await Promise.all([
      query,
      supabase.from('tipos_documento').select('*').order('id'),
      supabase.from('pedidos_solicitados').select('id, empresa, fornecedor').eq('cancelado', false).order('id', { ascending: false }).limit(100),
    ])
    setDocumentos(docs ?? [])
    setTiposDoc(tipos ?? [])
    setPedidos(peds ?? [])
    setLoading(false)
  }, [pedidoId, tipoFiltro])

  useEffect(() => { load() }, [load])

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!tipoUpload) { setUploadError('Selecione o tipo de documento antes de enviar'); return }

    setUploading(true); setUploadError('')
    const formData = new FormData()
    formData.append('file', file)
    formData.append('tipo_documento', tipoUpload)
    formData.append('modulo', 'pagamentos')
    if (pedidoUpload) formData.append('pedido_id', pedidoUpload)
    if (tipoUpload === '1') formData.append('extrair_boleto', 'true')

    try {
      const res = await fetch('/api/documentos/upload', { method: 'POST', body: formData })
      if (!res.ok) throw new Error('Upload falhou')
      await load()
    } catch {
      setUploadError('Erro ao enviar arquivo. Tente novamente.')
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    await supabase.from('documentos').delete().eq('id', deleteTarget.id)
    setDeleting(false); setDeleteTarget(null); load()
  }

  const tipoNome = (id: number) => tiposDoc.find(t => t.id === id)?.tipo ?? `Tipo ${id}`
  const pedidoInfo = (id: number | null) => id ? pedidos.find(p => p.id === id) : null

  const filtered = documentos.filter(d => {
    if (!search) return true
    return (d.nome_documento ?? '').toLowerCase().includes(search.toLowerCase()) ||
      String(d.pedido_id ?? '').includes(search)
  })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">Gestão de Documentos</h1>
          <p className="page-subtitle">Documentos vinculados a pedidos de pagamento</p>
        </div>
        <button onClick={load} className="btn-secondary p-2"><RefreshCw size={16} /></button>
      </div>

      {/* Upload section */}
      <div className="card">
        <h2 className="text-sm font-semibold text-slate-700 mb-4">Enviar Documento</h2>
        {uploadError && <p className="text-sm text-red-600 mb-3">{uploadError}</p>}
        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex-1 min-w-[160px]">
            <label className="label">Tipo de Documento *</label>
            <select className="input" value={tipoUpload} onChange={e => setTipoUpload(e.target.value)}>
              <option value="">Selecionar...</option>
              {tiposDoc.map(t => <option key={t.id} value={t.id}>{t.tipo}</option>)}
            </select>
          </div>
          <div className="flex-[2] min-w-[200px]">
            <label className="label">Pedido (opcional)</label>
            <select className="input" value={pedidoUpload} onChange={e => setPedidoUpload(e.target.value)}>
              <option value="">-- Nenhum --</option>
              {pedidos.map(p => <option key={p.id} value={p.id}>#{p.id} – {p.empresa} / {p.fornecedor}</option>)}
            </select>
          </div>
          <div>
            <button onClick={() => fileRef.current?.click()} className="btn-primary" disabled={uploading}>
              <Upload size={16} /> {uploading ? 'Enviando...' : 'Selecionar Arquivo'}
            </button>
            <input type="file" ref={fileRef} className="hidden" onChange={handleUpload}
              accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx" />
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input className="input pl-9" placeholder="Buscar por nome ou ID do pedido..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select className="input w-40" value={tipoFiltro} onChange={e => setTipoFiltro(e.target.value)}>
          <option value="">Todos os tipos</option>
          {tiposDoc.map(t => <option key={t.id} value={t.id}>{t.tipo}</option>)}
        </select>
      </div>

      {/* Documents list */}
      <div className="card p-0 overflow-hidden">
        {loading ? (
          <div className="text-center py-12 text-slate-400">Carregando...</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 text-slate-400">Nenhum documento encontrado.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="table-header">
                <tr>
                  <th className="table-cell text-left">Documento</th>
                  <th className="table-cell text-left">Tipo</th>
                  <th className="table-cell text-left">Pedido</th>
                  <th className="table-cell text-left">Enviado por</th>
                  <th className="table-cell text-left">Data</th>
                  <th className="table-cell text-center">Ações</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(d => {
                  const ped = pedidoInfo(d.pedido_id)
                  return (
                    <tr key={d.id} className="table-row">
                      <td className="table-cell">
                        <div className="flex items-center gap-2">
                          <FileText size={15} className="text-slate-400 shrink-0" />
                          <span className="text-sm">{d.nome_documento ?? `Doc #${d.id}`}</span>
                        </div>
                      </td>
                      <td className="table-cell">
                        <span className="badge bg-slate-100 text-slate-600">{tipoNome(d.tipo_documento)}</span>
                      </td>
                      <td className="table-cell">
                        {ped ? (
                          <span className="text-xs">#{d.pedido_id} · {ped.empresa} / {ped.fornecedor}</span>
                        ) : d.pedido_id ? `#${d.pedido_id}` : '-'}
                      </td>
                      <td className="table-cell">{d.usuario}</td>
                      <td className="table-cell">{fmtData(d.data_upload)}</td>
                      <td className="table-cell text-center">
                        <div className="flex items-center justify-center gap-1">
                          {d.anexo_url && (
                            <a href={d.anexo_url} target="_blank" rel="noopener"
                              className="p-1.5 rounded hover:bg-slate-100 text-blue-500" title="Baixar">
                              <Download size={15} />
                            </a>
                          )}
                          <button onClick={() => setDeleteTarget(d)}
                            className="p-1.5 rounded hover:bg-red-50 text-red-400" title="Excluir">
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Confirm
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Excluir Documento"
        message={`Excluir "${deleteTarget?.nome_documento ?? 'este documento'}"? O arquivo no B2 não será removido automaticamente.`}
        confirmLabel="Excluir"
        loading={deleting}
      />
    </div>
  )
}
