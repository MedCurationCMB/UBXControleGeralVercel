import { NextResponse } from 'next/server'
import ExcelJS from 'exceljs'

export async function GET() {
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('Orçamentos')

  sheet.columns = [
    { header: 'Empresa', key: 'Empresa', width: 28 },
    { header: 'Categoria', key: 'Categoria', width: 28 },
    { header: 'Mês', key: 'Mês', width: 8 },
    { header: 'Ano', key: 'Ano', width: 8 },
    { header: 'Valor do Orçamento', key: 'Valor do Orçamento', width: 22 },
    { header: 'Observação', key: 'Observação', width: 30 },
  ]

  const headerRow = sheet.getRow(1)
  headerRow.font = { bold: true }
  headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } }

  sheet.addRow({ Empresa: 'Empresa Exemplo', Categoria: 'Categoria A', Mês: 1, Ano: 2025, 'Valor do Orçamento': 10000.00, Observação: 'Observação opcional' })
  sheet.addRow({ Empresa: 'Empresa Exemplo', Categoria: 'Categoria B', Mês: 2, Ano: 2025, 'Valor do Orçamento': 20000.00, Observação: '' })

  const notesRow = sheet.addRow([])
  notesRow.getCell(1).value = '-- Mês: número de 1 a 12. Ano: entre 2025 e 2050. --'
  notesRow.font = { italic: true, color: { argb: 'FF6B7280' } }

  const bufferData = await workbook.xlsx.writeBuffer()

  return new NextResponse(new Uint8Array(bufferData as ArrayBuffer), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="template_orcamentos.xlsx"',
    },
  })
}
