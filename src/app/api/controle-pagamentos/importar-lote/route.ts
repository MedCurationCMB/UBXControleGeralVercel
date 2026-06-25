import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { supabaseServer } from '@/lib/supabase/server'
import ExcelJS from 'exceljs'

const REQUIRED_COLS = ['pedido_id', 'data_vencimento', 'valor_pagar', 'tipo_pagamento']

function parseDate(v: unknown): string | null {
  if (!v) return null
  const s = String(v).trim()
  // DD/MM/YYYY
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
  // YYYY-MM-DD passthrough
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.split('T')[0]
  // ExcelJS date serial
  if (v instanceof Date) return v.toISOString().split('T')[0]
  return null
}

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

    const headers: string[] = []
    sheet.getRow(1).eachCell((cell, colNum) => {
      headers[colNum] = String(cell.value ?? '').trim().toLowerCase()
    })

    const missing = REQUIRED_COLS.filter(c => !headers.includes(c))
    if (missing.length > 0) {
      return NextResponse.json({ error: `Colunas faltando: ${missing.join(', ')}` }, { status: 400 })
    }

    const rows: Array<{
      pedido_id: number; data_vencimento: string; valor_pagar: number
      tipo_pagamento: number; data_pagamento: string | null; valor_pagamento: number | null
    }> = []

    sheet.eachRow((row, rowNum) => {
      if (rowNum === 1) return
      const obj: Record<string, unknown> = {}
      row.eachCell((cell, colNum) => {
        if (headers[colNum]) obj[headers[colNum]] = cell.value
      })

      const pedidoId = parseInt(String(obj.pedido_id ?? ''))
      const dataVenc = parseDate(obj.data_vencimento)
      const valorPagar = parseFloat(String(obj.valor_pagar ?? '0'))
      const tipoPag = parseInt(String(obj.tipo_pagamento ?? ''))

      // Skip empty / invalid rows
      if (!pedidoId || !dataVenc || !valorPagar || !tipoPag) return
      // Skip notes rows (no numeric pedido_id)
      if (isNaN(pedidoId) || isNaN(tipoPag)) return

      rows.push({
        pedido_id: pedidoId,
        data_vencimento: dataVenc,
        valor_pagar: valorPagar,
        tipo_pagamento: tipoPag,
        data_pagamento: parseDate(obj.data_pagamento),
        valor_pagamento: obj.valor_pagamento ? parseFloat(String(obj.valor_pagamento)) : null,
      })
    })

    if (rows.length === 0) {
      return NextResponse.json({ error: 'Nenhuma linha válida encontrada' }, { status: 400 })
    }

    const inserts = rows.map(r => ({
      pedido_id: r.pedido_id,
      data_vencimento: r.data_vencimento,
      valor_pagar: r.valor_pagar,
      tipo_pagamento: r.tipo_pagamento,
      data_pagamento: r.data_pagamento,
      valor_pagamento: r.valor_pagamento,
      status_pagamento: 1,
    }))

    const { error } = await supabaseServer.from('controle_pagamentos').insert(inserts)
    if (error) throw error

    return NextResponse.json({ ok: true, count: rows.length })
  } catch (err) {
    console.error('Importar pagamentos lote error:', err)
    return NextResponse.json({ error: 'Erro ao processar arquivo' }, { status: 500 })
  }
}
