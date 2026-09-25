import { NextRequest, NextResponse } from 'next/server'
import { getSession, createSession, setSessionCookie, setProjetoCookie } from '@/lib/auth'
import { supabaseServer } from '@/lib/supabase/server'
import { projetosDoUsuario, hierarquiaEfetiva } from '@/lib/projetos'

// Troca o projeto ativo: só para projetos a que o usuário tem acesso
export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { projetoId } = await req.json()
  const { data: u } = await supabaseServer.from('usuarios').select('hierarquia').eq('id', session.userId).single()
  if (!u) return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 401 })

  const projeto = (await projetosDoUsuario(session.userId, u.hierarquia)).find(p => p.id === Number(projetoId))
  if (!projeto) return NextResponse.json({ error: 'Sem acesso a este projeto' }, { status: 403 })

  const token = await createSession({
    userId: session.userId,
    username: session.username,
    email: session.email,
    hierarquia: hierarquiaEfetiva(u.hierarquia, projeto.papel),
    status_cadastro: session.status_cadastro,
    projetoId: projeto.id,
    projetoNome: projeto.nome,
  })
  await setSessionCookie(token)
  await setProjetoCookie(projeto.id)
  return NextResponse.json({ ok: true })
}
