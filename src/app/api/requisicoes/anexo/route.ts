import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { uploadFile, generateFileName } from '@/lib/b2'

// POST /api/requisicoes/anexo — FormData com `file`. Sobe para o B2 e devolve {id, nome};
// quem chama grava a referência em requisicoes(.anexos) / requisicoes_receita(.anexos).
export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  try {
    const file = (await req.formData()).get('file') as File | null
    if (!file) return NextResponse.json({ error: 'Arquivo obrigatório' }, { status: 400 })

    const { fileId } = await uploadFile(
      Buffer.from(await file.arrayBuffer()),
      generateFileName('req', file.name),
      file.type || 'application/octet-stream',
    )
    return NextResponse.json({ ok: true, anexo: { id: fileId, nome: file.name } })
  } catch (err) {
    console.error('Upload anexo requisição error:', err)
    return NextResponse.json({ error: 'Erro ao fazer upload' }, { status: 500 })
  }
}
