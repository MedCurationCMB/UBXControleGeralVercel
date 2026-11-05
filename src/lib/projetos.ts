import { supabaseServer } from '@/lib/supabase/server'
import type { TipoHierarquia } from '@/types/database'
import type { Modulo, Papel } from '@/lib/modulos'

export interface ProjetoAcesso { id: number; nome: string; papel: Papel; modulo: Modulo | null }

// Projetos que o usuário pode abrir. Owner enxerga todos os projetos ativos.
export async function projetosDoUsuario(userId: number, hierarquiaGlobal: TipoHierarquia): Promise<ProjetoAcesso[]> {
  if (hierarquiaGlobal === 'owner') {
    const { data } = await supabaseServer.from('projetos').select('id, nome').eq('ativo', true).order('id')
    return (data ?? []).map(p => ({ id: p.id, nome: p.nome, papel: 'admin' as const, modulo: null }))
  }
  const { data } = await supabaseServer
    .from('usuarios_projetos').select('papel, modulo, projetos!inner(id, nome, ativo)').eq('usuario_id', userId)
  return (data ?? [])
    .map(r => ({ p: r.projetos as unknown as { id: number; nome: string; ativo: boolean }, papel: r.papel as Papel, modulo: (r.modulo as Modulo | null) ?? null }))
    .filter(r => r.p.ativo)
    .map(r => ({ id: r.p.id, nome: r.p.nome, papel: r.papel, modulo: r.modulo }))
    .sort((a, b) => a.id - b.id)
}

// Papel no projeto vira a hierarquia efetiva (todas as checagens atuais de admin/owner passam a valer por projeto).
export const hierarquiaEfetiva = (global: TipoHierarquia, papel: Papel): TipoHierarquia =>
  global === 'owner' ? 'owner' : papel
