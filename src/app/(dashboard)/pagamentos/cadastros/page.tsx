import Link from 'next/link'
import { Users, Tag, Landmark, FileText, Package, ShoppingCart } from 'lucide-react'

const cadastros = [
  {
    href: '/pagamentos/fornecedores',
    icon: Users,
    title: 'Fornecedores',
    description: 'Cadastre e gerencie fornecedores e parceiros com CNPJ/CPF, endereço e chave PIX.',
    color: 'bg-blue-50 text-blue-600',
  },
  {
    href: '/pagamentos/categorias',
    icon: Tag,
    title: 'Categorias',
    description: 'Defina categorias de despesa por empresa para organizar os pedidos.',
    color: 'bg-purple-50 text-purple-600',
  },
  {
    href: '/pagamentos/contas',
    icon: Landmark,
    title: 'Contas Pagadoras',
    description: 'Gerencie as contas bancárias utilizadas para efetuar os pagamentos.',
    color: 'bg-green-50 text-green-600',
  },
  {
    href: '/pagamentos/modelos-contrato',
    icon: FileText,
    title: 'Modelos de Contrato',
    description: 'Armazene templates DOCX estáticos ou variáveis para geração de contratos.',
    color: 'bg-orange-50 text-orange-600',
  },
  {
    href: '/pagamentos/registrar-orcamento',
    icon: ShoppingCart,
    title: 'Registrar Orçamento',
    description: 'Registre orçamentos mensais por empresa e categoria de despesa.',
    color: 'bg-rose-50 text-rose-600',
  },
  {
    href: '/pagamentos/orcamento',
    icon: Package,
    title: 'Acompanhar Orçamento',
    description: 'Visualize o orçamento vs. realizado com saldo por empresa, categoria e mês.',
    color: 'bg-teal-50 text-teal-600',
  },
]

export default function CadastrosPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title">Controle de Cadastros</h1>
        <p className="page-subtitle">Central de configurações e tabelas de apoio do módulo de pagamentos</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {cadastros.map(c => {
          const Icon = c.icon
          return (
            <Link key={c.href} href={c.href}
              className="card hover:shadow-md transition-shadow group flex flex-col gap-3">
              <div className={`w-10 h-10 rounded-lg ${c.color} flex items-center justify-center`}>
                <Icon size={20} />
              </div>
              <div>
                <h2 className="font-semibold text-slate-900 group-hover:text-blue-600 transition-colors">
                  {c.title}
                </h2>
                <p className="text-sm text-slate-500 mt-1">{c.description}</p>
              </div>
              <div className="mt-auto text-xs text-blue-500 font-medium group-hover:underline">
                Acessar →
              </div>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
