'use client'

import { useState, useEffect, useCallback } from 'react'
import { supabaseBrowser as supabase } from '@/lib/supabase/client'
import { RefreshCw, Building2 } from 'lucide-react'

interface Empresa { id: number; empresa: string }

export default function EmpresasPage() {
  const [empresas, setEmpresas] = useState<Empresa[]>([])
  const [loading, setLoading] = useState(true)
  const [nome, setNome] = useState('')
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase.from('empresas').select('id, empresa').order('empresa')
    setEmpresas(data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const handleCadastrar = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!nome.trim()) { setMsg({ type: 'error', text: 'Digite o nome da Empresa ou Centro de Custo.' }); return }
    setSaving(true)
    setMsg(null)
    const { error } = await supabase.from('empresas').insert({ empresa: nome.trim() })
    setSaving(false)
    if (error) {
      setMsg({ type: 'error', text: `Erro ao cadastrar: ${error.message}` })
    } else {
      setMsg({ type: 'success', text: `Empresa "${nome.trim()}" cadastrada com sucesso!` })
      setNome('')
      load()
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">Empresas / Centros de Custo</h1>
          <p className="page-subtitle">Cadastro de empresas e centros de custo</p>
        </div>
        <button onClick={load} className="btn-secondary p-2" title="Atualizar">
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Lista */}
      <div className="card p-0 overflow-hidden">
        {loading ? (
          <div className="py-12 text-center text-slate-400 text-sm">Carregando...</div>
        ) : empresas.length === 0 ? (
          <div className="py-12 text-center text-slate-400">
            <Building2 size={32} className="mx-auto mb-2 text-slate-300" />
            <p className="text-sm">Nenhuma empresa cadastrada.</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="table-header">
                <th className="table-cell font-medium text-left">Empresa / Centro de Custo</th>
              </tr>
            </thead>
            <tbody>
              {empresas.map(e => (
                <tr key={e.id} className="table-row">
                  <td className="table-cell font-medium text-slate-800">{e.empresa}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Formulário */}
      <div className="card max-w-lg">
        <h2 className="text-sm font-semibold text-slate-700 mb-4">Novo Cadastro</h2>
        <form onSubmit={handleCadastrar} className="space-y-3">
          <div>
            <label className="label">Nome da Empresa ou Centro de Custo</label>
            <input
              className="input"
              placeholder="Ex: CMB Capital, TI, Financeiro..."
              value={nome}
              onChange={e => setNome(e.target.value)}
            />
          </div>
          {msg && (
            <p className={`text-sm ${msg.type === 'success' ? 'text-green-700' : 'text-red-600'}`}>
              {msg.text}
            </p>
          )}
          <button type="submit" disabled={saving} className="btn-primary text-sm">
            {saving ? 'Cadastrando...' : 'Cadastrar'}
          </button>
        </form>
      </div>
    </div>
  )
}
