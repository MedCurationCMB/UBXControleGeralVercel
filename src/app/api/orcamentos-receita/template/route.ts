import { NextResponse } from 'next/server'
import ExcelJS from 'exceljs'

export async function GET() {
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('Orçamentos')

  sheet.columns = [
    { header: 'Empresa',            key: 'empresa',    width: 28 },
    { header: 'Categoria',          key: 'categoria',  width: 28 },
    { header: 'Mês',                key: 'mes',        width: 8  },
    { header: 'Ano',                key: 'ano',        width: 8  },
    { header: 'Valor do Orçamento', key: 'valor',      width: 20 },
    { header: 'Observação',         key: 'observacao', width: 30 },
  ]

  const headerRow = sheet.getRow(1)
  headerRow.font = { bold: true }
  headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } }

  sheet.addRow({ empresa: 'Empresa Exemplo', categoria: 'Categoria A', mes: 1, ano: 2025, valor: 10000.00, observacao: 'Observação opcional' })
  sheet.addRow({ empresa: 'Empresa Exemplo', categoria: 'Categoria B', mes: 2, ano: 2025, valor: 20000.00, observacao: '' })

  const notesRow = sheet.addRow([])
  notesRow.getCell(1).value = '-- Mês deve ser um número de 1 a 12. Ano entre 2025 e 2050. --'
  notesRow.font = { italic: true, color: { argb: 'FF6B7280' } }

  const buf = await workbook.xlsx.writeBuffer()
  return new NextResponse(new Uint8Array(buf as ArrayBuffer), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="template_orcamentos_receita.xlsx"',
    },
  })
}
