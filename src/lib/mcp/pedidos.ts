import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { decidirPedido, solicitarAjuste, TAB_PEDIDO } from '@/lib/ajuste'
import { clienteDoUsuario } from '@/lib/supabase/usuario'
import { veModulo, type Modulo } from '@/lib/modulos'
import type { SessionPayload } from '@/types/database'

const AGUARDANDO = 'Aguardando Autorização'
export const modulo = z.enum(['pagamentos', 'recebimentos']).describe('pagamentos = pedidos de compra; recebimentos = pedidos de venda')
export const brl = (v: number) => Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
export const ok = (obj: unknown) => ({ content: [{ type: 'text' as const, text: typeof obj === 'string' ? obj : JSON.stringify(obj, null, 1) }] })
export const falha = (msg: string) => ({ isError: true, content: [{ type: 'text' as const, text: msg }] })

// Mesma regra das telas: só admin (ou owner) do projeto decide, e só no módulo do seu perfil. O RLS ainda filtra projeto e centros.
const podeDecidir = (s: SessionPayload, m: Modulo) => (s.hierarquia === 'admin' || s.hierarquia === 'owner') && veModulo(s.modulo, m)

export function registrarPedidos(server: McpServer, s: SessionPayload) {
  const db = () => clienteDoUsuario(s)

  async function carregar(m: Modulo, id: number) {
    const t = TAB_PEDIDO[m]
    const { data } = await (await db()).from(t.pedido).select('*').eq('id', id).maybeSingle()
    return data as Record<string, unknown> | null
  }

  server.registerTool('listar_pedidos', {
    description: 'Lista pedidos do projeto ativo aguardando autorização (padrão) ou aguardando ajuste. Respeita os centros de resultado do usuário.',
    inputSchema: { modulo: modulo.optional().describe('omitido = todos que o perfil enxerga'), situacao: z.enum(['autorizacao', 'ajuste']).default('autorizacao') },
    annotations: { readOnlyHint: true },
  }, async ({ modulo: m, situacao }) => {
    const mods = (m ? [m] : (['pagamentos', 'recebimentos'] as Modulo[])).filter(x => veModulo(s.modulo, x))
    if (mods.length === 0) return falha('Seu perfil não acessa este módulo.')
    const cli = await db()
    const out: unknown[] = []
    for (const mod of mods) {
      const t = TAB_PEDIDO[mod]
      const { data, error } = await cli.from(t.pedido).select('*').eq('status', situacao === 'ajuste' ? 'Aguardando Ajuste' : AGUARDANDO)
        .eq('cancelado', false).order('emergencia', { ascending: false }).order('id').limit(50)
      if (error) return falha(error.message)
      for (const p of data ?? []) out.push({
        modulo: mod, id: p.id, centro: p.empresa, categoria: p.categoria, [t.parte]: p[t.parte], valor: brl(p.valor_pedido),
        emergencia: p.emergencia, solicitado_em: p.data_solicitacao, observacao: p.observacao,
      })
    }
    return ok(out.length ? out : 'Nenhum pedido encontrado.')
  })

  server.registerTool('ver_pedido', {
    description: 'Detalhe de um pedido: dados, cronograma (parcelas por mês) e últimos comentários.',
    inputSchema: { modulo, id: z.number().int() },
    annotations: { readOnlyHint: true },
  }, async ({ modulo: m, id }) => {
    if (!veModulo(s.modulo, m)) return falha('Seu perfil não acessa este módulo.')
    const p = await carregar(m, id)
    if (!p) return falha('Pedido não encontrado (ou fora dos seus centros).')
    const t = TAB_PEDIDO[m]
    const cli = await db()
    const [{ data: fluxo }, { data: coms }] = await Promise.all([
      cli.from(t.fluxo).select('mes, ano, valor_referente, status').eq('pedido_id', id).order('ano').order('mes'),
      cli.from(t.comentarios).select('usuario, comentario, data_comentario').eq('pedido_id', id).order('data_comentario', { ascending: false }).limit(10),
    ])
    return ok({
      id: p.id, centro: p.empresa, categoria: p.categoria, [t.parte]: p[t.parte], valor: brl(p.valor_pedido as number), status: p.status,
      emergencia: p.emergencia, cancelado: p.cancelado, solicitado_em: p.data_solicitacao, autorizado_em: p.data_autorizacao,
      autorizado_por: p.usuario_autorizador, observacao: p.observacao,
      cronograma: (fluxo ?? []).map(f => ({ periodo: `${f.mes}/${f.ano}`, valor: brl(f.valor_referente), status: f.status })),
      comentarios: coms ?? [],
    })
  })

  // Escrita em dois passos: sem confirmar=true só mostra o que seria feito.
  server.registerTool('decidir_pedido', {
    description: 'Autoriza ou rejeita um pedido aguardando autorização. Autorizar também cria a(s) conta(s) a pagar/receber, como na tela. ' +
      'Chame primeiro com confirmar=false para ver o resumo, mostre ao usuário e só use confirmar=true depois do OK dele.',
    inputSchema: { modulo, id: z.number().int(), decisao: z.enum(['autorizar', 'rejeitar']), confirmar: z.boolean().default(false) },
    annotations: { destructiveHint: true },
  }, async ({ modulo: m, id, decisao, confirmar }) => {
    if (!podeDecidir(s, m)) return falha('Só administrador do módulo pode autorizar ou rejeitar pedidos.')
    const p = await carregar(m, id)
    if (!p) return falha('Pedido não encontrado (ou fora dos seus centros).')
    if (p.status !== AGUARDANDO || p.cancelado) return falha(`Este pedido não está aguardando autorização (status: ${p.status}).`)
    const t = TAB_PEDIDO[m]
    const resumo = `${decisao === 'autorizar' ? 'AUTORIZAR' : 'REJEITAR'} pedido #${id}: ${p.empresa} / ${p.categoria} / ${p[t.parte]} — ${brl(p.valor_pedido as number)}`
    if (!confirmar) return ok(`${resumo}\nNada foi feito ainda. Para executar, chame de novo com confirmar=true.`)
    const e = await decidirPedido(m, id, String(p[t.parte]), Number(p.valor_pedido), decisao === 'autorizar' ? 'Autorizado' : 'Não Autorizado', s.username, await db())
    return e ? falha(e) : ok(`Feito: ${resumo}`)
  })

  server.registerTool('pedir_ajuste', {
    description: 'Devolve um pedido aguardando autorização ao solicitante, com um comentário do que ajustar. Use confirmar=false antes, como em decidir_pedido.',
    inputSchema: { modulo, id: z.number().int(), comentario: z.string().min(3), confirmar: z.boolean().default(false) },
    annotations: { destructiveHint: true },
  }, async ({ modulo: m, id, comentario, confirmar }) => {
    if (!podeDecidir(s, m)) return falha('Só administrador do módulo pode pedir ajuste.')
    const p = await carregar(m, id)
    if (!p) return falha('Pedido não encontrado (ou fora dos seus centros).')
    if (p.status !== AGUARDANDO || p.cancelado) return falha(`Este pedido não está aguardando autorização (status: ${p.status}).`)
    const resumo = `PEDIR AJUSTE do pedido #${id} (${p.empresa} / ${p.categoria}): "${comentario.trim()}"`
    if (!confirmar) return ok(`${resumo}\nNada foi feito ainda. Para executar, chame de novo com confirmar=true.`)
    const e = await solicitarAjuste(m, id, comentario, s.username, await db())
    return e ? falha(e) : ok(`Feito: ${resumo}`)
  })
}
