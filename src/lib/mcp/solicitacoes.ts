import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { TAB_PEDIDO, type ModuloPedido } from '@/lib/ajuste'
import { CONTAS } from '@/lib/extratoVinculo'
import { clienteDoUsuario } from '@/lib/supabase/usuario'
import { veModulo } from '@/lib/modulos'
import { brl, falha, modulo, ok, podeDecidir } from '@/lib/mcp/pedidos'
import { linkUpload } from '@/lib/mcp/upload'
import type { SessionPayload } from '@/types/database'

const AGUARDANDO = 'Aguardando Autorização'
const REQ = { pagamentos: 'requisicoes', recebimentos: 'requisicoes_receita' } as const
const ORC_USUARIOS = { pagamentos: 'orcamentos_usuarios', recebimentos: 'orcamentos_usuarios_receita' } as const
export const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
const hoje = () => new Date().toISOString().split('T')[0]
const dia = (d: string) => d.slice(0, 10).split('-').reverse().join('/')

// Fluxo do projeto/módulo, como a tela decide: 1 pedido com orçamento · 2 pedido sem orçamento · 3 conta lançada direto (sem pedido)
// · 4 requisição + pedido com orçamento · 5 requisição + pedido sem orçamento.
export async function fluxoDe(cli: SupabaseClient, m: ModuloPedido): Promise<'1' | '2' | '3' | '4' | '5'> {
  const { data: c } = await cli.from('config').select('valor').eq('chave', TAB_PEDIDO[m].cfgFluxo).maybeSingle()
  if (c?.valor) return c.valor
  if (m === 'recebimentos') return '2'
  const { data: o } = await cli.from('config').select('valor').eq('chave', 'controla_orcamento').maybeSingle()
  return o?.valor === 'true' ? '1' : '2'
}
const usaRequisicao = (f: string) => f === '4' || f === '5'
export const controlaOrcamento = (f: string) => f === '1' || f === '4'

// Requisições e criação de pedido, com as regras das telas "Fazer Requisição", "Autorizar Requisições" e "Fazer Pedido".
// Depois de criar, o resultado traz o link de upload de PDF (vale 30 min): o Claude deve perguntar se há documento e entregar o link.
export function registrarSolicitacoes(server: McpServer, s: SessionPayload, origin: string) {
  const aviso = async (m: ModuloPedido, alvo: 'pedido' | 'requisicao', id: number) =>
    `\nPergunte ao usuário se há documento (PDF) para anexar. Se sim, entregue este link (vale 30 min): ${await linkUpload(origin, s, m, alvo, id)}`
  const db = () => clienteDoUsuario(s)

  server.registerTool('listar_requisicoes', {
    description: 'Lista requisições aguardando autorização (padrão) ou já autorizadas e ainda sem pedido. Só existem nos fluxos 4 e 5.',
    inputSchema: { modulo, situacao: z.enum(['aguardando', 'autorizadas_sem_pedido']).default('aguardando') },
    annotations: { readOnlyHint: true },
  }, async ({ modulo: m, situacao }) => {
    if (!veModulo(s.modulo, m)) return falha('Seu perfil não acessa este módulo.')
    const cli = await db()
    let q = cli.from(REQ[m]).select('id, empresa, categoria, descricao, data_solicitacao, anexos')
    q = situacao === 'aguardando' ? q.eq('status', AGUARDANDO) : q.eq('status', 'Autorizado').eq('atendida_sem_pedido', false)
    const { data, error } = await q.order('id').limit(100)
    if (error) return falha(error.message)
    let rows = data ?? []
    if (situacao === 'autorizadas_sem_pedido' && rows.length) {
      const { data: usadas } = await cli.from(TAB_PEDIDO[m].pedido).select('requisicao_id').in('requisicao_id', rows.map(r => r.id))
      const u = new Set((usadas ?? []).map(x => x.requisicao_id))
      rows = rows.filter(r => !u.has(r.id))
    }
    if (!rows.length) return ok('Nenhuma requisição encontrada.')
    return ok(rows.map(r => `#${r.id} · ${r.empresa} · ${r.categoria} · ${dia(r.data_solicitacao)} · ${String(r.descricao).slice(0, 200)}${(r.anexos ?? []).length ? ` · ${r.anexos.length} anexo(s)` : ''}`).join('\n'))
  })

  server.registerTool('criar_requisicao', {
    description: 'Cria uma requisição (fica aguardando autorização). Só nos fluxos 4 e 5. Pergunte ao usuário se há documento (PDF) para anexar; depois de criar, o resultado traz o link de upload. ' +
      'Chame primeiro com confirmar=false para ver o resumo, mostre ao usuário e só use confirmar=true depois do OK dele.',
    inputSchema: { modulo, centro: z.string().describe('nome exato do centro de resultado'), categoria: z.string().describe('nome exato da categoria'), descricao: z.string().min(3), confirmar: z.boolean().default(false) },
    annotations: { destructiveHint: true },
  }, async ({ modulo: m, centro, categoria, descricao, confirmar }) => {
    if (!veModulo(s.modulo, m)) return falha('Seu perfil não acessa este módulo.')
    const cli = await db()
    const f = await fluxoDe(cli, m)
    if (!usaRequisicao(f)) return falha(`Requisições só existem nos fluxos 4 e 5; este projeto usa o fluxo ${f}.`)
    const { data: cat } = await cli.from(TAB_PEDIDO[m].categorias).select('categoria').eq('empresa', centro).eq('categoria', categoria).maybeSingle()
    if (!cat) return falha(`Categoria "${categoria}" não encontrada no centro "${centro}" (use os nomes exatos).`)
    const resumo = `REQUISIÇÃO ${m}: ${centro} / ${categoria} — "${descricao.trim()}"`
    if (!confirmar) return ok(`${resumo}\nNada foi feito ainda. Para executar, chame de novo com confirmar=true.`)
    const { data, error } = await cli.from(REQ[m]).insert({ empresa: centro, categoria, descricao: descricao.trim(), status: AGUARDANDO, data_solicitacao: hoje() }).select('id').single()
    return error ? falha(error.message) : ok(`Feito: requisição #${data.id} criada, aguardando autorização. ${resumo}${await aviso(m, 'requisicao', data.id)}`)
  })

  server.registerTool('decidir_requisicao', {
    description: 'Autoriza ou rejeita uma requisição aguardando autorização (só admin do módulo). Use confirmar=false antes, como em decidir_pedido.',
    inputSchema: { modulo, id: z.number().int(), decisao: z.enum(['autorizar', 'rejeitar']), confirmar: z.boolean().default(false) },
    annotations: { destructiveHint: true },
  }, async ({ modulo: m, id, decisao, confirmar }) => {
    if (!podeDecidir(s, m)) return falha('Só administrador do módulo pode autorizar ou rejeitar requisições.')
    const cli = await db()
    const { data: r } = await cli.from(REQ[m]).select('id, empresa, categoria, descricao, status').eq('id', id).maybeSingle()
    if (!r) return falha('Requisição não encontrada (ou fora dos seus centros).')
    if (r.status !== AGUARDANDO) return falha(`Esta requisição não está aguardando autorização (status: ${r.status}).`)
    const resumo = `${decisao === 'autorizar' ? 'AUTORIZAR' : 'REJEITAR'} requisição #${id}: ${r.empresa} / ${r.categoria} — "${String(r.descricao).slice(0, 200)}"`
    if (!confirmar) return ok(`${resumo}\nNada foi feito ainda. Para executar, chame de novo com confirmar=true.`)
    const { error } = await cli.from(REQ[m]).update({ status: decisao === 'autorizar' ? 'Autorizado' : 'Não Autorizado', data_autorizacao: hoje(), usuario_autorizador: s.username }).eq('id', id)
    return error ? falha(error.message) : ok(`Feito: ${resumo}`)
  })

  server.registerTool('criar_pedido', {
    description: 'Cria um pedido (de compra em pagamentos, de venda em recebimentos) aguardando autorização: centro, categoria, fornecedor/cliente e o cronograma por mês. ' +
      'Segue o fluxo do projeto: nos fluxos 4 e 5 exige uma requisição já autorizada do mesmo centro (requisicao_id; veja listar_requisicoes); nos fluxos 1 e 4 cada mês precisa caber no saldo do orçamento. Fluxo 3 não tem pedido. ' +
      'Pergunte ao usuário se há documento (PDF) para anexar; depois de criar, o resultado traz o link de upload. Chame primeiro com confirmar=false, mostre o resumo e só use confirmar=true depois do OK dele.',
    inputSchema: {
      modulo, centro: z.string().describe('nome exato do centro de resultado'), categoria: z.string().describe('nome exato da categoria'),
      parte: z.string().describe('nome exato do fornecedor (pagamentos) ou cliente (recebimentos)'),
      periodos: z.array(z.object({
        mes: z.number().int().min(1).max(12), ano: z.number().int().min(2025).max(2050), valor: z.number().positive(),
        beneficiario: z.string().optional().describe('se omitido, é o próprio fornecedor/cliente do pedido'),
      })).min(1).max(36),
      observacao: z.string().optional(), emergencia: z.boolean().default(false), requisicao_id: z.number().int().optional(),
      confirmar: z.boolean().default(false),
    },
    annotations: { destructiveHint: true },
  }, async ({ modulo: m, centro, categoria, parte, periodos, observacao, emergencia, requisicao_id, confirmar }) => {
    if (!veModulo(s.modulo, m)) return falha('Seu perfil não acessa este módulo.')
    const t = TAB_PEDIDO[m]
    const { parte: colParte, benef: colBenef } = CONTAS[m === 'pagamentos' ? 'pagar' : 'receber']
    const cli = await db()
    const f = await fluxoDe(cli, m)
    if (f === '3') return falha('Este projeto usa o fluxo 3: as contas são lançadas direto, sem etapa de pedido.')

    // a tela só oferece centros/categorias que têm orçamento cadastrado
    const { data: combo } = await cli.from(ORC_USUARIOS[m]).select('id').eq('empresa', centro).eq('categoria', categoria).limit(1)
    if (!combo?.length) return falha(`Centro "${centro}" / categoria "${categoria}" não encontrados (use os nomes exatos; a tela só aceita combinações com orçamento cadastrado).`)

    const itens = periodos.map(p => ({ ...p, beneficiario: p.beneficiario?.trim() || parte }))
    const nomes = [...new Set([parte, ...itens.map(i => i.beneficiario)])]
    const { data: ex } = await cli.from(t.partes).select('nome').in('nome', nomes)
    const faltam = nomes.filter(n => !(ex ?? []).some(e => e.nome === n))
    if (faltam.length) return falha(`${t.parteRotulo} não cadastrado: ${faltam.join(', ')} (use o nome exato).`)

    const chaves = new Set<string>()
    for (const i of itens) {
      const k = `${i.mes}/${i.ano}/${i.beneficiario}`
      if (chaves.has(k)) return falha(`Período ${i.mes}/${i.ano} repetido para ${i.beneficiario}.`)
      chaves.add(k)
    }

    // orçamento: vários beneficiários no mesmo mês consomem o mesmo saldo
    const linhasSaldo: string[] = []
    if (controlaOrcamento(f)) {
      const porMes = new Map<string, number>()
      for (const i of itens) porMes.set(`${i.mes}/${i.ano}`, (porMes.get(`${i.mes}/${i.ano}`) ?? 0) + i.valor)
      for (const [k, v] of porMes) {
        const [mes, ano] = k.split('/').map(Number)
        const { data: o } = await cli.from(t.orcamento).select('valor_orcamento, valor_pedidos_solicitados').eq('empresa', centro).eq('categoria', categoria).eq('mes', mes).eq('ano', ano).maybeSingle()
        if (!o) return falha(`Não existe orçamento para ${MESES[mes - 1]}/${ano}.`)
        const saldo = o.valor_orcamento - o.valor_pedidos_solicitados
        if (Math.round(v * 100) > Math.round(saldo * 100)) return falha(`Valor ${brl(v)} em ${MESES[mes - 1]}/${ano} excede o saldo disponível de ${brl(saldo)}.`)
        linhasSaldo.push(`${MESES[mes - 1]}/${ano}: ${brl(v)} de saldo ${brl(saldo)}`)
      }
    }

    if (usaRequisicao(f)) {
      if (!requisicao_id) return falha('Este projeto exige uma requisição autorizada (fluxos 4 e 5): informe requisicao_id (veja listar_requisicoes com situacao=autorizadas_sem_pedido).')
      const { data: r } = await cli.from(REQ[m]).select('id, empresa, status, atendida_sem_pedido').eq('id', requisicao_id).maybeSingle()
      if (!r || r.status !== 'Autorizado' || r.atendida_sem_pedido) return falha(`Requisição #${requisicao_id} não está autorizada e disponível.`)
      if (r.empresa !== centro) return falha(`A requisição #${requisicao_id} é do centro "${r.empresa}", não de "${centro}".`)
      const { count } = await cli.from(t.pedido).select('id', { count: 'exact', head: true }).eq('requisicao_id', requisicao_id)
      if (count) return falha(`A requisição #${requisicao_id} já foi usada por outro pedido.`)
    } else if (requisicao_id) {
      return falha(`Este projeto usa o fluxo ${f}, sem requisição: não informe requisicao_id.`)
    }

    const total = Math.round(itens.reduce((a, i) => a + i.valor, 0) * 100) / 100
    const resumo = `PEDIDO ${m}: ${centro} / ${categoria} / ${parte} — ${brl(total)}${emergencia ? ' (EMERGENCIAL)' : ''}${requisicao_id ? ` · requisição #${requisicao_id}` : ''}\n` +
      itens.map(i => `  ${MESES[i.mes - 1]}/${i.ano}: ${brl(i.valor)}${i.beneficiario !== parte ? ` → ${i.beneficiario}` : ''}`).join('\n') +
      (linhasSaldo.length ? `\n  saldo conferido (${linhasSaldo.join('; ')})` : '') + (observacao ? `\n  obs: "${observacao}"` : '')
    if (!confirmar) return ok(`${resumo}\nNada foi feito ainda. Para executar, chame de novo com confirmar=true.`)

    const { data: ped, error } = await cli.from(t.pedido).insert({
      empresa: centro, categoria, [colParte]: parte, observacao: observacao || null, emergencia, valor_pedido: total, data_solicitacao: hoje(),
      arquivo_texto: [], arquivos_pdf_ids: [], status: AGUARDANDO, requisicao_id: requisicao_id ?? null,
    }).select('id').single()
    if (error || !ped) return falha(error?.code === '23505' ? 'Esta requisição já foi utilizada por outro pedido.' : error?.message ?? 'Erro ao criar pedido')

    const { error: eFluxo } = await cli.from(t.fluxo).insert(itens.map(i => ({
      pedido_id: ped.id, empresa: centro, categoria, [colParte]: parte, [colBenef]: i.beneficiario, mes: i.mes, ano: i.ano, valor_referente: i.valor,
    })))
    if (eFluxo) {
      await cli.from(t.pedido).delete().eq('id', ped.id)
      return falha(`Não foi possível gravar os períodos: ${eFluxo.message}`)
    }
    await cli.from(t.pedido).update({ usuario_solicitante: s.username }).eq('id', ped.id) // como a tela: falha em silêncio se a coluna não existir
    return ok(`Feito: pedido #${ped.id} criado, aguardando autorização.\n${resumo}${await aviso(m, 'pedido', ped.id)}`)
  })
}
