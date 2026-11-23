import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase/server'
import { importarExtrato } from '@/lib/extratoImportacao'

export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('extratos_bancarios')
    .select('id, conta, periodo_inicio, periodo_fim, saldo_inicial, saldo_final, formato_origem, nome_arquivo, criado_em')
    .eq('projeto_id', session.projetoId)
    .order('periodo_inicio', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ extratos: data })
}

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const form = await req.formData()
  const file = form.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'Arquivo obrigatório' }, { status: 400 })

  const r = await importarExtrato(createServerClient(), session.projetoId, session.username, file.name, Buffer.from(await file.arrayBuffer()))
  if ('erro' in r) return NextResponse.json({ error: r.erro, ...(r.duplicado && { duplicado: true }) }, { status: r.status })
  return NextResponse.json({ duplicado: false, extrato: r.extrato, lancamentos: r.lancamentos })
}
