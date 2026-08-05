import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { getSituacao, fetchAllPedidoIds } from '@/lib/controle-pagamentos-server'

interface Controle {
  id: number; pedido_id: number | null
  data_vencimento: string | null; valor_pagar: number | null
  data_pagamento: string | null; valor_pagamento: number | null
  status_pagamento: number | null; tipo_pagamento: number | null
}

interface Pedido {
  id: number; empresa: string; categoria: string; fornecedor: string
  valor_pedido: number; status: string; observacao: string | null; cancelado: boolean
}

const FETCH_PAGE = 1000

async function enrich(supabase: ReturnType<typeof createServerClient>, ctrls: Controle[]) {
  const uniquePedidoIds = [...new Set(ctrls.filter(c => c.pedido_id).map(c => c.pedido_id as number))]
  const pedidoMap: Record<number, Pedido> = {}
  if (uniquePedidoIds.length > 0) {
    const { data: peds } = await supabase
      .from('pedidos_solicitados')
      .select('id, empresa, categoria, fornecedor, valor_pedido, status, observacao, cancelado')
      .in('id', uniquePedidoIds)
    ;(peds ?? []).forEach((p: Pedido) => { pedidoMap[p.id] = p })
  }
  return ctrls.map(c => {
    const ped = c.pedido_id ? pedidoMap[c.pedido_id] : undefined
    return {
      ...c,
      empresa: ped?.empresa ?? '',
      categoria: ped?.categoria ?? '',
      fornecedor: ped?.fornecedor ?? '',
      status_pedido: ped?.status ?? '',
      observacao: ped?.observacao ?? null,
      situacao: getSituacao(c),
    }
  })
}

export async function GET(req: NextRequest) {
  const supabase = createServerClient()
  const { searchParams } = req.nextUrl
  const empresa = searchParams.get('empresa') || ''
  const categoria = searchParams.get('categoria') || ''
  const status_pagamento = searchParams.get('status_pagamento') || ''
  const situacao = searchParams.get('situacao') || ''
  const page = parseInt(searchParams.get('page') || '0')
  const pageSize = parseInt(searchParams.get('page_size') || '100')

  let pedidoIds: number[] | null = null
  if (empresa || categoria) {
    pedidoIds = await fetchAllPedidoIds(supabase, empresa, categoria)
    if (pedidoIds.length === 0) {
      return NextResponse.json({ rows: [], total: 0 })
    }
  }

  // Fast path: no situacao filter — paginate directly in the database.
  if (!situacao) {
    let q = supabase
      .from('controle_pagamentos')
      .select('*', { count: 'exact' })
      .order('id', { ascending: false })
      .range(page * pageSize, (page + 1) * pageSize - 1)

    if (pedidoIds) q = q.in('pedido_id', pedidoIds)
    if (status_pagamento) q = q.eq('status_pagamento', parseInt(status_pagamento))

    const { data, count, error } = await q
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const rows = await enrich(supabase, (data ?? []) as Controle[])
    return NextResponse.json({ rows, total: count ?? 0 })
  }

  // situacao is a computed field, so matching rows must be resolved before paginating.
  let offset = 0
  const all: Controle[] = []
  while (true) {
    let q = supabase
      .from('controle_pagamentos')
      .select('*')
      .order('id', { ascending: false })
      .range(offset, offset + FETCH_PAGE - 1)

    if (pedidoIds) q = q.in('pedido_id', pedidoIds)
    if (status_pagamento) q = q.eq('status_pagamento', parseInt(status_pagamento))

    const { data, error } = await q
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    const batch = (data ?? []) as Controle[]
    all.push(...batch)
    if (batch.length < FETCH_PAGE) break
    offset += FETCH_PAGE
  }

  const filtered = all.filter(c => getSituacao(c) === situacao)
  const total = filtered.length
  const pageSlice = filtered.slice(page * pageSize, (page + 1) * pageSize)
  const rows = await enrich(supabase, pageSlice)

  return NextResponse.json({ rows, total })
}
