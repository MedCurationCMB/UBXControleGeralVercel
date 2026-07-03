import { NextResponse } from 'next/server'
import ExcelJS from 'exceljs'

export async function GET() {
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('Pedidos')

  sheet.columns = [
    { header: 'id_pedido_importado', key: 'id_pedido_importado', width: 22 },
    { header: 'empresa',             key: 'empresa',             width: 25 },
    { header: 'categoria',           key: 'categoria',           width: 25 },
    { header: 'cliente',             key: 'cliente',             width: 30 },
    { header: 'mes',                 key: 'mes',                 width: 8  },
    { header: 'ano',                 key: 'ano',                 width: 8  },
    { header: 'valor_referente',     key: 'valor_referente',     width: 18 },
  ]

  const headerRow = sheet.getRow(1)
  headerRow.font = { bold: true }
  headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } }

  // Two rows for the same pedido (multi-period example)
  sheet.addRow({ id_pedido_importado: 1, empresa: 'Empresa Exemplo', categoria: 'Categoria Exemplo', cliente: 'Cliente Exemplo', mes: 3,  ano: 2025, valor_referente: 1000.00 })
  sheet.addRow({ id_pedido_importado: 1, empresa: 'Empresa Exemplo', categoria: 'Categoria Exemplo', cliente: 'Cliente Exemplo', mes: 4,  ano: 2025, valor_referente: 1000.00 })
  sheet.addRow({ id_pedido_importado: 2, empresa: 'Empresa Exemplo', categoria: 'Categoria 2',       cliente: 'Outro Cliente',   mes: 5,  ano: 2025, valor_referente: 2500.00 })

  const notesRow = sheet.addRow([])
  notesRow.getCell(1).value = '-- Linhas com mesmo id_pedido_importado formam um único pedido com múltiplos períodos. mes = número (1-12). --'
  notesRow.font = { italic: true, color: { argb: 'FF6B7280' } }

  const buf = await workbook.xlsx.writeBuffer()
  return new NextResponse(new Uint8Array(buf as ArrayBuffer), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="template_pedidos_receita.xlsx"',
    },
  })
}
