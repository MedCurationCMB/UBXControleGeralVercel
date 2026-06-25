import { NextRequest, NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase/server'
import { hashPassword, createSession, setSessionCookie } from '@/lib/auth'
import type { Usuario } from '@/types/database'

export async function POST(req: NextRequest) {
  try {
    const { email, password } = await req.json()

    if (!email || !password) {
      return NextResponse.json({ error: 'E-mail e senha são obrigatórios' }, { status: 400 })
    }

    const passwordHash = hashPassword(password)

    const { data: user, error } = await supabaseServer
      .from('usuarios')
      .select('*')
      .eq('email', email.toLowerCase().trim())
      .eq('password', passwordHash)
      .single<Usuario>()

    if (error || !user) {
      return NextResponse.json({ error: 'E-mail ou senha incorretos' }, { status: 401 })
    }

    if (user.status_cadastro === 'Aguardando Autorização') {
      return NextResponse.json(
        { error: 'Cadastro aguardando aprovação do administrador' },
        { status: 403 }
      )
    }

    if (user.status_cadastro === 'Não Autorizado') {
      return NextResponse.json(
        { error: 'Seu cadastro não foi autorizado. Entre em contato com o administrador.' },
        { status: 403 }
      )
    }

    const token = await createSession({
      userId: user.id,
      username: user.username,
      email: user.email,
      hierarquia: user.hierarquia,
      status_cadastro: user.status_cadastro!,
    })

    await setSessionCookie(token)

    return NextResponse.json({ ok: true, hierarquia: user.hierarquia })
  } catch (err) {
    console.error('Login error:', err)
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}
