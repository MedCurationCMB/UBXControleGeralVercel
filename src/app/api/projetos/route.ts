import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { supabaseServer } from '@/lib/supabase/server'
import { projetosDoUsuario } from '@/lib/projetos'

// Projetos do usuário logado + o ativo
export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  const { data: u } = await supabaseServer.from('usuarios').select('hierarquia').eq('id', session.userId).single()
  const projetos = await projetosDoUsuario(session.userId, u?.hierarquia ?? session.hierarquia)
  return NextResponse.json({ ativo: session.projetoId, projetos })
}
