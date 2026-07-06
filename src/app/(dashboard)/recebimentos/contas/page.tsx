'use client'

import { useState, useEffect, useCallback } from 'react'
import { supabaseBrowser as supabase } from '@/lib/supabase/client'
import { Plus, Pencil, Trash2 } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import Confirm from '@/components/ui/Confirm'

interface Conta {
  id: number; nome_empresa: string | null; cnpj: number | null
  agencia: number | null; digito_agencia: number | null
  conta_corrente: number | null; digito_conta: number | null
  rua_av: string | null; numero_local: number | null; complemento: string | null
  cidade: string | null; estado: string | null; cep: number | null
}

const EMPTY: Omit<Conta, 'id'> = {
  nome_empresa: '', cnpj: null, agencia: null, digito_agencia: null,
  conta_corrente: null, digito_conta: null, rua_av: '', numero_local: null,
  complemento: '', cidade: '', estado: '', cep: null,
}

const ESTADOS = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO']

export default function ContasRecebimentoPage() {
  const [contas, setContas] = useState<Conta[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState<{ open: boolean; data: Partial<Conta> & { id?: number } }>({ open: false, data: EMPTY })
  const [saving, setSaving] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Conta | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase.from('conta_pagador').select('*').order('nome_empresa')
    setContas(data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const openNew = () => setModal({ open: true, data: { ...EMPTY } })
  const openEdit = (c: Conta) => setModal({ open: true, data: { ...c } })
  const closeModal = () => { setModal({ open: false, data: EMPTY }); setError('') }

  const setStr = (field: keyof Conta) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setModal(m => ({ ...m, data: { ...m.data, [field]: e.target.value } }))
  const setNum = (field: keyof Conta) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setModal(m => ({ ...m, data: { ...m.data, [field]: e.target.value === '' ? null : Number(e.target.value) } }))

  const validateCnpj = (v: number | null) => {
    if (!v) return true
    return String(v).replace(/\D/g, '').length <= 14
  }

  const handleSave = async () => {
    const { id, ...fields } = modal.data
    if (!fields.nome_empresa?.trim()) { setError('Nome da empresa é obrigatório'); return }
    if (fields.cnpj && String(fields.cnpj).padStart(14, '0').length > 14) { setError('CNPJ inválido'); return }
    setSaving(true); setError('')
    const { error: err } = id
      ? await supabase.from('conta_pagador').update(fields).eq('id', id)
      : await supabase.from('conta_pagador').insert(fields)
    setSaving(false)
    if (err) { setError(err.message); return }
    closeModal(); load()
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    await supabase.from('conta_pagador').delete().eq('id', deleteTarget.id)
    setDeleting(false); setDeleteTarget(null); load()
  }

  const formatCnpj = (v: number | null) =>
    v ? String(v).padStart(14, '0').replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5') : '-'

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">Contas de Recebimento</h1>
          <p className="page-subtitle">Contas bancárias utilizadas nos recebimentos</p>
        </div>
        <button onClick={openNew} className="btn-primary"><Plus size={16} /> Nova Conta</button>
      </div>

      <div className="card">
        {loading ? (
          <div className="text-center py-12 text-slate-400">Carregando...</div>
        ) : contas.length === 0 ? (
          <div className="text-center py-12 text-slate-400">Nenhuma conta cadastrada.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="table-header">
                <tr>
                  <th className="table-cell text-left">Empresa</th>
                  <th className="table-cell text-left">CNPJ</th>
                  <th className="table-cell text-left">Ag / Conta</th>
                  <th className="table-cell text-left">Cidade/UF</th>
                  <th className="table-cell text-center">Ações</th>
                </tr>
              </thead>
              <tbody>
                {contas.map(c => (
                  <tr key={c.id} className="table-row">
                    <td className="table-cell font-medium">{c.nome_empresa || '-'}</td>
                    <td className="table-cell text-xs">{formatCnpj(c.cnpj)}</td>
                    <td className="table-cell text-xs">
                      {c.agencia ? `Ag ${c.agencia}${c.digito_agencia != null ? '-' + c.digito_agencia : ''} / CC ${c.conta_corrente ?? ''}${c.digito_conta != null ? '-' + c.digito_conta : ''}` : '-'}
                    </td>
                    <td className="table-cell">{[c.cidade, c.estado].filter(Boolean).join('/') || '-'}</td>
                    <td className="table-cell text-center">
                      <div className="flex items-center justify-center gap-2">
                        <button onClick={() => openEdit(c)} className="p-1.5 rounded hover:bg-slate-100 text-slate-600"><Pencil size={15} /></button>
                        <button onClick={() => setDeleteTarget(c)} className="p-1.5 rounded hover:bg-red-50 text-red-500"><Trash2 size={15} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal open={modal.open} onClose={closeModal} title={modal.data.id ? 'Editar Conta' : 'Nova Conta'} size="lg">
        {error && <p className="text-sm text-red-600 mb-3">{error}</p>}
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label className="label">Nome da Empresa *</label>
            <input className="input" value={modal.data.nome_empresa ?? ''} onChange={setStr('nome_empresa')} maxLength={30} />
          </div>
          <div>
            <label className="label">CNPJ (somente números)</label>
            <input className="input" type="number" value={modal.data.cnpj ?? ''} onChange={setNum('cnpj')} />
          </div>
          <div />
          <div>
            <label className="label">Agência</label>
            <input className="input" type="number" value={modal.data.agencia ?? ''} onChange={setNum('agencia')} />
          </div>
          <div>
            <label className="label">Dígito Agência</label>
            <input className="input" type="number" value={modal.data.digito_agencia ?? ''} onChange={setNum('digito_agencia')} />
          </div>
          <div>
            <label className="label">Conta Corrente</label>
            <input className="input" type="number" value={modal.data.conta_corrente ?? ''} onChange={setNum('conta_corrente')} />
          </div>
          <div>
            <label className="label">Dígito Conta</label>
            <input className="input" type="number" value={modal.data.digito_conta ?? ''} onChange={setNum('digito_conta')} />
          </div>
          <div className="col-span-2">
            <label className="label">Rua/Avenida</label>
            <input className="input" value={modal.data.rua_av ?? ''} onChange={setStr('rua_av')} />
          </div>
          <div>
            <label className="label">Número</label>
            <input className="input" type="number" value={modal.data.numero_local ?? ''} onChange={setNum('numero_local')} />
          </div>
          <div>
            <label className="label">Complemento</label>
            <input className="input" value={modal.data.complemento ?? ''} onChange={setStr('complemento')} />
          </div>
          <div>
            <label className="label">Cidade</label>
            <input className="input" value={modal.data.cidade ?? ''} onChange={setStr('cidade')} />
          </div>
          <div>
            <label className="label">Estado</label>
            <select className="input" value={modal.data.estado ?? ''} onChange={setStr('estado')}>
              <option value="">Selecionar...</option>
              {ESTADOS.map(uf => <option key={uf} value={uf}>{uf}</option>)}
            </select>
          </div>
          <div>
            <label className="label">CEP (somente números)</label>
            <input className="input" type="number" value={modal.data.cep ?? ''} onChange={setNum('cep')} />
          </div>
        </div>
        <div className="flex justify-end gap-3 mt-6">
          <button onClick={closeModal} className="btn-secondary" disabled={saving}>Cancelar</button>
          <button onClick={handleSave} className="btn-primary" disabled={saving}>
            {saving ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </Modal>

      <Confirm
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Excluir Conta"
        message={`Excluir a conta de "${deleteTarget?.nome_empresa}"? Esta ação não pode ser desfeita.`}
        confirmLabel="Excluir"
        loading={deleting}
      />
    </div>
  )
}
