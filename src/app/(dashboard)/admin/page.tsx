'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { supabaseBrowser as supabase } from '@/lib/supabase/client'
import { Upload, RefreshCw, Check, X, Save, Eye, EyeOff } from 'lucide-react'

// ---- Types ----
interface Usuario {
  id: number; username: string; email: string
  status_cadastro: string; hierarquia: string
}
interface AssistenteConfig { id: number; chave: string; vigente: boolean; created_at: string }
interface SmtpConfig {
  id: number; smtp_user: string; smtp_pass: string; email_from: string
  smtp_host: string; smtp_port: string; vigente: boolean; created_at: string
}
interface EmailConfig {
  id: number; tipo: string; ativo: boolean
  segunda: boolean; terça: boolean; quarta: boolean; quinta: boolean; sexta: boolean
}

const fmtData = (d: string) => new Date(d).toLocaleDateString('pt-BR')

// ---- Tab: Logo ----
function LogoTab() {
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const handleFile = (f: File) => {
    if (f.size > 5 * 1024 * 1024) { setMsg({ type: 'error', text: 'Arquivo muito grande (limite 5MB)' }); return }
    if (!['image/png', 'image/jpeg', 'image/jpg'].includes(f.type)) {
      setMsg({ type: 'error', text: 'Formato inválido. Use PNG ou JPG' }); return
    }
    setFile(f)
    setMsg(null)
    const reader = new FileReader()
    reader.onload = e => setPreview(e.target?.result as string)
    reader.readAsDataURL(f)
  }

  const handleUpload = async () => {
    if (!file) return
    setSaving(true)
    setMsg(null)
    try {
      const reader = new FileReader()
      reader.onload = async e => {
        const base64 = (e.target?.result as string).split(',')[1]
        await supabase.from('config').delete().eq('chave', 'logo')
        await supabase.from('config').insert({ chave: 'logo', valor: base64 })
        setSaving(false)
        setFile(null)
        setPreview(null)
        if (fileRef.current) fileRef.current.value = ''
        setMsg({ type: 'success', text: 'Logo atualizada com sucesso!' })
      }
      reader.readAsDataURL(file)
    } catch {
      setSaving(false)
      setMsg({ type: 'error', text: 'Erro ao atualizar logo' })
    }
  }

  return (
    <div className="max-w-md space-y-4">
      <h2 className="text-base font-semibold text-slate-800">Gerenciar Logo</h2>
      <div
        className="border-2 border-dashed border-slate-300 rounded-lg p-8 text-center cursor-pointer hover:border-blue-400 transition-colors"
        onClick={() => fileRef.current?.click()}
      >
        {preview ? (
          <img src={preview} alt="Preview" className="max-h-32 mx-auto object-contain" />
        ) : (
          <div className="flex flex-col items-center gap-2 text-slate-400">
            <Upload size={24} />
            <p className="text-sm">Clique para selecionar PNG ou JPG (máx 5MB)</p>
          </div>
        )}
      </div>
      <input ref={fileRef} type="file" accept=".png,.jpg,.jpeg" className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }} />

      {msg && (
        <p className={`text-sm ${msg.type === 'success' ? 'text-green-700' : 'text-red-600'}`}>{msg.text}</p>
      )}

      {file && (
        <button onClick={handleUpload} disabled={saving} className="btn-primary gap-1.5">
          <Upload size={14} /> {saving ? 'Enviando...' : 'Confirmar Upload'}
        </button>
      )}
    </div>
  )
}

// ---- Tab: Usuários ----
function UsuariosTab() {
  const [usuarios, setUsuarios] = useState<Usuario[]>([])
  const [loading, setLoading] = useState(true)
  const [edits, setEdits] = useState<Record<number, Partial<Usuario>>>({})
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase.from('usuarios').select('*').order('id')
    setUsuarios(data ?? [])
    setEdits({})
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const pending = usuarios.filter(u => u.status_cadastro === 'Aguardando Autorização')

  const handleAprovar = async (id: number, status: 'Autorizado' | 'Não Autorizado') => {
    await supabase.from('usuarios').update({ status_cadastro: status }).eq('id', id)
    load()
  }

  const setEdit = (id: number, field: keyof Usuario, value: string) => {
    setEdits(prev => ({ ...prev, [id]: { ...prev[id], [field]: value } }))
  }

  const handleSalvar = async () => {
    const changed = Object.entries(edits).filter(([, v]) => Object.keys(v).length > 0)
    if (changed.length === 0) { setMsg({ type: 'error', text: 'Nenhuma alteração detectada.' }); return }
    setSaving(true)
    for (const [idStr, fields] of changed) {
      await supabase.from('usuarios').update(fields).eq('id', parseInt(idStr))
    }
    setSaving(false)
    setMsg({ type: 'success', text: 'Alterações salvas com sucesso!' })
    load()
  }

  if (loading) return <p className="text-slate-400 text-sm">Carregando...</p>

  return (
    <div className="space-y-6">
      {/* Pendentes */}
      <div>
        <h2 className="text-base font-semibold text-slate-800 mb-3">Solicitações de Cadastro</h2>
        {pending.length === 0 ? (
          <p className="text-sm text-slate-400">Nenhuma solicitação pendente.</p>
        ) : (
          <div className="space-y-2">
            {pending.map(u => (
              <div key={u.id} className="flex items-center justify-between p-3 border border-slate-200 rounded-lg bg-slate-50">
                <div>
                  <p className="text-sm font-medium text-slate-800">{u.username}</p>
                  <p className="text-xs text-slate-500">{u.email}</p>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => handleAprovar(u.id, 'Autorizado')}
                    className="inline-flex items-center gap-1 px-3 py-1.5 bg-green-50 border border-green-200 text-green-700 rounded-lg text-xs font-medium hover:bg-green-100">
                    <Check size={12} /> Autorizar
                  </button>
                  <button onClick={() => handleAprovar(u.id, 'Não Autorizado')}
                    className="inline-flex items-center gap-1 px-3 py-1.5 bg-red-50 border border-red-200 text-red-700 rounded-lg text-xs font-medium hover:bg-red-100">
                    <X size={12} /> Recusar
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Todos os usuários */}
      <div>
        <h2 className="text-base font-semibold text-slate-800 mb-3">Usuários Cadastrados</h2>
        <div className="overflow-x-auto border border-slate-200 rounded-lg">
          <table className="w-full text-sm">
            <thead>
              <tr className="table-header">
                <th className="table-cell font-medium text-left">Nome</th>
                <th className="table-cell font-medium text-left">Email</th>
                <th className="table-cell font-medium text-left">Status</th>
                <th className="table-cell font-medium text-left">Hierarquia</th>
              </tr>
            </thead>
            <tbody>
              {usuarios.map(u => {
                const e = edits[u.id] ?? {}
                return (
                  <tr key={u.id} className="table-row">
                    <td className="table-cell">
                      <input
                        className="input py-1 text-sm"
                        value={e.username ?? u.username}
                        onChange={ev => setEdit(u.id, 'username', ev.target.value)}
                      />
                    </td>
                    <td className="table-cell text-slate-500">{u.email}</td>
                    <td className="table-cell">
                      <select className="input py-1 text-sm"
                        value={e.status_cadastro ?? u.status_cadastro}
                        onChange={ev => setEdit(u.id, 'status_cadastro', ev.target.value)}>
                        <option>Aguardando Autorização</option>
                        <option>Autorizado</option>
                        <option>Não Autorizado</option>
                      </select>
                    </td>
                    <td className="table-cell">
                      <select className="input py-1 text-sm"
                        value={e.hierarquia ?? u.hierarquia}
                        onChange={ev => setEdit(u.id, 'hierarquia', ev.target.value)}>
                        <option value="user">user</option>
                        <option value="admin">admin</option>
                        <option value="owner">owner</option>
                      </select>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {msg && (
          <p className={`text-sm mt-2 ${msg.type === 'success' ? 'text-green-700' : 'text-slate-500'}`}>{msg.text}</p>
        )}

        <div className="flex gap-2 mt-3">
          <button onClick={handleSalvar} disabled={saving} className="btn-primary gap-1.5 text-sm">
            <Save size={14} /> {saving ? 'Salvando...' : 'Salvar alterações'}
          </button>
          <button onClick={load} className="btn-secondary text-sm gap-1.5">
            <RefreshCw size={14} /> Descartar
          </button>
        </div>
      </div>
    </div>
  )
}

// ---- Tab: Assistente Virtual ----
function AssistenteTab() {
  const [configs, setConfigs] = useState<AssistenteConfig[]>([])
  const [loading, setLoading] = useState(true)
  const [novaChave, setNovaChave] = useState('')
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase.from('assistente_virtual').select('*').order('created_at', { ascending: false })
    setConfigs(data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const handleSalvar = async () => {
    if (!novaChave.trim()) { setMsg({ type: 'error', text: 'A chave não pode estar vazia.' }); return }
    setSaving(true)
    setMsg(null)
    await supabase.from('assistente_virtual').update({ vigente: false }).eq('vigente', true)
    await supabase.from('assistente_virtual').insert({ chave: novaChave.trim(), vigente: true })
    setNovaChave('')
    setSaving(false)
    setMsg({ type: 'success', text: 'Chave salva com sucesso!' })
    load()
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {/* Formulário */}
      <div className="space-y-3">
        <h2 className="text-base font-semibold text-slate-800">Configuração do Assistente Virtual</h2>
        <div>
          <label className="label">Chave da API Gemini</label>
          <input type="password" className="input" placeholder="Cole a nova chave aqui..."
            value={novaChave} onChange={e => setNovaChave(e.target.value)} />
        </div>
        {msg && (
          <p className={`text-sm ${msg.type === 'success' ? 'text-green-700' : 'text-red-600'}`}>{msg.text}</p>
        )}
        <button onClick={handleSalvar} disabled={saving} className="btn-primary gap-1.5 text-sm">
          <Save size={14} /> {saving ? 'Salvando...' : 'Salvar Chave'}
        </button>
      </div>

      {/* Histórico */}
      <div>
        <h2 className="text-base font-semibold text-slate-800 mb-3">Chaves Cadastradas</h2>
        {loading ? <p className="text-slate-400 text-sm">Carregando...</p> : configs.length === 0 ? (
          <p className="text-sm text-slate-400">Nenhuma chave cadastrada.</p>
        ) : (
          <div className="overflow-x-auto border border-slate-200 rounded-lg">
            <table className="w-full text-sm">
              <thead>
                <tr className="table-header">
                  <th className="table-cell font-medium text-left">Chave</th>
                  <th className="table-cell font-medium text-left">Data</th>
                  <th className="table-cell font-medium text-center">Vigente</th>
                </tr>
              </thead>
              <tbody>
                {configs.map(c => (
                  <tr key={c.id} className="table-row">
                    <td className="table-cell font-mono text-slate-500 tracking-wider">
                      {'•'.repeat(Math.min(c.chave.length, 24))}
                    </td>
                    <td className="table-cell text-slate-500">{fmtData(c.created_at)}</td>
                    <td className="table-cell text-center">
                      {c.vigente
                        ? <span className="badge bg-green-100 text-green-700">Sim</span>
                        : <span className="badge bg-slate-100 text-slate-500">Não</span>
                      }
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

// ---- Tab: E-mails + SMTP ----
function EmailsTab() {
  // Email config
  const [emailConfigs, setEmailConfigs] = useState<EmailConfig[]>([])
  const [emailEdits, setEmailEdits] = useState<Record<number, Partial<EmailConfig>>>({})
  const [emailLoading, setEmailLoading] = useState(true)
  const [emailSaving, setEmailSaving] = useState(false)
  const [emailMsg, setEmailMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // SMTP
  const [smtpConfigs, setSmtpConfigs] = useState<SmtpConfig[]>([])
  const [smtpLoading, setSmtpLoading] = useState(true)
  const [smtpSaving, setSmtpSaving] = useState(false)
  const [smtpMsg, setSmtpMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [showSmtpPass, setShowSmtpPass] = useState(false)
  const [smtpForm, setSmtpForm] = useState({
    smtp_user: '', smtp_pass: '', email_from: '', smtp_host: '', smtp_port: ''
  })

  const loadEmails = useCallback(async () => {
    setEmailLoading(true)
    const { data } = await supabase.from('email_config').select('*').order('id')
    setEmailConfigs(data ?? [])
    setEmailEdits({})
    setEmailLoading(false)
  }, [])

  const loadSmtp = useCallback(async () => {
    setSmtpLoading(true)
    const { data } = await supabase.from('smtp_config').select('*').order('created_at', { ascending: false })
    setSmtpConfigs(data ?? [])
    setSmtpLoading(false)
  }, [])

  useEffect(() => { loadEmails(); loadSmtp() }, [loadEmails, loadSmtp])

  const setEmailEdit = (id: number, field: keyof EmailConfig, value: boolean) => {
    setEmailEdits(prev => ({ ...prev, [id]: { ...prev[id], [field]: value } }))
  }

  const handleSalvarEmails = async () => {
    const changed = Object.entries(emailEdits).filter(([, v]) => Object.keys(v).length > 0)
    if (changed.length === 0) { setEmailMsg({ type: 'error', text: 'Nenhuma alteração detectada.' }); return }
    setEmailSaving(true)
    for (const [idStr, fields] of changed) {
      await supabase.from('email_config').update(fields).eq('id', parseInt(idStr))
    }
    setEmailSaving(false)
    setEmailMsg({ type: 'success', text: 'Configurações de e-mail atualizadas!' })
    loadEmails()
  }

  const handleSalvarSmtp = async () => {
    const { smtp_user, smtp_pass, email_from, smtp_host, smtp_port } = smtpForm
    if (!smtp_user || !smtp_pass || !email_from || !smtp_host || !smtp_port) {
      setSmtpMsg({ type: 'error', text: 'Todos os campos são obrigatórios.' }); return
    }
    setSmtpSaving(true)
    setSmtpMsg(null)
    await supabase.from('smtp_config').update({ vigente: false }).eq('vigente', true)
    await supabase.from('smtp_config').insert({ ...smtpForm, vigente: true })
    setSmtpForm({ smtp_user: '', smtp_pass: '', email_from: '', smtp_host: '', smtp_port: '' })
    setSmtpSaving(false)
    setSmtpMsg({ type: 'success', text: 'Configuração SMTP salva com sucesso!' })
    loadSmtp()
  }

  const DIAS = [
    { field: 'segunda' as const, label: 'Seg' },
    { field: 'terça' as const, label: 'Ter' },
    { field: 'quarta' as const, label: 'Qua' },
    { field: 'quinta' as const, label: 'Qui' },
    { field: 'sexta' as const, label: 'Sex' },
  ]

  return (
    <div className="space-y-8">
      {/* Email config table */}
      <div>
        <h2 className="text-base font-semibold text-slate-800 mb-3">Gestão de E-mails</h2>
        {emailLoading ? <p className="text-slate-400 text-sm">Carregando...</p> : emailConfigs.length === 0 ? (
          <p className="text-sm text-slate-400">Nenhuma configuração de e-mail encontrada.</p>
        ) : (
          <>
            <div className="overflow-x-auto border border-slate-200 rounded-lg">
              <table className="w-full text-sm">
                <thead>
                  <tr className="table-header">
                    <th className="table-cell font-medium text-left">Tipo</th>
                    <th className="table-cell font-medium text-center">Ativo</th>
                    {DIAS.map(d => (
                      <th key={d.field} className="table-cell font-medium text-center">{d.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {emailConfigs.map(c => {
                    const e = emailEdits[c.id] ?? {}
                    return (
                      <tr key={c.id} className="table-row">
                        <td className="table-cell font-medium text-slate-700">{c.tipo}</td>
                        <td className="table-cell text-center">
                          <input type="checkbox"
                            checked={e.ativo ?? c.ativo}
                            onChange={ev => setEmailEdit(c.id, 'ativo', ev.target.checked)}
                            className="w-4 h-4" />
                        </td>
                        {DIAS.map(d => (
                          <td key={d.field} className="table-cell text-center">
                            <input type="checkbox"
                              checked={e[d.field] ?? c[d.field]}
                              onChange={ev => setEmailEdit(c.id, d.field, ev.target.checked)}
                              className="w-4 h-4" />
                          </td>
                        ))}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            {emailMsg && (
              <p className={`text-sm mt-2 ${emailMsg.type === 'success' ? 'text-green-700' : 'text-slate-500'}`}>
                {emailMsg.text}
              </p>
            )}
            <button onClick={handleSalvarEmails} disabled={emailSaving} className="btn-primary gap-1.5 text-sm mt-3">
              <Save size={14} /> {emailSaving ? 'Salvando...' : 'Salvar alterações'}
            </button>
          </>
        )}
      </div>

      <hr className="border-slate-200" />

      {/* SMTP */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Formulário SMTP */}
        <div className="space-y-3">
          <h2 className="text-base font-semibold text-slate-800">Configuração SMTP</h2>
          {(['smtp_user', 'email_from', 'smtp_host', 'smtp_port'] as const).map(field => (
            <div key={field}>
              <label className="label capitalize">{field.replace('_', ' ')}</label>
              <input className="input" value={smtpForm[field]}
                onChange={e => setSmtpForm(f => ({ ...f, [field]: e.target.value }))} />
            </div>
          ))}
          <div>
            <label className="label">Senha SMTP</label>
            <div className="relative">
              <input
                type={showSmtpPass ? 'text' : 'password'}
                className="input pr-10"
                value={smtpForm.smtp_pass}
                onChange={e => setSmtpForm(f => ({ ...f, smtp_pass: e.target.value }))}
              />
              <button type="button" onClick={() => setShowSmtpPass(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                {showSmtpPass ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </div>
          {smtpMsg && (
            <p className={`text-sm ${smtpMsg.type === 'success' ? 'text-green-700' : 'text-red-600'}`}>
              {smtpMsg.text}
            </p>
          )}
          <button onClick={handleSalvarSmtp} disabled={smtpSaving} className="btn-primary gap-1.5 text-sm">
            <Save size={14} /> {smtpSaving ? 'Salvando...' : 'Salvar Configuração SMTP'}
          </button>
        </div>

        {/* Histórico SMTP */}
        <div>
          <h2 className="text-base font-semibold text-slate-800 mb-3">Configurações Cadastradas</h2>
          {smtpLoading ? <p className="text-slate-400 text-sm">Carregando...</p> : smtpConfigs.length === 0 ? (
            <p className="text-sm text-slate-400">Nenhuma configuração SMTP cadastrada.</p>
          ) : (
            <div className="overflow-x-auto border border-slate-200 rounded-lg">
              <table className="w-full text-sm">
                <thead>
                  <tr className="table-header">
                    <th className="table-cell font-medium text-left">Usuário</th>
                    <th className="table-cell font-medium text-left">Host</th>
                    <th className="table-cell font-medium text-left">Porta</th>
                    <th className="table-cell font-medium text-center">Vigente</th>
                  </tr>
                </thead>
                <tbody>
                  {smtpConfigs.map(c => (
                    <tr key={c.id} className="table-row">
                      <td className="table-cell text-slate-700">{c.smtp_user}</td>
                      <td className="table-cell text-slate-500">{c.smtp_host}</td>
                      <td className="table-cell text-slate-500">{c.smtp_port}</td>
                      <td className="table-cell text-center">
                        {c.vigente
                          ? <span className="badge bg-green-100 text-green-700">Sim</span>
                          : <span className="badge bg-slate-100 text-slate-500">Não</span>
                        }
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ---- Main Page ----
const TABS = ['Gerenciar Logo', 'Gestão de Usuários', 'Assistente Virtual', 'Gestão de E-mails'] as const
type Tab = typeof TABS[number]

export default function AdminPage() {
  const [tab, setTab] = useState<Tab>('Gerenciar Logo')
  const [user, setUser] = useState<{ hierarquia: string } | null>(null)
  const [authLoading, setAuthLoading] = useState(true)

  useEffect(() => {
    fetch('/api/auth/me').then(r => r.json()).then(u => {
      setUser(u)
      setAuthLoading(false)
    })
  }, [])

  if (authLoading) {
    return <div className="card text-center py-16 text-slate-400">Verificando acesso...</div>
  }

  if (!user || user.hierarquia !== 'owner') {
    return (
      <div className="card text-center py-16">
        <p className="text-lg font-semibold text-red-600 mb-2">Acesso Restrito</p>
        <p className="text-slate-500 text-sm">Esta página é exclusiva para administradores com nível <strong>owner</strong>.</p>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="page-title">Painel Administrativo</h1>
        <p className="page-subtitle">Configurações do sistema</p>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200 overflow-x-auto">
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
              tab === t
                ? 'border-primary-500 text-primary-600'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}>
            {t}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="card">
        {tab === 'Gerenciar Logo' && <LogoTab />}
        {tab === 'Gestão de Usuários' && <UsuariosTab />}
        {tab === 'Assistente Virtual' && <AssistenteTab />}
        {tab === 'Gestão de E-mails' && <EmailsTab />}
      </div>
    </div>
  )
}
