import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase/server'
import { gerarRemessa, type TransactionInput } from '@/lib/remessa'

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  let conta_id: number, txInputs: TransactionInput[]
  try {
    const body = await req.json()
    conta_id = body.conta_id
    txInputs = body.transactions
  } catch {
    return NextResponse.json({ error: 'Body inválido ou vazio' }, { status: 400 })
  }

  if (!conta_id || !txInputs?.length) {
    return NextResponse.json({ error: 'conta_id e transactions são obrigatórios' }, { status: 400 })
  }

  const r = await gerarRemessa(createServerClient(), session.projetoId, session.username, conta_id, txInputs)
  if ('erro' in r) return NextResponse.json({ error: r.erro }, { status: r.status })
  return NextResponse.json({ ok: true, file_name: r.fileName, file_content: r.content, sequencial: r.sequencial, b2_file_id: r.fileId, updated_count: r.count })
}
