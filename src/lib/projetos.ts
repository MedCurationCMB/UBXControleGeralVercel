import { supabaseServer } from '@/lib/supabase/server'
import type { TipoHierarquia } from '@/types/database'

export interface ProjetoAcesso { id: number; nome: string; papel: 'admin' | 'user' }

// Projetos que o usuário pode abrir. Owner enxerga todos os projetos ativos.
export async function projetosDoUsuario(userId: number, hierarquiaGlobal: TipoHierarquia): Promise<ProjetoAcesso[]> {
  if (hierarquiaGlobal === 'owner') {
    const { data } = await supabaseServer.from('projetos').select('id, nome').eq('ativo', true).order('id')
    return (data ?? []).map(p => ({ id: p.id, nome: p.nome, papel: 'admin' as const }))
  }
  const { data } = await supabaseServer
    .from('usuarios_projetos').select('papel, projetos!inner(id, nome, ativo)').eq('usuario_id', userId)
  return (data ?? [])
    .map(r => ({ p: r.projetos as unknown as { id: number; nome: string; ativo: boolean }, papel: r.papel as 'admin' | 'user' }))
    .filter(r => r.p.ativo)
    .map(r => ({ id: r.p.id, nome: r.p.nome, papel: r.papel }))
    .sort((a, b) => a.id - b.id)
}

// Papel no projeto vira a hierarquia efetiva (todas as checagens atuais de admin/owner passam a valer por projeto).
export const hierarquiaEfetiva = (global: TipoHierarquia, papel: 'admin' | 'user'): TipoHierarquia =>
  global === 'owner' ? 'owner' : papel
