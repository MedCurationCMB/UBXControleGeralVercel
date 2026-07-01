'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { supabaseBrowser as supabase } from '@/lib/supabase/client'
import { RefreshCw, Plus, X, Download, Upload, FileSpreadsheet } from 'lucide-react'

// ---- Types ----
interface OrcamentoVigente {
  id: number; empresa: string; categoria: string; mes: number; ano: number
  valor_orcamento_inicial: number; valor_orcamento_vigente: number
}
interface OrcamentoRegistrado {
  id: number; empresa: string; categoria: string; mes: number; ano: number
  valor_orcamento: number; data_criacao: string; usuario_criador: string; observacao: string | null
}

// ---- Helpers ----
const MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']
const ANOS = Array.from({ length: 26 }, (_, i) => 2025 + i)
const fmtMoeda = (v: number | null | undefined) =>
  v != null ? v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '-'
const fmtData = (d: string | null | undefined) =>
  d ? new Date(d + 'T12:00:00').toLocaleDateString('pt-BR') : '-'

// ---- Register Modal ----
function RegistrarModal({
  onClose, onSaved, username,
}: { onClose: () => void; onSaved: () => void; username: string }) {
  const [tab, setTab] = useState<'individual' | 'lote'>('individual')

  // Individual
  const [empresas, setEmpresas] = useState<string[]>([])
  const [categorias, setCategorias] = useState<string[]>([])
  const [empresa, setEmpresa] = useState('')
  const [categoria, setCategoria] = useState('')
  const [mes, setMes] = useState('')
  const [ano, setAno] = useState(String(new Date().getFullYear()))
  const [valor, setValor] = useState('')
  const [observacao, setObservacao] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [loadingCats, setLoadingCats] = useState(false)

  // Lote
  const [loteFile, setLoteFile] = useState<File | null>(null)
  const [loteLoading, setLoteLoading] = useState(false)
  const [loteError, setLoteError] = useState('')
  const [loteSuccess, setLoteSuccess] = useState('')
  const loteRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    supabase.from('categorias_receita').select('empresa').then(({ data }) => {
      if (data) setEmpresas([...new Set(data.map(r => r.empresa as string))].sort())
    })
  }, [])

  useEffect(() => {
    if (!empresa) { setCategorias([]); setCategoria(''); return }
    setLoadingCats(true)
    supabase.from('categorias_receita').select('categoria').eq('empresa', empresa).then(({ data }) => {
      setCategorias((data ?? []).map(r => r.categoria as string).sort())
      setLoadingCats(false)
    })
  }, [empresa])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!empresa || !categoria || !mes || !ano || !valor || parseFloat(valor) <= 0) {
      setError('Preencha todos os campos obrigatórios.')
      return
    }
    setSaving(true)

    const mesNum = parseInt(mes)
    const anoNum = parseInt(ano)
    const valorNum = parseFloat(valor)

    // Check existing pedidos in fluxo receita
    const { data: pedidos } = await supabase
      .from('pedidos_solicitados_fluxo_receita')
      .select('valor_referente, status')
      .eq('empresa', empresa)
      .eq('categoria', categoria)
      .eq('mes', mesNum)
      .eq('ano', anoNum)

    if (pedidos && pedidos.length > 0) {
      const validos = pedidos.filter(p =>
        p.status === 'Autorizado' || p.status === 'Aguardando Autorização'
      )
      if (validos.length > 0) {
        const soma = validos.reduce((s, p) => s + (p.valor_referente ?? 0), 0)
        if (valorNum <= soma) {
          setSaving(false)
          setError(`Já existem pedidos autorizados ou aguardando autorização nesse mês. O valor do orçamento deve ser maior que ${fmtMoeda(soma)}.`)
          return
        }
      }
    }

    const { error: errIns } = await supabase.from('registro_orcamentos_receita').insert({
      empresa,
      categoria,
      mes: mesNum,
      ano: anoNum,
      valor_orcamento: valorNum,
      data_criacao: new Date().toISOString().split('T')[0],
      usuario_criador: username,
      observacao: observacao || null,
    })

    setSaving(false)
    if (errIns) { setError(errIns.message); return }

    setSuccess('Orçamento cadastrado com sucesso!')
    setEmpresa(''); setCategoria(''); setMes(''); setValor(''); setObservacao('')
    onSaved()
  }

  const downloadTemplate = async () => {
    const res = await fetch('/api/orcamentos-receita/template')
    if (!res.ok) return
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = 'template_orcamentos_venda.xlsx'; a.click()
    URL.revokeObjectURL(url)
  }

  const handleLoteImport = async () => {
    if (!loteFile) return
    setLoteLoading(true); setLoteError(''); setLoteSuccess('')
    const fd = new FormData()
    fd.append('file', loteFile)
    const res = await fetch('/api/orcamentos-receita/importar-lote', { method: 'POST', body: fd })
    const data = await res.json()
    setLoteLoading(false)
    if (!res.ok) { setLoteError(data.error ?? 'Erro ao importar'); return }
    setLoteSuccess(`${data.count} orçamento(s) importados com sucesso!`)
    if (data.warnings?.length) setLoteError(`Avisos: ${data.warnings.join('; ')}`)
    setLoteFile(null)
    if (loteRef.current) loteRef.current.value = ''
    onSaved()
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">Registrar Orçamento de Venda</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
        </div>

        <div className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">
          Você não pode editar ou excluir um orçamento após cadastrá-lo. Caso deseje modificar, cadastre um novo para o mesmo período. O último orçamento registrado será considerado para controle dos saldos.
        </div>

        <div className="flex border-b border-slate-200">
          {(['individual', 'lote'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${tab === t
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}>
              {t === 'individual' ? 'Cadastro Individual' : 'Importar em Lote'}
            </button>
          ))}
        </div>

        {/* Tab: Individual */}
        {tab === 'individual' && (
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && <p className="text-sm text-red-600">{error}</p>}
            {success && <p className="text-sm text-green-600">{success}</p>}

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label">Empresa *</label>
                <select className="input" value={empresa}
                  onChange={e => { setEmpresa(e.target.value); setCategoria('') }}>
                  <option value="">Selecione uma empresa...</option>
                  {empresas.map(e => <option key={e} value={e}>{e}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Categoria *</label>
                <select className="input" value={categoria} onChange={e => setCategoria(e.target.value)}
                  disabled={!empresa || loadingCats}>
                  <option value="">{loadingCats ? 'Carregando...' : 'Selecione uma categoria...'}</option>
                  {categorias.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Mês *</label>
                <select className="input" value={mes} onChange={e => setMes(e.target.value)}>
                  <option value="">Selecione um mês...</option>
                  {MESES.map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Ano *</label>
                <select className="input" value={ano} onChange={e => setAno(e.target.value)}>
                  {ANOS.map(a => <option key={a} value={a}>{a}</option>)}
                </select>
              </div>
            </div>

            <div>
              <label className="label">Valor do Orçamento (R$) *</label>
              <input type="number" step="0.01" min="0.01" className="input"
                placeholder="0.00" value={valor}
                onChange={e => setValor(e.target.value)} />
            </div>

            <div>
              <label className="label">Observação</label>
              <textarea className="input resize-none" rows={3} value={observacao}
                onChange={e => setObservacao(e.target.value)}
                placeholder="Observação opcional..." />
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button type="button" onClick={onClose} className="btn-secondary">Cancelar</button>
              <button type="submit" className="btn-primary" disabled={saving}>
                {saving ? 'Cadastrando...' : 'Cadastrar Orçamento'}
              </button>
            </div>
          </form>
        )}

        {/* Tab: Lote */}
        {tab === 'lote' && (
          <div className="space-y-4">
            <div className="text-sm text-slate-600 bg-slate-50 border border-slate-200 rounded p-3 space-y-1">
              <p className="font-medium text-slate-800">Colunas obrigatórias:</p>
              <p>• <strong>Empresa</strong>, <strong>Categoria</strong>: devem existir no cadastro de receitas</p>
              <p>• <strong>Mês</strong>: número de 1 a 12</p>
              <p>• <strong>Ano</strong>: entre 2025 e 2050</p>
              <p>• <strong>Valor do Orçamento</strong>: separador decimal é ponto (10000.00)</p>
              <p>• <strong>Observação</strong>: opcional</p>
            </div>

            <button onClick={downloadTemplate} className="btn-secondary gap-2 w-full justify-center">
              <Download size={16} /> Baixar Template (.xlsx)
            </button>

            <div
              className="border-2 border-dashed border-slate-300 rounded-lg p-6 text-center cursor-pointer hover:border-blue-400 transition-colors"
              onClick={() => loteRef.current?.click()}>
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
              <button onClick={onClose} className="btn-secondary">Fechar</button>
              <button onClick={handleLoteImport} disabled={!loteFile || loteLoading} className="btn-primary">
                {loteLoading ? 'Importando...' : 'Confirmar Importação'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ---- Main Page ----
export default function OrcamentoVendasPage() {
  const [vigentes, setVigentes] = useState<OrcamentoVigente[]>([])
  const [registrados, setRegistrados] = useState<OrcamentoRegistrado[]>([])
  const [empresasAll, setEmpresasAll] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [showRegister, setShowRegister] = useState(false)
  const [username, setUsername] = useState('')

  const [filtroEmpresa, setFiltroEmpresa] = useState('')
  const [filtroCategoria, setFiltroCategoria] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const [{ data: vig }, { data: reg }, { data: cats }, u] = await Promise.all([
      supabase.from('registro_orcamento_analise_receita').select('*').order('empresa').order('categoria').order('ano').order('mes'),
      supabase.from('registro_orcamentos_receita').select('*').order('empresa').order('categoria').order('ano').order('mes'),
      supabase.from('categorias_receita').select('empresa'),
      fetch('/api/auth/me').then(r => r.json()).catch(() => ({})),
    ])
    setVigentes(vig ?? [])
    setRegistrados(reg ?? [])
    setEmpresasAll([...new Set((cats ?? []).map(r => r.empresa as string))].sort())
    if (u?.username) setUsername(u.username)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const categorias = useMemo(() => {
    const base = filtroEmpresa
      ? [...vigentes.filter(r => r.empresa === filtroEmpresa), ...registrados.filter(r => r.empresa === filtroEmpresa)]
      : [...vigentes, ...registrados]
    return [...new Set(base.map(r => r.categoria))].sort()
  }, [vigentes, registrados, filtroEmpresa])

  const filterRows = useCallback(<T extends { empresa: string; categoria: string }>(rows: T[]): T[] => {
    let list = rows
    if (filtroEmpresa) list = list.filter(r => r.empresa === filtroEmpresa)
    if (filtroCategoria) list = list.filter(r => r.categoria === filtroCategoria)
    return list
  }, [filtroEmpresa, filtroCategoria])

  const vigFiltradas = useMemo(() => filterRows(vigentes), [filterRows, vigentes])
  const regFiltrados = useMemo(() => filterRows(registrados), [filterRows, registrados])

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="page-title">Orçamento de Vendas</h1>
          <p className="page-subtitle">Consulte e registre orçamentos por empresa e categoria</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowRegister(true)} className="btn-primary gap-1.5 text-sm">
            <Plus size={15} /> Registrar Orçamento
          </button>
          <button onClick={load} className="btn-secondary p-2" title="Atualizar">
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Filtros */}
      <div className="card">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Filtrar por Empresa</label>
            <select className="input" value={filtroEmpresa}
              onChange={e => { setFiltroEmpresa(e.target.value); setFiltroCategoria('') }}>
              <option value="">Todas</option>
              {empresasAll.map(e => <option key={e} value={e}>{e}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Filtrar por Categoria</label>
            <select className="input" value={filtroCategoria}
              onChange={e => setFiltroCategoria(e.target.value)}
              disabled={!filtroEmpresa}>
              <option value="">Todas</option>
              {categorias.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* Orçamentos Vigentes */}
      <div className="space-y-2">
        <h2 className="text-base font-semibold text-slate-800">Orçamentos Vigentes</h2>
        {loading ? (
          <div className="card text-center py-10 text-slate-400">Carregando...</div>
        ) : vigFiltradas.length === 0 ? (
          <div className="card text-center py-10 text-slate-400">Nenhum orçamento vigente encontrado.</div>
        ) : (
          <div className="card p-0 overflow-hidden">
            <div className="overflow-auto max-h-60">
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-10">
                  <tr className="table-header">
                    <th className="table-cell font-medium text-left">Empresa</th>
                    <th className="table-cell font-medium text-left">Categoria</th>
                    <th className="table-cell font-medium text-center">Mês</th>
                    <th className="table-cell font-medium text-center">Ano</th>
                    <th className="table-cell font-medium text-right">Orçamento Inicial</th>
                    <th className="table-cell font-medium text-right">Orçamento Vigente</th>
                  </tr>
                </thead>
                <tbody>
                  {vigFiltradas.map(r => (
                    <tr key={r.id} className="table-row">
                      <td className="table-cell font-medium text-slate-900">{r.empresa}</td>
                      <td className="table-cell text-slate-600">{r.categoria}</td>
                      <td className="table-cell text-center">{MESES[(r.mes ?? 1) - 1]}</td>
                      <td className="table-cell text-center">{r.ano}</td>
                      <td className="table-cell text-right">{fmtMoeda(r.valor_orcamento_inicial)}</td>
                      <td className="table-cell text-right font-semibold text-slate-900">
                        {fmtMoeda(r.valor_orcamento_vigente)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Orçamentos Registrados */}
      <div className="space-y-2">
        <h2 className="text-base font-semibold text-slate-800">Orçamentos Registrados</h2>
        {loading ? (
          <div className="card text-center py-10 text-slate-400">Carregando...</div>
        ) : regFiltrados.length === 0 ? (
          <div className="card text-center py-10 text-slate-400">Nenhum orçamento registrado encontrado.</div>
        ) : (
          <div className="card p-0 overflow-hidden">
            <div className="overflow-auto max-h-60">
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-10">
                  <tr className="table-header">
                    <th className="table-cell font-medium text-left">Empresa</th>
                    <th className="table-cell font-medium text-left">Categoria</th>
                    <th className="table-cell font-medium text-center">Mês</th>
                    <th className="table-cell font-medium text-center">Ano</th>
                    <th className="table-cell font-medium text-right">Valor</th>
                    <th className="table-cell font-medium text-center">Data Criação</th>
                    <th className="table-cell font-medium text-left">Usuário</th>
                    <th className="table-cell font-medium text-left">Observação</th>
                  </tr>
                </thead>
                <tbody>
                  {regFiltrados.map(r => (
                    <tr key={r.id} className="table-row">
                      <td className="table-cell font-medium text-slate-900">{r.empresa}</td>
                      <td className="table-cell text-slate-600">{r.categoria}</td>
                      <td className="table-cell text-center">{MESES[(r.mes ?? 1) - 1]}</td>
                      <td className="table-cell text-center">{r.ano}</td>
                      <td className="table-cell text-right font-medium">{fmtMoeda(r.valor_orcamento)}</td>
                      <td className="table-cell text-center text-slate-500">{fmtData(r.data_criacao)}</td>
                      <td className="table-cell text-slate-500">{r.usuario_criador}</td>
                      <td className="table-cell text-slate-400 max-w-[200px] truncate" title={r.observacao ?? ''}>
                        {r.observacao || '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {showRegister && (
        <RegistrarModal
          username={username}
          onClose={() => setShowRegister(false)}
          onSaved={load}
        />
      )}
    </div>
  )
}
