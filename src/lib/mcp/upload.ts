import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { TAB_PEDIDO } from '@/lib/ajuste'
import { dvBoleto47Valido, dvTributoValido } from '@/lib/boleto'
import { generateFileName, getSignedDownloadUrl, uploadFile } from '@/lib/b2'
import { importarExtrato } from '@/lib/extratoImportacao'
import { CONTAS } from '@/lib/extratoVinculo'
import { extrairDadosBoleto } from '@/lib/gemini'
import { assinar, type UploadJwt } from '@/lib/mcp/oauth'
import { brl, falha, modulo, ok } from '@/lib/mcp/pedidos'
import { veModulo } from '@/lib/modulos'
import { supabaseServer } from '@/lib/supabase/server'
import { clienteDoUsuario } from '@/lib/supabase/usuario'
import { bufferToBase64 } from '@/lib/utils'
import type { SessionPayload } from '@/types/database'

// Upload por link: o chat não entrega arquivo à ferramenta, então a ferramenta gera um link de 30 min (token assinado com usuário + item)
// para uma página de envio. Grava como as telas:
//  - pedido: B2 + documentos(_receita); requisição: B2 + requisicoes(_receita).anexos
//  - comprovante (tipo -2) e boleto (tipo 4, com leitura por IA do código de barras) de uma conta a pagar/receber: B2 + documentos(_receita)
//  - extrato bancário (CSV/OFX/TXT): importa o extrato inteiro (mesma importação da tela)
export const MAX_BYTES = 4 * 1024 * 1024 // limite do corpo de uma função na Vercel (~4,5 MB), igual ao das telas
const REQ = { pagamentos: 'requisicoes', recebimentos: 'requisicoes_receita' } as const
const DOCS = { pagamentos: 'documentos', recebimentos: 'documentos_receita' } as const
const CONTA = { pagamentos: { c: CONTAS.pagar, tipoCol: 'tipo_pagamento', tipoTab: 'tipos_pagamento', docCol: 'pagamento_id', info: 'informacoes_boleto' }, recebimentos: { c: CONTAS.receber, tipoCol: 'tipo_recebimento', tipoTab: 'tipos_recebimento', docCol: 'recebimento_id', info: 'informacoes_boleto_receita' } } as const
const TIPO_COMPROVANTE = -2, TIPO_BOLETO = 4
export type Alvo = UploadJwt['alvo']
export const ehConta = (a: Alvo) => a === 'comprovante' || a === 'boleto'
export const aceita = (a: Alvo) => (a === 'extrato' ? '.csv,.ofx,.txt' : 'application/pdf')

export async function linkUpload(origin: string, s: SessionPayload, mod: UploadJwt['mod'], alvo: Alvo, id: number) {
  const t = await assinar('upload', { uid: s.userId, pid: s.projetoId, mod, alvo, id }, '30m')
  return `${origin}/anexar/${t}`
}

async function carregarConta(s: SessionPayload, mod: UploadJwt['mod'], id: number) {
  const { c, tipoCol } = CONTA[mod]
  const { data } = await (await clienteDoUsuario(s)).from(c.tabela)
    .select(`id, pedido_id, valor_pagar, ${tipoCol}, ${c.pedido}(empresa, ${c.parte})`).eq('id', id).maybeSingle()
  return data as unknown as Record<string, unknown> | null
}

// O item existe e o usuário o enxerga (RLS: projeto, módulo e centros)? Devolve uma descrição curta ou null.
export async function descricaoDoAlvo(s: SessionPayload, mod: UploadJwt['mod'], alvo: Alvo, id: number): Promise<string | null> {
  if (alvo === 'extrato') return s.modulo ? null : `Importar extrato bancário no projeto ${s.projetoNome}`
  if (!veModulo(s.modulo, mod)) return null
  const cli = await clienteDoUsuario(s)
  if (ehConta(alvo)) {
    const c = await carregarConta(s, mod, id)
    if (!c) return null
    const ped = (c[CONTA[mod].c.pedido] ?? {}) as Record<string, string>
    return `${alvo === 'boleto' ? 'Boleto' : 'Comprovante'} da conta #${id} (pedido #${c.pedido_id} · ${ped.empresa ?? '?'} · ${ped[CONTA[mod].c.parte] ?? '?'} · ${brl(Number(c.valor_pagar ?? 0))})`
  }
  if (alvo === 'pedido') {
    const t = TAB_PEDIDO[mod]
    const { data } = await cli.from(t.pedido).select('*').eq('id', id).maybeSingle()
    return data ? `Pedido #${id} · ${data.empresa} · ${data[t.parte]} · ${brl(data.valor_pedido)}` : null
  }
  const { data } = await cli.from(REQ[mod]).select('empresa, categoria, descricao').eq('id', id).maybeSingle()
  return data ? `Requisição #${id} · ${data.empresa} · ${data.categoria}` : null
}

export interface ResultadoGravacao { erro?: string; info?: string }

// Grava o arquivo no item do link. `erro` = mensagem de recusa; `info` = o que foi feito (a página mostra).
export async function gravarArquivo(s: SessionPayload, t: UploadJwt, file: File): Promise<ResultadoGravacao> {
  if (file.size > MAX_BYTES) return { erro: `"${file.name}" excede 4 MB.` }
  const buf = Buffer.from(await file.arrayBuffer())
  if (!(await descricaoDoAlvo(s, t.mod, t.alvo, t.id))) return { erro: 'Item não encontrado ou sem acesso.' }

  if (t.alvo === 'extrato') {
    if (!/\.(csv|ofx|txt)$/i.test(file.name)) return { erro: `"${file.name}" não é CSV, OFX ou TXT.` }
    const r = await importarExtrato(supabaseServer, s.projetoId, s.username, file.name, buf)
    if ('erro' in r) return { erro: r.erro }
    return { info: `extrato importado: conta ${r.extrato.conta}, ${String(r.extrato.periodo_inicio)} a ${String(r.extrato.periodo_fim)}, ${r.lancamentos.length} lançamento(s)` }
  }

  if (buf.subarray(0, 5).toString('latin1') !== '%PDF-') return { erro: `"${file.name}" não é um PDF.` }
  const { fileId, downloadUrl } = await uploadFile(buf, generateFileName(t.alvo === 'requisicao' ? 'req' : 'doc', file.name), 'application/pdf')
  const cli = await clienteDoUsuario(s)

  if (t.alvo === 'pedido') {
    const { data: tipo } = await cli.from('tipos_documento').select('id').eq('tipo', 'Documentos da Solicitação').maybeSingle()
    const { error } = await supabaseServer.from(DOCS[t.mod]).insert({
      projeto_id: s.projetoId, pedido_id: t.id, tipo_documento: tipo?.id ?? null, anexo_id: fileId, anexo_url: downloadUrl,
      nome_documento: file.name, usuario: s.username, data_upload: new Date().toISOString(),
    })
    if (error) return { erro: error.message }
    if (tipo) await cli.from(TAB_PEDIDO[t.mod].pedido).update({ tipo_documento: tipo.id }).eq('id', t.id) // como a tela
    return {}
  }

  if (t.alvo === 'requisicao') {
    const { data: r } = await cli.from(REQ[t.mod]).select('anexos').eq('id', t.id).maybeSingle()
    const { error } = await cli.from(REQ[t.mod]).update({ anexos: [...(r?.anexos ?? []), { id: fileId, nome: file.name }] }).eq('id', t.id)
    return error ? { erro: error.message } : {}
  }

  // comprovante / boleto: documento ligado à conta (gatilhos do banco copiam o anexo e marcam tem_comprovante)
  const conta = (await carregarConta(s, t.mod, t.id))!
  const k = CONTA[t.mod]
  const base = { projeto_id: s.projetoId, pedido_id: conta.pedido_id, [k.docCol]: t.id, anexo_id: fileId, anexo_url: downloadUrl, nome_documento: file.name, usuario: s.username, data_upload: new Date().toISOString() }

  if (t.alvo === 'comprovante') {
    const { error } = await supabaseServer.from(DOCS[t.mod]).insert({ ...base, tipo_documento: TIPO_COMPROVANTE })
    return error ? { erro: error.message } : { info: `comprovante anexado à conta #${t.id}` }
  }

  const { data: tipos } = await cli.from(k.tipoTab).select('id, tipos')
  if (!(tipos ?? []).some(x => x.id === conta[k.tipoCol] && /boleto/i.test(x.tipos))) return { erro: 'A conta precisa ser do tipo Boleto (mude com atualizar_conta).' }
  // um boleto por conta: se já existe, atualiza o documento em vez de duplicar
  const { data: ja } = await supabaseServer.from(DOCS[t.mod]).select('id').eq(k.docCol, t.id).eq('tipo_documento', TIPO_BOLETO).maybeSingle()
  const { data: doc, error: eDoc } = ja
    ? await supabaseServer.from(DOCS[t.mod]).update({ anexo_id: fileId, anexo_url: downloadUrl, nome_documento: file.name, usuario: s.username, data_upload: base.data_upload }).eq('id', ja.id).select('id').single()
    : await supabaseServer.from(DOCS[t.mod]).insert({ ...base, tipo_documento: TIPO_BOLETO }).select('id').single()
  if (eDoc || !doc) return { erro: eDoc?.message ?? 'Erro ao gravar o boleto.' }
  let dados: Awaited<ReturnType<typeof extrairDadosBoleto>> | null = null
  try { dados = await extrairDadosBoleto(bufferToBase64(buf), 'application/pdf') } catch (e) { console.warn('Extração de boleto falhou:', e) }
  if (!dados?.codigo_barras) return { info: `boleto anexado à conta #${t.id}, mas a leitura automática não achou o código de barras: informe-o com informar_boleto` }
  const { data: inf } = await supabaseServer.from(k.info).select('id').eq('boleto_id', doc.id).maybeSingle()
  if (inf) await supabaseServer.from(k.info).update({ ...dados }).eq('id', inf.id)
  else await supabaseServer.from(k.info).insert({ ...dados, boleto_id: doc.id })
  return { info: `boleto anexado e lido: código ${dados.codigo_barras}${dados.valor_nominal != null ? `, valor ${brl(Number(dados.valor_nominal))}` : ''}${dados.data_vencimento ? `, vencimento ${dados.data_vencimento}` : ''} — confira os dígitos` }
}

export function registrarUpload(server: McpServer, s: SessionPayload, origin: string) {
  server.registerTool('anexar_documento', {
    description: 'Gera um link (vale 30 min) para o usuário enviar PDFs (um ou vários, até 4 MB cada) para: um pedido ou requisição (alvo=pedido|requisicao, id do item), ' +
      'o comprovante de pagamento de uma conta (alvo=comprovante, id da conta) ou o boleto de uma conta do tipo Boleto (alvo=boleto, id da conta; o sistema lê o código de barras). ' +
      'O chat não consegue entregar o arquivo à ferramenta: entregue o link ao usuário e peça para abrir, escolher os PDFs e enviar. Depois use listar_documentos para conferir.',
    inputSchema: { modulo, alvo: z.enum(['pedido', 'requisicao', 'comprovante', 'boleto']), id: z.number().int() },
    annotations: { readOnlyHint: true },
  }, async ({ modulo: m, alvo, id }) => {
    const d = await descricaoDoAlvo(s, m, alvo, id)
    if (!d) return falha('Item não encontrado (ou fora dos seus centros/módulo).')
    return ok(`${d}\nLink para enviar os PDFs (vale 30 min): ${await linkUpload(origin, s, m, alvo, id)}`)
  })

  server.registerTool('importar_extrato', {
    description: 'Gera um link (vale 30 min) para o usuário enviar um extrato bancário (CSV, OFX ou TXT do Banco Inter, até 4 MB) e importá-lo no projeto. ' +
      'Extrato do mesmo período e conta já importado é recusado. Depois use listar_extratos / ver_extrato para conciliar. Perfil sem módulo específico, como a tela de Extratos.',
    inputSchema: {},
    annotations: { readOnlyHint: true },
  }, async () => {
    const d = await descricaoDoAlvo(s, 'pagamentos', 'extrato', 0)
    if (!d) return falha('Extratos bancários são do perfil Usuário/Administrador (sem módulo específico).')
    return ok(`${d}\nLink para enviar o arquivo (vale 30 min): ${await linkUpload(origin, s, 'pagamentos', 'extrato', 0)}`)
  })

  server.registerTool('listar_documentos', {
    description: 'Documentos anexados a um pedido (alvo=pedido, com link de download de 10 min), a uma requisição (alvo=requisicao, nomes) ou a uma conta (alvo=conta: comprovante e boleto, com o que foi lido do boleto).',
    inputSchema: { modulo, alvo: z.enum(['pedido', 'requisicao', 'conta']), id: z.number().int() },
    annotations: { readOnlyHint: true },
  }, async ({ modulo: m, alvo, id }) => {
    const d = await descricaoDoAlvo(s, m, alvo === 'conta' ? 'comprovante' : alvo, id)
    if (!d) return falha('Item não encontrado (ou fora dos seus centros/módulo).')
    const cli = await clienteDoUsuario(s)
    if (alvo === 'requisicao') {
      const { data } = await cli.from(REQ[m]).select('anexos').eq('id', id).maybeSingle()
      const a = (data?.anexos ?? []) as { nome: string }[]
      return ok(`${d}\n${a.length ? a.map(x => `- ${x.nome}`).join('\n') : 'Nenhum anexo.'}`)
    }
    const k = CONTA[m]
    const [{ data: docs }, { data: tipos }] = await Promise.all([
      cli.from(DOCS[m]).select('id, nome_documento, tipo_documento, usuario, data_upload, anexo_url').eq(alvo === 'pedido' ? 'pedido_id' : k.docCol, id).order('data_upload'),
      cli.from('tipos_documento').select('id, tipo'),
    ])
    if (!docs?.length) return ok(`${d}\nNenhum documento.`)
    const prefixo = `/file/${process.env.B2_BUCKET_NAME}/`
    const linhas = await Promise.all(docs.map(async x => {
      const nome = x.anexo_url?.includes(prefixo) ? decodeURIComponent(x.anexo_url.split(prefixo)[1]) : null
      const link = nome ? await getSignedDownloadUrl(nome, 600).catch(() => null) : null
      const tipo = (tipos ?? []).find(t => t.id === x.tipo_documento)?.tipo ?? 'Sem tipo'
      let boleto = ''
      if (x.tipo_documento === TIPO_BOLETO) {
        const { data: i } = await cli.from(k.info).select('codigo_barras, valor_nominal, data_vencimento, beneficiario_nome').eq('boleto_id', x.id).maybeSingle()
        if (i) boleto = `\n  boleto: código ${i.codigo_barras ?? '-'} · valor ${i.valor_nominal != null ? brl(Number(i.valor_nominal)) : '-'} · venc ${i.data_vencimento ?? '-'} · ${i.beneficiario_nome ?? ''}`
      }
      return `- #${x.id} ${x.nome_documento} · ${tipo} · ${x.usuario} · ${String(x.data_upload).slice(0, 10)}${link ? `\n  ${link}` : ''}${boleto}`
    }))
    return ok(`${d}\n${linhas.join('\n')}`)
  })

  // Código de barras digitado (como no modal de editar conta, tipo Boleto): vale também quando a leitura automática falha.
  server.registerTool('informar_boleto', {
    description: 'Informa o código de barras / linha digitável de uma conta do tipo Boleto (44, 47 ou 48 dígitos; os dígitos verificadores são conferidos). Use quando não houver PDF ou a leitura automática falhar. Use confirmar=false antes.',
    inputSchema: { modulo, conta_id: z.number().int(), codigo_barras: z.string(), confirmar: z.boolean().default(false) },
    annotations: { destructiveHint: true },
  }, async ({ modulo: m, conta_id, codigo_barras, confirmar }) => {
    const d = await descricaoDoAlvo(s, m, 'boleto', conta_id)
    if (!d) return falha('Conta não encontrada (ou fora dos seus centros/módulo).')
    const k = CONTA[m]
    const cli = await clienteDoUsuario(s)
    const conta = (await carregarConta(s, m, conta_id))!
    const { data: tipos } = await cli.from(k.tipoTab).select('id, tipos')
    if (!(tipos ?? []).some(x => x.id === conta[k.tipoCol] && /boleto/i.test(x.tipos))) return falha('A conta precisa ser do tipo Boleto (mude com atualizar_conta).')
    const dig = codigo_barras.replace(/\D/g, '')
    if (![44, 47, 48].includes(dig.length)) return falha('Informe 44 (código de barras), 47 (boleto) ou 48 (tributo/convênio) dígitos.')
    if (dig.length === 47 && !dvBoleto47Valido(dig)) return falha('Dígitos verificadores inválidos: confira a linha digitável.')
    if (dig.length === 48 && !dvTributoValido(dig)) return falha('Dígitos verificadores inválidos: confira a linha digitável.')
    const resumo = `INFORMAR código de barras do boleto — ${d}\n  ${dig}`
    if (!confirmar) return ok(`${resumo}\nNada foi feito ainda. Para executar, chame de novo com confirmar=true.`)
    let { data: doc } = await supabaseServer.from(DOCS[m]).select('id').eq(k.docCol, conta_id).eq('tipo_documento', TIPO_BOLETO).maybeSingle()
    if (!doc) {
      const r = await supabaseServer.from(DOCS[m]).insert({
        projeto_id: s.projetoId, pedido_id: conta.pedido_id, [k.docCol]: conta_id, tipo_documento: TIPO_BOLETO, anexo_id: '', usuario: s.username,
        data_upload: new Date().toISOString(), nome_documento: 'Código de barras informado manualmente',
      }).select('id').single()
      if (r.error) return falha(r.error.message)
      doc = r.data
    }
    const { data: inf } = await supabaseServer.from(k.info).select('id').eq('boleto_id', doc.id).maybeSingle()
    const { error } = inf ? await supabaseServer.from(k.info).update({ codigo_barras: dig }).eq('id', inf.id) : await supabaseServer.from(k.info).insert({ boleto_id: doc.id, codigo_barras: dig })
    return error ? falha(error.message) : ok(`Feito: ${resumo}`)
  })
}
