import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase/server'
import { CONTAS, erroVinculo, tipoDoValor } from '@/lib/extratoVinculo'

// Linha do extrato (do projeto da sessão) -> { id, data, valor }
async function carregarLancamento(supabase: ReturnType<typeof createServerClient>, projetoId: number, id: number) {
  const { data } = await supabase
    .from('extratos_bancarios_lancamentos')
    .select('id, data, valor, extratos_bancarios!inner(projeto_id)')
    .eq('id', id)
    .eq('extratos_bancarios.projeto_id', projetoId)
    .maybeSingle()
  return data as { id: number; data: string; valor: number } | null
}

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { lancamento_id, conta_id } = await req.json().catch(() => ({}))
  if (!Number.isInteger(lancamento_id) || !Number.isInteger(conta_id)) {
    return NextResponse.json({ error: 'lancamento_id e conta_id são obrigatórios' }, { status: 400 })
  }

  const supabase = createServerClient()
  const l = await carregarLancamento(supabase, session.projetoId, lancamento_id)
  if (!l) return NextResponse.json({ error: 'Linha do extrato não encontrada' }, { status: 404 })

  const { tabela } = CONTAS[tipoDoValor(l.valor)]
  const { data: c } = await supabase
    .from(tabela)
    .select('id, extrato_lancamento_id, data_vencimento, data_pagamento, valor_pagar, valor_pagamento')
    .eq('id', conta_id)
    .eq('projeto_id', session.projetoId)
    .maybeSingle()
  if (!c) return NextResponse.json({ error: 'Conta não encontrada' }, { status: 404 })
  if (c.extrato_lancamento_id) return NextResponse.json({ error: 'Essa conta já está vinculada a outra linha do extrato.' }, { status: 409 })

  const erro = erroVinculo(l, { ...c, parte: '', empresa: '' })
  if (erro) return NextResponse.json({ error: erro }, { status: 422 })

  // o índice único parcial barra a linha do extrato já usada por outra conta (23505)
  const { error } = await supabase
    .from(tabela)
    .update({ extrato_lancamento_id: l.id })
    .eq('id', conta_id)
    .eq('projeto_id', session.projetoId)
    .is('extrato_lancamento_id', null)
  if (error) {
    const jaUsada = error.code === '23505'
    return NextResponse.json(
      { error: jaUsada ? 'Essa linha do extrato já está vinculada a outra conta.' : error.message },
      { status: jaUsada ? 409 : 500 }
    )
  }
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { lancamento_id } = await req.json().catch(() => ({}))
  if (!Number.isInteger(lancamento_id)) return NextResponse.json({ error: 'lancamento_id é obrigatório' }, { status: 400 })

  const supabase = createServerClient()
  const l = await carregarLancamento(supabase, session.projetoId, lancamento_id)
  if (!l) return NextResponse.json({ error: 'Linha do extrato não encontrada' }, { status: 404 })

  const { error } = await supabase
    .from(CONTAS[tipoDoValor(l.valor)].tabela)
    .update({ extrato_lancamento_id: null })
    .eq('extrato_lancamento_id', l.id)
    .eq('projeto_id', session.projetoId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
