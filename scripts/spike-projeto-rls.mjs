// Spike: cabeçalho x-projeto-id + JWT com "usuario" + RLS. Roda contra o banco de TESTE (.env.test.local).
// Uso: node scripts/spike-projeto-rls.mjs
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { SignJWT } from 'jose'

const env = Object.fromEntries(fs.readFileSync('.env.test.local', 'utf8').split(/\r?\n/)
  .filter(l => l && !l.startsWith('#') && l.includes('='))
  .map(l => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim().replace(/^['"]|['"]$/g, '')]))

const URL = env.NEXT_PUBLIC_SUPABASE_URL
if (URL.includes('biswoctezxmkirsubxbi')) throw new Error('Este é o banco de PRODUÇÃO. Abortando.')
const segredo = new TextEncoder().encode(env.SUPABASE_JWT_SECRET ?? '')

const jwt = usuario => new SignJWT({ role: 'authenticated', usuario })
  .setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime('10m').sign(segredo)

async function cliente(usuario, projeto) {
  const headers = {}
  if (usuario) headers.Authorization = `Bearer ${await jwt(usuario)}`
  if (projeto) headers['x-projeto-id'] = String(projeto)
  return createClient(URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { global: { headers }, auth: { persistSession: false } })
}

let falhas = 0
const confere = (nome, ok, detalhe = '') => { if (!ok) falhas++; console.log(`${ok ? 'OK   ' : 'FALHA'} ${nome}${detalhe ? ' — ' + detalhe : ''}`) }
const nomes = r => (r.data ?? []).map(x => x.nome).sort().join(', ') || '(nada)'

// 1. sem JWT de usuário (só a chave anônima) não enxerga nada
{
  const c = await cliente(null, 1)
  const r = await c.from('spike_itens').select('nome')
  confere('anon sem usuário não lê nada', !r.error && (r.data ?? []).length === 0, nomes(r))
}
// 2. ana (membro só do projeto 1) com projeto 1: lê só o item do UBX
{
  const c = await cliente('ana', 1)
  const r = await c.from('spike_itens').select('nome')
  confere('ana + projeto 1 lê só o UBX', nomes(r) === 'item do UBX', nomes(r) + (r.error ? ' ' + r.error.message : ''))
  // 3. insert sem informar projeto_id: o DEFAULT pega do cabeçalho
  const ins = await c.from('spike_itens').insert({ nome: 'criado pela ana' }).select('projeto_id').single()
  confere('insert sem projeto_id herda o do cabeçalho (1)', ins.data?.projeto_id === 1, ins.error?.message ?? `projeto_id=${ins.data?.projeto_id}`)
  // 4. tentar gravar no projeto 2 explicitamente
  const bad = await c.from('spike_itens').insert({ nome: 'invasão', projeto_id: 2 })
  confere('ana não grava no projeto 2 (com projeto_id explícito)', !!bad.error, bad.error?.message ?? 'gravou!')
}
// 5. ana falsificando o cabeçalho para o projeto 2: não é membro, não lê
{
  const c = await cliente('ana', 2)
  const r = await c.from('spike_itens').select('nome')
  confere('ana com cabeçalho falso (projeto 2) não lê', (r.data ?? []).length === 0, nomes(r))
  const ins = await c.from('spike_itens').insert({ nome: 'invasão 2' })
  confere('ana com cabeçalho falso (projeto 2) não grava', !!ins.error, ins.error?.message ?? 'gravou!')
}
// 6. cris (membro dos dois) enxerga um projeto por vez
for (const p of [1, 2]) {
  const c = await cliente('cris', p)
  const r = await c.from('spike_itens').select('nome')
  const esperado = p === 1 ? ['criado pela ana', 'item do UBX'] : ['item do DEV']
  confere(`cris + projeto ${p}`, nomes(r) === esperado.join(', '), nomes(r))
}
// 7. bia (só projeto 2) não lê o UBX
{
  const c = await cliente('bia', 1)
  const r = await c.from('spike_itens').select('nome')
  confere('bia com cabeçalho falso (projeto 1) não lê', (r.data ?? []).length === 0, nomes(r))
}
// 8. JWT com segredo errado é rejeitado
{
  const falso = await new SignJWT({ role: 'authenticated', usuario: 'ana' }).setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt().setExpirationTime('10m').sign(new TextEncoder().encode('segredo-errado-com-mais-de-32-caracteres!!'))
  const c = createClient(URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${falso}`, 'x-projeto-id': '1' } }, auth: { persistSession: false } })
  const r = await c.from('spike_itens').select('nome')
  confere('JWT assinado com segredo errado é rejeitado', !!r.error || (r.data ?? []).length === 0, r.error?.message ?? nomes(r))
}

console.log(falhas === 0 ? '\nTudo certo: a técnica funciona.' : `\n${falhas} verificação(ões) falharam.`)
process.exit(falhas === 0 ? 0 : 1)
