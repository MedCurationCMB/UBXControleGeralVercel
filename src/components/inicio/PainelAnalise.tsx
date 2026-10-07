'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { X, CheckCircle, XCircle, AlertTriangle, ExternalLink, FileText } from 'lucide-react'
import Confirm from '@/components/ui/Confirm'
import AjusteModal from '@/components/pedidos/AjusteModal'
import ComentariosPedido from '@/components/pedidos/ComentariosPedido'
import AtendidaModal from '@/components/requisicoes/AtendidaModal'
import { ListaAnexos, type Anexo } from '@/components/requisicoes/Anexos'
import { supabaseBrowser as supabase } from '@/lib/supabase/client'
import { TAB_PEDIDO, decidirPedido, type ModuloPedido } from '@/lib/ajuste'

const fmtMoeda = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const fmtData = (d: string) => new Date(d.length <= 10 ? d + 'T12:00:00' : d).toLocaleDateString('pt-BR')
const fmtDataHora = (d: string) => new Date(d).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
const AGUARDANDO = 'Aguardando Autorização'

export interface AlvoAnalise { tipo: 'pedido' | 'requisicao'; mod: ModuloPedido; id: number }

interface Dados {
  empresa: string; categoria: string; parte: string; valor: number; data: string; status: string
  emergencia: boolean; reenviado: boolean; solicitante: string | null; observacao: string | null; descricao: string | null; anexos: Anexo[]
}
interface Linha { mes: number; ano: number; valor: number; benef: string | null }
interface Doc { id: number; nome: string; anexoId: string | null }

// Painel lateral para analisar um pedido ou requisição pendente sem sair da página inicial:
// resumo, documentos, histórico e as ações (autorizar, rejeitar, solicitar ajuste), com atalho para o detalhe completo.
export default function PainelAnalise({ alvo, usuario, onClose, onDone }: {
  alvo: AlvoAnalise; usuario: string; onClose: () => void; onDone: () => void
}) {
  const { tipo, mod, id } = alvo
  const t = TAB_PEDIDO[mod]
  const [d, setD] = useState<Dados | null>(null)
  const [linhas, setLinhas] = useState<Linha[]>([])
  const [docs, setDocs] = useState<Doc[]>([])
  const [erroCarga, setErroCarga] = useState('')
  const [acao, setAcao] = useState<'Autorizado' | 'Não Autorizado' | null>(null)
  const [ajuste, setAjuste] = useState(false)
  const [atendida, setAtendida] = useState(false)
  const [busy, setBusy] = useState(false)
  const [erro, setErro] = useState('')

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape' && !acao && !ajuste && !atendida) onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose, acao, ajuste, atendida])

  useEffect(() => {
    let ativo = true
    ;(async () => {
      if (tipo === 'requisicao') {
        const { data: r } = await supabase.from(mod === 'pagamentos' ? 'requisicoes' : 'requisicoes_receita').select('*').eq('id', id).maybeSingle()
        if (!ativo) return
        if (!r) { setErroCarga('Requisição não encontrada.'); return }
        setD({
          empresa: r.empresa, categoria: r.categoria, parte: '', valor: 0, data: r.data_solicitacao, status: r.status,
          emergencia: false, reenviado: false, solicitante: null, observacao: null, descricao: r.descricao, anexos: r.anexos ?? [],
        })
        return
      }
      const [{ data: p }, { data: fl }, { data: dc }] = await Promise.all([
        supabase.from(t.pedido).select('*').eq('id', id).maybeSingle(),
        supabase.from(t.fluxo).select('*').eq('pedido_id', id).order('ano').order('mes'),
        supabase.from(mod === 'pagamentos' ? 'documentos' : 'documentos_receita').select('id, nome_documento, anexo_id').eq('pedido_id', id).order('data_upload', { ascending: false }),
      ])
      if (!ativo) return
      if (!p) { setErroCarga('Pedido não encontrado.'); return }
      setD({
        empresa: p.empresa, categoria: p.categoria, parte: p[t.parte], valor: Number(p.valor_pedido), data: p.data_solicitacao, status: p.cancelado ? 'Cancelado' : p.status,
        emergencia: !!p.emergencia, reenviado: !!p.ajuste_reenviado, solicitante: p.usuario_solicitante ?? null, observacao: p.observacao ?? null, descricao: null, anexos: [],
      })
      setLinhas((fl ?? []).map(l => ({ mes: l.mes, ano: l.ano, valor: Number(l.valor_referente), benef: l.fornecedor_beneficiario ?? l.cliente_beneficiario ?? null })))
      setDocs((dc ?? []).map(x => ({ id: x.id, nome: x.nome_documento ?? 'Documento', anexoId: x.anexo_id })))
    })()
    return () => { ativo = false }
  }, [tipo, mod, id, t.pedido, t.fluxo, t.parte])

  const decidir = async () => {
    if (!d || !acao) return
    setBusy(true)
    let e: string | null
    if (tipo === 'pedido') e = await decidirPedido(mod, id, d.parte, d.valor, acao, usuario)
    else {
      const { error } = await supabase.from(mod === 'pagamentos' ? 'requisicoes' : 'requisicoes_receita').update({
        status: acao, data_autorizacao: new Date().toISOString().split('T')[0], usuario_autorizador: usuario,
      }).eq('id', id)
      e = error?.message ?? null
    }
    setBusy(false)
    if (e) { setErro(e); return }
    setAcao(null); onDone()
  }

  const nome = tipo === 'pedido' ? `Pedido #${id}` : `Requisição #${id}`
  const pendente = d?.status === AGUARDANDO
  const detalhe = tipo === 'pedido' ? `/${mod}/autorizar/${id}` : `/${mod}/autorizar-requisicoes`
  const campo = (rotulo: string, valor: string) => (
    <div><p className="text-xs text-slate-500">{rotulo}</p><p className="text-sm text-slate-800 break-words">{valor}</p></div>
  )

  return (
    <>
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={onClose}>
      <aside className="bg-white w-full max-w-md h-full flex flex-col shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 p-5 border-b border-slate-200">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">{nome}</h2>
            {d && (
              <div className="flex items-center gap-2 flex-wrap mt-1.5 text-xs">
                {d.emergencia && <span className="badge bg-red-100 text-red-700">Urgente</span>}
                {d.reenviado && <span className="badge bg-blue-100 text-blue-700">Reenviado após ajuste</span>}
                <span className="text-slate-500">Criado em {fmtData(d.data)}{d.solicitante && ` por ${d.solicitante}`}</span>
              </div>
            )}
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-slate-100 text-slate-500" title="Fechar"><X size={18} /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {erroCarga && <p className="text-sm text-red-600">{erroCarga}</p>}
          {!d && !erroCarga && <p className="text-sm text-slate-400">Carregando...</p>}
          {d && (
            <>
              {campo('Empresa', d.empresa)}
              {tipo === 'pedido' && campo(t.parteRotulo, d.parte)}
              {campo('Categoria', d.categoria)}
              {tipo === 'pedido' && <div><p className="text-xs text-slate-500">Valor</p><p className="text-xl font-semibold text-slate-900">{fmtMoeda(d.valor)}</p></div>}
              {d.descricao && campo('Descrição', d.descricao)}
              {d.observacao && campo('Observação', d.observacao)}

              {linhas.length > 0 && (
                <div>
                  <p className="text-sm font-semibold text-slate-800 mb-2">Cronograma</p>
                  <div className="border border-slate-200 rounded-lg divide-y divide-slate-100 text-sm">
                    {linhas.map((l, i) => (
                      <div key={i} className="flex justify-between gap-3 px-3 py-1.5">
                        <span className="text-slate-600">{String(l.mes).padStart(2, '0')}/{l.ano}{l.benef && l.benef !== d.parte && ` · ${l.benef}`}</span>
                        <span className="font-medium">{fmtMoeda(l.valor)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-semibold text-slate-800">{tipo === 'pedido' ? `Documentos (${docs.length})` : 'Anexos'}</p>
                  {tipo === 'pedido' && <Link href={detalhe} className="text-xs text-blue-600 hover:underline">Ver todos</Link>}
                </div>
                {tipo === 'requisicao' ? <ListaAnexos anexos={d.anexos} /> : docs.length === 0 ? (
                  <p className="text-sm text-slate-400">Nenhum documento.</p>
                ) : (
                  <ul className="border border-slate-200 rounded-lg divide-y divide-slate-100">
                    {docs.map(x => (
                      <li key={x.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                        <FileText size={15} className="text-slate-400 shrink-0" />
                        {x.anexoId
                          ? <a href={`/api/b2/file?fileId=${x.anexoId}`} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline truncate inline-flex items-center gap-1">{x.nome} <ExternalLink size={11} className="shrink-0" /></a>
                          : <span className="truncate">{x.nome}</span>}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {tipo === 'pedido' && (
                <div>
                  <p className="text-sm font-semibold text-slate-800 mb-2">Comentários</p>
                  <ComentariosPedido mod={mod} pedidoId={id} usuario={usuario} />
                </div>
              )}

              {!pendente && <p className="text-sm text-orange-700 bg-orange-50 border border-orange-200 rounded-lg px-3 py-2">Este item não está mais aguardando autorização ({d.status}).</p>}
            </>
          )}
        </div>

        <div className="p-4 border-t border-slate-200 space-y-2">
          {erro && !acao && <p className="text-xs text-red-600">{erro}</p>}
          {d && pendente && (
            <>
              <button onClick={() => { setErro(''); setAcao('Autorizado') }}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700">
                <CheckCircle size={16} /> Autorizar
              </button>
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => { setErro(''); setAcao('Não Autorizado') }}
                  className="inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm font-medium hover:bg-red-100">
                  <XCircle size={15} /> Rejeitar
                </button>
                {tipo === 'requisicao' && (
                  <button onClick={() => setAtendida(true)}
                    className="inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-slate-50 border border-slate-200 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-100">
                    Atendida sem pedido
                  </button>
                )}
                {tipo === 'pedido' && (
                  <button onClick={() => setAjuste(true)}
                    className="inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-orange-50 border border-orange-200 text-orange-700 rounded-lg text-sm font-medium hover:bg-orange-100">
                    <AlertTriangle size={15} /> Solicitar ajuste
                  </button>
                )}
              </div>
            </>
          )}
          <Link href={detalhe} className="block text-center text-sm text-blue-600 hover:underline pt-1">Ver detalhes</Link>
        </div>
      </aside>
    </div>

      <Confirm open={!!acao} onClose={() => { setAcao(null); setErro('') }} onConfirm={decidir} loading={busy}
        title={`${acao === 'Autorizado' ? 'Autorizar' : 'Rejeitar'} ${tipo === 'pedido' ? 'pedido' : 'requisição'}`}
        message={`Confirma ${acao === 'Autorizado' ? 'a autorização' : 'a rejeição'} d${tipo === 'pedido' ? 'o pedido' : 'a requisição'} #${id}?${erro ? ` Não foi possível: ${erro}` : ''}`}
        confirmLabel={acao === 'Autorizado' ? 'Autorizar' : 'Rejeitar'} />

      {atendida && <AtendidaModal mod={mod} id={id} usuario={usuario} autorizar onClose={() => setAtendida(false)} onDone={() => { setAtendida(false); onDone() }} />}
      {ajuste && <AjusteModal mod={mod} pedidoId={id} usuario={usuario} onClose={() => setAjuste(false)} onDone={() => { setAjuste(false); onDone() }} />}
    </>
  )
}
