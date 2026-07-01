'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { supabaseBrowser as supabase } from '@/lib/supabase/client'
import { Plus, Pencil, Trash2, Search, RefreshCw, X, Download, Upload, FileSpreadsheet, CheckCircle, AlertCircle } from 'lucide-react'

// ── Types ──────────────────────────────────────────────────────────────────────
interface TipoChave { id: number; tipo: string }
interface Cliente {
  id: number; nome: string; cnpj_cpf: string | null
  rua_avenida: string | null; numero: string | null; complemento: string | null
  bairro: string | null; cidade: string | null; estado: string | null; cep: string | null
  tipo_chave: number | null; chave_pix: string | null
}

const UFS = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO']

// ── CPF/CNPJ helpers ──────────────────────────────────────────────────────────
function somenteDigitos(v: string) { return v.replace(/\D/g, '') }
function validarCpfCnpj(v: string) {
  const d = somenteDigitos(v)
  return { ok: d.length === 11 || d.length === 14, digitos: d }
}
function formatarCpfCnpj(d: string): string {
  if (d.length === 11) return `${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6,9)}-${d.slice(9,11)}`
  if (d.length === 14) return `${d.slice(0,2)}.${d.slice(2,5)}.${d.slice(5,8)}/${d.slice(8,12)}-${d.slice(12,14)}`
  return d
}
function isCadastroCompleto(c: Cliente) {
  return !!(c.nome && c.cnpj_cpf && c.rua_avenida && c.numero &&
    c.bairro && c.cidade && c.estado && c.cep && c.tipo_chave && c.chave_pix)
}

// ── Form Modal ─────────────────────────────────────────────────────────────────
const EMPTY_FORM: Omit<Cliente, 'id'> = {
  nome: '', cnpj_cpf: '', rua_avenida: '', numero: '', complemento: '',
  bairro: '', cidade: '', estado: '', cep: '', tipo_chave: null, chave_pix: '',
}

function ClienteModal({ initial, tiposChave, onClose, onSaved }: {
  initial: Partial<Cliente> & { id?: number }
  tiposChave: TipoChave[]
  onClose: () => void
  onSaved: () => void
}) {
  const [form, setForm] = useState({ ...EMPTY_FORM, ...initial })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const isEditing = !!initial.id
  const tipoCpfCnpjId = tiposChave.find(t =>
    t.tipo.toLowerCase().includes('cpf') || t.tipo.toLowerCase().includes('cnpj')
  )?.id
  const isTipoCpfCnpj = tipoCpfCnpjId != null && form.tipo_chave === tipoCpfCnpjId

  useEffect(() => {
    if (isTipoCpfCnpj) setForm(f => ({ ...f, chave_pix: f.cnpj_cpf ?? '' }))
  }, [isTipoCpfCnpj, form.cnpj_cpf])

  const set = (k: keyof typeof form, v: string | number | null) =>
    setForm(f => ({ ...f, [k]: v }))

  const handleSave = async () => {
    setError('')
    if (!form.nome.trim()) { setError('Nome é obrigatório'); return }

    let payload: Partial<Cliente> = { ...form, nome: form.nome.trim() }

    if (form.cnpj_cpf) {
      const { ok, digitos } = validarCpfCnpj(form.cnpj_cpf)
      if (!ok) { setError('CPF/CNPJ inválido — informe 11 (CPF) ou 14 (CNPJ) dígitos.'); return }
      const formatted = formatarCpfCnpj(digitos)
      payload.cnpj_cpf = formatted
      if (isTipoCpfCnpj) payload.chave_pix = formatted
    }

    setSaving(true)
    const { error: err } = initial.id
      ? await supabase.from('clientes').update(payload).eq('id', initial.id)
      : await supabase.from('clientes').insert(payload)
    setSaving(false)
    if (err) { setError(err.message); return }
    onSaved()
  }

  const handleDelete = async () => {
    if (!initial.id) return
    setDeleting(true)
    await supabase.from('clientes').delete().eq('id', initial.id)
    setDeleting(false)
    onSaved()
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">
            {isEditing ? `Editar — ${initial.nome}` : 'Novo Cliente'}
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label className="label">Nome *</label>
            <input className="input" value={form.nome} onChange={e => set('nome', e.target.value)} />
          </div>
          <div>
            <label className="label">CNPJ/CPF</label>
            <input className="input" placeholder="Somente dígitos ou formatado"
              value={form.cnpj_cpf ?? ''} onChange={e => set('cnpj_cpf', e.target.value)} />
          </div>
          <div>
            <label className="label">CEP</label>
            <input className="input" value={form.cep ?? ''} onChange={e => set('cep', e.target.value)} />
          </div>
          <div className="col-span-2">
            <label className="label">Rua/Avenida</label>
            <input className="input" value={form.rua_avenida ?? ''} onChange={e => set('rua_avenida', e.target.value)} />
          </div>
          <div>
            <label className="label">Número</label>
            <input className="input" value={form.numero ?? ''} onChange={e => set('numero', e.target.value)} />
          </div>
          <div>
            <label className="label">Complemento</label>
            <input className="input" value={form.complemento ?? ''} onChange={e => set('complemento', e.target.value)} />
          </div>
          <div>
            <label className="label">Bairro</label>
            <input className="input" value={form.bairro ?? ''} onChange={e => set('bairro', e.target.value)} />
          </div>
          <div>
            <label className="label">Cidade</label>
            <input className="input" value={form.cidade ?? ''} onChange={e => set('cidade', e.target.value)} />
          </div>
          <div>
            <label className="label">Estado (UF)</label>
            <select className="input" value={form.estado ?? ''} onChange={e => set('estado', e.target.value)}>
              <option value="">Selecione...</option>
              {UFS.map(uf => <option key={uf} value={uf}>{uf}</option>)}
            </select>
          </div>
          <div />
          <div>
            <label className="label">Tipo de Chave PIX</label>
            <select className="input" value={form.tipo_chave ?? ''}
              onChange={e => set('tipo_chave', e.target.value ? Number(e.target.value) : null)}>
              <option value="">-- Sem PIX --</option>
              {tiposChave.map(t => <option key={t.id} value={t.id}>{t.tipo}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Chave PIX</label>
            <input className="input" disabled={isTipoCpfCnpj}
              placeholder={isTipoCpfCnpj ? 'Preenchido automaticamente' : ''}
              value={isTipoCpfCnpj ? (form.cnpj_cpf ?? '') : (form.chave_pix ?? '')}
              onChange={e => set('chave_pix', e.target.value)} />
            {isTipoCpfCnpj && (
              <p className="text-xs text-slate-400 mt-1">A chave PIX será o CPF/CNPJ do cliente.</p>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between pt-2 border-t border-slate-100">
          {isEditing ? (
            confirmDelete ? (
              <div className="flex items-center gap-2">
                <span className="text-sm text-red-600">Confirmar exclusão?</span>
                <button onClick={handleDelete} disabled={deleting}
                  className="px-3 py-1.5 bg-red-600 text-white rounded text-sm hover:bg-red-700 disabled:opacity-50">
                  {deleting ? 'Excluindo...' : 'Excluir'}
                </button>
                <button onClick={() => setConfirmDelete(false)} className="btn-secondary text-sm px-3 py-1.5">Cancelar</button>
              </div>
            ) : (
              <button onClick={() => setConfirmDelete(true)}
                className="flex items-center gap-1.5 text-sm text-red-500 hover:text-red-700">
                <Trash2 size={14} /> Excluir
              </button>
            )
          ) : <span />}
          <div className="flex gap-2">
            <button onClick={onClose} className="btn-secondary" disabled={saving}>Cancelar</button>
            <button onClick={handleSave} className="btn-primary" disabled={saving}>
              {saving ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Import Modal ───────────────────────────────────────────────────────────────
function ImportarModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [tab, setTab] = useState<'simples' | 'completo'>('simples')
  const [simplesFile, setSimplesFile] = useState<File | null>(null)
  const [simplesLoading, setSimplesLoading] = useState(false)
  const [simplesError, setSimplesError] = useState('')
  const [simplesSuccess, setSimplesSuccess] = useState('')
  const simplesRef = useRef<HTMLInputElement>(null)

  const [completoFile, setCompletoFile] = useState<File | null>(null)
  const [completoLoading, setCompletoLoading] = useState(false)
  const [completoError, setCompletoError] = useState('')
  const [completoSuccess, setCompletoSuccess] = useState('')
  const completoRef = useRef<HTMLInputElement>(null)

  const downloadTemplate = async (tipo: 'simples' | 'completo') => {
    const url = tipo === 'simples' ? '/api/clientes/template' : '/api/clientes/template-completo'
    const res = await fetch(url)
    if (!res.ok) return
    const blob = await res.blob()
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = tipo === 'simples' ? 'template_clientes.xlsx' : 'template_clientes_completo.xlsx'
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const handleImportSimples = async () => {
    if (!simplesFile) return
    setSimplesLoading(true); setSimplesError(''); setSimplesSuccess('')
    const fd = new FormData(); fd.append('file', simplesFile)
    const res = await fetch('/api/clientes/importar', { method: 'POST', body: fd })
    const data = await res.json()
    setSimplesLoading(false)
    if (!res.ok) { setSimplesError(data.error ?? 'Erro ao importar'); return }
    setSimplesSuccess(`${data.count} cliente(s) cadastrado(s) com sucesso!`)
    setSimplesFile(null); if (simplesRef.current) simplesRef.current.value = ''
    onSaved()
  }

  const handleImportCompleto = async () => {
    if (!completoFile) return
    setCompletoLoading(true); setCompletoError(''); setCompletoSuccess('')
    const fd = new FormData(); fd.append('file', completoFile)
    const res = await fetch('/api/clientes/importar-completo', { method: 'POST', body: fd })
    const data = await res.json()
    setCompletoLoading(false)
    if (!res.ok) { setCompletoError(data.error ?? 'Erro ao importar'); return }
    setCompletoSuccess(`${data.count} cliente(s) atualizado(s) com sucesso!`)
    if (data.warnings?.length) setCompletoError(`Avisos: ${data.warnings.join('; ')}`)
    setCompletoFile(null); if (completoRef.current) completoRef.current.value = ''
    onSaved()
  }

  const UploadZone = ({ file, onPick, inputRef }: {
    file: File | null; onPick: (f: File | null) => void; inputRef: React.RefObject<HTMLInputElement | null>
  }) => (
    <div className="border-2 border-dashed border-slate-300 rounded-lg p-6 text-center cursor-pointer hover:border-blue-400 transition-colors"
      onClick={() => inputRef.current?.click()}>
      {file ? (
        <div className="flex items-center justify-center gap-2">
          <FileSpreadsheet size={18} className="text-green-600" />
          <span className="text-sm text-slate-700">{file.name}</span>
          <button type="button" onClick={e => { e.stopPropagation(); onPick(null) }}
            className="text-slate-400 hover:text-red-500"><X size={14} /></button>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-2 text-slate-400">
          <Upload size={22} />
          <span className="text-sm">Selecione o arquivo Excel (.xlsx)</span>
        </div>
      )}
      <input type="file" ref={inputRef} className="hidden" accept=".xlsx"
        onChange={e => { const f = e.target.files?.[0]; onPick(f ?? null) }} />
    </div>
  )

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-xl w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">Importar Clientes em Lote</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
        </div>

        <div className="flex border-b border-slate-200">
          {(['simples', 'completo'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${tab === t
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
              {t === 'simples' ? 'Cadastro Simples (nomes)' : 'Cadastro Completo'}
            </button>
          ))}
        </div>

        {tab === 'simples' && (
          <div className="space-y-4">
            <p className="text-sm text-slate-500">Importe uma lista de nomes. Os dados completos podem ser preenchidos depois editando cada cliente.</p>
            <p className="text-sm text-slate-600 bg-slate-50 border border-slate-200 rounded p-2">
              Coluna obrigatória: <strong>Cliente</strong>
            </p>
            <button onClick={() => downloadTemplate('simples')} className="btn-secondary gap-2 w-full justify-center">
              <Download size={16} /> Baixar Template (.xlsx)
            </button>
            <UploadZone file={simplesFile} onPick={f => setSimplesFile(f)} inputRef={simplesRef} />
            {simplesError && <p className="text-sm text-red-600">{simplesError}</p>}
            {simplesSuccess && <p className="text-sm text-green-600">{simplesSuccess}</p>}
            <div className="flex justify-end gap-3">
              <button onClick={onClose} className="btn-secondary">Fechar</button>
              <button onClick={handleImportSimples} disabled={!simplesFile || simplesLoading} className="btn-primary">
                {simplesLoading ? 'Importando...' : 'Importar'}
              </button>
            </div>
          </div>
        )}

        {tab === 'completo' && (
          <div className="space-y-4">
            <p className="text-sm text-slate-500">Atualiza dados completos de clientes já cadastrados. O cliente deve existir pelo nome exato.</p>
            <div className="text-sm text-slate-600 bg-slate-50 border border-slate-200 rounded p-3 space-y-1">
              <p className="font-medium text-slate-800">Colunas obrigatórias:</p>
              <p>• <strong>Nome</strong>, <strong>CNPJ_CPF</strong>, <strong>Rua_Avenida</strong>, <strong>Numero</strong>, <strong>Bairro</strong>, <strong>Cidade</strong>, <strong>Estado</strong>, <strong>CEP</strong></p>
              <p>• <strong>Complemento</strong>: opcional</p>
              <p>• <strong>CNPJ_CPF</strong>: somente dígitos (11=CPF, 14=CNPJ)</p>
            </div>
            <button onClick={() => downloadTemplate('completo')} className="btn-secondary gap-2 w-full justify-center">
              <Download size={16} /> Baixar Template Completo (.xlsx)
            </button>
            <UploadZone file={completoFile} onPick={f => setCompletoFile(f)} inputRef={completoRef} />
            {completoError && <p className="text-sm text-red-600">{completoError}</p>}
            {completoSuccess && <p className="text-sm text-green-600">{completoSuccess}</p>}
            <div className="flex justify-end gap-3">
              <button onClick={onClose} className="btn-secondary">Fechar</button>
              <button onClick={handleImportCompleto} disabled={!completoFile || completoLoading} className="btn-primary">
                {completoLoading ? 'Atualizando...' : 'Atualizar em Lote'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Main Page ──────────────────────────────────────────────────────────────────
export default function ClientesPage() {
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [tiposChave, setTiposChave] = useState<TipoChave[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filtroStatus, setFiltroStatus] = useState<'todos' | 'completo' | 'incompleto'>('todos')
  const [editTarget, setEditTarget] = useState<Partial<Cliente> & { id?: number } | null>(null)
  const [showImport, setShowImport] = useState(false)

  const [novoNome, setNovoNome] = useState('')
  const [novoNomeSaving, setNovoNomeSaving] = useState(false)
  const [novoNomeMsg, setNovoNomeMsg] = useState<{ type: 'error' | 'success'; text: string } | null>(null)

  const [completarId, setCompletarId] = useState<string>('')

  const load = useCallback(async () => {
    setLoading(true)
    const [{ data: cli }, { data: tipos }] = await Promise.all([
      supabase.from('clientes').select('*').order('nome'),
      supabase.from('tipos_chave').select('*').order('id'),
    ])
    setClientes(cli ?? [])
    setTiposChave(tipos ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const filtered = useMemo(() => {
    let list = clientes
    if (search) {
      const q = search.toLowerCase()
      list = list.filter(c =>
        c.nome.toLowerCase().includes(q) ||
        (c.cnpj_cpf ?? '').includes(q) ||
        (c.cidade ?? '').toLowerCase().includes(q)
      )
    }
    if (filtroStatus === 'completo') list = list.filter(isCadastroCompleto)
    if (filtroStatus === 'incompleto') list = list.filter(c => !isCadastroCompleto(c))
    return list
  }, [clientes, search, filtroStatus])

  const totalCompleto = useMemo(() => clientes.filter(isCadastroCompleto).length, [clientes])
  const incompletos = useMemo(() => clientes.filter(c => !isCadastroCompleto(c)), [clientes])

  const tipoNome = (id: number | null) => tiposChave.find(t => t.id === id)?.tipo ?? '-'

  const handleCadastrarSimples = async (e: React.FormEvent) => {
    e.preventDefault()
    setNovoNomeMsg(null)
    if (!novoNome.trim()) { setNovoNomeMsg({ type: 'error', text: 'Digite o nome do cliente' }); return }
    setNovoNomeSaving(true)
    const { error } = await supabase.from('clientes').insert({ nome: novoNome.trim() })
    setNovoNomeSaving(false)
    if (error) { setNovoNomeMsg({ type: 'error', text: error.message }); return }
    setNovoNomeMsg({ type: 'success', text: `Cliente "${novoNome.trim()}" cadastrado com sucesso!` })
    setNovoNome(''); load()
    setTimeout(() => setNovoNomeMsg(null), 2000)
  }

  const handleCompletarCadastro = () => {
    if (!completarId) return
    const cliente = incompletos.find(c => c.id === parseInt(completarId))
    if (cliente) setEditTarget({ ...cliente })
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="page-title">Clientes</h1>
          <p className="page-subtitle">Cadastro de clientes do módulo de recebimentos</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={() => setEditTarget({ ...EMPTY_FORM })} className="btn-primary gap-1.5 text-sm">
            <Plus size={15} /> Novo Cliente
          </button>
          <button onClick={() => setShowImport(true)} className="btn-secondary gap-1.5 text-sm">
            <Upload size={15} /> Importar em Lote
          </button>
          <button onClick={load} className="btn-secondary p-2" title="Atualizar">
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Summary */}
      <div className="flex items-center gap-3 flex-wrap text-sm">
        <span className="text-slate-500">{clientes.length} cliente(s) total</span>
        <span className="flex items-center gap-1 text-green-700"><CheckCircle size={14} /> {totalCompleto} completo(s)</span>
        <span className="flex items-center gap-1 text-amber-600"><AlertCircle size={14} /> {incompletos.length} incompleto(s)</span>
      </div>

      {/* Cadastro Simplificado */}
      <div className="card">
        <h2 className="text-base font-semibold text-slate-800 mb-3">Cadastro Simplificado</h2>
        <form onSubmit={handleCadastrarSimples} className="flex gap-2">
          <input className="input flex-1" placeholder="Nome do cliente..."
            value={novoNome} onChange={e => { setNovoNome(e.target.value); setNovoNomeMsg(null) }} />
          <button type="submit" className="btn-primary whitespace-nowrap" disabled={novoNomeSaving}>
            {novoNomeSaving ? 'Cadastrando...' : 'Cadastrar'}
          </button>
        </form>
        {novoNomeMsg && (
          <p className={`text-sm mt-2 ${novoNomeMsg.type === 'error' ? 'text-red-600' : 'text-green-600'}`}>
            {novoNomeMsg.text}
          </p>
        )}
      </div>

      {/* Search + filter */}
      <div className="card">
        <div className="flex flex-wrap gap-3">
          <div className="flex items-center gap-2 flex-1 min-w-[200px]">
            <Search size={15} className="text-slate-400 shrink-0" />
            <input className="input flex-1" placeholder="Buscar por nome, CNPJ/CPF ou cidade..."
              value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <div className="flex rounded-lg border border-slate-200 overflow-hidden text-sm">
            {(['todos', 'completo', 'incompleto'] as const).map(s => (
              <button key={s} onClick={() => setFiltroStatus(s)}
                className={`px-3 py-2 transition-colors ${filtroStatus === s
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-slate-500 hover:bg-slate-50'}`}>
                {s === 'todos' ? 'Todos' : s === 'completo' ? 'Completos' : 'Incompletos'}
              </button>
            ))}
          </div>
        </div>
        <p className="text-xs text-slate-400 mt-3 pt-3 border-t border-slate-100">
          {loading ? 'Carregando...' : `${filtered.length} de ${clientes.length} cliente(s)`}
        </p>
      </div>

      {/* Table */}
      {loading ? (
        <div className="card text-center py-12 text-slate-400">Carregando...</div>
      ) : filtered.length === 0 ? (
        <div className="card text-center py-12 text-slate-400">Nenhum cliente encontrado.</div>
      ) : (
        <div className="card p-0 overflow-hidden">
          <div className="overflow-auto max-h-[480px]">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10">
                <tr className="table-header">
                  <th className="table-cell font-medium text-left">Nome</th>
                  <th className="table-cell font-medium text-left">CNPJ/CPF</th>
                  <th className="table-cell font-medium text-left">Cidade / UF</th>
                  <th className="table-cell font-medium text-left">Chave PIX</th>
                  <th className="table-cell font-medium text-center">Cadastro</th>
                  <th className="table-cell font-medium text-center w-16">Ações</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(c => {
                  const completo = isCadastroCompleto(c)
                  return (
                    <tr key={c.id} className="table-row">
                      <td className="table-cell font-medium text-slate-900">{c.nome}</td>
                      <td className="table-cell text-slate-500 font-mono text-xs">{c.cnpj_cpf || '-'}</td>
                      <td className="table-cell text-slate-500">
                        {[c.cidade, c.estado].filter(Boolean).join(' / ') || '-'}
                      </td>
                      <td className="table-cell text-xs">
                        {c.chave_pix ? (
                          <span>
                            <span className="text-slate-400 mr-1">[{tipoNome(c.tipo_chave)}]</span>
                            <span className="text-slate-700">{c.chave_pix}</span>
                          </span>
                        ) : '-'}
                      </td>
                      <td className="table-cell text-center">
                        {completo
                          ? <span className="inline-flex items-center gap-1 text-xs text-green-700 bg-green-50 px-2 py-0.5 rounded-full"><CheckCircle size={11} /> Completo</span>
                          : <span className="inline-flex items-center gap-1 text-xs text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full"><AlertCircle size={11} /> Incompleto</span>}
                      </td>
                      <td className="table-cell text-center">
                        <button onClick={() => setEditTarget({ ...c })}
                          className="p-1.5 rounded hover:bg-slate-100 text-slate-500" title="Editar">
                          <Pencil size={14} />
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Completar Cadastro */}
      {incompletos.length > 0 && (
        <div className="card space-y-3">
          <h2 className="text-base font-semibold text-slate-800">Completar Cadastro de Clientes</h2>
          <p className="text-sm text-slate-500">
            {incompletos.length} cliente(s) com dados incompletos. Selecione um para preencher as informações faltantes.
          </p>
          <div className="flex gap-2">
            <select className="input flex-1" value={completarId} onChange={e => setCompletarId(e.target.value)}>
              <option value="">Selecione o cliente para completar o cadastro...</option>
              {incompletos.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
            <button onClick={handleCompletarCadastro} disabled={!completarId} className="btn-primary whitespace-nowrap">
              Completar Cadastro
            </button>
          </div>
        </div>
      )}

      {/* Modais */}
      {editTarget && (
        <ClienteModal
          initial={editTarget}
          tiposChave={tiposChave}
          onClose={() => setEditTarget(null)}
          onSaved={() => { setEditTarget(null); load() }}
        />
      )}
      {showImport && (
        <ImportarModal
          onClose={() => setShowImport(false)}
          onSaved={load}
        />
      )}
    </div>
  )
}
