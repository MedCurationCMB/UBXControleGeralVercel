'use client'

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname, useRouter } from 'next/navigation'
import { useContratosLiberados } from '@/lib/useContratosLiberados'
import { cn } from '@/lib/utils'
import { supabaseBrowser as supabase } from '@/lib/supabase/client'
import Modal from '@/components/ui/Modal'
import type { TipoHierarquia } from '@/types/database'
import {
  LayoutDashboard, FileText, CheckSquare, Clock, PlusSquare,
  CreditCard, FolderOpen, Users, Building2, Tag, List,
  FileSignature, TrendingUp, TrendingDown, ShieldCheck,
  Receipt, ClipboardList, ClipboardCheck, Layers, BarChart3, Landmark,
  ChevronRight, LogOut, Menu, PanelLeftClose, PanelLeftOpen, Search, X,
} from 'lucide-react'

interface NavItem {
  label: string
  href: string
  icon: React.ElementType
  adminOnly?: boolean
  ownerOnly?: boolean
  flowOnly?: ('3' | '4' | '5')[]
  flowOnlyReceita?: ('3' | '4' | '5')[]
  contrato?: boolean
}

interface NavGroup {
  title: string
  items: NavItem[]
}

const navGroups: NavGroup[] = [
  {
    title: 'Geral',
    items: [
      { label: 'Início', href: '/inicio', icon: LayoutDashboard },
      { label: 'Todos os módulos', href: '/atalhos', icon: Layers },
    ],
  },
  {
    title: 'Pagamentos',
    items: [
      { label: 'Visão Geral', href: '/pagamentos', icon: TrendingDown },
      { label: 'Autorizar Pedidos', href: '/pagamentos/autorizar', icon: CheckSquare, adminOnly: true },
      { label: 'Acompanhar', href: '/pagamentos/acompanhar', icon: Clock },
      { label: 'Fazer Pedido', href: '/pagamentos/solicitar', icon: PlusSquare },
      { label: 'Lançar Conta a Pagar', href: '/pagamentos/lancar-conta', icon: Receipt, flowOnly: ['3'] },
      { label: 'Fazer Requisição', href: '/pagamentos/requisicoes', icon: ClipboardList, flowOnly: ['4', '5'] },
      { label: 'Requisições', href: '/pagamentos/acompanhar-requisicoes', icon: Clock, flowOnly: ['4', '5'] },
      { label: 'Autorizar Requisições', href: '/pagamentos/autorizar-requisicoes', icon: ClipboardCheck, adminOnly: true, flowOnly: ['4', '5'] },
      { label: 'Controle', href: '/pagamentos/controle', icon: CreditCard },
      { label: 'Documentos', href: '/pagamentos/documentos', icon: FolderOpen },
      { label: 'Fornecedores', href: '/pagamentos/fornecedores', icon: Users },
      { label: 'Contas', href: '/pagamentos/contas', icon: Building2 },
      { label: 'Categorias', href: '/pagamentos/categorias', icon: Tag },
      { label: 'Orçamento', href: '/pagamentos/orcamento', icon: FileText },
      { label: 'Cadastros', href: '/pagamentos/cadastros', icon: List },
      { label: 'Contratos', href: '/pagamentos/modelos-contrato', icon: FileSignature, contrato: true },
    ],
  },
  {
    title: 'Recebimentos',
    items: [
      { label: 'Visão Geral', href: '/recebimentos', icon: TrendingUp },
      { label: 'Autorizar Pedidos', href: '/recebimentos/autorizar', icon: CheckSquare, adminOnly: true },
      { label: 'Acompanhar', href: '/recebimentos/acompanhar', icon: Clock },
      { label: 'Fazer Pedido', href: '/recebimentos/solicitar', icon: PlusSquare },
      { label: 'Lançar Conta a Receber', href: '/recebimentos/lancar-conta', icon: Receipt, flowOnlyReceita: ['3'] },
      { label: 'Fazer Requisição', href: '/recebimentos/requisicoes', icon: ClipboardList, flowOnlyReceita: ['4', '5'] },
      { label: 'Requisições', href: '/recebimentos/acompanhar-requisicoes', icon: Clock, flowOnlyReceita: ['4', '5'] },
      { label: 'Autorizar Requisições', href: '/recebimentos/autorizar-requisicoes', icon: ClipboardCheck, adminOnly: true, flowOnlyReceita: ['4', '5'] },
      { label: 'Controle', href: '/recebimentos/controle', icon: CreditCard },
      { label: 'Documentos', href: '/recebimentos/documentos', icon: FolderOpen },
      { label: 'Clientes', href: '/recebimentos/clientes', icon: Users },
      { label: 'Contas', href: '/recebimentos/contas', icon: Building2 },
      { label: 'Categorias', href: '/recebimentos/categorias', icon: Tag },
      { label: 'Orçamento', href: '/recebimentos/orcamento', icon: FileText },
      { label: 'Cadastros', href: '/recebimentos/cadastros', icon: List },
      { label: 'Contratos', href: '/recebimentos/modelos-contrato', icon: FileSignature, contrato: true },
    ],
  },
  {
    title: 'Configurações',
    items: [
      { label: 'Empresas / CC', href: '/empresas', icon: Building2 },
      { label: 'Extratos Bancários', href: '/extratos-bancarios', icon: Landmark },
      { label: 'Relatórios', href: '/relatorios', icon: BarChart3, ownerOnly: true },
      { label: 'Projetos e Acessos', href: '/projetos', icon: Layers, adminOnly: true },
      { label: 'Painel Admin', href: '/admin', icon: ShieldCheck, adminOnly: true },
    ],
  },
]

const hierarquiaLabel: Record<TipoHierarquia, string> = {
  user: 'Usuário',
  admin: 'Administrador',
  owner: 'Owner',
}

const semAcento = (t: string) => t.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()

interface AppShellProps {
  username: string
  hierarquia: TipoHierarquia
  projetoId: number
  projetoNome: string
  children: React.ReactNode
}

/**
 * Estrutura única das telas (design system): menu lateral navy recolhível (gaveta no celular),
 * barra superior com caminho e busca, `<main>` com `p-4 sm:p-6`.
 */
export default function AppShell({ username, hierarquia, projetoId, projetoNome, children }: AppShellProps) {
  const pathname = usePathname()
  const router = useRouter()
  const isAdminOrOwner = hierarquia === 'admin' || hierarquia === 'owner'
  const [colapsado, setColapsado] = useState(false)
  const [gaveta, setGaveta] = useState(false)
  const [confirmaSair, setConfirmaSair] = useState(false)
  const [q, setQ] = useState('')
  const [sel, setSel] = useState(0)
  const [projetos, setProjetos] = useState<{ id: number; nome: string }[]>([])
  const [fluxoSistema, setFluxoSistema] = useState<string | null>(null)
  const [fluxoSistemaReceita, setFluxoSistemaReceita] = useState<string | null>(null)
  const [badges, setBadges] = useState<Record<string, number>>({})
  const contratosLiberados = useContratosLiberados()

  // Contadores: pedidos esperando autorização (admin) e pedidos meus devolvidos para ajuste.
  // Atualiza a cada navegação.
  useEffect(() => {
    let ativo = true
    ;(async () => {
      const u = await fetch('/api/auth/me').then(r => r.json()).catch(() => null)
      const contar = (tabela: string, status: string) =>
        supabase.from(tabela).select('id', { count: 'exact', head: true }).eq('status', status).eq('cancelado', false)
      const contarReal = (modulo: string) =>
        supabase.from('realocacoes').select('id', { count: 'exact', head: true }).eq('modulo', modulo).eq('status', 'Aguardando Autorização')
      const [aut, autRec, ajuste, ajusteRec, real, realRec] = await Promise.all([
        isAdminOrOwner ? contar('pedidos_solicitados', 'Aguardando Autorização') : null,
        isAdminOrOwner ? contar('pedidos_solicitados_receita', 'Aguardando Autorização') : null,
        u?.username ? contar('pedidos_solicitados', 'Aguardando Ajuste').eq('usuario_solicitante', u.username) : null,
        u?.username ? contar('pedidos_solicitados_receita', 'Aguardando Ajuste').eq('usuario_solicitante', u.username) : null,
        isAdminOrOwner ? contarReal('pagamentos') : null,
        isAdminOrOwner ? contarReal('recebimentos') : null,
      ])
      if (!ativo) return
      setBadges({
        '/pagamentos/autorizar': (aut?.count ?? 0) + (real?.count ?? 0),
        '/recebimentos/autorizar': (autRec?.count ?? 0) + (realRec?.count ?? 0),
        '/pagamentos/acompanhar': ajuste?.count ?? 0,
        '/recebimentos/acompanhar': ajusteRec?.count ?? 0,
      })
    })()
    return () => { ativo = false }
  }, [pathname, isAdminOrOwner])

  useEffect(() => {
    try { setColapsado(localStorage.getItem('sidebar-collapsed') === 'true') } catch {}
  }, [])

  useEffect(() => {
    fetch('/api/projetos').then(r => r.json()).then(d => setProjetos(d?.projetos ?? [])).catch(() => {})
    supabase.from('config').select('valor').eq('chave', 'fluxo_sistema').maybeSingle()
      .then(({ data }) => setFluxoSistema(data?.valor ?? null))
    supabase.from('config').select('valor').eq('chave', 'fluxo_sistema_receita').maybeSingle()
      .then(({ data }) => setFluxoSistemaReceita(data?.valor ?? null))

    const handler = (e: Event) => setFluxoSistema((e as CustomEvent<string>).detail)
    const handlerReceita = (e: Event) => setFluxoSistemaReceita((e as CustomEvent<string>).detail)
    window.addEventListener('fluxo-sistema-changed', handler)
    window.addEventListener('fluxo-sistema-receita-changed', handlerReceita)
    return () => {
      window.removeEventListener('fluxo-sistema-changed', handler)
      window.removeEventListener('fluxo-sistema-receita-changed', handlerReceita)
    }
  }, [])

  // Gaveta do celular: fecha ao navegar e com Esc
  useEffect(() => { setGaveta(false) }, [pathname])
  useEffect(() => {
    if (!gaveta) return
    const aoTeclar = (e: KeyboardEvent) => { if (e.key === 'Escape') setGaveta(false) }
    window.addEventListener('keydown', aoTeclar)
    return () => window.removeEventListener('keydown', aoTeclar)
  }, [gaveta])

  const alternar = () => setColapsado(c => {
    try { localStorage.setItem('sidebar-collapsed', String(!c)) } catch {}
    return !c
  })

  const grupos = useMemo(() => navGroups
    .map(g => ({
      ...g,
      items: g.items.filter(item =>
        (!item.adminOnly || isAdminOrOwner) &&
        (!item.ownerOnly || hierarquia === 'owner') &&
        (!item.contrato || contratosLiberados) &&
        (!item.flowOnly || item.flowOnly.includes(fluxoSistema as '3' | '4' | '5')) &&
        (!item.flowOnlyReceita || item.flowOnlyReceita.includes(fluxoSistemaReceita as '3' | '4' | '5'))
      ),
    }))
    .filter(g => g.items.length > 0),
  [isAdminOrOwner, hierarquia, contratosLiberados, fluxoSistema, fluxoSistemaReceita])

  const ativo = (item: NavItem) =>
    pathname === item.href ||
    (item.href !== '/pagamentos' && item.href !== '/recebimentos' && pathname.startsWith(item.href))

  // Caminho: grupo > tela. Vale o item de href mais longo que casa com a URL.
  const caminho = useMemo(() => {
    let melhor: { grupo: string; item: NavItem } | null = null
    for (const g of navGroups) for (const item of g.items) {
      if (ativo(item) && (!melhor || item.href.length > melhor.item.href.length)) melhor = { grupo: g.title, item }
    }
    return melhor
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname])

  const achados = useMemo(() => {
    const termo = semAcento(q.trim())
    if (!termo) return []
    return grupos
      .flatMap(g => g.items.map(item => ({ item, grupo: g.title })))
      .filter(({ item, grupo }) => semAcento(`${grupo} ${item.label}`).includes(termo))
      .slice(0, 8)
  }, [q, grupos])

  const ir = (href: string) => { setQ(''); router.push(href) }

  async function sair() {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/login')
    router.refresh()
  }

  // Recarrega a página inteira: telas, filtros e caches em memória são do projeto anterior
  async function trocarProjeto(id: number) {
    const r = await fetch('/api/auth/projeto', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projetoId: id }),
    })
    if (r.ok) window.location.href = '/inicio'
  }

  const foco = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white'

  const painel = (col: boolean) => (
    <>
      <div className="flex h-14 shrink-0 items-center gap-2 px-4">
        <Image src="/assets/logo2.png" alt="" width={28} height={28} className="shrink-0 object-contain" />
        {!col && <span className="truncate text-sm font-semibold text-white">CMB Gestão</span>}
      </div>

      {!col && (
        <div className="px-3 pb-3">
          {projetos.length > 1 ? (
            <select
              aria-label="Projeto"
              value={projetoId}
              onChange={e => trocarProjeto(Number(e.target.value))}
              className={cn('h-9 w-full rounded-md border-0 bg-white px-2 text-sm font-medium text-foreground', foco)}
            >
              {projetos.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
            </select>
          ) : (
            <p className="truncate px-1 text-sm font-medium text-white/80">{projetoNome}</p>
          )}
        </div>
      )}

      <nav className="flex-1 overflow-y-auto overflow-x-hidden px-3 py-2 scrollbar-none" aria-label="Menu principal">
        {grupos.map(g => (
          <div key={g.title} className="mb-4">
            {col
              ? <div className="mx-1 mb-2 border-t border-white/10" />
              : <p className="px-3 pb-1 text-xs font-medium text-white/50">{g.title}</p>}
            <ul className="space-y-0.5">
              {g.items.map(item => {
                const Icone = item.icon
                const on = ativo(item)
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      title={col ? item.label : undefined}
                      aria-current={on ? 'page' : undefined}
                      className={cn(
                        'relative flex items-center gap-3 rounded-md px-3 py-2 text-sm',
                        foco,
                        on ? 'bg-white/15 font-medium text-white' : 'text-white/70 hover:bg-white/10 hover:text-white',
                        col && 'justify-center px-0'
                      )}
                    >
                      <Icone size={16} className="shrink-0" />
                      {!col && <span className="truncate">{item.label}</span>}
                      {!!badges[item.href] && (
                        col
                          ? <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-[#FBF0DA]" />
                          : <span className="ml-auto min-w-[18px] rounded bg-[#FBF0DA] px-1.5 text-center text-xs font-medium text-[#7A4E00]">
                              {badges[item.href]}
                            </span>
                      )}
                    </Link>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="shrink-0 border-t border-white/10 p-3">
        {!col && (
          <div className="mb-2 min-w-0 px-1">
            <p className="truncate text-sm text-white">{username}</p>
            <p className="text-xs text-white/60">{hierarquiaLabel[hierarquia]}</p>
          </div>
        )}
        <div className={cn('flex gap-1', col && 'flex-col')}>
          <button
            onClick={() => setConfirmaSair(true)}
            aria-label="Sair"
            title="Sair"
            className={cn('flex items-center gap-2 rounded-md px-3 py-2 text-sm text-white/70 hover:bg-white/10 hover:text-white', foco)}
          >
            <LogOut size={16} />{!col && 'Sair'}
          </button>
          <button
            onClick={alternar}
            aria-label={colapsado ? 'Expandir menu' : 'Recolher menu'}
            title={colapsado ? 'Expandir menu' : 'Recolher menu'}
            className={cn('ml-auto hidden rounded-md px-3 py-2 text-white/70 hover:bg-white/10 hover:text-white lg:block', foco)}
          >
            {colapsado ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
          </button>
        </div>
      </div>
    </>
  )

  return (
    <>
      <div className="flex h-dvh overflow-hidden bg-canvas">
        <aside className={cn('hidden shrink-0 flex-col bg-primary lg:flex', colapsado ? 'w-16' : 'w-60')}>
          {painel(colapsado)}
        </aside>

        {gaveta && (
          <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
            <div className="absolute inset-0 bg-black/50" onClick={() => setGaveta(false)} />
            <aside className="relative flex h-full w-64 flex-col bg-primary">
              <button
                onClick={() => setGaveta(false)}
                aria-label="Fechar menu"
                className={cn('absolute right-3 top-3 rounded-md p-2 text-white/70 hover:text-white', foco)}
              >
                <X size={16} />
              </button>
              {painel(false)}
            </aside>
          </div>
        )}

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b bg-background px-4 sm:px-6">
            <div className="flex min-w-0 items-center gap-2">
              <button
                onClick={() => setGaveta(true)}
                aria-label="Abrir menu"
                className="rounded-md p-2 text-foreground hover:bg-accent lg:hidden"
              >
                <Menu size={20} />
              </button>
              <nav aria-label="Caminho" className="flex min-w-0 items-center gap-1 text-sm text-muted-foreground">
                {caminho && caminho.grupo !== 'Geral' && (
                  <>
                    <span className="hidden truncate sm:inline">{caminho.grupo}</span>
                    <ChevronRight size={14} className="hidden shrink-0 sm:block" />
                  </>
                )}
                {caminho && <span className="truncate font-medium text-foreground">{caminho.item.label}</span>}
              </nav>
            </div>

            <div className="relative hidden w-72 sm:block">
              <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                role="combobox"
                aria-expanded={!!q.trim()}
                aria-controls="busca-resultados"
                aria-autocomplete="list"
                value={q}
                onChange={e => { setQ(e.target.value); setSel(0) }}
                onKeyDown={e => {
                  if (e.key === 'ArrowDown') { e.preventDefault(); setSel(s => Math.min(s + 1, achados.length - 1)) }
                  if (e.key === 'ArrowUp') { e.preventDefault(); setSel(s => Math.max(s - 1, 0)) }
                  if (e.key === 'Enter' && achados[sel]) ir(achados[sel].item.href)
                  if (e.key === 'Escape') setQ('')
                }}
                placeholder="Buscar módulo ou tela"
                aria-label="Buscar módulo ou tela"
                className="input pl-9"
              />
              {q.trim() && (
                <ul id="busca-resultados" role="listbox" className="absolute right-0 top-full z-30 mt-1 w-full rounded-md border bg-popover p-1 shadow-sm">
                  {achados.map(({ item, grupo }, i) => (
                    <li key={item.href} role="option" aria-selected={i === sel}>
                      <button
                        onClick={() => ir(item.href)}
                        className={cn('w-full rounded px-2 py-2 text-left text-sm hover:bg-accent', i === sel && 'bg-accent')}
                      >
                        {item.label} <span className="text-xs text-muted-foreground">· {grupo}</span>
                      </button>
                    </li>
                  ))}
                  {achados.length === 0 && <li className="px-2 py-3 text-sm text-muted-foreground">Nada encontrado.</li>}
                </ul>
              )}
            </div>
          </header>
          <main className="flex-1 overflow-y-auto p-4 sm:p-6">{children}</main>
        </div>
      </div>

      <Modal open={confirmaSair} onClose={() => setConfirmaSair(false)} title="Sair do sistema?" size="sm">
        <p className="mb-6 text-sm text-muted-foreground">Você precisará entrar de novo para continuar.</p>
        <div className="flex justify-end gap-2">
          <button onClick={() => setConfirmaSair(false)} className="btn-secondary">Cancelar</button>
          <button onClick={sair} className="btn-primary">Sair</button>
        </div>
      </Modal>
    </>
  )
}
