import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { supabaseServer } from '@/lib/supabase/server'
import ExcelJS from 'exceljs'

const REQUIRED_COLS = ['empresa', 'categoria', 'fornecedor', 'mes', 'ano', 'valor_referente']

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

    // Parse header row
    const headers: string[] = []
    sheet.getRow(1).eachCell((cell, colNum) => {
      headers[colNum] = String(cell.value ?? '').trim()
    })

    const missing = REQUIRED_COLS.filter(c => !headers.includes(c))
    if (missing.length > 0) {
      return NextResponse.json(
        { error: `Colunas faltando: ${missing.join(', ')}` },
        { status: 400 }
      )
    }

    // Parse data rows
    const rows: Record<string, unknown>[] = []
    sheet.eachRow((row, rowNum) => {
      if (rowNum === 1) return
      const obj: Record<string, unknown> = {}
      row.eachCell((cell, colNum) => {
        if (headers[colNum]) obj[headers[colNum]] = cell.value
      })
      // Skip empty rows
      if (obj.empresa) rows.push(obj)
    })

    if (rows.length === 0) return NextResponse.json({ error: 'Arquivo sem dados' }, { status: 400 })

    // Valida contra os cadastros do projeto (o banco tem FK em empresa+categoria e fornecedor)
    const empresasSet = [...new Set(rows.map(r => String(r.empresa ?? '')))]
    const beneficiario = (r: Record<string, unknown>) => String(r.fornecedor_beneficiario ?? '').trim() || String(r.fornecedor ?? '')
    const fornecedoresSet = [...new Set(rows.flatMap(r => [String(r.fornecedor ?? ''), beneficiario(r)]))]
    const [{ data: empData }, { data: catData }, { data: fornData }] = await Promise.all([
      supabaseServer.from('empresas').select('empresa').eq('projeto_id', session.projetoId).in('empresa', empresasSet),
      supabaseServer.from('categorias').select('empresa, categoria').eq('projeto_id', session.projetoId),
      supabaseServer.from('fornecedores').select('nome').eq('projeto_id', session.projetoId).in('nome', fornecedoresSet),
    ])
    const empresasValidas = new Set((empData ?? []).map(e => e.empresa as string))
    const categoriasValidas = new Set((catData ?? []).map(r => `${r.empresa}||${r.categoria}`))
    const fornecedoresValidos = new Set((fornData ?? []).map(f => f.nome as string))

    const invalidEmpresas = empresasSet.filter(e => !empresasValidas.has(e))
    if (invalidEmpresas.length > 0) {
      return NextResponse.json({ error: `Empresas não encontradas: ${invalidEmpresas.join(', ')}` }, { status: 400 })
    }
    const invalidCats = rows
      .filter(r => !categoriasValidas.has(`${r.empresa}||${r.categoria}`))
      .map(r => `${r.categoria} (${r.empresa})`)
    if (invalidCats.length > 0) {
      return NextResponse.json({ error: `Categorias inválidas: ${[...new Set(invalidCats)].join(', ')}` }, { status: 400 })
    }
    const invalidForn = fornecedoresSet.filter(f => !fornecedoresValidos.has(f))
    if (invalidForn.length > 0) {
      return NextResponse.json({ error: `Fornecedores não cadastrados: ${invalidForn.join(', ')}` }, { status: 400 })
    }

    // Group rows by id_pedido_importado
    const groups = new Map<string, typeof rows>()
    for (const row of rows) {
      const key = row.id_pedido_importado != null ? String(row.id_pedido_importado) : `${row.empresa}|${row.categoria}|${row.fornecedor}`
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key)!.push(row)
    }

    const today = new Date().toISOString().split('T')[0]
    let count = 0

    for (const [, pedidoRows] of groups) {
      const first = pedidoRows[0]
      const valorTotal = pedidoRows.reduce((s, r) => s + Number(r.valor_referente ?? 0), 0)

      const { data: pedido, error: errPedido } = await supabaseServer
        .from('pedidos_solicitados')
        .insert({
          projeto_id: session.projetoId,
          empresa: String(first.empresa ?? ''),
          categoria: String(first.categoria ?? ''),
          fornecedor: String(first.fornecedor ?? ''),
          valor_pedido: valorTotal,
          observacao: null,
          emergencia: false,
          status: 'Aguardando Autorização',
          data_solicitacao: today,
          arquivo_texto: [],
          arquivos_pdf_ids: [],
        })
        .select('id')
        .single()

      if (errPedido || !pedido) {
        return NextResponse.json({ error: `Falha ao criar pedido de ${first.fornecedor} (${count} já importado(s)): ${errPedido?.message}` }, { status: 500 })
      }

      const fluxos = pedidoRows.map(r => ({
        pedido_id: pedido.id,
        empresa: String(first.empresa ?? ''),
        categoria: String(first.categoria ?? ''),
        fornecedor: String(first.fornecedor ?? ''),
        fornecedor_beneficiario: beneficiario(r),
        mes: Number(r.mes ?? 0),
        ano: Number(r.ano ?? 0),
        valor_referente: Number(r.valor_referente ?? 0),
      }))

      const { error: errFluxo } = await supabaseServer.from('pedidos_solicitados_fluxo').insert(fluxos)
      if (errFluxo) {
        await supabaseServer.from('pedidos_solicitados').delete().eq('id', pedido.id)
        return NextResponse.json({ error: `Falha ao gravar os períodos de ${first.fornecedor} (${count} já importado(s)): ${errFluxo.message}` }, { status: 500 })
      }
      count++
    }

    return NextResponse.json({ ok: true, count })
  } catch (err) {
    console.error('Import error:', err)
    return NextResponse.json({ error: 'Erro ao processar arquivo' }, { status: 500 })
  }
}
