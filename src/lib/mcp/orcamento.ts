import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { TAB_PEDIDO } from '@/lib/ajuste'
import { clienteDoUsuario } from '@/lib/supabase/usuario'
import { veModulo } from '@/lib/modulos'
import { brl, falha, modulo, ok } from '@/lib/mcp/pedidos'
import type { SessionPayload } from '@/types/database'

const REGISTRO = { pagamentos: 'registro_orcamentos', recebimentos: 'registro_orcamentos_receita' } as const
const limpa = (s: string) => s.replace(/[%,()]/g, '').trim() // vai num ilike

// Mesmas regras da tela de orçamento: não se edita nem apaga; muda-se lançando um registro novo para o mesmo período
// (o último vale, o banco recalcula o vigente e o saldo). Quem vê o módulo pode lançar, como na tela.
export function registrarOrcamento(server: McpServer, s: SessionPayload) {
  const db = () => clienteDoUsuario(s)

  server.registerTool('consultar_orcamento', {
    description: 'Orçamento vigente, pedidos já comprometidos e saldo por centro de resultado, categoria, mês e ano. Filtros são opcionais (centro aceita parte do nome).',
    inputSchema: {
      modulo, centro: z.string().optional(), categoria: z.string().optional(),
      ano: z.number().int().optional(), mes: z.number().int().min(1).max(12).optional(),
    },
    annotations: { readOnlyHint: true },
  }, async ({ modulo: m, centro, categoria, ano, mes }) => {
    if (!veModulo(s.modulo, m)) return falha('Seu perfil não acessa este módulo.')
    let q = (await db()).from(TAB_PEDIDO[m].orcamento).select('empresa, categoria, mes, ano, valor_orcamento, valor_pedidos_solicitados, saldo')
    if (centro) q = q.ilike('empresa', `%${limpa(centro)}%`)
    if (categoria) q = q.ilike('categoria', `%${limpa(categoria)}%`)
    if (ano) q = q.eq('ano', ano)
    if (mes) q = q.eq('mes', mes)
    const { data, error } = await q.order('empresa').order('categoria').order('ano').order('mes').limit(100)
    if (error) return falha(error.message)
    if (!data?.length) return ok('Nenhum orçamento encontrado para esse filtro.')
    return ok({
      mostrando: data.length === 100 ? '100 (há mais; refine o filtro)' : data.length,
      linhas: data.map(r => ({
        centro: r.empresa, categoria: r.categoria, periodo: `${r.mes}/${r.ano}`,
        orcamento: brl(r.valor_orcamento), pedidos: brl(r.valor_pedidos_solicitados), saldo: brl(r.saldo),
      })),
    })
  })

  // Escrita em dois passos: sem confirmar=true só mostra o que seria feito.
  server.registerTool('lancar_orcamento', {
    description: 'Lança o orçamento de um centro de resultado/categoria/mês (para mudar um valor, lance um novo: o último registro vale). ' +
      'Se o mês já tem pedidos autorizados ou aguardando autorização, o novo valor precisa ser maior que a soma deles. ' +
      'Chame primeiro com confirmar=false para ver o resumo, mostre ao usuário e só use confirmar=true depois do OK dele.',
    inputSchema: {
      modulo, centro: z.string().describe('nome exato do centro de resultado'), categoria: z.string().describe('nome exato da categoria'),
      mes: z.number().int().min(1).max(12), ano: z.number().int().min(2025).max(2050),
      valor: z.number().positive(), observacao: z.string().optional(), confirmar: z.boolean().default(false),
    },
    annotations: { destructiveHint: true },
  }, async ({ modulo: m, centro, categoria, mes, ano, valor, observacao, confirmar }) => {
    if (!veModulo(s.modulo, m)) return falha('Seu perfil não acessa este módulo.')
    const t = TAB_PEDIDO[m]
    const cli = await db()
    valor = Math.round(valor * 100) / 100

    const { data: cat } = await cli.from(t.categorias).select('categoria').eq('empresa', centro).eq('categoria', categoria).maybeSingle()
    if (!cat) return falha(`Categoria "${categoria}" não encontrada no centro "${centro}" (use os nomes exatos; consultar_orcamento ajuda a achar).`)

    const { data: fluxo } = await cli.from(t.fluxo).select('valor_referente, status').eq('empresa', centro).eq('categoria', categoria).eq('mes', mes).eq('ano', ano)
    const comprometido = (fluxo ?? []).filter(f => f.status === 'Autorizado' || f.status === 'Aguardando Autorização')
      .reduce((a, f) => a + Number(f.valor_referente ?? 0), 0)
    if (comprometido > 0 && valor <= comprometido) {
      return falha(`Já existem pedidos autorizados ou aguardando autorização nesse mês. O valor do orçamento deve ser maior que ${brl(comprometido)}.`)
    }

    const { data: atual } = await cli.from(t.orcamento).select('valor_orcamento').eq('empresa', centro).eq('categoria', categoria).eq('mes', mes).eq('ano', ano).maybeSingle()
    const resumo = `ORÇAMENTO ${m}: ${centro} / ${categoria} / ${mes}/${ano} — ${atual ? `${brl(atual.valor_orcamento)} → ${brl(valor)}` : `novo, ${brl(valor)}`}` +
      (comprometido ? ` (pedidos no mês: ${brl(comprometido)})` : '') + (observacao ? ` — "${observacao}"` : '')
    if (!confirmar) return ok(`${resumo}\nNada foi feito ainda. Para executar, chame de novo com confirmar=true.`)

    const { error } = await cli.from(REGISTRO[m]).insert({
      empresa: centro, categoria, mes, ano, valor_orcamento: valor,
      data_criacao: new Date().toISOString().split('T')[0], usuario_criador: s.username, observacao: observacao || null,
    })
    return error ? falha(error.message) : ok(`Feito: ${resumo}`)
  })
}
