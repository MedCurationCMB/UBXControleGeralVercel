import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { TAB_PEDIDO } from '@/lib/ajuste'
import {
  autorizarRealocacao, periodoLabel, recusarRealocacao, solicitarRealocacao, totaisPorCentro,
  type DestinoRealocacao, type ItemRealocacao, type PlanoRealocacao, type Realocacao, type RealocacaoItem,
} from '@/lib/realocacao'
import { clienteDoUsuario } from '@/lib/supabase/usuario'
import { veModulo } from '@/lib/modulos'
import { brl, falha, modulo, ok, podeDecidir } from '@/lib/mcp/pedidos'
import type { SessionPayload } from '@/types/database'

const AGUARDANDO = 'Aguardando Autorização'
const preview = (resumo: string) => ok(`${resumo}\nNada foi feito ainda. Para executar, chame de novo com confirmar=true.`)
const porCentro = (itens: Pick<ItemRealocacao, 'empresa' | 'valor'>[]) => totaisPorCentro(itens).map(([e, v]) => `${e} ${brl(v)}`).join(' · ')

// Realocação de centro de resultado: as regras (saldo, reserva, autorização, histórico) moram nas funções do banco; aqui só chamamos.
// A prévia é a própria simulação do banco (p_simular). Quem vê só alguns centros não realoca.
export function registrarRealocacao(server: McpServer, s: SessionPayload) {
  const db = () => clienteDoUsuario(s)

  server.registerTool('solicitar_realocacao', {
    description: 'Realoca um pedido AUTORIZADO para outros centros de resultado: modo=percentual (cada destino com percentual, somando 100) ou modo=valor (cada destino com valor; se o pedido tem cronograma por mês, informe mes e ano e a soma de cada mês deve igualar o valor do pedido naquele mês). ' +
      'O banco simula antes (saldo dos destinos); conforme o perfil a realocação é aplicada na hora ou fica aguardando autorização de um admin, com o saldo reservado. Use confirmar=false para ver a simulação.',
    inputSchema: {
      modulo, pedido_id: z.number().int(), modo: z.enum(['percentual', 'valor']),
      destinos: z.array(z.object({ centro: z.string(), percentual: z.number().positive().optional(), valor: z.number().nonnegative().optional(), mes: z.number().int().min(1).max(12).optional(), ano: z.number().int().optional() })).min(1).max(40),
      observacao: z.string().optional(), confirmar: z.boolean().default(false),
    },
    annotations: { destructiveHint: true },
  }, async ({ modulo: m, pedido_id, modo, destinos, observacao, confirmar }) => {
    if (!veModulo(s.modulo, m)) return falha('Seu perfil não acessa este módulo.')
    if (s.restrito) return falha('Quem vê só alguns centros de resultado não realoca.')
    const cli = await db()
    const { data: p } = await cli.from(TAB_PEDIDO[m].pedido).select('*').eq('id', pedido_id).maybeSingle()
    if (!p) return falha('Pedido não encontrado (ou fora dos seus centros).')
    if (p.status !== 'Autorizado' || p.cancelado) return falha(`Só pedido autorizado e não cancelado pode ser realocado (status: ${p.status}).`)
    const { count: pend } = await cli.from('realocacoes').select('id', { count: 'exact', head: true }).eq('modulo', m).eq('pedido_id', pedido_id).eq('status', AGUARDANDO)
    if (pend) return falha('Este pedido já tem uma realocação aguardando autorização.')

    const alvo: DestinoRealocacao[] = []
    for (const d of destinos) {
      if (modo === 'percentual') {
        if (!(d.percentual && d.percentual > 0)) return falha('No modo percentual cada destino precisa de percentual.')
        alvo.push({ empresa: d.centro, percentual: d.percentual })
      } else {
        if (d.valor === undefined) return falha('No modo valor cada destino precisa de valor.')
        alvo.push({ empresa: d.centro, valor: d.valor, ...(d.mes ? { mes: d.mes, ano: d.ano } : {}) })
      }
    }
    const sim = await solicitarRealocacao(m, pedido_id, modo, alvo, s.username, observacao ?? '', true, cli)
    if (sim.erro || !sim.plano) return falha(sim.erro ?? 'Não foi possível simular.')
    const plano: PlanoRealocacao = sim.plano
    if (!plano.ok) return falha(`A realocação não é possível:\n${plano.problemas.map(x => `- ${x.mensagem}`).join('\n')}`)

    const linhasPlano = (its: ItemRealocacao[]) => its.map(i => `${i.empresa} ${periodoLabel(i.mes, i.ano)} ${brl(Number(i.valor))}`).join('; ')
    const resumo = `REALOCAR pedido #${pedido_id} (${m}, ${brl(Number(p.valor_pedido))})\n  antes: ${porCentro(plano.antes)}\n  depois: ${porCentro(plano.depois)}\n  detalhe: ${linhasPlano(plano.depois)}\n` +
      `  ${plano.direta ? 'Será aplicada na hora, sem autorização.' : 'Ficará aguardando autorização, com o saldo do destino reservado.'}` +
      (plano.avisos?.length ? `\n  avisos: ${plano.avisos.map(x => x.mensagem).join(' | ')}` : '')
    if (!confirmar) return preview(resumo)
    const r = await solicitarRealocacao(m, pedido_id, modo, alvo, s.username, observacao ?? '', false, cli)
    if (r.erro || !r.plano?.ok) return falha(r.erro ?? 'Não foi possível concluir.')
    return ok(`Feito: ${resumo}\nRealocação #${r.plano.realocacao_id ?? '?'}${plano.direta ? ' aplicada.' : ' enviada para autorização.'}`)
  })

  server.registerTool('listar_realocacoes', {
    description: 'Lista realocações de centro de resultado: aguardando autorização (padrão), todas ou de um pedido, com o antes → depois por centro.',
    inputSchema: { modulo: modulo.optional(), situacao: z.enum(['aguardando', 'todas']).default('aguardando'), pedido_id: z.number().int().optional() },
    annotations: { readOnlyHint: true },
  }, async ({ modulo: m, situacao, pedido_id }) => {
    const cli = await db()
    let q = cli.from('realocacoes').select('*')
    if (m) q = q.eq('modulo', m)
    if (pedido_id) q = q.eq('pedido_id', pedido_id)
    if (situacao === 'aguardando') q = q.eq('status', AGUARDANDO)
    const { data, error } = await q.order('id', { ascending: false }).limit(30)
    if (error) return falha(error.message)
    const rs = ((data ?? []) as Realocacao[]).filter(r => veModulo(s.modulo, r.modulo))
    if (!rs.length) return ok('Nenhuma realocação encontrada.')
    const { data: its } = await cli.from('realocacao_itens').select('*').in('realocacao_id', rs.map(r => r.id))
    const itens = (its ?? []) as RealocacaoItem[]
    return ok(rs.map(r => {
      const lado = (l: 'antes' | 'depois') => porCentro(itens.filter(i => i.realocacao_id === r.id && i.lado === l))
      return `realocação #${r.id} · ${r.modulo} · pedido #${r.pedido_id} · ${r.status} · ${r.solicitante} em ${String(r.data_solicitacao).slice(0, 10)}${r.observacao ? ` · "${r.observacao}"` : ''}\n  antes: ${lado('antes')}\n  depois: ${lado('depois')}${r.motivo_recusa ? `\n  recusa: ${r.motivo_recusa}` : ''}`
    }).join('\n'))
  })

  server.registerTool('decidir_realocacao', {
    description: 'Autoriza ou recusa uma realocação aguardando autorização (só admin do módulo; autorizar aplica a mudança de centro). Use confirmar=false antes, como em decidir_pedido.',
    inputSchema: { id: z.number().int(), decisao: z.enum(['autorizar', 'recusar']), motivo: z.string().optional().describe('motivo da recusa'), confirmar: z.boolean().default(false) },
    annotations: { destructiveHint: true },
  }, async ({ id, decisao, motivo, confirmar }) => {
    const cli = await db()
    const { data: r } = await cli.from('realocacoes').select('*').eq('id', id).maybeSingle()
    if (!r) return falha('Realocação não encontrada (ou fora dos seus centros).')
    const re = r as Realocacao
    if (!podeDecidir(s, re.modulo)) return falha('Só administrador do módulo autoriza ou recusa realocações.')
    if (re.status !== AGUARDANDO) return falha(`Esta realocação não está aguardando autorização (status: ${re.status}).`)
    const { data: its } = await cli.from('realocacao_itens').select('*').eq('realocacao_id', id)
    const itens = (its ?? []) as RealocacaoItem[]
    const lado = (l: 'antes' | 'depois') => porCentro(itens.filter(i => i.lado === l))
    const resumo = `${decisao === 'autorizar' ? 'AUTORIZAR' : 'RECUSAR'} realocação #${id} (${re.modulo}, pedido #${re.pedido_id}, pedida por ${re.solicitante})\n  antes: ${lado('antes')}\n  depois: ${lado('depois')}${decisao === 'recusar' && motivo ? `\n  motivo: ${motivo}` : ''}`
    if (!confirmar) return preview(resumo)
    const erro = decisao === 'autorizar' ? await autorizarRealocacao(id, s.username, cli) : await recusarRealocacao(id, s.username, motivo ?? '', cli)
    return erro ? falha(erro) : ok(`Feito: ${resumo}`)
  })
}
