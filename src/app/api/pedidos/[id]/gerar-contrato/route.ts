import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { supabaseServer } from '@/lib/supabase/server'
import { downloadFileById } from '@/lib/b2'
// eslint-disable-next-line @typescript-eslint/no-require-imports
const PizZip = require('pizzip')
// eslint-disable-next-line @typescript-eslint/no-require-imports
const Docxtemplater = require('docxtemplater')

function extractBodyContent(xml: string): string {
  const match = xml.match(/<w:body>([\s\S]*)<\/w:body>/)
  return match?.[1] ?? ''
}

function removeSectPr(bodyContent: string): string {
  return bodyContent.replace(/<w:sectPr\b[\s\S]*?<\/w:sectPr>/g, '')
}

function extractSectPr(bodyContent: string): string {
  const match = bodyContent.match(/<w:sectPr\b[\s\S]*?<\/w:sectPr>/)
  return match?.[0] ?? ''
}

async function mergeDocx(
  varBuffer: Buffer,
  estatBuffer: Buffer,
  data: Record<string, string>
): Promise<Buffer> {
  // Process variável template with placeholder substitutions
  const zip = new PizZip(varBuffer)
  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
    delimiters: { start: '{', end: '}' },
  })
  doc.setData(data)
  try {
    doc.render()
  } catch {
    // Render errors (unresolved vars) should not block generation
  }
  const varProcessed: Buffer = doc.getZip().generate({ type: 'nodebuffer' })

  // Extract and merge XML bodies
  const zip1 = new PizZip(varProcessed)
  const zip2 = new PizZip(estatBuffer)

  const xml1: string = zip1.file('word/document.xml').asText()
  const xml2: string = zip2.file('word/document.xml').asText()

  const body1Full = extractBodyContent(xml1)
  const body2Full = extractBodyContent(xml2)

  const body1 = removeSectPr(body1Full)
  const body2 = removeSectPr(body2Full)
  const sectPr = extractSectPr(body2Full) || extractSectPr(body1Full)

  const pageBreak =
    '<w:p><w:pPr><w:rPr></w:rPr></w:pPr><w:r><w:br w:type="page"/></w:r></w:p>'
  const combinedBody = `<w:body>${body1}${pageBreak}${body2}${sectPr}</w:body>`

  const combinedXml = xml1.replace(/<w:body>[\s\S]*<\/w:body>/, combinedBody)

  const combinedZip = new PizZip(varProcessed)
  combinedZip.file('word/document.xml', combinedXml)

  return combinedZip.generate({ type: 'nodebuffer' }) as Buffer
}

// POST /api/pedidos/[id]/gerar-contrato
// Body JSON: { modelo_variavel_id: number, modelo_estatico_id: number }
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { id } = await params
  const pedidoId = parseInt(id)
  if (isNaN(pedidoId)) return NextResponse.json({ error: 'ID inválido' }, { status: 400 })

  try {
    const body = await req.json()
    const { modelo_variavel_id, modelo_estatico_id } = body as {
      modelo_variavel_id: number
      modelo_estatico_id: number
    }

    // Fetch pedido + fluxo in parallel
    const [{ data: pedido }, { data: fluxo }, { data: modeloVar }, { data: modeloEst }] =
      await Promise.all([
        supabaseServer
          .from('pedidos_solicitados')
          .select('id,empresa,categoria,fornecedor,valor_pedido,status,data_solicitacao,data_autorizacao,emergencia,observacao')
          .eq('id', pedidoId)
          .maybeSingle(),
        supabaseServer
          .from('pedidos_solicitados_fluxo')
          .select('mes,ano,valor_referente')
          .eq('pedido_id', pedidoId)
          .order('mes')
          .order('ano'),
        supabaseServer
          .from('modelo_contrato')
          .select('arquivo_id,nome')
          .eq('id', modelo_variavel_id)
          .maybeSingle(),
        supabaseServer
          .from('modelo_contrato')
          .select('arquivo_id,nome')
          .eq('id', modelo_estatico_id)
          .maybeSingle(),
      ])

    if (!pedido) return NextResponse.json({ error: 'Pedido não encontrado' }, { status: 404 })
    if (!modeloVar || !modeloEst)
      return NextResponse.json({ error: 'Modelo não encontrado' }, { status: 404 })

    const fmtDate = (d: string | null) =>
      d ? new Date(d.includes('T') ? d : d + 'T12:00:00').toLocaleDateString('pt-BR') : ''

    const fmtMoeda = (v: number) =>
      Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2 })

    // Build substitutions data
    const data: Record<string, string> = {
      id: String(pedido.id),
      empresa: pedido.empresa ?? '',
      categoria: pedido.categoria ?? '',
      fornecedor: pedido.fornecedor ?? '',
      valor_pedido: fmtMoeda(pedido.valor_pedido),
      status: pedido.status ?? '',
      data_solicitacao: fmtDate(pedido.data_solicitacao),
      data_autorizacao: fmtDate(pedido.data_autorizacao),
      emergencia: pedido.emergencia ? 'Sim' : 'Não',
      observacao: pedido.observacao ?? '',
    }

    const rows = (fluxo ?? []) as Array<{ mes: number; ano: number; valor_referente: number }>
    let total = 0
    rows.forEach((r, i) => {
      const idx = i + 1
      data[`mes_ano_${idx}`] = `${r.mes}/${r.ano}`
      data[`valor_referente_${idx}`] = fmtMoeda(r.valor_referente)
      total += Number(r.valor_referente)
    })
    data['valor_total_fluxo'] = fmtMoeda(total)

    // Download both DOCX templates from B2
    const [varResult, estResult] = await Promise.all([
      downloadFileById(modeloVar.arquivo_id),
      downloadFileById(modeloEst.arquivo_id),
    ])

    const combined = await mergeDocx(varResult.content, estResult.content, data)

    return new NextResponse(new Uint8Array(combined), {
      headers: {
        'Content-Type':
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename="contrato_pedido_${pedidoId}.docx"`,
      },
    })
  } catch (err) {
    console.error('Gerar contrato error:', err)
    return NextResponse.json({ error: 'Erro ao gerar contrato' }, { status: 500 })
  }
}
