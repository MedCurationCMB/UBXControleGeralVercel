import { NextResponse } from 'next/server'
import ExcelJS from 'exceljs'

export async function GET() {
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('Clientes')

  sheet.columns = [
    { header: 'Nome', key: 'Nome', width: 35 },
    { header: 'CNPJ_CPF', key: 'CNPJ_CPF', width: 20 },
    { header: 'Rua_Avenida', key: 'Rua_Avenida', width: 30 },
    { header: 'Numero', key: 'Numero', width: 10 },
    { header: 'Complemento', key: 'Complemento', width: 20 },
    { header: 'Bairro', key: 'Bairro', width: 20 },
    { header: 'Cidade', key: 'Cidade', width: 20 },
    { header: 'Estado', key: 'Estado', width: 8 },
    { header: 'CEP', key: 'CEP', width: 12 },
  ]

  const headerRow = sheet.getRow(1)
  headerRow.font = { bold: true }
  headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } }

  sheet.addRow({ Nome: 'Exemplo Cliente 1', CNPJ_CPF: '12345678901', Rua_Avenida: 'Av. Exemplo', Numero: '123', Complemento: 'Sala 1', Bairro: 'Centro', Cidade: 'São Paulo', Estado: 'SP', CEP: '01310-000' })
  sheet.addRow({ Nome: 'Exemplo Cliente 2', CNPJ_CPF: '12345678901234', Rua_Avenida: 'Rua Teste', Numero: '456', Complemento: '', Bairro: 'Jardim', Cidade: 'Rio de Janeiro', Estado: 'RJ', CEP: '20040-020' })

  const notesRow = sheet.addRow([])
  notesRow.getCell(1).value = '-- CNPJ_CPF: somente dígitos (11=CPF, 14=CNPJ). Estado: sigla de 2 letras. --'
  notesRow.font = { italic: true, color: { argb: 'FF6B7280' } }

  const buf = await workbook.xlsx.writeBuffer()
  return new NextResponse(new Uint8Array(buf as ArrayBuffer), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="template_clientes_completo.xlsx"',
    },
  })
}
