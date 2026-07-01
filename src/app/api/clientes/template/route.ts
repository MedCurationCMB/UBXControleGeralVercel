import { NextResponse } from 'next/server'
import ExcelJS from 'exceljs'

export async function GET() {
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('Clientes')

  sheet.columns = [{ header: 'Cliente', key: 'Cliente', width: 40 }]
  const headerRow = sheet.getRow(1)
  headerRow.font = { bold: true }
  headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } }

  sheet.addRow({ Cliente: 'Exemplo Cliente 1' })
  sheet.addRow({ Cliente: 'Exemplo Cliente 2' })

  const buf = await workbook.xlsx.writeBuffer()
  return new NextResponse(new Uint8Array(buf as ArrayBuffer), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="template_clientes.xlsx"',
    },
  })
}
