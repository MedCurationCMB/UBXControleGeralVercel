import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { PluggyClient } from 'pluggy-sdk'

export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const itemId = req.nextUrl.searchParams.get('itemId')
  if (!itemId) return NextResponse.json({ error: 'Parâmetro itemId é obrigatório' }, { status: 400 })

  const { PLUGGY_CLIENT_ID, PLUGGY_CLIENT_SECRET } = process.env
  if (!PLUGGY_CLIENT_ID || !PLUGGY_CLIENT_SECRET) {
    return NextResponse.json({ error: 'PLUGGY_CLIENT_ID/PLUGGY_CLIENT_SECRET não configurados no servidor' }, { status: 500 })
  }

  try {
    const client = new PluggyClient({ clientId: PLUGGY_CLIENT_ID, clientSecret: PLUGGY_CLIENT_SECRET })
    const accountsPage = await client.fetchAccounts(itemId)
    const accounts = await Promise.all(
      accountsPage.results.map(async (account) => ({
        id: account.id,
        nome: account.name,
        tipo: account.type,
        saldo: account.balance,
        moeda: account.currencyCode,
        ultimosLancamentos: (await client.fetchAllTransactions(account.id)).slice(0, 10),
      }))
    )
    return NextResponse.json({ itemId, accounts })
  } catch (error) {
    const err = error as { message?: string; data?: unknown }
    return NextResponse.json({ error: err?.message ?? String(error), detalhe: err?.data ?? error }, { status: 500 })
  }
}
