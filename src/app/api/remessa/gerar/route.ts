import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase/server'
import { uploadFile } from '@/lib/b2'
import { linhaDigitavelParaCodigoBarras, ehTributo, dvTributoValido } from '@/lib/boleto'
import { Company, Tx, generateCnabFile, padN } from '@/lib/cnab240'

// O OCR devolve "CPF"/"CNPJ" (texto), não o código 1/2 exigido pelo CNAB.
function beneficiarioTipo(tipo: unknown, documento: unknown): number {
  const raw = String(tipo ?? '').toUpperCase()
  if (raw.includes('CPF')) return 1
  if (raw.includes('CNPJ')) return 2
  return String(documento ?? '').replace(/\D/g, '').length === 11 ? 1 : 2
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
  const { data: conta } = await supabase.from('conta_pagador').select('*').eq('id', conta_id).eq('projeto_id', session.projetoId).single()
  if (!conta) return NextResponse.json({ error: 'Conta pagadora não encontrada' }, { status: 404 })

  // Get next sequencial number
  let sequencial = 1
  const { data: seqRow } = await supabase
    .from('controle_sequencial')
    .select('valor')
    .eq('tipo', 'remessa_cnab')
    .eq('projeto_id', session.projetoId)
    .maybeSingle()

  if (seqRow) {
    sequencial = parseInt(seqRow.valor) + 1
    await supabase.from('controle_sequencial').update({ valor: String(sequencial) }).eq('tipo', 'remessa_cnab').eq('projeto_id', session.projetoId)
  } else {
    await supabase.from('controle_sequencial').insert({ tipo: 'remessa_cnab', valor: '1', projeto_id: session.projetoId })
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
  const boletosSemCodigo: number[] = []
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
      const dataVenc = info.data_vencimento ? new Date(`${info.data_vencimento}T12:00:00`) : dataPag
      const linha = String(info.codigo_barras ?? '')
      const codigoBarras = linhaDigitavelParaCodigoBarras(linha)
      if (codigoBarras.length !== 44 || (linha.replace(/\D/g, '').length === 48 && !dvTributoValido(linha))) {
        boletosSemCodigo.push(t.pagamento_id)
        continue
      }
      if (ehTributo(codigoBarras)) {
        // DAM/convênio (código começando em 8): vai em lote próprio, Segmento O
        transactions.push({
          tipo_pagamento: 'T',
          data_pagamento: dataPag,
          data_vencimento: dataVenc,
          valor_pagamento: t.valor_pagamento,
          doc_empresa: t.doc_empresa ?? String(t.pagamento_id),
          codigo_barras: codigoBarras,
          nome_concessionaria: String(info.nome_beneficiario ?? ''),
          nosso_numero: String(info.nosso_numero ?? ''),
        })
        continue
      }
      transactions.push({
        tipo_pagamento: '3',
        data_pagamento: dataPag,
        data_vencimento: dataVenc,
        valor_pagamento: t.valor_pagamento,
        doc_empresa: t.doc_empresa ?? String(t.pagamento_id),
        codigo_barras: codigoBarras,
        nome_beneficiario: String(info.nome_beneficiario ?? ''),
        valor_nominal: Number(info.valor_nominal ?? t.valor_pagamento),
        valor_desconto: Number(info.valor_desconto ?? 0),
        valor_mora: Number(info.valor_mora ?? 0),
        nosso_numero: String(info.nosso_numero ?? ''),
        beneficiario_tipo: beneficiarioTipo(info.beneficiario_tipo, info.beneficiario_documento),
        beneficiario_documento: String(info.beneficiario_documento ?? '').replace(/\D/g, ''),
        beneficiario_nome: String(info.beneficiario_nome ?? ''),
        pagador_documento: cnpjLimpo,
        pagador_nome: company.nome_empresa,
        doc_empresa_adicional: String(info.doc_empresa_adicional ?? ''),
      })
    }
  }

  if (boletosSemCodigo.length > 0) {
    return NextResponse.json({
      error: `Pagamento(s) #${boletosSemCodigo.join(', #')} sem código de barras válido do boleto. Abra o pagamento, confira/informe o código de barras e tente gerar a remessa novamente.`,
    }, { status: 422 })
  }

  const cnabContent = generateCnabFile(company, transactions)
  const fileName = `CI240_001_${padN(String(sequencial), 7)}.REM` // extensão em maiúsculas, como no manual do Inter

  // Upload to B2
  let b2FileId: string | null = null
  try {
    const buffer = Buffer.from(cnabContent, 'utf-8')
    const { fileId } = await uploadFile(buffer, fileName, 'text/plain')
    b2FileId = fileId

    await supabase.from('documentos').insert({
      projeto_id: session.projetoId,
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

  // Update payment statuses to "Enviado para o banco" (2). O trigger marcar_envio_banco grava a data;
  // remessa_arquivo no mesmo UPDATE distingue o envio por remessa do manual.
  const pagamentoIds = txInputs.map(t => t.pagamento_id)
  await supabase
    .from('controle_pagamentos')
    .update({ status_pagamento: 2, remessa_arquivo: fileName })
    .eq('projeto_id', session.projetoId)
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
