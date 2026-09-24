'use client'

import { useState, useEffect, useCallback } from 'react'
import { supabaseBrowser as supabase } from '@/lib/supabase/client'
import { CheckCircle, Info, Paperclip, X } from 'lucide-react'
import { enviarAnexos, BotaoAnexar, type Anexo } from '@/components/requisicoes/Anexos'

export default function RequisicoesPage() {
  const [fluxoAtivo, setFluxoAtivo] = useState<boolean | null>(null)

  const [empresas, setEmpresas] = useState<string[]>([])
  const [categoriasPorEmpresa, setCategoriasPorEmpresa] = useState<Record<string, string[]>>({})

  const [empresa, setEmpresa] = useState('')
  const [categoria, setCategoria] = useState('')
  const [descricao, setDescricao] = useState('')
  const [arquivos, setArquivos] = useState<File[]>([])

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [successInfo, setSuccessInfo] = useState<{ empresa: string; categoria: string } | null>(null)

  const load = useCallback(async () => {
    const [{ data: cfg }, { data: cats }] = await Promise.all([
      supabase.from('config').select('valor').eq('chave', 'fluxo_sistema').maybeSingle(),
      supabase.from('categorias').select('empresa, categoria').order('empresa').order('categoria'),
    ])
    setFluxoAtivo(cfg?.valor === '4' || cfg?.valor === '5')
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
  }, [])

  useEffect(() => { load() }, [load])

  const categorias = categoriasPorEmpresa[empresa] ?? []

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!empresa) { setError('Selecione a empresa'); return }
    if (!categoria) { setError('Selecione a categoria'); return }
    if (!descricao.trim()) { setError('Informe a descrição'); return }

    setSaving(true)
    let anexos: Anexo[] = []
    try { anexos = await enviarAnexos(arquivos) } catch (e) { setSaving(false); setError((e as Error).message); return }
    const { error: err } = await supabase.from('requisicoes').insert({
      empresa, categoria, descricao: descricao.trim(),
      ...(anexos.length ? { anexos } : {}),
      status: 'Aguardando Autorização',
      data_solicitacao: new Date().toISOString().split('T')[0],
    })
    setSaving(false)
    if (err) { setError(err.message); return }

    setSuccessInfo({ empresa, categoria })
    setEmpresa('')
    setCategoria('')
    setDescricao('')
    setArquivos([])
    setTimeout(() => setSuccessInfo(null), 6000)
  }

  if (fluxoAtivo === null) {
    return <p className="text-slate-400 text-sm">Carregando...</p>
  }

  if (!fluxoAtivo) {
    return (
      <div className="card flex items-start gap-2 p-4 bg-amber-50 border border-amber-200 text-amber-800">
        <Info size={16} className="mt-0.5 shrink-0" />
        <p className="text-sm">
          Esta tela só está disponível quando o Fluxo 4 ou o Fluxo 5 está ativo. Ative em Painel Administrativo → Configurações.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title">Fazer Requisição</h1>
        <p className="page-subtitle">Solicite uma requisição para depois vincular a um pedido</p>
      </div>

      {successInfo && (
        <div className="flex items-start gap-3 p-4 bg-green-50 border border-green-200 rounded-lg text-green-800">
          <CheckCircle size={20} className="mt-0.5 shrink-0" />
          <div className="text-sm">
            <p className="font-semibold">Requisição enviada para autorização!</p>
            <p>{successInfo.empresa} · {successInfo.categoria}</p>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="card space-y-5">
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
        </div>

        <div>
          <label className="label">Descrição *</label>
          <textarea
            className="input min-h-[80px] resize-y"
            placeholder="Descreva a necessidade..."
            value={descricao}
            onChange={e => setDescricao(e.target.value)}
          />
        </div>

        <div>
          <label className="label">Anexos (opcional)</label>
          <BotaoAnexar onFiles={f => setArquivos(a => [...a, ...f])} disabled={saving} />
          {arquivos.length > 0 && (
            <ul className="mt-2 space-y-1">
              {arquivos.map((f, i) => (
                <li key={i} className="flex items-center gap-2 text-sm text-slate-600">
                  <Paperclip size={13} className="text-slate-400 shrink-0" />
                  <span className="truncate">{f.name}</span>
                  <button type="button" onClick={() => setArquivos(a => a.filter((_, j) => j !== i))}
                    className="text-slate-400 hover:text-red-500" title="Remover"><X size={14} /></button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <button type="submit" disabled={saving} className="btn-primary">
          {saving ? 'Enviando...' : 'Enviar Requisição'}
        </button>
      </form>
    </div>
  )
}
