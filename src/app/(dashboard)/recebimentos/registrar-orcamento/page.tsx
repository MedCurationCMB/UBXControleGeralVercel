'use client'

import { useState, useEffect, useRef } from 'react'
import { supabaseBrowser as supabase } from '@/lib/supabase/client'
import { CheckCircle, Plus, Download, Upload, FileSpreadsheet, X } from 'lucide-react'

interface Empresa { id: string; empresa: string }
interface Categoria { id: string; empresa: string; categoria: string }

const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']
const ANO_ATUAL = new Date().getFullYear()
const ANOS = Array.from({ length: 26 }, (_, i) => 2025 + i)

const EMPTY = { empresa: '', categoria: '', mes: String(new Date().getMonth() + 1), ano: String(ANO_ATUAL), valor: '', observacao: '' }

// ---- Import Modal ----
function ImportarModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [file, setFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const ref = useRef<HTMLInputElement>(null)

  const downloadTemplate = async () => {
    const res = await fetch('/api/orcamentos-receita/template')
    if (!res.ok) return
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = 'template_orcamentos_receita.xlsx'; a.click()
    URL.revokeObjectURL(url)
  }

  const handleImport = async () => {
    if (!file) return
    setLoading(true); setError(''); setSuccess('')
    const fd = new FormData(); fd.append('file', file)
    const res = await fetch('/api/orcamentos-receita/importar-lote', { method: 'POST', body: fd })
    const data = await res.json()
    setLoading(false)
    if (!res.ok) { setError(data.error ?? 'Erro ao importar'); return }
    setSuccess(`${data.count} orçamento(s) importados com sucesso!`)
    setFile(null)
    if (ref.current) ref.current.value = ''
    onSaved()
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-lg w-full p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">Importação em Lote de Orçamentos</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
        </div>

        <div className="text-sm text-slate-600 bg-slate-50 border border-slate-200 rounded p-3 space-y-1">
          <p className="font-medium text-slate-800">Colunas obrigatórias:</p>
          <p>• <strong>Empresa</strong>, <strong>Categoria</strong>, <strong>Mês</strong> (1–12), <strong>Ano</strong>, <strong>Valor do Orçamento</strong></p>
          <p>• <strong>Observação</strong>: opcional</p>
        </div>

        <button onClick={downloadTemplate} className="btn-secondary gap-2 w-full justify-center">
          <Download size={16} /> Baixar Template (.xlsx)
        </button>

        <div
          className="border-2 border-dashed border-slate-300 rounded-lg p-6 text-center cursor-pointer hover:border-blue-400 transition-colors"
          onClick={() => ref.current?.click()}
        >
          {file ? (
            <div className="flex items-center justify-center gap-2">
              <FileSpreadsheet size={18} className="text-green-600" />
              <span className="text-sm text-slate-700">{file.name}</span>
              <button type="button" onClick={e => { e.stopPropagation(); setFile(null) }}
                className="text-slate-400 hover:text-red-500"><X size={14} /></button>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2 text-slate-400">
              <Upload size={22} />
              <span className="text-sm">Selecione o arquivo Excel (.xlsx)</span>
            </div>
          )}
        </div>
        <input type="file" ref={ref} className="hidden" accept=".xlsx"
          onChange={e => setFile(e.target.files?.[0] ?? null)} />

        {error && <p className="text-sm text-red-600">{error}</p>}
        {success && <p className="text-sm text-green-600">{success}</p>}

        <div className="flex justify-end gap-3">
          <button onClick={onClose} className="btn-secondary">Fechar</button>
          <button onClick={handleImport} disabled={!file || loading} className="btn-primary">
            {loading ? 'Importando...' : 'Confirmar Importação'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ---- Main Page ----
export default function RegistrarOrcamentoReceitaPage() {
  const [form, setForm] = useState({ ...EMPTY })
  const [empresas, setEmpresas] = useState<Empresa[]>([])
  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')
  const [warning, setWarning] = useState('')
  const [user, setUser] = useState<{ username: string } | null>(null)
  const [showImport, setShowImport] = useState(false)

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
    const { data } = await supabase.from('categorias_receita').select('*').eq('empresa', empresa).order('categoria')
    setCategorias(data ?? [])
  }

  const setField = (field: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    setForm(f => ({ ...f, [field]: e.target.value }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(''); setWarning('')

    if (!form.empresa) { setError('Selecione a empresa'); return }
    if (!form.categoria) { setError('Selecione a categoria'); return }
    const valor = parseFloat(form.valor.replace(',', '.'))
    if (!valor || valor <= 0) { setError('Informe um valor válido'); return }

    setSaving(true)

    // Verificar pedidos existentes no período
    const { data: pedidos } = await supabase
      .from('pedidos_solicitados_fluxo_receita')
      .select('valor_referente')
      .eq('empresa', form.empresa)
      .eq('categoria', form.categoria)
      .eq('mes', Number(form.mes))
      .eq('ano', Number(form.ano))

    if (pedidos && pedidos.length > 0) {
      const somaPedidos = pedidos.reduce((s, p) => s + (p.valor_referente ?? 0), 0)
      if (valor <= somaPedidos) {
        setSaving(false)
        setWarning(`Já existem pedidos nesse período. Informe um valor maior que R$ ${somaPedidos.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}.`)
        return
      }
    }

    const { error: err } = await supabase.from('registro_orcamentos_receita').insert({
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
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="page-title">Registrar Orçamento de Venda</h1>
          <p className="page-subtitle">Registre metas mensais de receita por empresa e categoria</p>
        </div>
        <button onClick={() => setShowImport(true)} className="btn-secondary gap-1.5 text-sm">
          <Upload size={15} /> Importar em Lote
        </button>
      </div>

      <div className="card max-w-2xl bg-amber-50 border-amber-200 text-sm text-amber-800">
        Orçamentos não podem ser editados ou excluídos. Para corrigir um valor, registre um novo orçamento para o mesmo período — o último registrado será o considerado para controle de saldos.
      </div>

      {success && (
        <div className="flex items-center gap-3 p-4 bg-green-50 border border-green-200 rounded-lg text-green-800">
          <CheckCircle size={20} />
          <p className="text-sm font-medium">Orçamento registrado com sucesso!</p>
        </div>
      )}

      {warning && (
        <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg text-yellow-800 text-sm">
          {warning}
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
          <li>O orçamento registrado define a meta de recebimento para o período.</li>
          <li>Se já existir um orçamento para a mesma empresa/categoria/mês/ano, o novo valor passa a ser considerado.</li>
          <li>O saldo é calculado como: Orçado − Total de pedidos de recebimento solicitados.</li>
        </ul>
      </div>

      {showImport && (
        <ImportarModal onClose={() => setShowImport(false)} onSaved={() => setShowImport(false)} />
      )}
    </div>
  )
}
