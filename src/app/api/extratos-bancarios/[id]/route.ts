import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase/server'
import { carregarExtrato } from '@/lib/extratoVinculo'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { id } = await params
  try {
    const r = await carregarExtrato(createServerClient(), session.projetoId, id)
    if (!r) return NextResponse.json({ error: 'Extrato não encontrado' }, { status: 404 })
    return NextResponse.json(r)
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
