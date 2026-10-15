// Geracao do arquivo CNAB 240 de remessa de pagamentos (layout Inter, manual Manual_CNAB240_Pagamentos).

export function padN(value: string | number, length: number): string {
  const s = String(value).replace(/\D/g, '') || '0'
  return s.padStart(length, '0').slice(-length)
}

// O manual pede campos alfa sem acento nem caractere especial. O arquivo vai em UTF-8, entao um "C" cedilha
// ocuparia 2 bytes e desalinharia a linha de 240 posicoes.
const ascii = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\x20-\x7E]/g, ' ')
function padA(value: string | null | undefined, length: number): string {
  const s = ascii(String(value ?? '')).slice(0, length)
  return s.padEnd(length, ' ')
}

export interface Company {
  cnpj: string; agencia: string; agencia_dv: string
  conta: string; conta_dv: string; nome_empresa: string
  rua: string; numero: string; complemento: string
  cidade: string; cep: string; estado: string; sequencial: string
}

export interface PixTx {
  tipo_pagamento: '1'
  data_pagamento: Date; valor_pagamento: number; doc_empresa: string
  forma_iniciacao: string; tipo_doc_fav: string; doc_fav: string
  chave_pix: string; txid?: string; fav_ispb?: string
  fav_banco?: string; fav_agencia?: string; fav_agencia_dv?: string
  fav_conta?: string; fav_conta_dv?: string; fav_nome?: string
}

export interface BoletoTx {
  tipo_pagamento: '3'
  data_pagamento: Date; data_vencimento: Date; valor_pagamento: number; doc_empresa: string
  codigo_barras: string; nome_beneficiario: string; valor_nominal: number
  valor_desconto: number; valor_mora: number; nosso_numero: string
  beneficiario_tipo: number; beneficiario_documento: string; beneficiario_nome: string
  pagador_documento: string; pagador_nome: string; doc_empresa_adicional: string
}

// Tributo/convenio com codigo de barras (ex.: DAM de ISS). 'T' so existe aqui; no banco continua sendo tipo 3 (Boleto).
export interface TributoTx {
  tipo_pagamento: 'T'
  data_pagamento: Date; data_vencimento: Date; valor_pagamento: number; doc_empresa: string
  codigo_barras: string; nome_concessionaria: string; nosso_numero: string
}

export type Tx = PixTx | BoletoTx | TributoTx

function fmtDate(d: Date): string {
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const yyyy = String(d.getFullYear())
  return `${dd}${mm}${yyyy}`
}

function buildHeaderArquivo(c: Company): string {
  const now = new Date()
  const hoje = fmtDate(now)
  const hora = `${String(now.getHours()).padStart(2,'0')}${String(now.getMinutes()).padStart(2,'0')}${String(now.getSeconds()).padStart(2,'0')}`
  return (
    padN('077', 3) + padN('0000', 4) + '0' + ' '.repeat(9) +
    '2' + padN(c.cnpj, 14) + ' '.repeat(20) +
    padN(c.agencia, 5) + padA(c.agencia_dv, 1) +
    padN(c.conta, 12) + padN(c.conta_dv, 1) + ' ' +
    padA(c.nome_empresa, 30) + padA('BANCO INTER', 30) +
    ' '.repeat(10) + '1' + hoje + hora +
    padN(c.sequencial, 6) + padN('107', 3) + padN('01600', 5) +
    ' '.repeat(20) + ' '.repeat(20) + ' '.repeat(29)
  ).padEnd(240, ' ')
}

// servico/forma: PIX 20/45, boleto 20/31, tributo 22/11 (manual, notas 02 e secao 8.1)
function buildHeaderLote(c: Company, lote: number, servico: string, forma: string): string {
  return (
    padN('077', 3) + padN(lote, 4) + '1' + 'C' +
    padN(servico, 2) + padN(forma, 2) + padN('046', 3) + ' ' +
    '2' + padN(c.cnpj, 14) + ' '.repeat(20) +
    padN(c.agencia, 5) + padA(c.agencia_dv, 1) +
    padN(c.conta, 12) + padN(c.conta_dv, 1) + ' ' +
    padA(c.nome_empresa, 30) + padA('', 40) +
    padA(c.rua, 30) + padN(c.numero, 5) +
    padA(c.complemento, 15) + padA(c.cidade, 20) +
    padN(c.cep, 5) + ' '.repeat(3) + padA(c.estado, 2) +
    ' '.repeat(8) + ' '.repeat(10)
  ).padEnd(240, ' ')
}

function buildSegmentoAPix(t: PixTx, seq: number, lote: number): string {
  let fav = ''
  let idPagamento = ''
  if (t.forma_iniciacao === '05') {
    fav = padN(t.fav_banco ?? '', 3) + padN(t.fav_agencia ?? '', 5) +
          padA(t.fav_agencia_dv ?? '', 1) + padN(t.fav_conta ?? '', 12) +
          padA(t.fav_conta_dv ?? '', 1) + ' ' + padA(t.fav_nome ?? '', 30)
    idPagamento = padN(t.doc_fav, 14) + padN(t.fav_ispb ?? '0', 8) + padN('01', 2)
  } else {
    fav = '000' + '00000' + '0' + '0'.repeat(12) + '0' + ' ' + ' '.repeat(30)
    idPagamento = padN('0', 14) + padN('0', 8) + padN('0', 2)
  }
  const valorInt = Math.round(t.valor_pagamento * 100)
  return (
    padN('077', 3) + padN(lote, 4) + '3' + padN(seq, 5) + 'A' + '0' + padN('00', 2) +
    padN('000', 3) + fav +
    padA(t.doc_empresa, 20) + fmtDate(t.data_pagamento) +
    padA('BRL', 3) + padN('0', 15) + padN(valorInt, 15) +
    ' '.repeat(20) + ' '.repeat(8) + ' '.repeat(15) +
    idPagamento +
    ' '.repeat(29) + ' '.repeat(10)
  ).padEnd(240, ' ')
}

function buildSegmentoBPix(t: PixTx, seq: number, lote: number): string {
  let chave = ''
  if (['01', '02', '04'].includes(t.forma_iniciacao)) {
    chave = padA(t.chave_pix, 99)
  } else {
    chave = ' '.repeat(99)
  }
  return (
    padN('077', 3) + padN(lote, 4) + '3' + padN(seq, 5) + 'B' +
    padA(t.forma_iniciacao, 3) + padN(t.tipo_doc_fav, 1) +
    padN(t.doc_fav, 14) + padA(t.txid ?? '', 35) +
    ' '.repeat(60) + chave + ' '.repeat(6) +
    padN(t.fav_ispb ?? '0', 8)
  ).padEnd(240, ' ')
}

function buildSegmentoJBoleto(t: BoletoTx, seq: number, lote: number): string {
  const valorNomInt = Math.round(t.valor_nominal * 100)
  const valorDescInt = Math.round(t.valor_desconto * 100)
  const valorMoraInt = Math.round(t.valor_mora * 100)
  const valorPagInt = Math.round(t.valor_pagamento * 100)
  return (
    padN('077', 3) + padN(lote, 4) + '3' + padN(seq, 5) + 'J' + '0' + padN('00', 2) +
    padN(t.codigo_barras, 44) + padA(t.nome_beneficiario, 30) +
    fmtDate(t.data_vencimento) + padN(valorNomInt, 15) +
    padN(valorDescInt, 15) + padN(valorMoraInt, 15) +
    fmtDate(t.data_pagamento) + padN(valorPagInt, 15) +
    padN('0', 15) + padN(t.doc_empresa, 20) + padN(t.nosso_numero, 20) +
    ' '.repeat(8) + ' '.repeat(10)
  ).padEnd(240, ' ')
}

function buildSegmentoJ52Boleto(t: BoletoTx, seq: number, lote: number): string {
  return (
    padN('077', 3) + padN(lote, 4) + '3' + padN(seq, 5) + 'J' + ' ' + padN('00', 2) +
    padN('52', 2) +
    padN('2', 1) + padN(t.pagador_documento, 15) + padA(t.pagador_nome, 40) +
    padN(t.beneficiario_tipo, 1) + padN(t.beneficiario_documento, 15) + padA(t.beneficiario_nome, 40) +
    ' '.repeat(56) + padN(t.doc_empresa_adicional, 53)
  ).padEnd(240, ' ')
}

// Manual, secao 8.2: um unico registro por pagamento (nao tem extensao tipo J-52).
function buildSegmentoOTributo(t: TributoTx, seq: number, lote: number): string {
  const valorInt = Math.round(t.valor_pagamento * 100)
  return (
    padN('077', 3) + padN(lote, 4) + '3' + padN(seq, 5) + 'O' + '0' + padN('00', 2) +
    padN(t.codigo_barras, 44) + padA(t.nome_concessionaria, 30) +
    fmtDate(t.data_vencimento) + fmtDate(t.data_pagamento) + padN(valorInt, 15) +
    padA(t.doc_empresa, 20) + padN(t.nosso_numero, 20)
  ).padEnd(240, ' ')
}

// nRegistros: header + detalhes + trailer do lote
function buildTrailerLote(lote: number, nRegistros: number, totalValor: number): string {
  const totalCents = Math.round(totalValor * 100)
  return (
    padN('077', 3) + padN(lote, 4) + '5' + ' '.repeat(9) +
    padN(nRegistros, 6) + padN(totalCents, 18) + padN('0', 18) +
    ' '.repeat(6) + ' '.repeat(165) + ' '.repeat(10)
  ).padEnd(240, ' ')
}

function buildTrailerArquivo(totalLotes: number, totalRegistros: number): string {
  return (
    padN('077', 3) + padN('9999', 4) + '9' + ' '.repeat(9) +
    padN(totalLotes, 6) + padN(totalRegistros, 6) +
    ' '.repeat(211)
  ).padEnd(240, ' ')
}

export function generateCnabFile(company: Company, transactions: Tx[]): string {
  const lines: string[] = [buildHeaderArquivo(company)]
  let nLotes = 0
  let totalRegistros = 2 // header e trailer do arquivo

  // Cada tipo de pagamento vai em lote proprio, numerado em sequencia a partir de 0001.
  const addLote = <T extends Tx>(txs: T[], servico: string, forma: string, detalhes: (t: T, seq: number, lote: number) => string[]) => {
    if (txs.length === 0) return
    const lote = ++nLotes
    const registros: string[] = []
    let total = 0
    for (const t of txs) {
      registros.push(...detalhes(t, registros.length + 1, lote))
      total += t.valor_pagamento
    }
    lines.push(buildHeaderLote(company, lote, servico, forma), ...registros, buildTrailerLote(lote, registros.length + 2, total))
    totalRegistros += registros.length + 2
  }

  addLote(transactions.filter((t): t is PixTx => t.tipo_pagamento === '1'), '20', '45',
    (t, seq, lote) => [buildSegmentoAPix(t, seq, lote), buildSegmentoBPix(t, seq + 1, lote)])
  addLote(transactions.filter((t): t is BoletoTx => t.tipo_pagamento === '3'), '20', '31',
    (t, seq, lote) => [buildSegmentoJBoleto(t, seq, lote), buildSegmentoJ52Boleto(t, seq + 1, lote)])
  addLote(transactions.filter((t): t is TributoTx => t.tipo_pagamento === 'T'), '22', '11',
    (t, seq, lote) => [buildSegmentoOTributo(t, seq, lote)])

  lines.push(buildTrailerArquivo(nLotes, totalRegistros))
  return lines.join('\n')
}
