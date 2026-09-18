'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { supabaseBrowser as supabase } from '@/lib/supabase/client'
import type { TipoHierarquia } from '@/types/database'
import {
  LayoutDashboard, FileText, CheckSquare, Clock, PlusSquare,
  CreditCard, FolderOpen, Users, Building2, Tag, List,
  FileSignature, TrendingUp, TrendingDown, Settings, ShieldCheck,
  ChevronLeft, ChevronRight, Receipt, ClipboardList, ClipboardCheck,
} from 'lucide-react'

interface NavItem {
  label: string
  href: string
  icon: React.ElementType
  adminOnly?: boolean
  flowOnly?: '3' | '4'
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
    ],
  },
  {
    title: 'Pagamentos',
    items: [
      { label: 'Visão Geral', href: '/pagamentos', icon: TrendingDown },
      { label: 'Autorizar Pedidos', href: '/pagamentos/autorizar', icon: CheckSquare, adminOnly: true },
      { label: 'Acompanhar', href: '/pagamentos/acompanhar', icon: Clock },
      { label: 'Solicitar', href: '/pagamentos/solicitar', icon: PlusSquare },
      { label: 'Lançar Conta a Pagar', href: '/pagamentos/lancar-conta', icon: Receipt, flowOnly: '3' },
      { label: 'Requisitar', href: '/pagamentos/requisicoes', icon: ClipboardList, flowOnly: '4' },
      { label: 'Autorizar Requisições', href: '/pagamentos/autorizar-requisicoes', icon: ClipboardCheck, adminOnly: true, flowOnly: '4' },
      { label: 'Controle', href: '/pagamentos/controle', icon: CreditCard },
      { label: 'Documentos', href: '/pagamentos/documentos', icon: FolderOpen },
      { label: 'Fornecedores', href: '/pagamentos/fornecedores', icon: Users },
      { label: 'Contas', href: '/pagamentos/contas', icon: Building2 },
      { label: 'Categorias', href: '/pagamentos/categorias', icon: Tag },
      { label: 'Orçamento', href: '/pagamentos/orcamento', icon: FileText },
      { label: 'Cadastros', href: '/pagamentos/cadastros', icon: List },
      { label: 'Contratos', href: '/pagamentos/modelos-contrato', icon: FileSignature },
    ],
  },
  {
    title: 'Recebimentos',
    items: [
      { label: 'Visão Geral', href: '/recebimentos', icon: TrendingUp },
      { label: 'Autorizar Pedidos', href: '/recebimentos/autorizar', icon: CheckSquare, adminOnly: true },
      { label: 'Acompanhar', href: '/recebimentos/acompanhar', icon: Clock },
      { label: 'Solicitar', href: '/recebimentos/solicitar', icon: PlusSquare },
      { label: 'Controle', href: '/recebimentos/controle', icon: CreditCard },
      { label: 'Documentos', href: '/recebimentos/documentos', icon: FolderOpen },
      { label: 'Clientes', href: '/recebimentos/clientes', icon: Users },
      { label: 'Contas', href: '/recebimentos/contas', icon: Building2 },
      { label: 'Categorias', href: '/recebimentos/categorias', icon: Tag },
      { label: 'Orçamento', href: '/recebimentos/orcamento', icon: FileText },
      { label: 'Cadastros', href: '/recebimentos/cadastros', icon: List },
      { label: 'Contratos', href: '/recebimentos/modelos-contrato', icon: FileSignature },
    ],
  },
  {
    title: 'Configurações',
    items: [
      { label: 'Empresas / CC', href: '/empresas', icon: Building2 },
      { label: 'Painel Admin', href: '/admin', icon: ShieldCheck, adminOnly: true },
    ],
  },
]

interface SidebarProps {
  hierarquia: TipoHierarquia
}

export default function Sidebar({ hierarquia }: SidebarProps) {
  const pathname = usePathname()
  const isAdminOrOwner = hierarquia === 'admin' || hierarquia === 'owner'
  const [collapsed, setCollapsed] = useState(true)
  const [fluxoSistema, setFluxoSistema] = useState<string | null>(null)

  useEffect(() => {
    const saved = localStorage.getItem('sidebar-collapsed')
    if (saved !== null) setCollapsed(saved === 'true')
  }, [])

  useEffect(() => {
    supabase.from('config').select('valor').eq('chave', 'fluxo_sistema').maybeSingle()
      .then(({ data }) => setFluxoSistema(data?.valor ?? null))

    const handler = (e: Event) => setFluxoSistema((e as CustomEvent<string>).detail)
    window.addEventListener('fluxo-sistema-changed', handler)
    return () => window.removeEventListener('fluxo-sistema-changed', handler)
  }, [])

  const toggle = () => {
    setCollapsed(prev => {
      localStorage.setItem('sidebar-collapsed', String(!prev))
      return !prev
    })
  }

  return (
    <aside className={cn(
      'flex-shrink-0 bg-sidebar flex flex-col overflow-x-hidden transition-all duration-300',
      collapsed ? 'w-14' : 'w-60'
    )}>
      {/* Toggle — topo fixo */}
      <div className={cn(
        'flex shrink-0 border-b border-slate-800/60 py-1',
        collapsed ? 'justify-center' : 'justify-end px-2'
      )}>
        <button
          onClick={toggle}
          title={collapsed ? 'Expandir menu' : 'Colapsar menu'}
          className="p-1.5 rounded text-slate-500 hover:text-white hover:bg-slate-700 transition-colors"
        >
          {collapsed ? <ChevronRight size={15} /> : <ChevronLeft size={15} />}
        </button>
      </div>

      {/* Logo — fixo */}
      <div className="flex items-center gap-2 px-4 py-5 border-b border-slate-800 shrink-0">
        <Image
          src="/assets/logo2.png"
          alt="CMB"
          width={32}
          height={32}
          className="object-contain shrink-0"
        />
        {!collapsed && (
          <span className="text-white font-semibold text-sm truncate">CMB Gestão</span>
        )}
      </div>

      {/* Nav — scrollable */}
      <nav className="flex-1 overflow-y-auto overflow-x-hidden py-4 px-2 space-y-1 scrollbar-none">
        {navGroups.map((group) => (
          <div key={group.title}>
            {collapsed
              ? <div className="my-2 mx-1 border-t border-slate-700/60" />
              : <p className="sidebar-link-group">{group.title}</p>
            }
            {group.items
              .filter((item) => (!item.adminOnly || isAdminOrOwner) && (!item.flowOnly || fluxoSistema === item.flowOnly))
              .map((item) => {
                const Icon = item.icon
                const isActive =
                  pathname === item.href ||
                  (item.href !== '/pagamentos' &&
                    item.href !== '/recebimentos' &&
                    pathname.startsWith(item.href))

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    title={collapsed ? item.label : undefined}
                    className={cn(
                      'sidebar-link',
                      isActive && 'active',
                      collapsed && 'justify-center px-0'
                    )}
                  >
                    <Icon size={16} className="shrink-0" />
                    {!collapsed && <span>{item.label}</span>}
                  </Link>
                )
              })}
          </div>
        ))}
      </nav>

      {/* Footer */}
      {!collapsed && (
        <div className="px-4 py-3 border-t border-slate-800 shrink-0">
          <p className="text-xs text-slate-600">CMB Gestão © {new Date().getFullYear()}</p>
        </div>
      )}
    </aside>
  )
}
