import { NextResponse } from 'next/server'
import { assinar, uriOk } from '@/lib/mcp/oauth'

// Registro dinâmico de cliente (RFC 7591). Sem banco: o client_id é um JWT com os redirect_uris.
export async function POST(req: Request) {
  const b = await req.json().catch(() => ({}))
  const uris: unknown = b.redirect_uris
  if (!Array.isArray(uris) || uris.length === 0 || !uris.every(u => typeof u === 'string' && uriOk(u))) {
    return NextResponse.json({ error: 'invalid_redirect_uri' }, { status: 400 })
  }
  const name = String(b.client_name ?? 'Cliente MCP').slice(0, 80)
  return NextResponse.json({
    client_id: await assinar('client', { ru: uris, name }, '365d'),
    client_name: name,
    redirect_uris: uris,
    grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code'],
    token_endpoint_auth_method: 'none',
  }, { status: 201 })
}
