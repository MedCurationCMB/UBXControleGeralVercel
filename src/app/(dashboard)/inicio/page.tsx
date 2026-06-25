import Link from 'next/link'
import {
  BarChart3, CheckSquare, Search, FileText, FolderOpen,
  ShoppingCart, Banknote, ClipboardList, CreditCard, Users,
  Building2, Landmark, FileSignature, ShieldCheck, BookOpen,
  TrendingUp, TrendingDown, Tag,
} from 'lucide-react'

interface NavCard {
  label: string
  href: string
  icon: React.ElementType
  external?: boolean
  adminOnly?: boolean
}

interface Section {
  title: string
  columns: NavCard[][]
}

const sections: Section[] = [
  {
    title: 'Módulo de Pagamentos',
    columns: [
      [
        { label: 'Visão Geral', href: '/pagamentos', icon: TrendingDown },
        { label: 'Autorizar Pedidos', href: '/pagamentos/autorizar', icon: CheckSquare, adminOnly: true },
        { label: 'Acompanhar Pedidos', href: '/pagamentos/acompanhar', icon: Search },
        { label: 'Solicitar Pedidos', href: '/pagamentos/solicitar', icon: FileText },
      ],
      [
        { label: 'Categorias', href: '/pagamentos/categorias', icon: Tag },
        { label: 'Fornecedores', href: '/pagamentos/fornecedores', icon: ShoppingCart },
        { label: 'Orçamento de Compras', href: '/pagamentos/orcamento', icon: Banknote },
        { label: 'Registrar Orçamento', href: '/pagamentos/registrar-orcamento', icon: ClipboardList },
      ],
      [
        { label: 'Controle de Pagamentos', href: '/pagamentos/controle', icon: CreditCard },
        { label: 'Gestão de Documentos', href: '/pagamentos/documentos', icon: FolderOpen },
        { label: 'Controle de Cadastros', href: '/pagamentos/cadastros', icon: BarChart3 },
      ],
    ],
  },
  {
    title: 'Módulo de Recebimentos',
    columns: [
      [
        { label: 'Visão Geral', href: '/recebimentos', icon: TrendingUp },
        { label: 'Autorizar Pedidos', href: '/recebimentos/autorizar', icon: CheckSquare, adminOnly: true },
        { label: 'Acompanhar Pedidos', href: '/recebimentos/acompanhar', icon: Search },
        { label: 'Solicitar Pedidos', href: '/recebimentos/solicitar', icon: FileText },
      ],
      [
        { label: 'Categorias', href: '/recebimentos/categorias', icon: Tag },
        { label: 'Clientes', href: '/recebimentos/clientes', icon: Users },
        { label: 'Orçamento de Vendas', href: '/recebimentos/orcamento', icon: Banknote },
        { label: 'Registrar Orçamento', href: '/recebimentos/registrar-orcamento', icon: ClipboardList },
      ],
      [
        { label: 'Controle de Recebimentos', href: '/recebimentos/controle', icon: CreditCard },
        { label: 'Gestão de Documentos', href: '/recebimentos/documentos', icon: FolderOpen },
        { label: 'Controle de Cadastros', href: '/recebimentos/cadastros', icon: BarChart3 },
      ],
    ],
  },
  {
    title: 'Configurações Gerais',
    columns: [
      [
        { label: 'Empresas / Centros de Custo', href: '/empresas', icon: Building2 },
        { label: 'Contas Pagadoras', href: '/pagamentos/contas', icon: Landmark },
      ],
      [
        { label: 'Modelos de Contrato', href: '/pagamentos/modelos-contrato', icon: FileSignature },
      ],
      [
        { label: 'Painel Administrativo', href: '/admin', icon: ShieldCheck, adminOnly: true },
      ],
    ],
  },
]

function Card({ card }: { card: NavCard }) {
  const Icon = card.icon
  const base = 'flex items-center gap-3 px-4 py-3 rounded-lg border border-slate-200 bg-white hover:border-primary-400 hover:bg-primary-50 hover:text-primary-700 transition-all text-sm font-medium text-slate-700 shadow-sm'

  if (card.external) {
    return (
      <a href={card.href} target="_blank" rel="noopener noreferrer" className={base}>
        <Icon size={16} className="shrink-0 text-slate-400" />
        {card.label}
      </a>
    )
  }

  return (
    <Link href={card.href} className={base}>
      <Icon size={16} className="shrink-0 text-slate-400" />
      {card.label}
    </Link>
  )
}

export default function InicioPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="page-title">Página Inicial</h1>
        <p className="page-subtitle">Sistema de Controle — navegação rápida</p>
      </div>

      {sections.map(section => (
        <div key={section.title} className="card space-y-4">
          <h2 className="text-base font-semibold text-slate-800 border-b border-slate-100 pb-3">
            {section.title}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {section.columns.map((col, ci) => (
              <div key={ci} className="space-y-2">
                {col.map(card => (
                  <Card key={card.href} card={card} />
                ))}
              </div>
            ))}
          </div>
        </div>
      ))}

      {/* Ajuda */}
      <div className="card">
        <h2 className="text-base font-semibold text-slate-800 mb-3">Precisa de Ajuda?</h2>
        <a
          href="http://ajudasistemacontrole.cmbcapital.com.br/"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-3 px-4 py-3 rounded-lg border border-slate-200 bg-white hover:border-primary-400 hover:bg-primary-50 hover:text-primary-700 transition-all text-sm font-medium text-slate-700 shadow-sm"
        >
          <BookOpen size={16} className="shrink-0 text-slate-400" />
          Acessar Manual de Instruções Completo
        </a>
      </div>
    </div>
  )
}
