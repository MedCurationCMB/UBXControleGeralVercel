import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { supabaseServer } from '@/lib/supabase/server'
import { downloadFileById } from '@/lib/b2'

export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id obrigatório' }, { status: 400 })

  try {
    const { data: modelo, error } = await supabaseServer
      .from('modelo_contrato')
      .select('nome, arquivo_id')
      .eq('id', id)
      .single()

    if (error || !modelo) return NextResponse.json({ error: 'Modelo não encontrado' }, { status: 404 })

    const { content, contentType } = await downloadFileById(modelo.arquivo_id)
    const safeName = encodeURIComponent(`${modelo.nome}.docx`)

    return new NextResponse(new Uint8Array(content), {
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${safeName}"`,
      },
    })
  } catch (err) {
    console.error('Download modelo contrato error:', err)
    return NextResponse.json({ error: 'Erro ao baixar arquivo' }, { status: 500 })
  }
}
