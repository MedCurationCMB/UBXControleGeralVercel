'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { supabaseBrowser as supabase } from '@/lib/supabase/client'
import { RefreshCw, Plus, Pencil, X, Trash2, Check, Download, Upload, FileSpreadsheet, ChevronLeft, ChevronRight, Info, FileOutput } from 'lucide-react'
import RemessaRetornoModal from '@/components/controle-pagamentos/RemessaRetornoModal'

// ---- Types ----
interface PagamentoStatus { id: number; nome_status: string }
interface TipoPagamento { id: number; tipos: string }
interface Controle {
  id: number; pedido_id: number | null
  data_vencimento: string | null; valor_pagar: number | null
  data_pagamento: string | null; valor_pagamento: number | null
  status_pagamento: number | null; tipo_pagamento: number | null
}
interface Pedido {
  id: number; empresa: string; categoria: string; fornecedor: string
  valor_pedido: number; status: string; observacao: string | null; cancelado: boolean
}
interface Row extends Controle {
  empresa: string; categoria: string; fornecedor: string
  status_pedido: string; observacao: string | null; situacao: string
}
interface Resumo {
  total_pagar: number; total_pago: number; saldo_restante: number
  total_vencido: number; count_vencido: number; count_total: number
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

const PAGE_SIZE = 100

// ---- Edit Modal ----
function EditModal({
  row, statuses, tipos, onClose, onSaved
}: {
  row: Row; statuses: PagamentoStatus[]; tipos: TipoPagamento[]
  onClose: () => void; onSaved: () => void
}) {
  const [form, setForm] = useState({
    data_vencimento: row.data_vencimento ?? '',
    valor_pagar: row.valor_pagar != null ? String(row.valor_pagar) : '',
    data_pagamento: row.data_pagamento ?? '',
    valor_pagamento: row.valor_pagamento != null ? String(row.valor_pagamento) : '',
    status_pagamento: row.status_pagamento != null ? String(row.status_pagamento) : '',
    tipo_pagamento: row.tipo_pagamento != null ? String(row.tipo_pagamento) : '',
  })
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const handleSave = async () => {
    setSaving(true)
    await supabase.from('controle_pagamentos').update({
      data_vencimento: form.data_vencimento || null,
      valor_pagar: form.valor_pagar ? parseFloat(form.valor_pagar) : null,
      data_pagamento: form.data_pagamento || null,
      valor_pagamento: form.valor_pagamento ? parseFloat(form.valor_pagamento) : null,
      status_pagamento: form.status_pagamento ? Number(form.status_pagamento) : null,
      tipo_pagamento: form.tipo_pagamento ? Number(form.tipo_pagamento) : null,
    }).eq('id', row.id)
    setSaving(false)
    onSaved()
  }

  const handleDelete = async () => {
    setDeleting(true)
    await supabase.from('controle_pagamentos').delete().eq('id', row.id)
    setDeleting(false)
    onSaved()
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-lg w-full p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">
            Editar Pagamento #{row.id} — Pedido #{row.pedido_id}
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
        </div>

        <div className="text-sm text-slate-500">
          {row.empresa} · {row.fornecedor}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Status Pagamento</label>
            <select className="input" value={form.status_pagamento}
              onChange={e => setForm(f => ({ ...f, status_pagamento: e.target.value }))}>
              <option value="">-- Selecionar --</option>
              {statuses.map(s => <option key={s.id} value={s.id}>{s.nome_status}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Tipo de Pagamento</label>
            <select className="input" value={form.tipo_pagamento}
              onChange={e => setForm(f => ({ ...f, tipo_pagamento: e.target.value }))}>
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
            <label className="label">Valor a Pagar (R$)</label>
            <input type="number" step="0.01" className="input" value={form.valor_pagar}
              onChange={e => setForm(f => ({ ...f, valor_pagar: e.target.value }))} />
          </div>
          <div>
            <label className="label">Data Pagamento</label>
            <input type="date" className="input" value={form.data_pagamento}
              onChange={e => setForm(f => ({ ...f, data_pagamento: e.target.value }))} />
          </div>
          <div>
            <label className="label">Valor Pago (R$)</label>
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

// ---- Adicionar Pagamento Modal ----
function AdicionarModal({
  pedidos, statuses, tipos, onClose, onSaved, user
}: {
  pedidos: Pedido[]; statuses: PagamentoStatus[]; tipos: TipoPagamento[]
  onClose: () => void; onSaved: () => void; user: { username: string } | null
}) {
  const [tab, setTab] = useState<'individual' | 'lote'>('individual')

  const [pedidoId, setPedidoId] = useState('')
  const [dataVenc, setDataVenc] = useState('')
  const [valorPagar, setValorPagar] = useState('')
  const [tipoPag, setTipoPag] = useState('')
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

  const isBoleto = tipoPag === '3'
  const pedidosList = pedidos.map(p => ({
    id: p.id,
    label: `Pedido #${p.id} — ${p.fornecedor} (${p.empresa})`
  }))

  const handleAddIndividual = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!pedidoId) { setError('Selecione um pedido'); return }
    if (!dataVenc) { setError('Informe a data de vencimento'); return }
    if (!valorPagar || parseFloat(valorPagar) <= 0) { setError('Informe o valor'); return }
    if (!tipoPag) { setError('Selecione o tipo de pagamento'); return }

    setSaving(true)

    const { data: novo, error: errIns } = await supabase
      .from('controle_pagamentos')
      .insert({
        pedido_id: parseInt(pedidoId),
        data_vencimento: dataVenc,
        valor_pagar: parseFloat(valorPagar),
        status_pagamento: 1,
        tipo_pagamento: parseInt(tipoPag),
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
      fd.append('pagamento_id', String(novo.id))
      fd.append('tipo_documento', '4')
      fd.append('extrair_boleto', 'true')
      await fetch('/api/documentos/upload', { method: 'POST', body: fd }).catch(() => {})
    }

    setSaving(false)
    setSuccess('Pagamento adicionado com sucesso!')
    setPedidoId(''); setDataVenc(''); setValorPagar(''); setTipoPag(''); setBoletoFile(null)
    if (boletoRef.current) boletoRef.current.value = ''
    onSaved()
  }

  const downloadTemplate = async () => {
    const res = await fetch('/api/controle-pagamentos/template')
    if (!res.ok) return
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = 'template_pagamentos.xlsx'; a.click()
    URL.revokeObjectURL(url)
  }

  const handleLoteImport = async () => {
    if (!loteFile) return
    setLoteLoading(true); setLoteError(''); setLoteSuccess('')
    const fd = new FormData(); fd.append('file', loteFile)
    const res = await fetch('/api/controle-pagamentos/importar-lote', { method: 'POST', body: fd })
    const data = await res.json()
    setLoteLoading(false)
    if (!res.ok) { setLoteError(data.error ?? 'Erro ao importar'); return }
    setLoteSuccess(`${data.count} pagamento(s) importados com sucesso!`)
    setLoteFile(null)
    if (loteRef.current) loteRef.current.value = ''
    onSaved()
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">Adicionar Pagamento</h2>
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
                <label className="label">Valor a Pagar (R$) *</label>
                <input type="number" step="0.01" min="0.01" className="input"
                  placeholder="0.00" value={valorPagar}
                  onChange={e => setValorPagar(e.target.value)} />
              </div>
            </div>

            <div>
              <label className="label">Tipo de Pagamento *</label>
              <select className="input" value={tipoPag} onChange={e => setTipoPag(e.target.value)}>
                <option value="">Selecione um tipo de pagamento...</option>
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
                {saving ? 'Adicionando...' : 'Adicionar Pagamento'}
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
              <p>• <strong>tipo_pagamento</strong>: OBRIGATÓRIO — 1=PIX, 2=Dinheiro, 3=Boleto, 4=Cartão de Crédito, 5=Ainda à Definir</p>
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
  rows: Row[]; statuses: PagamentoStatus[]; onClose: () => void; onSaved: () => void
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
      list = list.filter(r => r.status_pagamento === sid)
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
    await supabase.from('controle_pagamentos').update({ status_pagamento: parseInt(novoStatus) }).in('id', ids)
    setSaving(false)
    setSuccess(`${ids.length} pagamento(s) atualizados com sucesso!`)
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

        <div className="flex items-start gap-2 text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded p-2.5 shrink-0">
          <Info size={13} className="shrink-0 mt-0.5 text-slate-400" />
          <span>Operando sobre os pagamentos da página atual. Para abranger mais resultados, feche e aplique filtros de empresa ou status antes de abrir.</span>
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
                <th className="table-cell font-medium text-left">Pagamento</th>
                <th className="table-cell font-medium text-left">Vencimento</th>
                <th className="table-cell font-medium text-right">Valor</th>
                <th className="table-cell font-medium text-left">Status Atual</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={5} className="table-cell text-center text-slate-400 py-8">Nenhum pagamento encontrado.</td></tr>
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
                    <span className="text-slate-600">{r.fornecedor}</span>
                  </td>
                  <td className="table-cell">{fmtData(r.data_vencimento)}</td>
                  <td className="table-cell text-right font-medium">{fmtMoeda(r.valor_pagar)}</td>
                  <td className="table-cell">{statusNome(r.status_pagamento)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex items-center gap-3 pt-2 shrink-0 border-t border-slate-100">
          <span className="text-sm text-slate-500 mr-auto">{selected.size} selecionado(s)</span>
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
export default function ControlePage() {
  const [statuses, setStatuses] = useState<PagamentoStatus[]>([])
  const [tipos, setTipos] = useState<TipoPagamento[]>([])
  const [pedidosForAdd, setPedidosForAdd] = useState<Pedido[]>([])
  const [user, setUser] = useState<{ username: string } | null>(null)
  const [empresas, setEmpresas] = useState<string[]>([])
  const [categorias, setCategorias] = useState<string[]>([])

  // Resumo (accurate full-dataset aggregates via API route)
  const [resumo, setResumo] = useState<Resumo>({
    total_pagar: 0, total_pago: 0, saldo_restante: 0,
    total_vencido: 0, count_vencido: 0, count_total: 0,
  })
  const [resumoLoading, setResumoLoading] = useState(true)

  // Table (paginated)
  const [rows, setRows] = useState<Row[]>([])
  const [tableLoading, setTableLoading] = useState(true)
  const [page, setPage] = useState(0)
  const [total, setTotal] = useState(0)

  // Filters
  const [filtroEmpresa, setFiltroEmpresa] = useState('')
  const [filtroCategoria, setFiltroCategoria] = useState('')
  const [filtroStatusPag, setFiltroStatusPag] = useState('')
  const [filtroSituacao, setFiltroSituacao] = useState('')

  // Modals
  const [editRow, setEditRow] = useState<Row | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [showLote, setShowLote] = useState(false)
  const [showRemessa, setShowRemessa] = useState(false)

  // Load reference data once
  useEffect(() => {
    Promise.all([
      supabase.from('pagamento_status').select('*').order('id'),
      supabase.from('tipos_pagamento').select('*').order('id'),
      supabase.from('pedidos_solicitados').select('id, empresa, categoria, fornecedor, valor_pedido, status, observacao, cancelado')
        .eq('status', 'Autorizado').eq('cancelado', false).order('id', { ascending: false }),
      supabase.from('pedidos_solicitados').select('empresa').order('empresa'),
      supabase.from('pedidos_solicitados').select('categoria').order('categoria'),
      fetch('/api/auth/me').then(r => r.json()),
    ]).then(([{ data: sts }, { data: tps }, { data: peds }, { data: emp }, { data: cat }, u]) => {
      setStatuses(sts ?? [])
      setTipos(tps ?? [])
      setPedidosForAdd(peds ?? [])
      setEmpresas([...new Set((emp ?? []).map((r: { empresa: string }) => r.empresa).filter(Boolean))].sort())
      setCategorias([...new Set((cat ?? []).map((r: { categoria: string }) => r.categoria).filter(Boolean))].sort())
      setUser(u?.username ? u : null)
    })
  }, [])

  // Reset page when server-side filters change
  useEffect(() => { setPage(0) }, [filtroEmpresa, filtroCategoria, filtroStatusPag, filtroSituacao])

  // Load resumo from API (full dataset aggregates)
  const loadResumo = useCallback(async () => {
    setResumoLoading(true)
    const params = new URLSearchParams()
    if (filtroEmpresa) params.set('empresa', filtroEmpresa)
    if (filtroCategoria) params.set('categoria', filtroCategoria)
    if (filtroStatusPag) params.set('status_pagamento', filtroStatusPag)
    try {
      const res = await fetch(`/api/controle-pagamentos/resumo?${params}`)
      const data = await res.json()
      setResumo(data)
    } catch { /* keep previous */ }
    setResumoLoading(false)
  }, [filtroEmpresa, filtroCategoria, filtroStatusPag])

  // Load paginated table rows
  const loadTable = useCallback(async () => {
    setTableLoading(true)

    // Resolve pedido_ids for empresa/categoria filters (these fields live on pedidos_solicitados)
    let pedidoIds: number[] | null = null
    if (filtroEmpresa || filtroCategoria) {
      let q = supabase.from('pedidos_solicitados').select('id')
      if (filtroEmpresa) q = q.eq('empresa', filtroEmpresa)
      if (filtroCategoria) q = q.eq('categoria', filtroCategoria)
      const { data } = await q
      pedidoIds = (data ?? []).map((p: { id: number }) => p.id)
      if (pedidoIds.length === 0) {
        setRows([])
        setTotal(0)
        setTableLoading(false)
        return
      }
    }

    let q = supabase
      .from('controle_pagamentos')
      .select('*', { count: 'exact' })
      .order('id', { ascending: false })
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)

    if (pedidoIds) q = q.in('pedido_id', pedidoIds)
    if (filtroStatusPag) q = q.eq('status_pagamento', parseInt(filtroStatusPag))

    const { data: ctrls, count } = await q
    setTotal(count ?? 0)

    const ctrlList = (ctrls ?? []) as Controle[]

    // Enrich current page with pedido data
    const uniquePedidoIds = [...new Set(ctrlList.filter(c => c.pedido_id).map(c => c.pedido_id as number))]
    const pedidoMap: Record<number, Pedido> = {}
    if (uniquePedidoIds.length > 0) {
      const { data: peds } = await supabase
        .from('pedidos_solicitados')
        .select('id, empresa, categoria, fornecedor, valor_pedido, status, observacao, cancelado')
        .in('id', uniquePedidoIds)
      ;(peds ?? []).forEach((p: Pedido) => { pedidoMap[p.id] = p })
    }

    const enriched: Row[] = ctrlList.map(c => {
      const ped = c.pedido_id ? pedidoMap[c.pedido_id] : undefined
      return {
        ...c,
        empresa: ped?.empresa ?? '',
        categoria: ped?.categoria ?? '',
        fornecedor: ped?.fornecedor ?? '',
        status_pedido: ped?.status ?? '',
        observacao: ped?.observacao ?? null,
        situacao: getSituacao(c),
      }
    })

    setRows(enriched)
    setTableLoading(false)
  }, [page, filtroEmpresa, filtroCategoria, filtroStatusPag])

  useEffect(() => { loadResumo() }, [loadResumo])
  useEffect(() => { loadTable() }, [loadTable])

  const reload = () => { loadResumo(); loadTable() }

  // situacao filter is client-side on current page only
  const visibleRows = useMemo(() => {
    if (!filtroSituacao) return rows
    return rows.filter(r => r.situacao === filtroSituacao)
  }, [rows, filtroSituacao])

  const totalPages = Math.ceil(total / PAGE_SIZE)

  const statusNome = (id: number | null) => statuses.find(s => s.id === id)?.nome_status ?? '-'
  const tipoNome = (id: number | null) => tipos.find(t => t.id === id)?.tipos ?? '-'

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="page-title">Controle de Pagamentos</h1>
          <p className="page-subtitle">Acompanhe e registre o status de cada pagamento</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={() => setShowAdd(true)} className="btn-primary gap-1.5 text-sm">
            <Plus size={15} /> Adicionar Pagamento
          </button>
          <button onClick={() => setShowLote(true)} className="btn-secondary text-sm">
            Alterar Status em Lote
          </button>
          <button onClick={() => setShowRemessa(true)} className="btn-secondary gap-1.5 text-sm">
            <FileOutput size={15} /> Remessa / Retorno
          </button>
          <button onClick={reload} className="btn-secondary p-2" title="Atualizar">
            <RefreshCw size={16} className={(resumoLoading || tableLoading) ? 'animate-spin' : ''} />
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
              onChange={e => setFiltroCategoria(e.target.value)}>
              <option value="">Todas</option>
              {categorias.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Status Pagamento</label>
            <select className="input" value={filtroStatusPag}
              onChange={e => setFiltroStatusPag(e.target.value)}>
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
        <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-100">
          <p className="text-xs text-slate-500">
            {tableLoading
              ? 'Carregando...'
              : filtroSituacao
              ? `${visibleRows.length} de ${rows.length} na página com situação "${filtroSituacao}"`
              : `${total.toLocaleString('pt-BR')} pagamento(s) — página ${page + 1} de ${Math.max(1, totalPages)}`
            }
          </p>
          {filtroSituacao && (
            <p className="text-xs text-amber-600 flex items-center gap-1">
              <Info size={11} /> Filtro de situação aplicado à página atual
            </p>
          )}
        </div>
      </div>

      {/* Summary Cards — from API (accurate full-dataset totals) */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="card">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Total a Pagar</p>
          <p className={`text-xl font-bold text-slate-900 mt-1 ${resumoLoading ? 'opacity-40' : ''}`}>
            {fmtMoeda(resumo.total_pagar)}
          </p>
          <p className="text-xs text-slate-400 mt-0.5">{resumo.count_total.toLocaleString('pt-BR')} parcela(s)</p>
        </div>
        <div className="card">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Total Pago</p>
          <p className={`text-xl font-bold text-green-700 mt-1 ${resumoLoading ? 'opacity-40' : ''}`}>
            {fmtMoeda(resumo.total_pago)}
          </p>
        </div>
        <div className="card">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Saldo Restante</p>
          <p className={`text-xl font-bold mt-1 ${resumo.saldo_restante < 0 ? 'text-red-600' : 'text-slate-900'} ${resumoLoading ? 'opacity-40' : ''}`}>
            {fmtMoeda(resumo.saldo_restante)}
          </p>
        </div>
        <div className="card">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Total Vencido</p>
          <p className={`text-xl font-bold text-red-600 mt-1 ${resumoLoading ? 'opacity-40' : ''}`}>
            {fmtMoeda(resumo.total_vencido)}
          </p>
          <p className="text-xs text-red-500 mt-0.5">{resumo.count_vencido} parcela(s) vencida(s)</p>
        </div>
      </div>

      {/* Table */}
      {tableLoading ? (
        <div className="card text-center py-12 text-slate-400">Carregando...</div>
      ) : visibleRows.length === 0 ? (
        <div className="card text-center py-12 text-slate-400">Nenhum pagamento encontrado.</div>
      ) : (
        <div className="card p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="table-header">
                  <th className="table-cell font-medium">ID</th>
                  <th className="table-cell font-medium">Pedido</th>
                  <th className="table-cell font-medium">Empresa / Categoria</th>
                  <th className="table-cell font-medium">Fornecedor</th>
                  <th className="table-cell font-medium">Descrição</th>
                  <th className="table-cell font-medium">Vencimento</th>
                  <th className="table-cell font-medium text-right">Valor a Pagar</th>
                  <th className="table-cell font-medium">Pagamento</th>
                  <th className="table-cell font-medium text-right">Valor Pago</th>
                  <th className="table-cell font-medium">Status</th>
                  <th className="table-cell font-medium">Tipo</th>
                  <th className="table-cell font-medium">Situação</th>
                  <th className="table-cell font-medium w-10"></th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map(r => (
                  <tr key={r.id} className="table-row">
                    <td className="table-cell font-mono text-xs text-slate-400">#{r.id}</td>
                    <td className="table-cell font-mono text-xs text-slate-500">#{r.pedido_id}</td>
                    <td className="table-cell">
                      <p className="font-medium text-slate-900 truncate max-w-[120px]">{r.empresa}</p>
                      <p className="text-xs text-slate-400 truncate max-w-[120px]">{r.categoria}</p>
                    </td>
                    <td className="table-cell text-slate-600 truncate max-w-[120px]">{r.fornecedor}</td>
                    <td className="table-cell text-slate-500 max-w-[140px] truncate" title={r.observacao ?? ''}>
                      {r.observacao ?? '-'}
                    </td>
                    <td className="table-cell whitespace-nowrap">{fmtData(r.data_vencimento)}</td>
                    <td className="table-cell text-right font-medium">{fmtMoeda(r.valor_pagar)}</td>
                    <td className="table-cell whitespace-nowrap">{fmtData(r.data_pagamento)}</td>
                    <td className="table-cell text-right">{fmtMoeda(r.valor_pagamento)}</td>
                    <td className="table-cell">
                      <span className="badge bg-slate-100 text-slate-600 text-xs">
                        {statusNome(r.status_pagamento)}
                      </span>
                    </td>
                    <td className="table-cell text-slate-500 text-xs">{tipoNome(r.tipo_pagamento)}</td>
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

          {!filtroSituacao && totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 bg-slate-50">
              <button
                onClick={() => setPage(p => Math.max(0, p - 1))}
                disabled={page === 0}
                className="btn-secondary text-sm gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <ChevronLeft size={14} /> Anterior
              </button>
              <span className="text-sm text-slate-600">
                Página <span className="font-semibold">{page + 1}</span> de{' '}
                <span className="font-semibold">{totalPages}</span>
              </span>
              <button
                onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
                className="btn-secondary text-sm gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Próximo <ChevronRight size={14} />
              </button>
            </div>
          )}
        </div>
      )}

      {/* Edit Modal */}
      {editRow && (
        <EditModal
          row={editRow}
          statuses={statuses}
          tipos={tipos}
          onClose={() => setEditRow(null)}
          onSaved={() => { setEditRow(null); reload() }}
        />
      )}

      {/* Adicionar Modal */}
      {showAdd && (
        <AdicionarModal
          pedidos={pedidosForAdd}
          statuses={statuses}
          tipos={tipos}
          user={user}
          onClose={() => setShowAdd(false)}
          onSaved={() => reload()}
        />
      )}

      {/* Alterar Status em Lote Modal */}
      {showLote && (
        <AlterarStatusLoteModal
          rows={rows}
          statuses={statuses}
          onClose={() => setShowLote(false)}
          onSaved={() => reload()}
        />
      )}

      {showRemessa && (
        <RemessaRetornoModal
          onClose={() => setShowRemessa(false)}
          onUpdated={() => reload()}
        />
      )}
    </div>
  )
}
