import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { supabaseServer } from '@/lib/supabase/server'
import ExcelJS from 'exceljs'

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

    // Find "Fornecedor" column (case-insensitive)
    let fornecedorCol = 0
    sheet.getRow(1).eachCell((cell, colNum) => {
      if (String(cell.value ?? '').trim().toLowerCase() === 'fornecedor') fornecedorCol = colNum
    })
    if (!fornecedorCol) return NextResponse.json({ error: 'Coluna "Fornecedor" não encontrada' }, { status: 400 })

    const nomes: string[] = []
    sheet.eachRow((row, rowNum) => {
      if (rowNum === 1) return
      const val = String(row.getCell(fornecedorCol).value ?? '').trim()
      if (val) nomes.push(val)
    })

    if (nomes.length === 0) return NextResponse.json({ error: 'Nenhum nome encontrado no arquivo' }, { status: 400 })

    // Check for existing
    const { data: existing } = await supabaseServer.from('fornecedores').select('nome').in('nome', nomes)
    const existingSet = new Set((existing ?? []).map(f => f.nome as string))
    const existentes = nomes.filter(n => existingSet.has(n))

    if (existentes.length > 0) {
      return NextResponse.json({
        error: `Os seguintes fornecedores já existem: ${existentes.join(', ')}`
      }, { status: 400 })
    }

    const { error: errIns } = await supabaseServer.from('fornecedores').insert(nomes.map(nome => ({ nome })))
    if (errIns) throw errIns

    return NextResponse.json({ ok: true, count: nomes.length })
  } catch (err) {
    console.error('Importar fornecedores error:', err)
    return NextResponse.json({ error: 'Erro ao processar arquivo' }, { status: 500 })
  }
}
