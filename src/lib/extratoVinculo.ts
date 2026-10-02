// Regras do vinculo extrato <-> contas a pagar/receber. Saida (valor < 0) so vincula a conta a pagar,
// entrada (valor > 0) so a conta a receber. Valor tem que ser igual; se a conta ja tem data de pagamento,
// ela tem que ser a data do extrato (sem data de pagamento, so o vencimento serve de pista para sugerir).
import type { createServerClient } from '@/lib/supabase/server'

export type TipoConta = 'pagar' | 'receber'

export const CONTAS = {
  pagar: {
    tabela: 'controle_pagamentos', pedido: 'pedidos_solicitados', fluxo: 'pedidos_solicitados_fluxo',
    parte: 'fornecedor', benef: 'fornecedor_beneficiario', status: 'status_pagamento',
  },
  receber: {
    tabela: 'controle_recebimento', pedido: 'pedidos_solicitados_receita', fluxo: 'pedidos_solicitados_fluxo_receita',
    parte: 'cliente', benef: 'cliente_beneficiario', status: 'status_recebimento',
  },
} as const

export const tipoDoValor = (valor: number): TipoConta => (valor < 0 ? 'pagar' : 'receber')

export interface ContaLivre {
  id: number
  parte: string
  empresa: string
  data_vencimento: string | null
  data_pagamento: string | null
  valor_pagar: number | null
  valor_pagamento: number | null
}

export interface Candidato extends ContaLivre {
  valor: number
  sugerido: boolean // data do extrato bate com a data de pagamento (ou, sem ela, com o vencimento)
}

const cents = (n: number) => Math.round(n * 100)
const valorDaConta = (c: Pick<ContaLivre, 'valor_pagar' | 'valor_pagamento'>) => c.valor_pagamento ?? c.valor_pagar ?? 0

export function erroVinculo(l: { data: string; valor: number }, c: ContaLivre): string | null {
  if (cents(valorDaConta(c)) !== cents(Math.abs(l.valor))) return 'O valor da conta é diferente do valor da linha do extrato.'
  if (c.data_pagamento && c.data_pagamento.slice(0, 10) !== l.data) return 'A data de pagamento da conta é diferente da data da linha do extrato.'
  return null
}

const PAGE = 1000

// ponytail: traz todas as contas sem vinculo do projeto e filtra em memoria; filtrar por valor no banco
// se passar de alguns milhares de contas abertas.
export async function carregarContasLivres(
  supabase: ReturnType<typeof createServerClient>,
  projetoId: number,
  tipo: TipoConta
): Promise<ContaLivre[]> {
  const { tabela, pedido, parte, benef } = CONTAS[tipo]
  const out: ContaLivre[] = []
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await supabase
      .from(tabela)
      .select(`id, data_vencimento, data_pagamento, valor_pagar, valor_pagamento, ${benef}, ${pedido}(empresa, ${parte})`)
      .eq('projeto_id', projetoId)
      .is('extrato_lancamento_id', null)
      .order('id')
      .range(offset, offset + PAGE - 1)
    if (error) throw new Error(error.message)
    for (const r of (data ?? []) as unknown as Record<string, unknown>[]) {
      const ped = (r[pedido] ?? {}) as Record<string, string>
      out.push({
        id: r.id as number,
        parte: (r[benef] as string | null) ?? ped[parte] ?? '',
        empresa: ped.empresa ?? '',
        data_vencimento: r.data_vencimento as string | null,
        data_pagamento: r.data_pagamento as string | null,
        valor_pagar: r.valor_pagar as number | null,
        valor_pagamento: r.valor_pagamento as number | null,
      })
    }
    if (!data || data.length < PAGE) return out
  }
}

const dias = (iso: string) => Date.parse(iso.slice(0, 10)) / 86400000

export function candidatos(l: { data: string; valor: number }, contas: ContaLivre[], max = 10): Candidato[] {
  return contas
    .filter(c => erroVinculo(l, c) === null)
    .map(c => {
      const dataChave = c.data_pagamento ?? c.data_vencimento
      return {
        c: { ...c, valor: valorDaConta(c), sugerido: dataChave?.slice(0, 10) === l.data },
        dist: dataChave ? Math.abs(dias(dataChave) - dias(l.data)) : Infinity,
      }
    })
    .sort((a, b) => a.dist - b.dist)
    .slice(0, max)
    .map(x => x.c)
}
