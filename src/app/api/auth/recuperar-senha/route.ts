import { NextRequest, NextResponse } from 'next/server'
import { randomBytes } from 'crypto'
import { supabaseServer } from '@/lib/supabase/server'
import { sendEmail, templateRecuperacaoSenha } from '@/lib/smtp'
import { hashPassword } from '@/lib/auth'

// POST /api/auth/recuperar-senha — solicita token
export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json()
    if (!email) return NextResponse.json({ error: 'Email obrigatório' }, { status: 400 })

    const { data: user } = await supabaseServer
      .from('usuarios')
      .select('id')
      .eq('email', email)
      .single()

    // Sempre retorna 200 para não revelar se o email existe
    if (!user) return NextResponse.json({ ok: true })

    const token = randomBytes(32).toString('hex')
    const expiry = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()

    await supabaseServer.from('reset_tokens').insert({ email, token, expiry })

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
    await sendEmail({
      to: email,
      subject: 'Recuperação de Senha — CMB Gestão',
      html: templateRecuperacaoSenha(token, appUrl),
    })

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('Recuperar senha error:', err)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}

// PATCH /api/auth/recuperar-senha — redefine a senha com o token
export async function PATCH(req: NextRequest) {
  try {
    const { token, newPassword } = await req.json()
    if (!token || !newPassword) {
      return NextResponse.json({ error: 'Token e nova senha são obrigatórios' }, { status: 400 })
    }

    const { data: resetToken } = await supabaseServer
      .from('reset_tokens')
      .select('*')
      .eq('token', token)
      .eq('used', false)
      .single()

    if (!resetToken) {
      return NextResponse.json({ error: 'Token inválido ou expirado' }, { status: 400 })
    }

    if (new Date(resetToken.expiry) < new Date()) {
      return NextResponse.json({ error: 'Token expirado' }, { status: 400 })
    }

    const passwordHash = hashPassword(newPassword)

    await Promise.all([
      supabaseServer.from('usuarios').update({ password: passwordHash }).eq('email', resetToken.email),
      supabaseServer.from('reset_tokens').update({ used: true }).eq('token', token),
    ])

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('Reset senha error:', err)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
