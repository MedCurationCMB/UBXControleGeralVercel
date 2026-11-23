import { uploadFile } from '@/lib/b2'
import { linhaDigitavelParaCodigoBarras, ehTributo, dvTributoValido, dvBoleto47Valido } from '@/lib/boleto'
import { Company, Tx, generateCnabFile, padN } from '@/lib/cnab240'
import { parseRet, type RegistroRetorno } from '@/lib/retornoCnab'
import type { createServerClient } from '@/lib/supabase/server'

// Remessa CNAB 240 (gerar) e retorno do banco (importar): usados pelas rotas /api/remessa/* e pelo MCP.
type Db = ReturnType<typeof createServerClient>
export interface Erro { erro: string; status: number }

// O OCR devolve "CPF"/"CNPJ" (texto), não o código 1/2 exigido pelo CNAB.
function beneficiarioTipo(tipo: unknown, documento: unknown): number {
  const raw = String(tipo ?? '').toUpperCase()
  if (raw.includes('CPF')) return 1
  if (raw.includes('CNPJ')) return 2
  return String(documento ?? '').replace(/\D/g, '').length === 11 ? 1 : 2
}

export interface TransactionInput {
  pagamento_id: number
  data_pagamento: string   // YYYY-MM-DD
  valor_pagamento: number
  tipo_pagamento: number   // 1 (PIX) ou 3 (boleto)
  forma_iniciacao?: string
  tipo_doc_fav?: string
  doc_fav?: string
  chave_pix?: string
  doc_empresa?: string
}

export interface RemessaGerada { fileName: string; content: string; sequencial: number; fileId: string | null; count: number }

// exigirArquivo: o MCP entrega um link do arquivo guardado, então sem o upload nada é enviado ao banco (a tela devolve o conteúdo e segue).
export async function gerarRemessa(supabase: Db, projetoId: number, username: string, conta_id: number, txInputs: TransactionInput[], exigirArquivo = false): Promise<RemessaGerada | Erro> {
  const { data: conta } = await supabase.from('conta_pagador').select('*').eq('id', conta_id).eq('projeto_id', projetoId).single()
  if (!conta) return { erro: 'Conta pagadora não encontrada', status: 404 }

  // Boletos: dados lidos do PDF. Montamos tudo antes de gastar o sequencial.
  const boletoIds = txInputs.filter(t => t.tipo_pagamento === 3).map(t => t.pagamento_id)
  const boletoInfoMap: Record<number, Record<string, unknown>> = {}
  if (boletoIds.length > 0) {
    const { data: docs } = await supabase.from('documentos').select('id, pagamento_id').eq('tipo_documento', 4).in('pagamento_id', boletoIds)
    if (docs?.length) {
      const { data: infos } = await supabase.from('informacoes_boleto').select('*').in('boleto_id', docs.map(d => d.id))
      for (const info of infos ?? []) {
        const doc = docs.find(d => d.id === info.boleto_id)
        if (doc?.pagamento_id) boletoInfoMap[doc.pagamento_id] = info
      }
    }
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
    sequencial: '0',
  }

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
      const nDig = linha.replace(/\D/g, '').length
      if (codigoBarras.length !== 44 || (nDig === 48 && !dvTributoValido(linha)) || (nDig === 47 && !dvBoleto47Valido(linha))) {
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
    return { erro: `Pagamento(s) #${boletosSemCodigo.join(', #')} sem código de barras válido do boleto. Abra o pagamento, confira/informe o código de barras e tente gerar a remessa novamente.`, status: 422 }
  }

  // Próximo sequencial do projeto
  let sequencial = 1
  const { data: seqRow } = await supabase.from('controle_sequencial').select('valor').eq('tipo', 'remessa_cnab').eq('projeto_id', projetoId).maybeSingle()
  if (seqRow) {
    sequencial = parseInt(seqRow.valor) + 1
    await supabase.from('controle_sequencial').update({ valor: String(sequencial) }).eq('tipo', 'remessa_cnab').eq('projeto_id', projetoId)
  } else {
    await supabase.from('controle_sequencial').insert({ tipo: 'remessa_cnab', valor: '1', projeto_id: projetoId })
  }
  company.sequencial = String(sequencial)

  const content = generateCnabFile(company, transactions)
  const fileName = `CI240_001_${padN(String(sequencial), 7)}.REM` // extensão em maiúsculas, como no manual do Inter

  let fileId: string | null = null
  try {
    fileId = (await uploadFile(Buffer.from(content, 'utf-8'), fileName, 'text/plain')).fileId
    await supabase.from('documentos').insert({
      projeto_id: projetoId, pedido_id: null, pagamento_id: null, usuario: username, tipo_documento: -3,
      anexo_id: fileId, nome_documento: fileName, data_upload: new Date().toISOString(),
    })
  } catch (e) {
    console.warn('B2 upload da remessa falhou:', e)
    if (exigirArquivo) return { erro: 'Não foi possível guardar o arquivo da remessa. Nenhum pagamento foi alterado; tente de novo.', status: 502 }
  }

  // Status "Enviado para o banco" (2). O trigger marcar_envio_banco grava a data;
  // remessa_arquivo no mesmo UPDATE distingue o envio por remessa do manual.
  const ids = txInputs.map(t => t.pagamento_id)
  await supabase.from('controle_pagamentos').update({ status_pagamento: 2, remessa_arquivo: fileName }).eq('projeto_id', projetoId).in('id', ids)

  return { fileName, content, sequencial, fileId, count: ids.length }
}

export interface RetornoImportado { records: RegistroRetorno[]; updatedCount: number; fileId: string | null }

export async function importarRetorno(supabase: Db, projetoId: number, username: string, nomeArquivo: string, buffer: Buffer): Promise<RetornoImportado | Erro> {
  const records = parseRet(buffer.toString('utf-8'))
  if (records.length === 0) return { erro: 'Nenhum registro de pagamento (Segmento A ou J) encontrado no arquivo', status: 422 }

  const { data: existing } = await supabase.from('documentos').select('id').eq('nome_documento', nomeArquivo).eq('projeto_id', projetoId).maybeSingle()
  if (existing) return { erro: `Arquivo '${nomeArquivo}' já foi importado anteriormente.`, status: 409 }

  let updatedCount = 0
  for (const reg of records.filter(r => r.status === 'Pago')) {
    const idNum = parseInt(reg.docEmpresa)
    if (isNaN(idNum)) continue
    const de = reg.dataEfetivacao
    const { error } = await supabase.from('controle_pagamentos')
      .update({ data_pagamento: `${de.slice(4, 8)}-${de.slice(2, 4)}-${de.slice(0, 2)}`, valor_pagamento: reg.valorEfetivo, status_pagamento: 3 })
      .eq('id', idNum).eq('projeto_id', projetoId)
    if (!error) updatedCount++
  }

  let fileId: string | null = null
  try {
    fileId = (await uploadFile(buffer, nomeArquivo, 'text/plain')).fileId
    await supabase.from('documentos').insert({
      projeto_id: projetoId, pedido_id: null, pagamento_id: null, usuario: username, tipo_documento: -4,
      anexo_id: fileId, nome_documento: nomeArquivo, data_upload: new Date().toISOString(),
    })
  } catch (e) {
    console.warn('B2 upload do retorno falhou:', e)
  }
  return { records, updatedCount, fileId: updatedCount === 0 ? null : fileId }
}
