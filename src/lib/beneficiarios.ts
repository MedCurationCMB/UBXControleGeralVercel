import type { createServerClient } from '@/lib/supabase/server'
import { CONTAS, type TipoConta } from '@/lib/extratoVinculo'

// Beneficiários possíveis de cada pedido: o fornecedor/cliente do pedido (primeiro) + os informados no fluxo.
export async function beneficiariosPorPedido(supabase: ReturnType<typeof createServerClient>, tipo: TipoConta, pedidoIds: number[]) {
  const { pedido, fluxo, parte, benef } = CONTAS[tipo]
  const out = new Map<number, string[]>()
  for (let i = 0; i < pedidoIds.length; i += 200) {
    const ids = pedidoIds.slice(i, i + 200)
    const [{ data: peds }, { data: fl }] = await Promise.all([
      supabase.from(pedido).select(`id, ${parte}`).in('id', ids),
      supabase.from(fluxo).select(`pedido_id, ${benef}`).in('pedido_id', ids),
    ])
    for (const p of (peds ?? []) as unknown as Record<string, unknown>[]) out.set(p.id as number, [p[parte] as string])
    for (const r of (fl ?? []) as unknown as Record<string, unknown>[]) {
      const lista = out.get(r.pedido_id as number)
      const b = r[benef] as string | null
      if (lista && b && !lista.includes(b)) lista.push(b)
    }
  }
  return out
}
