import { NextResponse } from 'next/server'
import ExcelJS from 'exceljs'

export async function GET() {
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('Fornecedores')

  sheet.columns = [{ header: 'Fornecedor', key: 'Fornecedor', width: 40 }]

  const headerRow = sheet.getRow(1)
  headerRow.font = { bold: true }
  headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } }

  sheet.addRow({ Fornecedor: 'Exemplo Fornecedor 1' })
  sheet.addRow({ Fornecedor: 'Exemplo Fornecedor 2' })

  const bufferData = await workbook.xlsx.writeBuffer()
  return new NextResponse(new Uint8Array(bufferData as ArrayBuffer), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="template_fornecedores.xlsx"',
    },
  })
}
