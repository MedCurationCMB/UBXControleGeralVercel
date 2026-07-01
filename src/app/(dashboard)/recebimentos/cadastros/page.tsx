'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { supabaseBrowser as supabase } from '@/lib/supabase/client'
import { Plus, Edit2, Trash2, Check, X, RefreshCw } from 'lucide-react'
import Confirm from '@/components/ui/Confirm'

// ─── Types ───────────────────────────────────────────────────────────────────

interface Cliente {
  id: number
  razao_social: string | null
  nome_fantasia: string | null
  cnpj: string | null
  inscricao_estadual: string | null
  endereco: string | null
  telefone: string | null
  email: string | null
}

interface Empresa {
  id: string
  nome: string | null
  cnpj: string | null
  endereco: string | null
  email: string | null
  telefone: string | null
}

interface CategoriaReceita {
  id: string
  empresa: string
  categoria: string
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function Cell({ value, editing, onChange, placeholder }: {
  value: string | null; editing: boolean; onChange: (v: string) => void; placeholder?: string
}) {
  return editing
    ? <input className="input text-xs py-0.5 px-1 w-full" value={value ?? ''} placeholder={placeholder}
        onChange={e => onChange(e.target.value)} />
    : <span className="text-sm text-slate-700">{value || <span className="text-slate-300">—</span>}</span>
}

function ActionBtns({ onEdit, onDelete }: { onEdit: () => void; onDelete: () => void }) {
  return (
    <div className="flex items-center gap-1 justify-center">
      <button onClick={onEdit} className="p-1.5 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-700">
        <Edit2 size={13} />
      </button>
      <button onClick={onDelete} className="p-1.5 rounded hover:bg-red-50 text-slate-400 hover:text-red-500">
        <Trash2 size={13} />
      </button>
    </div>
  )
}

function SaveCancelBtns({ onSave, onCancel, saving }: { onSave: () => void; onCancel: () => void; saving: boolean }) {
  return (
    <div className="flex items-center gap-1 justify-center">
      <button onClick={onSave} disabled={saving}
        className="p-1.5 rounded hover:bg-green-50 text-green-600 disabled:opacity-50">
        <Check size={13} />
      </button>
      <button onClick={onCancel} className="p-1.5 rounded hover:bg-slate-100 text-slate-400">
        <X size={13} />
      </button>
    </div>
  )
}

// ─── Tab: Clientes ────────────────────────────────────────────────────────────

function ClientesTab() {
  const [rows, setRows] = useState<Cliente[]>([])
  const [loading, setLoading] = useState(true)
  const [editId, setEditId] = useState<number | null>(null)
  const [editForm, setEditForm] = useState<Partial<Cliente>>({})
  const [saving, setSaving] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Cliente | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [addForm, setAddForm] = useState<Partial<Cliente>>({})
  const [adding, setAdding] = useState(false)
  const [addError, setAddError] = useState('')
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase.from('clientes').select('*').order('id')
    setRows(data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const startEdit = (r: Cliente) => { setEditId(r.id); setEditForm({ ...r }); setError('') }
  const cancelEdit = () => { setEditId(null); setEditForm({}) }

  const saveEdit = async () => {
    if (!editId) return
    setSaving(true); setError('')
    const { id: _, ...data } = editForm as Cliente
    const { error: err } = await supabase.from('clientes').update(data).eq('id', editId)
    setSaving(false)
    if (err) { setError(err.message); return }
    setEditId(null); load()
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    const { error: err } = await supabase.from('clientes').delete().eq('id', deleteTarget.id)
    setDeleting(false)
    if (err) { setError(err.code === '23503' ? 'Não é possível excluir: existem registros dependentes.' : err.message) }
    setDeleteTarget(null); load()
  }

  const handleAdd = async () => {
    if (!addForm.razao_social?.trim()) { setAddError('Razão Social é obrigatória'); return }
    setAdding(true); setAddError('')
    const { error: err } = await supabase.from('clientes').insert({
      razao_social: addForm.razao_social?.trim() || null,
      nome_fantasia: addForm.nome_fantasia?.trim() || null,
      cnpj: addForm.cnpj?.trim() || null,
      inscricao_estadual: addForm.inscricao_estadual?.trim() || null,
      endereco: addForm.endereco?.trim() || null,
      telefone: addForm.telefone?.trim() || null,
      email: addForm.email?.trim() || null,
    })
    setAdding(false)
    if (err) { setAddError(err.message); return }
    setAddForm({}); load()
  }

  const f = (key: keyof Cliente) => (v: string) => setEditForm(p => ({ ...p, [key]: v || null }))
  const af = (key: keyof Cliente) => (v: string) => setAddForm(p => ({ ...p, [key]: v }))

  const cols = [
    { key: 'razao_social', label: 'Razão Social' },
    { key: 'nome_fantasia', label: 'Nome Fantasia' },
    { key: 'cnpj', label: 'CNPJ' },
    { key: 'inscricao_estadual', label: 'Insc. Estadual' },
    { key: 'endereco', label: 'Endereço' },
    { key: 'telefone', label: 'Telefone' },
    { key: 'email', label: 'Email' },
  ] as const

  return (
    <div className="space-y-4">
      {error && <p className="text-sm text-red-600">{error}</p>}

      {/* Add row */}
      <div className="p-4 bg-slate-50 rounded-lg border border-slate-200 space-y-3">
        <p className="text-xs font-semibold text-slate-600">Novo cliente</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {cols.map(c => (
            <div key={c.key}>
              <label className="label text-xs">{c.label}{c.key === 'razao_social' ? ' *' : ''}</label>
              <input className="input text-xs" value={(addForm as Record<string, string>)[c.key] ?? ''}
                onChange={e => af(c.key)(e.target.value)} />
            </div>
          ))}
        </div>
        {addError && <p className="text-xs text-red-600">{addError}</p>}
        <button onClick={handleAdd} disabled={adding} className="btn-primary text-sm gap-1.5">
          <Plus size={14} /> {adding ? 'Adicionando...' : 'Adicionar'}
        </button>
      </div>

      {loading ? (
        <p className="text-slate-400 text-sm text-center py-8">Carregando...</p>
      ) : rows.length === 0 ? (
        <p className="text-slate-400 text-sm text-center py-8">Nenhum cliente cadastrado.</p>
      ) : (
        <div className="overflow-auto border border-slate-200 rounded-lg">
          <table className="w-full text-xs">
            <thead className="table-header">
              <tr>
                <th className="table-cell font-medium w-10">ID</th>
                {cols.map(c => <th key={c.key} className="table-cell font-medium">{c.label}</th>)}
                <th className="table-cell font-medium w-20">Ações</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id} className={`table-row ${editId === r.id ? 'bg-blue-50' : ''}`}>
                  <td className="table-cell text-slate-400">{r.id}</td>
                  {cols.map(c => (
                    <td key={c.key} className="table-cell">
                      <Cell value={editId === r.id ? (editForm[c.key] ?? null) : r[c.key]}
                        editing={editId === r.id} onChange={f(c.key)} />
                    </td>
                  ))}
                  <td className="table-cell">
                    {editId === r.id
                      ? <SaveCancelBtns onSave={saveEdit} onCancel={cancelEdit} saving={saving} />
                      : <ActionBtns onEdit={() => startEdit(r)} onDelete={() => setDeleteTarget(r)} />}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Confirm open={!!deleteTarget} onClose={() => setDeleteTarget(null)} onConfirm={handleDelete}
        title="Excluir Cliente"
        message={`Excluir o cliente "${deleteTarget?.razao_social ?? deleteTarget?.nome_fantasia}"?`}
        confirmLabel="Excluir" loading={deleting} />
    </div>
  )
}

// ─── Tab: Empresas ────────────────────────────────────────────────────────────

function EmpresasTab() {
  const [rows, setRows] = useState<Empresa[]>([])
  const [loading, setLoading] = useState(true)
  const [editId, setEditId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<Partial<Empresa>>({})
  const [saving, setSaving] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Empresa | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [addForm, setAddForm] = useState<Partial<Empresa>>({})
  const [adding, setAdding] = useState(false)
  const [addError, setAddError] = useState('')
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase.from('empresas').select('*').order('nome')
    setRows(data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const startEdit = (r: Empresa) => { setEditId(r.id); setEditForm({ ...r }); setError('') }
  const cancelEdit = () => { setEditId(null); setEditForm({}) }

  const saveEdit = async () => {
    if (!editId) return
    setSaving(true); setError('')

    const original = rows.find(r => r.id === editId)
    const nomeAntigo = original?.nome
    const nomeNovo = editForm.nome?.trim() || null

    // Cascade: if nome changed, update categorias_receita references
    if (nomeAntigo && nomeNovo && nomeAntigo !== nomeNovo) {
      await supabase.from('categorias_receita').update({ empresa: nomeNovo }).eq('empresa', nomeAntigo)
    }

    const { id: _, ...data } = editForm as Empresa
    const { error: err } = await supabase.from('empresas').update({ ...data, nome: nomeNovo }).eq('id', editId)
    setSaving(false)
    if (err) { setError(err.message); return }
    setEditId(null); load()
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    const { error: err } = await supabase.from('empresas').delete().eq('id', deleteTarget.id)
    setDeleting(false)
    if (err) { setError(err.code === '23503' ? 'Não é possível excluir: existem registros dependentes.' : err.message) }
    setDeleteTarget(null); load()
  }

  const handleAdd = async () => {
    if (!addForm.nome?.trim()) { setAddError('Nome é obrigatório'); return }
    setAdding(true); setAddError('')
    const { error: err } = await supabase.from('empresas').insert({
      nome: addForm.nome.trim(),
      cnpj: addForm.cnpj?.trim() || null,
      endereco: addForm.endereco?.trim() || null,
      email: addForm.email?.trim() || null,
      telefone: addForm.telefone?.trim() || null,
    })
    setAdding(false)
    if (err) { setAddError(err.message); return }
    setAddForm({}); load()
  }

  const cols = [
    { key: 'nome', label: 'Nome' },
    { key: 'cnpj', label: 'CNPJ' },
    { key: 'endereco', label: 'Endereço' },
    { key: 'email', label: 'Email' },
    { key: 'telefone', label: 'Telefone' },
  ] as const

  const f = (key: keyof Empresa) => (v: string) => setEditForm(p => ({ ...p, [key]: v || null }))
  const af = (key: keyof Empresa) => (v: string) => setAddForm(p => ({ ...p, [key]: v }))

  return (
    <div className="space-y-4">
      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2">
        Ao renomear uma empresa, as referências em Categorias de Receita serão atualizadas automaticamente.
      </div>

      {/* Add row */}
      <div className="p-4 bg-slate-50 rounded-lg border border-slate-200 space-y-3">
        <p className="text-xs font-semibold text-slate-600">Nova empresa</p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
          {cols.map(c => (
            <div key={c.key}>
              <label className="label text-xs">{c.label}{c.key === 'nome' ? ' *' : ''}</label>
              <input className="input text-xs" value={(addForm as Record<string, string>)[c.key] ?? ''}
                onChange={e => af(c.key)(e.target.value)} />
            </div>
          ))}
        </div>
        {addError && <p className="text-xs text-red-600">{addError}</p>}
        <button onClick={handleAdd} disabled={adding} className="btn-primary text-sm gap-1.5">
          <Plus size={14} /> {adding ? 'Adicionando...' : 'Adicionar'}
        </button>
      </div>

      {loading ? (
        <p className="text-slate-400 text-sm text-center py-8">Carregando...</p>
      ) : rows.length === 0 ? (
        <p className="text-slate-400 text-sm text-center py-8">Nenhuma empresa cadastrada.</p>
      ) : (
        <div className="overflow-auto border border-slate-200 rounded-lg">
          <table className="w-full text-xs">
            <thead className="table-header">
              <tr>
                {cols.map(c => <th key={c.key} className="table-cell font-medium">{c.label}</th>)}
                <th className="table-cell font-medium w-20">Ações</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id} className={`table-row ${editId === r.id ? 'bg-blue-50' : ''}`}>
                  {cols.map(c => (
                    <td key={c.key} className="table-cell">
                      <Cell value={editId === r.id ? ((editForm[c.key] as string) ?? null) : r[c.key]}
                        editing={editId === r.id} onChange={f(c.key)} />
                    </td>
                  ))}
                  <td className="table-cell">
                    {editId === r.id
                      ? <SaveCancelBtns onSave={saveEdit} onCancel={cancelEdit} saving={saving} />
                      : <ActionBtns onEdit={() => startEdit(r)} onDelete={() => setDeleteTarget(r)} />}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Confirm open={!!deleteTarget} onClose={() => setDeleteTarget(null)} onConfirm={handleDelete}
        title="Excluir Empresa"
        message={`Excluir a empresa "${deleteTarget?.nome}"? Isso pode impactar categorias e pedidos vinculados.`}
        confirmLabel="Excluir" loading={deleting} />
    </div>
  )
}

// ─── Tab: Categorias de Receita ───────────────────────────────────────────────

function CategoriasReceitaTab() {
  const [rows, setRows] = useState<CategoriaReceita[]>([])
  const [empresas, setEmpresas] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [filtroEmpresa, setFiltroEmpresa] = useState('')
  const [editId, setEditId] = useState<string | null>(null)
  const [editCategoria, setEditCategoria] = useState('')
  const [saving, setSaving] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<CategoriaReceita | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [addEmpresa, setAddEmpresa] = useState('')
  const [addCategoria, setAddCategoria] = useState('')
  const [adding, setAdding] = useState(false)
  const [addError, setAddError] = useState('')
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const [{ data: cats }, { data: emps }] = await Promise.all([
      supabase.from('categorias_receita').select('*').order('empresa').order('categoria'),
      supabase.from('empresas').select('nome').order('nome'),
    ])
    setRows(cats ?? [])
    setEmpresas((emps ?? []).map(e => e.nome).filter(Boolean) as string[])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const startEdit = (r: CategoriaReceita) => { setEditId(r.id); setEditCategoria(r.categoria); setError('') }
  const cancelEdit = () => { setEditId(null); setEditCategoria('') }

  const saveEdit = async () => {
    if (!editId || !editCategoria.trim()) return
    setSaving(true); setError('')
    const { error: err } = await supabase.from('categorias_receita').update({ categoria: editCategoria.trim() }).eq('id', editId)
    setSaving(false)
    if (err) { setError(err.message); return }
    setEditId(null); load()
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    const { error: err } = await supabase.from('categorias_receita').delete().eq('id', deleteTarget.id)
    setDeleting(false)
    if (err) { setError(err.code === '23503' ? 'Não é possível excluir: existem registros dependentes.' : err.message) }
    setDeleteTarget(null); load()
  }

  const handleAdd = async () => {
    if (!addEmpresa) { setAddError('Selecione uma empresa'); return }
    if (!addCategoria.trim()) { setAddError('Categoria é obrigatória'); return }
    setAdding(true); setAddError('')
    const { error: err } = await supabase.from('categorias_receita').insert({
      empresa: addEmpresa, categoria: addCategoria.trim(),
    })
    setAdding(false)
    if (err) { setAddError(err.message); return }
    setAddCategoria(''); load()
  }

  const filtered = filtroEmpresa ? rows.filter(r => r.empresa === filtroEmpresa) : rows

  return (
    <div className="space-y-4">
      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-lg p-2">
        O campo <strong>Empresa</strong> é somente leitura. Para alterar a empresa de uma categoria, exclua e recrie-a. Para renomear empresas, use a aba Empresas.
      </div>

      {/* Add row */}
      <div className="p-4 bg-slate-50 rounded-lg border border-slate-200 space-y-3">
        <p className="text-xs font-semibold text-slate-600">Nova categoria</p>
        <div className="flex gap-2 flex-wrap items-end">
          <div className="flex-1 min-w-[180px]">
            <label className="label text-xs">Empresa *</label>
            <select className="input text-xs" value={addEmpresa} onChange={e => setAddEmpresa(e.target.value)}>
              <option value="">Selecionar...</option>
              {empresas.map(e => <option key={e} value={e}>{e}</option>)}
            </select>
          </div>
          <div className="flex-[2] min-w-[200px]">
            <label className="label text-xs">Categoria *</label>
            <input className="input text-xs" value={addCategoria}
              onChange={e => setAddCategoria(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAdd()} />
          </div>
          <button onClick={handleAdd} disabled={adding} className="btn-primary text-sm gap-1.5">
            <Plus size={14} /> {adding ? 'Adicionando...' : 'Adicionar'}
          </button>
        </div>
        {addError && <p className="text-xs text-red-600">{addError}</p>}
      </div>

      {/* Filter */}
      <div className="flex items-center gap-3">
        <label className="label mb-0 text-xs whitespace-nowrap">Filtrar por empresa:</label>
        <select className="input max-w-xs text-xs" value={filtroEmpresa} onChange={e => setFiltroEmpresa(e.target.value)}>
          <option value="">Todas</option>
          {empresas.map(e => <option key={e} value={e}>{e}</option>)}
        </select>
        <span className="text-xs text-slate-500">{filtered.length} categorias</span>
      </div>

      {loading ? (
        <p className="text-slate-400 text-sm text-center py-8">Carregando...</p>
      ) : filtered.length === 0 ? (
        <p className="text-slate-400 text-sm text-center py-8">Nenhuma categoria cadastrada.</p>
      ) : (
        <div className="overflow-auto border border-slate-200 rounded-lg">
          <table className="w-full text-xs">
            <thead className="table-header">
              <tr>
                <th className="table-cell font-medium">Empresa</th>
                <th className="table-cell font-medium">Categoria</th>
                <th className="table-cell font-medium w-20">Ações</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(r => (
                <tr key={r.id} className={`table-row ${editId === r.id ? 'bg-blue-50' : ''}`}>
                  <td className="table-cell text-slate-500">{r.empresa}</td>
                  <td className="table-cell">
                    {editId === r.id
                      ? <input className="input text-xs py-0.5 px-1 w-full" value={editCategoria}
                          onChange={e => setEditCategoria(e.target.value)} />
                      : <span className="text-sm text-slate-700">{r.categoria}</span>}
                  </td>
                  <td className="table-cell">
                    {editId === r.id
                      ? <SaveCancelBtns onSave={saveEdit} onCancel={cancelEdit} saving={saving} />
                      : <ActionBtns onEdit={() => startEdit(r)} onDelete={() => setDeleteTarget(r)} />}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Confirm open={!!deleteTarget} onClose={() => setDeleteTarget(null)} onConfirm={handleDelete}
        title="Excluir Categoria"
        message={`Excluir a categoria "${deleteTarget?.categoria}" de ${deleteTarget?.empresa}?`}
        confirmLabel="Excluir" loading={deleting} />
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

const TABS = [
  { id: 'clientes', label: 'Clientes' },
  { id: 'empresas', label: 'Empresas / Centros de Custo' },
  { id: 'categorias', label: 'Categorias de Receita' },
] as const

type TabId = typeof TABS[number]['id']

export default function ControleCadastrosRecebimentosPage() {
  const [tab, setTab] = useState<TabId>('clientes')

  return (
    <div className="space-y-5">
      <div>
        <h1 className="page-title">Controle de Cadastros</h1>
        <p className="page-subtitle">Recebimentos — gerenciamento de clientes, empresas e categorias</p>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200 -mb-1">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-5 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
              tab === t.id
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      <div>
        {tab === 'clientes' && <ClientesTab />}
        {tab === 'empresas' && <EmpresasTab />}
        {tab === 'categorias' && <CategoriasReceitaTab />}
      </div>
    </div>
  )
}
