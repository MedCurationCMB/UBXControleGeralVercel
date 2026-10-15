// node scripts/teste-cnab.mts   (GERAR_GOLDEN=1 regrava o arquivo de referencia)
// Remessa CNAB 240: entradas so com ASCII, entao a saida do layout PIX/boleto nao pode mudar.
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { generateCnabFile, type Company, type PixTx, type BoletoTx, type TributoTx } from '../src/lib/cnab240.ts'
import { linhaDigitavelParaCodigoBarras, dvTributoValido, ehTributo } from '../src/lib/boleto.ts'
import { parseRet } from '../src/lib/retornoCnab.ts'

const company: Company = {
  cnpj: '31169750000115', agencia: '1', agencia_dv: '9', conta: '123456', conta_dv: '7', nome_empresa: 'UBX ENGENHARIA E SERVICOS LTDA',
  rua: 'AV SEN VIRGILIO TAVORA', numero: '1701', complemento: 'SALA 1', cidade: 'FORTALEZA', cep: '60170', estado: 'CE', sequencial: '12',
}
const dia = new Date('2026-10-15T12:00:00')
const pix: PixTx = {
  tipo_pagamento: '1', data_pagamento: dia, valor_pagamento: 1234.56, doc_empresa: '101', forma_iniciacao: '03',
  tipo_doc_fav: '2', doc_fav: '11222333000144', chave_pix: '11222333000144',
}
const boleto: BoletoTx = {
  tipo_pagamento: '3', data_pagamento: dia, data_vencimento: new Date('2026-10-20T12:00:00'), valor_pagamento: 500, doc_empresa: '102',
  codigo_barras: '00191234500000050000000000000000000000000000', nome_beneficiario: 'FORNECEDOR TESTE', valor_nominal: 500,
  valor_desconto: 0, valor_mora: 0, nosso_numero: '777', beneficiario_tipo: 2, beneficiario_documento: '11222333000144',
  beneficiario_nome: 'FORNECEDOR TESTE LTDA', pagador_documento: company.cnpj, pagador_nome: company.nome_empresa, doc_empresa_adicional: '',
}

// a data/hora do header (colunas 144-157) muda a cada execucao
const semHora = (arq: string) => arq.split('\n').map((l, i) => (i === 0 ? l.slice(0, 143) + ' '.repeat(14) + l.slice(157) : l)).join('\n')
// a referencia foi gerada antes de numerar os lotes (todos 0001): compara sem o numero do lote
const semLote = (arq: string) => arq.split('\n').map(l => l.slice(0, 3) + '    ' + l.slice(7)).join('\n')
const fixture = new URL('./fixtures/cnab-pix-boleto.rem', import.meta.url)

const arq = generateCnabFile(company, [pix, boleto])
if (process.env.GERAR_GOLDEN) { writeFileSync(fixture, semHora(arq)); console.log('referencia gravada') }
else if (existsSync(fixture)) assert.equal(semLote(semHora(arq)), semLote(readFileSync(fixture, 'utf8')), 'PIX/boleto mudou em relacao a referencia')

// ── 1. acentos: o manual proibe, e em UTF-8 desalinhariam a linha de 240 ──
const comAcento: BoletoTx = { ...boleto, nome_beneficiario: 'JOÃO & CIA CONSTRUÇÕES', beneficiario_nome: 'AÇÚCAR ÉTICO LTDA', pagador_nome: 'UBX CONSTRUÇÃO' }
for (const l of generateCnabFile({ ...company, nome_empresa: 'UBX CONSTRUÇÃO LTDA' }, [pix, comAcento]).split('\n')) {
  assert.equal(Buffer.byteLength(l, 'utf8'), 240, `linha com ${Buffer.byteLength(l, 'utf8')} bytes: ${l.slice(0, 60)}`)
  assert.match(l, /^[\x20-\x7E]*$/, 'caractere fora de ASCII na remessa')
}

// ── 2. tributo (DAM de ISS de Fortaleza, codigos dos PDFs reais) ──
const dam = (linha48: string, doc: string, valor: number): TributoTx => {
  assert.ok(dvTributoValido(linha48), 'DV do DAM deveria ser valido')
  const cb = linhaDigitavelParaCodigoBarras(linha48)
  assert.equal(cb.length, 44); assert.ok(ehTributo(cb))
  return {
    tipo_pagamento: 'T', data_pagamento: new Date('2026-10-13T12:00:00'), data_vencimento: new Date('2026-10-13T12:00:00'),
    valor_pagamento: valor, doc_empresa: doc, codigo_barras: cb, nome_concessionaria: 'SEFIN FORTALEZA ISS', nosso_numero: '',
  }
}
const retido = dam('816500000079733816052027610138002023604526642680', '201', 773.38)
const proprio = dam('816000000264343516052028610138002023604526618607', '202', 2634.35)
assert.equal(retido.codigo_barras.slice(4, 15), '00000077338', 'valor embutido no codigo do DAM retido')
assert.equal(proprio.codigo_barras.slice(4, 15), '00000263435', 'valor embutido no codigo do DAM proprio')
assert.equal(dvTributoValido('816500000079733816052027610138002023604526642680'.replace('7338', '7339')), false, 'DV deveria pegar digito trocado')

const misto = generateCnabFile(company, [pix, boleto, retido, proprio]).split('\n')
assert.equal(misto.length, 14)
misto.forEach(l => assert.equal(l.length, 240))
assert.deepEqual(misto.filter(l => l[7] === '1').map(l => l.slice(3, 7)), ['0001', '0002', '0003'], 'lotes numerados em sequencia')
assert.deepEqual(misto.filter(l => l[7] === '1').map(l => l.slice(9, 13)), ['2045', '2031', '2211'], 'servico+forma: PIX 20/45, boleto 20/31, tributo 22/11')
const os = misto.filter(l => l[13] === 'O')
assert.equal(os.length, 2)
assert.deepEqual(os.map(l => l.slice(8, 13)), ['00001', '00002'], 'sequencial do registro dentro do lote do tributo')
const o = os[0]
assert.equal(o.slice(0, 3), '077'); assert.equal(o.slice(3, 7), '0003'); assert.equal(o[7], '3'); assert.equal(o.slice(14, 17), '000')
assert.equal(o.slice(17, 61), retido.codigo_barras)
assert.equal(o.slice(61, 91), 'SEFIN FORTALEZA ISS'.padEnd(30))
assert.equal(o.slice(91, 99), '13102026'); assert.equal(o.slice(99, 107), '13102026')
assert.equal(o.slice(107, 122), '000000000077338')
assert.equal(o.slice(122, 142), '201'.padEnd(20)); assert.equal(o.slice(142, 162), '0'.repeat(20))
assert.equal(o.slice(162).trim(), '')
const trailerTributo = misto.filter(l => l[7] === '5')[2]
assert.equal(trailerTributo.slice(17, 23), '000004', 'registros do lote: header + 2 O + trailer')
assert.equal(trailerTributo.slice(23, 41), String(Math.round((773.38 + 2634.35) * 100)).padStart(18, '0'))
assert.equal(misto[13].slice(17, 23), '000003', 'lotes no arquivo'); assert.equal(misto[13].slice(23, 29), '000014', 'registros no arquivo')

// ── 3. retorno: le A, J e O; a ocorrencia (colunas 231-240) decide boleto/tributo ──
const comOcorrencia = (l: string, oc: string) => l.slice(0, 230) + oc.padEnd(10)
const ret = (linhas: string[]) => parseRet(linhas.join('\n'))
const aPix = misto.find(l => l[13] === 'A')!, jBol = misto.find(l => l[13] === 'J' && l.slice(17, 19) !== '52')!
const efetivado = aPix.slice(0, 154) + '15102026' + '000000000123456' + aPix.slice(177)   // Inter preenche data/valor reais
const r1 = ret([comOcorrencia(efetivado, '00'), comOcorrencia(jBol, '00'), comOcorrencia(o, '00'), misto.find(l => l[13] === 'J' && l.slice(17, 19) === '52')!])
assert.equal(r1.length, 3, 'J-52 nao e pagamento')
assert.deepEqual(r1.map(r => r.status), ['Pago', 'Pago', 'Pago'])
assert.deepEqual(r1.map(r => parseInt(r.docEmpresa)), [101, 102, 201], 'a importacao acha o pagamento por parseInt (J vem com zeros a esquerda)')
assert.equal(r1[0].valorEfetivo, 1234.56); assert.equal(r1[2].valorNominal, 773.38)
const r2 = ret([comOcorrencia(jBol, 'HF'), comOcorrencia(o, 'AP'), comOcorrencia(aPix, 'PA')])
assert.deepEqual(r2.map(r => r.status), ['Não Pago', 'Não Pago', 'Não Pago'], 'recusa nao vira Pago so porque a data da remessa volta no registro')
assert.match(r2[0].motivo, /Saldo insuficiente/)
assert.equal(ret([comOcorrencia(jBol, '')])[0].status, 'Pago', 'J sem nenhuma ocorrencia cai na regra antiga (data preenchida)')
assert.equal(ret([comOcorrencia(jBol.slice(0, 144) + '00000000' + jBol.slice(152), '')])[0].status, 'Não Pago')

console.log('OK: PIX/boleto identicos a referencia; acentos; lotes e Segmento O (DAMs reais); retorno A/J/O')
