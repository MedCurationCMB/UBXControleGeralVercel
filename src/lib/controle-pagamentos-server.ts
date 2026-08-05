import { createServerClient } from '@/lib/supabase/server'

export interface ControleRow {
  valor_pagar: number | null
  valor_pagamento: number | null
  data_vencimento: string | null
}

export function getSituacao(c: ControleRow): string {
  if (c.valor_pagamento != null && c.valor_pagar != null && c.valor_pagamento >= c.valor_pagar) return 'Quitado'
  if (!c.data_vencimento) return 'Sem vencimento'
  const venc = new Date(c.data_vencimento + 'T12:00:00')
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0)
  return venc < hoje ? 'Atrasado' : 'Em dia'
}

export async function fetchAllPedidoIds(
  supabase: ReturnType<typeof createServerClient>,
  empresa: string,
  categoria: string
): Promise<number[]> {
  const PAGE = 1000
  let offset = 0
  const ids: number[] = []
  while (true) {
    let q = supabase.from('pedidos_solicitados').select('id').range(offset, offset + PAGE - 1)
    if (empresa) q = q.eq('empresa', empresa)
    if (categoria) q = q.eq('categoria', categoria)
    const { data } = await q
    const batch = (data ?? []) as { id: number }[]
    ids.push(...batch.map(p => p.id))
    if (batch.length < PAGE) break
    offset += PAGE
  }
  return ids
}
