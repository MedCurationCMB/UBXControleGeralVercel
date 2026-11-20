import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase/server'
import { CONTAS, carregarContasLivres, carregarLancamento, contasDoDia, desvincular, tipoDoValor, vincular } from '@/lib/extratoVinculo'

// Linhas do extrato (saída p/ conta a pagar, entrada p/ conta a receber), ainda sem vínculo, compatíveis com uma conta
// (mesmo valor e, se a conta já tem data de pagamento, mesma data). Mais próximas da data da conta primeiro.
export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const supabase = createServerClient()

  // Por linha do extrato: contas livres do dia (mesmo sentido) para marcar e somar até fechar o valor
  if (req.nextUrl.searchParams.has('lancamento_id')) {
    const l = await carregarLancamento(supabase, session.projetoId, Number(req.nextUrl.searchParams.get('lancamento_id')))
    if (!l) return NextResponse.json({ error: 'Linha do extrato não encontrada' }, { status: 404 })
    try {
      return NextResponse.json({ contas: contasDoDia(l, await carregarContasLivres(supabase, session.projetoId, tipoDoValor(l.valor))) })
    } catch (e) {
      return NextResponse.json({ error: (e as Error).message }, { status: 500 })
    }
  }

  const contaId = Number(req.nextUrl.searchParams.get('conta_id'))
  if (!Number.isInteger(contaId)) return NextResponse.json({ error: 'conta_id é obrigatório' }, { status: 400 })

  const tipo = req.nextUrl.searchParams.get('tipo') === 'receber' ? 'receber' : 'pagar'
  const { tabela } = CONTAS[tipo]
  const { data: c } = await supabase
    .from(tabela)
    .select('data_vencimento, data_pagamento, valor_pagar, valor_pagamento')
    .eq('id', contaId)
    .eq('projeto_id', session.projetoId)
    .maybeSingle()
  if (!c) return NextResponse.json({ error: 'Conta não encontrada' }, { status: 404 })

  const valor = Math.round((c.valor_pagamento ?? c.valor_pagar ?? 0) * 100) / 100
  let q = supabase
    .from('extratos_bancarios_lancamentos')
    .select('id, data, descricao, valor, extratos_bancarios!inner(projeto_id)')
    .eq('extratos_bancarios.projeto_id', session.projetoId)
    .eq('valor', tipo === 'pagar' ? -valor : valor)
  if (c.data_pagamento) q = q.eq('data', c.data_pagamento)
  const { data: ls, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const ids = (ls ?? []).map(l => l.id as number)
  const { data: usados } = ids.length
    ? await supabase.from(tabela).select('extrato_lancamento_id').in('extrato_lancamento_id', ids)
    : { data: [] }
  const usadosSet = new Set((usados ?? []).map(u => u.extrato_lancamento_id as number))

  const dataChave = c.data_pagamento ?? c.data_vencimento
  const dist = (d: string) => (dataChave ? Math.abs(Date.parse(d) - Date.parse(dataChave)) : 0)
  const lancamentos = (ls ?? [])
    .filter(l => !usadosSet.has(l.id as number))
    .map(l => ({ id: l.id as number, data: l.data as string, descricao: l.descricao as string, valor: l.valor as number, sugerido: l.data === dataChave }))
    .sort((a, b) => dist(a.data) - dist(b.data))
    .slice(0, 20)
  const { data: periodos } = await supabase
    .from('extratos_bancarios')
    .select('periodo_inicio, periodo_fim')
    .eq('projeto_id', session.projetoId)
    .order('periodo_inicio')
  return NextResponse.json({ lancamentos, periodos: periodos ?? [] })
}

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  // conta_ids (várias contas na mesma linha) ou conta_id (uma só)
  const { lancamento_id, conta_id, conta_ids } = await req.json().catch(() => ({}))
  const ids: unknown[] = Array.isArray(conta_ids) ? conta_ids : [conta_id]
  if (!Number.isInteger(lancamento_id) || ids.length === 0 || !ids.every(Number.isInteger)) {
    return NextResponse.json({ error: 'lancamento_id e conta_ids são obrigatórios' }, { status: 400 })
  }
  const e = await vincular(createServerClient(), session.projetoId, lancamento_id, ids as number[])
  return e ? NextResponse.json({ error: e.erro }, { status: e.status }) : NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { lancamento_id } = await req.json().catch(() => ({}))
  if (!Number.isInteger(lancamento_id)) return NextResponse.json({ error: 'lancamento_id é obrigatório' }, { status: 400 })

  const e = await desvincular(createServerClient(), session.projetoId, lancamento_id)
  return e ? NextResponse.json({ error: e.erro }, { status: e.status }) : NextResponse.json({ ok: true })
}
