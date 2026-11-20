// Teste do MCP contra o banco de PRODUÇÃO (.env.local), a pedido do Rhuan. SÓ LEITURA: nunca chama decidir_pedido/pedir_ajuste com confirmar=true.
// Pula o login do navegador: assina um access token do MCP para o usuário informado (usa o SESSION_SECRET do app).
// Uso: node scripts/teste-mcp-prod.mjs <nome_de_usuario> [projeto_id] [--rejeitar=ID]  (--rejeitar grava de verdade, só nesse pedido de pagamentos)
import { readFileSync } from 'node:fs'
import { spawn } from 'node:child_process'
import assert from 'node:assert/strict'
import { SignJWT } from 'jose'
import { createClient } from '@supabase/supabase-js'

const args = process.argv.slice(2)
const rej = Number(args.find(a => a.startsWith('--rejeitar='))?.split('=')[1])
const [nome, projetoArg] = args.filter(a => !a.startsWith('--'))
if (!nome) throw new Error('uso: node scripts/teste-mcp-prod.mjs <nome_de_usuario> [projeto_id]')
const env = Object.fromEntries(readFileSync('.env.local', 'utf8').split(/\r?\n/)
  .filter(l => /^[A-Z_]+=/.test(l)).map(l => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]))

const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
const { data: us } = await db.from('usuarios').select('id, username, hierarquia, status_cadastro').ilike('username', `%${nome}%`).eq('status_cadastro', 'Autorizado').limit(2)
assert.equal(us?.length, 1, 'nome não encontrado ou ambíguo'); const u = us[0]
const { data: projetos } = await db.from('projetos').select('id, nome').eq('ativo', true).order('id')
console.log(`usuário ${u.username} (${u.hierarquia}); projetos:`, projetos.map(p => `${p.id}=${p.nome}`).join(', '))
const pid = Number(projetoArg ?? projetos[0].id)
console.log('projeto usado:', pid)

const key = new TextEncoder().encode(`${env.SESSION_SECRET}:mcp`)
const token = await new SignJWT({ uid: u.id, pid, cid: 'teste', typ: 'access' }).setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime('10m').sign(key)

const PORT = 3112, B = `http://localhost:${PORT}`
const srv = spawn('npx', ['next', 'dev', '-p', String(PORT)], { env: { ...process.env, ...env }, shell: true, stdio: 'ignore' })
const parar = () => { try { spawn('taskkill', ['/pid', String(srv.pid), '/t', '/f'], { stdio: 'ignore' }) } catch {} }
process.on('exit', parar)

try {
  for (let i = 0; i < 90; i++) { try { await fetch(`${B}/.well-known/oauth-authorization-server`); break } catch { await new Promise(r => setTimeout(r, 1000)) } }
  let id = 0
  const rpc = async (method, params) => {
    const r = await fetch(`${B}/api/mcp`, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', Authorization: `Bearer ${token}` }, body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method, params }) })
    const txt = await r.text()
    assert.equal(r.status, 200, `${method} -> ${r.status} ${txt}`)
    return JSON.parse(txt).result
  }
  await rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'teste', version: '1' } })
  console.log('ferramentas:', (await rpc('tools/list', {})).tools.map(t => t.name).join(', '))
  const chamar = async (name, args) => (await rpc('tools/call', { name, arguments: args })).content[0].text

  const lista = await chamar('listar_pedidos', {})
  console.log('listar_pedidos:\n', lista.slice(0, 700))
  const pend = (() => { try { return JSON.parse(lista) } catch { return [] } })()
  if (pend.length) {
    const p = pend[0]
    console.log(`ver_pedido #${p.id}:\n`, (await chamar('ver_pedido', { modulo: p.modulo, id: p.id })).slice(0, 600))
    const prev = await chamar('decidir_pedido', { modulo: p.modulo, id: p.id, decisao: 'autorizar' })
    assert.match(prev, /Nada foi feito/)
    console.log('prévia de decidir_pedido:\n', prev)
    const tab = p.modulo === 'pagamentos' ? 'pedidos_solicitados' : 'pedidos_solicitados_receita'
    const { data } = await db.from(tab).select('status').eq('id', p.id).single()
    assert.equal(data.status, 'Aguardando Autorização', 'a prévia não pode gravar')
  } else console.log('(sem pedido pendente visível para esse usuário/projeto)')
  if (rej) {
    const { data: antes } = await db.from('pedidos_solicitados').select('status, empresa').eq('id', rej).single()
    assert.equal(antes.status, 'Aguardando Autorização')
    console.log('rejeitando:', await chamar('decidir_pedido', { modulo: 'pagamentos', id: rej, decisao: 'rejeitar', confirmar: true }))
    const { data: dep } = await db.from('pedidos_solicitados').select('status, usuario_autorizador, data_autorizacao').eq('id', rej).single()
    const { data: fl } = await db.from('pedidos_solicitados_fluxo').select('status').eq('pedido_id', rej)
    console.log('depois:', JSON.stringify(dep), 'fluxo:', JSON.stringify(fl))
    assert.equal(dep.status, 'Não Autorizado')
  } else console.log('OK — nada foi gravado')
} finally { parar() }
