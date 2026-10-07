'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabaseBrowser as supabase } from '@/lib/supabase/client'
import { ArrowLeft, Pencil, Check, X } from 'lucide-react'
import AtendidaModal from '@/components/requisicoes/AtendidaModal'
import { desfazerAtendidaSemPedido } from '@/lib/requisicao'
import { enviarAnexos, ListaAnexos, BotaoAnexar, type Anexo } from '@/components/requisicoes/Anexos'

interface Requisicao {
  id: number; empresa: string; categoria: string; descricao: string
  status: string; data_solicitacao: string; data_autorizacao: string | null
  usuario_autorizador: string | null; anexos?: Anexo[] | null
  atendida_sem_pedido: boolean; atendida_data: string | null; atendida_usuario: string | null; atendida_obs: string | null
}

const STATUS_BADGE: Record<string, string> = {
  'Autorizado': 'bg-green-100 text-green-700',
  'Não Autorizado': 'bg-red-100 text-red-700',
  'Aguardando Autorização': 'bg-yellow-100 text-yellow-700',
}

const fmtData = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString('pt-BR')

export default function RequisicaoDetalhePage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()

  const [requisicao, setRequisicao] = useState<Requisicao | null>(null)
  const [pedidoVinculado, setPedidoVinculado] = useState<number | null>(null)
  const [empresas, setEmpresas] = useState<string[]>([])
  const [categoriasPorEmpresa, setCategoriasPorEmpresa] = useState<Record<string, string[]>>({})
  const [loading, setLoading] = useState(true)

  const [editing, setEditing] = useState(false)
  const [empresa, setEmpresa] = useState('')
  const [categoria, setCategoria] = useState('')
  const [descricao, setDescricao] = useState('')
  const [saving, setSaving] = useState(false)
  const [anexando, setAnexando] = useState(false)
  const [error, setError] = useState('')
  const [admin, setAdmin] = useState<{ username: string } | null>(null)
  const [marcando, setMarcando] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    fetch('/api/auth/me').then(r => r.json()).then(u => setAdmin(u?.hierarquia === 'admin' || u?.hierarquia === 'owner' ? u : null)).catch(() => {})
    const [{ data: req }, { data: cats }] = await Promise.all([
      supabase.from('requisicoes').select('*').eq('id', id).single(),
      supabase.from('categorias').select('empresa, categoria').order('empresa').order('categoria'),
    ])
    if (req) {
      setRequisicao(req)
      setEmpresa(req.empresa)
      setCategoria(req.categoria)
      setDescricao(req.descricao)
      const { data: pedido } = await supabase
        .from('pedidos_solicitados')
        .select('id')
        .eq('requisicao_id', req.id)
        .maybeSingle()
      setPedidoVinculado(pedido?.id ?? null)
    }
    const emps = [...new Set((cats ?? []).map(c => c.empresa).filter(Boolean))].sort() as string[]
    const catMap: Record<string, string[]> = {}
    for (const row of (cats ?? [])) {
      if (row.empresa && row.categoria) {
        if (!catMap[row.empresa]) catMap[row.empresa] = []
        if (!catMap[row.empresa].includes(row.categoria)) catMap[row.empresa].push(row.categoria)
      }
    }
    setEmpresas(emps)
    setCategoriasPorEmpresa(catMap)
    setLoading(false)
  }, [id])

  useEffect(() => { load() }, [load])

  const podeEditar = requisicao && !pedidoVinculado &&
    (requisicao.status === 'Aguardando Autorização' || requisicao.status === 'Não Autorizado')

  const handleSave = async () => {
    if (!requisicao) return
    setError('')
    if (!empresa) { setError('Selecione a empresa'); return }
    if (!categoria) { setError('Selecione a categoria'); return }
    if (!descricao.trim()) { setError('Informe a descrição'); return }

    setSaving(true)
    const { error: err } = await supabase.from('requisicoes')
      .update({ empresa, categoria, descricao: descricao.trim() })
      .eq('id', requisicao.id)
    setSaving(false)
    if (err) { setError(err.message); return }
    setEditing(false)
    load()
  }

  const anexos: Anexo[] = requisicao?.anexos ?? []

  const desfazer = async () => {
    if (!requisicao) return
    const e = await desfazerAtendidaSemPedido('pagamentos', requisicao.id)
    if (e) { setError(e); return }
    load()
  }

  const salvarAnexos = async (novos: Anexo[]) => {
    if (!requisicao) return
    const { error: err } = await supabase.from('requisicoes').update({ anexos: novos }).eq('id', requisicao.id)
    if (err) { setError(err.message); return }
    load()
  }

  const handleAnexar = async (files: File[]) => {
    if (files.length === 0) return
    setError('')
    setAnexando(true)
    try { await salvarAnexos([...anexos, ...(await enviarAnexos(files))]) }
    catch (e) { setError((e as Error).message) }
    setAnexando(false)
  }

  if (loading) return <div className="card text-center py-12 text-slate-400">Carregando...</div>
  if (!requisicao) return <div className="card text-center py-12 text-slate-500">Requisição não encontrada.</div>

  return (
    <div className="space-y-5 max-w-2xl">
      <div className="flex items-center gap-3">
        <button onClick={() => router.push('/pagamentos/acompanhar-requisicoes')} className="btn-secondary p-2">
          <ArrowLeft size={16} />
        </button>
        <div>
          <h1 className="page-title">Requisição #{requisicao.id}</h1>
          <p className="page-subtitle">{fmtData(requisicao.data_solicitacao)}</p>
        </div>
        <span className={`badge ml-auto ${STATUS_BADGE[requisicao.status] ?? 'bg-slate-100 text-slate-600'}`}>
          {requisicao.status}
        </span>
        {requisicao.atendida_sem_pedido && <span className="badge bg-teal-100 text-teal-700">Atendida sem pedido</span>}
      </div>

      <div className="card space-y-5">
        {error && <p className="text-sm text-red-600">{error}</p>}

        {pedidoVinculado && (
          <p className="text-sm text-slate-500">
            Vinculada ao pedido{' '}
            <button onClick={() => router.push(`/pagamentos/acompanhar/${pedidoVinculado}`)} className="text-blue-600 hover:underline">
              #{pedidoVinculado}
            </button>
          </p>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div>
            <label className="label">Empresa</label>
            {editing ? (
              <select className="input" value={empresa} onChange={e => { setEmpresa(e.target.value); setCategoria('') }}>
                <option value="">Selecionar...</option>
                {empresas.map(e => <option key={e} value={e}>{e}</option>)}
              </select>
            ) : (
              <p className="text-sm text-slate-800">{requisicao.empresa}</p>
            )}
          </div>
          <div>
            <label className="label">Categoria</label>
            {editing ? (
              <select className="input" value={categoria} onChange={e => setCategoria(e.target.value)} disabled={!empresa}>
                <option value="">Selecionar...</option>
                {(categoriasPorEmpresa[empresa] ?? []).map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            ) : (
              <p className="text-sm text-slate-800">{requisicao.categoria}</p>
            )}
          </div>
        </div>

        <div>
          <label className="label">Descrição</label>
          {editing ? (
            <textarea className="input min-h-[80px] resize-y" value={descricao} onChange={e => setDescricao(e.target.value)} />
          ) : (
            <p className="text-sm text-slate-800 whitespace-pre-wrap">{requisicao.descricao}</p>
          )}
        </div>

        <div>
          <label className="label">Anexos</label>
          <ListaAnexos anexos={anexos} onRemove={podeEditar ? a => salvarAnexos(anexos.filter(x => x.id !== a.id)) : undefined} />
          {podeEditar && (
            <div className="mt-2">
              <BotaoAnexar onFiles={handleAnexar} disabled={anexando} label={anexando ? 'Enviando...' : 'Anexar arquivo'} />
            </div>
          )}
        </div>

        {requisicao.data_autorizacao && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 pt-3 border-t border-slate-100">
            <div>
              <label className="label">Data de Autorização</label>
              <p className="text-sm text-slate-800">{fmtData(requisicao.data_autorizacao)}</p>
            </div>
            <div>
              <label className="label">Autorizado por</label>
              <p className="text-sm text-slate-800">{requisicao.usuario_autorizador || '—'}</p>
            </div>
          </div>
        )}

        {requisicao.atendida_sem_pedido && (
          <div className="pt-3 border-t border-slate-100 space-y-1">
            <p className="text-sm text-slate-700">
              Atendida sem pedido por {requisicao.atendida_usuario || '—'}
              {requisicao.atendida_data && ` em ${fmtData(requisicao.atendida_data)}`}. Não gera pedido nem pagamento.
            </p>
            {requisicao.atendida_obs && <p className="text-sm text-slate-500 whitespace-pre-wrap">{requisicao.atendida_obs}</p>}
            {admin && <button onClick={desfazer} className="btn-secondary text-sm mt-1">Desfazer</button>}
          </div>
        )}

        {admin && requisicao.status === 'Autorizado' && !pedidoVinculado && !requisicao.atendida_sem_pedido && (
          <div className="pt-3 border-t border-slate-100">
            <button onClick={() => setMarcando(true)} className="btn-secondary gap-1.5 text-sm">Atendida sem pedido</button>
          </div>
        )}

        {podeEditar && (
          <div className="flex gap-3 pt-3 border-t border-slate-100">
            {editing ? (
              <>
                <button onClick={handleSave} disabled={saving} className="btn-primary gap-1.5">
                  <Check size={15} /> {saving ? 'Salvando...' : 'Salvar'}
                </button>
                <button
                  onClick={() => {
                    setEditing(false)
                    setEmpresa(requisicao.empresa)
                    setCategoria(requisicao.categoria)
                    setDescricao(requisicao.descricao)
                    setError('')
                  }}
                  className="btn-secondary gap-1.5"
                >
                  <X size={15} /> Cancelar
                </button>
              </>
            ) : (
              <button onClick={() => setEditing(true)} className="btn-secondary gap-1.5">
                <Pencil size={15} /> Editar
              </button>
            )}
          </div>
        )}
      </div>

      {marcando && <AtendidaModal mod="pagamentos" id={requisicao.id} usuario={admin?.username ?? ''} autorizar={false}
        onClose={() => setMarcando(false)} onDone={() => { setMarcando(false); load() }} />}
    </div>
  )
}
