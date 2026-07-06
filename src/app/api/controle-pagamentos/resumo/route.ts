import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'

interface ControleRow {
  valor_pagar: number | null
  valor_pagamento: number | null
  data_vencimento: string | null
}

function getSituacao(c: ControleRow): string {
  if (c.valor_pagamento != null && c.valor_pagar != null && c.valor_pagamento >= c.valor_pagar) return 'Quitado'
  if (!c.data_vencimento) return 'Sem vencimento'
  const venc = new Date(c.data_vencimento + 'T12:00:00')
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0)
  return venc < hoje ? 'Atrasado' : 'Em dia'
}

async function fetchAllPedidoIds(
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

export async function GET(req: NextRequest) {
  const supabase = createServerClient()
  const { searchParams } = req.nextUrl
  const empresa = searchParams.get('empresa') || ''
  const categoria = searchParams.get('categoria') || ''
  const status_pagamento = searchParams.get('status_pagamento') || ''

  let pedidoIds: number[] | null = null
  if (empresa || categoria) {
    pedidoIds = await fetchAllPedidoIds(supabase, empresa, categoria)
    if (pedidoIds.length === 0) {
      return NextResponse.json({
        total_pagar: 0, total_pago: 0, saldo_restante: 0,
        total_vencido: 0, count_vencido: 0, count_total: 0,
      })
    }
  }

  const PAGE = 1000
  let offset = 0
  const all: ControleRow[] = []

  while (true) {
    let q = supabase
      .from('controle_pagamentos')
      .select('valor_pagar, valor_pagamento, data_vencimento')
      .range(offset, offset + PAGE - 1)

    if (pedidoIds) q = q.in('pedido_id', pedidoIds)
    if (status_pagamento) q = q.eq('status_pagamento', parseInt(status_pagamento))

    const { data, error } = await q
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    const batch = (data ?? []) as ControleRow[]
    all.push(...batch)
    if (batch.length < PAGE) break
    offset += PAGE
  }

  let total_pagar = 0, total_pago = 0, total_vencido = 0, count_vencido = 0
  for (const c of all) {
    total_pagar += c.valor_pagar ?? 0
    total_pago += c.valor_pagamento ?? 0
    if (getSituacao(c) === 'Atrasado') {
      count_vencido++
      total_vencido += (c.valor_pagar ?? 0) - (c.valor_pagamento ?? 0)
    }
  }

  return NextResponse.json({
    total_pagar,
    total_pago,
    saldo_restante: total_pagar - total_pago,
    total_vencido,
    count_vencido,
    count_total: all.length,
  })
}
