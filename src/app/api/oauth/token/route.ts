import { NextResponse } from 'next/server'
import { emitirTokens, pkceOk, verificar, type CodigoJwt, type TokenJwt } from '@/lib/mcp/oauth'

const erro = (error: string) => NextResponse.json({ error }, { status: 400, headers: { 'Cache-Control': 'no-store' } })

export async function POST(req: Request) {
  const f = await req.formData().catch(() => null)
  if (!f) return erro('invalid_request')
  const v = (k: string) => String(f.get(k) ?? '')
  const grant = v('grant_type')

  let t: TokenJwt | null = null
  if (grant === 'authorization_code') {
    const c = await verificar<CodigoJwt>('code', v('code'))
    if (c && c.cid === v('client_id') && c.ru === v('redirect_uri') && pkceOk(v('code_verifier'), c.cc)) t = { uid: c.uid, pid: c.pid, cid: c.cid }
  } else if (grant === 'refresh_token') {
    const r = await verificar<TokenJwt>('refresh', v('refresh_token'))
    if (r && r.cid === v('client_id')) t = { uid: r.uid, pid: r.pid, cid: r.cid }
  } else {
    return erro('unsupported_grant_type')
  }
  if (!t) return erro('invalid_grant')
  return NextResponse.json(await emitirTokens(t), { headers: { 'Cache-Control': 'no-store' } })
}
