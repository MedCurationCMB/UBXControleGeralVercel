'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { supabaseBrowser as supabase } from '@/lib/supabase/client'
import { Upload, Download, Trash2, FileText, Search, RefreshCw } from 'lucide-react'
import Confirm from '@/components/ui/Confirm'

interface TipoDoc { id: number; tipo: string }
interface Documento {
  id: number; pedido_id: number | null; tipo_documento: number
  usuario: string; data_upload: string | null
  anexo_url: string | null; pagamento_id: number | null
  nome_documento: string | null
}
interface Pedido { id: number; empresa: string; categoria: string; cliente: string }

const fmtData = (d: string | null) => d ? new Date(d).toLocaleDateString('pt-BR') : '-'

export default function DocumentosRecebimentosPage() {
  const [documentos, setDocumentos] = useState<Documento[]>([])
  const [pedidos, setPedidos] = useState<Pedido[]>([])
  const [tiposDoc, setTiposDoc] = useState<TipoDoc[]>([])
  const [loading, setLoading] = useState(true)

  // Filters
  const [filtroEmpresa, setFiltroEmpresa] = useState('')
  const [filtroCategoria, setFiltroCategoria] = useState('')
  const [tipoFiltro, setTipoFiltro] = useState('')
  const [search, setSearch] = useState('')

  // Upload
  const [tipoUpload, setTipoUpload] = useState('')
  const [pedidoUpload, setPedidoUpload] = useState('')
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const [uploadSuccess, setUploadSuccess] = useState('')

  // Delete
  const [deleteTarget, setDeleteTarget] = useState<Documento | null>(null)
  const [deleting, setDeleting] = useState(false)

  const fileRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const [{ data: docs }, { data: tipos }, { data: peds }] = await Promise.all([
      supabase.from('documentos_receita').select('*').order('data_upload', { ascending: false }).limit(200),
      supabase.from('tipos_documento').select('*').order('id'),
      supabase.from('pedidos_solicitados_receita').select('id, empresa, categoria, cliente').order('id', { ascending: false }).limit(200),
    ])
    setDocumentos(docs ?? [])
    // Filter tipos: only id == -2 or id > 0 (same as Python)
    setTiposDoc((tipos ?? []).filter(t => t.id === -2 || t.id > 0))
    setPedidos(peds ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!tipoUpload) { setUploadError('Selecione o tipo de documento antes de enviar'); return }
    if (!pedidoUpload) { setUploadError('Selecione um pedido'); return }

    setUploading(true); setUploadError(''); setUploadSuccess('')
    const formData = new FormData()
    formData.append('file', file)
    formData.append('tipo_documento', tipoUpload)
    formData.append('modulo', 'recebimentos')
    formData.append('pedido_id', pedidoUpload)

    try {
      const res = await fetch('/api/documentos/upload', { method: 'POST', body: formData })
      if (!res.ok) throw new Error('Upload falhou')
      setUploadSuccess('Documento enviado com sucesso!')
      setTipoUpload(''); setPedidoUpload('')
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
    await supabase.from('documentos_receita').delete().eq('id', deleteTarget.id)
    setDeleting(false); setDeleteTarget(null); load()
  }

  const tipoNome = (id: number) => tiposDoc.find(t => t.id === id)?.tipo ?? `Tipo ${id}`
  const pedidoInfo = (id: number | null) => id ? pedidos.find(p => p.id === id) : null

  const pedidoMap = useMemo(() => {
    const map: Record<number, Pedido> = {}
    pedidos.forEach(p => { map[p.id] = p })
    return map
  }, [pedidos])

  const empresas = useMemo(() => [...new Set(pedidos.map(p => p.empresa).filter(Boolean))].sort(), [pedidos])
  const categorias = useMemo(() => {
    const base = filtroEmpresa ? pedidos.filter(p => p.empresa === filtroEmpresa) : pedidos
    return [...new Set(base.map(p => p.categoria).filter(Boolean))].sort()
  }, [pedidos, filtroEmpresa])

  const pedidosFiltradosUpload = useMemo(() => pedidos, [pedidos])

  const filtered = useMemo(() => {
    return documentos.filter(d => {
      const ped = d.pedido_id ? pedidoMap[d.pedido_id] : null
      if (filtroEmpresa && ped?.empresa !== filtroEmpresa) return false
      if (filtroCategoria && ped?.categoria !== filtroCategoria) return false
      if (tipoFiltro && String(d.tipo_documento) !== tipoFiltro) return false
      if (search) {
        const s = search.toLowerCase()
        return (d.nome_documento ?? '').toLowerCase().includes(s) ||
          String(d.pedido_id ?? '').includes(s) ||
          (ped?.cliente ?? '').toLowerCase().includes(s)
      }
      return true
    })
  }, [documentos, pedidoMap, filtroEmpresa, filtroCategoria, tipoFiltro, search])

  // Summary
  const totalDocs = filtered.length
  const tipoMaisComum = useMemo(() => {
    const counts: Record<number, number> = {}
    filtered.forEach(d => { counts[d.tipo_documento] = (counts[d.tipo_documento] ?? 0) + 1 })
    const maxId = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]
    return maxId ? tipoNome(Number(maxId[0])) : '-'
  }, [filtered, tiposDoc])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">Gestão de Documentos</h1>
          <p className="page-subtitle">Documentos vinculados a pedidos de recebimento</p>
        </div>
        <button onClick={load} className="btn-secondary p-2" title="Atualizar">
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Upload */}
      <div className="card">
        <h2 className="text-sm font-semibold text-slate-700 mb-4">Enviar Documento</h2>
        {uploadError && <p className="text-sm text-red-600 mb-3">{uploadError}</p>}
        {uploadSuccess && <p className="text-sm text-green-600 mb-3">{uploadSuccess}</p>}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
          <div>
            <label className="label">Tipo de Documento *</label>
            <select className="input" value={tipoUpload} onChange={e => setTipoUpload(e.target.value)}>
              <option value="">Selecionar...</option>
              {tiposDoc.map(t => <option key={t.id} value={t.id}>{t.tipo}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Pedido *</label>
            <select className="input" value={pedidoUpload} onChange={e => setPedidoUpload(e.target.value)}>
              <option value="">Selecionar...</option>
              {pedidosFiltradosUpload.map(p => (
                <option key={p.id} value={p.id}>#{p.id} – {p.cliente} ({p.empresa})</option>
              ))}
            </select>
          </div>
          <div>
            <button onClick={() => fileRef.current?.click()} className="btn-primary w-full justify-center" disabled={uploading}>
              <Upload size={16} /> {uploading ? 'Enviando...' : 'Selecionar Arquivo'}
            </button>
            <input type="file" ref={fileRef} className="hidden" onChange={handleUpload}
              accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx" />
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="card">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <label className="label">Empresa</label>
            <select className="input" value={filtroEmpresa}
              onChange={e => { setFiltroEmpresa(e.target.value); setFiltroCategoria('') }}>
              <option value="">Todas</option>
              {empresas.map(e => <option key={e} value={e}>{e}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Categoria</label>
            <select className="input" value={filtroCategoria}
              onChange={e => setFiltroCategoria(e.target.value)} disabled={!filtroEmpresa}>
              <option value="">Todas</option>
              {categorias.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Tipo de Documento</label>
            <select className="input" value={tipoFiltro} onChange={e => setTipoFiltro(e.target.value)}>
              <option value="">Todos</option>
              {tiposDoc.map(t => <option key={t.id} value={t.id}>{t.tipo}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Buscar</label>
            <div className="relative">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input className="input pl-9" placeholder="Nome, pedido ou cliente..."
                value={search} onChange={e => setSearch(e.target.value)} />
            </div>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <div className="card">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Total de Documentos</p>
          <p className="text-xl font-bold text-slate-900 mt-1">{totalDocs}</p>
        </div>
        <div className="card">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Tipo Mais Comum</p>
          <p className="text-base font-bold text-slate-900 mt-1 truncate">{tipoMaisComum}</p>
        </div>
        <div className="card">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Pedidos Únicos</p>
          <p className="text-xl font-bold text-slate-900 mt-1">
            {new Set(filtered.map(d => d.pedido_id).filter(Boolean)).size}
          </p>
        </div>
      </div>

      {/* Table */}
      <div className="card p-0 overflow-hidden">
        {loading ? (
          <div className="text-center py-12 text-slate-400">Carregando...</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 text-slate-400">Nenhum documento encontrado.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="table-header">
                <tr>
                  <th className="table-cell font-medium text-left">Documento</th>
                  <th className="table-cell font-medium text-left">Tipo</th>
                  <th className="table-cell font-medium text-left">Pedido / Cliente</th>
                  <th className="table-cell font-medium text-left">Empresa</th>
                  <th className="table-cell font-medium text-left">Enviado por</th>
                  <th className="table-cell font-medium text-left">Data</th>
                  <th className="table-cell font-medium text-center">Ações</th>
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
                        <span className="badge bg-slate-100 text-slate-600 text-xs">
                          {tipoNome(d.tipo_documento)}
                        </span>
                      </td>
                      <td className="table-cell">
                        {ped ? (
                          <div>
                            <span className="font-mono text-xs text-slate-500">#{d.pedido_id}</span>
                            <span className="text-slate-400 mx-1">·</span>
                            <span className="text-slate-700">{ped.cliente}</span>
                          </div>
                        ) : d.pedido_id ? `#${d.pedido_id}` : '-'}
                      </td>
                      <td className="table-cell text-slate-600">
                        {ped ? (
                          <div>
                            <p className="text-xs font-medium">{ped.empresa}</p>
                            <p className="text-xs text-slate-400">{ped.categoria}</p>
                          </div>
                        ) : '-'}
                      </td>
                      <td className="table-cell">{d.usuario}</td>
                      <td className="table-cell whitespace-nowrap">{fmtData(d.data_upload)}</td>
                      <td className="table-cell text-center">
                        <div className="flex items-center justify-center gap-1">
                          {d.anexo_url && (
                            <a href={`/api/b2/file?fileId=${encodeURIComponent(d.anexo_url)}`}
                              target="_blank" rel="noopener"
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
