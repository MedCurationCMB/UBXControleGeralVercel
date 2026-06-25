'use client'

import { useState, useEffect } from 'react'
import { supabaseBrowser as supabase } from '@/lib/supabase/client'
import { CheckCircle, Plus } from 'lucide-react'

interface Empresa { id: string; empresa: string }
interface Categoria { id: string; empresa: string; categoria: string }

const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']
const ANO_ATUAL = new Date().getFullYear()
const ANOS = Array.from({ length: 5 }, (_, i) => ANO_ATUAL + i - 1)

const EMPTY = { empresa: '', categoria: '', mes: String(new Date().getMonth() + 1), ano: String(ANO_ATUAL), valor: '', observacao: '' }

export default function RegistrarOrcamentoPage() {
  const [form, setForm] = useState({ ...EMPTY })
  const [empresas, setEmpresas] = useState<Empresa[]>([])
  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')
  const [user, setUser] = useState<{ username: string } | null>(null)

  useEffect(() => {
    Promise.all([
      supabase.from('empresas').select('*').order('empresa'),
      fetch('/api/auth/me').then(r => r.json()),
    ]).then(([{ data: emps }, u]) => {
      setEmpresas(emps ?? [])
      setUser(u)
    })
  }, [])

  const onEmpresaChange = async (empresa: string) => {
    setForm(f => ({ ...f, empresa, categoria: '' }))
    if (!empresa) { setCategorias([]); return }
    const { data } = await supabase.from('categorias').select('*').eq('empresa', empresa).order('categoria')
    setCategorias(data ?? [])
  }

  const setField = (field: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    setForm(f => ({ ...f, [field]: e.target.value }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!form.empresa) { setError('Selecione a empresa'); return }
    if (!form.categoria) { setError('Selecione a categoria'); return }
    const valor = parseFloat(form.valor.replace(',', '.'))
    if (!valor || valor <= 0) { setError('Informe um valor válido'); return }

    setSaving(true)
    const { error: err } = await supabase.from('registro_orcamentos').insert({
      empresa: form.empresa,
      categoria: form.categoria,
      mes: Number(form.mes),
      ano: Number(form.ano),
      valor_orcamento: valor,
      usuario_criador: user?.username ?? 'sistema',
      observacao: form.observacao || null,
    })

    setSaving(false)
    if (err) { setError(err.message); return }

    setSuccess(true)
    setForm({ ...EMPTY })
    setTimeout(() => setSuccess(false), 5000)
  }

  const catsFiltradas = categorias.filter(c => c.empresa === form.empresa)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title">Registrar Orçamento</h1>
        <p className="page-subtitle">Registre orçamentos mensais por empresa e categoria</p>
      </div>

      {success && (
        <div className="flex items-center gap-3 p-4 bg-green-50 border border-green-200 rounded-lg text-green-800">
          <CheckCircle size={20} />
          <p className="text-sm font-medium">Orçamento registrado com sucesso!</p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="card space-y-5 max-w-2xl">
        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="grid grid-cols-2 gap-5">
          <div>
            <label className="label">Empresa *</label>
            <select className="input" value={form.empresa} onChange={e => onEmpresaChange(e.target.value)}>
              <option value="">Selecionar...</option>
              {empresas.map(e => <option key={e.id} value={e.empresa}>{e.empresa}</option>)}
            </select>
          </div>

          <div>
            <label className="label">Categoria *</label>
            <select className="input" value={form.categoria} onChange={setField('categoria')} disabled={!form.empresa}>
              <option value="">Selecionar...</option>
              {catsFiltradas.map(c => <option key={c.id} value={c.categoria}>{c.categoria}</option>)}
            </select>
          </div>

          <div>
            <label className="label">Mês *</label>
            <select className="input" value={form.mes} onChange={setField('mes')}>
              {MESES.map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
            </select>
          </div>

          <div>
            <label className="label">Ano *</label>
            <select className="input" value={form.ano} onChange={setField('ano')}>
              {ANOS.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>

          <div className="col-span-2">
            <label className="label">Valor do Orçamento (R$) *</label>
            <input className="input" placeholder="0,00" value={form.valor} onChange={setField('valor')}
              onBlur={e => {
                const v = parseFloat(e.target.value.replace(',', '.'))
                if (!isNaN(v)) setForm(f => ({ ...f, valor: v.toFixed(2).replace('.', ',') }))
              }} />
          </div>

          <div className="col-span-2">
            <label className="label">Observação</label>
            <textarea className="input min-h-[80px] resize-y" placeholder="Detalhes ou justificativa..."
              value={form.observacao} onChange={setField('observacao')} />
          </div>
        </div>

        <div className="flex justify-end">
          <button type="submit" className="btn-primary px-8" disabled={saving}>
            <Plus size={16} /> {saving ? 'Registrando...' : 'Registrar Orçamento'}
          </button>
        </div>
      </form>

      <div className="card max-w-2xl bg-blue-50 border-blue-200">
        <h3 className="text-sm font-semibold text-blue-800 mb-2">Como funciona</h3>
        <ul className="text-sm text-blue-700 space-y-1 list-disc list-inside">
          <li>O orçamento registrado atualiza automaticamente o controle de orçamento do mês/ano.</li>
          <li>Se já existir um orçamento para a mesma empresa/categoria/mês/ano, o valor será atualizado.</li>
          <li>O saldo é calculado como: Orçado − Total de pedidos solicitados.</li>
        </ul>
      </div>
    </div>
  )
}
