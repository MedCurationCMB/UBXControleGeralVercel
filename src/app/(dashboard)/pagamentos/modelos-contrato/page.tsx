'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { supabaseBrowser as supabase } from '@/lib/supabase/client'
import { Upload, Download, Trash2, FileText, RefreshCw, X } from 'lucide-react'

interface ModeloContrato {
  id: number; nome: string; estilo: 'variavel' | 'estatico'; arquivo_id: string
}

// ---- Upload tab (shared between Variável / Estático) ----
function UploadTab({
  estilo, onUploaded
}: { estilo: 'variavel' | 'estatico'; onUploaded: () => void }) {
  const [nome, setNome] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(''); setSuccess('')
    if (!nome.trim()) { setError('Informe o nome do modelo'); return }
    if (!file) { setError('Selecione um arquivo DOCX'); return }

    setUploading(true)
    const fd = new FormData()
    fd.append('file', file)
    fd.append('nome', nome.trim())
    fd.append('estilo', estilo)

    const res = await fetch('/api/modelos-contrato/upload', { method: 'POST', body: fd })
    const data = await res.json()
    setUploading(false)

    if (!res.ok) { setError(data.error ?? 'Erro ao enviar'); return }

    setSuccess('Modelo importado com sucesso!')
    setNome(''); setFile(null)
    if (fileRef.current) fileRef.current.value = ''
    setTimeout(() => setSuccess(''), 2000)
    onUploaded()
  }

  return (
    <form onSubmit={handleUpload} className="space-y-3">
      <div>
        <label className="label">Nome do modelo *</label>
        <input
          className="input"
          placeholder={estilo === 'variavel' ? 'Ex: Primeira Página' : 'Ex: Termos e Condições'}
          value={nome}
          onChange={e => setNome(e.target.value)}
        />
      </div>

      <div>
        <label className="label">Arquivo DOCX *</label>
        <div
          className="border-2 border-dashed border-slate-300 rounded-lg p-4 text-center cursor-pointer hover:border-blue-400 transition-colors"
          onClick={() => fileRef.current?.click()}
        >
          {file ? (
            <div className="flex items-center justify-center gap-2">
              <FileText size={16} className="text-blue-500" />
              <span className="text-sm text-slate-700">{file.name}</span>
              <button type="button"
                onClick={e => { e.stopPropagation(); setFile(null); if (fileRef.current) fileRef.current.value = '' }}
                className="text-slate-400 hover:text-red-500"><X size={13} /></button>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-1 text-slate-400">
              <Upload size={18} />
              <span className="text-xs">Clique para selecionar (.docx)</span>
            </div>
          )}
        </div>
        <input type="file" ref={fileRef} className="hidden" accept=".docx"
          onChange={e => setFile(e.target.files?.[0] ?? null)} />
      </div>

      {estilo === 'variavel' && (
        <p className="text-xs text-blue-700 bg-blue-50 border border-blue-100 rounded p-2">
          O arquivo DOCX deve conter placeholders como <code className="font-mono">{'{empresa}'}</code>, <code className="font-mono">{'{fornecedor}'}</code>, <code className="font-mono">{'{valor}'}</code>, etc.
        </p>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}
      {success && <p className="text-sm text-green-600">{success}</p>}

      <button type="submit" className="btn-primary w-full justify-center" disabled={uploading}>
        {uploading ? 'Enviando...' : `Importar Modelo ${estilo === 'variavel' ? 'Variável' : 'Estático'}`}
      </button>
    </form>
  )
}

// ---- Main Page ----
export default function ModelosContratoPage() {
  const [modelos, setModelos] = useState<ModeloContrato[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'variavel' | 'estatico'>('variavel')
  const [deleteTarget, setDeleteTarget] = useState<ModeloContrato | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [downloading, setDownloading] = useState<number | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase.from('modelo_contrato').select('*').order('nome')
    setModelos(data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const handleDownload = async (m: ModeloContrato) => {
    setDownloading(m.id)
    try {
      const res = await fetch(`/api/modelos-contrato/download?id=${m.id}`)
      if (!res.ok) throw new Error('Falha ao baixar')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${m.nome}.docx`
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      // silently ignore — user sees nothing happened
    } finally {
      setDownloading(null)
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    await supabase.from('modelo_contrato').delete().eq('id', deleteTarget.id)
    setDeleting(false)
    setDeleteTarget(null)
    load()
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">Modelos de Contrato</h1>
          <p className="page-subtitle">Templates DOCX para geração de contratos</p>
        </div>
        <button onClick={load} className="btn-secondary p-2" title="Atualizar">
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Two-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-6 items-start">

        {/* Left: Modelos Cadastrados */}
        <div className="space-y-2">
          <h2 className="text-base font-semibold text-slate-800">Modelos Cadastrados</h2>
          {loading ? (
            <div className="card text-center py-10 text-slate-400">Carregando...</div>
          ) : modelos.length === 0 ? (
            <div className="card text-center py-12 text-slate-400">
              <FileText size={36} className="mx-auto mb-2 text-slate-300" />
              <p className="font-medium">Nenhum modelo cadastrado</p>
              <p className="text-sm mt-1">Importe um arquivo DOCX para começar.</p>
            </div>
          ) : (
            <div className="card p-0 overflow-hidden">
              <div className="overflow-auto max-h-[420px]">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 z-10">
                    <tr className="table-header">
                      <th className="table-cell font-medium text-left">Nome do Modelo</th>
                      <th className="table-cell font-medium text-left">Tipo</th>
                      <th className="table-cell font-medium text-center w-20">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {modelos.map(m => (
                      <tr key={m.id} className="table-row">
                        <td className="table-cell">
                          <div className="flex items-center gap-2">
                            <FileText size={14} className="text-blue-400 shrink-0" />
                            <span className="font-medium text-slate-900">{m.nome}</span>
                          </div>
                        </td>
                        <td className="table-cell">
                          <span className={`badge text-xs ${m.estilo === 'variavel'
                            ? 'bg-purple-100 text-purple-700'
                            : 'bg-slate-100 text-slate-600'
                          }`}>
                            {m.estilo === 'variavel' ? 'Variável' : 'Estático'}
                          </span>
                        </td>
                        <td className="table-cell text-center">
                          <div className="flex items-center justify-center gap-1">
                            <button
                              onClick={() => handleDownload(m)}
                              disabled={downloading === m.id}
                              className="p-1.5 rounded hover:bg-blue-50 text-blue-500 disabled:opacity-40"
                              title="Baixar"
                            >
                              <Download size={14} className={downloading === m.id ? 'animate-bounce' : ''} />
                            </button>
                            <button
                              onClick={() => setDeleteTarget(m)}
                              className="p-1.5 rounded hover:bg-red-50 text-red-400"
                              title="Excluir"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Right: Importar Novo Modelo */}
        <div className="space-y-2">
          <h2 className="text-base font-semibold text-slate-800">Importar Novo Modelo</h2>
          <div className="card space-y-4">
            {/* Tabs */}
            <div className="flex border-b border-slate-200 -mx-6 px-6">
              {(['variavel', 'estatico'] as const).map(t => (
                <button key={t} onClick={() => setTab(t)}
                  className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${tab === t
                    ? 'border-primary-500 text-primary-600'
                    : 'border-transparent text-slate-500 hover:text-slate-700'
                  }`}>
                  {t === 'variavel' ? 'Modelo Variável' : 'Modelo Estático'}
                </button>
              ))}
            </div>

            <UploadTab key={tab} estilo={tab} onUploaded={load} />
          </div>
        </div>
      </div>

      {/* Delete confirm */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-6 space-y-4">
            <h3 className="font-semibold text-slate-900">Excluir Modelo</h3>
            <p className="text-sm text-slate-600">
              Tem certeza que deseja excluir o modelo <strong>"{deleteTarget.nome}"</strong>?
              O arquivo no B2 não será removido automaticamente.
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setDeleteTarget(null)} className="btn-secondary" disabled={deleting}>
                Cancelar
              </button>
              <button onClick={handleDelete} className="btn-danger" disabled={deleting}>
                {deleting ? 'Excluindo...' : 'Excluir'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
