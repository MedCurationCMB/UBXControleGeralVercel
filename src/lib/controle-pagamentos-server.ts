import { createServerClient } from '@/lib/supabase/server'

export interface ControleRow {
  valor_pagar: number | null
  valor_pagamento: number | null
  data_vencimento: string | null
}

// "Hoje" no fuso de Brasília: o servidor roda em UTC e, depois das 21h, o dia virava "amanhã".
const hojeBrasilia = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })

export function getSituacao(c: ControleRow): string {
  if (c.valor_pagamento != null && c.valor_pagar != null && c.valor_pagamento >= c.valor_pagar) return 'Quitado'
  if (!c.data_vencimento) return 'Sem vencimento'
  return c.data_vencimento.slice(0, 10) < hojeBrasilia() ? 'Atrasado' : 'Em dia'
}

export interface FiltrosControle { empresa: string; categoria: string; status_pagamento: string }

const PEDIDO_COLS = 'empresa, categoria, fornecedor, status, observacao'

// Consulta de controle_pagamentos já filtrada pelo projeto. Empresa/categoria são filtradas por join
// no banco (pedidos_solicitados!inner) — antes eram uma lista de IDs na URL, que estourava com ~2.000 pedidos.
// comPedido: traz os dados do pedido junto (listagem/exportação); o resumo só precisa dos valores.
export function consultaControles(
  supabase: ReturnType<typeof createServerClient>,
  projetoId: number,
  f: FiltrosControle,
  colunas: string,
  opts: { comPedido: boolean; count?: boolean }
) {
  const filtraPedido = !!(f.empresa || f.categoria)
  const embed = filtraPedido ? `pedidos_solicitados!inner(${PEDIDO_COLS})`
    : opts.comPedido ? `pedidos_solicitados(${PEDIDO_COLS})` : ''
  let q = supabase
    .from('controle_pagamentos')
    .select(embed ? `${colunas}, ${embed}` : colunas, opts.count ? { count: 'exact' } : undefined)
    .eq('projeto_id', projetoId)
  if (f.empresa) q = q.eq('pedidos_solicitados.empresa', f.empresa)
  if (f.categoria) q = q.eq('pedidos_solicitados.categoria', f.categoria)
  if (f.status_pagamento) q = q.eq('status_pagamento', parseInt(f.status_pagamento))
  return q
}
