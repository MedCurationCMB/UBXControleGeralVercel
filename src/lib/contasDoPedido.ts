import { supabaseBrowser as supabase } from '@/lib/supabase/client'
import { CONTAS, type TipoConta } from '@/lib/extratoVinculo'
import { contasPorBeneficiario } from '@/lib/contasPorBeneficiario'

// Ao autorizar um pedido, cria a(s) conta(s) a pagar/receber conforme o fluxo: uma por beneficiário, no mesmo pedido.
// Pedido com um beneficiário só (todos os normais) = uma conta pelo valor do pedido, como sempre foi.
export async function criarContasDoPedido(tipo: TipoConta, pedidoId: number, partePedido: string, valorPedido: number) {
  const { tabela, fluxo, benef, status } = CONTAS[tipo]
  const { data: ex } = await supabase.from(tabela).select('id').eq('pedido_id', pedidoId).limit(1)
  if (ex?.length) return

  const { data: linhas } = await supabase.from(fluxo).select(`valor_referente, ${benef}`).eq('pedido_id', pedidoId)
  const contas = contasPorBeneficiario(
    ((linhas ?? []) as unknown as Record<string, unknown>[]).map(r => ({ valor_referente: Number(r.valor_referente), beneficiario: r[benef] as string | null })),
    partePedido, valorPedido
  )
  for (const c of contas) {
    await supabase.from(tabela).insert({ pedido_id: pedidoId, valor_pagar: c.valor, [status]: 1, [benef]: c.beneficiario })
  }
}
