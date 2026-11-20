import { NextResponse } from 'next/server'
import { baseUrl } from '@/lib/mcp/oauth'

export function GET(req: Request) {
  const b = baseUrl(req)
  return NextResponse.json({ resource: `${b}/api/mcp`, authorization_servers: [b], bearer_methods_supported: ['header'] })
}
