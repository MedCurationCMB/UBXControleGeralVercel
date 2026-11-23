import { projetosDoUsuario, hierarquiaEfetiva } from '@/lib/projetos'
import { supabaseServer } from '@/lib/supabase/server'
import type { SessionPayload, Usuario } from '@/types/database'

// Quem é o usuário e qual o perfil dele no projeto: reconferido no banco a cada chamada
// (usuário removido ou perfil alterado vale na hora). Usado pelo MCP e pela página de upload.
export async function sessaoDe(uid: number, pid: number): Promise<SessionPayload | null> {
  const { data: u } = await supabaseServer.from('usuarios').select('*').eq('id', uid).maybeSingle<Usuario>()
  if (!u || u.status_cadastro !== 'Autorizado') return null
  const proj = (await projetosDoUsuario(u.id, u.hierarquia)).find(p => p.id === pid)
  if (!proj) return null
  return {
    userId: u.id, username: u.username, email: u.email, hierarquia: hierarquiaEfetiva(u.hierarquia, proj.papel), status_cadastro: u.status_cadastro,
    projetoId: proj.id, projetoNome: proj.nome, modulo: proj.modulo, restrito: !proj.todosCentros,
  }
}
