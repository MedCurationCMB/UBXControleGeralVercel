import { NextResponse } from 'next/server'
import { verificar, type UploadJwt } from '@/lib/mcp/oauth'
import { sessaoDe } from '@/lib/mcp/usuario'
import { gravarPdf } from '@/lib/mcp/upload'

export const maxDuration = 60

// POST /api/anexar/<token> — FormData com `file` (um PDF por requisição). A autorização é o token do link, que carrega o usuário.
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const t = await verificar<UploadJwt>('upload', (await params).token)
  const s = t ? await sessaoDe(t.uid, t.pid) : null
  if (!t || !s) return NextResponse.json({ error: 'Link expirado. Peça um novo ao Claude.' }, { status: 401 })

  const file = (await req.formData().catch(() => null))?.get('file')
  if (!(file instanceof File)) return NextResponse.json({ error: 'Arquivo obrigatório' }, { status: 400 })
  try {
    const erro = await gravarPdf(s, t, file)
    return erro ? NextResponse.json({ error: erro }, { status: 422 }) : NextResponse.json({ ok: true })
  } catch (e) {
    console.error('Upload por link falhou:', e)
    return NextResponse.json({ error: 'Erro ao enviar o arquivo.' }, { status: 500 })
  }
}
