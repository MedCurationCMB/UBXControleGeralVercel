'use client'

import { useState, useEffect, useCallback } from 'react'
import { supabaseBrowser as supabase } from '@/lib/supabase/client'
import { Plus, Trash2 } from 'lucide-react'
import Confirm from '@/components/ui/Confirm'

interface Empresa { id: string; empresa: string }
interface Categoria { id: string; empresa: string; categoria: string }

export default function CategoriasPage() {
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

  const load = useCallback(async () => {
    setLoading(true)
    const [{ data: cats }, { data: emps }] = await Promise.all([
      supabase.from('categorias').select('*').order('empresa').order('categoria'),
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
    const { error: err } = await supabase.from('categorias').insert({
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
    await supabase.from('categorias').delete().eq('id', deleteTarget.id)
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
      <div>
        <h1 className="page-title">Categorias</h1>
        <p className="page-subtitle">Categorias de despesa por empresa</p>
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
          <button onClick={handleAdd} className="btn-primary" disabled={saving}>
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
                        <button onClick={() => setDeleteTarget(c)} className="p-1.5 rounded hover:bg-red-50 text-red-500">
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
