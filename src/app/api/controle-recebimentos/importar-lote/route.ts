import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { supabaseServer } from '@/lib/supabase/server'
import ExcelJS from 'exceljs'
import { valorCelula, parseDate, parseNumero } from '@/lib/importacao-lote'

const REQUIRED_COLS = ['pedido_id', 'data_vencimento', 'valor_pagar', 'tipo_recebimento']

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

    interface Linha {
      linha: number; pedido_id: number; data_vencimento: string; valor_pagar: number
      tipo_recebimento: number; data_pagamento: string | null; valor_pagamento: number | null
    }
    const rows: Linha[] = []
    const rejeitadas: { linha: number; motivo: string }[] = []

    // Tipos cadastrados (ids válidos)
    const { data: tiposData, error: tiposErr } = await supabaseServer.from('tipos_recebimento').select('id')
    if (tiposErr) return NextResponse.json({ error: tiposErr.message }, { status: 500 })
    const tiposValidos = new Set((tiposData ?? []).map(t => t.id as number))

    sheet.eachRow((row, rowNum) => {
      if (rowNum === 1) return
      const obj: Record<string, unknown> = {}
      row.eachCell((cell, colNum) => {
        if (headers[colNum]) obj[headers[colNum]] = valorCelula(cell.value)
      })
      const vazia = Object.values(obj).every(v => v == null || String(v).trim() === '')
      if (vazia || String(obj.pedido_id ?? '').trim().startsWith('--')) return // linha em branco ou de anotação

      const erros: string[] = []
      const pedidoRaw = String(obj.pedido_id ?? '').trim()
      const pedidoId = /^\d+$/.test(pedidoRaw) ? parseInt(pedidoRaw) : NaN
      if (!pedidoId) erros.push('pedido_id inválido')

      const dataVenc = parseDate(obj.data_vencimento)
      if (!dataVenc) erros.push('data_vencimento ausente ou inválida (use DD/MM/AAAA)')

      const valorPagar = parseNumero(obj.valor_pagar)
      if (valorPagar == null || valorPagar <= 0) erros.push('valor_pagar ausente, zero ou inválido')

      const tipoRaw = String(obj.tipo_recebimento ?? '').trim()
      const tipoRec = /^\d+$/.test(tipoRaw) ? parseInt(tipoRaw) : NaN
      if (!tipoRec || !tiposValidos.has(tipoRec)) erros.push('tipo_recebimento inexistente (use o ID de um tipo cadastrado)')

      const dataPag = parseDate(obj.data_pagamento)
      if (dataPag === undefined) erros.push('data_pagamento inválida (use DD/MM/AAAA)')
      const valorRec = parseNumero(obj.valor_pagamento)
      if (valorRec === undefined || (valorRec != null && valorRec < 0)) erros.push('valor_pagamento inválido')

      if (erros.length) { rejeitadas.push({ linha: rowNum, motivo: erros.join('; ') }); return }
      rows.push({
        linha: rowNum, pedido_id: pedidoId, data_vencimento: dataVenc as string, valor_pagar: valorPagar as number,
        tipo_recebimento: tipoRec, data_pagamento: dataPag as string | null, valor_pagamento: valorRec as number | null,
      })
    })

    // Só aceita pedidos do projeto ativo, autorizados e não cancelados (mesma regra do cadastro individual)
    const pedidoIds = [...new Set(rows.map(r => r.pedido_id))]
    const pedidosValidos = new Set<number>()
    for (let i = 0; i < pedidoIds.length; i += 500) {
      const { data: pedData, error: pedErr } = await supabaseServer
        .from('pedidos_solicitados_receita').select('id')
        .eq('projeto_id', session.projetoId).eq('status', 'Autorizado').eq('cancelado', false)
        .in('id', pedidoIds.slice(i, i + 500))
      if (pedErr) return NextResponse.json({ error: pedErr.message }, { status: 500 })
      ;(pedData ?? []).forEach(p => pedidosValidos.add(p.id as number))
    }
    const validas = rows.filter(r => {
      if (pedidosValidos.has(r.pedido_id)) return true
      rejeitadas.push({ linha: r.linha, motivo: `pedido #${r.pedido_id} não encontrado neste projeto, não autorizado ou cancelado` })
      return false
    })
    rejeitadas.sort((a, b) => a.linha - b.linha)

    if (validas.length === 0) {
      return NextResponse.json({ error: 'Nenhuma linha válida encontrada', rejeitadas }, { status: 400 })
    }

    const inserts = validas.map(r => ({
      pedido_id: r.pedido_id,
      data_vencimento: r.data_vencimento,
      valor_pagar: r.valor_pagar,
      tipo_recebimento: r.tipo_recebimento,
      data_pagamento: r.data_pagamento,
      valor_pagamento: r.valor_pagamento,
      status_recebimento: 1,
    }))

    const { error } = await supabaseServer.from('controle_recebimento').insert(inserts)
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })

    return NextResponse.json({ ok: true, count: validas.length, rejeitadas })
  } catch (err) {
    console.error('Importar recebimentos lote error:', err)
    return NextResponse.json({ error: 'Erro ao processar arquivo' }, { status: 500 })
  }
}
