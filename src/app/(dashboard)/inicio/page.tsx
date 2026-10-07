'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { PlusSquare, ClipboardList, Receipt, CheckCircle, ArrowRight, Undo2, BarChart3, Layers } from 'lucide-react'
import Confirm from '@/components/ui/Confirm'
import { supabaseBrowser as supabase } from '@/lib/supabase/client'
import { TAB_PEDIDO, autorizarPedido, type ModuloPedido } from '@/lib/ajuste'

const MODS: ModuloPedido[] = ['pagamentos', 'recebimentos']
const ROTULO: Record<ModuloPedido, string> = { pagamentos: 'Pagamentos', recebimentos: 'Recebimentos' }
const AGUARDANDO = 'Aguardando Autorização'
const fmtMoeda = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

interface Pend {
  mod: ModuloPedido; id: number; empresa: string; categoria: string; parte: string
  valor: number; data: string; emergencia: boolean; solicitante: string | null
}
interface Contagem { aut: number; real: number; req: number }
interface Meus { aguardando: number; autorizado: number; ajuste: number; recusado: number }
const zero = <T,>(v: T): Record<ModuloPedido, T> => ({ pagamentos: v, recebimentos: v })

const quando = (d: string) => {
  const dias = Math.floor((Date.now() - new Date(d + 'T12:00:00').getTime()) / 86400000)
  return dias <= 0 ? 'hoje' : `há ${dias} dia${dias > 1 ? 's' : ''}`
}
const saudacao = () => { const h = new Date().getHours(); return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite' }

// Página inicial: o que o usuário pode fazer e o que está pendente para ele, conforme o perfil e o fluxo do projeto.
export default function InicioPage() {
  const [username, setUsername] = useState('')
  const [admin, setAdmin] = useState(false)
  const [owner, setOwner] = useState(false)
  const [fluxo, setFluxo] = useState(zero(''))
  const [cont, setCont] = useState(zero<Contagem>({ aut: 0, real: 0, req: 0 }))
  const [pends, setPends] = useState<Pend[]>([])
  const [meus, setMeus] = useState(zero<Meus>({ aguardando: 0, autorizado: 0, ajuste: 0, recusado: 0 }))
  const [loading, setLoading] = useState(true)
  const [confirmar, setConfirmar] = useState<Pend | null>(null)
  const [busy, setBusy] = useState(false)
  const [erro, setErro] = useState('')

  const load = useCallback(async () => {
    const u = await fetch('/api/auth/me').then(r => r.json()).catch(() => null)
    if (!u) return
    const ehAdmin = u.hierarquia === 'admin' || u.hierarquia === 'owner'
    setUsername(u.username); setAdmin(ehAdmin); setOwner(u.hierarquia === 'owner')

    const fl = zero('')
    const novoCont = zero<Contagem>({ aut: 0, real: 0, req: 0 })
    const novoMeus = zero<Meus>({ aguardando: 0, autorizado: 0, ajuste: 0, recusado: 0 })
    const lista: Pend[] = []

    await Promise.all(MODS.map(async mod => {
      const t = TAB_PEDIDO[mod]
      const { data: cfg } = await supabase.from('config').select('valor').eq('chave', t.cfgFluxo).maybeSingle()
      fl[mod] = cfg?.valor ?? ''
      const comReq = fl[mod] === '4' || fl[mod] === '5'
      const pedidos = (status: string) => supabase.from(t.pedido).select('id', { count: 'exact', head: true }).eq('status', status).eq('cancelado', false)
      const meu = (status: string) => pedidos(status).eq('usuario_solicitante', u.username)

      const [mAg, mAut, mAju, mRec] = await Promise.all([meu(AGUARDANDO), meu('Autorizado'), meu('Aguardando Ajuste'), meu('Não Autorizado')])
      novoMeus[mod] = { aguardando: mAg.count ?? 0, autorizado: mAut.count ?? 0, ajuste: mAju.count ?? 0, recusado: mRec.count ?? 0 }
      if (!ehAdmin) return

      const [cAut, cReal, cReq, { data: peds }] = await Promise.all([
        pedidos(AGUARDANDO),
        supabase.from('realocacoes').select('id', { count: 'exact', head: true }).eq('modulo', mod).eq('status', AGUARDANDO),
        comReq
          ? supabase.from(mod === 'pagamentos' ? 'requisicoes' : 'requisicoes_receita').select('id', { count: 'exact', head: true }).eq('status', AGUARDANDO)
          : null,
        supabase.from(t.pedido).select(`id, empresa, categoria, valor_pedido, data_solicitacao, emergencia, usuario_solicitante, ${t.parte}`)
          .eq('status', AGUARDANDO).eq('cancelado', false)
          .order('emergencia', { ascending: false }).order('id', { ascending: true }).limit(6),
      ])
      novoCont[mod] = { aut: cAut.count ?? 0, real: cReal.count ?? 0, req: cReq?.count ?? 0 }
      for (const p of (peds ?? []) as unknown as Record<string, unknown>[]) {
        lista.push({
          mod, id: p.id as number, empresa: p.empresa as string, categoria: p.categoria as string, parte: p[t.parte] as string,
          valor: Number(p.valor_pedido), data: p.data_solicitacao as string, emergencia: !!p.emergencia, solicitante: p.usuario_solicitante as string | null,
        })
      }
    }))

    lista.sort((a, b) => Number(b.emergencia) - Number(a.emergencia) || a.data.localeCompare(b.data) || a.id - b.id)
    setFluxo(fl); setCont(novoCont); setMeus(novoMeus); setPends(lista.slice(0, 6))
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const autorizar = async () => {
    if (!confirmar) return
    setBusy(true)
    const e = await autorizarPedido(confirmar.mod, confirmar.id, confirmar.parte, confirmar.valor, username)
    setBusy(false)
    if (e) { setErro(e); return }
    setConfirmar(null); setErro('')
    load()
  }

  // atalhos de criação, conforme o fluxo de cada módulo
  const acoes = MODS.flatMap(mod => {
    const base = `/${mod}`, nome = mod === 'pagamentos' ? 'pagamento' : 'recebimento'
    const f = fluxo[mod]
    return [
      { href: `${base}/solicitar`, label: `Fazer pedido de ${nome}`, icon: PlusSquare },
      ...(f === '4' || f === '5' ? [{ href: `${base}/requisicoes`, label: `Fazer requisição de ${nome}`, icon: ClipboardList }] : []),
      ...(f === '3' ? [{ href: `${base}/lancar-conta`, label: mod === 'pagamentos' ? 'Lançar conta a pagar' : 'Lançar conta a receber', icon: Receipt }] : []),
    ]
  })

  // pendências do aprovador (só as que têm algo)
  const pendencias = MODS.flatMap(mod => [
    { n: cont[mod].aut, label: `Pedidos de ${mod === 'pagamentos' ? 'pagamento' : 'recebimento'} a autorizar`, href: `/${mod}/autorizar` },
    { n: cont[mod].req, label: `Requisições de ${mod === 'pagamentos' ? 'pagamento' : 'recebimento'}`, href: `/${mod}/autorizar-requisicoes` },
    { n: cont[mod].real, label: `Realocações de ${mod === 'pagamentos' ? 'pagamento' : 'recebimento'}`, href: `/${mod}/autorizar` },
  ]).filter(p => p.n > 0)

  const devolvidos = MODS.filter(m => meus[m].ajuste > 0)
  const temPedidos = MODS.filter(m => Object.values(meus[m]).some(v => v > 0))

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="page-title">{saudacao()}{username && `, ${username}`}</h1>
          <p className="page-subtitle">O que você pode fazer e o que está esperando por você</p>
        </div>
        <div className="flex gap-2">
          {owner && <Link href="/relatorios" className="btn-secondary inline-flex items-center gap-1.5 text-sm"><BarChart3 size={14} /> Relatórios</Link>}
          <Link href="/atalhos" className="btn-secondary inline-flex items-center gap-1.5 text-sm"><Layers size={14} /> Todos os módulos</Link>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {acoes.map(a => {
          const Icon = a.icon
          return (
            <Link key={a.href} href={a.href}
              className="flex items-center gap-3 px-4 py-3 rounded-lg border border-slate-200 bg-white hover:border-primary-400 hover:bg-primary-50 text-sm font-medium text-slate-700 shadow-sm transition-all">
              <Icon size={18} className="text-primary-600 shrink-0" /> {a.label}
            </Link>
          )
        })}
      </div>

      {loading && <div className="card text-center py-10 text-slate-400">Carregando...</div>}

      {!loading && admin && (
        <div className="card space-y-4">
          <h2 className="text-base font-semibold text-slate-800">Aguardando sua autorização</h2>
          {pendencias.length === 0 ? (
            <p className="text-sm text-slate-500 flex items-center gap-2"><CheckCircle size={16} className="text-green-500" /> Nada aguardando autorização.</p>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {pendencias.map(p => (
                  <Link key={p.label} href={p.href} className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg bg-yellow-50 border border-yellow-200 hover:bg-yellow-100 text-sm text-yellow-800">
                    <span>{p.label}</span><span className="font-semibold text-base">{p.n}</span>
                  </Link>
                ))}
              </div>
              {pends.length > 0 && (
                <div className="border border-slate-200 rounded-lg divide-y divide-slate-100">
                  {pends.map(p => (
                    <div key={`${p.mod}-${p.id}`} className="flex items-center justify-between gap-3 flex-wrap px-3 py-2.5">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-800">
                          #{p.id} · {p.empresa} · {p.categoria}
                          {p.emergencia && <span className="badge bg-red-100 text-red-700 ml-2">emergência</span>}
                          <span className="badge bg-slate-100 text-slate-600 ml-2">{ROTULO[p.mod]}</span>
                        </p>
                        <p className="text-xs text-slate-500">{p.parte} · {fmtMoeda(p.valor)} · {quando(p.data)}{p.solicitante && ` · ${p.solicitante}`}</p>
                      </div>
                      <div className="flex gap-1.5">
                        <Link href={`/${p.mod}/autorizar/${p.id}`} className="btn-secondary text-xs px-3 py-1.5">Ver</Link>
                        <button onClick={() => { setErro(''); setConfirmar(p) }}
                          className="inline-flex items-center gap-1 px-3 py-1.5 bg-green-600 text-white rounded text-xs font-medium hover:bg-green-700">
                          <CheckCircle size={12} /> Autorizar
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {!loading && devolvidos.length > 0 && (
        <div className="card space-y-2">
          <h2 className="text-base font-semibold text-slate-800">Precisa de você</h2>
          {devolvidos.map(m => (
            <Link key={m} href={`/${m}/acompanhar`} className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg bg-orange-50 border border-orange-200 hover:bg-orange-100 text-sm text-orange-800">
              <span className="flex items-center gap-2"><Undo2 size={14} /> {meus[m].ajuste} pedido{meus[m].ajuste > 1 ? 's' : ''} de {m === 'pagamentos' ? 'pagamento' : 'recebimento'} devolvido{meus[m].ajuste > 1 ? 's' : ''} para ajuste</span>
              <span className="font-medium inline-flex items-center gap-1">Ajustar <ArrowRight size={13} /></span>
            </Link>
          ))}
        </div>
      )}

      {!loading && temPedidos.length > 0 && (
        <div className="card space-y-3">
          <h2 className="text-base font-semibold text-slate-800">Meus pedidos</h2>
          {temPedidos.map(m => (
            <div key={m}>
              <p className="text-xs font-medium text-slate-500 mb-1.5">{ROTULO[m]}</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {([['Aguardando', meus[m].aguardando], ['Autorizados', meus[m].autorizado], ['Devolvidos', meus[m].ajuste], ['Não autorizados', meus[m].recusado]] as const).map(([l, v]) => (
                  <Link key={l} href={`/${m}/acompanhar`} className="rounded-lg bg-slate-50 hover:bg-slate-100 px-3 py-2">
                    <p className="text-xs text-slate-500">{l}</p>
                    <p className="text-xl font-semibold text-slate-800">{v}</p>
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <Confirm open={!!confirmar} onClose={() => { setConfirmar(null); setErro('') }} onConfirm={autorizar} confirmLabel="Autorizar" loading={busy}
        title="Autorizar pedido"
        message={confirmar ? `Autorizar o pedido #${confirmar.id} (${confirmar.empresa} · ${confirmar.categoria} · ${fmtMoeda(confirmar.valor)})?${erro ? ` Não foi possível: ${erro}` : ''}` : ''} />
    </div>
  )
}
