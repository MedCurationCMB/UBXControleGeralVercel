import { supabaseBrowser as supabase } from '@/lib/supabase/client'
import type { ModuloPedido } from '@/lib/ajuste'

export const TAB_REQ = { pagamentos: 'requisicoes', recebimentos: 'requisicoes_receita' } satisfies Record<ModuloPedido, string>

// Registra que a requisição foi atendida sem necessidade de pedido (não gera pedido nem pagamento/recebimento).
// autorizar: requisição ainda pendente de autorização, que fica autorizada na mesma atualização. O banco barra se já houver pedido.
export async function marcarAtendidaSemPedido(mod: ModuloPedido, id: number, usuario: string, obs: string, autorizar: boolean) {
  const hoje = new Date().toISOString().split('T')[0]
  const { error } = await supabase.from(TAB_REQ[mod]).update({
    atendida_sem_pedido: true, atendida_data: hoje, atendida_usuario: usuario, atendida_obs: obs.trim() || null,
    ...(autorizar && { status: 'Autorizado', data_autorizacao: hoje, usuario_autorizador: usuario }),
  }).eq('id', id)
  return error?.message ?? null
}

// Volta a requisição para "autorizada — aguardando pedido".
export async function desfazerAtendidaSemPedido(mod: ModuloPedido, id: number) {
  const { error } = await supabase.from(TAB_REQ[mod]).update({
    atendida_sem_pedido: false, atendida_data: null, atendida_usuario: null, atendida_obs: null,
  }).eq('id', id)
  return error?.message ?? null
}
