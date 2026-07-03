'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { supabaseBrowser as supabase } from '@/lib/supabase/client'
import { RefreshCw, Plus, Pencil, X, Trash2, Download, Upload, FileSpreadsheet } from 'lucide-react'

// ---- Types ----
interface RecebimentoStatus { id: number; nome_status: string }
interface TipoRecebimento { id: number; tipos: string }
interface Controle {
  id: number; pedido_id: number | null
  data_vencimento: string | null; valor_pagar: number | null
  data_pagamento: string | null; valor_pagamento: number | null
  status_recebimento: number | null; tipo_recebimento: number | null
}
interface Pedido {
  id: number; empresa: string; categoria: string; cliente: string
  valor_pedido: number; status: string; observacao: string | null
}
interface Row extends Controle {
  empresa: string; categoria: string; cliente: string
  status_pedido: string; observacao: string | null; situacao: string
}

// ---- Helpers ----
const fmtMoeda = (v: number | null | undefined) =>
  v != null ? v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '-'
const fmtData = (d: string | null | undefined) =>
  d ? new Date(d + 'T12:00:00').toLocaleDateString('pt-BR') : '-'

function getSituacao(c: Controle): string {
  if (c.valor_pagamento != null && c.valor_pagar != null && c.valor_pagamento >= c.valor_pagar) return 'Quitado'
  if (!c.data_vencimento) return 'Sem vencimento'
  const venc = new Date(c.data_vencimento + 'T12:00:00')
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0)
  return venc < hoje ? 'Atrasado' : 'Em dia'
}

const SITUACAO_BADGE: Record<string, string> = {
  'Quitado': 'bg-green-100 text-green-700',
  'Atrasado': 'bg-red-100 text-red-700',
  'Em dia': 'bg-blue-100 text-blue-700',
  'Sem vencimento': 'bg-slate-100 text-slate-500',
}

// ---- Edit Modal ----
function EditModal({
  row, statuses, tipos, onClose, onSaved
}: {
  row: Row; statuses: RecebimentoStatus[]; tipos: TipoRecebimento[]
  onClose: () => void; onSaved: () => void
}) {
  const [form, setForm] = useState({
    data_vencimento: row.data_vencimento ?? '',
    valor_pagar: row.valor_pagar != null ? String(row.valor_pagar) : '',
    data_pagamento: row.data_pagamento ?? '',
    valor_pagamento: row.valor_pagamento != null ? String(row.valor_pagamento) : '',
    status_recebimento: row.status_recebimento != null ? String(row.status_recebimento) : '',
    tipo_recebimento: row.tipo_recebimento != null ? String(row.tipo_recebimento) : '',
  })
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const handleSave = async () => {
    setSaving(true)
    await supabase.from('controle_recebimento').update({
      data_vencimento: form.data_vencimento || null,
      valor_pagar: form.valor_pagar ? parseFloat(form.valor_pagar) : null,
      data_pagamento: form.data_pagamento || null,
      valor_pagamento: form.valor_pagamento ? parseFloat(form.valor_pagamento) : null,
      status_recebimento: form.status_recebimento ? Number(form.status_recebimento) : null,
      tipo_recebimento: form.tipo_recebimento ? Number(form.tipo_recebimento) : null,
    }).eq('id', row.id)
    setSaving(false)
    onSaved()
  }

  const handleDelete = async () => {
    setDeleting(true)
    await supabase.from('controle_recebimento').delete().eq('id', row.id)
    setDeleting(false)
    onSaved()
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-lg w-full p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">
            Editar Recebimento #{row.id} — Pedido #{row.pedido_id}
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
        </div>

        <div className="text-sm text-slate-500">
          {row.empresa} · {row.cliente}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Status Recebimento</label>
            <select className="input" value={form.status_recebimento}
              onChange={e => setForm(f => ({ ...f, status_recebimento: e.target.value }))}>
              <option value="">-- Selecionar --</option>
              {statuses.map(s => <option key={s.id} value={s.id}>{s.nome_status}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Tipo de Recebimento</label>
            <select className="input" value={form.tipo_recebimento}
              onChange={e => setForm(f => ({ ...f, tipo_recebimento: e.target.value }))}>
              <option value="">-- Selecionar --</option>
              {tipos.map(t => <option key={t.id} value={t.id}>{t.tipos}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Vencimento</label>
            <input type="date" className="input" value={form.data_vencimento}
              onChange={e => setForm(f => ({ ...f, data_vencimento: e.target.value }))} />
          </div>
          <div>
            <label className="label">Valor a Receber (R$)</label>
            <input type="number" step="0.01" className="input" value={form.valor_pagar}
              onChange={e => setForm(f => ({ ...f, valor_pagar: e.target.value }))} />
          </div>
          <div>
            <label className="label">Data Recebimento</label>
            <input type="date" className="input" value={form.data_pagamento}
              onChange={e => setForm(f => ({ ...f, data_pagamento: e.target.value }))} />
          </div>
          <div>
            <label className="label">Valor Recebido (R$)</label>
            <input type="number" step="0.01" className="input" value={form.valor_pagamento}
              onChange={e => setForm(f => ({ ...f, valor_pagamento: e.target.value }))} />
          </div>
        </div>

        <div className="flex items-center justify-between pt-2">
          {confirmDelete ? (
            <div className="flex items-center gap-2">
              <span className="text-sm text-red-600">Confirmar exclusão?</span>
              <button onClick={handleDelete} disabled={deleting}
                className="btn-danger text-sm px-3 py-1.5">{deleting ? 'Excluindo...' : 'Excluir'}</button>
              <button onClick={() => setConfirmDelete(false)}
                className="btn-secondary text-sm px-3 py-1.5">Cancelar</button>
            </div>
          ) : (
            <button onClick={() => setConfirmDelete(true)}
              className="flex items-center gap-1.5 text-sm text-red-500 hover:text-red-700">
              <Trash2 size={14} /> Excluir
            </button>
          )}
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

// ---- Adicionar Recebimento Modal ----
function AdicionarModal({
  pedidos, statuses, tipos, onClose, onSaved, user
}: {
  pedidos: Pedido[]; statuses: RecebimentoStatus[]; tipos: TipoRecebimento[]
  onClose: () => void; onSaved: () => void; user: { username: string } | null
}) {
  const [tab, setTab] = useState<'individual' | 'lote'>('individual')

  const [pedidoId, setPedidoId] = useState('')
  const [dataVenc, setDataVenc] = useState('')
  const [valorPagar, setValorPagar] = useState('')
  const [tipoRec, setTipoRec] = useState('')
  const [boletoFile, setBoletoFile] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const boletoRef = useRef<HTMLInputElement>(null)

  const [loteFile, setLoteFile] = useState<File | null>(null)
  const [loteLoading, setLoteLoading] = useState(false)
  const [loteError, setLoteError] = useState('')
  const [loteSuccess, setLoteSuccess] = useState('')
  const loteRef = useRef<HTMLInputElement>(null)

  const tipoSelecionado = tipos.find(t => String(t.id) === tipoRec)
  const isBoleto = tipoSelecionado?.tipos?.toLowerCase().includes('boleto') ?? false

  const pedidosList = pedidos.map(p => ({
    id: p.id,
    label: `Pedido #${p.id} — ${p.cliente} (${p.empresa})`
  }))

  const handleAddIndividual = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!pedidoId) { setError('Selecione um pedido'); return }
    if (!dataVenc) { setError('Informe a data de vencimento'); return }
    if (!valorPagar || parseFloat(valorPagar) <= 0) { setError('Informe o valor'); return }
    if (!tipoRec) { setError('Selecione o tipo de recebimento'); return }

    setSaving(true)

    const { data: novo, error: errIns } = await supabase
      .from('controle_recebimento')
      .insert({
        pedido_id: parseInt(pedidoId),
        data_vencimento: dataVenc,
        valor_pagar: parseFloat(valorPagar),
        status_recebimento: statuses[0]?.id ?? 1,
        tipo_recebimento: parseInt(tipoRec),
        data_pagamento: null,
        valor_pagamento: null,
      })
      .select('id').single()

    if (errIns || !novo) {
      setSaving(false)
      setError(errIns?.message ?? 'Erro ao salvar')
      return
    }

    if (isBoleto && boletoFile && user) {
      const fd = new FormData()
      fd.append('file', boletoFile)
      fd.append('pedido_id', pedidoId)
      fd.append('recebimento_id', String(novo.id))
      fd.append('tipo_documento', '4')
      fd.append('extrair_boleto', 'true')
      await fetch('/api/documentos/upload', { method: 'POST', body: fd }).catch(() => {})
    }

    setSaving(false)
    setSuccess('Recebimento adicionado com sucesso!')
    setPedidoId(''); setDataVenc(''); setValorPagar(''); setTipoRec(''); setBoletoFile(null)
    if (boletoRef.current) boletoRef.current.value = ''
    onSaved()
  }

  const downloadTemplate = async () => {
    const res = await fetch('/api/controle-recebimentos/template')
    if (!res.ok) return
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = 'template_recebimentos.xlsx'; a.click()
    URL.revokeObjectURL(url)
  }

  const handleLoteImport = async () => {
    if (!loteFile) return
    setLoteLoading(true); setLoteError(''); setLoteSuccess('')
    const fd = new FormData(); fd.append('file', loteFile)
    const res = await fetch('/api/controle-recebimentos/importar-lote', { method: 'POST', body: fd })
    const data = await res.json()
    setLoteLoading(false)
    if (!res.ok) { setLoteError(data.error ?? 'Erro ao importar'); return }
    setLoteSuccess(`${data.count} recebimento(s) importados com sucesso!`)
    setLoteFile(null)
    if (loteRef.current) loteRef.current.value = ''
    onSaved()
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">Adicionar Recebimento</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
        </div>

        <div className="flex border-b border-slate-200">
          {(['individual', 'lote'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${tab === t
                ? 'border-primary-500 text-primary-600'
                : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}>
              {t === 'individual' ? 'Adicionar Individual' : 'Adicionar em Lote'}
            </button>
          ))}
        </div>

        {tab === 'individual' && (
          <form onSubmit={handleAddIndividual} className="space-y-4">
            {error && <p className="text-sm text-red-600">{error}</p>}
            {success && <p className="text-sm text-green-600">{success}</p>}

            <div>
              <label className="label">Selecione um pedido *</label>
              <select className="input" value={pedidoId} onChange={e => setPedidoId(e.target.value)}>
                <option value="">Selecione um pedido...</option>
                {pedidosList.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label">Data de Vencimento *</label>
                <input type="date" className="input" value={dataVenc}
                  onChange={e => setDataVenc(e.target.value)} />
              </div>
              <div>
                <label className="label">Valor a Receber (R$) *</label>
                <input type="number" step="0.01" min="0.01" className="input"
                  placeholder="0.00" value={valorPagar}
                  onChange={e => setValorPagar(e.target.value)} />
              </div>
            </div>

            <div>
              <label className="label">Tipo de Recebimento *</label>
              <select className="input" value={tipoRec} onChange={e => setTipoRec(e.target.value)}>
                <option value="">Selecione um tipo de recebimento...</option>
                {tipos.map(t => <option key={t.id} value={t.id}>{t.tipos}</option>)}
              </select>
            </div>

            {isBoleto && (
              <div>
                <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded p-3 mb-2">
                  Recomendamos anexar o PDF do boleto para facilitar o controle.
                </p>
                <label className="label">PDF do Boleto (opcional)</label>
                <div
                  className="border-2 border-dashed border-slate-300 rounded-lg p-4 text-center cursor-pointer hover:border-blue-400 transition-colors"
                  onClick={() => boletoRef.current?.click()}
                >
                  {boletoFile ? (
                    <div className="flex items-center justify-center gap-2">
                      <span className="text-sm text-slate-700">{boletoFile.name}</span>
                      <button type="button" onClick={e => { e.stopPropagation(); setBoletoFile(null) }}
                        className="text-slate-400 hover:text-red-500"><X size={14} /></button>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-1 text-slate-400">
                      <Upload size={20} />
                      <span className="text-xs">Clique para anexar PDF do boleto</span>
                    </div>
                  )}
                </div>
                <input type="file" ref={boletoRef} className="hidden" accept=".pdf"
                  onChange={e => setBoletoFile(e.target.files?.[0] ?? null)} />
              </div>
            )}

            <div className="flex justify-end gap-3 pt-2">
              <button type="button" onClick={onClose} className="btn-secondary">Cancelar</button>
              <button type="submit" className="btn-primary" disabled={saving}>
                {saving ? 'Adicionando...' : 'Adicionar Recebimento'}
              </button>
            </div>
          </form>
        )}

        {tab === 'lote' && (
          <div className="space-y-4">
            <div className="text-sm text-slate-600 bg-slate-50 border border-slate-200 rounded p-3 space-y-1">
              <p className="font-medium text-slate-800">Instruções:</p>
              <p>• <strong>pedido_id</strong>: OBRIGATÓRIO — ID de pedido existente</p>
              <p>• <strong>data_vencimento</strong>: OBRIGATÓRIO — formato DD/MM/AAAA</p>
              <p>• <strong>valor_pagar</strong>: OBRIGATÓRIO — separador decimal é ponto (1000.00)</p>
              <p>• <strong>tipo_recebimento</strong>: OBRIGATÓRIO — ID numérico do tipo cadastrado</p>
              <p>• <strong>data_pagamento</strong> e <strong>valor_pagamento</strong>: opcionais</p>
            </div>

            <button onClick={downloadTemplate} className="btn-secondary gap-2 w-full justify-center">
              <Download size={16} /> Baixar Template (.xlsx)
            </button>

            <div
              className="border-2 border-dashed border-slate-300 rounded-lg p-6 text-center cursor-pointer hover:border-blue-400 transition-colors"
              onClick={() => loteRef.current?.click()}
            >
              {loteFile ? (
                <div className="flex items-center justify-center gap-2">
                  <FileSpreadsheet size={18} className="text-green-600" />
                  <span className="text-sm text-slate-700">{loteFile.name}</span>
                  <button type="button" onClick={e => { e.stopPropagation(); setLoteFile(null) }}
                    className="text-slate-400 hover:text-red-500"><X size={14} /></button>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2 text-slate-400">
                  <Upload size={22} />
                  <span className="text-sm">Selecione o arquivo Excel (.xlsx)</span>
                </div>
              )}
            </div>
            <input type="file" ref={loteRef} className="hidden" accept=".xlsx"
              onChange={e => setLoteFile(e.target.files?.[0] ?? null)} />

            {loteError && <p className="text-sm text-red-600">{loteError}</p>}
            {loteSuccess && <p className="text-sm text-green-600">{loteSuccess}</p>}

            <div className="flex justify-end gap-3">
              <button onClick={onClose} className="btn-secondary">Cancelar</button>
              <button onClick={handleLoteImport} disabled={!loteFile || loteLoading}
                className="btn-primary justify-center">
                {loteLoading ? 'Importando...' : 'Confirmar Importação'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ---- Alterar Status em Lote Modal ----
function AlterarStatusLoteModal({
  rows, statuses, onClose, onSaved
}: {
  rows: Row[]; statuses: RecebimentoStatus[]; onClose: () => void; onSaved: () => void
}) {
  const [filtroEmpresa, setFiltroEmpresa] = useState('')
  const [filtroStatus, setFiltroStatus] = useState('')
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [novoStatus, setNovoStatus] = useState(statuses[0] ? String(statuses[0].id) : '')
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState('')

  const empresas = useMemo(() => [...new Set(rows.map(r => r.empresa))].sort(), [rows])

  const statusNome = (id: number | null) => statuses.find(s => s.id === id)?.nome_status ?? ''

  const filtered = useMemo(() => {
    let list = rows
    if (filtroEmpresa) list = list.filter(r => r.empresa === filtroEmpresa)
    if (filtroStatus) {
      const sid = parseInt(filtroStatus)
      list = list.filter(r => r.status_recebimento === sid)
    }
    return list.sort((a, b) => (a.pedido_id ?? 0) - (b.pedido_id ?? 0) || a.id - b.id)
  }, [rows, filtroEmpresa, filtroStatus])

  const allSelected = filtered.length > 0 && filtered.every(r => selected.has(r.id))

  const toggleAll = () => {
    if (allSelected) {
      setSelected(prev => { const n = new Set(prev); filtered.forEach(r => n.delete(r.id)); return n })
    } else {
      setSelected(prev => { const n = new Set(prev); filtered.forEach(r => n.add(r.id)); return n })
    }
  }

  const toggle = (id: number) => {
    setSelected(prev => {
      const n = new Set(prev)
      n.has(id) ? n.delete(id) : n.add(id)
      return n
    })
  }

  const handleAplicar = async () => {
    if (selected.size === 0 || !novoStatus) return
    setSaving(true)
    const ids = [...selected]
    await supabase.from('controle_recebimento').update({ status_recebimento: parseInt(novoStatus) }).in('id', ids)
    setSaving(false)
    setSuccess(`${ids.length} recebimento(s) atualizados com sucesso!`)
    setSelected(new Set())
    onSaved()
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-3xl w-full p-6 space-y-4 max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between shrink-0">
          <h2 className="text-lg font-semibold text-slate-900">Alterar Status em Lote</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
        </div>

        <div className="grid grid-cols-2 gap-3 shrink-0">
          <div>
            <label className="label">Filtrar por empresa</label>
            <select className="input" value={filtroEmpresa} onChange={e => { setFiltroEmpresa(e.target.value); setSelected(new Set()) }}>
              <option value="">Todas</option>
              {empresas.map(e => <option key={e} value={e}>{e}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Filtrar por status atual</label>
            <select className="input" value={filtroStatus} onChange={e => { setFiltroStatus(e.target.value); setSelected(new Set()) }}>
              <option value="">Todos</option>
              {statuses.map(s => <option key={s.id} value={s.id}>{s.nome_status}</option>)}
            </select>
          </div>
        </div>

        {success && <p className="text-sm text-green-600 shrink-0">{success}</p>}

        <div className="overflow-y-auto flex-1 border border-slate-200 rounded-lg">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-slate-50">
              <tr>
                <th className="table-cell w-10">
                  <input type="checkbox" checked={allSelected} onChange={toggleAll} className="w-4 h-4" />
                </th>
                <th className="table-cell font-medium text-left">Recebimento</th>
                <th className="table-cell font-medium text-left">Vencimento</th>
                <th className="table-cell font-medium text-right">Valor</th>
                <th className="table-cell font-medium text-left">Status Atual</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={5} className="table-cell text-center text-slate-400 py-8">Nenhum recebimento encontrado.</td></tr>
              ) : filtered.map(r => (
                <tr key={r.id} className={`table-row cursor-pointer ${selected.has(r.id) ? 'bg-blue-50' : ''}`}
                  onClick={() => toggle(r.id)}>
                  <td className="table-cell" onClick={e => e.stopPropagation()}>
                    <input type="checkbox" checked={selected.has(r.id)} onChange={() => toggle(r.id)} className="w-4 h-4" />
                  </td>
                  <td className="table-cell">
                    <span className="font-mono text-slate-500">#{r.id}</span>
                    <span className="text-slate-400 mx-1">·</span>
                    <span>Pedido #{r.pedido_id}</span>
                    <span className="text-slate-400 mx-1">·</span>
                    <span className="text-slate-600">{r.cliente}</span>
                  </td>
                  <td className="table-cell">{fmtData(r.data_vencimento)}</td>
                  <td className="table-cell text-right font-medium">{fmtMoeda(r.valor_pagar)}</td>
                  <td className="table-cell">{statusNome(r.status_recebimento)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex items-center gap-3 pt-2 shrink-0 border-t border-slate-100">
          <span className="text-sm text-slate-500 mr-auto">
            {selected.size} selecionado(s)
          </span>
          <div className="flex-1 max-w-[200px]">
            <select className="input" value={novoStatus} onChange={e => setNovoStatus(e.target.value)}>
              {statuses.map(s => <option key={s.id} value={s.id}>{s.nome_status}</option>)}
            </select>
          </div>
          <button onClick={handleAplicar} disabled={selected.size === 0 || saving}
            className="btn-primary whitespace-nowrap">
            {saving ? 'Aplicando...' : 'Aplicar'}
          </button>
          <button onClick={onClose} className="btn-secondary">Fechar</button>
        </div>
      </div>
    </div>
  )
}

// ---- Main Page ----
export default function ControleRecebimentosPage() {
  const [controles, setControles] = useState<Controle[]>([])
  const [pedidos, setPedidos] = useState<Record<number, Pedido>>({})
  const [statuses, setStatuses] = useState<RecebimentoStatus[]>([])
  const [tipos, setTipos] = useState<TipoRecebimento[]>([])
  const [loading, setLoading] = useState(true)
  const [user, setUser] = useState<{ username: string } | null>(null)

  const [filtroEmpresa, setFiltroEmpresa] = useState('')
  const [filtroCategoria, setFiltroCategoria] = useState('')
  const [filtroStatusRec, setFiltroStatusRec] = useState('')
  const [filtroSituacao, setFiltroSituacao] = useState('')

  const [editRow, setEditRow] = useState<Row | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [showLote, setShowLote] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const [{ data: ctrls }, { data: sts }, { data: tps }, u] = await Promise.all([
      supabase.from('controle_recebimento').select('*').order('id', { ascending: false }),
      supabase.from('recebimento_status').select('*').order('id'),
      supabase.from('tipos_recebimento').select('*').order('id'),
      fetch('/api/auth/me').then(r => r.json()),
    ])
    setStatuses(sts ?? [])
    setTipos(tps ?? [])
    setUser(u?.username ? u : null)

    const ctrlList = ctrls ?? []
    setControles(ctrlList)

    const pedidoIds = [...new Set(ctrlList.filter(c => c.pedido_id).map(c => c.pedido_id as number))]
    if (pedidoIds.length > 0) {
      const { data: peds } = await supabase
        .from('pedidos_solicitados_receita')
        .select('id, empresa, categoria, cliente, valor_pedido, status, observacao')
        .in('id', pedidoIds)
      const map: Record<number, Pedido> = {}
      peds?.forEach(p => { map[p.id] = p })
      setPedidos(map)
    }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const rows: Row[] = useMemo(() =>
    controles.map(c => {
      const ped = c.pedido_id ? pedidos[c.pedido_id] : undefined
      return {
        ...c,
        empresa: ped?.empresa ?? '',
        categoria: ped?.categoria ?? '',
        cliente: ped?.cliente ?? '',
        status_pedido: ped?.status ?? '',
        observacao: ped?.observacao ?? null,
        situacao: getSituacao(c),
      }
    }), [controles, pedidos])

  const empresas = useMemo(() => [...new Set(rows.map(r => r.empresa).filter(Boolean))].sort(), [rows])
  const categorias = useMemo(() => {
    const base = filtroEmpresa ? rows.filter(r => r.empresa === filtroEmpresa) : rows
    return [...new Set(base.map(r => r.categoria).filter(Boolean))].sort()
  }, [rows, filtroEmpresa])

  const filtered = useMemo(() => {
    let list = rows
    if (filtroEmpresa) list = list.filter(r => r.empresa === filtroEmpresa)
    if (filtroCategoria) list = list.filter(r => r.categoria === filtroCategoria)
    if (filtroStatusRec) list = list.filter(r => String(r.status_recebimento) === filtroStatusRec)
    if (filtroSituacao) list = list.filter(r => r.situacao === filtroSituacao)
    return list
  }, [rows, filtroEmpresa, filtroCategoria, filtroStatusRec, filtroSituacao])

  const sorted = useMemo(() =>
    [...filtered].sort((a, b) => (a.pedido_id ?? 0) - (b.pedido_id ?? 0) || a.id - b.id),
    [filtered])

  const totalAReceber = useMemo(() => filtered.reduce((s, r) => s + (r.valor_pagar ?? 0), 0), [filtered])
  const totalRecebido = useMemo(() => filtered.reduce((s, r) => s + (r.valor_pagamento ?? 0), 0), [filtered])
  const saldoRestante = totalAReceber - totalRecebido

  const vencidosCount = useMemo(() => filtered.filter(r => r.situacao === 'Atrasado').length, [filtered])
  const totalVencido = useMemo(() =>
    filtered.filter(r => r.situacao === 'Atrasado')
      .reduce((s, r) => s + (r.valor_pagar ?? 0) - (r.valor_pagamento ?? 0), 0),
    [filtered])

  const statusNome = (id: number | null) => statuses.find(s => s.id === id)?.nome_status ?? '-'
  const tipoNome = (id: number | null) => tipos.find(t => t.id === id)?.tipos ?? '-'

  const pedidosList = useMemo(() => Object.values(pedidos).sort((a, b) => b.id - a.id), [pedidos])

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="page-title">Controle de Recebimentos</h1>
          <p className="page-subtitle">Acompanhe e registre o status de cada recebimento</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={() => setShowAdd(true)} className="btn-primary gap-1.5 text-sm">
            <Plus size={15} /> Adicionar Recebimento
          </button>
          <button onClick={() => setShowLote(true)} className="btn-secondary text-sm">
            Alterar Status em Lote
          </button>
          <button onClick={load} className="btn-secondary p-2" title="Atualizar">
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="card">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <label className="label">Empresa</label>
            <select className="input" value={filtroEmpresa}
              onChange={e => { setFiltroEmpresa(e.target.value); setFiltroCategoria('') }}>
              <option value="">Todas</option>
              {empresas.map(e => <option key={e} value={e}>{e}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Categoria</label>
            <select className="input" value={filtroCategoria}
              onChange={e => setFiltroCategoria(e.target.value)} disabled={!filtroEmpresa}>
              <option value="">Todas</option>
              {categorias.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Status Recebimento</label>
            <select className="input" value={filtroStatusRec}
              onChange={e => setFiltroStatusRec(e.target.value)}>
              <option value="">Todos</option>
              {statuses.map(s => <option key={s.id} value={s.id}>{s.nome_status}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Situação</label>
            <select className="input" value={filtroSituacao}
              onChange={e => setFiltroSituacao(e.target.value)}>
              <option value="">Todas</option>
              {['Em dia', 'Atrasado', 'Quitado', 'Sem vencimento'].map(s =>
                <option key={s} value={s}>{s}</option>
              )}
            </select>
          </div>
        </div>
        <p className="text-xs text-slate-500 mt-3 pt-3 border-t border-slate-100">
          {loading ? 'Carregando...' : `${filtered.length} recebimento(s) de ${controles.length} total`}
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="card">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Total a Receber</p>
          <p className="text-xl font-bold text-slate-900 mt-1">{fmtMoeda(totalAReceber)}</p>
        </div>
        <div className="card">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Total Recebido</p>
          <p className="text-xl font-bold text-green-700 mt-1">{fmtMoeda(totalRecebido)}</p>
        </div>
        <div className="card">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Saldo Restante</p>
          <p className={`text-xl font-bold mt-1 ${saldoRestante < 0 ? 'text-red-600' : 'text-slate-900'}`}>
            {fmtMoeda(saldoRestante)}
          </p>
        </div>
        <div className="card">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Total Vencido</p>
          <p className="text-xl font-bold text-red-600 mt-1">{fmtMoeda(totalVencido)}</p>
          <p className="text-xs text-red-500 mt-0.5">{vencidosCount} parcela(s) vencida(s)</p>
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="card text-center py-12 text-slate-400">Carregando...</div>
      ) : sorted.length === 0 ? (
        <div className="card text-center py-12 text-slate-400">Nenhum recebimento encontrado.</div>
      ) : (
        <div className="card p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="table-header">
                  <th className="table-cell font-medium">ID</th>
                  <th className="table-cell font-medium">Pedido</th>
                  <th className="table-cell font-medium">Empresa / Categoria</th>
                  <th className="table-cell font-medium">Cliente</th>
                  <th className="table-cell font-medium">Descrição</th>
                  <th className="table-cell font-medium">Vencimento</th>
                  <th className="table-cell font-medium text-right">Valor a Receber</th>
                  <th className="table-cell font-medium">Recebimento</th>
                  <th className="table-cell font-medium text-right">Valor Recebido</th>
                  <th className="table-cell font-medium">Status</th>
                  <th className="table-cell font-medium">Tipo</th>
                  <th className="table-cell font-medium">Situação</th>
                  <th className="table-cell font-medium w-10"></th>
                </tr>
              </thead>
              <tbody>
                {sorted.map(r => (
                  <tr key={r.id} className="table-row">
                    <td className="table-cell font-mono text-xs text-slate-400">#{r.id}</td>
                    <td className="table-cell font-mono text-xs text-slate-500">#{r.pedido_id}</td>
                    <td className="table-cell">
                      <p className="font-medium text-slate-900 truncate max-w-[120px]">{r.empresa}</p>
                      <p className="text-xs text-slate-400 truncate max-w-[120px]">{r.categoria}</p>
                    </td>
                    <td className="table-cell text-slate-600 truncate max-w-[120px]">{r.cliente}</td>
                    <td className="table-cell text-slate-500 max-w-[140px] truncate" title={r.observacao ?? ''}>
                      {r.observacao ?? '-'}
                    </td>
                    <td className="table-cell whitespace-nowrap">{fmtData(r.data_vencimento)}</td>
                    <td className="table-cell text-right font-medium">{fmtMoeda(r.valor_pagar)}</td>
                    <td className="table-cell whitespace-nowrap">{fmtData(r.data_pagamento)}</td>
                    <td className="table-cell text-right">{fmtMoeda(r.valor_pagamento)}</td>
                    <td className="table-cell">
                      <span className="badge bg-slate-100 text-slate-600 text-xs">
                        {statusNome(r.status_recebimento)}
                      </span>
                    </td>
                    <td className="table-cell text-slate-500 text-xs">{tipoNome(r.tipo_recebimento)}</td>
                    <td className="table-cell">
                      <span className={`badge text-xs ${SITUACAO_BADGE[r.situacao] ?? 'bg-slate-100 text-slate-500'}`}>
                        {r.situacao}
                      </span>
                    </td>
                    <td className="table-cell">
                      <button onClick={() => setEditRow(r)}
                        className="p-1.5 rounded hover:bg-slate-100 text-slate-500" title="Editar">
                        <Pencil size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {editRow && (
        <EditModal
          row={editRow}
          statuses={statuses}
          tipos={tipos}
          onClose={() => setEditRow(null)}
          onSaved={() => { setEditRow(null); load() }}
        />
      )}

      {showAdd && (
        <AdicionarModal
          pedidos={pedidosList}
          statuses={statuses}
          tipos={tipos}
          user={user}
          onClose={() => setShowAdd(false)}
          onSaved={() => { load() }}
        />
      )}

      {showLote && (
        <AlterarStatusLoteModal
          rows={rows}
          statuses={statuses}
          onClose={() => setShowLote(false)}
          onSaved={() => { load() }}
        />
      )}
    </div>
  )
}
