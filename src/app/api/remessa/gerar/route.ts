import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase/server'
import { uploadFile } from '@/lib/b2'

// ─── CNAB 240 helpers ───────────────────────────────────────────────────────

function padN(value: string | number, length: number): string {
  const s = String(value).replace(/\D/g, '') || '0'
  return s.padStart(length, '0').slice(-length)
}
function padA(value: string | null | undefined, length: number): string {
  const s = String(value ?? '').slice(0, length)
  return s.padEnd(length, ' ')
}

interface Company {
  cnpj: string; agencia: string; agencia_dv: string
  conta: string; conta_dv: string; nome_empresa: string
  rua: string; numero: string; complemento: string
  cidade: string; cep: string; estado: string; sequencial: string
}

interface PixTx {
  tipo_pagamento: '1'
  data_pagamento: Date; valor_pagamento: number; doc_empresa: string
  forma_iniciacao: string; tipo_doc_fav: string; doc_fav: string
  chave_pix: string; txid?: string; fav_ispb?: string
  fav_banco?: string; fav_agencia?: string; fav_agencia_dv?: string
  fav_conta?: string; fav_conta_dv?: string; fav_nome?: string
}

interface BoletoTx {
  tipo_pagamento: '3'
  data_pagamento: Date; data_vencimento: Date; valor_pagamento: number; doc_empresa: string
  codigo_barras: string; nome_beneficiario: string; valor_nominal: number
  valor_desconto: number; valor_mora: number; nosso_numero: string
  beneficiario_tipo: number; beneficiario_documento: string; beneficiario_nome: string
  pagador_documento: string; pagador_nome: string; doc_empresa_adicional: string
}

type Tx = PixTx | BoletoTx

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

function buildHeaderLotePix(c: Company): string {
  return (
    padN('077', 3) + padN('1', 4) + '1' + 'C' +
    padN('00', 2) + padN('45', 2) + padN('046', 3) + ' ' +
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

function buildSegmentoAPix(t: PixTx, seq: number): string {
  let fav = ''
  if (t.forma_iniciacao === '05') {
    fav = padN(t.fav_banco ?? '', 3) + padN(t.fav_agencia ?? '', 5) +
          padA(t.fav_agencia_dv ?? '', 1) + padN(t.fav_conta ?? '', 12) +
          padA(t.fav_conta_dv ?? '', 1) + ' ' + padA(t.fav_nome ?? '', 30)
  } else {
    fav = '000' + '00000' + ' ' + '0'.repeat(12) + ' ' + ' '.repeat(30) + ' '
  }
  const valorInt = Math.round(t.valor_pagamento * 100)
  return (
    padN('077', 3) + padN('1', 4) + '3' + padN(seq, 5) + 'A' + '0' + padN('00', 2) +
    padN('000', 3) + fav +
    padA(t.doc_empresa, 20) + fmtDate(t.data_pagamento) +
    padA('BRL', 3) + padN('0', 15) + padN(valorInt, 15) +
    ' '.repeat(20) + ' '.repeat(8) + ' '.repeat(15) + ' '.repeat(22) +
    padN('01', 2) + ' '.repeat(18) + padN('00010', 5) +
    ' '.repeat(6) + ' '.repeat(10)
  ).padEnd(240, ' ')
}

function buildSegmentoBPix(t: PixTx, seq: number): string {
  let chave = ''
  if (['01', '02', '04'].includes(t.forma_iniciacao)) {
    chave = padA(t.chave_pix, 99)
  } else {
    chave = ' '.repeat(99)
  }
  return (
    padN('077', 3) + padN('1', 4) + '3' + padN(seq, 5) + 'B' +
    padA(t.forma_iniciacao, 3) + padN(t.tipo_doc_fav, 1) +
    padN(t.doc_fav, 14) + padA(t.txid ?? '', 35) +
    ' '.repeat(60) + chave + ' '.repeat(6) +
    padN(t.fav_ispb ?? '0', 8)
  ).padEnd(240, ' ')
}

function buildHeaderLoteBoleto(c: Company): string {
  return (
    padN('077', 3) + padN('1', 4) + '1' + 'C' +
    padN('00', 2) + padN('31', 2) + padN('046', 3) + ' ' +
    '2' + padN(c.cnpj, 14) + ' '.repeat(20) +
    padN(c.agencia, 5) + padA(c.agencia_dv, 1) +
    padN(c.conta, 12) + padN(c.conta_dv, 1) + ' ' +
    padA(c.nome_empresa, 30) + padA('', 40) +
    padA(c.rua, 30) + padN(c.numero, 5) +
    padA(c.complemento, 15) + padA(c.cidade, 20) +
    padN(c.cep, 5) + padA('', 3) + padA(c.estado, 2) +
    ' '.repeat(8) + ' '.repeat(10)
  ).padEnd(240, ' ')
}

function buildSegmentoJBoleto(t: BoletoTx, seq: number): string {
  const valorNomInt = Math.round(t.valor_nominal * 100)
  const valorDescInt = Math.round(t.valor_desconto * 100)
  const valorMoraInt = Math.round(t.valor_mora * 100)
  const valorPagInt = Math.round(t.valor_pagamento * 100)
  return (
    padN('077', 3) + padN('1', 4) + '3' + padN(seq, 5) + 'J' + '0' + padN('00', 2) +
    padN(t.codigo_barras, 44) + padA(t.nome_beneficiario, 30) +
    fmtDate(t.data_vencimento) + padN(valorNomInt, 15) +
    padN(valorDescInt, 15) + padN(valorMoraInt, 15) +
    fmtDate(t.data_pagamento) + padN(valorPagInt, 15) +
    padN('0', 15) + padA(t.doc_empresa, 20) + padA(t.nosso_numero, 20) +
    ' '.repeat(8) + ' '.repeat(10)
  ).padEnd(240, ' ')
}

function buildSegmentoJ52Boleto(t: BoletoTx, seq: number): string {
  return (
    padN('077', 3) + padN('1', 4) + '3' + padN(seq, 5) + 'J' + ' ' + padN('00', 2) +
    padN('52', 2) +
    padN('2', 1) + padN(t.pagador_documento, 15) + padA(t.pagador_nome, 40) +
    padN(t.beneficiario_tipo, 1) + padN(t.beneficiario_documento, 15) + padA(t.beneficiario_nome, 40) +
    ' '.repeat(56) + padA(t.doc_empresa_adicional, 53)
  ).padEnd(240, ' ')
}

function buildTrailerLote(nTx: number, totalValor: number): string {
  const registros = 2 * nTx + 2
  const totalCents = Math.round(totalValor * 100)
  return (
    padN('077', 3) + padN('1', 4) + '5' + ' '.repeat(9) +
    padN(registros, 6) + padN(totalCents, 18) + padN('0', 18) +
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

function generateCnabFile(company: Company, transactions: Tx[]): string {
  const lines: string[] = []
  lines.push(buildHeaderArquivo(company))

  const pixTxs = transactions.filter(t => t.tipo_pagamento === '1') as PixTx[]
  const boletoTxs = transactions.filter(t => t.tipo_pagamento === '3') as BoletoTx[]

  let totalLotes = 0
  let totalRegistros = 1 // header arquivo

  if (pixTxs.length > 0) {
    totalLotes++
    lines.push(buildHeaderLotePix(company))
    let seq = 1
    let totalValorPix = 0
    for (const t of pixTxs) {
      lines.push(buildSegmentoAPix(t, seq++))
      lines.push(buildSegmentoBPix(t, seq++))
      totalValorPix += t.valor_pagamento
    }
    lines.push(buildTrailerLote(pixTxs.length, totalValorPix))
    totalRegistros += 1 + 2 * pixTxs.length + 1
  }

  if (boletoTxs.length > 0) {
    totalLotes++
    lines.push(buildHeaderLoteBoleto(company))
    let seq = 1
    let totalValorBoleto = 0
    for (const t of boletoTxs) {
      lines.push(buildSegmentoJBoleto(t, seq++))
      lines.push(buildSegmentoJ52Boleto(t, seq++))
      totalValorBoleto += t.valor_pagamento
    }
    lines.push(buildTrailerLote(boletoTxs.length, totalValorBoleto))
    totalRegistros += 1 + 2 * boletoTxs.length + 1
  }

  lines.push(buildTrailerArquivo(totalLotes, totalRegistros + 1))
  return lines.join('\n')
}

// ─── API Handler ─────────────────────────────────────────────────────────────

interface TransactionInput {
  pagamento_id: number
  data_pagamento: string   // YYYY-MM-DD
  valor_pagamento: number
  tipo_pagamento: number   // 1 or 3
  forma_iniciacao?: string
  tipo_doc_fav?: string
  doc_fav?: string
  chave_pix?: string
  doc_empresa?: string
}

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  let conta_id: number, txInputs: TransactionInput[]
  try {
    const body = await req.json()
    conta_id = body.conta_id
    txInputs = body.transactions
  } catch {
    return NextResponse.json({ error: 'Body inválido ou vazio' }, { status: 400 })
  }

  if (!conta_id || !txInputs?.length) {
    return NextResponse.json({ error: 'conta_id e transactions são obrigatórios' }, { status: 400 })
  }

  const supabase = createServerClient()

  // Fetch conta pagadora
  const { data: conta } = await supabase.from('conta_pagador').select('*').eq('id', conta_id).single()
  if (!conta) return NextResponse.json({ error: 'Conta pagadora não encontrada' }, { status: 404 })

  // Get next sequencial number
  let sequencial = 1
  const { data: seqRow } = await supabase
    .from('controle_sequencial')
    .select('valor')
    .eq('tipo', 'remessa_cnab')
    .maybeSingle()

  if (seqRow) {
    sequencial = parseInt(seqRow.valor) + 1
    await supabase.from('controle_sequencial').update({ valor: String(sequencial) }).eq('tipo', 'remessa_cnab')
  } else {
    await supabase.from('controle_sequencial').insert({ tipo: 'remessa_cnab', valor: '1' })
  }

  const cnpjLimpo = String(conta.cnpj ?? '').replace(/\D/g, '')
  const cepLimpo = String(conta.cep ?? '').replace(/\D/g, '')

  const company: Company = {
    cnpj: cnpjLimpo,
    agencia: String(conta.agencia ?? ''),
    agencia_dv: String(conta.digito_agencia ?? ''),
    conta: String(conta.conta_corrente ?? ''),
    conta_dv: String(conta.digito_conta ?? ''),
    nome_empresa: String(conta.nome_empresa ?? ''),
    rua: String(conta.rua_av ?? ''),
    numero: String(conta.numero_local ?? ''),
    complemento: String(conta.complemento ?? ''),
    cidade: String(conta.cidade ?? ''),
    cep: cepLimpo.slice(0, 5),
    estado: String(conta.estado ?? ''),
    sequencial: String(sequencial),
  }

  // Fetch boleto info for boleto payments
  const boletoIds = txInputs.filter(t => t.tipo_pagamento === 3).map(t => t.pagamento_id)
  const boletoInfoMap: Record<number, Record<string, unknown>> = {}

  if (boletoIds.length > 0) {
    const { data: docs } = await supabase
      .from('documentos')
      .select('id, pagamento_id')
      .eq('tipo_documento', 4)
      .in('pagamento_id', boletoIds)

    if (docs?.length) {
      const docIds = docs.map(d => d.id)
      const { data: infos } = await supabase
        .from('informacoes_boleto')
        .select('*')
        .in('boleto_id', docIds)

      for (const info of infos ?? []) {
        const doc = docs.find(d => d.id === info.boleto_id)
        if (doc?.pagamento_id) boletoInfoMap[doc.pagamento_id] = info
      }
    }
  }

  // Build transactions
  const transactions: Tx[] = []
  for (const t of txInputs) {
    const dataPag = new Date(t.data_pagamento + 'T12:00:00')

    if (t.tipo_pagamento === 1) {
      transactions.push({
        tipo_pagamento: '1',
        data_pagamento: dataPag,
        valor_pagamento: t.valor_pagamento,
        doc_empresa: t.doc_empresa ?? String(t.pagamento_id),
        forma_iniciacao: t.forma_iniciacao ?? '03',
        tipo_doc_fav: t.tipo_doc_fav ?? '2',
        doc_fav: t.doc_fav ?? '',
        chave_pix: t.chave_pix ?? '',
      })
    } else if (t.tipo_pagamento === 3) {
      const info = boletoInfoMap[t.pagamento_id] ?? {}
      transactions.push({
        tipo_pagamento: '3',
        data_pagamento: dataPag,
        data_vencimento: dataPag,
        valor_pagamento: t.valor_pagamento,
        doc_empresa: t.doc_empresa ?? String(t.pagamento_id),
        codigo_barras: String(info.codigo_barras ?? ''),
        nome_beneficiario: String(info.nome_beneficiario ?? ''),
        valor_nominal: t.valor_pagamento,
        valor_desconto: Number(info.valor_desconto ?? 0),
        valor_mora: Number(info.valor_mora ?? 0),
        nosso_numero: String(info.nosso_numero ?? ''),
        beneficiario_tipo: Number(info.beneficiario_tipo ?? 2),
        beneficiario_documento: String(info.beneficiario_documento ?? '').replace(/\D/g, ''),
        beneficiario_nome: String(info.beneficiario_nome ?? ''),
        pagador_documento: cnpjLimpo,
        pagador_nome: company.nome_empresa,
        doc_empresa_adicional: String(info.doc_empresa_adicional ?? ''),
      })
    }
  }

  const cnabContent = generateCnabFile(company, transactions)
  const fileName = `CI240_001_${padN(String(sequencial), 7)}.rem`

  // Upload to B2
  let b2FileId: string | null = null
  try {
    const buffer = Buffer.from(cnabContent, 'utf-8')
    const { fileId } = await uploadFile(buffer, fileName, 'text/plain')
    b2FileId = fileId

    await supabase.from('documentos').insert({
      pedido_id: null,
      pagamento_id: null,
      usuario: session.username,
      tipo_documento: -3,
      anexo_id: fileId,
      nome_documento: fileName,
      data_upload: new Date().toISOString(),
    })
  } catch (e) {
    console.warn('B2 upload da remessa falhou:', e)
  }

  // Update payment statuses to "Enviado para o banco" (2)
  const pagamentoIds = txInputs.map(t => t.pagamento_id)
  await supabase
    .from('controle_pagamentos')
    .update({ status_pagamento: 2 })
    .in('id', pagamentoIds)

  return NextResponse.json({
    ok: true,
    file_name: fileName,
    file_content: cnabContent,
    sequencial,
    b2_file_id: b2FileId,
    updated_count: pagamentoIds.length,
  })
}
