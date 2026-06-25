import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { supabaseServer } from '@/lib/supabase/server'
import { uploadFile, generateFileName } from '@/lib/b2'
import { extrairDadosBoleto, analisarDocumento } from '@/lib/gemini'
import { bufferToBase64 } from '@/lib/utils'

// POST /api/documentos/upload
// Body: FormData com campos: file, pedido_id, pagamento_id?, tipo_documento, modulo (pagamentos|recebimentos), extrair_boleto?
export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  try {
    const form = await req.formData()
    const file = form.get('file') as File | null
    const pedidoId = form.get('pedido_id') as string | null
    const pagamentoId = form.get('pagamento_id') as string | null
    const recebimentoId = form.get('recebimento_id') as string | null
    const tipoDocumento = parseInt(form.get('tipo_documento') as string)
    const modulo = (form.get('modulo') as string) ?? 'pagamentos'
    const extrairBoleto = form.get('extrair_boleto') === 'true'
    const analisar = form.get('analisar') === 'true'

    if (!file) return NextResponse.json({ error: 'Arquivo obrigatório' }, { status: 400 })

    const buffer = Buffer.from(await file.arrayBuffer())
    const mimeType = file.type as 'image/jpeg' | 'image/png' | 'application/pdf'
    const nomeArquivo = generateFileName('doc', file.name)

    // Upload para B2
    const { fileId, downloadUrl } = await uploadFile(buffer, nomeArquivo, mimeType)

    // Salva no banco
    const tabela = modulo === 'recebimentos' ? 'documentos_receita' : 'documentos'
    const registro: Record<string, unknown> = {
      tipo_documento: tipoDocumento,
      anexo_id: fileId,
      anexo_url: downloadUrl,
      nome_documento: file.name,
      usuario: session.username,
      data_upload: new Date().toISOString(),
    }

    if (pedidoId) registro.pedido_id = parseInt(pedidoId)
    if (pagamentoId) registro.pagamento_id = parseInt(pagamentoId)
    if (recebimentoId) registro.recebimento_id = parseInt(recebimentoId)

    // OCR via Gemini se for boleto
    let dadosBoleto = null
    let analiseTexto: string | null = null

    if (extrairBoleto || tipoDocumento === 1) {
      try {
        dadosBoleto = await extrairDadosBoleto(bufferToBase64(buffer), mimeType)
      } catch (e) {
        console.warn('Extração de boleto falhou:', e)
      }
    }

    if (analisar) {
      try {
        analiseTexto = await analisarDocumento(bufferToBase64(buffer), mimeType)
        registro.arquivo_texto = analiseTexto
      } catch (e) {
        console.warn('Análise de documento falhou:', e)
      }
    }

    const { data: doc, error } = await supabaseServer.from(tabela).insert(registro).select().single()
    if (error) throw error

    // Salva informações do boleto se extraídas
    if (dadosBoleto && doc) {
      const tabelaBoleto = modulo === 'recebimentos' ? 'informacoes_boleto_receita' : 'informacoes_boleto'
      await supabaseServer.from(tabelaBoleto).insert({ ...dadosBoleto, boleto_id: doc.id })
    }

    return NextResponse.json({ ok: true, documento: doc, dadosBoleto, analiseTexto })
  } catch (err) {
    console.error('Upload error:', err)
    return NextResponse.json({ error: 'Erro ao fazer upload' }, { status: 500 })
  }
}
