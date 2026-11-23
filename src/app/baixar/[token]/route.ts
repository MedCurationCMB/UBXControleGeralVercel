import { NextResponse } from 'next/server'
import { downloadFileById } from '@/lib/b2'
import { verificar, type DownloadJwt } from '@/lib/mcp/oauth'
import { sessaoDe } from '@/lib/mcp/usuario'

// GET /baixar/<token> — link que o MCP entrega para baixar remessa, retorno e relatórios. A autorização é o token (usuário + arquivo).
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const t = await verificar<DownloadJwt>('download', (await params).token)
  if (!t || !(await sessaoDe(t.uid, t.pid))) return new NextResponse('Link expirado. Peça um novo ao Claude.', { status: 410 })
  try {
    const f = await downloadFileById(t.fid)
    return new NextResponse(new Uint8Array(f.content), {
      headers: { 'Content-Type': f.contentType, 'Content-Disposition': `attachment; filename="${encodeURIComponent(f.fileName)}"`, 'Cache-Control': 'no-store' },
    })
  } catch {
    return new NextResponse('Arquivo não encontrado.', { status: 404 })
  }
}
