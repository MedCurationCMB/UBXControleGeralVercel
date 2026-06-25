import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { supabaseServer } from '@/lib/supabase/server'
import { uploadFile, generateFileName } from '@/lib/b2'

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  try {
    const form = await req.formData()
    const file = form.get('file') as File | null
    const nome = (form.get('nome') as string | null)?.trim()
    const estilo = form.get('estilo') as string | null

    if (!file) return NextResponse.json({ error: 'Arquivo obrigatório' }, { status: 400 })
    if (!nome) return NextResponse.json({ error: 'Nome obrigatório' }, { status: 400 })
    if (estilo !== 'variavel' && estilo !== 'estatico')
      return NextResponse.json({ error: 'Estilo inválido' }, { status: 400 })

    const buffer = Buffer.from(await file.arrayBuffer())
    const prefix = `modelo_${estilo}_${nome.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 30)}`
    const fileName = generateFileName(prefix, file.name)
    const contentType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

    const { fileId } = await uploadFile(buffer, fileName, contentType)

    const { error } = await supabaseServer.from('modelo_contrato').insert({
      nome,
      estilo,
      arquivo_id: fileId,
    })
    if (error) throw error

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('Upload modelo contrato error:', err)
    return NextResponse.json({ error: 'Erro ao enviar modelo' }, { status: 500 })
  }
}
