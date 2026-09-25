import { supabaseBrowser as supabase } from '@/lib/supabase/client'

export type ModuloPedido = 'pagamentos' | 'recebimentos'

// Tabelas de cada módulo
export const TAB_PEDIDO = {
  pagamentos: {
    pedido: 'pedidos_solicitados', fluxo: 'pedidos_solicitados_fluxo', comentarios: 'comentarios',
    parte: 'fornecedor', parteRotulo: 'Fornecedor', partes: 'fornecedores',
    categorias: 'categorias', orcamento: 'controle_orcamento', cfgFluxo: 'fluxo_sistema',
  },
  recebimentos: {
    pedido: 'pedidos_solicitados_receita', fluxo: 'pedidos_solicitados_fluxo_receita', comentarios: 'comentarios_receita',
    parte: 'cliente', parteRotulo: 'Cliente', partes: 'clientes',
    categorias: 'categorias_receita', orcamento: 'controle_orcamento_receita', cfgFluxo: 'fluxo_sistema_receita',
  },
} satisfies Record<ModuloPedido, Record<string, string>>

// Devolve o pedido ao solicitante: status, marca de reenvio zerada e comentário do gestor.
// A marca vai em update separado: se a coluna ainda não existir, só ela falha.
export async function solicitarAjuste(mod: ModuloPedido, pedidoId: number, comentario: string, usuario: string) {
  const t = TAB_PEDIDO[mod]
  const { error } = await supabase.from(t.pedido).update({ status: 'Aguardando Ajuste' }).eq('id', pedidoId)
  if (error) return error.message
  await supabase.from(t.pedido).update({ ajuste_reenviado: false }).eq('id', pedidoId)
  await supabase.from(t.fluxo).update({ status: 'Aguardando Ajuste' }).eq('pedido_id', pedidoId)
  await supabase.from(t.comentarios).insert({
    pedido_id: pedidoId, comentario: comentario.trim(), usuario,
    data_comentario: new Date().toISOString(), tipo_documento: null,
  })
  return null
}
