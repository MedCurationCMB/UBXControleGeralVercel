import { NextRequest, NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase/server'
import { hashPassword } from '@/lib/auth'
import { sendEmail, templateNovoCadastro } from '@/lib/smtp'

export async function POST(req: NextRequest) {
  try {
    const { username, email, password } = await req.json()

    if (!username || !email || !password) {
      return NextResponse.json({ error: 'Todos os campos são obrigatórios' }, { status: 400 })
    }

    // Verifica duplicidade
    const { data: existing } = await supabaseServer
      .from('usuarios')
      .select('id')
      .or(`username.eq.${username},email.eq.${email}`)
      .single()

    if (existing) {
      return NextResponse.json({ error: 'Usuário ou email já cadastrado' }, { status: 409 })
    }

    const passwordHash = hashPassword(password)

    const { error } = await supabaseServer.from('usuarios').insert({
      username,
      email,
      password: passwordHash,
      hierarquia: 'user',
      status_cadastro: 'Aguardando Autorização',
    })

    if (error) throw error

    // Notifica o owner por email
    try {
      const { data: owners } = await supabaseServer
        .from('usuarios')
        .select('email')
        .eq('hierarquia', 'owner')

      if (owners?.length) {
        await sendEmail({
          to: owners.map((o) => o.email),
          subject: 'Novo cadastro aguardando aprovação — CMB Gestão',
          html: templateNovoCadastro(username, email),
        })
      }
    } catch (emailErr) {
      console.warn('Notificação de cadastro falhou:', emailErr)
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('Cadastro error:', err)
    return NextResponse.json({ error: 'Erro ao criar conta' }, { status: 500 })
  }
}
