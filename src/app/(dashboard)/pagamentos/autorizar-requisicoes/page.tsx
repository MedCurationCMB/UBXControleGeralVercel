'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabaseBrowser as supabase } from '@/lib/supabase/client'
import { CheckCircle, XCircle, RefreshCw, Search } from 'lucide-react'
import Confirm from '@/components/ui/Confirm'

interface Requisicao {
  id: number; empresa: string; categoria: string; descricao: string
  data_solicitacao: string
}

const fmtData = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString('pt-BR')

export default function AutorizarRequisicoesPage() {
  const [requisicoes, setRequisicoes] = useState<Requisicao[]>([])
  const [loading, setLoading] = useState(true)
  const [user, setUser] = useState<{ username: string } | null>(null)

  const [searchId, setSearchId] = useState('')
  const [filtroEmpresa, setFiltroEmpresa] = useState('')

  const [confirm, setConfirm] = useState<{
    open: boolean; id: number | null; acao: 'Autorizado' | 'Não Autorizado'
  }>({ open: false, id: null, acao: 'Autorizado' })
  const [processing, setProcessing] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const [{ data: reqs }, u] = await Promise.all([
      supabase
        .from('requisicoes')
        .select('id, empresa, categoria, descricao, data_solicitacao')
        .eq('status', 'Aguardando Autorização')
        .order('id', { ascending: true }),
      fetch('/api/auth/me').then(r => r.json()),
    ])
    setRequisicoes(reqs ?? [])
    setUser(u)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const empresas = useMemo(() => [...new Set(requisicoes.map(r => r.empresa))].sort(), [requisicoes])

  const filtered = useMemo(() => {
    const id = searchId.trim()
    if (id) return requisicoes.filter(r => String(r.id) === id)
    return requisicoes.filter(r => !filtroEmpresa || r.empresa === filtroEmpresa)
  }, [requisicoes, searchId, filtroEmpresa])

  const handleAcao = async () => {
    if (confirm.id === null) return
    setProcessing(true)
    const hoje = new Date().toISOString().split('T')[0]

    await supabase.from('requisicoes').update({
      status: confirm.acao,
      data_autorizacao: hoje,
      usuario_autorizador: user?.username ?? '',
    }).eq('id', confirm.id)

    setProcessing(false)
    setConfirm({ open: false, id: null, acao: 'Autorizado' })
    load()
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">Autorizar Requisições</h1>
          <p className="page-subtitle">Requisições aguardando autorização</p>
        </div>
        <button onClick={load} className="btn-secondary p-2" title="Atualizar">
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      <div className="card">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input className="input pl-9" type="number" min="0" placeholder="Buscar por ID..."
              value={searchId} onChange={e => setSearchId(e.target.value)} />
          </div>
          <select className="input" value={filtroEmpresa} onChange={e => setFiltroEmpresa(e.target.value)}>
            <option value="">Todas as empresas</option>
            {empresas.map(e => <option key={e} value={e}>{e}</option>)}
          </select>
        </div>
      </div>

      <div className="card">
        {loading ? (
          <p className="text-slate-400 text-sm text-center py-6">Carregando...</p>
        ) : filtered.length === 0 ? (
          <p className="text-slate-400 text-sm text-center py-6">Nenhuma requisição aguardando autorização.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="table-header">
                <tr>
                  <th className="table-cell text-left">#</th>
                  <th className="table-cell text-left">Empresa</th>
                  <th className="table-cell text-left">Categoria</th>
                  <th className="table-cell text-left">Descrição</th>
                  <th className="table-cell text-left">Data</th>
                  <th className="table-cell text-center w-32">Ações</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(r => (
                  <tr key={r.id} className="table-row">
                    <td className="table-cell">#{r.id}</td>
                    <td className="table-cell">{r.empresa}</td>
                    <td className="table-cell">{r.categoria}</td>
                    <td className="table-cell max-w-sm">{r.descricao}</td>
                    <td className="table-cell">{fmtData(r.data_solicitacao)}</td>
                    <td className="table-cell text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          onClick={() => setConfirm({ open: true, id: r.id, acao: 'Autorizado' })}
                          className="p-1.5 rounded hover:bg-green-50 text-green-600" title="Autorizar"
                        >
                          <CheckCircle size={17} />
                        </button>
                        <button
                          onClick={() => setConfirm({ open: true, id: r.id, acao: 'Não Autorizado' })}
                          className="p-1.5 rounded hover:bg-red-50 text-red-500" title="Rejeitar"
                        >
                          <XCircle size={17} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Confirm
        open={confirm.open}
        onClose={() => setConfirm({ open: false, id: null, acao: 'Autorizado' })}
        onConfirm={handleAcao}
        title={confirm.acao === 'Autorizado' ? 'Autorizar Requisição' : 'Rejeitar Requisição'}
        message={`Confirma ${confirm.acao === 'Autorizado' ? 'a autorização' : 'a rejeição'} da requisição #${confirm.id}?`}
        confirmLabel={confirm.acao === 'Autorizado' ? 'Autorizar' : 'Rejeitar'}
        loading={processing}
      />
    </div>
  )
}
