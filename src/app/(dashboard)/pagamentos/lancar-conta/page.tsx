'use client'

import { useState, useEffect } from 'react'
import { supabaseBrowser as supabase } from '@/lib/supabase/client'
import { CheckCircle, Info } from 'lucide-react'

const fmtMoeda = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

interface TipoPagamento { id: number; tipos: string }

export default function LancarContaPage() {
  const [fluxoAtivo, setFluxoAtivo] = useState<boolean | null>(null)
  const [username, setUsername] = useState('')

  const [empresas, setEmpresas] = useState<string[]>([])
  const [categoriasPorEmpresa, setCategoriasPorEmpresa] = useState<Record<string, string[]>>({})
  const [fornecedores, setFornecedores] = useState<string[]>([])
  const [tiposPagamento, setTiposPagamento] = useState<TipoPagamento[]>([])

  const [empresa, setEmpresa] = useState('')
  const [categoria, setCategoria] = useState('')
  const [fornecedor, setFornecedor] = useState('')
  const [observacao, setObservacao] = useState('')
  const [valor, setValor] = useState('')
  const [vencimento, setVencimento] = useState(new Date().toISOString().split('T')[0])
  const [tipoPagamento, setTipoPagamento] = useState<number | ''>('')

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [successInfo, setSuccessInfo] = useState<{ empresa: string; categoria: string; fornecedor: string; valor: number } | null>(null)

  useEffect(() => {
    Promise.all([
      supabase.from('config').select('valor').eq('chave', 'fluxo_sistema').maybeSingle(),
      supabase.from('categorias').select('empresa, categoria').order('empresa').order('categoria'),
      supabase.from('fornecedores').select('nome').order('nome'),
      supabase.from('tipos_pagamento').select('id, tipos').order('id'),
      fetch('/api/auth/me').then(r => r.json()),
    ]).then(([{ data: cfg }, { data: cats }, { data: forns }, { data: tipos }, u]) => {
      setFluxoAtivo(cfg?.valor === '3')
      const emps = [...new Set((cats ?? []).map(r => r.empresa).filter(Boolean))].sort() as string[]
      const catMap: Record<string, string[]> = {}
      for (const row of (cats ?? [])) {
        if (row.empresa && row.categoria) {
          if (!catMap[row.empresa]) catMap[row.empresa] = []
          if (!catMap[row.empresa].includes(row.categoria)) catMap[row.empresa].push(row.categoria)
        }
      }
      setEmpresas(emps)
      setCategoriasPorEmpresa(catMap)
      setFornecedores((forns ?? []).map(f => f.nome))
      setTiposPagamento(tipos ?? [])
      setUsername(u?.username ?? '')
    })
  }, [])

  const categorias = categoriasPorEmpresa[empresa] ?? []

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!empresa) { setError('Selecione a empresa'); return }
    if (!categoria) { setError('Selecione a categoria'); return }
    if (!fornecedor) { setError('Selecione o fornecedor'); return }
    const valorNum = parseFloat(valor.replace(',', '.'))
    if (isNaN(valorNum) || valorNum <= 0) { setError('Informe um valor válido.'); return }
    if (tipoPagamento === '') { setError('Selecione o tipo de pagamento.'); return }

    setSaving(true)
    const hoje = new Date().toISOString().split('T')[0]

    const { data: pedido, error: errPedido } = await supabase
      .from('pedidos_solicitados')
      .insert({
        empresa, categoria, fornecedor,
        observacao: observacao || null,
        valor_pedido: valorNum,
        status: 'Autorizado',
        data_solicitacao: hoje,
        data_autorizacao: hoje,
        usuario_autorizador: username,
      })
      .select('id')
      .single()

    if (errPedido || !pedido) {
      setSaving(false)
      setError(errPedido?.message ?? 'Erro ao criar pedido')
      return
    }

    const { error: errConta } = await supabase.from('controle_pagamentos').insert({
      pedido_id: pedido.id,
      data_vencimento: vencimento || null,
      valor_pagar: valorNum,
      tipo_pagamento: tipoPagamento,
      status_pagamento: 1,
    })

    if (errConta) {
      setSaving(false)
      setError(errConta.message)
      return
    }

    setSuccessInfo({ empresa, categoria, fornecedor, valor: valorNum })
    setEmpresa('')
    setCategoria('')
    setFornecedor('')
    setObservacao('')
    setValor('')
    setVencimento(new Date().toISOString().split('T')[0])
    setTipoPagamento('')
    setSaving(false)
    setTimeout(() => setSuccessInfo(null), 8000)
  }

  if (fluxoAtivo === null) {
    return <p className="text-slate-400 text-sm">Carregando...</p>
  }

  if (!fluxoAtivo) {
    return (
      <div className="card flex items-start gap-2 p-4 bg-amber-50 border border-amber-200 text-amber-800">
        <Info size={16} className="mt-0.5 shrink-0" />
        <p className="text-sm">
          Esta tela só está disponível quando o Fluxo 3 está ativo. Ative-o em Painel Administrativo → Configurações.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title">Lançar Conta a Pagar</h1>
        <p className="page-subtitle">O pedido e a conta a pagar são criados juntos, já autorizados</p>
      </div>

      {successInfo && (
        <div className="flex items-start gap-3 p-4 bg-green-50 border border-green-200 rounded-lg text-green-800">
          <CheckCircle size={20} className="mt-0.5 shrink-0" />
          <div className="text-sm">
            <p className="font-semibold">Conta a pagar lançada com sucesso!</p>
            <p>{successInfo.empresa} · {successInfo.categoria} · {successInfo.fornecedor} · {fmtMoeda(successInfo.valor)}</p>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="card space-y-5">
        <div className="flex items-start gap-2 p-3 bg-blue-50 border border-blue-200 rounded-md">
          <Info size={15} className="text-blue-600 mt-0.5 shrink-0" />
          <p className="text-sm text-blue-700">
            Este lançamento não passa por autorização nem verifica saldo de orçamento.
          </p>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div>
            <label className="label">Empresa *</label>
            <select
              className="input" value={empresa}
              onChange={e => { setEmpresa(e.target.value); setCategoria('') }}
            >
              <option value="">Selecionar...</option>
              {empresas.map(e => <option key={e} value={e}>{e}</option>)}
            </select>
          </div>

          <div>
            <label className="label">Categoria *</label>
            <select
              className="input" value={categoria}
              onChange={e => setCategoria(e.target.value)}
              disabled={!empresa}
            >
              <option value="">Selecionar...</option>
              {categorias.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          <div className="md:col-span-2">
            <label className="label">Fornecedor *</label>
            <select
              className="input" value={fornecedor}
              onChange={e => setFornecedor(e.target.value)}
            >
              <option value="">Selecionar...</option>
              {fornecedores.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
          </div>

          <div>
            <label className="label">Valor a Pagar *</label>
            <input
              className="input" type="text" placeholder="0,00"
              value={valor} onChange={e => setValor(e.target.value)}
            />
          </div>

          <div>
            <label className="label">Data de Vencimento</label>
            <input
              className="input" type="date"
              value={vencimento} onChange={e => setVencimento(e.target.value)}
            />
          </div>

          <div className="md:col-span-2">
            <label className="label">Tipo de Pagamento *</label>
            <select
              className="input" value={tipoPagamento}
              onChange={e => setTipoPagamento(e.target.value ? Number(e.target.value) : '')}
            >
              <option value="">Selecionar...</option>
              {tiposPagamento.map(t => <option key={t.id} value={t.id}>{t.tipos}</option>)}
            </select>
          </div>
        </div>

        <div>
          <label className="label">Descrição</label>
          <textarea
            className="input min-h-[80px] resize-y"
            placeholder="Descreva a compra ou contratação..."
            value={observacao}
            onChange={e => setObservacao(e.target.value)}
          />
        </div>

        <button type="submit" disabled={saving} className="btn-primary">
          {saving ? 'Lançando...' : 'Lançar Conta a Pagar'}
        </button>
      </form>
    </div>
  )
}
