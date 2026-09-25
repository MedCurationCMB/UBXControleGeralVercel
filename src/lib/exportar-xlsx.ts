// Exportação de tabelas para .xlsx (usada pelos controles de pagamentos e recebimentos).

export interface ColunaXlsx { header: string; key: string; width: number; formato?: 'data' | 'moeda' }

const FORMATOS = { data: 'dd/mm/yyyy', moeda: '"R$" #,##0.00' }

// Datas do banco (YYYY-MM-DD) viram Date ao meio-dia, para não virar o dia por fuso.
export const dataParaXlsx = (d: string | null | undefined) => (d ? new Date(d + 'T12:00:00') : null)

export async function montarXlsx(aba: string, colunas: ColunaXlsx[], linhas: Record<string, unknown>[]) {
  const ExcelJS = (await import('exceljs')).default
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet(aba)
  sheet.columns = colunas.map(({ header, key, width }) => ({ header, key, width }))

  const headerRow = sheet.getRow(1)
  headerRow.font = { bold: true }
  headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } }

  for (const linha of linhas) {
    const row = sheet.addRow(linha)
    for (const c of colunas) if (c.formato) row.getCell(c.key).numFmt = FORMATOS[c.formato]
  }
  return workbook.xlsx.writeBuffer()
}

export async function baixarXlsx(aba: string, colunas: ColunaXlsx[], linhas: Record<string, unknown>[], arquivo: string) {
  const buffer = await montarXlsx(aba, colunas, linhas)
  const blob = new Blob([new Uint8Array(buffer as ArrayBuffer)], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = arquivo
  a.click()
  URL.revokeObjectURL(url)
}
