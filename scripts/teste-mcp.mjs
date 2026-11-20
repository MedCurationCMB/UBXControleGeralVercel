// Teste ponta a ponta do MCP: sobe o app contra o BANCO DE TESTE, faz login, OAuth (PKCE) e chama as ferramentas.
// Uso: node scripts/teste-mcp.mjs   (precisa de .env.test.local; recusa a producao)
import { readFileSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { createHash, randomBytes } from 'node:crypto'
import assert from 'node:assert/strict'
import { createClient } from '@supabase/supabase-js'

const env = Object.fromEntries(readFileSync('.env.test.local', 'utf8').split(/\r?\n/)
  .filter(l => /^[A-Z_]+=/.test(l)).map(l => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]))
if (env.NEXT_PUBLIC_SUPABASE_URL.includes('biswoctezxmkirsubxbi')) throw new Error('Isto é a PRODUÇÃO. Abortando.')

const PORT = 3111
const B = `http://localhost:${PORT}`
const srv = spawn('npx', ['next', 'dev', '-p', String(PORT)], { env: { ...process.env, ...env }, shell: true, stdio: 'ignore' })
const parar = () => { try { spawn('taskkill', ['/pid', String(srv.pid), '/t', '/f'], { stdio: 'ignore' }) } catch {} }
process.on('exit', parar)

try {
  for (let i = 0; i < 90; i++) { try { await fetch(`${B}/.well-known/oauth-authorization-server`); break } catch { await new Promise(r => setTimeout(r, 1000)) } }

  const meta = await (await fetch(`${B}/.well-known/oauth-authorization-server`)).json()
  assert.equal(meta.code_challenge_methods_supported[0], 'S256')

  const sem = await fetch(`${B}/api/mcp`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
  assert.equal(sem.status, 401); assert.match(sem.headers.get('www-authenticate'), /resource_metadata=/)

  const redirect = 'https://claude.ai/api/mcp/auth_callback'
  const cli = await (await fetch(`${B}/api/oauth/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ client_name: 'Teste', redirect_uris: [redirect] }) })).json()
  const ruim = await fetch(`${B}/api/oauth/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ redirect_uris: ['http://evil.com/cb'] }) })
  assert.equal(ruim.status, 400)

  const verifier = randomBytes(32).toString('base64url')
  const challenge = createHash('sha256').update(verifier).digest('base64url')
  const q = new URLSearchParams({ client_id: cli.client_id, redirect_uri: redirect, response_type: 'code', code_challenge: challenge, code_challenge_method: 'S256', state: 'xyz' })

  const deslogado = await fetch(`${B}/api/oauth/authorize?${q}`, { redirect: 'manual' })
  assert.match(deslogado.headers.get('location'), /\/login\?redirect=/)
  const outroUri = await fetch(`${B}/api/oauth/authorize?${new URLSearchParams({ ...Object.fromEntries(q), redirect_uri: 'https://evil.com/cb' })}`, { redirect: 'manual' })
  assert.equal(outroUri.status, 400)

  // login com um admin do banco de teste (usuários rls_* têm senha teste123)
  const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
  const { data: us } = await db.from('usuarios').select('email, username, hierarquia').like('username', 'rls_%').eq('status_cadastro', 'Autorizado')
  assert.ok(us?.length, 'sem usuário rls_* no banco de teste')
  const admin = us.find(u => u.hierarquia === 'admin') ?? us[0]
  const lg = await fetch(`${B}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: admin.email, password: 'teste123' }) })
  assert.equal(lg.status, 200, 'login falhou')
  const cookie = lg.headers.getSetCookie().map(c => c.split(';')[0]).join('; ')

  const tela = await fetch(`${B}/api/oauth/authorize?${q}`, { headers: { cookie } })
  assert.match(await tela.text(), /Permitir/)
  const post = await fetch(`${B}/api/oauth/authorize`, { method: 'POST', redirect: 'manual', headers: { cookie }, body: new URLSearchParams({ ...Object.fromEntries(q), decisao: 'permitir' }) })
  const volta = new URL(post.headers.get('location'))
  assert.equal(volta.origin + volta.pathname, redirect); assert.equal(volta.searchParams.get('state'), 'xyz')
  const code = volta.searchParams.get('code')

  const tok = (extra) => fetch(`${B}/api/oauth/token`, { method: 'POST', body: new URLSearchParams({ client_id: cli.client_id, ...extra }) })
  assert.equal((await tok({ grant_type: 'authorization_code', code, redirect_uri: redirect, code_verifier: 'errado' })).status, 400)
  const t = await (await tok({ grant_type: 'authorization_code', code, redirect_uri: redirect, code_verifier: verifier })).json()
  assert.ok(t.access_token && t.refresh_token)
  const t2 = await (await tok({ grant_type: 'refresh_token', refresh_token: t.refresh_token })).json()
  assert.ok(t2.access_token)

  let id = 0
  const rpc = async (method, params) => {
    const r = await fetch(`${B}/api/mcp`, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', Authorization: `Bearer ${t2.access_token}` }, body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method, params }) })
    assert.equal(r.status, 200, `${method} -> ${r.status}`)
    return (await r.json()).result
  }
  await rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'teste', version: '1' } })
  const nomes = (await rpc('tools/list', {})).tools.map(x => x.name).sort()
  assert.deepEqual(nomes, ['decidir_pedido', 'listar_pedidos', 'pedir_ajuste', 'ver_pedido'])
  const chamar = async (name, args) => (await rpc('tools/call', { name, arguments: args })).content[0].text

  console.log(`usuário: ${admin.username} (${admin.hierarquia})`)
  const lista = await chamar('listar_pedidos', {})
  console.log('listar_pedidos:', lista.slice(0, 300))
  const pend = (() => { try { return JSON.parse(lista) } catch { return [] } })()
  if (pend.length) {
    const p = pend[0]
    console.log('ver_pedido:', (await chamar('ver_pedido', { modulo: p.modulo, id: p.id })).slice(0, 200))
    const prev = await chamar('decidir_pedido', { modulo: p.modulo, id: p.id, decisao: 'autorizar' })
    assert.match(prev, /Nada foi feito/)
    const { data: antes } = await db.from(p.modulo === 'pagamentos' ? 'pedidos_solicitados' : 'pedidos_solicitados_receita').select('status').eq('id', p.id).single()
    assert.equal(antes.status, 'Aguardando Autorização', 'a prévia não pode gravar')
    if (process.argv.includes('--executar')) console.log('decidir_pedido:', await chamar('decidir_pedido', { modulo: p.modulo, id: p.id, decisao: 'autorizar', confirmar: true }))
  } else console.log('(sem pedido pendente visível para esse usuário; ferramentas de escrita não exercitadas)')
  console.log('OK')
} finally { parar() }
