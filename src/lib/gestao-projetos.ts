import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import type { SessionPayload } from '@/types/database'

// Quem gerencia projetos: owner (todos) e admin do projeto ativo (só os membros do projeto em que está).
// session.hierarquia já é a efetiva no projeto ativo; owner continua owner.
export async function sessaoGestor(): Promise<{ session: SessionPayload } | { erro: NextResponse }> {
  const session = await getSession()
  if (!session) return { erro: NextResponse.json({ error: 'Não autorizado' }, { status: 401 }) }
  if (session.hierarquia !== 'owner' && session.hierarquia !== 'admin') {
    return { erro: NextResponse.json({ error: 'Acesso restrito a administradores' }, { status: 403 }) }
  }
  return { session }
}

export const ehOwner = (s: SessionPayload) => s.hierarquia === 'owner'

export const podeGerenciarMembros = (s: SessionPayload, projetoId: number) =>
  ehOwner(s) || (s.hierarquia === 'admin' && s.projetoId === projetoId)

export const negado = () => NextResponse.json({ error: 'Sem permissão neste projeto' }, { status: 403 })
