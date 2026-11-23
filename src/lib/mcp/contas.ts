import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { TAB_PEDIDO, type ModuloPedido } from '@/lib/ajuste'
import { getSituacao } from '@/lib/controle-pagamentos-server'
import { CONTAS } from '@/lib/extratoVinculo'
import { clienteDoUsuario } from '@/lib/supabase/usuario'
import { veModulo } from '@/lib/modulos'
import { brl, falha, modulo, ok } from '@/lib/mcp/pedidos'
import type { SessionPayload } from '@/types/database'

// Contas a pagar (controle_pagamentos) e a receber (controle_recebimento): listar, adicionar parcela, registrar pagamento/recebimento e editar,
// com as regras da tela de Controle. Quem vê o módulo pode, como na tela (o menu não é só de admin). Excluir e boleto/comprovante ficam para depois.
const REF = {
  pagamentos: { statusTab: 'pagamento_status', tipoTab: 'tipos_pagamento', tipoCol: 'tipo_pagamento', tipo: 'pagar', verbo: 'pagamento' },
  recebimentos: { statusTab: 'recebimento_status', tipoTab: 'tipos_recebimento', tipoCol: 'tipo_recebimento', tipo: 'receber', verbo: 'recebimento' },
} as const satisfies Record<ModuloPedido, object>

const hojeBrasilia = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
const dataOk = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(d))
const dia = (d: string | null) => (d ? d.slice(0, 10).split('-').reverse().join('/') : '-')
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
const limpa = (s: string) => s.replace(/[%,()]/g, '').trim() // vai num ilike
const data = z.string().describe('AAAA-MM-DD')

async function referencias(cli: SupabaseClient, m: ModuloPedido) {
  const r = REF[m]
  const [{ data: st }, { data: tp }] = await Promise.all([cli.from(r.statusTab).select('id, nome_status'), cli.from(r.tipoTab).select('id, tipos')])
  const statuses = (st ?? []) as { id: number; nome_status: string }[]
  const tipos = (tp ?? []) as { id: number; tipos: string }[]
  return {
    statuses, tipos,
    status: (n: string) => statuses.find(s => norm(s.nome_status) === norm(n)),
    tipo: (n: string) => tipos.find(t => norm(t.tipos) === norm(n)),
    nomeStatus: (id: number | null) => statuses.find(s => s.id === id)?.nome_status ?? '-',
    nomeTipo: (id: number | null) => tipos.find(t => t.id === id)?.tipos ?? '-',
  }
}

export function registrarContas(server: McpServer, s: SessionPayload) {
  const db = () => clienteDoUsuario(s)
  const cfg = (m: ModuloPedido) => ({ c: CONTAS[REF[m].tipo], r: REF[m], t: TAB_PEDIDO[m] })

  // Uma conta com os dados do pedido, ou null (RLS: só as que o usuário enxerga)
  async function carregar(cli: SupabaseClient, m: ModuloPedido, id: number) {
    const { c, r } = cfg(m)
    const { data: row } = await cli.from(c.tabela)
      .select(`id, pedido_id, data_vencimento, valor_pagar, data_pagamento, valor_pagamento, ${c.status}, ${r.tipoCol}, ${c.benef}, ${c.pedido}(empresa, categoria, ${c.parte})`)
      .eq('id', id).maybeSingle()
    return row as unknown as Record<string, unknown> | null
  }
  const quem = (m: ModuloPedido, row: Record<string, unknown>) => {
    const { c } = cfg(m)
    const ped = (row[c.pedido] ?? {}) as Record<string, string>
    return `conta #${row.id} (pedido #${row.pedido_id} · ${ped.empresa ?? '?'} · ${(row[c.benef] as string | null) ?? ped[c.parte] ?? '?'})`
  }

  server.registerTool('listar_contas', {
    description: 'Lista contas a pagar (pagamentos) ou a receber (recebimentos) com vencimento, valor, pagamento e situação (Atrasado, Em dia, Quitado, Sem vencimento), mais totais do filtro. Mais atrasadas primeiro.',
    inputSchema: {
      modulo, situacao: z.enum(['Atrasado', 'Em dia', 'Quitado', 'Sem vencimento']).optional(),
      centro: z.string().optional().describe('parte do nome do centro de resultado'), categoria: z.string().optional(),
      parte: z.string().optional().describe('parte do nome do fornecedor/cliente (beneficiário)'),
      pedido_id: z.number().int().optional(), status: z.string().optional().describe('À Pagar, Enviado para o banco ou Pago'),
      vencimento_de: data.optional(), vencimento_ate: data.optional(), sem_vinculo_extrato: z.boolean().optional(),
      limite: z.number().int().min(1).max(100).default(30),
    },
    annotations: { readOnlyHint: true },
  }, async ({ modulo: m, situacao, centro, categoria, parte, pedido_id, status, vencimento_de, vencimento_ate, sem_vinculo_extrato, limite }) => {
    if (!veModulo(s.modulo, m)) return falha('Seu perfil não acessa este módulo.')
    const { c, r } = cfg(m)
    const cli = await db()
    const ref = await referencias(cli, m)
    const emb = centro || categoria ? `${c.pedido}!inner` : c.pedido
    let q = cli.from(c.tabela).select(
      `id, pedido_id, data_vencimento, valor_pagar, data_pagamento, valor_pagamento, ${c.status}, ${r.tipoCol}, extrato_lancamento_id, ${c.benef}, ${emb}(empresa, categoria, ${c.parte})`)
    if (centro) q = q.ilike(`${c.pedido}.empresa`, `%${limpa(centro)}%`)
    if (categoria) q = q.ilike(`${c.pedido}.categoria`, `%${limpa(categoria)}%`)
    if (pedido_id) q = q.eq('pedido_id', pedido_id)
    if (status) { const st = ref.status(status); if (!st) return falha(`Status inválido. Use: ${ref.statuses.map(x => x.nome_status).join(', ')}.`); q = q.eq(c.status, st.id) }
    if (vencimento_de) q = q.gte('data_vencimento', vencimento_de)
    if (vencimento_ate) q = q.lte('data_vencimento', vencimento_ate)
    if (sem_vinculo_extrato) q = q.is('extrato_lancamento_id', null)
    // ponytail: olha até 1000 contas do filtro e filtra situação/parte em memória; use filtros de data/centro se passar disso
    const { data: rows, error } = await q.order('data_vencimento', { ascending: true, nullsFirst: false }).order('id').range(0, 999)
    if (error) return falha(error.message)

    let lista = ((rows ?? []) as unknown as Record<string, unknown>[]).map(x => {
      const ped = (x[c.pedido] ?? {}) as Record<string, string>
      return { x, ped, parte: ((x[c.benef] as string | null) ?? ped[c.parte] ?? ''), situacao: getSituacao(x as { valor_pagar: number | null; valor_pagamento: number | null; data_vencimento: string | null }) }
    })
    if (parte) lista = lista.filter(l => norm(l.parte).includes(norm(parte)))
    if (situacao) lista = lista.filter(l => l.situacao === situacao)
    if (!lista.length) return ok('Nenhuma conta encontrada.')

    const soma = (f: (l: (typeof lista)[number]) => number) => lista.reduce((a, l) => a + f(l), 0)
    const topo = `${lista.length} conta(s)${(rows?.length ?? 0) === 1000 ? ' (limite de 1000 lidas; refine o filtro)' : ''} · total ${brl(soma(l => Number(l.x.valor_pagar ?? 0)))} · ${r.verbo} efetuado ${brl(soma(l => Number(l.x.valor_pagamento ?? 0)))}` +
      ` · atrasado ${brl(soma(l => (l.situacao === 'Atrasado' ? Number(l.x.valor_pagar ?? 0) - Number(l.x.valor_pagamento ?? 0) : 0)))}`
    const ordem = { Atrasado: 0, 'Em dia': 1, 'Sem vencimento': 2, Quitado: 3 } as const
    const linhas = [...lista].sort((a, b) => ordem[a.situacao as keyof typeof ordem] - ordem[b.situacao as keyof typeof ordem]).slice(0, limite).map(l =>
      `conta #${l.x.id} · pedido #${l.x.pedido_id} · ${l.ped.empresa ?? '?'} · ${l.ped.categoria ?? '?'} · ${l.parte} · venc ${dia(l.x.data_vencimento as string | null)} · ${brl(Number(l.x.valor_pagar ?? 0))}` +
      `${l.x.valor_pagamento != null ? ` · ${r.verbo} ${brl(Number(l.x.valor_pagamento))} em ${dia(l.x.data_pagamento as string | null)}` : ''} · ${ref.nomeStatus(l.x[c.status] as number | null)} · ${ref.nomeTipo(l.x[r.tipoCol] as number | null)} · ${l.situacao}${l.x.extrato_lancamento_id ? ' · conciliada' : ''}`)
    return ok(`${topo}\n${linhas.join('\n')}`)
  })

  // Escrita em dois passos: sem confirmar=true só mostra o que seria feito.
  server.registerTool('registrar_pagamento', {
    description: 'Registra que uma conta a pagar foi paga (ou a receber foi recebida): grava data e valor efetivos e muda o status para Pago, como no retorno do banco. ' +
      'O valor pode ser diferente do previsto (juros/multa ou parcial). Chame primeiro com confirmar=false, mostre o resumo e só use confirmar=true depois do OK do usuário.',
    inputSchema: { modulo, conta_id: z.number().int(), data: data.optional().describe('padrão: hoje'), valor: z.number().positive().optional().describe('padrão: valor previsto da conta'), confirmar: z.boolean().default(false) },
    annotations: { destructiveHint: true },
  }, async ({ modulo: m, conta_id, data: dt, valor, confirmar }) => {
    if (!veModulo(s.modulo, m)) return falha('Seu perfil não acessa este módulo.')
    const { c, r } = cfg(m)
    const cli = await db()
    const row = await carregar(cli, m, conta_id)
    if (!row) return falha('Conta não encontrada (ou fora dos seus centros).')
    const dpag = dt ?? hojeBrasilia()
    if (!dataOk(dpag)) return falha('Data inválida (use AAAA-MM-DD).')
    const vpag = Math.round((valor ?? Number(row.valor_pagar ?? 0)) * 100) / 100
    if (!(vpag > 0)) return falha('Informe o valor: a conta não tem valor previsto.')
    const ref = await referencias(cli, m)
    const pago = ref.status('Pago')
    if (!pago) return falha('Status "Pago" não existe neste banco.')
    const prev = Number(row.valor_pagar ?? 0)
    const resumo = `REGISTRAR ${r.verbo.toUpperCase()} ${quem(m, row)}: ${brl(vpag)} em ${dia(dpag)} (previsto ${brl(prev)}${vpag > prev ? ', acima do previsto' : vpag < prev ? ', abaixo do previsto: parcial' : ''}) → status Pago` +
      (row.valor_pagamento != null ? `\nATENÇÃO: já constava ${brl(Number(row.valor_pagamento))} em ${dia(row.data_pagamento as string | null)}; será substituído.` : '')
    if (!confirmar) return ok(`${resumo}\nNada foi feito ainda. Para executar, chame de novo com confirmar=true.`)
    const { error } = await cli.from(c.tabela).update({ data_pagamento: dpag, valor_pagamento: vpag, [c.status]: pago.id }).eq('id', conta_id)
    return error ? falha(error.message) : ok(`Feito: ${resumo}`)
  })

  server.registerTool('atualizar_conta', {
    description: 'Edita uma conta a pagar/receber: vencimento, valor previsto, data/valor efetivos, status e tipo (PIX, Dinheiro, Boleto, Cartão de Crédito, Ainda à Definir). Só muda o que for informado. ' +
      'limpar_pagamento=true desfaz o pagamento (apaga data e valor efetivos e volta para À Pagar). Para um pagamento comum prefira registrar_pagamento. Use confirmar=false antes, como nas outras escritas.',
    inputSchema: {
      modulo, conta_id: z.number().int(), data_vencimento: data.optional(), valor_pagar: z.number().positive().optional(),
      data_pagamento: data.optional(), valor_pagamento: z.number().positive().optional(),
      status: z.string().optional().describe('À Pagar, Enviado para o banco ou Pago'), tipo: z.string().optional(),
      limpar_pagamento: z.boolean().default(false), confirmar: z.boolean().default(false),
    },
    annotations: { destructiveHint: true },
  }, async ({ modulo: m, conta_id, status, tipo, limpar_pagamento, confirmar, ...campos }) => {
    if (!veModulo(s.modulo, m)) return falha('Seu perfil não acessa este módulo.')
    const { c, r } = cfg(m)
    const cli = await db()
    const row = await carregar(cli, m, conta_id)
    if (!row) return falha('Conta não encontrada (ou fora dos seus centros).')
    const ref = await referencias(cli, m)
    const novo: Record<string, unknown> = {}
    const mudancas: string[] = []
    for (const k of ['data_vencimento', 'data_pagamento'] as const) {
      const v = campos[k]
      if (v === undefined) continue
      if (!dataOk(v)) return falha(`${k} inválida (use AAAA-MM-DD).`)
      novo[k] = v; mudancas.push(`${k}: ${dia(row[k] as string | null)} → ${dia(v)}`)
    }
    for (const k of ['valor_pagar', 'valor_pagamento'] as const) {
      const v = campos[k]
      if (v === undefined) continue
      novo[k] = Math.round(v * 100) / 100; mudancas.push(`${k}: ${row[k] != null ? brl(Number(row[k])) : '-'} → ${brl(Number(novo[k]))}`)
    }
    if (status) {
      const st = ref.status(status)
      if (!st) return falha(`Status inválido. Use: ${ref.statuses.map(x => x.nome_status).join(', ')}.`)
      if (row[c.status] !== st.id) { novo[c.status] = st.id; mudancas.push(`status: ${ref.nomeStatus(row[c.status] as number | null)} → ${st.nome_status}`) }
    }
    if (tipo) {
      const tp = ref.tipo(tipo)
      if (!tp) return falha(`Tipo inválido. Use: ${ref.tipos.map(x => x.tipos).join(', ')}.`)
      if (row[r.tipoCol] !== tp.id) { novo[r.tipoCol] = tp.id; mudancas.push(`tipo: ${ref.nomeTipo(row[r.tipoCol] as number | null)} → ${tp.tipos}`) }
    }
    if (limpar_pagamento) {
      const aPagar = ref.statuses[0]
      Object.assign(novo, { data_pagamento: null, valor_pagamento: null, ...(aPagar && !status ? { [c.status]: aPagar.id } : {}) })
      mudancas.push(`desfaz o pagamento (apaga data/valor efetivos${aPagar && !status ? `, status → ${aPagar.nome_status}` : ''})`)
    }
    if (!mudancas.length) return falha('Nada para alterar: informe ao menos um campo.')
    const resumo = `EDITAR ${quem(m, row)}\n  ${mudancas.join('\n  ')}`
    if (!confirmar) return ok(`${resumo}\nNada foi feito ainda. Para executar, chame de novo com confirmar=true.`)
    const { error } = await cli.from(c.tabela).update(novo).eq('id', conta_id)
    return error ? falha(error.message) : ok(`Feito: ${resumo}`)
  })

  server.registerTool('adicionar_conta', {
    description: 'Adiciona uma parcela (conta a pagar/receber) a um pedido já AUTORIZADO: vencimento, valor e tipo. Começa com status À Pagar. ' +
      'O banco recusa se a soma das parcelas passar do valor do pedido. Boleto: o código de barras ainda não é informado por aqui (use a tela). Use confirmar=false antes, como nas outras escritas.',
    inputSchema: {
      modulo, pedido_id: z.number().int(), data_vencimento: data, valor: z.number().positive(), tipo: z.string().describe('PIX, Dinheiro, Boleto, Cartão de Crédito ou Ainda à Definir'),
      beneficiario: z.string().optional().describe('fornecedor/cliente que recebe; padrão: o do pedido'), confirmar: z.boolean().default(false),
    },
    annotations: { destructiveHint: true },
  }, async ({ modulo: m, pedido_id, data_vencimento, valor, tipo, beneficiario, confirmar }) => {
    if (!veModulo(s.modulo, m)) return falha('Seu perfil não acessa este módulo.')
    const { c, r, t } = cfg(m)
    const cli = await db()
    if (!dataOk(data_vencimento)) return falha('Data de vencimento inválida (use AAAA-MM-DD).')
    const { data: ped } = await cli.from(t.pedido).select('*').eq('id', pedido_id).maybeSingle()
    if (!ped) return falha('Pedido não encontrado (ou fora dos seus centros).')
    if (ped.status !== 'Autorizado' || ped.cancelado) return falha(`O pedido precisa estar autorizado e não cancelado (status: ${ped.status}).`)
    const ref = await referencias(cli, m)
    const tp = ref.tipo(tipo)
    if (!tp) return falha(`Tipo inválido. Use: ${ref.tipos.map(x => x.tipos).join(', ')}.`)

    // beneficiários possíveis: o próprio fornecedor/cliente do pedido + os do cronograma
    const { data: fl } = await cli.from(t.fluxo).select(c.benef).eq('pedido_id', pedido_id)
    const possiveis = [...new Set([ped[t.parte] as string, ...((fl ?? []) as unknown as Record<string, string | null>[]).map(x => x[c.benef]).filter((b): b is string => !!b)])]
    const benef = beneficiario?.trim() || possiveis[0]
    if (!possiveis.includes(benef)) return falha(`Beneficiário deve ser um destes: ${possiveis.join(', ')}.`)

    const { data: ex } = await cli.from(c.tabela).select('valor_pagar').eq('pedido_id', pedido_id)
    const jaTem = (ex ?? []).reduce((a, x) => a + Number(x.valor_pagar ?? 0), 0)
    const v = Math.round(valor * 100) / 100
    const resumo = `ADICIONAR conta ao pedido #${pedido_id} (${ped.empresa} · ${ped[t.parte]}): ${brl(v)} · venc ${dia(data_vencimento)} · ${tp.tipos} · beneficiário ${benef} — parcelas atuais ${brl(jaTem)} de ${brl(Number(ped.valor_pedido))}`
    if (!confirmar) return ok(`${resumo}\nNada foi feito ainda. Para executar, chame de novo com confirmar=true.`)
    const { data: nova, error } = await cli.from(c.tabela).insert({
      pedido_id, [c.benef]: benef, data_vencimento, valor_pagar: v, [c.status]: ref.statuses[0]?.id ?? 1, [r.tipoCol]: tp.id, data_pagamento: null, valor_pagamento: null,
    }).select('id').single()
    return error ? falha(error.message) : ok(`Feito: conta #${nova.id} criada.\n${resumo}`)
  })
}
