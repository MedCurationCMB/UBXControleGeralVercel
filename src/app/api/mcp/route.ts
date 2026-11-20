import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import { baseUrl, verificar, type TokenJwt } from '@/lib/mcp/oauth'
import { registrarPedidos } from '@/lib/mcp/pedidos'
import { registrarOrcamento } from '@/lib/mcp/orcamento'
import { registrarConciliacao } from '@/lib/mcp/conciliacao'
import { registrarSolicitacoes } from '@/lib/mcp/solicitacoes'
import { projetosDoUsuario, hierarquiaEfetiva } from '@/lib/projetos'
import { supabaseServer } from '@/lib/supabase/server'
import type { SessionPayload, Usuario } from '@/types/database'

export const maxDuration = 60

const naoAutorizado = (req: Request, msg = 'Não autorizado') =>
  Response.json({ error: msg }, { status: 401, headers: { 'WWW-Authenticate': `Bearer resource_metadata="${baseUrl(req)}/.well-known/oauth-protected-resource"` } })

// Quem chama e em qual projeto: reconferido no banco a cada chamada (usuário removido ou perfil alterado vale na hora).
async function usuarioDoToken(token: string): Promise<SessionPayload | null> {
  const t = await verificar<TokenJwt>('access', token)
  if (!t) return null
  const { data: u } = await supabaseServer.from('usuarios').select('*').eq('id', t.uid).maybeSingle<Usuario>()
  if (!u || u.status_cadastro !== 'Autorizado') return null
  const proj = (await projetosDoUsuario(u.id, u.hierarquia)).find(p => p.id === t.pid)
  if (!proj) return null
  return {
    userId: u.id, username: u.username, email: u.email, hierarquia: hierarquiaEfetiva(u.hierarquia, proj.papel), status_cadastro: u.status_cadastro,
    projetoId: proj.id, projetoNome: proj.nome, modulo: proj.modulo, restrito: !proj.todosCentros,
  }
}

// Stateless: um servidor MCP por requisição, resposta em JSON simples.
export async function POST(req: Request) {
  const token = req.headers.get('authorization')?.match(/^Bearer (.+)$/i)?.[1]
  const s = token ? await usuarioDoToken(token) : null
  if (!s) return naoAutorizado(req)

  const server = new McpServer({ name: 'ubx-financeiro', version: '0.1.0' })
  registrarPedidos(server, s)
  registrarOrcamento(server, s)
  registrarConciliacao(server, s)
  registrarSolicitacoes(server, s)
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true })
  await server.connect(transport)
  return transport.handleRequest(req)
}

// Sem stream de servidor: GET/DELETE não se aplicam em modo stateless
export const GET = () => new Response('Method Not Allowed', { status: 405, headers: { Allow: 'POST' } })
export const DELETE = GET
