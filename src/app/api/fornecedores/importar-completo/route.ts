import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { supabaseServer } from '@/lib/supabase/server'
import ExcelJS from 'exceljs'

const REQUIRED_COLS = ['nome', 'cnpj_cpf', 'rua_avenida', 'numero', 'bairro', 'cidade', 'estado', 'cep']

function somenteDigitos(v: string) { return v.replace(/\D/g, '') }
function formatarCpfCnpj(d: string): string {
  if (d.length === 11) return `${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6,9)}-${d.slice(9,11)}`
  if (d.length === 14) return `${d.slice(0,2)}.${d.slice(2,5)}.${d.slice(5,8)}/${d.slice(8,12)}-${d.slice(12,14)}`
  return d
}

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  try {
    const form = await req.formData()
    const file = form.get('file') as File | null
    if (!file) return NextResponse.json({ error: 'Arquivo obrigatório' }, { status: 400 })

    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(await file.arrayBuffer())

    const sheet = workbook.worksheets[0]
    if (!sheet) return NextResponse.json({ error: 'Planilha não encontrada' }, { status: 400 })

    // Parse headers (normalize: lowercase + underscores)
    const headers: string[] = []
    sheet.getRow(1).eachCell((cell, colNum) => {
      headers[colNum] = String(cell.value ?? '').trim().toLowerCase().replace(/\s+/g, '_')
    })

    const missing = REQUIRED_COLS.filter(c => !headers.includes(c))
    if (missing.length > 0) {
      return NextResponse.json({ error: `Colunas faltando: ${missing.join(', ')}` }, { status: 400 })
    }

    const rows: Record<string, string>[] = []
    sheet.eachRow((row, rowNum) => {
      if (rowNum === 1) return
      const obj: Record<string, string> = {}
      row.eachCell((cell, colNum) => {
        if (headers[colNum]) obj[headers[colNum]] = String(cell.value ?? '').trim()
      })
      if (obj.nome) rows.push(obj)
    })

    if (rows.length === 0) return NextResponse.json({ error: 'Nenhuma linha válida encontrada' }, { status: 400 })

    // Check all exist
    const nomes = rows.map(r => r.nome)
    const { data: existing } = await supabaseServer.from('fornecedores').select('id, nome').in('nome', nomes)
    const existingMap = new Map((existing ?? []).map(f => [f.nome as string, f.id as number]))

    const naoExistentes = nomes.filter(n => !existingMap.has(n))
    if (naoExistentes.length > 0) {
      return NextResponse.json({
        error: `Os seguintes fornecedores não existem no sistema: ${naoExistentes.join(', ')}. Cadastre-os primeiro.`
      }, { status: 400 })
    }

    const errors: string[] = []
    let count = 0

    for (const row of rows) {
      const digitos = somenteDigitos(row.cnpj_cpf ?? '')
      if (digitos.length !== 11 && digitos.length !== 14) {
        errors.push(`"${row.nome}": CPF/CNPJ inválido`)
        continue
      }
      const id = existingMap.get(row.nome)
      if (!id) continue

      const { error: errUpd } = await supabaseServer.from('fornecedores').update({
        cnpj_cpf: formatarCpfCnpj(digitos),
        rua_avenida: row.rua_avenida,
        numero: row.numero,
        complemento: row.complemento || null,
        bairro: row.bairro,
        cidade: row.cidade,
        estado: row.estado.toUpperCase(),
        cep: row.cep,
      }).eq('id', id)

      if (errUpd) errors.push(`"${row.nome}": ${errUpd.message}`)
      else count++
    }

    if (count === 0 && errors.length > 0) {
      return NextResponse.json({ error: errors.join('; ') }, { status: 400 })
    }

    return NextResponse.json({ ok: true, count, warnings: errors.length > 0 ? errors : undefined })
  } catch (err) {
    console.error('Importar completo error:', err)
    return NextResponse.json({ error: 'Erro ao processar arquivo' }, { status: 500 })
  }
}
