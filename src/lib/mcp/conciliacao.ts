import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { createServerClient } from '@/lib/supabase/server'
import {
  CONTAS, carregarContasLivres, carregarExtrato, carregarLancamento, conferirVinculo, contasDoDia, desvincular, tipoDoValor, vincular,
  type Candidato,
} from '@/lib/extratoVinculo'
import { brl, falha, ok } from '@/lib/mcp/pedidos'
import type { SessionPayload } from '@/types/database'

const dia = (d: string | null) => (d ? d.slice(0, 10).split('-').reverse().join('/') : '-')
const conta = (c: Candidato) => `conta #${c.id} ${c.parte || '?'} (${c.empresa || '?'}) ${brl(c.valor)} ${c.data_pagamento ? `pago ${dia(c.data_pagamento)}` : `venc ${dia(c.data_vencimento)}`}${c.sugerido ? ' ✔data bate' : ''}`

// Conciliação = vincular linhas do extrato a contas a pagar (saídas) e a receber (entradas), com as mesmas regras e funções da tela
// de Extratos Bancários. Como na tela (menu semModuloOnly): só perfil sem módulo específico; o servidor filtra tudo pelo projeto.
export function registrarConciliacao(server: McpServer, s: SessionPayload) {
  const bloqueio = () => (s.modulo ? falha('Extratos bancários são do perfil Usuário/Administrador (sem módulo específico).') : null)
  const db = createServerClient

  server.registerTool('listar_extratos', {
    description: 'Lista os extratos bancários importados no projeto (conta, período, saldos).',
    inputSchema: {},
    annotations: { readOnlyHint: true },
  }, async () => {
    const b = bloqueio(); if (b) return b
    const { data, error } = await db().from('extratos_bancarios')
      .select('id, conta, periodo_inicio, periodo_fim, saldo_inicial, saldo_final, nome_arquivo').eq('projeto_id', s.projetoId).order('periodo_inicio', { ascending: false }).limit(50)
    if (error) return falha(error.message)
    return ok(data?.length ? data.map(e => `extrato #${e.id} · conta ${e.conta} · ${dia(e.periodo_inicio)} a ${dia(e.periodo_fim)} · saldo ${brl(e.saldo_inicial)} → ${brl(e.saldo_final)} · ${e.nome_arquivo}`).join('\n') : 'Nenhum extrato importado.')
  })

  server.registerTool('ver_extrato', {
    description: 'Linhas de um extrato com o vínculo de cada uma e, para as sem vínculo, as contas candidatas (mesmo valor/sentido e data compatível). ' +
      'Saída (valor negativo) casa com conta a pagar; entrada, com conta a receber. Use vincular_extrato para conciliar.',
    inputSchema: { extrato_id: z.number().int(), situacao: z.enum(['sem_vinculo', 'todas']).default('sem_vinculo'), limite: z.number().int().min(1).max(100).default(40) },
    annotations: { readOnlyHint: true },
  }, async ({ extrato_id, situacao, limite }) => {
    const b = bloqueio(); if (b) return b
    let r
    try { r = await carregarExtrato(db(), s.projetoId, extrato_id) } catch (e) { return falha((e as Error).message) }
    if (!r) return falha('Extrato não encontrado neste projeto.')
    const todas = r.lancamentos
    const sem = todas.filter(l => !l.vinculo)
    const linhas = (situacao === 'sem_vinculo' ? sem : todas).slice(0, limite).map(l => {
      const base = `linha #${l.id} · ${dia(l.data)} · ${l.descricao} · ${brl(l.valor)}`
      if (l.vinculo) return `${base} · VINCULADA a ${l.vinculo.contas.map(c => `#${c.conta_id} ${c.parte} ${brl(c.valor)}`).join(' + ')}`
      return l.candidatos.length ? `${base} · candidatas: ${l.candidatos.map(conta).join(' | ')}` : `${base} · sem candidata (se for folha/rateio use contas_para_linha)`
    })
    return ok(`extrato #${r.extrato.id} conta ${r.extrato.conta}: ${todas.length} linhas, ${todas.length - sem.length} vinculadas, ${sem.length} sem vínculo` +
      `${(situacao === 'sem_vinculo' ? sem : todas).length > limite ? ` (mostrando ${limite})` : ''}\n${linhas.join('\n')}`)
  })

  server.registerTool('contas_para_linha', {
    description: 'Contas livres (sem vínculo) que podem entrar numa linha do extrato: pagas no dia da linha ou que casam sozinhas com o valor. Serve para folha e rateio, onde várias contas somam o valor da linha.',
    inputSchema: { lancamento_id: z.number().int() },
    annotations: { readOnlyHint: true },
  }, async ({ lancamento_id }) => {
    const b = bloqueio(); if (b) return b
    const l = await carregarLancamento(db(), s.projetoId, lancamento_id)
    if (!l) return falha('Linha do extrato não encontrada neste projeto.')
    try {
      const cs = contasDoDia(l, await carregarContasLivres(db(), s.projetoId, tipoDoValor(l.valor)))
      return ok(`linha #${l.id} · ${dia(l.data)} · ${l.descricao} · ${brl(l.valor)} (${tipoDoValor(l.valor) === 'pagar' ? 'contas a pagar' : 'contas a receber'}); a soma das contas marcadas deve fechar o valor\n` +
        (cs.length ? cs.map(conta).join('\n') : 'Nenhuma conta livre compatível.'))
    } catch (e) { return falha((e as Error).message) }
  })

  // Escrita em dois passos: sem confirmar=true só confere as regras e mostra o que seria feito.
  server.registerTool('vincular_extrato', {
    description: 'Concilia: vincula uma ou várias contas a uma linha do extrato (a soma das contas deve fechar o valor da linha; cada conta com data de pagamento deve ter a data da linha). ' +
      'Chame primeiro com confirmar=false para conferir e ver o resumo, mostre ao usuário e só use confirmar=true depois do OK dele.',
    inputSchema: { lancamento_id: z.number().int(), conta_ids: z.array(z.number().int()).min(1).max(100), confirmar: z.boolean().default(false) },
    annotations: { destructiveHint: true },
  }, async ({ lancamento_id, conta_ids, confirmar }) => {
    const b = bloqueio(); if (b) return b
    const c = await conferirVinculo(db(), s.projetoId, lancamento_id, conta_ids)
    if ('erro' in c) return falha(c.erro)
    const resumo = `VINCULAR linha #${c.l.id} (${dia(c.l.data)} · ${c.l.descricao} · ${brl(c.l.valor)}) a ${c.unicos.length} conta(s) ${tipoDoValor(c.l.valor) === 'pagar' ? 'a pagar' : 'a receber'}: ${c.unicos.map(i => `#${i}`).join(', ')} — soma confere`
    if (!confirmar) return ok(`${resumo}\nNada foi feito ainda. Para executar, chame de novo com confirmar=true.`)
    const e = await vincular(db(), s.projetoId, lancamento_id, conta_ids)
    return e ? falha(e.erro) : ok(`Feito: ${resumo}`)
  })

  server.registerTool('desvincular_extrato', {
    description: 'Desfaz a conciliação de uma linha do extrato: solta todas as contas vinculadas a ela. Use confirmar=false antes, como em vincular_extrato.',
    inputSchema: { lancamento_id: z.number().int(), confirmar: z.boolean().default(false) },
    annotations: { destructiveHint: true },
  }, async ({ lancamento_id, confirmar }) => {
    const b = bloqueio(); if (b) return b
    const l = await carregarLancamento(db(), s.projetoId, lancamento_id)
    if (!l) return falha('Linha do extrato não encontrada neste projeto.')
    const { tabela } = CONTAS[tipoDoValor(l.valor)]
    const { data: contas } = await db().from(tabela).select('id').eq('extrato_lancamento_id', l.id).eq('projeto_id', s.projetoId)
    if (!contas?.length) return falha('Esta linha não está vinculada a nenhuma conta.')
    const resumo = `DESVINCULAR linha #${l.id} (${dia(l.data)} · ${l.descricao} · ${brl(l.valor)}) das contas ${contas.map(c => `#${c.id}`).join(', ')}`
    if (!confirmar) return ok(`${resumo}\nNada foi feito ainda. Para executar, chame de novo com confirmar=true.`)
    const e = await desvincular(db(), s.projetoId, lancamento_id)
    return e ? falha(e.erro) : ok(`Feito: ${resumo}`)
  })
}
