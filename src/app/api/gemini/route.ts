import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { chatWithAssistant } from '@/lib/gemini'

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  try {
    const { message, history } = await req.json()
    if (!message) return NextResponse.json({ error: 'Mensagem obrigatória' }, { status: 400 })

    const response = await chatWithAssistant(message, history ?? [])
    return NextResponse.json({ response })
  } catch (err) {
    console.error('Gemini error:', err)
    return NextResponse.json({ error: 'Erro ao consultar o assistente' }, { status: 500 })
  }
}
