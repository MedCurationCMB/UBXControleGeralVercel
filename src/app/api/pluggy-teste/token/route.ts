import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { PluggyClient } from 'pluggy-sdk'

export async function POST() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { PLUGGY_CLIENT_ID, PLUGGY_CLIENT_SECRET } = process.env
  if (!PLUGGY_CLIENT_ID || !PLUGGY_CLIENT_SECRET) {
    return NextResponse.json({ error: 'PLUGGY_CLIENT_ID/PLUGGY_CLIENT_SECRET não configurados no servidor' }, { status: 500 })
  }

  try {
    const client = new PluggyClient({ clientId: PLUGGY_CLIENT_ID, clientSecret: PLUGGY_CLIENT_SECRET })
    const connectToken = await client.createConnectToken(undefined, {
      clientUserId: session.username,
    })
    return NextResponse.json(connectToken)
  } catch (error) {
    const err = error as { message?: string; data?: unknown }
    return NextResponse.json({ error: err?.message ?? String(error), detalhe: err?.data ?? error }, { status: 500 })
  }
}
