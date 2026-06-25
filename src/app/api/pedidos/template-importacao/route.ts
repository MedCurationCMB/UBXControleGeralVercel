import { NextResponse } from 'next/server'
import ExcelJS from 'exceljs'

export async function GET() {
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('Pedidos')

  sheet.columns = [
    { header: 'id_pedido_importado', key: 'id_pedido_importado', width: 22 },
    { header: 'empresa', key: 'empresa', width: 25 },
    { header: 'categoria', key: 'categoria', width: 25 },
    { header: 'fornecedor', key: 'fornecedor', width: 25 },
    { header: 'mes', key: 'mes', width: 8 },
    { header: 'ano', key: 'ano', width: 8 },
    { header: 'valor_referente', key: 'valor_referente', width: 16 },
  ]

  // Style header row
  const headerRow = sheet.getRow(1)
  headerRow.font = { bold: true }
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFE2E8F0' },
  }

  // Example rows (one pedido with two months)
  sheet.addRow({ id_pedido_importado: 1, empresa: 'Empresa Exemplo', categoria: 'Categoria Exemplo', fornecedor: 'Fornecedor Exemplo', mes: 3, ano: 2025, valor_referente: 1000.00 })
  sheet.addRow({ id_pedido_importado: 1, empresa: 'Empresa Exemplo', categoria: 'Categoria Exemplo', fornecedor: 'Fornecedor Exemplo', mes: 4, ano: 2025, valor_referente: 1000.00 })

  const bufferData = await workbook.xlsx.writeBuffer()

  return new NextResponse(new Uint8Array(bufferData as ArrayBuffer), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="template_pedidos.xlsx"',
    },
  })
}
