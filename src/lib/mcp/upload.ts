import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { TAB_PEDIDO } from '@/lib/ajuste'
import { generateFileName, getSignedDownloadUrl, uploadFile } from '@/lib/b2'
import { assinar, type UploadJwt } from '@/lib/mcp/oauth'
import { brl, falha, modulo, ok } from '@/lib/mcp/pedidos'
import { veModulo } from '@/lib/modulos'
import { supabaseServer } from '@/lib/supabase/server'
import { clienteDoUsuario } from '@/lib/supabase/usuario'
import type { SessionPayload } from '@/types/database'

// Upload de PDF por link: o chat não entrega arquivo à ferramenta, então a ferramenta gera um link de 30 min (token assinado com
// usuário + item) para uma página de envio. Grava como as telas: pedido -> B2 + tabela documentos(_receita); requisição -> B2 + requisicoes(_receita).anexos.
export const MAX_BYTES = 4 * 1024 * 1024 // limite do corpo de uma função na Vercel (~4,5 MB), igual ao das telas
const REQ = { pagamentos: 'requisicoes', recebimentos: 'requisicoes_receita' } as const
const DOCS = { pagamentos: 'documentos', recebimentos: 'documentos_receita' } as const
export type Alvo = UploadJwt['alvo']

export async function linkUpload(origin: string, s: SessionPayload, mod: UploadJwt['mod'], alvo: Alvo, id: number) {
  const t = await assinar('upload', { uid: s.userId, pid: s.projetoId, mod, alvo, id }, '30m')
  return `${origin}/anexar/${t}`
}

// O item existe e o usuário o enxerga (RLS: projeto, módulo e centros)? Devolve uma descrição curta ou null.
export async function descricaoDoAlvo(s: SessionPayload, mod: UploadJwt['mod'], alvo: Alvo, id: number): Promise<string | null> {
  if (!veModulo(s.modulo, mod)) return null
  const cli = await clienteDoUsuario(s)
  if (alvo === 'pedido') {
    const t = TAB_PEDIDO[mod]
    const { data } = await cli.from(t.pedido).select('*').eq('id', id).maybeSingle()
    return data ? `Pedido #${id} · ${data.empresa} · ${data[t.parte]} · ${brl(data.valor_pedido)}` : null
  }
  const { data } = await cli.from(REQ[mod]).select('empresa, categoria, descricao').eq('id', id).maybeSingle()
  return data ? `Requisição #${id} · ${data.empresa} · ${data.categoria}` : null
}

// Grava um PDF no item do link. Devolve a mensagem de erro, ou null se deu certo.
export async function gravarPdf(s: SessionPayload, t: UploadJwt, file: File): Promise<string | null> {
  if (file.size > MAX_BYTES) return `"${file.name}" excede 4 MB.`
  const buf = Buffer.from(await file.arrayBuffer())
  if (buf.subarray(0, 5).toString('latin1') !== '%PDF-') return `"${file.name}" não é um PDF.`
  if (!(await descricaoDoAlvo(s, t.mod, t.alvo, t.id))) return 'Item não encontrado ou sem acesso.'

  const { fileId, downloadUrl } = await uploadFile(buf, generateFileName(t.alvo === 'pedido' ? 'doc' : 'req', file.name), 'application/pdf')
  const cli = await clienteDoUsuario(s)

  if (t.alvo === 'pedido') {
    const { data: tipo } = await cli.from('tipos_documento').select('id').eq('tipo', 'Documentos da Solicitação').maybeSingle()
    const { error } = await supabaseServer.from(DOCS[t.mod]).insert({
      projeto_id: s.projetoId, pedido_id: t.id, tipo_documento: tipo?.id ?? null, anexo_id: fileId, anexo_url: downloadUrl,
      nome_documento: file.name, usuario: s.username, data_upload: new Date().toISOString(),
    })
    if (error) return error.message
    if (tipo) await cli.from(TAB_PEDIDO[t.mod].pedido).update({ tipo_documento: tipo.id }).eq('id', t.id) // como a tela
    return null
  }
  const { data: r } = await cli.from(REQ[t.mod]).select('anexos').eq('id', t.id).maybeSingle()
  const { error } = await cli.from(REQ[t.mod]).update({ anexos: [...(r?.anexos ?? []), { id: fileId, nome: file.name }] }).eq('id', t.id)
  return error?.message ?? null
}

export function registrarUpload(server: McpServer, s: SessionPayload, origin: string) {
  server.registerTool('anexar_documento', {
    description: 'Gera um link (vale 30 min) para o usuário enviar PDFs (um ou vários, até 4 MB cada) para um pedido ou uma requisição. ' +
      'O chat não consegue entregar o arquivo à ferramenta: entregue o link ao usuário e peça para abrir, escolher os PDFs e enviar. Depois use listar_documentos para conferir.',
    inputSchema: { modulo, alvo: z.enum(['pedido', 'requisicao']), id: z.number().int() },
    annotations: { readOnlyHint: true },
  }, async ({ modulo: m, alvo, id }) => {
    const d = await descricaoDoAlvo(s, m, alvo, id)
    if (!d) return falha('Item não encontrado (ou fora dos seus centros/módulo).')
    return ok(`${d}\nLink para enviar os PDFs (vale 30 min): ${await linkUpload(origin, s, m, alvo, id)}`)
  })

  server.registerTool('listar_documentos', {
    description: 'Documentos anexados a um pedido (com link de download de 10 min) ou a uma requisição (nomes dos arquivos).',
    inputSchema: { modulo, alvo: z.enum(['pedido', 'requisicao']), id: z.number().int() },
    annotations: { readOnlyHint: true },
  }, async ({ modulo: m, alvo, id }) => {
    const d = await descricaoDoAlvo(s, m, alvo, id)
    if (!d) return falha('Item não encontrado (ou fora dos seus centros/módulo).')
    const cli = await clienteDoUsuario(s)
    if (alvo === 'requisicao') {
      const { data } = await cli.from(REQ[m]).select('anexos').eq('id', id).maybeSingle()
      const a = (data?.anexos ?? []) as { nome: string }[]
      return ok(`${d}\n${a.length ? a.map(x => `- ${x.nome}`).join('\n') : 'Nenhum anexo.'}`)
    }
    const [{ data: docs }, { data: tipos }] = await Promise.all([
      cli.from(DOCS[m]).select('nome_documento, tipo_documento, usuario, data_upload, anexo_url').eq('pedido_id', id).order('data_upload'),
      cli.from('tipos_documento').select('id, tipo'),
    ])
    if (!docs?.length) return ok(`${d}\nNenhum documento.`)
    const prefixo = `/file/${process.env.B2_BUCKET_NAME}/`
    const linhas = await Promise.all(docs.map(async x => {
      const nome = x.anexo_url?.includes(prefixo) ? decodeURIComponent(x.anexo_url.split(prefixo)[1]) : null
      const link = nome ? await getSignedDownloadUrl(nome, 600).catch(() => null) : null
      const tipo = (tipos ?? []).find(t => t.id === x.tipo_documento)?.tipo ?? 'Sem tipo'
      return `- ${x.nome_documento} · ${tipo} · ${x.usuario} · ${String(x.data_upload).slice(0, 10)}${link ? `\n  ${link}` : ''}`
    }))
    return ok(`${d}\n${linhas.join('\n')}`)
  })
}
