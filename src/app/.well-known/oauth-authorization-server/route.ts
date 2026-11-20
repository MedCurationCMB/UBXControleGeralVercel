import { NextResponse } from 'next/server'
import { baseUrl } from '@/lib/mcp/oauth'

export function GET(req: Request) {
  const b = baseUrl(req)
  return NextResponse.json({
    issuer: b,
    authorization_endpoint: `${b}/api/oauth/authorize`,
    token_endpoint: `${b}/api/oauth/token`,
    registration_endpoint: `${b}/api/oauth/register`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none'],
  })
}
