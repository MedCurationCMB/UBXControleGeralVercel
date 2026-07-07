import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase/server'
import { uploadFile } from '@/lib/b2'

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { file_name, pdf_base64 }: { file_name: string; pdf_base64: string } = await req.json()
  if (!file_name || !pdf_base64) {
    return NextResponse.json({ error: 'file_name e pdf_base64 são obrigatórios' }, { status: 400 })
  }

  const buffer = Buffer.from(pdf_base64, 'base64')

  try {
    const { fileId } = await uploadFile(buffer, file_name, 'application/pdf')

    const supabase = createServerClient()
    await supabase.from('documentos').insert({
      pedido_id: null,
      pagamento_id: null,
      usuario: session.username,
      tipo_documento: -5,
      anexo_id: fileId,
      nome_documento: file_name,
      data_upload: new Date().toISOString(),
    })

    return NextResponse.json({ ok: true, b2_file_id: fileId })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
