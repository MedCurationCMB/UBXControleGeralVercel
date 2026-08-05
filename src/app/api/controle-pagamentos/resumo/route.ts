import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { getSituacao, fetchAllPedidoIds, type ControleRow } from '@/lib/controle-pagamentos-server'

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
