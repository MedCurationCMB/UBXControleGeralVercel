// Teste do RLS multi-projeto (fase 4). Roda contra o banco de TESTE (.env.test.local) e recusa a producao.
// Cria/atualiza usuarios rls_* (idempotente), usa a chave anonima + JWT do usuario + cabecalho x-projeto-id,
// e confere isolamento entre projetos. Limpa o que grava.
// Uso: node scripts/teste-rls.mjs
import fs from 'node:fs'
import crypto from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { SignJWT } from 'jose'

const env = Object.fromEntries(fs.readFileSync('.env.test.local', 'utf8').split(/\r?\n/)
  .filter(l => l && !l.startsWith('#') && l.includes('='))
  .map(l => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim().replace(/^['"]|['"]$/g, '')]))
const URL = env.NEXT_PUBLIC_SUPABASE_URL
if (URL.includes('biswoctezxmkirsubxbi') || !URL.includes('torhixitwrrmaekwurxf')) throw new Error('Este nao e o banco de TESTE. Abortando.')

const admin = createClient(URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const segredo = new TextEncoder().encode(env.SUPABASE_JWT_SECRET)
const hash = crypto.createHash('sha256').update('teste123').digest('hex')

let falhas = 0
const ok = (n, c, d = '') => { if (!c) falhas++; console.log(`${c ? 'OK   ' : 'FALHA'} ${n}${d ? ' — ' + d : ''}`) }

// --- usuarios de teste
const USERS = [
  { k: 'owner',   hier: 'owner', status: 'Autorizado', vinculos: [] },
  { k: 'admin',   hier: 'admin', status: 'Autorizado', vinculos: [[1, 'admin']] },
  { k: 'multi',   hier: 'user',  status: 'Autorizado', vinculos: [[1, 'user'], [2, 'admin']] },
  { k: 'so1',     hier: 'user',  status: 'Autorizado', vinculos: [[1, 'user']] },
  { k: 'sem',     hier: 'user',  status: 'Autorizado', vinculos: [] },
  { k: 'pend',    hier: 'user',  status: 'Aguardando Autorização', vinculos: [[1, 'user']] },
]
await admin.from('projetos').upsert({ id: 2, nome: 'PROJETO DEV' })
const id = {}
for (const u of USERS) {
  const email = `rls_${u.k}@teste.local`
  await admin.from('usuarios').delete().eq('email', email)
  const { data, error } = await admin.from('usuarios').insert({ username: `rls_${u.k}`, password: hash, email, hierarquia: u.hier, status_cadastro: u.status }).select('id').single()
  if (error) throw error
  id[u.k] = data.id
  for (const [p, papel] of u.vinculos) await admin.from('usuarios_projetos').insert({ usuario_id: data.id, projeto_id: p, papel })
}

async function como(k, projeto) {
  const headers = {}
  if (k) headers.Authorization = 'Bearer ' + await new SignJWT({ role: 'authenticated', usuario_id: id[k] }).setProtectedHeader({ alg: 'HS256' }).setSubject(String(id[k])).setIssuedAt().setExpirationTime('10m').sign(segredo)
  if (projeto) headers['x-projeto-id'] = String(projeto)
  return createClient(URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { global: { headers }, auth: { persistSession: false } })
}
const conta = async (c, tabela) => { const r = await c.from(tabela).select('*', { count: 'exact', head: true }); return r.error ? `erro:${r.error.message}` : r.count }

const { count: totalPedidos } = await admin.from('pedidos_solicitados').select('id', { count: 'exact', head: true })

// 1. isolamento de leitura
ok('sem JWT (so chave anonima) nao le pedidos', await conta(await como(null, 1), 'pedidos_solicitados') === 0)
ok('usuario do projeto 1 le todos os pedidos do UBX', await conta(await como('so1', 1), 'pedidos_solicitados') === totalPedidos, `${await conta(await como('so1', 1), 'pedidos_solicitados')} de ${totalPedidos}`)
ok('usuario so do projeto 1 com cabecalho 2 nao le nada', await conta(await como('so1', 2), 'pedidos_solicitados') === 0)
ok('usuario sem vinculo nao le o projeto 1', await conta(await como('sem', 1), 'pedidos_solicitados') === 0)
ok('cadastro pendente nao le nada', await conta(await como('pend', 1), 'pedidos_solicitados') === 0)
ok('usuario multi (1 user, 2 admin) le o projeto 1', await conta(await como('multi', 1), 'pedidos_solicitados') === totalPedidos)
ok('usuario multi no projeto 2 nao ve o UBX', await conta(await como('multi', 2), 'pedidos_solicitados') === 0)
ok('cabecalho de projeto inexistente nao le nada', await conta(await como('owner', 999), 'pedidos_solicitados') === 0)
ok('owner le o UBX', await conta(await como('owner', 1), 'pedidos_solicitados') === totalPedidos)
ok('owner no projeto 2 ve so o 2 (vazio)', await conta(await como('owner', 2), 'pedidos_solicitados') === 0)
for (const t of ['controle_pagamentos', 'controle_orcamento', 'categorias', 'fornecedores', 'documentos', 'comentarios', 'informacoes_boleto', 'requisicoes'])
  ok(`filtra ${t}`, await conta(await como('so1', 2), t) === 0 && await conta(await como('sem', 1), t) === 0 && (await conta(await como('so1', 1), t)) === (await admin.from(t).select('*', { count: 'exact', head: true })).count)

// 2. escrita
{
  const c = await como('multi', 2)
  const e1 = await c.from('empresas').insert({ empresa: 'ZZ RLS EMP' }).select('projeto_id').single()
  ok('membro grava no projeto ativo (padrao vem do cabecalho)', !e1.error && e1.data.projeto_id === 2, e1.error?.message)
  const e2 = await c.from('empresas').insert({ empresa: 'ZZ RLS OUTRO', projeto_id: 1 })
  ok('nao grava em outro projeto mesmo informando projeto_id', !!e2.error, e2.error?.message ?? 'gravou!')
  const so1 = await como('so1', 2)
  const e3 = await so1.from('empresas').insert({ empresa: 'ZZ RLS INVASAO' })
  ok('nao-membro nao grava no projeto', !!e3.error)
  const e4 = await (await como(null, 2)).from('empresas').insert({ empresa: 'ZZ RLS ANON' })
  ok('anonimo nao grava', !!e4.error)
  const up = await (await como('so1', 1)).from('empresas').update({ empresa: 'ZZ' }).eq('projeto_id', 2)
  ok('update em outro projeto nao afeta linhas', !up.error && (up.count ?? 0) === 0)
  const del = await (await como('so1', 1)).from('empresas').delete().eq('empresa', 'ZZ RLS EMP').select()
  ok('delete em outro projeto nao apaga', (del.data ?? []).length === 0)

  // 3. cadeia de triggers de orcamento sob RLS (projeto 2): registro -> analise -> orcamentos_usuarios -> controle -> consumo do pedido
  await c.from('categorias').insert({ empresa: 'ZZ RLS EMP', categoria: 'ZZ CAT' })
  await c.from('fornecedores').insert({ nome: 'ZZ RLS FORN' })
  const reg = await c.from('registro_orcamentos').insert({ empresa: 'ZZ RLS EMP', categoria: 'ZZ CAT', mes: 5, ano: 2032, valor_orcamento: 1000, usuario_criador: 'rls' })
  ok('registro de orcamento grava e dispara a cadeia de triggers', !reg.error, reg.error?.message)
  const orc = await c.from('controle_orcamento').select('valor_orcamento, valor_pedidos_solicitados').eq('empresa', 'ZZ RLS EMP').eq('ano', 2032)
  ok('controle_orcamento criado pelas triggers no projeto 2', orc.data?.length === 1 && Number(orc.data[0].valor_orcamento) === 1000, JSON.stringify(orc.data))
  const ped = await c.from('pedidos_solicitados').insert({ empresa: 'ZZ RLS EMP', categoria: 'ZZ CAT', fornecedor: 'ZZ RLS FORN', valor_pedido: 300, status: 'Aguardando Autorização' }).select('id, projeto_id').single()
  ok('pedido grava no projeto 2', !ped.error && ped.data.projeto_id === 2, ped.error?.message)
  const fl = await c.from('pedidos_solicitados_fluxo').insert({ pedido_id: ped.data.id, empresa: 'ZZ RLS EMP', categoria: 'ZZ CAT', fornecedor: 'ZZ RLS FORN', mes: 5, ano: 2032, valor_referente: 300 })
  ok('cronograma grava (trigger herda projeto)', !fl.error, fl.error?.message)
  const orc2 = await c.from('controle_orcamento').select('valor_pedidos_solicitados').eq('empresa', 'ZZ RLS EMP').eq('ano', 2032).single()
  ok('consumo atualizado por trigger sob RLS (300)', Number(orc2.data?.valor_pedidos_solicitados) === 300, JSON.stringify(orc2.data))
  const ctl = await c.from('controle_pagamentos').insert({ pedido_id: ped.data.id, valor_pagar: 300, status_pagamento: 1 }).select('projeto_id').single()
  ok('controle de pagamento grava e herda o projeto', !ctl.error && ctl.data.projeto_id === 2, ctl.error?.message)
  const ctl2 = await c.from('controle_pagamentos').insert({ pedido_id: ped.data.id, valor_pagar: 999, status_pagamento: 1 })
  ok('trava de parcelas continua valendo sob RLS', !!ctl2.error && /Soma das parcelas/.test(ctl2.error.message), ctl2.error?.message)

  // 4. nao amarra registro do projeto 2 a pedido do projeto 1
  const { data: ped1 } = await admin.from('pedidos_solicitados').select('id').eq('projeto_id', 1).limit(1).single()
  const x1 = await c.from('controle_pagamentos').insert({ pedido_id: ped1.id, valor_pagar: 1, status_pagamento: 1 })
  ok('nao cria controle apontando para pedido de outro projeto', !!x1.error, x1.error?.message ?? 'gravou!')
  const x2 = await c.from('comentarios').insert({ pedido_id: ped1.id, comentario: 'x', usuario: 'rls', tipo_documento: null })
  ok('nao comenta em pedido de outro projeto', !!x2.error)
  const x3 = await c.from('pedidos_solicitados_fluxo').insert({ pedido_id: ped1.id, empresa: 'ZZ RLS EMP', categoria: 'ZZ CAT', fornecedor: 'ZZ RLS FORN', mes: 1, ano: 2032, valor_referente: 1 })
  ok('nao cria cronograma em pedido de outro projeto', !!x3.error)
  const cm = await c.from('comentarios').insert({ pedido_id: ped.data.id, comentario: 'ok', usuario: 'rls', tipo_documento: null })
  ok('comenta no proprio pedido', !cm.error, cm.error?.message)
}

// 5. config: membro le, so admin do projeto grava
{
  const rd = await (await como('so1', 1)).from('config').select('chave')
  ok('membro le a config do projeto', (rd.data ?? []).length > 0)
  const wr = await (await como('so1', 1)).from('config').insert({ chave: 'zz_teste', valor: '1' })
  ok('membro comum nao grava config', !!wr.error)
  const wa = await (await como('multi', 2)).from('config').insert({ chave: 'zz_teste', valor: '1' })
  ok('admin do projeto grava config', !wa.error, wa.error?.message)
  const wo = await (await como('admin', 1)).from('config').insert({ chave: 'zz_teste', valor: '1' })
  ok('admin do projeto 1 grava config do 1', !wo.error, wo.error?.message)
  ok('config do projeto 2 nao vaza para o 1', (await (await como('so1', 1)).from('config').select('chave').eq('chave', 'zz_teste')).data?.length === 1)
}

// 6. tabelas de apoio e globais
ok('tipos_documento legivel logado', await conta(await como('so1', 1), 'tipos_documento') > 0)
ok('tipos_documento nao legivel sem JWT', await conta(await como(null, 1), 'tipos_documento') === 0)
ok('usuarios: usuario comum nao le', await conta(await como('so1', 1), 'usuarios') === 0)
ok('usuarios: owner le', await conta(await como('owner', 1), 'usuarios') > 0)
ok('usuarios: admin (nao owner) nao le', await conta(await como('admin', 1), 'usuarios') === 0)
ok('usuarios: admin de projeto (user global) nao le', await conta(await como('multi', 2), 'usuarios') === 0)
ok('smtp_config/assistente_virtual: usuario comum nao le', await conta(await como('so1', 1), 'smtp_config') === 0 && await conta(await como('so1', 1), 'assistente_virtual') === 0)
ok('reset_tokens e usuarios_projetos fechados ao navegador', await conta(await como('admin', 1), 'reset_tokens') === 0 && await conta(await como('admin', 1), 'usuarios_projetos') === 0)
const rp = await (await como('multi', 1)).from('projetos').select('nome')
ok('projetos: le so o projeto ativo', rp.data?.length === 1 && rp.data[0].nome === 'UBX')
const wp = await (await como('owner', 1)).from('projetos').insert({ nome: 'X' })
ok('ninguem cria projeto pelo navegador', !!wp.error)
const rpc = await (await como('so1', 1)).rpc('pedidos_solicitados_valores_distintos', { coluna: 'empresa' })
ok('rpc de filtros respeita o projeto', !rpc.error && rpc.data.length > 0 && (await (await como('so1', 2)).rpc('pedidos_solicitados_valores_distintos', { coluna: 'empresa' })).data.length === 0)

// --- limpeza (service role)
await admin.from('config').delete().eq('chave', 'zz_teste')
const { data: pz } = await admin.from('pedidos_solicitados').select('id').eq('empresa', 'ZZ RLS EMP')
for (const p of pz ?? []) {
  await admin.from('comentarios').delete().eq('pedido_id', p.id)
  await admin.from('controle_pagamentos').delete().eq('pedido_id', p.id)
  await admin.from('pedidos_solicitados_fluxo').update({ valor_referente: 0 }).eq('pedido_id', p.id)
  await admin.from('pedidos_solicitados_fluxo').delete().eq('pedido_id', p.id)
  await admin.from('pedidos_solicitados').delete().eq('id', p.id)
}
for (const t of ['controle_orcamento', 'registro_orcamento_analise', 'registro_orcamentos', 'orcamentos_usuarios'])
  await admin.from(t).delete().eq('empresa', 'ZZ RLS EMP')
await admin.from('categorias').delete().eq('empresa', 'ZZ RLS EMP')
await admin.from('fornecedores').delete().eq('nome', 'ZZ RLS FORN')
await admin.from('empresas').delete().eq('empresa', 'ZZ RLS EMP')

console.log(falhas === 0 ? '\nTudo certo: RLS isola os projetos.' : `\n${falhas} verificacao(oes) falharam.`)
process.exit(falhas === 0 ? 0 : 1)
