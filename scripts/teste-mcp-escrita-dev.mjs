// Roteiro de GRAVAÇÃO real do MCP, só no "PROJETO DEV" (id 2) do banco de produção (.env.local). Recusa qualquer outro projeto.
// Tudo que cria leva "TESTE MCP" no nome/observação e é apagado no fim (também apaga restos de uma execução anterior).
// Uso: node scripts/teste-mcp-escrita-dev.mjs "<nome do usuário admin>"   (ex.: "Rhuan Mateus")
import { readFileSync } from 'node:fs'
import { spawn, spawnSync } from 'node:child_process'
import assert from 'node:assert/strict'
import { SignJWT } from 'jose'
import { createClient } from '@supabase/supabase-js'

const nome = process.argv[2]
if (!nome) throw new Error('uso: node scripts/teste-mcp-escrita-dev.mjs "<nome do usuário>"')
const env = Object.fromEntries(readFileSync('.env.local', 'utf8').split(/\r?\n/)
  .filter(l => /^[A-Z_]+=/.test(l)).map(l => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]))
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

const PID = 2
const { data: proj } = await db.from('projetos').select('id, nome').eq('id', PID).single()
if (proj?.nome !== 'PROJETO DEV') throw new Error(`O projeto ${PID} não é o PROJETO DEV (${proj?.nome}). Abortando.`)
const { data: us } = await db.from('usuarios').select('id, username, hierarquia').ilike('username', `%${nome}%`).eq('status_cadastro', 'Autorizado').limit(2)
assert.equal(us?.length, 1, 'usuário não encontrado ou ambíguo'); const u = us[0]
const key = new TextEncoder().encode(`${env.SESSION_SECRET}:mcp`)
const token = await new SignJWT({ uid: u.id, pid: PID, cid: 'teste', typ: 'access' }).setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime('40m').sign(key)

const PORT = 3113, B = `http://localhost:${PORT}`
const srv = spawn('npx', ['next', 'dev', '-p', String(PORT)], { env: { ...process.env, ...env }, shell: true, stdio: 'ignore' })
const parar = () => { try { spawnSync('taskkill', ['/pid', String(srv.pid), '/t', '/f'], { stdio: 'ignore' }) } catch {} }
process.on('exit', parar)

// ---- tabelas do projeto e limpeza ----
const TABELAS = ['fornecedores', 'clientes', 'empresas', 'categorias', 'categorias_receita', 'conta_pagador', 'requisicoes', 'pedidos_solicitados', 'pedidos_solicitados_fluxo',
  'controle_pagamentos', 'documentos', 'realocacoes', 'realocacao_itens', 'registro_orcamentos', 'registro_orcamento_analise', 'orcamentos_usuarios', 'controle_orcamento',
  'pedidos_solicitados_receita', 'pedidos_solicitados_fluxo_receita', 'controle_recebimento', 'documentos_receita', 'registro_orcamentos_receita', 'registro_orcamento_analise_receita',
  'orcamentos_usuarios_receita', 'controle_orcamento_receita', 'extratos_bancarios']
const contar = async () => { const o = {}; for (const t of TABELAS) { const r = await db.from(t).select('id', { count: 'exact', head: true }).eq('projeto_id', PID); if (r.error) throw new Error(`${t}: ${r.error.message}`); o[t] = r.count } return o }
const MARCA = 'TESTE MCP%'

async function limpar() {
  const ids = async (t, f) => ((await f(db.from(t).select('id').eq('projeto_id', PID))).data ?? []).map(r => r.id)
  const peds = await ids('pedidos_solicitados', q => q.like('observacao', MARCA))
  const del = async (t, f) => { const r = await f(db.from(t).delete()); if (r.error) console.log(`  (limpeza ${t}: ${r.error.message})`) }
  if (peds.length) {
    await del('realocacoes', q => q.eq('projeto_id', PID).in('pedido_id', peds))
    await del('comentarios', q => q.in('pedido_id', peds))
    const docsIds = ((await db.from('documentos').select('id').in('pedido_id', peds)).data ?? []).map(d => d.id)
    if (docsIds.length) await del('informacoes_boleto', q => q.in('boleto_id', docsIds))
    await del('documentos', q => q.in('pedido_id', peds))
    await del('controle_pagamentos', q => q.in('pedido_id', peds))
    await del('pedidos_solicitados_fluxo', q => q.in('pedido_id', peds))
    await del('pedidos_solicitados', q => q.in('id', peds))
  }
  const pedsR = await ids('pedidos_solicitados_receita', q => q.like('observacao', MARCA))
  if (pedsR.length) {
    await del('realocacoes', q => q.eq('projeto_id', PID).in('pedido_id', pedsR))
    await del('comentarios_receita', q => q.in('pedido_id', pedsR))
    await del('documentos_receita', q => q.in('pedido_id', pedsR))
    await del('controle_recebimento', q => q.in('pedido_id', pedsR))
    await del('pedidos_solicitados_fluxo_receita', q => q.in('pedido_id', pedsR))
    await del('pedidos_solicitados_receita', q => q.in('id', pedsR))
  }
  await del('extratos_bancarios', q => q.eq('projeto_id', PID).like('nome_arquivo', MARCA))
  await del('requisicoes', q => q.eq('projeto_id', PID).like('descricao', MARCA))
  for (const t of ['controle_orcamento_receita', 'registro_orcamento_analise_receita', 'registro_orcamentos_receita', 'orcamentos_usuarios_receita']) await del(t, q => q.eq('projeto_id', PID).like('empresa', MARCA))
  for (const t of ['controle_orcamento', 'registro_orcamento_analise', 'registro_orcamentos', 'orcamentos_usuarios']) {
    await del(t, q => q.eq('projeto_id', PID).like('empresa', MARCA))
    await del(t, q => q.eq('projeto_id', PID).eq('empresa', 'Rhuan Financeiro').eq('categoria', 'Financeiro').eq('mes', 11).eq('ano', 2026))
  }
  await del('categorias', q => q.eq('projeto_id', PID).like('empresa', MARCA))
  await del('categorias_receita', q => q.eq('projeto_id', PID).like('empresa', MARCA))
  await del('empresas', q => q.eq('projeto_id', PID).like('empresa', MARCA))
  await del('fornecedores', q => q.eq('projeto_id', PID).like('nome', MARCA))
  await del('clientes', q => q.eq('projeto_id', PID).like('nome', MARCA))
  await del('conta_pagador', q => q.eq('projeto_id', PID).like('nome_empresa', MARCA))
}

const T = Date.now().toString(36).toUpperCase()
const nomeForn = `TESTE MCP FORN ${T}`, nomeCli = `TESTE MCP CLI ${T}`, centroT = `TESTE MCP CENTRO ${T}`
const ctx = {}
const resultados = []
let antes = {}

try {
  for (let i = 0; i < 90; i++) { try { await fetch(`${B}/.well-known/oauth-authorization-server`); break } catch { await new Promise(r => setTimeout(r, 1000)) } }
  console.log('limpando restos de execuções anteriores…'); await limpar()
  antes = await contar()

  let id = 0
  const rpc = async (method, params) => {
    const r = await fetch(`${B}/api/mcp`, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', Authorization: `Bearer ${token}` }, body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method, params }) })
    const txt = await r.text(); assert.equal(r.status, 200, `${method} -> ${r.status} ${txt.slice(0, 200)}`)
    return JSON.parse(txt).result
  }
  await rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'teste-escrita', version: '1' } })
  const chamar = async (name, args) => { const r = await rpc('tools/call', { name, arguments: args }); return { texto: r.content[0].text, erro: !!r.isError } }
  const exec = async (name, args) => { const r = await chamar(name, { ...args, confirmar: true }); assert.ok(!r.erro, `${name} falhou: ${r.texto}`); return r.texto }
  const passo = async (nomePasso, fn) => {
    try { await fn(); resultados.push([nomePasso, 'OK']); console.log('OK    ' + nomePasso) }
    catch (e) { resultados.push([nomePasso, 'FALHA: ' + String(e.message).split('\n')[0]]); console.log('FALHA ' + nomePasso + ' → ' + String(e.message).split('\n').slice(0, 3).join(' | ')) }
  }
  const um = async (t, f) => { const r = await f(db.from(t).select('*').eq('projeto_id', PID)); assert.ok(r.data?.length === 1, `${t}: esperava 1 linha, veio ${r.data?.length}`); return r.data[0] }
  const num = (txt, re) => { const m = txt.match(re); assert.ok(m, `não achei ${re} em: ${txt.slice(0, 200)}`); return Number(m[1]) }
  const pdf = '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 100]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF'

  // ---- cadastros ----
  await passo('fornecedor: cadastrar', async () => {
    await exec('salvar_parceiro', { tipo: 'fornecedor', nome: nomeForn, cnpj_cpf: '11222333000181', estado: 'ce', tipo_chave: 'CPF/CNPJ' })
    const f = await um('fornecedores', q => q.eq('nome', nomeForn)); ctx.forn = f.id
    assert.equal(f.cnpj_cpf, '11.222.333/0001-81'); assert.equal(f.chave_pix, '11.222.333/0001-81'); assert.equal(f.estado, 'CE'); assert.equal(f.tipo_chave, 3)
  })
  await passo('fornecedor: editar só um campo', async () => {
    await exec('salvar_parceiro', { tipo: 'fornecedor', id: ctx.forn, cidade: 'Caucaia' })
    const f = await um('fornecedores', q => q.eq('id', ctx.forn)); assert.equal(f.cidade, 'Caucaia'); assert.equal(f.nome, nomeForn); assert.equal(f.estado, 'CE')
  })
  await passo('fornecedor: nome repetido é recusado', async () => {
    const r = await chamar('salvar_parceiro', { tipo: 'fornecedor', nome: nomeForn.toLowerCase(), confirmar: true }); assert.ok(r.erro && /Já existe/.test(r.texto), r.texto)
  })
  await passo('cliente: cadastrar (chave e-mail)', async () => {
    await exec('salvar_parceiro', { tipo: 'cliente', nome: nomeCli, tipo_chave: 'E-mail', chave_pix: 'teste@exemplo.com' })
    const c = await um('clientes', q => q.eq('nome', nomeCli)); assert.equal(c.chave_pix, 'teste@exemplo.com'); assert.equal(c.tipo_chave, 2)
  })

  // ---- estrutura ----
  await passo('centro: criar copiando categorias', async () => {
    await exec('criar_centro', { nome: centroT, copiar_categorias_de: 'REALOC A' })
    await um('empresas', q => q.eq('empresa', centroT))
    const cs = await db.from('categorias').select('categoria').eq('projeto_id', PID).eq('empresa', centroT); assert.ok((cs.data?.length ?? 0) >= 1, 'categorias não copiadas')
  })
  await passo('categoria: criar "Financeiro" no centro de teste', async () => {
    await exec('criar_categoria', { modulo: 'pagamentos', centro: centroT, categoria: 'Financeiro' })
    await um('categorias', q => q.eq('empresa', centroT).eq('categoria', 'Financeiro'))
  })
  await passo('conta bancária: cadastrar e editar', async () => {
    await exec('salvar_conta_bancaria', { nome_empresa: `TESTE MCP CONTA ${T}`, cnpj: '11.222.333/0001-81', agencia: 1234, conta_corrente: 56789, digito_conta: 0, cep: '60000-000', estado: 'ce' })
    const c = await um('conta_pagador', q => q.eq('nome_empresa', `TESTE MCP CONTA ${T}`)); assert.equal(Number(c.cnpj), 11222333000181); assert.equal(c.cep, 60000000)
    await exec('salvar_conta_bancaria', { id: c.id, agencia: 4321 })
    assert.equal((await um('conta_pagador', q => q.eq('id', c.id))).agencia, 4321)
  })

  // ---- orçamento ----
  await passo('orçamento: lançar (Rhuan Financeiro, 11/2026)', async () => {
    await exec('lancar_orcamento', { modulo: 'pagamentos', centro: 'Rhuan Financeiro', categoria: 'Financeiro', mes: 11, ano: 2026, valor: 5000, observacao: 'TESTE MCP' })
    const o = await um('controle_orcamento', q => q.eq('empresa', 'Rhuan Financeiro').eq('categoria', 'Financeiro').eq('mes', 11).eq('ano', 2026)); assert.equal(Number(o.valor_orcamento), 5000)
  })
  await passo('orçamento: lançar (centro de teste, 11/2026)', async () => {
    await exec('lancar_orcamento', { modulo: 'pagamentos', centro: centroT, categoria: 'Financeiro', mes: 11, ano: 2026, valor: 5000 })
    await um('controle_orcamento', q => q.eq('empresa', centroT).eq('categoria', 'Financeiro').eq('mes', 11).eq('ano', 2026))
  })

  // ---- requisição e pedido ----
  await passo('requisição: criar', async () => {
    const t = await exec('criar_requisicao', { modulo: 'pagamentos', centro: 'Rhuan Financeiro', categoria: 'Financeiro', descricao: `TESTE MCP ${T} requisição` })
    ctx.req = num(t, /requisição #(\d+)/); assert.match(t, /\/anexar\//, 'faltou o link de upload no resultado')
    assert.equal((await um('requisicoes', q => q.eq('id', ctx.req))).status, 'Aguardando Autorização')
  })
  await passo('requisição: autorizar', async () => {
    await exec('decidir_requisicao', { modulo: 'pagamentos', id: ctx.req, decisao: 'autorizar' })
    const r = await um('requisicoes', q => q.eq('id', ctx.req)); assert.equal(r.status, 'Autorizado'); assert.equal(r.usuario_autorizador, u.username)
  })
  await passo('pedido: criar com a requisição (e link de upload no resultado)', async () => {
    const t = await exec('criar_pedido', { modulo: 'pagamentos', centro: 'Rhuan Financeiro', categoria: 'Financeiro', parte: nomeForn, periodos: [{ mes: 11, ano: 2026, valor: 100 }], observacao: `TESTE MCP ${T}`, requisicao_id: ctx.req })
    ctx.ped = num(t, /pedido #(\d+)/); ctx.link = t.match(/https?:\/\/\S+\/anexar\/[\w.-]+/)?.[0].replace(/^https?:\/\/[^/]+/, B); assert.ok(ctx.link, 'faltou o link de upload')
    const p = await um('pedidos_solicitados', q => q.eq('id', ctx.ped)); assert.equal(p.status, 'Aguardando Autorização'); assert.equal(Number(p.valor_pedido), 100); assert.equal(p.requisicao_id, ctx.req); assert.equal(p.usuario_solicitante, u.username)
    const fl = (await db.from('pedidos_solicitados_fluxo').select('*').eq('pedido_id', ctx.ped)).data; assert.equal(fl.length, 1); assert.equal(fl[0].fornecedor_beneficiario, nomeForn)
    const o = await um('controle_orcamento', q => q.eq('empresa', 'Rhuan Financeiro').eq('categoria', 'Financeiro').eq('mes', 11).eq('ano', 2026)); assert.equal(Number(o.valor_pedidos_solicitados), 100)
  })
  await passo('pedido: a mesma requisição não vale para outro pedido', async () => {
    const r = await chamar('criar_pedido', { modulo: 'pagamentos', centro: 'Rhuan Financeiro', categoria: 'Financeiro', parte: nomeForn, periodos: [{ mes: 11, ano: 2026, valor: 10 }], observacao: `TESTE MCP ${T}`, requisicao_id: ctx.req, confirmar: true })
    assert.ok(r.erro && /já foi usada/.test(r.texto), r.texto)
  })
  await passo('pedido: anexar PDF pelo link da criação', async () => {
    const fd = new FormData(); fd.append('file', new File([pdf], 'teste-mcp.pdf', { type: 'application/pdf' }))
    const r = await fetch(`${B}/api/anexar/${ctx.link.split('/anexar/')[1]}`, { method: 'POST', body: fd }); assert.equal(r.status, 200, await r.text())
    const d = await um('documentos', q => q.eq('pedido_id', ctx.ped)); assert.equal(d.nome_documento, 'teste-mcp.pdf')
    assert.match((await chamar('listar_documentos', { modulo: 'pagamentos', alvo: 'pedido', id: ctx.ped })).texto, /teste-mcp\.pdf/)
  })
  await passo('comentário', async () => {
    await exec('adicionar_comentario', { modulo: 'pagamentos', pedido_id: ctx.ped, comentario: 'TESTE MCP comentário' })
    const c = (await db.from('comentarios').select('comentario, usuario').eq('pedido_id', ctx.ped)).data; assert.ok(c.some(x => x.comentario === 'TESTE MCP comentário' && x.usuario === u.username))
  })
  await passo('pedido: pedir ajuste', async () => {
    await exec('pedir_ajuste', { modulo: 'pagamentos', id: ctx.ped, comentario: 'TESTE MCP ajuste' })
    assert.equal((await um('pedidos_solicitados', q => q.eq('id', ctx.ped))).status, 'Aguardando Ajuste')
  })
  await passo('pedido: ajustar (valor e observação) e reenviar', async () => {
    await exec('ajustar_pedido', { modulo: 'pagamentos', pedido_id: ctx.ped, observacao: `TESTE MCP ${T} ajustado`, periodos: [{ mes: 11, ano: 2026, valor: 120 }], reenviar: true })
    const p = await um('pedidos_solicitados', q => q.eq('id', ctx.ped)); assert.equal(p.status, 'Aguardando Autorização'); assert.equal(Number(p.valor_pedido), 120); assert.equal(p.ajuste_reenviado, true)
    const fl = (await db.from('pedidos_solicitados_fluxo').select('*').eq('pedido_id', ctx.ped)).data; assert.equal(fl.length, 1); assert.equal(Number(fl[0].valor_referente), 120); assert.equal(fl[0].status, 'Aguardando Autorização')
    const cm = (await db.from('comentarios').select('comentario').eq('pedido_id', ctx.ped)).data.map(x => x.comentario).join('\n'); assert.match(cm, /Alterações no pedido/); assert.match(cm, /reenviado/)
    const o = await um('controle_orcamento', q => q.eq('empresa', 'Rhuan Financeiro').eq('categoria', 'Financeiro').eq('mes', 11).eq('ano', 2026)); assert.equal(Number(o.valor_pedidos_solicitados), 120)
  })
  await passo('pedido: autorizar (cria a conta a pagar)', async () => {
    await exec('decidir_pedido', { modulo: 'pagamentos', id: ctx.ped, decisao: 'autorizar' })
    assert.equal((await um('pedidos_solicitados', q => q.eq('id', ctx.ped))).status, 'Autorizado')
    const cs = (await db.from('controle_pagamentos').select('*').eq('pedido_id', ctx.ped)).data; assert.equal(cs.length, 1); assert.equal(Number(cs[0].valor_pagar), 120); assert.equal(cs[0].status_pagamento, 1); ctx.conta = cs[0].id
  })

  // ---- contas ----
  await passo('conta: parcela acima do valor do pedido é barrada', async () => {
    const r = await chamar('adicionar_conta', { modulo: 'pagamentos', pedido_id: ctx.ped, data_vencimento: '2026-12-20', valor: 50, tipo: 'PIX', confirmar: true }); assert.ok(r.erro, 'deveria barrar: ' + r.texto)
    assert.equal((await db.from('controle_pagamentos').select('id').eq('pedido_id', ctx.ped)).data.length, 1)
  })
  await passo('conta: reduzir a parcela e adicionar outra', async () => {
    await exec('atualizar_conta', { modulo: 'pagamentos', conta_id: ctx.conta, valor_pagar: 70, data_vencimento: '2026-12-10', tipo: 'Boleto' })
    const c = await um('controle_pagamentos', q => q.eq('id', ctx.conta)); assert.equal(Number(c.valor_pagar), 70); assert.equal(c.data_vencimento, '2026-12-10'); assert.equal(c.tipo_pagamento, 3)
    await exec('adicionar_conta', { modulo: 'pagamentos', pedido_id: ctx.ped, data_vencimento: '2026-12-20', valor: 50, tipo: 'PIX' })
    const cs = (await db.from('controle_pagamentos').select('valor_pagar, status_pagamento').eq('pedido_id', ctx.ped)).data; assert.equal(cs.length, 2); assert.equal(cs.reduce((a, x) => a + Number(x.valor_pagar), 0), 120)
  })
  await passo('conta: registrar pagamento', async () => {
    await exec('registrar_pagamento', { modulo: 'pagamentos', conta_id: ctx.conta, data: '2026-11-23', valor: 70 })
    const c = await um('controle_pagamentos', q => q.eq('id', ctx.conta)); assert.equal(Number(c.valor_pagamento), 70); assert.equal(c.data_pagamento, '2026-11-23'); assert.equal(c.status_pagamento, 3)
    assert.match((await chamar('listar_contas', { modulo: 'pagamentos', pedido_id: ctx.ped })).texto, /Quitado/)
  })
  await passo('conta: desfazer pagamento', async () => {
    await exec('atualizar_conta', { modulo: 'pagamentos', conta_id: ctx.conta, limpar_pagamento: true })
    const c = await um('controle_pagamentos', q => q.eq('id', ctx.conta)); assert.equal(c.valor_pagamento, null); assert.equal(c.data_pagamento, null); assert.equal(c.status_pagamento, 1)
  })

  // ---- comprovante, boleto e importação de extrato por link ----
  const linkDe = t => t.match(/https?:\/\/\S+\/anexar\/[\w.-]+/)?.[0].replace(/^https?:\/\/[^/]+/, B)
  const enviar = async (link, nomeArq, conteudo, tipo) => {
    const fd = new FormData(); fd.append('file', new File([conteudo], nomeArq, { type: tipo }))
    const r = await fetch(`${B}/api/anexar/${link.split('/anexar/')[1]}`, { method: 'POST', body: fd }); return { status: r.status, corpo: await r.json() }
  }
  await passo('comprovante: link, upload e gatilhos do banco', async () => {
    const link = linkDe((await chamar('anexar_documento', { modulo: 'pagamentos', alvo: 'comprovante', id: ctx.conta })).texto); assert.ok(link)
    const r = await enviar(link, 'comprovante-teste.pdf', pdf, 'application/pdf'); assert.equal(r.status, 200, JSON.stringify(r.corpo)); assert.match(r.corpo.info, /comprovante anexado/)
    const d = await um('documentos', q => q.eq('pagamento_id', ctx.conta).eq('tipo_documento', -2)); assert.equal(d.pedido_id, ctx.ped)
    const c = await um('controle_pagamentos', q => q.eq('id', ctx.conta)); assert.equal(c.tem_comprovante, true); assert.ok(c.anexo_id, 'o gatilho deveria copiar o anexo para a conta')
    assert.match((await chamar('listar_documentos', { modulo: 'pagamentos', alvo: 'conta', id: ctx.conta })).texto, /Comprovante de Pagamento/)
  })
  await passo('boleto: conta que não é do tipo Boleto é recusada', async () => {
    const outra = (await db.from('controle_pagamentos').select('id, tipo_pagamento').eq('pedido_id', ctx.ped)).data.find(c => c.tipo_pagamento !== 3); assert.ok(outra)
    const link = linkDe((await chamar('anexar_documento', { modulo: 'pagamentos', alvo: 'boleto', id: outra.id })).texto)
    const r = await enviar(link, 'boleto-teste.pdf', pdf, 'application/pdf'); assert.equal(r.status, 422); assert.match(r.corpo.error, /tipo Boleto/)
    const inf = await chamar('informar_boleto', { modulo: 'pagamentos', conta_id: outra.id, codigo_barras: '00190500954014481606906809350314337370000000100', confirmar: true }); assert.ok(inf.erro && /tipo Boleto/.test(inf.texto), inf.texto)
  })
  await passo('boleto: código inválido recusado e código válido gravado', async () => {
    assert.ok((await chamar('informar_boleto', { modulo: 'pagamentos', conta_id: ctx.conta, codigo_barras: '123', confirmar: true })).erro)
    assert.ok((await chamar('informar_boleto', { modulo: 'pagamentos', conta_id: ctx.conta, codigo_barras: '00190500954014481606906809350314337370000000101', confirmar: true })).erro, 'DV errado deveria ser recusado')
    await exec('informar_boleto', { modulo: 'pagamentos', conta_id: ctx.conta, codigo_barras: '00190.50095 40144.816069 06809.350314 3 37370000000100' })
    const doc = await um('documentos', q => q.eq('pagamento_id', ctx.conta).eq('tipo_documento', 4))
    const info = (await db.from('informacoes_boleto').select('codigo_barras').eq('boleto_id', doc.id)).data; assert.equal(info.length, 1); assert.equal(info[0].codigo_barras, '00190500954014481606906809350314337370000000100')
    assert.match((await chamar('listar_documentos', { modulo: 'pagamentos', alvo: 'conta', id: ctx.conta })).texto, /boleto: código 0019050095/)
  })
  await passo('boleto: PDF por link reaproveita o documento (não duplica)', async () => {
    const link = linkDe((await chamar('anexar_documento', { modulo: 'pagamentos', alvo: 'boleto', id: ctx.conta })).texto)
    const r = await enviar(link, 'boleto-teste.pdf', pdf, 'application/pdf'); assert.equal(r.status, 200, JSON.stringify(r.corpo)); assert.match(r.corpo.info, /boleto anexado/)
    const docs = (await db.from('documentos').select('id, nome_documento').eq('pagamento_id', ctx.conta).eq('tipo_documento', 4)).data; assert.equal(docs.length, 1); assert.equal(docs[0].nome_documento, 'boleto-teste.pdf')
  })
  await passo('extrato: importar OFX por link, duplicado recusado, ver_extrato', async () => {
    const ofx = `OFXHEADER:100\n<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><BANKACCTFROM><ACCTID>TESTEMCP${T}</ACCTID></BANKACCTFROM><BANKTRANLIST><DTSTART>20261101</DTSTART><DTEND>20261130</DTEND>` +
      `<STMTTRN><TRNTYPE>DEBIT</TRNTYPE><DTPOSTED>20261123</DTPOSTED><TRNAMT>-33.33</TRNAMT><FITID>T1</FITID><MEMO>TESTE MCP OFX UM</MEMO></STMTTRN>` +
      `<STMTTRN><TRNTYPE>CREDIT</TRNTYPE><DTPOSTED>20261124</DTPOSTED><TRNAMT>44.44</TRNAMT><FITID>T2</FITID><MEMO>TESTE MCP OFX DOIS</MEMO></STMTTRN></BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`
    const link = linkDe((await chamar('importar_extrato', {})).texto); assert.ok(link)
    const nomeArq = `TESTE MCP ${T}.ofx`
    const r = await enviar(link, nomeArq, ofx, 'application/x-ofx'); assert.equal(r.status, 200, JSON.stringify(r.corpo)); assert.match(r.corpo.info, /2 lançamento/)
    const ex = await um('extratos_bancarios', q => q.eq('nome_arquivo', nomeArq)); assert.equal(ex.conta, `TESTEMCP${T}`)
    assert.equal((await db.from('extratos_bancarios_lancamentos').select('id').eq('extrato_id', ex.id)).data.length, 2)
    const dup = await enviar(link, `TESTE MCP ${T} 2.ofx`, ofx, 'application/x-ofx'); assert.equal(dup.status, 422); assert.match(dup.corpo.error, /já foi enviado/)
    const naoExtrato = await enviar(link, 'x.pdf', pdf, 'application/pdf'); assert.equal(naoExtrato.status, 422)
    const ver = (await chamar('ver_extrato', { extrato_id: ex.id })).texto; assert.match(ver, /2 linhas/); assert.match(ver, /TESTE MCP OFX UM/)
  })

  // ---- alterar contas em lote ----
  await passo('lote: status e vencimento de várias contas, recusa de id inexistente', async () => {
    const contas = (await db.from('controle_pagamentos').select('id').eq('pedido_id', ctx.ped).order('id')).data.map(c => c.id); assert.equal(contas.length, 2)
    const ruim = await chamar('atualizar_contas_em_lote', { modulo: 'pagamentos', conta_ids: [...contas, 999999999], status: 'Pago', confirmar: true }); assert.ok(ruim.erro, 'id inexistente deveria recusar tudo')
    assert.ok((await db.from('controle_pagamentos').select('status_pagamento').in('id', contas)).data.every(c => c.status_pagamento === 1), 'nada pode mudar quando recusa')
    assert.match((await chamar('atualizar_contas_em_lote', { modulo: 'pagamentos', conta_ids: contas, status: 'Pago' })).texto, /sem data\/valor de pagamento/)
    await exec('atualizar_contas_em_lote', { modulo: 'pagamentos', conta_ids: contas, status: 'Enviado para o banco', data_vencimento: '2026-12-28' })
    const r = (await db.from('controle_pagamentos').select('status_pagamento, data_vencimento').in('id', contas)).data; assert.ok(r.every(c => c.status_pagamento === 2 && c.data_vencimento === '2026-12-28'))
    await exec('atualizar_contas_em_lote', { modulo: 'pagamentos', conta_ids: contas, status: 'À Pagar' })
    assert.ok((await db.from('controle_pagamentos').select('status_pagamento').in('id', contas)).data.every(c => c.status_pagamento === 1))
  })

  // ---- requisição atendida sem pedido ----
  await passo('requisição: atendida sem pedido (autoriza junto), bloqueio de pedido, desfazer', async () => {
    const t = await exec('criar_requisicao', { modulo: 'pagamentos', centro: 'Rhuan Financeiro', categoria: 'Financeiro', descricao: `TESTE MCP ${T} atendida` }); const rid = num(t, /requisição #(\d+)/)
    await exec('marcar_requisicao_atendida', { modulo: 'pagamentos', id: rid, observacao: 'TESTE MCP resolvida por fora' })
    const r = await um('requisicoes', q => q.eq('id', rid)); assert.equal(r.status, 'Autorizado'); assert.equal(r.atendida_sem_pedido, true); assert.equal(r.atendida_usuario, u.username); assert.equal(r.atendida_obs, 'TESTE MCP resolvida por fora')
    assert.ok((await chamar('marcar_requisicao_atendida', { modulo: 'pagamentos', id: rid, confirmar: true })).erro, 'já atendida deve ser recusada')
    const ped = await chamar('criar_pedido', { modulo: 'pagamentos', centro: 'Rhuan Financeiro', categoria: 'Financeiro', parte: nomeForn, periodos: [{ mes: 11, ano: 2026, valor: 10 }], observacao: `TESTE MCP ${T}`, requisicao_id: rid, confirmar: true })
    assert.ok(ped.erro, 'requisição atendida não pode gerar pedido')
    assert.ok((await chamar('listar_requisicoes', { modulo: 'pagamentos', situacao: 'autorizadas_sem_pedido' })).texto.indexOf(`#${rid} `) === -1, 'atendida não deve aparecer como disponível')
    await exec('desfazer_requisicao_atendida', { modulo: 'pagamentos', id: rid })
    const d = await um('requisicoes', q => q.eq('id', rid)); assert.equal(d.atendida_sem_pedido, false); assert.equal(d.status, 'Autorizado'); assert.equal(d.atendida_usuario, null)
    const usada = await chamar('marcar_requisicao_atendida', { modulo: 'pagamentos', id: ctx.req, confirmar: true }); assert.ok(usada.erro, 'requisição com pedido não pode ser marcada: ' + usada.texto)
  })

  // ---- excluir documento, fornecedor, cliente e conta bancária ----
  await passo('documento: excluir comprovante (gatilho limpa a conta) e boleto (apaga o que foi lido)', async () => {
    const lista = (await chamar('listar_documentos', { modulo: 'pagamentos', alvo: 'conta', id: ctx.conta })).texto
    const idComp = num(lista, /- #(\d+) comprovante-teste\.pdf/), idBol = num(lista, /- #(\d+) boleto-teste\.pdf/)
    const prev = (await chamar('excluir_documento', { modulo: 'pagamentos', documento_id: idComp })).texto; assert.match(prev, /Nada foi feito/)
    assert.equal((await db.from('documentos').select('id').eq('id', idComp)).data.length, 1)
    await exec('excluir_documento', { modulo: 'pagamentos', documento_id: idComp })
    assert.equal((await db.from('documentos').select('id').eq('id', idComp)).data.length, 0)
    const c = await um('controle_pagamentos', q => q.eq('id', ctx.conta)); assert.ok(!c.tem_comprovante && !c.anexo_id, 'a conta deveria perder o comprovante')
    await exec('excluir_documento', { modulo: 'pagamentos', documento_id: idBol })
    assert.equal((await db.from('documentos').select('id').eq('id', idBol)).data.length, 0)
    assert.equal((await db.from('informacoes_boleto').select('id').eq('boleto_id', idBol)).data.length, 0, 'dados do boleto deveriam sair junto')
  })
  await passo('fornecedor e cliente: em uso é recusado, sem uso é excluído', async () => {
    const emUso = await chamar('excluir_parceiro', { tipo: 'fornecedor', id: ctx.forn, confirmar: true }); assert.ok(emUso.erro && /está em/.test(emUso.texto), emUso.texto)
    assert.equal((await db.from('fornecedores').select('id').eq('id', ctx.forn)).data.length, 1)
    await exec('salvar_parceiro', { tipo: 'fornecedor', nome: `TESTE MCP FORN DEL ${T}` }); const f = await um('fornecedores', q => q.eq('nome', `TESTE MCP FORN DEL ${T}`))
    await exec('excluir_parceiro', { tipo: 'fornecedor', id: f.id }); assert.equal((await db.from('fornecedores').select('id').eq('id', f.id)).data.length, 0)
    await exec('salvar_parceiro', { tipo: 'cliente', nome: `TESTE MCP CLI DEL ${T}` }); const c = await um('clientes', q => q.eq('nome', `TESTE MCP CLI DEL ${T}`))
    await exec('excluir_parceiro', { tipo: 'cliente', id: c.id }); assert.equal((await db.from('clientes').select('id').eq('id', c.id)).data.length, 0)
  })
  await passo('conta bancária: excluir', async () => {
    await exec('salvar_conta_bancaria', { nome_empresa: `TESTE MCP CONTA DEL ${T}` }); const c = await um('conta_pagador', q => q.eq('nome_empresa', `TESTE MCP CONTA DEL ${T}`))
    assert.match((await chamar('excluir_conta_bancaria', { id: c.id })).texto, /Nada foi feito/)
    await exec('excluir_conta_bancaria', { id: c.id }); assert.equal((await db.from('conta_pagador').select('id').eq('id', c.id)).data.length, 0)
  })

  // ---- lançar conta direto (fluxo 3): troca o fluxo do DEV só durante estes passos e restaura ----
  const cfgOrig = (await db.from('config').select('id, chave, valor').eq('projeto_id', PID).in('chave', ['fluxo_sistema', 'fluxo_sistema_receita'])).data
  const trocarFluxo = async v => { for (const c of cfgOrig) await db.from('config').update({ valor: v }).eq('id', c.id) }
  const restaurarFluxo = async () => { for (const c of cfgOrig) await db.from('config').update({ valor: c.valor }).eq('id', c.id) }
  ctx.restaurarFluxo = restaurarFluxo
  await passo('lançar conta: recusado fora do fluxo 3', async () => {
    const r = await chamar('lancar_conta', { modulo: 'pagamentos', centro: 'Rhuan Financeiro', categoria: 'Financeiro', parte: nomeForn, valor: 80, tipo: 'PIX', confirmar: true }); assert.ok(r.erro && /fluxo 3/.test(r.texto), r.texto)
  })
  await passo('lançar conta direto: pagamentos e recebimentos (fluxo 3), com excluir conta', async () => {
    await trocarFluxo('3')
    const t = await exec('lancar_conta', { modulo: 'pagamentos', centro: 'Rhuan Financeiro', categoria: 'Financeiro', parte: nomeForn, valor: 80, data_vencimento: '2026-12-05', tipo: 'pix', observacao: `TESTE MCP ${T} conta direta` })
    const pid = num(t, /pedido #(\d+)/), cid = num(t, /conta #(\d+)/)
    const p = await um('pedidos_solicitados', q => q.eq('id', pid)); assert.equal(p.status, 'Autorizado'); assert.equal(p.usuario_autorizador, u.username); assert.equal(Number(p.valor_pedido), 80)
    const c = await um('controle_pagamentos', q => q.eq('id', cid)); assert.equal(c.pedido_id, pid); assert.equal(Number(c.valor_pagar), 80); assert.equal(c.status_pagamento, 1); assert.equal(c.tipo_pagamento, 1); assert.equal(c.data_vencimento, '2026-12-05')
    assert.equal((await db.from('pedidos_solicitados_fluxo').select('id').eq('pedido_id', pid)).data.length, 0, 'fluxo 3 não tem cronograma')
    assert.match((await chamar('listar_contas', { modulo: 'pagamentos', pedido_id: pid })).texto, new RegExp(`conta #${cid} `))
    await exec('criar_categoria', { modulo: 'recebimentos', centro: centroT, categoria: 'RECEITA DIRETA' })
    const tr = await exec('lancar_conta', { modulo: 'recebimentos', centro: centroT, categoria: 'RECEITA DIRETA', parte: nomeCli, valor: 55.5, tipo: 'Boleto', observacao: `TESTE MCP ${T} receber direto` })
    const pr = num(tr, /pedido #(\d+)/), cr = num(tr, /conta #(\d+)/)
    assert.equal((await um('pedidos_solicitados_receita', q => q.eq('id', pr))).status, 'Autorizado')
    const crow = await um('controle_recebimento', q => q.eq('id', cr)); assert.equal(Number(crow.valor_pagar), 55.5); assert.equal(crow.tipo_recebimento, 3); assert.equal(crow.status_recebimento, 1)
    // excluir conta: com pagamento registrado o resumo avisa; depois exclui
    await exec('registrar_pagamento', { modulo: 'pagamentos', conta_id: cid, data: '2026-11-23' })
    const av = (await chamar('excluir_conta', { modulo: 'pagamentos', conta_id: cid })).texto; assert.match(av, /ATENÇÃO.*pagamento registrado/)
    assert.equal((await db.from('controle_pagamentos').select('id').eq('id', cid)).data.length, 1, 'a prévia não pode excluir')
    await exec('excluir_conta', { modulo: 'pagamentos', conta_id: cid }); assert.equal((await db.from('controle_pagamentos').select('id').eq('id', cid)).data.length, 0)
    assert.equal((await db.from('pedidos_solicitados').select('id').eq('id', pid)).data.length, 1, 'o pedido continua')
    await exec('excluir_conta', { modulo: 'recebimentos', conta_id: cr }); assert.equal((await db.from('controle_recebimento').select('id').eq('id', cr)).data.length, 0)
  })
  await passo('fluxo do DEV restaurado', async () => {
    await restaurarFluxo()
    const agora = (await db.from('config').select('id, valor').eq('projeto_id', PID).in('chave', ['fluxo_sistema', 'fluxo_sistema_receita'])).data
    for (const c of cfgOrig) assert.equal(agora.find(x => x.id === c.id).valor, c.valor)
  })

  // ---- conciliação (extrato fictício só do teste) ----
  await passo('conciliação: vincular, recusar valor errado, grupo de contas e desvincular', async () => {
    const ex = (await db.from('extratos_bancarios').insert({ projeto_id: PID, conta: 'TESTE MCP', periodo_inicio: '2026-11-01', periodo_fim: '2026-11-30', saldo_inicial: 0, saldo_final: 0, formato_origem: 'csv', nome_arquivo: `TESTE MCP ${T}.csv`, usuario: u.username }).select('id').single())
    assert.ok(ex.data, ex.error?.message)
    const ls = (await db.from('extratos_bancarios_lancamentos').insert([
      { extrato_id: ex.data.id, data: '2026-11-23', descricao: 'TESTE MCP PIX 70', valor: -70, saldo_apos: 0, codigo_origem: 'TESTE1' },
      { extrato_id: ex.data.id, data: '2026-11-23', descricao: 'TESTE MCP FOLHA 120', valor: -120, saldo_apos: 0, codigo_origem: 'TESTE2' },
    ]).select('id, valor')).data
    const lA = ls.find(l => Number(l.valor) === -70).id, lB = ls.find(l => Number(l.valor) === -120).id
    const contas = (await db.from('controle_pagamentos').select('id, valor_pagar').eq('pedido_id', ctx.ped).order('id')).data
    const c70 = contas.find(c => Number(c.valor_pagar) === 70).id, c50 = contas.find(c => Number(c.valor_pagar) === 50).id
    assert.match((await chamar('ver_extrato', { extrato_id: ex.data.id })).texto, new RegExp(`linha #${lA} .*candidatas: conta #${c70}`))
    assert.match((await chamar('listar_extratos', {})).texto, new RegExp(`extrato #${ex.data.id} `))
    const errado = await chamar('vincular_extrato', { lancamento_id: lA, conta_ids: [c50], confirmar: true }); assert.ok(errado.erro, 'valor diferente deveria ser recusado')
    await exec('vincular_extrato', { lancamento_id: lA, conta_ids: [c70] })
    assert.equal((await um('controle_pagamentos', q => q.eq('id', c70))).extrato_lancamento_id, lA)
    const jaVinc = await chamar('vincular_extrato', { lancamento_id: lB, conta_ids: [c70, c50], confirmar: true }); assert.ok(jaVinc.erro, 'conta já vinculada deveria ser recusada')
    await exec('desvincular_extrato', { lancamento_id: lA })
    assert.equal((await um('controle_pagamentos', q => q.eq('id', c70))).extrato_lancamento_id, null)
    // folha/rateio: as contas do grupo são as pagas no dia da linha
    await exec('registrar_pagamento', { modulo: 'pagamentos', conta_id: c70, data: '2026-11-23', valor: 70 })
    await exec('registrar_pagamento', { modulo: 'pagamentos', conta_id: c50, data: '2026-11-23', valor: 50 })
    const cpl = (await chamar('contas_para_linha', { lancamento_id: lB })).texto
    assert.match(cpl, new RegExp(`conta #${c70}`)); assert.match(cpl, new RegExp(`conta #${c50}`))
    await exec('vincular_extrato', { lancamento_id: lB, conta_ids: [c70, c50] })
    const g = (await db.from('controle_pagamentos').select('extrato_lancamento_id').in('id', [c70, c50])).data; assert.ok(g.every(x => x.extrato_lancamento_id === lB))
    await exec('desvincular_extrato', { lancamento_id: lB })
    assert.ok((await db.from('controle_pagamentos').select('extrato_lancamento_id').in('id', [c70, c50])).data.every(x => x.extrato_lancamento_id === null))
  })

  // ---- recebimentos (venda): tabelas e colunas diferentes das de pagamentos ----
  await passo('recebimentos: categoria, orçamento e pedido de venda', async () => {
    await exec('criar_categoria', { modulo: 'recebimentos', centro: centroT, categoria: 'RECEITA TESTE' })
    await exec('lancar_orcamento', { modulo: 'recebimentos', centro: centroT, categoria: 'RECEITA TESTE', mes: 11, ano: 2026, valor: 3000 })
    const t = await exec('criar_pedido', { modulo: 'recebimentos', centro: centroT, categoria: 'RECEITA TESTE', parte: nomeCli, periodos: [{ mes: 11, ano: 2026, valor: 200 }], observacao: `TESTE MCP ${T} venda` })
    ctx.pedR = num(t, /pedido #(\d+)/)
    const p = await um('pedidos_solicitados_receita', q => q.eq('id', ctx.pedR)); assert.equal(p.status, 'Aguardando Autorização'); assert.equal(p.cliente, nomeCli); assert.equal(Number(p.valor_pedido), 200)
    const fl = (await db.from('pedidos_solicitados_fluxo_receita').select('*').eq('pedido_id', ctx.pedR)).data; assert.equal(fl.length, 1); assert.equal(fl[0].cliente_beneficiario, nomeCli)
  })
  await passo('recebimentos: autorizar cria a conta a receber', async () => {
    await exec('decidir_pedido', { modulo: 'recebimentos', id: ctx.pedR, decisao: 'autorizar' })
    const cs = (await db.from('controle_recebimento').select('*').eq('pedido_id', ctx.pedR)).data; assert.equal(cs.length, 1); assert.equal(Number(cs[0].valor_pagar), 200); ctx.contaR = cs[0].id
  })
  await passo('recebimentos: listar e registrar recebimento', async () => {
    assert.match((await chamar('listar_contas', { modulo: 'recebimentos', pedido_id: ctx.pedR })).texto, new RegExp(`conta #${ctx.contaR} `))
    await exec('registrar_pagamento', { modulo: 'recebimentos', conta_id: ctx.contaR, data: '2026-11-23' })
    const c = await um('controle_recebimento', q => q.eq('id', ctx.contaR)); assert.equal(Number(c.valor_pagamento), 200); assert.equal(c.status_recebimento, 3)
  })
  await passo('recebimentos: comentar e cancelar', async () => {
    await exec('adicionar_comentario', { modulo: 'recebimentos', pedido_id: ctx.pedR, comentario: 'TESTE MCP comentário venda' })
    await exec('cancelar_pedido', { modulo: 'recebimentos', pedido_id: ctx.pedR })
    assert.equal((await um('pedidos_solicitados_receita', q => q.eq('id', ctx.pedR))).status, 'Cancelado')
  })

  // ---- realocação ----
  await passo('realocação: solicitar 50/50 (e autorizar, se ficar pendente)', async () => {
    const t = await exec('solicitar_realocacao', { modulo: 'pagamentos', pedido_id: ctx.ped, modo: 'percentual', destinos: [{ centro: 'Rhuan Financeiro', percentual: 50 }, { centro: centroT, percentual: 50 }], observacao: 'TESTE MCP' })
    const r = (await db.from('realocacoes').select('*').eq('projeto_id', PID).eq('pedido_id', ctx.ped)).data; assert.equal(r.length, 1, 'realocação não registrada')
    if (/aguardando autorização/i.test(t) && r[0].status === 'Aguardando Autorização') {
      assert.match((await chamar('listar_realocacoes', {})).texto, new RegExp(`realocação #${r[0].id}`))
      await exec('decidir_realocacao', { id: r[0].id, decisao: 'autorizar' })
      assert.equal((await um('realocacoes', q => q.eq('id', r[0].id))).status, 'Autorizada')
    }
    const fl = (await db.from('pedidos_solicitados_fluxo').select('empresa, valor_referente').eq('pedido_id', ctx.ped)).data
    const por = {}; for (const x of fl) por[x.empresa] = (por[x.empresa] ?? 0) + Number(x.valor_referente)
    assert.equal(por['Rhuan Financeiro'], 60); assert.equal(por[centroT], 60)
  })

  // ---- comentário com anexo, remessa, relatório de enviados e retorno do banco ----
  const linksDe = t => [...t.matchAll(/https?:\/\/\S+\/baixar\/[\w.-]+/g)].map(m => m[0].replace(/^https?:\/\/[^/]+/, B))
  const baixar = async link => { const r = await fetch(link); assert.equal(r.status, 200, `download ${r.status}`); return Buffer.from(await r.arrayBuffer()) }
  await passo('comentário com anexo: link, upload ligado ao comentário', async () => {
    const t = await exec('adicionar_comentario', { modulo: 'pagamentos', pedido_id: ctx.ped, comentario: 'TESTE MCP comentário com anexo', com_anexo: true })
    const link = linkDe(t); assert.ok(link, t)
    const com = (await db.from('comentarios').select('id').eq('pedido_id', ctx.ped).eq('comentario', 'TESTE MCP comentário com anexo')).data; assert.equal(com.length, 1)
    const r = await enviar(link, 'comentario-teste.pdf', pdf, 'application/pdf'); assert.equal(r.status, 200, JSON.stringify(r.corpo)); assert.match(r.corpo.info, /comentário/)
    const d = await um('documentos', q => q.eq('comentario_id', com[0].id)); assert.equal(d.pedido_id, ctx.ped); assert.equal(d.tipo_documento, -1); assert.equal(d.nome_documento, 'comentario-teste.pdf')
    const naoPdf = await enviar(link, 'x.ofx', 'abc', 'text/plain'); assert.equal(naoPdf.status, 422)
  })
  const seqAntes = (await db.from('controle_sequencial').select('valor').eq('projeto_id', PID).eq('tipo', 'remessa_cnab').maybeSingle()).data
  ctx.restaurarSeq = async () => { if (seqAntes) await db.from('controle_sequencial').update({ valor: seqAntes.valor }).eq('projeto_id', PID).eq('tipo', 'remessa_cnab'); else await db.from('controle_sequencial').delete().eq('projeto_id', PID).eq('tipo', 'remessa_cnab') }
  const inicioArquivos = new Date().toISOString()
  ctx.limparArquivos = async () => { await db.from('documentos').delete().eq('projeto_id', PID).is('pedido_id', null).in('tipo_documento', [-3, -4, -5]).eq('usuario', u.username).gte('data_upload', inicioArquivos) }
  await passo('remessa: recusa conta sem boleto/fora de À Pagar e mostra prévia sem gravar', async () => {
    const cs = (await db.from('controle_pagamentos').select('id, valor_pagar').eq('pedido_id', ctx.ped)).data
    ctx.cBol = cs.find(c => Number(c.valor_pagar) === 70).id; ctx.cPix = cs.find(c => Number(c.valor_pagar) === 50).id
    for (const c of [ctx.cBol, ctx.cPix]) await exec('atualizar_conta', { modulo: 'pagamentos', conta_id: c, limpar_pagamento: true })
    ctx.contaBanco = (await um('conta_pagador', q => q.eq('nome_empresa', `TESTE MCP CONTA ${T}`))).id
    const semBoleto = await chamar('gerar_remessa', { conta_bancaria_id: ctx.contaBanco, contas: [ctx.cBol, ctx.cPix], confirmar: true }); assert.ok(semBoleto.erro && /boleto sem código/.test(semBoleto.texto), semBoleto.texto)
    assert.ok((await db.from('controle_pagamentos').select('status_pagamento').in('id', [ctx.cBol, ctx.cPix])).data.every(c => c.status_pagamento === 1))
    const inexistente = await chamar('gerar_remessa', { conta_bancaria_id: ctx.contaBanco, contas: [999999999] }); assert.ok(inexistente.erro)
    await exec('informar_boleto', { modulo: 'pagamentos', conta_id: ctx.cBol, codigo_barras: '00190.50095 40144.816069 06809.350314 3 37370000000100' })
    const prev = (await chamar('gerar_remessa', { conta_bancaria_id: ctx.contaBanco, contas: [ctx.cBol, ctx.cPix] })).texto; assert.match(prev, /Nada foi feito/); assert.match(prev, /2 pagamento/)
    assert.ok((await db.from('controle_pagamentos').select('status_pagamento').in('id', [ctx.cBol, ctx.cPix])).data.every(c => c.status_pagamento === 1), 'a prévia não pode alterar nada')
  })
  await passo('remessa: gerar, links do .REM e do PDF, contas viram Enviado para o banco', async () => {
    const t = await exec('gerar_remessa', { conta_bancaria_id: ctx.contaBanco, contas: [ctx.cBol, ctx.cPix] })
    const nomeRem = t.match(/CI240_001_\d+\.REM/)[0]; ctx.remessa = nomeRem
    const [linkRem, linkPdf] = linksDe(t); assert.ok(linkRem && linkPdf, t)
    const rem = (await baixar(linkRem)).toString('utf-8'); ctx.remTexto = rem
    const linhas = rem.split(/\r?\n/).filter(l => l.trim()); assert.ok(linhas.length >= 6 && linhas.every(l => l.length === 240), 'CNAB 240: todas as linhas com 240 posições')
    assert.ok(linhas.some(l => l[13] === 'A' && l.includes(String(ctx.cPix))) && linhas.some(l => l[13] === 'J' && l.includes(String(ctx.cBol))), 'segmentos A (PIX) e J (boleto)')
    assert.equal((await baixar(linkPdf)).subarray(0, 5).toString(), '%PDF-')
    const cs = (await db.from('controle_pagamentos').select('status_pagamento, remessa_arquivo, enviado_banco_em').in('id', [ctx.cBol, ctx.cPix])).data
    assert.ok(cs.every(c => c.status_pagamento === 2 && c.remessa_arquivo === nomeRem && c.enviado_banco_em), JSON.stringify(cs))
    assert.ok((await db.from('documentos').select('id').eq('projeto_id', PID).eq('nome_documento', nomeRem).eq('tipo_documento', -3)).data.length >= 1)
    const jaEnviada = await chamar('gerar_remessa', { conta_bancaria_id: ctx.contaBanco, contas: [ctx.cPix], confirmar: true }); assert.ok(jaEnviada.erro && /não está "À Pagar"/.test(jaEnviada.texto), jaEnviada.texto)
  })
  await passo('relatório de enviados: PDF do dia e dia sem envios', async () => {
    const t = (await chamar('relatorio_enviados', {})).texto; const n = num(t, /: (\d+) pagamento/); assert.ok(n >= 2, t)
    assert.equal((await baixar(linksDe(t)[0])).subarray(0, 5).toString(), '%PDF-')
    assert.match((await chamar('relatorio_enviados', { dia: '2020-01-01' })).texto, /Nenhum pagamento/)
    assert.ok((await chamar('relatorio_enviados', { dia: '2026-13-45' })).erro)
  })
  await passo('retorno do banco: link, upload, contas viram Pagas, duplicado e arquivo errado recusados', async () => {
    // retorno fictício: o próprio .REM com data/valor de efetivação e ocorrência "00" nos segmentos A e J
    const ret = ctx.remTexto.split(/\r?\n/).filter(l => l.trim()).map(l => {
      if (l[7] === '3' && l[13] === 'A') l = l.slice(0, 154) + '23112026' + '000000000005000' + l.slice(177)
      if (l[7] === '3' && (l[13] === 'A' || l[13] === 'J')) l = l.slice(0, 230) + '00'.padEnd(10) + l.slice(240)
      return l
    }).join('\r\n')
    const link = linkDe((await chamar('importar_retorno', {})).texto); assert.ok(link)
    const nomeRet = `TESTE MCP ${T}.ret`
    const naoRet = await enviar(link, 'x.pdf', pdf, 'application/pdf'); assert.equal(naoRet.status, 422)
    const r = await enviar(link, nomeRet, ret, 'text/plain'); assert.equal(r.status, 200, JSON.stringify(r.corpo)); assert.match(r.corpo.info, /2 pagamento\(s\) marcados como Pagos/)
    const cs = (await db.from('controle_pagamentos').select('id, status_pagamento, data_pagamento, valor_pagamento').in('id', [ctx.cBol, ctx.cPix])).data
    assert.ok(cs.every(c => c.status_pagamento === 3 && c.data_pagamento), JSON.stringify(cs))
    assert.equal(Number(cs.find(c => c.id === ctx.cPix).valor_pagamento), 50); assert.equal(cs.find(c => c.id === ctx.cPix).data_pagamento, '2026-11-23')
    const dup = await enviar(link, nomeRet, ret, 'text/plain'); assert.equal(dup.status, 422); assert.match(dup.corpo.error, /já foi importado/)
    const arqs = (await chamar('listar_arquivos_remessa', {})).texto; assert.ok(arqs.includes(ctx.remessa) && arqs.includes(nomeRet) && /baixar\//.test(arqs), arqs)
  })

  // ---- cancelar ----
  await passo('pedido: cancelar', async () => {
    await exec('cancelar_pedido', { modulo: 'pagamentos', pedido_id: ctx.ped })
    const p = await um('pedidos_solicitados', q => q.eq('id', ctx.ped)); assert.equal(p.cancelado, true); assert.equal(p.status, 'Cancelado')
    assert.ok((await db.from('pedidos_solicitados_fluxo').select('status').eq('pedido_id', ctx.ped)).data.every(x => x.status === 'Cancelado'))
  })

  // ---- estrutura (renomear/excluir) e orçamento de novo ----
  await passo('categoria: renomear e excluir', async () => {
    await exec('criar_categoria', { modulo: 'pagamentos', centro: centroT, categoria: 'CAT TESTE' })
    await exec('renomear_categoria', { modulo: 'pagamentos', centro: centroT, categoria: 'CAT TESTE', novo_nome: 'CAT TESTE 2' })
    await um('categorias', q => q.eq('empresa', centroT).eq('categoria', 'CAT TESTE 2'))
    await exec('excluir_categoria', { modulo: 'pagamentos', centro: centroT, categoria: 'CAT TESTE 2' })
    assert.equal((await db.from('categorias').select('id').eq('projeto_id', PID).eq('empresa', centroT).eq('categoria', 'CAT TESTE 2')).data.length, 0)
  })
  await passo('centro: renomear (referências acompanham)', async () => {
    const novo = `${centroT} REN`
    await exec('renomear_centro', { centro: centroT, novo_nome: novo })
    await um('empresas', q => q.eq('empresa', novo))
    assert.ok((await db.from('categorias').select('id').eq('projeto_id', PID).eq('empresa', novo)).data.length >= 1, 'categorias não acompanharam')
    assert.ok((await db.from('pedidos_solicitados_fluxo').select('id').eq('pedido_id', ctx.ped).eq('empresa', novo)).data.length >= 1, 'o cronograma do pedido não acompanhou')
  })
  await passo('orçamento: novo lançamento no mesmo período vale (último registro)', async () => {
    await exec('lancar_orcamento', { modulo: 'pagamentos', centro: 'Rhuan Financeiro', categoria: 'Financeiro', mes: 11, ano: 2026, valor: 6000 })
    const o = await um('controle_orcamento', q => q.eq('empresa', 'Rhuan Financeiro').eq('categoria', 'Financeiro').eq('mes', 11).eq('ano', 2026)); assert.equal(Number(o.valor_orcamento), 6000)
  })
} catch (e) {
  console.log('ERRO GERAL:', e.message)
} finally {
  console.log('\nlimpando dados de teste…')
  try { await ctx.restaurarFluxo?.() } catch (e) { console.log('ATENÇÃO: não consegui restaurar o fluxo do DEV:', e.message) }
  try { await ctx.restaurarSeq?.(); await ctx.limparArquivos?.() } catch (e) { console.log('ATENÇÃO: não consegui limpar remessa/sequencial:', e.message) }
  await limpar()
  const depois = await contar()
  const sobras = Object.keys(antes).filter(t => antes[t] !== depois[t]).map(t => `${t}: ${antes[t]} → ${depois[t]}`)
  console.log(sobras.length ? 'SOBRAS após a limpeza:\n  ' + sobras.join('\n  ') : 'banco do PROJETO DEV de volta ao estado de antes (contagens iguais)')
  parar()
  const falhas = resultados.filter(r => r[1] !== 'OK')
  console.log(`\n${resultados.length - falhas.length}/${resultados.length} passos OK`)
  for (const [n, r] of falhas) console.log(` - ${n}: ${r}`)
  process.exitCode = falhas.length ? 1 : 0
}
