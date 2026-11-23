import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import { baseUrl, verificar, type TokenJwt } from '@/lib/mcp/oauth'
import { registrarPedidos } from '@/lib/mcp/pedidos'
import { registrarOrcamento } from '@/lib/mcp/orcamento'
import { registrarConciliacao } from '@/lib/mcp/conciliacao'
import { registrarSolicitacoes } from '@/lib/mcp/solicitacoes'
import { registrarCadastros } from '@/lib/mcp/cadastros'
import { registrarContas } from '@/lib/mcp/contas'
import { registrarEstrutura } from '@/lib/mcp/estrutura'
import { registrarAcompanhamento } from '@/lib/mcp/acompanhamento'
import { registrarRealocacao } from '@/lib/mcp/realocacao'
import { registrarUpload } from '@/lib/mcp/upload'
import { sessaoDe } from '@/lib/mcp/usuario'

export const maxDuration = 60

const naoAutorizado = (req: Request, msg = 'Não autorizado') =>
  Response.json({ error: msg }, { status: 401, headers: { 'WWW-Authenticate': `Bearer resource_metadata="${baseUrl(req)}/.well-known/oauth-protected-resource"` } })

// Stateless: um servidor MCP por requisição, resposta em JSON simples.
export async function POST(req: Request) {
  const token = req.headers.get('authorization')?.match(/^Bearer (.+)$/i)?.[1]
  const t = await verificar<TokenJwt>('access', token)
  const s = t ? await sessaoDe(t.uid, t.pid) : null
  if (!s) return naoAutorizado(req)

  const server = new McpServer({ name: 'ubx-financeiro', version: '0.1.0' })
  registrarPedidos(server, s)
  registrarOrcamento(server, s)
  registrarConciliacao(server, s)
  registrarSolicitacoes(server, s, baseUrl(req))
  registrarCadastros(server, s)
  registrarContas(server, s)
  registrarEstrutura(server, s)
  registrarAcompanhamento(server, s)
  registrarRealocacao(server, s)
  registrarUpload(server, s, baseUrl(req))
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true })
  await server.connect(transport)
  return transport.handleRequest(req)
}

// Sem stream de servidor: GET/DELETE não se aplicam em modo stateless
export const GET = () => new Response('Method Not Allowed', { status: 405, headers: { Allow: 'POST' } })
export const DELETE = GET
