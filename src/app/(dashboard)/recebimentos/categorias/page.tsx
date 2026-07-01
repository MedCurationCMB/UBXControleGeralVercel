'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { supabaseBrowser as supabase } from '@/lib/supabase/client'
import { Plus, Trash2, Upload, Download } from 'lucide-react'
import Confirm from '@/components/ui/Confirm'
import Modal from '@/components/ui/Modal'

interface Empresa { id: string; empresa: string }
interface Categoria { id: string; empresa: string; categoria: string }

function ImportModal({ open, onClose, empresas, onDone }: {
  open: boolean; onClose: () => void; empresas: Empresa[]; onDone: () => void
}) {
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<{ empresa: string; categoria: string }[]>([])
  const [importing, setImporting] = useState(false)
  const [msg, setMsg] = useState('')
  const [error, setError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const handleFile = async (f: File) => {
    setFile(f); setMsg(''); setError(''); setPreview([])
    try {
      const ExcelJS = (await import('exceljs')).default
      const wb = new ExcelJS.Workbook()
      await wb.xlsx.load(await f.arrayBuffer())
      const ws = wb.worksheets[0]
      const rows: { empresa: string; categoria: string }[] = []
      ws.eachRow((row, ri) => {
        if (ri === 1) return // skip header
        const empresa = String(row.getCell(1).value ?? '').trim()
        const categoria = String(row.getCell(2).value ?? '').trim()
        if (empresa && categoria) rows.push({ empresa, categoria })
      })
      setPreview(rows)
    } catch {
      setError('Erro ao ler arquivo. Verifique se é um .xlsx válido.')
    }
  }

  const handleImport = async () => {
    if (preview.length === 0) return
    setImporting(true); setError(''); setMsg('')

    const empresasValidas = new Set(empresas.map(e => e.empresa))
    const invalidas = [...new Set(preview.map(r => r.empresa))].filter(e => !empresasValidas.has(e))
    if (invalidas.length > 0) {
      setError(`Empresas não encontradas: ${invalidas.join(', ')}`)
      setImporting(false); return
    }

    const { data: existing } = await supabase.from('categorias_receita').select('empresa, categoria')
    const existingSet = new Set((existing ?? []).map(r => `${r.empresa}||${r.categoria}`))

    const duplicadas = preview.filter(r => existingSet.has(`${r.empresa}||${r.categoria}`))
    if (duplicadas.length > 0) {
      setError(`Já existem: ${duplicadas.map(r => `${r.categoria} (${r.empresa})`).join(', ')}`)
      setImporting(false); return
    }

    const { error: err } = await supabase.from('categorias_receita').insert(preview)
    setImporting(false)
    if (err) { setError(err.message); return }
    setMsg(`${preview.length} categorias importadas com sucesso!`)
    setPreview([]); setFile(null)
    if (fileRef.current) fileRef.current.value = ''
    onDone()
  }

  const handleDownloadTemplate = async () => {
    const ExcelJS = (await import('exceljs')).default
    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet('Categorias')
    ws.addRow(['empresa', 'categoria'])
    ws.addRow(['Empresa Exemplo', 'Categoria A'])
    ws.addRow(['Empresa Exemplo', 'Categoria B'])
    const buf = await wb.xlsx.writeBuffer()
    const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = 'template_categorias_receita.xlsx'; a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <Modal open={open} onClose={onClose} title="Importar Categorias em Lote" size="md">
      <div className="space-y-4">
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-800 space-y-1">
          <p className="font-semibold">Instruções:</p>
          <ol className="list-decimal list-inside space-y-0.5 text-xs">
            <li>Baixe o template Excel abaixo</li>
            <li>Preencha empresa e categoria (empresa deve existir no sistema)</li>
            <li>Não é possível importar categorias duplicadas</li>
            <li>Faça upload e confirme a importação</li>
          </ol>
        </div>

        <button onClick={handleDownloadTemplate} className="btn-secondary gap-1.5 text-sm">
          <Download size={14} /> Baixar Template
        </button>

        <div>
          <label className="label">Arquivo Excel (.xlsx)</label>
          <input ref={fileRef} type="file" accept=".xlsx" className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }} />
          <button type="button" onClick={() => fileRef.current?.click()}
            className="btn-secondary gap-1.5 text-sm">
            <Upload size={14} /> {file ? file.name.slice(0, 35) : 'Selecionar arquivo'}
          </button>
        </div>

        {preview.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-slate-600 mb-2">Preview ({preview.length} registros):</p>
            <div className="max-h-48 overflow-y-auto border border-slate-200 rounded-lg">
              <table className="w-full text-xs">
                <thead className="table-header">
                  <tr>
                    <th className="table-cell font-medium">Empresa</th>
                    <th className="table-cell font-medium">Categoria</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.map((r, i) => (
                    <tr key={i} className="table-row">
                      <td className="table-cell">{r.empresa}</td>
                      <td className="table-cell">{r.categoria}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {error && <p className="text-sm text-red-600">{error}</p>}
        {msg && <p className="text-sm text-green-600">{msg}</p>}

        <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
          <button onClick={onClose} className="btn-secondary text-sm">Fechar</button>
          <button onClick={handleImport}
            disabled={preview.length === 0 || importing}
            className="btn-primary text-sm">
            {importing ? 'Importando...' : `Confirmar Importação (${preview.length})`}
          </button>
        </div>
      </div>
    </Modal>
  )
}

export default function CategoriasRecebimentosPage() {
  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [empresas, setEmpresas] = useState<Empresa[]>([])
  const [loading, setLoading] = useState(true)
  const [filtroEmpresa, setFiltroEmpresa] = useState('')
  const [novaEmpresa, setNovaEmpresa] = useState('')
  const [novaCategoria, setNovaCategoria] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<Categoria | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [modalImport, setModalImport] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const [{ data: cats }, { data: emps }] = await Promise.all([
      supabase.from('categorias_receita').select('*').order('empresa').order('categoria'),
      supabase.from('empresas').select('*').order('empresa'),
    ])
    setCategorias(cats ?? [])
    setEmpresas(emps ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const handleAdd = async () => {
    if (!novaEmpresa) { setError('Selecione uma empresa'); return }
    if (!novaCategoria.trim()) { setError('Informe o nome da categoria'); return }
    setSaving(true); setError('')
    const { error: err } = await supabase.from('categorias_receita').insert({
      empresa: novaEmpresa,
      categoria: novaCategoria.trim(),
    })
    setSaving(false)
    if (err) { setError(err.message); return }
    setNovaCategoria(''); load()
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    await supabase.from('categorias_receita').delete().eq('id', deleteTarget.id)
    setDeleting(false); setDeleteTarget(null); load()
  }

  const filtered = categorias.filter(c => !filtroEmpresa || c.empresa === filtroEmpresa)
  const grouped = filtered.reduce<Record<string, Categoria[]>>((acc, c) => {
    if (!acc[c.empresa]) acc[c.empresa] = []
    acc[c.empresa].push(c)
    return acc
  }, {})

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="page-title">Categorias</h1>
          <p className="page-subtitle">Categorias de receita por empresa</p>
        </div>
        <button onClick={() => setModalImport(true)} className="btn-secondary gap-1.5 text-sm">
          <Upload size={14} /> Importar em Lote
        </button>
      </div>

      <div className="card">
        <h2 className="text-sm font-semibold text-slate-700 mb-4">Adicionar Categoria</h2>
        {error && <p className="text-sm text-red-600 mb-3">{error}</p>}
        <div className="flex gap-3 items-end flex-wrap">
          <div className="flex-1 min-w-[180px]">
            <label className="label">Empresa</label>
            <select className="input" value={novaEmpresa} onChange={e => setNovaEmpresa(e.target.value)}>
              <option value="">Selecionar...</option>
              {empresas.map(e => <option key={e.id} value={e.empresa}>{e.empresa}</option>)}
            </select>
          </div>
          <div className="flex-[2] min-w-[200px]">
            <label className="label">Categoria</label>
            <input className="input" placeholder="Nome da categoria..." value={novaCategoria}
              onChange={e => setNovaCategoria(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAdd()} />
          </div>
          <button onClick={handleAdd} className="btn-primary gap-1.5" disabled={saving}>
            <Plus size={16} /> {saving ? 'Salvando...' : 'Adicionar'}
          </button>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <label className="label mb-0 whitespace-nowrap">Filtrar empresa:</label>
        <select className="input max-w-xs" value={filtroEmpresa} onChange={e => setFiltroEmpresa(e.target.value)}>
          <option value="">Todas</option>
          {empresas.map(e => <option key={e.id} value={e.empresa}>{e.empresa}</option>)}
        </select>
        <span className="text-sm text-slate-500">{filtered.length} categorias</span>
      </div>

      {loading ? (
        <div className="card text-center py-12 text-slate-400">Carregando...</div>
      ) : Object.keys(grouped).length === 0 ? (
        <div className="card text-center py-12 text-slate-400">Nenhuma categoria cadastrada.</div>
      ) : (
        Object.entries(grouped).map(([empresa, cats]) => (
          <div key={empresa} className="card">
            <h3 className="text-sm font-semibold text-slate-700 mb-3">{empresa}</h3>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="table-header">
                  <tr>
                    <th className="table-cell text-left">Categoria</th>
                    <th className="table-cell text-center w-20">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {cats.map(c => (
                    <tr key={c.id} className="table-row">
                      <td className="table-cell">{c.categoria}</td>
                      <td className="table-cell text-center">
                        <button onClick={() => setDeleteTarget(c)}
                          className="p-1.5 rounded hover:bg-red-50 text-red-500">
                          <Trash2 size={15} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))
      )}

      <ImportModal
        open={modalImport}
        onClose={() => setModalImport(false)}
        empresas={empresas}
        onDone={load}
      />

      <Confirm
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Excluir Categoria"
        message={`Excluir a categoria "${deleteTarget?.categoria}" de ${deleteTarget?.empresa}?`}
        confirmLabel="Excluir"
        loading={deleting}
      />
    </div>
  )
}
