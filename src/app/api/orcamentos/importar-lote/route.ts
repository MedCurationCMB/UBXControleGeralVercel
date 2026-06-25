import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { supabaseServer } from '@/lib/supabase/server'
import ExcelJS from 'exceljs'

const REQUIRED_COLS = ['empresa', 'categoria', 'mês', 'ano', 'valor do orçamento']

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  try {
    const form = await req.formData()
    const file = form.get('file') as File | null
    if (!file) return NextResponse.json({ error: 'Arquivo obrigatório' }, { status: 400 })

    const arrayBuffer = await file.arrayBuffer()
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(arrayBuffer)

    const sheet = workbook.worksheets[0]
    if (!sheet) return NextResponse.json({ error: 'Planilha não encontrada' }, { status: 400 })

    // Parse header row (case-insensitive)
    const headers: string[] = []
    sheet.getRow(1).eachCell((cell, colNum) => {
      headers[colNum] = String(cell.value ?? '').trim().toLowerCase()
    })

    const missing = REQUIRED_COLS.filter(c => !headers.includes(c))
    if (missing.length > 0) {
      return NextResponse.json({ error: `Colunas faltando: ${missing.join(', ')}` }, { status: 400 })
    }

    // Load valid empresas and categorias
    const { data: cats } = await supabaseServer.from('categorias').select('empresa, categoria')
    const empresasValidas = new Set((cats ?? []).map(c => c.empresa as string))
    const catsPorEmpresa = new Map<string, Set<string>>()
    for (const c of cats ?? []) {
      if (!catsPorEmpresa.has(c.empresa)) catsPorEmpresa.set(c.empresa, new Set())
      catsPorEmpresa.get(c.empresa)!.add(c.categoria)
    }

    const today = new Date().toISOString().split('T')[0]
    const invalidos: string[] = []
    const inserts: object[] = []

    sheet.eachRow((row, rowNum) => {
      if (rowNum === 1) return

      const obj: Record<string, unknown> = {}
      row.eachCell((cell, colNum) => {
        if (headers[colNum]) obj[headers[colNum]] = cell.value
      })

      const empresa = String(obj['empresa'] ?? '').trim()
      const categoria = String(obj['categoria'] ?? '').trim()
      if (!empresa || !categoria) return // skip empty rows / notes

      let mes = parseInt(String(obj['mês'] ?? ''))
      if (isNaN(mes) || mes < 1 || mes > 12) {
        invalidos.push(`Linha ${rowNum}: Mês inválido (${obj['mês']})`)
        return
      }

      const ano = parseInt(String(obj['ano'] ?? ''))
      if (isNaN(ano) || ano < 2025 || ano > 2050) {
        invalidos.push(`Linha ${rowNum}: Ano inválido (${obj['ano']})`)
        return
      }

      const valor = parseFloat(String(obj['valor do orçamento'] ?? '0'))
      if (!valor || valor <= 0) {
        invalidos.push(`Linha ${rowNum}: Valor inválido (${obj['valor do orçamento']})`)
        return
      }

      if (!empresasValidas.has(empresa)) {
        invalidos.push(`Linha ${rowNum}: Empresa '${empresa}' não encontrada`)
        return
      }

      if (!catsPorEmpresa.get(empresa)?.has(categoria)) {
        invalidos.push(`Linha ${rowNum}: Categoria '${categoria}' não encontrada para empresa '${empresa}'`)
        return
      }

      const observacao = obj['observação'] ? String(obj['observação']).trim() : null

      inserts.push({
        empresa,
        categoria,
        mes,
        ano,
        valor_orcamento: valor,
        data_criacao: today,
        usuario_criador: session.username,
        observacao: observacao || null,
      })
    })

    if (invalidos.length > 0 && inserts.length === 0) {
      return NextResponse.json({ error: invalidos.join('; ') }, { status: 400 })
    }

    if (inserts.length === 0) {
      return NextResponse.json({ error: 'Nenhum registro válido para importar' }, { status: 400 })
    }

    const { error: errIns } = await supabaseServer.from('registro_orcamentos').insert(inserts)
    if (errIns) throw errIns

    const warnings = invalidos.length > 0 ? invalidos : undefined
    return NextResponse.json({ ok: true, count: inserts.length, warnings })
  } catch (err) {
    console.error('Importar orçamentos error:', err)
    return NextResponse.json({ error: 'Erro ao processar arquivo' }, { status: 500 })
  }
}
