import { NextResponse } from 'next/server'
import ExcelJS from 'exceljs'

export async function GET() {
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('Pagamentos')

  sheet.columns = [
    { header: 'pedido_id', key: 'pedido_id', width: 14 },
    { header: 'data_vencimento', key: 'data_vencimento', width: 18 },
    { header: 'valor_pagar', key: 'valor_pagar', width: 14 },
    { header: 'tipo_pagamento', key: 'tipo_pagamento', width: 18 },
    { header: 'data_pagamento', key: 'data_pagamento', width: 18 },
    { header: 'valor_pagamento', key: 'valor_pagamento', width: 16 },
  ]

  const headerRow = sheet.getRow(1)
  headerRow.font = { bold: true }
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFE2E8F0' },
  }

  // Sem linhas de exemplo: elas seriam importadas como pagamentos reais se ficassem na planilha.
  // As linhas de anotação (começam com "--") são ignoradas na importação.
  const notas = [
    '-- Tipos: 1=PIX, 2=Dinheiro, 3=Boleto, 4=Cartão de Crédito, 5=Ainda à Definir --',
    '-- Datas em DD/MM/AAAA (ex.: 31/01/2026). Valores: 1500.50 ou 1500,50. Só pedidos autorizados. Apague estas linhas antes de importar (opcional). --',
  ]
  for (const n of notas) {
    const r = sheet.addRow([n])
    r.font = { italic: true, color: { argb: 'FF6B7280' } }
  }

  const bufferData = await workbook.xlsx.writeBuffer()

  return new NextResponse(new Uint8Array(bufferData as ArrayBuffer), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="template_pagamentos.xlsx"',
    },
  })
}
