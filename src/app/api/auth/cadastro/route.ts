import { NextRequest, NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase/server'
import { hashPassword } from '@/lib/auth'
import { sendEmail, templateNovoCadastro } from '@/lib/smtp'

export async function POST(req: NextRequest) {
  try {
    const { username, email, password } = await req.json()

    if (![username, email, password].every(v => typeof v === 'string' && v.trim())) {
      return NextResponse.json({ error: 'Todos os campos são obrigatórios' }, { status: 400 })
    }

    // Verifica duplicidade (rota pública: .eq em vez de .or com texto digitado, para não montar filtro a partir da entrada)
    const [{ data: porUsuario }, { data: porEmail }] = await Promise.all([
      supabaseServer.from('usuarios').select('id').eq('username', username).limit(1),
      supabaseServer.from('usuarios').select('id').eq('email', email).limit(1),
    ])

    if (porUsuario?.length || porEmail?.length) {
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
