import { supabaseBrowser as supabase } from '@/lib/supabase/client'
import type { ModuloPedido } from '@/lib/ajuste'

// Realocação de centro de custo: as regras (saldo, reserva, autorização, histórico) moram nas funções do banco
// (banco/migracoes/2026-10-06_realocacao_funcoes.sql); aqui só chamamos e tipamos o retorno.

export interface ItemRealocacao {
  empresa: string; categoria: string; mes: number | null; ano: number | null; beneficiario: string | null; valor: number
}
export interface ProblemaRealocacao {
  tipo: 'sem_categoria' | 'sem_orcamento' | 'sem_saldo'
  empresa: string; categoria: string; mes?: number; ano?: number
  disponivel?: number; necessario?: number; falta?: number; mensagem: string
}
export interface PlanoRealocacao {
  ok: boolean; simulado?: boolean; direta: boolean; periodo: boolean; fluxo: string
  antes: ItemRealocacao[]; depois: ItemRealocacao[]
  problemas: ProblemaRealocacao[]; avisos: ProblemaRealocacao[]; realocacao_id?: number
}
export interface DestinoRealocacao { empresa: string; percentual?: number; mes?: number; ano?: number; valor?: number }
export interface Realocacao {
  id: number; modulo: ModuloPedido; pedido_id: number; status: 'Aguardando Autorização' | 'Autorizada' | 'Recusada'
  modo: 'percentual' | 'valor'; solicitante: string; data_solicitacao: string
  autorizador: string | null; data_decisao: string | null; observacao: string | null; motivo_recusa: string | null
}
export interface RealocacaoItem extends ItemRealocacao { id: number; realocacao_id: number; lado: 'antes' | 'depois' }

export const CONTROLE_TAB = { pagamentos: 'controle_pagamentos', recebimentos: 'controle_recebimento' } as const

// mes/ano 0 ou nulo = rateio só do total (pedido sem linhas por mês, Fluxo 3)
export const periodoLabel = (mes: number | null, ano: number | null) =>
  mes ? `${String(mes).padStart(2, '0')}/${ano}` : 'Total'

export async function solicitarRealocacao(
  mod: ModuloPedido, pedidoId: number, modo: 'percentual' | 'valor', destinos: DestinoRealocacao[],
  usuario: string, observacao: string, simular: boolean,
): Promise<{ plano?: PlanoRealocacao; erro?: string }> {
  const { data, error } = await supabase.rpc('realocacao_solicitar', {
    p_modulo: mod, p_pedido_id: pedidoId, p_modo: modo, p_destinos: destinos,
    p_usuario: usuario, p_observacao: observacao.trim() || null, p_simular: simular,
  })
  if (error) return { erro: error.message }
  return { plano: data as PlanoRealocacao }
}

export async function autorizarRealocacao(id: number, usuario: string): Promise<string | null> {
  const { error } = await supabase.rpc('realocacao_autorizar', { p_id: id, p_usuario: usuario })
  return error?.message ?? null
}

export async function recusarRealocacao(id: number, usuario: string, motivo: string): Promise<string | null> {
  const { error } = await supabase.rpc('realocacao_recusar', { p_id: id, p_usuario: usuario, p_motivo: motivo.trim() || null })
  return error?.message ?? null
}

// Totais por centro (usado no "antes → depois" do histórico e na lista de autorização)
export function totaisPorCentro(itens: Pick<ItemRealocacao, 'empresa' | 'valor'>[]): [string, number][] {
  const m = new Map<string, number>()
  for (const i of itens) m.set(i.empresa, (m.get(i.empresa) ?? 0) + Number(i.valor))
  return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
}
