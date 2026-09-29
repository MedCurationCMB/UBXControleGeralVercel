import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { id } = await params
  const supabase = createServerClient()

  const { data: extrato } = await supabase
    .from('extratos_bancarios')
    .select('id, conta, periodo_inicio, periodo_fim, saldo_inicial, saldo_final, formato_origem, nome_arquivo, criado_em')
    .eq('id', id)
    .eq('projeto_id', session.projetoId)
    .maybeSingle()

  if (!extrato) return NextResponse.json({ error: 'Extrato não encontrado' }, { status: 404 })

  const { data: lancamentos, error } = await supabase
    .from('extratos_bancarios_lancamentos')
    .select('id, data, descricao, valor, saldo_apos, codigo_origem')
    .eq('extrato_id', id)
    .order('data', { ascending: true })
    .order('id', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ extrato, lancamentos })
}
