import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase/server'

// Dados (data/descrição/valor) das linhas do extrato por id, para as telas que mostram o vínculo.
export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { ids } = await req.json().catch(() => ({}))
  if (!Array.isArray(ids) || !ids.every(Number.isInteger)) return NextResponse.json({ error: 'ids inválidos' }, { status: 400 })

  const supabase = createServerClient()
  const lancamentos: { id: number; data: string; descricao: string; valor: number }[] = []
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await supabase
      .from('extratos_bancarios_lancamentos')
      .select('id, data, descricao, valor, extratos_bancarios!inner(projeto_id)')
      .eq('extratos_bancarios.projeto_id', session.projetoId)
      .in('id', ids.slice(i, i + 200))
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    for (const l of data ?? []) lancamentos.push({ id: l.id as number, data: l.data as string, descricao: l.descricao as string, valor: l.valor as number })
  }
  return NextResponse.json({ lancamentos })
}
