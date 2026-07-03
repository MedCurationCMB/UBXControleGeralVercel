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

    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(await file.arrayBuffer())

    const sheet = workbook.worksheets[0]
    if (!sheet) return NextResponse.json({ error: 'Planilha não encontrada' }, { status: 400 })

    const headers: string[] = []
    sheet.getRow(1).eachCell((cell, colNum) => {
      headers[colNum] = String(cell.value ?? '').trim().toLowerCase()
    })

    const missing = REQUIRED_COLS.filter(c => !headers.includes(c))
    if (missing.length > 0) {
      return NextResponse.json({ error: `Colunas faltando: ${missing.join(', ')}` }, { status: 400 })
    }

    const rows: Array<{
      empresa: string; categoria: string; mes: number; ano: number
      valor_orcamento: number; observacao: string | null
    }> = []

    sheet.eachRow((row, rowNum) => {
      if (rowNum === 1) return
      const obj: Record<string, unknown> = {}
      row.eachCell((cell, colNum) => {
        if (headers[colNum]) obj[headers[colNum]] = cell.value
      })

      const empresa = String(obj['empresa'] ?? '').trim()
      const categoria = String(obj['categoria'] ?? '').trim()
      const mes = parseInt(String(obj['mês'] ?? obj['mes'] ?? ''))
      const ano = parseInt(String(obj['ano'] ?? ''))
      const valor = parseFloat(String(obj['valor do orçamento'] ?? '0'))

      if (!empresa || !categoria || isNaN(mes) || isNaN(ano) || !valor) return
      if (mes < 1 || mes > 12) return
      if (ano < 2025 || ano > 2050) return
      if (valor <= 0) return

      rows.push({
        empresa, categoria, mes, ano, valor_orcamento: valor,
        observacao: obj['observação'] ? String(obj['observação']).trim() || null : null,
      })
    })

    if (rows.length === 0) {
      return NextResponse.json({ error: 'Nenhuma linha válida encontrada' }, { status: 400 })
    }

    // Validate empresas
    const empresasSet = [...new Set(rows.map(r => r.empresa))]
    const { data: empData } = await supabaseServer
      .from('categorias_receita').select('empresa, categoria')
    const catValidas = new Set((empData ?? []).map(r => `${r.empresa}||${r.categoria}`))

    const invalid = rows.filter(r => !catValidas.has(`${r.empresa}||${r.categoria}`))
      .map(r => `${r.categoria} (${r.empresa})`)
    if (invalid.length > 0) {
      return NextResponse.json({
        error: `Empresa/Categoria não encontradas: ${[...new Set(invalid)].join(', ')}`
      }, { status: 400 })
    }

    const today = new Date().toISOString().split('T')[0]
    const username = session.username ?? 'sistema'

    const inserts = rows.map(r => ({
      empresa: r.empresa,
      categoria: r.categoria,
      mes: r.mes,
      ano: r.ano,
      valor_orcamento: r.valor_orcamento,
      observacao: r.observacao,
      data_criacao: today,
      usuario_criador: username,
    }))

    const { error } = await supabaseServer.from('registro_orcamentos_receita').insert(inserts)
    if (error) throw error

    return NextResponse.json({ ok: true, count: rows.length })
  } catch (err) {
    console.error('Importar orçamentos receita error:', err)
    return NextResponse.json({ error: 'Erro ao processar arquivo' }, { status: 500 })
  }
}
