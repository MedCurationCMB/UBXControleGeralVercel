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
  // orçamento: consulta + prévia (nunca confirmar=true aqui)
  const orc = await chamar('consultar_orcamento', { modulo: 'pagamentos', ano: 2026 })
  console.log('consultar_orcamento:', orc.slice(0, 500))
  const o = (() => { try { return JSON.parse(orc).linhas?.[0] } catch { return null } })()
  if (o) {
    const [mes, ano] = o.periodo.split('/').map(Number)
    const { count: antes } = await db.from('registro_orcamentos').select('id', { count: 'exact', head: true })
    const num = v => Number(v.replace(/[^\d,]/g, '').replace(',', '.'))
    const prev = await chamar('lancar_orcamento', { modulo: 'pagamentos', centro: o.centro, categoria: o.categoria, mes, ano, valor: num(o.orcamento) + 1000 })
    console.log('prévia de lancar_orcamento:', prev)
    const ruim = await chamar('lancar_orcamento', { modulo: 'pagamentos', centro: o.centro, categoria: 'NAO EXISTE', mes, ano, valor: 10 })
    assert.match(ruim, /não encontrada/)
    const { count: depois } = await db.from('registro_orcamentos').select('id', { count: 'exact', head: true })
    assert.equal(depois, antes, 'a prévia não pode gravar')
  }
  // comentários, cancelar, ajustar e realocação: leitura + prévia (nunca confirmar=true aqui)
  const fotoPed = async () => JSON.stringify([(await db.from('comentarios').select('id', { count: 'exact', head: true })).count, (await db.from('realocacoes').select('id', { count: 'exact', head: true })).count,
    (await db.from('pedidos_solicitados').select('id, status, valor_pedido, cancelado').eq('projeto_id', pid).order('id')).data])
  const antesPed = await fotoPed()
  const pAg = pend?.[0]
  if (pAg) {
    console.log('adicionar_comentario (prévia):', await chamar('adicionar_comentario', { modulo: pAg.modulo, pedido_id: pAg.id, comentario: 'teste de prévia' }))
    console.log('cancelar_pedido (prévia):', await chamar('cancelar_pedido', { modulo: pAg.modulo, pedido_id: pAg.id }))
    console.log('ajustar_pedido (pedido fora de ajuste):', await chamar('ajustar_pedido', { modulo: pAg.modulo, pedido_id: pAg.id, observacao: 'x' }))
  }
  console.log('pedidos aguardando ajuste:', (await chamar('listar_pedidos', { situacao: 'ajuste' })).slice(0, 300).replace(/\n/g, ' '))
  const { data: aut } = await db.from('pedidos_solicitados').select('id, empresa, valor_pedido').eq('projeto_id', pid).eq('status', 'Autorizado').eq('cancelado', false).gt('valor_pedido', 0).order('id', { ascending: false }).limit(1)
  const outroCentro = (await chamar('buscar_cadastro', { tipo: 'centro', limite: 5 })).split('\n').find(c => c !== aut?.[0]?.empresa)
  if (aut?.length) {
    const r = await chamar('solicitar_realocacao', { modulo: 'pagamentos', pedido_id: aut[0].id, modo: 'percentual', destinos: [{ centro: aut[0].empresa, percentual: 50 }, { centro: outroCentro, percentual: 50 }] })
    console.log('solicitar_realocacao (simulação):', r.slice(0, 700))
    console.log('realocação com soma errada:', (await chamar('solicitar_realocacao', { modulo: 'pagamentos', pedido_id: aut[0].id, modo: 'percentual', destinos: [{ centro: outroCentro, percentual: 30 }] })).slice(0, 300))
  }
  console.log('listar_realocacoes (aguardando):', (await chamar('listar_realocacoes', {})).slice(0, 500))
  const lt = await chamar('listar_realocacoes', { situacao: 'todas' })
  console.log('listar_realocacoes (todas):', lt.slice(0, 500))
  const idR = lt.match(/^realocação #(\d+) .*Aguardando/m)?.[1]
  if (idR) console.log('decidir_realocacao (prévia):', await chamar('decidir_realocacao', { id: Number(idR), decisao: 'autorizar' }))
  assert.equal(await fotoPed(), antesPed, 'as prévias não podem alterar pedidos, comentários ou realocações')

  // centros, categorias e contas bancárias: leitura + prévia (nunca confirmar=true aqui)
  const cnt = async t => (await db.from(t).select('id', { count: 'exact', head: true })).count
  const antesEstr = JSON.stringify([await cnt('empresas'), await cnt('categorias'), await cnt('categorias_receita'), await cnt('conta_pagador')])
  const cens = (await chamar('buscar_cadastro', { tipo: 'centro', limite: 2 })).split('\n')
  const cats = (await chamar('buscar_cadastro', { tipo: 'categoria', modulo: 'pagamentos', limite: 1 })).split(' / ')
  console.log('criar_centro (prévia):', await chamar('criar_centro', { nome: 'TESTE MCP CENTRO', copiar_categorias_de: cens[0] }))
  console.log('criar_centro duplicado:', await chamar('criar_centro', { nome: cens[0].toLowerCase() }))
  console.log('renomear_centro (prévia):', await chamar('renomear_centro', { centro: cens[0], novo_nome: 'TESTE MCP RENOMEADO' }))
  console.log('copiar_categorias (prévia):', await chamar('copiar_categorias', { origem: cens[0], destino: cens[1] }))
  console.log('criar_categoria (prévia):', await chamar('criar_categoria', { modulo: 'pagamentos', centro: cats[0], categoria: 'TESTE MCP CATEGORIA' }))
  console.log('criar_categoria duplicada:', await chamar('criar_categoria', { modulo: 'pagamentos', centro: cats[0], categoria: cats[1] }))
  console.log('renomear_categoria (prévia):', await chamar('renomear_categoria', { modulo: 'pagamentos', centro: cats[0], categoria: cats[1], novo_nome: 'TESTE MCP RENOMEADA' }))
  console.log('excluir_categoria (prévia):', await chamar('excluir_categoria', { modulo: 'pagamentos', centro: cats[0], categoria: cats[1] }))
  console.log('listar_contas_bancarias:', (await chamar('listar_contas_bancarias', {})).slice(0, 400))
  console.log('salvar_conta_bancaria (prévia):', await chamar('salvar_conta_bancaria', { nome_empresa: 'TESTE MCP', cnpj: '12.345.678/0001-95', agencia: 1234, conta_corrente: 56789, digito_conta: 0, cep: '60000-000', estado: 'ce' }))
  console.log('salvar_conta_bancaria (cnpj inválido):', await chamar('salvar_conta_bancaria', { nome_empresa: 'TESTE MCP', cnpj: '123' }))
  assert.equal(JSON.stringify([await cnt('empresas'), await cnt('categorias'), await cnt('categorias_receita'), await cnt('conta_pagador')]), antesEstr, 'as prévias não podem alterar a estrutura')

  // contas a pagar/receber: leitura + prévia (nunca confirmar=true aqui)
  const fotoContas = async () => JSON.stringify((await db.from('controle_pagamentos').select('id, valor_pagamento, data_pagamento, status_pagamento, data_vencimento, valor_pagar').order('id')).data)
  const antesContas = await fotoContas()
  const atras = await chamar('listar_contas', { modulo: 'pagamentos', situacao: 'Atrasado', limite: 4 })
  console.log('listar_contas (atrasadas):\n' + atras.slice(0, 900))
  console.log('listar_contas (receber):', (await chamar('listar_contas', { modulo: 'recebimentos', limite: 2 })).slice(0, 500))
  console.log('listar_contas (centro+parte):', (await chamar('listar_contas', { modulo: 'pagamentos', centro: 'ADM', parte: 'a', status: 'Pago', limite: 2 })).slice(0, 500))
  // a prévia roda em quem tiver conta aberta (o código é o mesmo nos dois módulos)
  const modC = atras.match(/^conta #/m) ? 'pagamentos' : 'recebimentos'
  const abertas = modC === 'pagamentos' ? atras : await chamar('listar_contas', { modulo: modC, situacao: 'Atrasado', limite: 3 })
  const idConta = abertas.match(/^conta #(\d+)/m)?.[1]
  if (idConta) {
    console.log(`registrar (${modC}, prévia):`, await chamar('registrar_pagamento', { modulo: modC, conta_id: Number(idConta) }))
    console.log('atualizar_conta (prévia):', await chamar('atualizar_conta', { modulo: modC, conta_id: Number(idConta), data_vencimento: '2026-12-31', tipo: 'pix' }))
    console.log('atualizar_conta (status inválido):', await chamar('atualizar_conta', { modulo: modC, conta_id: Number(idConta), status: 'xyz' }))
    console.log('registrar com valor maior (prévia):', await chamar('registrar_pagamento', { modulo: modC, conta_id: Number(idConta), data: '2026-11-23', valor: 99999 }))
  }
  const fotoReceb = async () => JSON.stringify((await db.from('controle_recebimento').select('id, valor_pagamento, data_pagamento, status_recebimento, data_vencimento, valor_pagar').order('id')).data)
  const antesReceb = await fotoReceb()
  const { data: pedAut } = await db.from('pedidos_solicitados').select('id').eq('projeto_id', pid).eq('status', 'Autorizado').eq('cancelado', false).limit(1)
  if (pedAut?.length) {
    console.log('adicionar_conta (prévia):', await chamar('adicionar_conta', { modulo: 'pagamentos', pedido_id: pedAut[0].id, data_vencimento: '2026-12-15', valor: 1, tipo: 'PIX' }))
    console.log('adicionar_conta (pedido não autorizado):', (await chamar('adicionar_conta', { modulo: 'pagamentos', pedido_id: Number(pend?.[0]?.id), data_vencimento: '2026-12-15', valor: 1, tipo: 'PIX' })).slice(0, 200))
  }
  assert.equal(await fotoContas(), antesContas, 'as prévias não podem alterar contas')
  assert.equal(await fotoReceb(), antesReceb, 'as prévias não podem alterar recebimentos')

  // seleção de projeto: só para quem tem mais de um (nunca grava)
  const tl = (await rpc('tools/list', {})).tools
  assert.ok(tl.some(t => t.name === 'listar_projetos'), 'quem tem vários projetos deve ver listar_projetos')
  assert.ok(tl.every(t => t.name === 'listar_projetos' || 'projeto' in (t.inputSchema.properties ?? {})), 'toda ferramenta deve ter o parâmetro projeto')
  console.log('listar_projetos:\n' + await chamar('listar_projetos', {}))
  const ver = pend?.[0]
  if (ver) {
    console.log('ver_pedido (padrão):', (await chamar('ver_pedido', { modulo: ver.modulo, id: ver.id })).slice(0, 60).replace(/\n/g, ' '))
    console.log('ver_pedido com projeto=DEV:', await chamar('ver_pedido', { modulo: ver.modulo, id: ver.id, projeto: 'PROJETO DEV' }))
  }
  console.log('projeto ambíguo:', (await chamar('listar_pedidos', { projeto: 'e' })).split('\n')[0])
  console.log('projeto inexistente:', (await chamar('listar_pedidos', { projeto: 'xyz' })).split('\n')[0])
  console.log('buscar centro no projeto 2:', (await chamar('buscar_cadastro', { tipo: 'centro', limite: 3, projeto: '2' })).replace(/\n/g, ' | '))
  // quem tem um projeto só não vê nada disso
  const { data: vinc } = await db.from('usuarios_projetos').select('usuario_id, projeto_id')
  const cont = {}; for (const v of vinc ?? []) cont[v.usuario_id] = (cont[v.usuario_id] ?? 0) + 1
  const { data: simples } = await db.from('usuarios').select('id, hierarquia').in('id', Object.keys(cont).filter(k => cont[k] === 1).map(Number)).neq('hierarquia', 'owner').eq('status_cadastro', 'Autorizado').limit(1)
  if (simples?.length) {
    const pj = (vinc ?? []).find(v => v.usuario_id === simples[0].id).projeto_id
    const tk = await new SignJWT({ uid: simples[0].id, pid: pj, cid: 'teste', typ: 'access' }).setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime('10m').sign(key)
    const r = await fetch(`${B}/api/mcp`, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', Authorization: `Bearer ${tk}` }, body: JSON.stringify({ jsonrpc: '2.0', id: 99, method: 'tools/list', params: {} }) })
    const lista1 = JSON.parse(await r.text()).result.tools
    assert.ok(!lista1.some(t => t.name === 'listar_projetos') && lista1.every(t => !('projeto' in (t.inputSchema.properties ?? {}))), 'quem tem um projeto só não vê a seleção de projeto')
    console.log(`usuário com um projeto só: ${lista1.length} ferramentas, sem listar_projetos e sem parâmetro projeto`)
  } else console.log('(nenhum usuário comum com um projeto só para testar)')

  // upload por link: gera o link, confere a página e as recusas (não-PDF, token ruim). Só envia PDF de verdade com --upload=ID (pedido de pagamentos).
  const alvoUp = Number(args.find(a => a.startsWith('--upload=') || a.startsWith('--alvo='))?.split('=')[1]) || Number(pend?.[0]?.id)
  if (alvoUp) {
    const nDocs = (await db.from('documentos').select('id', { count: 'exact', head: true })).count
    const lk = await chamar('anexar_documento', { modulo: 'pagamentos', alvo: 'pedido', id: alvoUp })
    console.log('anexar_documento:', lk.replace(/(\/anexar\/)[\w.-]+/, '$1<token>'))
    const link = lk.match(/https?:\/\/\S+\/anexar\/[\w.-]+/)?.[0].replace(/^https?:\/\/[^/]+/, B)
    assert.ok(link, 'sem link')
    const pagina = await fetch(link)
    assert.equal(pagina.status, 200); assert.match(await pagina.text(), /Anexar documento/)
    const tok = link.split('/anexar/')[1]
    const post = (token, nome, conteudo, tipo) => fetch(`${B}/api/anexar/${token}`, { method: 'POST', body: (() => { const fd = new FormData(); fd.append('file', new File([conteudo], nome, { type: tipo })); return fd })() })
    const naoPdf = await post(tok, 'x.pdf', 'isto nao e um pdf', 'application/pdf')
    assert.equal(naoPdf.status, 422); console.log('não-PDF recusado:', (await naoPdf.json()).error)
    assert.equal((await post('lixo', 'x.pdf', '%PDF-1.4', 'application/pdf')).status, 401)
    assert.equal((await fetch(`${B}/anexar/lixo`)).status, 410)
    const antesTxt = await chamar('listar_documentos', { modulo: 'pagamentos', alvo: 'pedido', id: alvoUp })
    console.log('listar_documentos antes:', antesTxt.replace(/https?:\/\/\S+/g, '<url>').slice(0, 300))
    const urlDoc = antesTxt.match(/https?:\/\/\S+/)?.[0]
    if (urlDoc) { const d = await fetch(urlDoc); const t = await d.text(); assert.equal(d.status, 200); assert.ok(t.startsWith('%PDF-'), 'download não devolveu o PDF'); console.log('download assinado ok:', t.length, 'bytes') }
    if (args.some(a => a.startsWith('--upload='))) {
      const pdf = '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 100]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF'
      const r = await post(tok, 'teste-mcp-upload.pdf', pdf, 'application/pdf')
      console.log('upload real:', r.status, JSON.stringify(await r.json()))
      console.log('listar_documentos depois:', (await chamar('listar_documentos', { modulo: 'pagamentos', alvo: 'pedido', id: alvoUp })).replace(/https?:\/\/\S+/g, '<url>').slice(0, 400))
    } else assert.equal((await db.from('documentos').select('id', { count: 'exact', head: true })).count, nDocs, 'sem --upload nada pode ser gravado')
  }

  // buscas e cadastro de fornecedor/cliente: leitura + prévia (nunca confirmar=true aqui)
  const nForn = (await db.from('fornecedores').select('id', { count: 'exact', head: true })).count
  const bf = await chamar('buscar_cadastro', { tipo: 'fornecedor', busca: 'a', limite: 3 })
  console.log('buscar fornecedor:\n' + bf)
  console.log('buscar centro:', (await chamar('buscar_cadastro', { tipo: 'centro', limite: 3 })).replace(/\n/g, ' | '))
  console.log('buscar categoria:', (await chamar('buscar_cadastro', { tipo: 'categoria', modulo: 'pagamentos', limite: 3 })).replace(/\n/g, ' | '))
  console.log('buscar cliente:', (await chamar('buscar_cadastro', { tipo: 'cliente', limite: 2 })).replace(/\n/g, ' | '))
  console.log('salvar_parceiro (novo, prévia):', await chamar('salvar_parceiro', { tipo: 'fornecedor', nome: 'TESTE MCP PREVIA', cnpj_cpf: '12345678000195', estado: 'ce', tipo_chave: 'CPF/CNPJ' }))
  console.log('cnpj inválido:', await chamar('salvar_parceiro', { tipo: 'fornecedor', nome: 'TESTE MCP PREVIA', cnpj_cpf: '123' }))
  const nomeExistente = [...bf.matchAll(/^#\d+ · ([^·]+) ·/gm)].map(m => m[1]).find(n => n === n.trim() && !n.includes('  '))?.trim()
  if (nomeExistente) console.log('nome repetido:', await chamar('salvar_parceiro', { tipo: 'fornecedor', nome: nomeExistente.toLowerCase() }))
  assert.equal((await db.from('fornecedores').select('id', { count: 'exact', head: true })).count, nForn, 'fornecedores não podem mudar')

  // requisições e criar pedido: leitura + prévia (nunca confirmar=true aqui)
  const contar = async tab => (await db.from(tab).select('id', { count: 'exact', head: true })).count
  const [nReq, nPed] = [await contar('requisicoes'), await contar('pedidos_solicitados')]
  const aguard = await chamar('listar_requisicoes', { modulo: 'pagamentos' })
  console.log('requisições aguardando:', aguard.slice(0, 400))
  const livres = await chamar('listar_requisicoes', { modulo: 'pagamentos', situacao: 'autorizadas_sem_pedido' })
  console.log('requisições autorizadas sem pedido:', livres.slice(0, 400))
  const idAg = aguard.match(/^#(\d+)/)?.[1]
  if (idAg) console.log('prévia decidir_requisicao:', await chamar('decidir_requisicao', { modulo: 'pagamentos', id: Number(idAg), decisao: 'autorizar' }))
  const { data: orcs } = await db.from('controle_orcamento').select('empresa, categoria, mes, ano, valor_orcamento, valor_pedidos_solicitados').eq('projeto_id', pid).gte('ano', 2026)
  const com = (orcs ?? []).find(x => x.valor_orcamento - x.valor_pedidos_solicitados >= 10)
  const { data: forn } = await db.from('fornecedores').select('nome').eq('projeto_id', pid).limit(1)
  if (com && forn?.length) {
    const base = { modulo: 'pagamentos', centro: com.empresa, categoria: com.categoria, parte: forn[0].nome, periodos: [{ mes: com.mes, ano: com.ano, valor: 1 }] }
    console.log('criar_requisicao (prévia):', await chamar('criar_requisicao', { modulo: 'pagamentos', centro: com.empresa, categoria: com.categoria, descricao: 'teste de prévia' }))
    const semReq = await chamar('criar_pedido', base)
    console.log('criar_pedido sem requisição:', semReq)
    const req = livres.match(new RegExp(`^#(\\d+) · ${com.empresa.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} `, 'm'))?.[1]
    if (req) console.log('criar_pedido com requisição (prévia):', await chamar('criar_pedido', { ...base, requisicao_id: Number(req) }))
    const estoura = await chamar('criar_pedido', { ...base, requisicao_id: req ? Number(req) : undefined, periodos: [{ mes: com.mes, ano: com.ano, valor: 999999999 }] })
    console.log('criar_pedido acima do saldo:', estoura)
    assert.match(estoura, /excede|exige uma requisição|requisição/i)
  }
  assert.equal(await contar('requisicoes'), nReq, 'requisições não podem mudar')
  assert.equal(await contar('pedidos_solicitados'), nPed, 'pedidos não podem mudar')

  // conciliação: leitura + prévia (nunca confirmar=true aqui)
  const exs = await chamar('listar_extratos', {})
  console.log('listar_extratos:', exs.slice(0, 400))
  const ex = exs.match(/extrato #(\d+)/)
  if (ex) {
    const ver = await chamar('ver_extrato', { extrato_id: Number(ex[1]), limite: 8 })
    console.log('ver_extrato:', ver.slice(0, 1200))
    const m = ver.match(/linha #(\d+) .*?candidatas: conta #(\d+)/)
    const cnt = async () => (await db.from('controle_pagamentos').select('id', { count: 'exact', head: true }).not('extrato_lancamento_id', 'is', null)).count
    const antes = await cnt()
    if (m) {
      const prev = await chamar('vincular_extrato', { lancamento_id: Number(m[1]), conta_ids: [Number(m[2])] })
      console.log('prévia de vincular_extrato:', prev)
      assert.match(prev, /Nada foi feito|valor|soma|data/i)
      console.log('contas_para_linha:', (await chamar('contas_para_linha', { lancamento_id: Number(m[1]) })).slice(0, 500))
    }
    assert.equal(await cnt(), antes, 'a prévia não pode gravar')
  }
  if (rej) {
    const { data: antes } = await db.from('pedidos_solicitados').select('status, empresa').eq('id', rej).single()
    assert.equal(antes.status, 'Aguardando Autorização')
    console.log('rejeitando:', await chamar('decidir_pedido', { modulo: 'pagamentos', id: rej, decisao: 'rejeitar', confirmar: true }))
    const { data: dep } = await db.from('pedidos_solicitados').select('status, usuario_autorizador, data_autorizacao').eq('id', rej).single()
    const { data: fl } = await db.from('pedidos_solicitados_fluxo').select('status').eq('pedido_id', rej)
    console.log('depois:', JSON.stringify(dep), 'fluxo:', JSON.stringify(fl))
    assert.equal(dep.status, 'Não Autorizado')
  } else console.log('OK (sem flags de escrita, o teste só lê; as prévias nunca gravam)')
} finally { parar() }
