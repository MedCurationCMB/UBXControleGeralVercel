import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { TAB_PEDIDO, type ModuloPedido } from '@/lib/ajuste'
import { CONTAS } from '@/lib/extratoVinculo'
import { desfazerAtendidaSemPedido, marcarAtendidaSemPedido, TAB_REQ } from '@/lib/requisicao'
import { clienteDoUsuario } from '@/lib/supabase/usuario'
import { supabaseServer } from '@/lib/supabase/server'
import { veModulo } from '@/lib/modulos'
import { dataOk, hojeBrasilia, referencias, REF } from '@/lib/mcp/contas'
import { brl, falha, modulo, ok, podeDecidir } from '@/lib/mcp/pedidos'
import { fluxoDe } from '@/lib/mcp/solicitacoes'
import type { SessionPayload } from '@/types/database'

// Manutenção com as regras das telas: lançar conta direto (fluxo 3), excluir (conta, documento, fornecedor/cliente, conta bancária),
// "atendida sem pedido" de requisição e alteração de contas em lote.
const DOCS = { pagamentos: 'documentos', recebimentos: 'documentos_receita' } as const
const INFO_BOLETO = { pagamentos: 'informacoes_boleto', recebimentos: 'informacoes_boleto_receita' } as const
const DOC_COL = { pagamentos: 'pagamento_id', recebimentos: 'recebimento_id' } as const
const data = z.string().describe('AAAA-MM-DD')
const preview = (resumo: string) => ok(`${resumo}\nNada foi feito ainda. Para executar, chame de novo com confirmar=true.`)
const dia = (d: unknown) => (d ? String(d).slice(0, 10).split('-').reverse().join('/') : '-')

export function registrarManutencao(server: McpServer, s: SessionPayload) {
  const db = () => clienteDoUsuario(s)

  // ---- 1. lançar conta direto (fluxo 3: sem etapa de pedido) ----
  server.registerTool('lancar_conta', {
    description: 'Lança uma conta a pagar (pagamentos) ou a receber (recebimentos) direto, sem pedido, como na tela "Lançar Conta". Só no fluxo 3 do projeto. ' +
      'Cria o pedido já autorizado (por você) e a conta com status À Pagar. Fornecedor/cliente, centro e categoria precisam existir (nomes exatos). Use confirmar=false antes.',
    inputSchema: {
      modulo, centro: z.string(), categoria: z.string(), parte: z.string().describe('fornecedor (pagamentos) ou cliente (recebimentos)'),
      valor: z.number().positive(), data_vencimento: data.optional().describe('padrão: hoje'), tipo: z.string().describe('PIX, Dinheiro, Boleto, Cartão de Crédito ou Ainda à Definir'),
      observacao: z.string().optional(), confirmar: z.boolean().default(false),
    },
    annotations: { destructiveHint: true },
  }, async ({ modulo: m, centro, categoria, parte, valor, data_vencimento, tipo, observacao, confirmar }) => {
    if (!veModulo(s.modulo, m)) return falha('Seu perfil não acessa este módulo.')
    const t = TAB_PEDIDO[m]
    const c = CONTAS[m === 'pagamentos' ? 'pagar' : 'receber']
    const cli = await db()
    const f = await fluxoDe(cli, m)
    if (f !== '3') return falha(`Lançar conta direto só vale no fluxo 3; este projeto usa o fluxo ${f} (use criar_pedido).`)
    const { data: cat } = await cli.from(t.categorias).select('categoria').eq('empresa', centro).eq('categoria', categoria).maybeSingle()
    if (!cat) return falha(`Categoria "${categoria}" não encontrada no centro "${centro}" (use os nomes exatos).`)
    const { data: ex } = await cli.from(t.partes).select('nome').eq('nome', parte).maybeSingle()
    if (!ex) return falha(`${t.parteRotulo} "${parte}" não cadastrado (use o nome exato).`)
    const ref = await referencias(cli, m)
    const tp = ref.tipo(tipo)
    if (!tp) return falha(`Tipo inválido. Use: ${ref.tipos.map(x => x.tipos).join(', ')}.`)
    const venc = data_vencimento ?? hojeBrasilia()
    if (!dataOk(venc)) return falha('Data de vencimento inválida (use AAAA-MM-DD).')
    const v = Math.round(valor * 100) / 100
    const resumo = `LANÇAR CONTA (${m}, fluxo 3): ${centro} / ${categoria} / ${parte} — ${brl(v)} · venc ${dia(venc)} · ${tp.tipos}${observacao ? ` · "${observacao}"` : ''}\n  cria o pedido já autorizado por ${s.username} e a conta`
    if (!confirmar) return preview(resumo)
    const hoje = hojeBrasilia()
    const { data: ped, error } = await cli.from(t.pedido).insert({
      empresa: centro, categoria, [t.parte]: parte, observacao: observacao || null, valor_pedido: v, status: 'Autorizado',
      data_solicitacao: hoje, data_autorizacao: hoje, usuario_autorizador: s.username,
    }).select('id').single()
    if (error || !ped) return falha(error?.message ?? 'Erro ao criar o pedido')
    const { data: conta, error: eConta } = await cli.from(c.tabela).insert({
      pedido_id: ped.id, data_vencimento: venc, valor_pagar: v, [REF[m].tipoCol]: tp.id, [c.status]: ref.statuses[0]?.id ?? 1,
    }).select('id').single()
    if (eConta || !conta) {
      await cli.from(t.pedido).delete().eq('id', ped.id) // não deixa pedido sem conta
      return falha(eConta?.message ?? 'Erro ao criar a conta')
    }
    return ok(`Feito: pedido #${ped.id} e conta #${conta.id} criados.\n${resumo}`)
  })

  // ---- 2. excluir conta ----
  server.registerTool('excluir_conta', {
    description: 'Exclui uma conta a pagar/receber (o pedido continua). Não dá para desfazer: o resumo avisa se a conta já tem pagamento registrado, conciliação com extrato, envio ao banco ou documentos. Use confirmar=false antes e só confirme com o OK explícito do usuário.',
    inputSchema: { modulo, conta_id: z.number().int(), confirmar: z.boolean().default(false) },
    annotations: { destructiveHint: true },
  }, async ({ modulo: m, conta_id, confirmar }) => {
    if (!veModulo(s.modulo, m)) return falha('Seu perfil não acessa este módulo.')
    const c = CONTAS[m === 'pagamentos' ? 'pagar' : 'receber']
    const cli = await db()
    const { data: row } = await cli.from(c.tabela).select('*').eq('id', conta_id).maybeSingle()
    if (!row) return falha('Conta não encontrada (ou fora dos seus centros).')
    const { count: docs } = await cli.from(DOCS[m]).select('id', { count: 'exact', head: true }).eq(DOC_COL[m], conta_id)
    const avisos = [
      row.valor_pagamento != null ? `${m === 'pagamentos' ? 'pagamento' : 'recebimento'} registrado de ${brl(Number(row.valor_pagamento))} em ${dia(row.data_pagamento)}` : '',
      row.extrato_lancamento_id ? 'conciliada com uma linha do extrato (a linha volta a ficar sem vínculo)' : '',
      row.enviado_banco_em ? 'já enviada ao banco por remessa' : '',
      docs ? `${docs} documento(s) ligado(s) a ela (comprovante/boleto) ficam sem conta` : '',
    ].filter(Boolean)
    const resumo = `EXCLUIR conta #${conta_id} do pedido #${row.pedido_id}: ${brl(Number(row.valor_pagar ?? 0))} · venc ${dia(row.data_vencimento)}${avisos.length ? `\nATENÇÃO: ${avisos.join('; ')}.` : ''}`
    if (!confirmar) return preview(resumo)
    const { error } = await cli.from(c.tabela).delete().eq('id', conta_id)
    return error ? falha(error.message) : ok(`Feito: ${resumo}`)
  })

  // ---- 3. excluir documento ----
  server.registerTool('excluir_documento', {
    description: 'Exclui um documento de pedido ou de conta (comprovante, boleto, anexo; use o #id de listar_documentos). O registro some do sistema; o arquivo guardado no armazenamento não é apagado, como na tela. Use confirmar=false antes e só confirme com o OK explícito do usuário.',
    inputSchema: { modulo, documento_id: z.number().int(), confirmar: z.boolean().default(false) },
    annotations: { destructiveHint: true },
  }, async ({ modulo: m, documento_id, confirmar }) => {
    if (!veModulo(s.modulo, m)) return falha('Seu perfil não acessa este módulo.')
    const cli = await db()
    const { data: d } = await cli.from(DOCS[m]).select('id, nome_documento, tipo_documento, pedido_id, usuario').eq('id', documento_id).maybeSingle()
    if (!d) return falha('Documento não encontrado (ou fora dos seus centros).')
    const { data: tp } = await cli.from('tipos_documento').select('tipo').eq('id', d.tipo_documento).maybeSingle()
    const resumo = `EXCLUIR documento #${documento_id} "${d.nome_documento}" (${tp?.tipo ?? 'sem tipo'}, pedido #${d.pedido_id ?? '-'}, enviado por ${d.usuario})`
    if (!confirmar) return preview(resumo)
    const { error } = await cli.from(DOCS[m]).delete().eq('id', documento_id)
    if (error) return falha(error.message)
    await supabaseServer.from(INFO_BOLETO[m]).delete().eq('boleto_id', documento_id) // dados lidos do boleto (já validado: o documento era visível ao usuário)
    return ok(`Feito: ${resumo}`)
  })

  // ---- 4. excluir fornecedor/cliente e conta bancária ----
  server.registerTool('excluir_parceiro', {
    description: 'Exclui um fornecedor (pagamentos) ou cliente (recebimentos). Por segurança só exclui se NÃO houver pedido, parcela ou conta usando o nome (o nome é a chave usada neles). Use confirmar=false antes e só confirme com o OK explícito do usuário.',
    inputSchema: { tipo: z.enum(['fornecedor', 'cliente']), id: z.number().int(), confirmar: z.boolean().default(false) },
    annotations: { destructiveHint: true },
  }, async ({ tipo, id, confirmar }) => {
    const m: ModuloPedido = tipo === 'fornecedor' ? 'pagamentos' : 'recebimentos'
    if (!veModulo(s.modulo, m)) return falha('Seu perfil não acessa este módulo.')
    const t = TAB_PEDIDO[m]
    const c = CONTAS[m === 'pagamentos' ? 'pagar' : 'receber']
    const cli = await db()
    const { data: p } = await cli.from(t.partes).select('id, nome').eq('id', id).maybeSingle()
    if (!p) return falha(`${t.parteRotulo} #${id} não encontrado.`)
    // conta nos três lugares com o cliente de serviço filtrado pelo projeto (o RLS do usuário esconderia centros que ele não vê)
    const uso = async (tab: string, col: string) => (await supabaseServer.from(tab).select('id', { count: 'exact', head: true }).eq('projeto_id', s.projetoId).eq(col, p.nome)).count ?? 0
    const [peds, fluxo, contas] = await Promise.all([uso(t.pedido, t.parte), uso(t.fluxo, c.benef), uso(c.tabela, c.benef)])
    if (peds || fluxo || contas) return falha(`Não é possível excluir "${p.nome}": está em ${peds} pedido(s), ${fluxo} parcela(s) de cronograma e ${contas} conta(s). Edite ou cancele esses registros antes.`)
    const resumo = `EXCLUIR ${tipo} #${id} "${p.nome}" (sem pedidos, parcelas ou contas)`
    if (!confirmar) return preview(resumo)
    const { error } = await cli.from(t.partes).delete().eq('id', id)
    return error ? falha(error.message) : ok(`Feito: ${resumo}`)
  })

  server.registerTool('excluir_conta_bancaria', {
    description: 'Exclui uma conta bancária da empresa (a usada nas remessas). Use listar_contas_bancarias para o #id. Não dá para desfazer. Use confirmar=false antes.',
    inputSchema: { id: z.number().int(), confirmar: z.boolean().default(false) },
    annotations: { destructiveHint: true },
  }, async ({ id, confirmar }) => {
    const cli = await db()
    const { data: c } = await cli.from('conta_pagador').select('id, nome_empresa, agencia, conta_corrente').eq('id', id).maybeSingle()
    if (!c) return falha(`Conta bancária #${id} não encontrada.`)
    const resumo = `EXCLUIR conta bancária #${id} "${c.nome_empresa}" (ag ${c.agencia ?? '-'} · cc ${c.conta_corrente ?? '-'})`
    if (!confirmar) return preview(resumo)
    const { error } = await cli.from('conta_pagador').delete().eq('id', id)
    return error ? falha(error.message) : ok(`Feito: ${resumo}`)
  })

  // ---- 5. requisição atendida sem pedido ----
  async function carregarReq(m: ModuloPedido, id: number) {
    const { data: r } = await (await db()).from(TAB_REQ[m]).select('id, empresa, categoria, descricao, status, atendida_sem_pedido, atendida_obs').eq('id', id).maybeSingle()
    return r as { id: number; empresa: string; categoria: string; descricao: string; status: string; atendida_sem_pedido: boolean; atendida_obs: string | null } | null
  }

  server.registerTool('marcar_requisicao_atendida', {
    description: 'Marca uma requisição como "atendida sem pedido" (não gera pedido nem pagamento). Se ainda estiver aguardando autorização, ela também é autorizada. Só admin do módulo; o banco recusa se já houver pedido. Use confirmar=false antes.',
    inputSchema: { modulo, id: z.number().int(), observacao: z.string().optional(), confirmar: z.boolean().default(false) },
    annotations: { destructiveHint: true },
  }, async ({ modulo: m, id, observacao, confirmar }) => {
    if (!podeDecidir(s, m)) return falha('Só administrador do módulo marca requisição como atendida sem pedido.')
    const r = await carregarReq(m, id)
    if (!r) return falha('Requisição não encontrada (ou fora dos seus centros).')
    if (r.atendida_sem_pedido) return falha('Esta requisição já está marcada como atendida sem pedido.')
    if (r.status !== 'Autorizado' && r.status !== 'Aguardando Autorização') return falha(`Só requisição autorizada ou aguardando autorização pode ser marcada (status: ${r.status}).`)
    const autoriza = r.status === 'Aguardando Autorização'
    const resumo = `ATENDIDA SEM PEDIDO — requisição #${id} (${r.empresa} / ${r.categoria}): "${r.descricao.slice(0, 120)}"${observacao ? `\n  obs: ${observacao}` : ''}${autoriza ? '\n  a requisição também será autorizada' : ''}`
    if (!confirmar) return preview(resumo)
    const erro = await marcarAtendidaSemPedido(m, id, s.username, observacao ?? '', autoriza, await db())
    return erro ? falha(erro) : ok(`Feito: ${resumo}`)
  })

  server.registerTool('desfazer_requisicao_atendida', {
    description: 'Desfaz o "atendida sem pedido" de uma requisição: ela volta a "autorizada, aguardando pedido". Só admin do módulo. Use confirmar=false antes.',
    inputSchema: { modulo, id: z.number().int(), confirmar: z.boolean().default(false) },
    annotations: { destructiveHint: true },
  }, async ({ modulo: m, id, confirmar }) => {
    if (!podeDecidir(s, m)) return falha('Só administrador do módulo desfaz o "atendida sem pedido".')
    const r = await carregarReq(m, id)
    if (!r) return falha('Requisição não encontrada (ou fora dos seus centros).')
    if (!r.atendida_sem_pedido) return falha('Esta requisição não está marcada como atendida sem pedido.')
    const resumo = `DESFAZER atendida sem pedido — requisição #${id} (${r.empresa} / ${r.categoria}): volta a autorizada, aguardando pedido`
    if (!confirmar) return preview(resumo)
    const erro = await desfazerAtendidaSemPedido(m, id, await db())
    return erro ? falha(erro) : ok(`Feito: ${resumo}`)
  })

  // ---- 6. alterar contas em lote ----
  server.registerTool('atualizar_contas_em_lote', {
    description: 'Altera o status e/ou o vencimento de várias contas de uma vez (use os #ids de listar_contas; até 200). Para pagamento com data e valor use registrar_pagamento. Use confirmar=false antes: o resumo mostra quantas contas e o que muda.',
    inputSchema: {
      modulo, conta_ids: z.array(z.number().int()).min(1).max(200), status: z.string().optional().describe('À Pagar, Enviado para o banco ou Pago'),
      data_vencimento: data.optional(), confirmar: z.boolean().default(false),
    },
    annotations: { destructiveHint: true },
  }, async ({ modulo: m, conta_ids, status, data_vencimento, confirmar }) => {
    if (!veModulo(s.modulo, m)) return falha('Seu perfil não acessa este módulo.')
    if (!status && !data_vencimento) return falha('Informe o status e/ou a data de vencimento novos.')
    if (data_vencimento && !dataOk(data_vencimento)) return falha('Data de vencimento inválida (use AAAA-MM-DD).')
    const c = CONTAS[m === 'pagamentos' ? 'pagar' : 'receber']
    const cli = await db()
    const ref = await referencias(cli, m)
    const st = status ? ref.status(status) : undefined
    if (status && !st) return falha(`Status inválido. Use: ${ref.statuses.map(x => x.nome_status).join(', ')}.`)
    const ids = [...new Set(conta_ids)]
    const { data: rows, error } = await cli.from(c.tabela).select(`id, valor_pagamento, ${c.status}`).in('id', ids)
    if (error) return falha(error.message)
    const achadas = new Set((rows ?? []).map(r => (r as unknown as { id: number }).id))
    const faltam = ids.filter(i => !achadas.has(i))
    if (faltam.length) return falha(`Conta(s) não encontrada(s) ou fora dos seus centros: ${faltam.slice(0, 10).join(', ')}${faltam.length > 10 ? '…' : ''}. Nada foi alterado.`)
    const semPagamento = (rows ?? []).filter(r => (r as unknown as { valor_pagamento: number | null }).valor_pagamento == null).length
    const resumo = `ALTERAR ${ids.length} conta(s) (${m}): ${[st ? `status → ${st.nome_status}` : '', data_vencimento ? `vencimento → ${dia(data_vencimento)}` : ''].filter(Boolean).join(' · ')}\n  contas: ${ids.slice(0, 15).map(i => `#${i}`).join(', ')}${ids.length > 15 ? '…' : ''}` +
      (st && /pago/i.test(st.nome_status) && semPagamento ? `\nATENÇÃO: ${semPagamento} conta(s) ficarão como Pago sem data/valor de pagamento registrados.` : '')
    if (!confirmar) return preview(resumo)
    const { error: eUp } = await cli.from(c.tabela).update({ ...(st && { [c.status]: st.id }), ...(data_vencimento && { data_vencimento }) }).in('id', ids)
    return eUp ? falha(eUp.message) : ok(`Feito: ${resumo}`)
  })
}
