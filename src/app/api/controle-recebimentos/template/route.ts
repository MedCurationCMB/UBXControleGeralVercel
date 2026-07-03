import { NextResponse } from 'next/server'
import ExcelJS from 'exceljs'

export async function GET() {
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('Recebimentos')

  sheet.columns = [
    { header: 'pedido_id',        key: 'pedido_id',        width: 14 },
    { header: 'data_vencimento',  key: 'data_vencimento',  width: 18 },
    { header: 'valor_pagar',      key: 'valor_pagar',      width: 14 },
    { header: 'tipo_recebimento', key: 'tipo_recebimento', width: 18 },
    { header: 'data_pagamento',   key: 'data_pagamento',   width: 18 },
    { header: 'valor_pagamento',  key: 'valor_pagamento',  width: 16 },
  ]

  const headerRow = sheet.getRow(1)
  headerRow.font = { bold: true }
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFE2E8F0' },
  }

  sheet.addRow({ pedido_id: 1, data_vencimento: '31/01/2025', valor_pagar: 1500.00, tipo_recebimento: 1 })
  sheet.addRow({ pedido_id: 2, data_vencimento: '28/02/2025', valor_pagar: 800.00, tipo_recebimento: 3, data_pagamento: '25/02/2025', valor_pagamento: 800.00 })

  const notesRow = sheet.addRow([])
  notesRow.getCell(1).value = '-- tipo_recebimento: use o ID numérico do tipo de recebimento cadastrado --'
  notesRow.font = { italic: true, color: { argb: 'FF6B7280' } }

  const bufferData = await workbook.xlsx.writeBuffer()

  return new NextResponse(new Uint8Array(bufferData as ArrayBuffer), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="template_recebimentos.xlsx"',
    },
  })
}
