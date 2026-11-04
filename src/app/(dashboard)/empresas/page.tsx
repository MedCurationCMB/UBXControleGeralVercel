'use client'

import { useState, useEffect, useCallback } from 'react'
import { supabaseBrowser as supabase } from '@/lib/supabase/client'
import { useSession } from '@/hooks/useSession'
import Modal from '@/components/ui/Modal'
import { RefreshCw, Building2, Pencil } from 'lucide-react'

interface Centro { id: string; empresa: string }
type Msg = { type: 'success' | 'error'; text: string }

const resumoCopia = (r: { pagamentos: number; recebimentos: number }) =>
  `${r.pagamentos} categoria(s) de pagamentos e ${r.recebimentos} de recebimentos copiadas.`

function CopiarDe({ centros, excluir, value, onChange }: { centros: Centro[]; excluir?: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="label">Copiar categorias de (opcional)</label>
      <select className="input" value={value} onChange={e => onChange(e.target.value)}>
        <option value="">Não copiar</option>
        {centros.filter(c => c.id !== excluir).map(c => <option key={c.id} value={c.id}>{c.empresa}</option>)}
      </select>
      <p className="text-xs text-slate-400 mt-1">Copia as categorias de pagamentos e de recebimentos. As que já existem são mantidas; nada é removido.</p>
    </div>
  )
}

export default function CentrosResultadoPage() {
  const { session } = useSession()
  const isAdmin = session?.hierarquia === 'admin' || session?.hierarquia === 'owner'
  const [centros, setCentros] = useState<Centro[]>([])
  const [loading, setLoading] = useState(true)
  const [nome, setNome] = useState('')
  const [copiarDe, setCopiarDe] = useState('')
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<Msg | null>(null)
  const [edit, setEdit] = useState<Centro | null>(null)
  const [editNome, setEditNome] = useState('')
  const [editCopiar, setEditCopiar] = useState('')
  const [editErro, setEditErro] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase.from('empresas').select('id, empresa').order('empresa')
    setCentros(data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const copiar = async (origem: string, destino: string) => {
    const { data, error } = await supabase.rpc('empresa_copiar_categorias', { p_origem: origem, p_destino: destino })
    return { erro: error?.message, texto: error ? '' : resumoCopia(data) }
  }

  const handleCadastrar = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!nome.trim()) { setMsg({ type: 'error', text: 'Digite o nome do Centro de Resultado.' }); return }
    setSaving(true)
    setMsg(null)
    const { data, error } = await supabase.from('empresas').insert({ empresa: nome.trim() }).select('id').single()
    if (error) {
      setSaving(false)
      setMsg({ type: 'error', text: `Erro ao cadastrar: ${error.message}` })
      return
    }
    let extra = ''
    if (copiarDe) {
      const c = await copiar(copiarDe, data.id)
      extra = c.erro ? ` Mas a cópia das categorias falhou: ${c.erro}` : ` ${c.texto}`
    }
    setSaving(false)
    setMsg({ type: 'success', text: `Centro de Resultado "${nome.trim()}" cadastrado com sucesso!${extra}` })
    setNome(''); setCopiarDe('')
    load()
  }

  const abrirEdicao = (c: Centro) => { setEdit(c); setEditNome(c.empresa); setEditCopiar(''); setEditErro('') }

  const handleSalvarEdicao = async () => {
    if (!edit) return
    setSaving(true); setEditErro('')
    if (editNome.trim() !== edit.empresa) {
      const { error } = await supabase.rpc('empresa_renomear', { p_id: edit.id, p_novo: editNome })
      if (error) { setSaving(false); setEditErro(error.message); return }
    }
    if (editCopiar) {
      const c = await copiar(editCopiar, edit.id)
      if (c.erro) { setSaving(false); setEditErro(`Nome salvo, mas a cópia das categorias falhou: ${c.erro}`); load(); return }
      setMsg({ type: 'success', text: `"${editNome.trim()}": ${c.texto}` })
    }
    setSaving(false); setEdit(null)
    load()
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">Centros de Resultado</h1>
          <p className="page-subtitle">Cadastro de centros de resultado</p>
        </div>
        <button onClick={load} className="btn-secondary p-2" title="Atualizar">
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Lista */}
      <div className="card p-0 overflow-hidden">
        {loading ? (
          <div className="py-12 text-center text-slate-400 text-sm">Carregando...</div>
        ) : centros.length === 0 ? (
          <div className="py-12 text-center text-slate-400">
            <Building2 size={32} className="mx-auto mb-2 text-slate-300" />
            <p className="text-sm">Nenhum centro de resultado cadastrado.</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="table-header">
                <th className="table-cell font-medium text-left">Centro de Resultado</th>
                {isAdmin && <th className="table-cell font-medium text-center w-20">Ações</th>}
              </tr>
            </thead>
            <tbody>
              {centros.map(c => (
                <tr key={c.id} className="table-row">
                  <td className="table-cell font-medium text-slate-800">{c.empresa}</td>
                  {isAdmin && (
                    <td className="table-cell text-center">
                      <button onClick={() => abrirEdicao(c)} className="p-1.5 rounded hover:bg-slate-100 text-slate-500" title="Editar">
                        <Pencil size={15} />
                      </button>
                    </td>
                  )}
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
            <label className="label">Nome do Centro de Resultado</label>
            <input
              className="input"
              placeholder="Ex: CMB Capital, TI, Financeiro..."
              value={nome}
              onChange={e => setNome(e.target.value)}
            />
          </div>
          <CopiarDe centros={centros} value={copiarDe} onChange={setCopiarDe} />
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

      <Modal open={!!edit} onClose={() => setEdit(null)} title="Editar Centro de Resultado">
        <div className="space-y-3">
          <div>
            <label className="label">Nome do Centro de Resultado</label>
            <input className="input" value={editNome} onChange={e => setEditNome(e.target.value)} />
            <p className="text-xs text-slate-400 mt-1">O novo nome vale também para pedidos, orçamentos e categorias já existentes.</p>
          </div>
          <CopiarDe centros={centros} excluir={edit?.id} value={editCopiar} onChange={setEditCopiar} />
          {editErro && <p className="text-sm text-red-600">{editErro}</p>}
          <div className="flex justify-end gap-2">
            <button onClick={() => setEdit(null)} className="btn-secondary text-sm">Cancelar</button>
            <button onClick={handleSalvarEdicao} disabled={saving || !editNome.trim()} className="btn-primary text-sm">
              {saving ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
