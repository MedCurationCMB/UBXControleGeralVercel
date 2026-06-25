'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { supabaseBrowser as supabase } from '@/lib/supabase/client'
import {
  Upload, X, CheckCircle, Zap, Trash2, Plus,
  Download, FileSpreadsheet, Info,
} from 'lucide-react'

const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]
const ANOS = Array.from({ length: 21 }, (_, i) => 2025 + i)
const fmtMoeda = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

interface MesSelecionado {
  mes: number
  mesNome: string
  ano: number
  valorReferente: number
}

interface SaldoMes {
  mesLabel: string
  saldo: number
}

// ---- Bulk Import Modal ----
function ImportModal({ onClose }: { onClose: () => void }) {
  const [file, setFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<{ count: number } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const downloadTemplate = async () => {
    const res = await fetch('/api/pedidos/template-importacao')
    if (!res.ok) return
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'template_pedidos.xlsx'
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleImport = async () => {
    if (!file) return
    setLoading(true)
    setError('')
    const formData = new FormData()
    formData.append('file', file)
    const res = await fetch('/api/pedidos/importar-lote', { method: 'POST', body: formData })
    const data = await res.json()
    setLoading(false)
    if (!res.ok) { setError(data.error ?? 'Erro ao importar'); return }
    setResult({ count: data.count })
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-lg w-full p-6 space-y-5">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">Importação em Lote de Pedidos</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X size={20} />
          </button>
        </div>

        {result ? (
          <div className="text-center space-y-4 py-4">
            <CheckCircle size={48} className="mx-auto text-green-500" />
            <p className="text-green-700 font-medium text-lg">
              {result.count} pedido(s) importados com sucesso!
            </p>
            <button onClick={onClose} className="btn-primary">Fechar</button>
          </div>
        ) : (
          <>
            <button onClick={downloadTemplate} className="btn-secondary gap-2 w-full justify-center">
              <Download size={16} /> Baixar Template (.xlsx)
            </button>

            <div
              className="border-2 border-dashed border-slate-300 rounded-lg p-6 text-center cursor-pointer hover:border-blue-400 transition-colors"
              onClick={() => fileRef.current?.click()}
            >
              {file ? (
                <div className="flex items-center justify-center gap-2">
                  <FileSpreadsheet size={18} className="text-green-600" />
                  <p className="text-sm text-slate-700">{file.name}</p>
                  <button
                    type="button"
                    onClick={e => { e.stopPropagation(); setFile(null) }}
                    className="text-slate-400 hover:text-red-500"
                  >
                    <X size={14} />
                  </button>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2 text-slate-400">
                  <Upload size={22} />
                  <p className="text-sm">Selecione o arquivo Excel (.xlsx)</p>
                </div>
              )}
            </div>
            <input
              type="file" ref={fileRef} className="hidden" accept=".xlsx"
              onChange={e => { const f = e.target.files?.[0]; if (f) setFile(f) }}
            />

            {error && <p className="text-sm text-red-600">{error}</p>}

            <div className="flex gap-3">
              <button onClick={onClose} className="btn-secondary flex-1">Cancelar</button>
              <button
                onClick={handleImport}
                disabled={!file || loading}
                className="btn-primary flex-1 justify-center"
              >
                {loading ? 'Importando...' : 'Confirmar Importação'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ---- Main Page ----
export default function SolicitarPage() {
  // Step 1 form
  const [empresa, setEmpresa] = useState('')
  const [categoria, setCategoria] = useState('')
  const [fornecedor, setFornecedor] = useState('')
  const [observacao, setObservacao] = useState('')
  const [emergencial, setEmergencial] = useState(false)
  const [files, setFiles] = useState<File[]>([])

  // Reference data
  const [empresas, setEmpresas] = useState<string[]>([])
  const [categoriasPorEmpresa, setCategoriasPorEmpresa] = useState<Record<string, string[]>>({})
  const [fornecedores, setFornecedores] = useState<string[]>([])
  const [tipoDocSolicitacao, setTipoDocSolicitacao] = useState<number | null>(null)

  // Step management
  const [step, setStep] = useState<'form' | 'meses'>('form')
  const [pedidoId, setPedidoId] = useState<number | null>(null)

  // Step 2
  const [saldos, setSaldos] = useState<SaldoMes[]>([])
  const [addMes, setAddMes] = useState('')
  const [addAno, setAddAno] = useState('')
  const [addValor, setAddValor] = useState('')
  const [mesesSelecionados, setMesesSelecionados] = useState<MesSelecionado[]>([])

  // UI state
  const [saving, setSaving] = useState(false)
  const [addingMes, setAddingMes] = useState(false)
  const [error, setError] = useState('')
  const [successInfo, setSuccessInfo] = useState<{ empresa: string; categoria: string; fornecedor: string; total: number } | null>(null)
  const [showImport, setShowImport] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  // Load reference data from orcamentos_usuarios
  useEffect(() => {
    Promise.all([
      supabase.from('orcamentos_usuarios').select('empresa, categoria'),
      supabase.from('fornecedores').select('nome').order('nome'),
      supabase.from('tipos_documento').select('id').eq('tipo', 'Documentos da Solicitação').maybeSingle(),
    ]).then(([{ data: oc }, { data: forns }, { data: tipoDoc }]) => {
      const emps = [...new Set((oc ?? []).map(r => r.empresa).filter(Boolean))].sort() as string[]
      const catMap: Record<string, string[]> = {}
      for (const row of (oc ?? [])) {
        if (row.empresa && row.categoria) {
          if (!catMap[row.empresa]) catMap[row.empresa] = []
          if (!catMap[row.empresa].includes(row.categoria)) catMap[row.empresa].push(row.categoria)
        }
      }
      for (const k in catMap) catMap[k] = catMap[k].sort()
      setEmpresas(emps)
      setCategoriasPorEmpresa(catMap)
      setFornecedores((forns ?? []).map(f => f.nome))
      if (tipoDoc) setTipoDocSolicitacao(tipoDoc.id)
    })
  }, [])

  const loadSaldos = useCallback(async (emp: string, cat: string) => {
    const { data } = await supabase
      .from('controle_orcamento')
      .select('mes, ano, valor_orcamento, valor_pedidos_solicitados')
      .eq('empresa', emp)
      .eq('categoria', cat)
      .order('ano')
      .order('mes')
    setSaldos((data ?? []).map(r => ({
      mesLabel: `${MESES[r.mes - 1]}/${r.ano}`,
      saldo: r.valor_orcamento - r.valor_pedidos_solicitados,
    })))
  }, [])

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files ?? [])
    setError('')
    if (selected.length > 4) { setError('Máximo de 4 arquivos permitidos.'); return }
    for (const f of selected) {
      if (f.size > 5 * 1024 * 1024) { setError(`Arquivo ${f.name} excede 5MB.`); return }
      if (f.type !== 'application/pdf') { setError(`Arquivo ${f.name} deve ser PDF.`); return }
    }
    setFiles(selected)
  }

  // Step 1: create pedido, upload PDFs, advance to step 2
  const handleInitialSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!empresa) { setError('Selecione a empresa'); return }
    if (!categoria) { setError('Selecione a categoria'); return }
    if (!fornecedor) { setError('Selecione o fornecedor'); return }

    setSaving(true)

    const { data: pedido, error: errPedido } = await supabase
      .from('pedidos_solicitados')
      .insert({
        empresa, categoria, fornecedor,
        observacao: observacao || null,
        emergencia: emergencial,
        valor_pedido: 0,
        data_solicitacao: new Date().toISOString().split('T')[0],
        arquivo_texto: [],
        arquivos_pdf_ids: [],
        status: 'Aguardando Autorização',
      })
      .select('id')
      .single()

    if (errPedido || !pedido) {
      setSaving(false)
      setError(errPedido?.message ?? 'Erro ao criar pedido')
      return
    }

    if (files.length > 0) {
      for (const f of files) {
        const formData = new FormData()
        formData.append('file', f)
        formData.append('pedido_id', String(pedido.id))
        formData.append('tipo_documento', String(tipoDocSolicitacao ?? ''))
        formData.append('analisar', 'true')
        await fetch('/api/documentos/upload', { method: 'POST', body: formData }).catch(() => {})
      }
      if (tipoDocSolicitacao) {
        await supabase
          .from('pedidos_solicitados')
          .update({ tipo_documento: tipoDocSolicitacao })
          .eq('id', pedido.id)
      }
    }

    setPedidoId(pedido.id)
    await loadSaldos(empresa, categoria)
    setSaving(false)
    setStep('meses')
  }

  // Step 2: add month/value entry
  const handleAddMes = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!addMes || !addAno || !addValor) return

    const mesNum = MESES.indexOf(addMes) + 1
    const anoNum = parseInt(addAno)
    const valor = parseFloat(addValor.replace(',', '.'))

    if (isNaN(valor) || valor <= 0) { setError('Informe um valor válido.'); return }

    if (mesesSelecionados.some(m => m.mes === mesNum && m.ano === anoNum)) {
      setError(`Período ${addMes}/${addAno} já adicionado.`); return
    }

    setAddingMes(true)
    const { data: saldoData } = await supabase
      .from('controle_orcamento')
      .select('valor_orcamento, valor_pedidos_solicitados')
      .eq('empresa', empresa)
      .eq('categoria', categoria)
      .eq('mes', mesNum)
      .eq('ano', anoNum)
      .maybeSingle()

    setAddingMes(false)

    if (!saldoData) {
      setError(`Não existe orçamento para ${addMes}/${addAno}.`); return
    }

    const saldoAtual = saldoData.valor_orcamento - saldoData.valor_pedidos_solicitados
    if (valor > saldoAtual) {
      setError(`Valor ${fmtMoeda(valor)} excede o saldo disponível de ${fmtMoeda(saldoAtual)} para ${addMes}/${addAno}.`)
      return
    }

    setError('')
    setMesesSelecionados(prev => [
      ...prev,
      { mes: mesNum, mesNome: addMes, ano: anoNum, valorReferente: valor },
    ])
    setAddMes('')
    setAddAno('')
    setAddValor('')
  }

  // Step 2: finalize — update valor_pedido + insert fluxo entries
  const handleEnviarSolicitacao = async () => {
    if (!mesesSelecionados.length) { setError('Adicione pelo menos um período antes de enviar.'); return }
    if (!pedidoId) return

    setSaving(true)
    const valorTotal = mesesSelecionados.reduce((s, m) => s + m.valorReferente, 0)

    await supabase
      .from('pedidos_solicitados')
      .update({ valor_pedido: valorTotal })
      .eq('id', pedidoId)

    await supabase.from('pedidos_solicitados_fluxo').insert(
      mesesSelecionados.map(m => ({
        pedido_id: pedidoId,
        empresa, categoria, fornecedor,
        mes: m.mes, ano: m.ano,
        valor_referente: m.valorReferente,
      }))
    )

    const summary = { empresa, categoria, fornecedor, total: valorTotal }

    // Reset state
    setSaving(false)
    setStep('form')
    setPedidoId(null)
    setEmpresa('')
    setCategoria('')
    setFornecedor('')
    setObservacao('')
    setEmergencial(false)
    setFiles([])
    setMesesSelecionados([])
    setSaldos([])
    setAddMes('')
    setAddAno('')
    setAddValor('')
    setError('')
    if (fileRef.current) fileRef.current.value = ''

    setSuccessInfo(summary)
    setTimeout(() => setSuccessInfo(null), 8000)
  }

  const categorias = categoriasPorEmpresa[empresa] ?? []
  const valorTotal = mesesSelecionados.reduce((s, m) => s + m.valorReferente, 0)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title">Solicitar Pedido</h1>
        <p className="page-subtitle">Registrar uma nova solicitação de pagamento</p>
      </div>

      {successInfo && (
        <div className="flex items-start gap-3 p-4 bg-green-50 border border-green-200 rounded-lg text-green-800">
          <CheckCircle size={20} className="mt-0.5 shrink-0" />
          <div className="text-sm">
            <p className="font-semibold">Solicitação enviada com sucesso!</p>
            <p>{successInfo.empresa} · {successInfo.categoria} · {successInfo.fornecedor} · Total: {fmtMoeda(successInfo.total)}</p>
          </div>
        </div>
      )}

      {/* ---- STEP 1: Initial form ---- */}
      {step === 'form' && (
        <form onSubmit={handleInitialSubmit} className="card space-y-5">
          <div className="flex items-start gap-2 p-3 bg-blue-50 border border-blue-200 rounded-md">
            <Info size={15} className="text-blue-600 mt-0.5 shrink-0" />
            <p className="text-sm text-blue-700">
              Se a empresa ou categoria não aparecer nas opções abaixo, é porque não existe orçamento cadastrado para ela.
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
          </div>

          <div>
            <label className="label">Descrição da Compra/Contratação</label>
            <textarea
              className="input min-h-[80px] resize-y"
              placeholder="Descreva detalhes da compra ou contratação..."
              value={observacao}
              onChange={e => setObservacao(e.target.value)}
            />
          </div>

          <div className="flex items-center gap-3">
            <input
              type="checkbox" id="emergencia" className="w-4 h-4 accent-orange-500"
              checked={emergencial} onChange={e => setEmergencial(e.target.checked)}
            />
            <label htmlFor="emergencia" className="flex items-center gap-2 text-sm font-medium text-slate-700 cursor-pointer">
              <Zap size={15} className="text-orange-500" /> Emergencial
            </label>
          </div>

          <div>
            <label className="label">Anexar PDFs (Máximo 4 arquivos, 5MB cada)</label>
            <div
              className="border-2 border-dashed border-slate-300 rounded-lg p-6 text-center hover:border-blue-400 transition-colors cursor-pointer"
              onClick={() => fileRef.current?.click()}
            >
              {files.length > 0 ? (
                <div className="space-y-1">
                  {files.map((f, i) => (
                    <p key={i} className="text-sm text-slate-700">{f.name}</p>
                  ))}
                  <p className="text-xs text-slate-400 mt-2">
                    {files.length} arquivo(s) selecionado(s) · Clique para alterar
                  </p>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2 text-slate-400">
                  <Upload size={24} />
                  <p className="text-sm">Clique para enviar PDFs (opcional)</p>
                  <p className="text-xs">Até 4 arquivos, 5MB cada</p>
                </div>
              )}
            </div>
            <input
              type="file" ref={fileRef} className="hidden" multiple accept=".pdf"
              onChange={handleFileChange}
            />
          </div>

          <div className="flex justify-end">
            <button type="submit" className="btn-primary px-8" disabled={saving}>
              {saving ? 'Salvando...' : 'Adicionar Fluxo de Pagamento'}
            </button>
          </div>
        </form>
      )}

      {/* ---- STEP 2: Add months ---- */}
      {step === 'meses' && (
        <div className="space-y-5">
          <div className="flex items-start gap-3 p-4 bg-green-50 border border-green-200 rounded-lg text-green-700">
            <CheckCircle size={18} className="mt-0.5 shrink-0" />
            <div className="text-sm">
              <p className="font-semibold">Solicitação iniciada! Por favor, adicione os valores para cada período.</p>
              <p className="text-green-600 mt-0.5">
                Pedido #{pedidoId} · {empresa} / {categoria} / {fornecedor}
              </p>
            </div>
          </div>

          {/* Saldos disponíveis */}
          {saldos.length > 0 && (
            <div className="card">
              <h2 className="text-sm font-semibold text-slate-900 mb-3">Saldos Disponíveis</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="table-header">
                      <th className="table-cell font-medium text-left">Período</th>
                      <th className="table-cell font-medium text-right">Saldo Disponível</th>
                    </tr>
                  </thead>
                  <tbody>
                    {saldos.map(s => (
                      <tr key={s.mesLabel} className="table-row">
                        <td className="table-cell">{s.mesLabel}</td>
                        <td className={`table-cell text-right font-medium ${s.saldo < 0 ? 'text-red-600' : 'text-green-700'}`}>
                          {fmtMoeda(s.saldo)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Add month form */}
          <div className="card">
            <h2 className="text-sm font-semibold text-slate-900 mb-4">Adicionar Valor</h2>
            {error && <p className="text-sm text-red-600 mb-3">{error}</p>}
            <form onSubmit={handleAddMes}>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
                <div>
                  <label className="label">Mês</label>
                  <select className="input" value={addMes} onChange={e => setAddMes(e.target.value)}>
                    <option value="">Selecionar...</option>
                    {MESES.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">Ano</label>
                  <select className="input" value={addAno} onChange={e => setAddAno(e.target.value)}>
                    <option value="">Selecionar...</option>
                    {ANOS.map(a => <option key={a} value={a}>{a}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">Valor Referente (R$)</label>
                  <input
                    className="input" type="number" min="0.01" step="0.01" placeholder="0.00"
                    value={addValor} onChange={e => setAddValor(e.target.value)}
                  />
                </div>
              </div>
              <button
                type="submit"
                className="btn-secondary w-full justify-center gap-2"
                disabled={addingMes}
              >
                <Plus size={16} />
                {addingMes ? 'Verificando saldo...' : 'Adicionar Valor'}
              </button>
            </form>
          </div>

          {/* Added months list */}
          {mesesSelecionados.length > 0 && (
            <div className="card">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-slate-900">Valores Adicionados</h2>
                <span className="text-sm font-semibold text-slate-700">
                  Total Alocado: {fmtMoeda(valorTotal)}
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="table-header">
                      <th className="table-cell font-medium">#</th>
                      <th className="table-cell font-medium">Período</th>
                      <th className="table-cell font-medium text-right">Valor</th>
                      <th className="table-cell w-10"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {mesesSelecionados.map((m, i) => (
                      <tr key={i} className="table-row">
                        <td className="table-cell text-slate-500">{i + 1}</td>
                        <td className="table-cell">{m.mesNome}/{m.ano}</td>
                        <td className="table-cell text-right font-medium">{fmtMoeda(m.valorReferente)}</td>
                        <td className="table-cell">
                          <button
                            onClick={() => setMesesSelecionados(prev => prev.filter((_, j) => j !== i))}
                            className="text-slate-400 hover:text-red-500 p-1"
                            title="Remover"
                          >
                            <Trash2 size={14} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <button
            onClick={handleEnviarSolicitacao}
            disabled={saving || mesesSelecionados.length === 0}
            className="btn-primary w-full justify-center py-3"
          >
            {saving ? 'Enviando...' : 'Enviar Solicitação'}
          </button>
        </div>
      )}

      <hr className="border-slate-200" />

      <div>
        <button onClick={() => setShowImport(true)} className="btn-primary gap-2">
          <FileSpreadsheet size={16} /> Importar Pedidos em Lote
        </button>
      </div>

      {showImport && <ImportModal onClose={() => setShowImport(false)} />}
    </div>
  )
}
