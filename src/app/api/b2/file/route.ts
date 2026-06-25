import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { downloadFileById } from '@/lib/b2'

// GET /api/b2/file?fileId=xxx — proxy B2 file for inline viewing
export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const fileId = req.nextUrl.searchParams.get('fileId')
  if (!fileId) return NextResponse.json({ error: 'fileId obrigatório' }, { status: 400 })

  try {
    const { content, contentType, fileName } = await downloadFileById(fileId)
    return new NextResponse(new Uint8Array(content), {
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `inline; filename="${encodeURIComponent(fileName)}"`,
      },
    })
  } catch (err) {
    console.error('B2 file proxy error:', err)
    return NextResponse.json({ error: 'Erro ao obter arquivo' }, { status: 500 })
  }
}
