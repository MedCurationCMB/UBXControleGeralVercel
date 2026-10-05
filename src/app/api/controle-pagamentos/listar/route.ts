import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { getSituacao, consultaControles, type FiltrosControle } from '@/lib/controle-pagamentos-server'
import { getSession } from '@/lib/auth'

interface Pedido {
  empresa: string; categoria: string; fornecedor: string; status: string; observacao: string | null
}
interface Controle {
  id: number; pedido_id: number | null
  data_vencimento: string | null; valor_pagar: number | null
  data_pagamento: string | null; valor_pagamento: number | null
  status_pagamento: number | null; tipo_pagamento: number | null
  extrato_lancamento_id: number | null; fornecedor_beneficiario: string | null
  pedidos_solicitados: Pedido | null
}

const FETCH_PAGE = 1000

// Anexa data/descrição da linha do extrato vinculada a cada conta
async function comExtrato<T extends { extrato_lancamento_id: number | null }>(supabase: ReturnType<typeof createServerClient>, rows: T[]) {
  const ids = [...new Set(rows.map(r => r.extrato_lancamento_id).filter((x): x is number => x != null))]
  const porId = new Map<number, { data: string; descricao: string }>()
  if (ids.length) {
    const { data } = await supabase.from('extratos_bancarios_lancamentos').select('id, data, descricao').in('id', ids)
    for (const l of data ?? []) porId.set(l.id as number, { data: l.data as string, descricao: l.descricao as string })
  }
  return rows.map(r => ({ ...r, extrato: r.extrato_lancamento_id != null ? porId.get(r.extrato_lancamento_id) ?? null : null }))
}

function montarLinha({ pedidos_solicitados: ped, ...c }: Controle) {
  return {
    ...c,
    empresa: ped?.empresa ?? '',
    categoria: ped?.categoria ?? '',
    fornecedor: c.fornecedor_beneficiario ?? ped?.fornecedor ?? '', // quem recebe
    status_pedido: ped?.status ?? '',
    observacao: ped?.observacao ?? null,
    situacao: getSituacao(c),
  }
}

async function fetchAllControles(supabase: ReturnType<typeof createServerClient>, projetoId: number, f: FiltrosControle) {
  const all: Controle[] = []
  for (let offset = 0; ; offset += FETCH_PAGE) {
    const { data, error } = await consultaControles(supabase, projetoId, f, '*', { comPedido: true })
      .order('id', { ascending: false })
      .range(offset, offset + FETCH_PAGE - 1)
    if (error) throw new Error(error.message)
    const batch = (data ?? []) as unknown as Controle[]
    all.push(...batch)
    if (batch.length < FETCH_PAGE) return all
  }
}

export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  const projetoId = session.projetoId
  const supabase = createServerClient()
  const { searchParams } = req.nextUrl
  const filtros: FiltrosControle = {
    empresa: searchParams.get('empresa') || '',
    categoria: searchParams.get('categoria') || '',
    status_pagamento: searchParams.get('status_pagamento') || '',
    vinculo: searchParams.get('vinculo') || '',
    pedido_id: parseInt(searchParams.get('pedido_id') || '') || undefined,
  }
  const situacao = searchParams.get('situacao') || ''
  const isExport = searchParams.get('export') === 'true'
  const page = parseInt(searchParams.get('page') || '0')
  const pageSize = parseInt(searchParams.get('page_size') || '100')

  // Export, ou filtro por situação (campo calculado): resolve tudo antes de paginar.
  if (isExport || situacao) {
    let all: Controle[]
    try {
      all = await fetchAllControles(supabase, projetoId, filtros)
    } catch (error) {
      return NextResponse.json({ error: (error as Error).message }, { status: 500 })
    }
    const rows = all.map(montarLinha).filter(r => !situacao || r.situacao === situacao)
    if (isExport) return NextResponse.json({ rows: await comExtrato(supabase, rows), total: rows.length })
    return NextResponse.json({ rows: await comExtrato(supabase, rows.slice(page * pageSize, (page + 1) * pageSize)), total: rows.length })
  }

  // Sem filtro de situação: pagina direto no banco.
  const { data, count, error } = await consultaControles(supabase, projetoId, filtros, '*', { comPedido: true, count: true })
    .order('id', { ascending: false })
    .range(page * pageSize, (page + 1) * pageSize - 1)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ rows: await comExtrato(supabase, ((data ?? []) as unknown as Controle[]).map(montarLinha)), total: count ?? 0 })
}
