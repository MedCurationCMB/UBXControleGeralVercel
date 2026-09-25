import { NextRequest, NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase/server'
import { hashPassword, createSession, setSessionCookie, setProjetoCookie, PROJETO_COOKIE } from '@/lib/auth'
import { projetosDoUsuario, hierarquiaEfetiva } from '@/lib/projetos'
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

    const projetos = await projetosDoUsuario(user.id, user.hierarquia)
    if (projetos.length === 0) {
      return NextResponse.json(
        { error: 'Você não tem acesso a nenhum projeto. Entre em contato com o administrador.' },
        { status: 403 }
      )
    }
    // Reabre o último projeto usado, se ainda tiver acesso; senão o primeiro
    const ultimo = Number(req.cookies.get(PROJETO_COOKIE)?.value)
    const projeto = projetos.find(p => p.id === ultimo) ?? projetos[0]
    const hierarquia = hierarquiaEfetiva(user.hierarquia, projeto.papel)

    const token = await createSession({
      userId: user.id,
      username: user.username,
      email: user.email,
      hierarquia,
      status_cadastro: user.status_cadastro!,
      projetoId: projeto.id,
      projetoNome: projeto.nome,
    })

    await setSessionCookie(token)
    await setProjetoCookie(projeto.id)

    return NextResponse.json({ ok: true, hierarquia })
  } catch (err) {
    console.error('Login error:', err)
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}
