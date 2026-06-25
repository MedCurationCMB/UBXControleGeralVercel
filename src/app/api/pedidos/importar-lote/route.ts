import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { supabaseServer } from '@/lib/supabase/server'
import ExcelJS from 'exceljs'

const REQUIRED_COLS = ['id_pedido_importado', 'empresa', 'categoria', 'fornecedor', 'mes', 'ano', 'valor_referente']

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  try {
    const form = await req.formData()
    const file = form.get('file') as File | null
    if (!file) return NextResponse.json({ error: 'Arquivo obrigatório' }, { status: 400 })

    const arrayBuffer = await file.arrayBuffer()
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(arrayBuffer)

    const sheet = workbook.worksheets[0]
    if (!sheet) return NextResponse.json({ error: 'Planilha não encontrada' }, { status: 400 })

    // Parse header row
    const headers: string[] = []
    sheet.getRow(1).eachCell((cell, colNum) => {
      headers[colNum] = String(cell.value ?? '').trim()
    })

    const missing = REQUIRED_COLS.filter(c => !headers.includes(c))
    if (missing.length > 0) {
      return NextResponse.json(
        { error: `Colunas faltando: ${missing.join(', ')}` },
        { status: 400 }
      )
    }

    // Parse data rows
    const rows: Record<string, unknown>[] = []
    sheet.eachRow((row, rowNum) => {
      if (rowNum === 1) return
      const obj: Record<string, unknown> = {}
      row.eachCell((cell, colNum) => {
        if (headers[colNum]) obj[headers[colNum]] = cell.value
      })
      // Skip empty rows
      if (obj.id_pedido_importado != null && obj.empresa) rows.push(obj)
    })

    if (rows.length === 0) return NextResponse.json({ error: 'Arquivo sem dados' }, { status: 400 })

    // Group rows by id_pedido_importado
    const groups = new Map<string, typeof rows>()
    for (const row of rows) {
      const key = String(row.id_pedido_importado)
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key)!.push(row)
    }

    const today = new Date().toISOString().split('T')[0]
    let count = 0

    for (const [, pedidoRows] of groups) {
      const first = pedidoRows[0]
      const valorTotal = pedidoRows.reduce((s, r) => s + Number(r.valor_referente ?? 0), 0)

      const { data: pedido, error: errPedido } = await supabaseServer
        .from('pedidos_solicitados')
        .insert({
          empresa: String(first.empresa ?? ''),
          categoria: String(first.categoria ?? ''),
          fornecedor: String(first.fornecedor ?? ''),
          valor_pedido: valorTotal,
          observacao: null,
          emergencia: false,
          status: 'Aguardando Autorização',
          data_solicitacao: today,
          arquivo_texto: [],
          arquivos_pdf_ids: [],
        })
        .select('id')
        .single()

      if (errPedido || !pedido) continue

      const fluxos = pedidoRows.map(r => ({
        pedido_id: pedido.id,
        empresa: String(first.empresa ?? ''),
        categoria: String(first.categoria ?? ''),
        fornecedor: String(first.fornecedor ?? ''),
        mes: Number(r.mes ?? 0),
        ano: Number(r.ano ?? 0),
        valor_referente: Number(r.valor_referente ?? 0),
      }))

      await supabaseServer.from('pedidos_solicitados_fluxo').insert(fluxos)
      count++
    }

    return NextResponse.json({ ok: true, count })
  } catch (err) {
    console.error('Import error:', err)
    return NextResponse.json({ error: 'Erro ao processar arquivo' }, { status: 500 })
  }
}
