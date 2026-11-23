import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { uploadFile } from '@/lib/b2'
import { consultaControles } from '@/lib/controle-pagamentos-server'
import { gerarRemessa, type TransactionInput } from '@/lib/remessa'
import { cleanDoc, getFormaIniciacao, getTipoDocFav } from '@/lib/remessaDados'
import { gerarRelatorioEnviados, gerarRelatorioPdf, type Enviado } from '@/lib/relatorioPdf'
import { dataOk, hojeBrasilia } from '@/lib/mcp/contas'
import { assinar } from '@/lib/mcp/oauth'
import { brl, falha, ok, podeDecidir } from '@/lib/mcp/pedidos'
import { linkUpload } from '@/lib/mcp/upload'
import { supabaseServer } from '@/lib/supabase/server'
import { clienteDoUsuario } from '@/lib/supabase/usuario'
import type { SessionPayload } from '@/types/database'

// Remessa CNAB 240 (PIX e boleto), relatório de enviados ao banco e retorno do banco, como a tela Controle de Pagamentos > Remessa / Retorno.
// Arquivos saem por link de download (30 min); o retorno entra pelo mesmo link de upload dos outros anexos.
// Só administrador de Pagamentos (a remessa manda dinheiro ao banco). Só pagamentos: recebimentos não têm remessa.
const dia = (d: string | null) => (d ? d.slice(0, 10).split('-').reverse().join('/') : '-')
const NOME_TIPO: Record<number, string> = { 1: 'PIX', 3: 'Boleto' }
const nega = () => falha('Remessa e retorno do banco são do administrador de Pagamentos.')

interface Linha {
  id: number; pedido_id: number | null; data_vencimento: string | null; valor_pagar: number | null; tipo_pagamento: number | null
  status_pagamento: number | null; fornecedor_beneficiario: string | null
  pedidos_solicitados: { empresa: string; categoria: string; fornecedor: string; observacao: string | null } | null
}

export async function linkBaixar(origin: string, s: SessionPayload, fileId: string) {
  return `${origin}/baixar/${await assinar('download', { uid: s.userId, pid: s.projetoId, fid: fileId }, '30m')}`
}

export function registrarRemessa(server: McpServer, s: SessionPayload, origin: string) {
  const preview = (resumo: string) => ok(`${resumo}\nNada foi feito ainda. Para executar, chame de novo com confirmar=true.`)

  server.registerTool('gerar_remessa', {
    description: 'Gera o arquivo de remessa CNAB 240 (Banco Inter) com contas a pagar do tipo PIX ou Boleto na situação "À Pagar" e devolve links (30 min) do arquivo .REM e do relatório PDF. ' +
      'As contas passam para "Enviado para o banco". PIX exige chave cadastrada no fornecedor; boleto exige o boleto anexado ou o código de barras informado (anexar_documento / informar_boleto). ' +
      'A data de pagamento é o vencimento de cada conta, ou data_pagamento para todas. Conta pagadora: listar_contas_bancarias. Só administrador de Pagamentos. Use confirmar=false antes: o envio ao banco não se desfaz.',
    inputSchema: {
      conta_bancaria_id: z.number().int().describe('id da conta pagadora (listar_contas_bancarias)'),
      contas: z.array(z.number().int()).min(1).max(200).describe('ids das contas a pagar (listar_contas)'),
      data_pagamento: z.string().optional().describe('AAAA-MM-DD, para todas; sem isso vale o vencimento de cada conta'),
      confirmar: z.boolean().default(false),
    },
    annotations: { destructiveHint: true },
  }, async ({ conta_bancaria_id, contas, data_pagamento, confirmar }) => {
    if (!podeDecidir(s, 'pagamentos')) return nega()
    if (data_pagamento && !dataOk(data_pagamento)) return falha('data_pagamento inválida (use AAAA-MM-DD).')
    const ids = [...new Set(contas)]
    const cli = await clienteDoUsuario(s)
    const { data: conta } = await cli.from('conta_pagador').select('id, nome_empresa').eq('id', conta_bancaria_id).maybeSingle()
    if (!conta) return falha('Conta pagadora não encontrada (listar_contas_bancarias).')
    const { data } = await cli.from('controle_pagamentos')
      .select('id, pedido_id, data_vencimento, valor_pagar, tipo_pagamento, status_pagamento, fornecedor_beneficiario, pedidos_solicitados(empresa, categoria, fornecedor, observacao)').in('id', ids)
    const linhas = (data ?? []) as unknown as Linha[]

    const problemas: string[] = []
    for (const id of ids.filter(i => !linhas.some(l => l.id === i))) problemas.push(`#${id}: conta não encontrada (ou fora dos seus centros).`)
    const ok1 = linhas.filter(l => {
      if (l.status_pagamento !== 1) { problemas.push(`#${l.id}: não está "À Pagar".`); return false }
      if (l.tipo_pagamento !== 1 && l.tipo_pagamento !== 3) { problemas.push(`#${l.id}: só PIX e Boleto entram na remessa (os outros tipos são manuais).`); return false }
      return true
    })
    const quem = (l: Linha) => l.fornecedor_beneficiario ?? l.pedidos_solicitados?.fornecedor ?? ''

    // PIX: dados do favorecido como na tela. Boleto: precisa do documento com código de barras (os dígitos são conferidos ao gerar).
    const pix = ok1.filter(l => l.tipo_pagamento === 1), bol = ok1.filter(l => l.tipo_pagamento === 3)
    const [{ data: forn }, { data: tc }, { data: docs }] = await Promise.all([
      cli.from('fornecedores').select('nome, chave_pix, cnpj_cpf, tipo_chave').in('nome', [...new Set(pix.map(quem))]),
      cli.from('tipos_chave').select('id, tipo'),
      bol.length ? cli.from('documentos').select('id, pagamento_id').eq('tipo_documento', 4).in('pagamento_id', bol.map(l => l.id)) : Promise.resolve({ data: [] }),
    ])
    const { data: infos } = docs?.length ? await cli.from('informacoes_boleto').select('boleto_id, codigo_barras').in('boleto_id', docs.map(d => d.id)) : { data: [] }
    const tiposChave = Object.fromEntries((tc ?? []).map(t => [t.id, t.tipo])) as Record<number, string>
    const txs: TransactionInput[] = []
    for (const l of ok1) {
      const base = { pagamento_id: l.id, data_pagamento: data_pagamento ?? l.data_vencimento?.slice(0, 10) ?? hojeBrasilia(), valor_pagamento: Number(l.valor_pagar ?? 0), tipo_pagamento: l.tipo_pagamento!, doc_empresa: String(l.id) }
      if (l.tipo_pagamento === 1) {
        const f = (forn ?? []).find(x => x.nome === quem(l))
        if (!f?.chave_pix) { problemas.push(`#${l.id}: fornecedor "${quem(l)}" sem chave PIX cadastrada (salvar_parceiro).`); continue }
        txs.push({ ...base, forma_iniciacao: getFormaIniciacao(f.tipo_chave, tiposChave), tipo_doc_fav: getTipoDocFav(f.cnpj_cpf), doc_fav: cleanDoc(f.cnpj_cpf), chave_pix: f.chave_pix })
      } else {
        const doc = (docs ?? []).find(d => d.pagamento_id === l.id)
        if (!doc || !(infos ?? []).some(i => i.boleto_id === doc.id && i.codigo_barras)) { problemas.push(`#${l.id}: boleto sem código de barras (anexar_documento alvo=boleto ou informar_boleto).`); continue }
        txs.push(base)
      }
    }
    if (problemas.length) return falha(`Nada foi gerado. Corrija ou tire da lista:\n${problemas.map(p => `- ${p}`).join('\n')}`)

    const total = txs.reduce((a, t) => a + t.valor_pagamento, 0)
    const resumo = `GERAR REMESSA CNAB 240 — conta pagadora "${conta.nome_empresa}" — ${txs.length} pagamento(s), ${brl(total)}\n` +
      txs.map(t => { const l = linhas.find(x => x.id === t.pagamento_id)!; return `  #${l.id} pedido #${l.pedido_id} · ${quem(l)} · ${NOME_TIPO[t.tipo_pagamento]} · pagar em ${dia(t.data_pagamento)} · ${brl(t.valor_pagamento)}` }).join('\n') +
      `\nAs contas passam para "Enviado para o banco" e isso não se desfaz por aqui.`
    if (!confirmar) return preview(resumo)

    const r = await gerarRemessa(supabaseServer, s.projetoId, s.username, conta.id, txs, true)
    if ('erro' in r) return falha(r.erro)

    // Relatório PDF da remessa, como o botão da tela (guardado como "Relatório PDF de Remessa")
    let pdf = ''
    try {
      const bytes = await gerarRelatorioPdf({
        titulo: 'Relatório de Arquivo de Remessa CNAB 240', cabecalho: [`Arquivo: ${r.fileName}`, `Empresa pagadora: ${conta.nome_empresa}`],
        rows: txs.map(t => { const l = linhas.find(x => x.id === t.pagamento_id)!; const p = l.pedidos_solicitados
          return { pagamento_id: l.id, pedido_id: l.pedido_id, fornecedor: quem(l), empresa: p?.empresa ?? '', categoria: p?.categoria ?? '', tipo_pagamento: t.tipo_pagamento, data_pagamento: t.data_pagamento, valor_pagamento: t.valor_pagamento, observacao: p?.observacao ?? '' } }),
      })
      const nome = r.fileName.replace(/\.rem$/i, '_relatorio.pdf')
      const { fileId } = await uploadFile(Buffer.from(bytes), nome, 'application/pdf')
      await supabaseServer.from('documentos').insert({ projeto_id: s.projetoId, pedido_id: null, pagamento_id: null, usuario: s.username, tipo_documento: -5, anexo_id: fileId, nome_documento: nome, data_upload: new Date().toISOString() })
      pdf = `\nRelatório PDF: ${await linkBaixar(origin, s, fileId)}`
    } catch (e) {
      console.warn('Relatório PDF da remessa falhou:', e)
      pdf = '\n(O relatório PDF não pôde ser gerado agora; use relatorio_enviados para o consolidado do dia.)'
    }
    return ok(`Feito: ${resumo}\nArquivo ${r.fileName} (sequencial ${r.sequencial}), links valem 30 min:\nRemessa .REM: ${await linkBaixar(origin, s, r.fileId!)}${pdf}\nBaixe e envie ao banco.`)
  })

  server.registerTool('relatorio_enviados', {
    description: 'Gera o PDF de tudo que foi enviado ao banco num dia (por remessa ou manualmente) e devolve um link de download (30 min). Sem dia, vale hoje. Pagamentos enviados antes de 15/10/2026 não têm data de envio. Só administrador de Pagamentos.',
    inputSchema: { dia: z.string().optional().describe('AAAA-MM-DD, padrão hoje') },
    annotations: { readOnlyHint: true },
  }, async ({ dia: d }) => {
    if (!podeDecidir(s, 'pagamentos')) return nega()
    const alvo = d ?? hojeBrasilia()
    if (!dataOk(alvo)) return falha('Dia inválido (use AAAA-MM-DD).')
    const { data, error } = await consultaControles(await clienteDoUsuario(s), s.projetoId, { empresa: '', categoria: '', status_pagamento: '', enviado_em: alvo }, '*', { comPedido: true }).order('id')
    if (error) return falha(error.message)
    const rows: Enviado[] = ((data ?? []) as unknown as (Linha & Pick<Enviado, 'data_pagamento' | 'valor_pagamento' | 'enviado_banco_em' | 'remessa_arquivo'>)[]).map(l => ({
      id: l.id, pedido_id: l.pedido_id, fornecedor: l.fornecedor_beneficiario ?? l.pedidos_solicitados?.fornecedor ?? '', empresa: l.pedidos_solicitados?.empresa ?? '', categoria: l.pedidos_solicitados?.categoria ?? '',
      tipo_pagamento: l.tipo_pagamento, data_vencimento: l.data_vencimento, data_pagamento: l.data_pagamento, valor_pagar: l.valor_pagar, valor_pagamento: l.valor_pagamento,
      observacao: l.pedidos_solicitados?.observacao ?? null, enviado_banco_em: l.enviado_banco_em, remessa_arquivo: l.remessa_arquivo,
    })).sort((a, b) => a.enviado_banco_em.localeCompare(b.enviado_banco_em) || a.id - b.id)
    if (!rows.length) return ok(`Nenhum pagamento foi enviado ao banco em ${dia(alvo)}.`)
    const { fileId } = await uploadFile(Buffer.from(await gerarRelatorioEnviados(alvo, rows)), `enviados_banco_${alvo}_${Date.now()}.pdf`, 'application/pdf')
    const manuais = rows.filter(r => !r.remessa_arquivo).length
    return ok(`Enviados ao banco em ${dia(alvo)}: ${rows.length} pagamento(s), ${brl(rows.reduce((a, r) => a + Number(r.valor_pagamento ?? r.valor_pagar ?? 0), 0))} (${rows.length - manuais} via remessa, ${manuais} manual).\nRelatório PDF (30 min): ${await linkBaixar(origin, s, fileId)}`)
  })

  server.registerTool('importar_retorno', {
    description: 'Gera um link (30 min) para o usuário enviar o arquivo de retorno do banco (.ret ou .rem, CNAB 240, até 4 MB). Os pagamentos efetivados viram "Pago" com a data e o valor do banco; arquivo já importado é recusado. Só administrador de Pagamentos.',
    inputSchema: {},
    annotations: { readOnlyHint: true },
  }, async () => {
    if (!podeDecidir(s, 'pagamentos')) return nega()
    return ok(`Importar retorno do banco no projeto ${s.projetoNome}\nLink para enviar o arquivo (vale 30 min): ${await linkUpload(origin, s, 'pagamentos', 'retorno', 0)}`)
  })

  server.registerTool('listar_arquivos_remessa', {
    description: 'Arquivos de remessa, retorno e relatórios PDF já gerados no projeto (aba Arquivos da tela), mais recentes primeiro, com link de download (30 min). Só administrador de Pagamentos.',
    inputSchema: { limite: z.number().int().min(1).max(30).default(10) },
    annotations: { readOnlyHint: true },
  }, async ({ limite }) => {
    if (!podeDecidir(s, 'pagamentos')) return nega()
    const { data } = await supabaseServer.from('documentos').select('nome_documento, tipo_documento, anexo_id, data_upload, usuario')
      .in('tipo_documento', [-3, -4, -5]).eq('projeto_id', s.projetoId).order('data_upload', { ascending: false }).limit(limite)
    if (!data?.length) return ok('Nenhum arquivo de remessa ou retorno ainda.')
    const rotulo = { [-3]: 'Remessa', [-4]: 'Retorno', [-5]: 'Relatório PDF' } as Record<number, string>
    return ok((await Promise.all(data.map(async d => `- ${d.nome_documento} · ${rotulo[d.tipo_documento]} · ${d.usuario} · ${dia(d.data_upload)}\n  ${await linkBaixar(origin, s, d.anexo_id)}`))).join('\n'))
  })
}
