import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { supabaseServer } from '@/lib/supabase/server'
import ExcelJS from 'exceljs'

const REQUIRED_COLS = ['id_pedido_importado', 'empresa', 'categoria', 'cliente', 'mes', 'ano', 'valor_referente']

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
      headers[colNum] = String(cell.value ?? '').trim()
    })

    const missing = REQUIRED_COLS.filter(c => !headers.includes(c))
    if (missing.length > 0) {
      return NextResponse.json({ error: `Colunas faltando: ${missing.join(', ')}` }, { status: 400 })
    }

    const rows: Record<string, unknown>[] = []
    sheet.eachRow((row, rowNum) => {
      if (rowNum === 1) return
      const obj: Record<string, unknown> = {}
      row.eachCell((cell, colNum) => {
        if (headers[colNum]) obj[headers[colNum]] = cell.value
      })
      if (obj.id_pedido_importado != null && obj.empresa) rows.push(obj)
    })

    if (rows.length === 0) return NextResponse.json({ error: 'Arquivo sem dados' }, { status: 400 })

    // Validate empresas, categorias, clientes
    const empresasSet = [...new Set(rows.map(r => String(r.empresa ?? '')))]
    const clientesSet = [...new Set(rows.map(r => String(r.cliente ?? '')))]

    const [{ data: empData }, { data: catData }, { data: cliData }] = await Promise.all([
      supabaseServer.from('empresas').select('nome').in('nome', empresasSet),
      supabaseServer.from('categorias_receita').select('empresa, categoria'),
      supabaseServer.from('clientes').select('nome').in('nome', clientesSet),
    ])

    const empresasValidas = new Set((empData ?? []).map(e => e.nome as string))
    const categoriasValidas = new Set((catData ?? []).map(r => `${r.empresa}||${r.categoria}`))
    const clientesValidos = new Set((cliData ?? []).map(c => c.nome as string))

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

    const invalidClientes = clientesSet.filter(c => !clientesValidos.has(c))
    if (invalidClientes.length > 0) {
      return NextResponse.json({ error: `Clientes não encontrados: ${invalidClientes.join(', ')}` }, { status: 400 })
    }

    // Group by id_pedido_importado
    const groups = new Map<string, typeof rows>()
    for (const row of rows) {
      const key = String(row.id_pedido_importado)
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key)!.push(row)
    }

    const today = new Date().toISOString().split('T')[0]
    let count = 0

    for (const [, pedidoRows] of groups) {
      const first = pedidoRows[0]
      const valorTotal = pedidoRows.reduce((s, r) => s + Number(r.valor_referente ?? 0), 0)

      const { data: pedido, error: errPedido } = await supabaseServer
        .from('pedidos_solicitados_receita')
        .insert({
          empresa: String(first.empresa ?? ''),
          categoria: String(first.categoria ?? ''),
          cliente: String(first.cliente ?? ''),
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

      if (errPedido || !pedido) continue

      const fluxos = pedidoRows.map(r => ({
        pedido_id: pedido.id,
        empresa: String(first.empresa ?? ''),
        categoria: String(first.categoria ?? ''),
        cliente: String(first.cliente ?? ''),
        mes: Number(r.mes ?? 0),
        ano: Number(r.ano ?? 0),
        valor_referente: Number(r.valor_referente ?? 0),
      }))

      await supabaseServer.from('pedidos_solicitados_fluxo_receita').insert(fluxos)
      count++
    }

    return NextResponse.json({ ok: true, count })
  } catch (err) {
    console.error('Import pedidos-receita error:', err)
    return NextResponse.json({ error: 'Erro ao processar arquivo' }, { status: 500 })
  }
}
