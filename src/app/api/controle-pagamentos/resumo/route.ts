import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { getSituacao, consultaControles, type ControleRow } from '@/lib/controle-pagamentos-server'
import { getSession } from '@/lib/auth'

export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  const supabase = createServerClient()
  const { searchParams } = req.nextUrl
  const empresa = searchParams.get('empresa') || ''
  const categoria = searchParams.get('categoria') || ''
  const status_pagamento = searchParams.get('status_pagamento') || ''

  const filtros = { empresa, categoria, status_pagamento }
  const PAGE = 1000
  const all: ControleRow[] = []
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await consultaControles(supabase, session.projetoId, filtros,
      'valor_pagar, valor_pagamento, data_vencimento', { comPedido: false })
      .order('id')
      .range(offset, offset + PAGE - 1)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    const batch = (data ?? []) as unknown as ControleRow[]
    all.push(...batch)
    if (batch.length < PAGE) break
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
