import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase/server'
import { importarRetorno } from '@/lib/remessa'

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const file = (await req.formData()).get('file') as File | null
  if (!file) return NextResponse.json({ error: 'Arquivo obrigatório' }, { status: 400 })

  const r = await importarRetorno(createServerClient(), session.projetoId, session.username, file.name, Buffer.from(await file.arrayBuffer()))
  if ('erro' in r) return NextResponse.json({ error: r.erro }, { status: r.status })
  return NextResponse.json({ ok: true, records: r.records, updated_count: r.updatedCount, b2_file_id: r.fileId })
}
