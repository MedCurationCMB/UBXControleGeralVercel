import { NextResponse } from 'next/server'
import ExcelJS from 'exceljs'

export async function GET() {
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('Pedidos')

  sheet.columns = [
    { header: 'empresa', key: 'empresa', width: 25 },
    { header: 'categoria', key: 'categoria', width: 25 },
    { header: 'fornecedor', key: 'fornecedor', width: 25 },
    { header: 'fornecedor_beneficiario', key: 'fornecedor_beneficiario', width: 28 },
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
  sheet.addRow({ empresa: 'Empresa Exemplo', categoria: 'Categoria Exemplo', fornecedor: 'Fornecedor Exemplo', fornecedor_beneficiario: 'Fornecedor Exemplo', mes: 3, ano: 2025, valor_referente: 1000.00 })
  sheet.addRow({ empresa: 'Empresa Exemplo', categoria: 'Categoria Exemplo', fornecedor: 'Fornecedor Exemplo', fornecedor_beneficiario: 'Outro Beneficiario', mes: 4, ano: 2025, valor_referente: 1000.00 })

  // Fora das colunas lidas pelo importador
  sheet.getCell('I1').value = 'fornecedor_beneficiario: opcional; em branco = o próprio fornecedor. Precisa estar cadastrado.'
  sheet.getCell('I1').font = { italic: true, color: { argb: 'FF6B7280' } }

  const bufferData = await workbook.xlsx.writeBuffer()

  return new NextResponse(new Uint8Array(bufferData as ArrayBuffer), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="template_pedidos.xlsx"',
    },
  })
}
