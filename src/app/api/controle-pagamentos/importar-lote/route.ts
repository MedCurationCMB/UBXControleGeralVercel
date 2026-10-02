import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { supabaseServer } from '@/lib/supabase/server'
import ExcelJS from 'exceljs'
import { valorCelula, parseDate, parseNumero } from '@/lib/importacao-lote'
import { beneficiariosPorPedido } from '@/lib/beneficiarios'

const REQUIRED_COLS = ['pedido_id', 'data_vencimento', 'valor_pagar', 'tipo_pagamento']

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
      tipo_pagamento: number; data_pagamento: string | null; valor_pagamento: number | null; beneficiario: string | null
    }
    const rows: Linha[] = []
    const rejeitadas: { linha: number; motivo: string }[] = []

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

      const tipoRaw = String(obj.tipo_pagamento ?? '').trim()
      const tipoPag = /^[1-5]$/.test(tipoRaw) ? parseInt(tipoRaw) : NaN
      if (!tipoPag) erros.push('tipo_pagamento deve ser 1 a 5')

      const dataPag = parseDate(obj.data_pagamento)
      if (dataPag === undefined) erros.push('data_pagamento inválida (use DD/MM/AAAA)')
      const valorPago = parseNumero(obj.valor_pagamento)
      if (valorPago === undefined || (valorPago != null && valorPago < 0)) erros.push('valor_pagamento inválido')

      if (erros.length) { rejeitadas.push({ linha: rowNum, motivo: erros.join('; ') }); return }
      rows.push({
        linha: rowNum, pedido_id: pedidoId, data_vencimento: dataVenc as string, valor_pagar: valorPagar as number,
        tipo_pagamento: tipoPag, data_pagamento: dataPag as string | null, valor_pagamento: valorPago as number | null,
        beneficiario: String(obj.fornecedor_beneficiario ?? '').trim() || null,
      })
    })

    // Só aceita pedidos do projeto ativo, autorizados e não cancelados (mesma regra do cadastro individual)
    const pedidoIds = [...new Set(rows.map(r => r.pedido_id))]
    const pedidosValidos = new Set<number>()
    for (let i = 0; i < pedidoIds.length; i += 500) {
      const { data: pedData, error: pedErr } = await supabaseServer
        .from('pedidos_solicitados').select('id')
        .eq('projeto_id', session.projetoId).eq('status', 'Autorizado').eq('cancelado', false)
        .in('id', pedidoIds.slice(i, i + 500))
      if (pedErr) return NextResponse.json({ error: pedErr.message }, { status: 500 })
      ;(pedData ?? []).forEach(p => pedidosValidos.add(p.id as number))
    }
    // O beneficiário (quem recebe) tem que ser um dos beneficiários do pedido; em branco, só vale se o pedido tiver um só
    const beneficiarios = await beneficiariosPorPedido(supabaseServer, 'pagar', [...pedidosValidos])
    const validas = rows.filter(r => {
      if (!pedidosValidos.has(r.pedido_id)) {
        rejeitadas.push({ linha: r.linha, motivo: `pedido #${r.pedido_id} não encontrado neste projeto, não autorizado ou cancelado` })
        return false
      }
      const opcoes = beneficiarios.get(r.pedido_id) ?? []
      if (r.beneficiario) {
        const achado = opcoes.find(o => o.toLowerCase() === r.beneficiario!.toLowerCase())
        if (!achado) {
          rejeitadas.push({ linha: r.linha, motivo: `fornecedor_beneficiario '${r.beneficiario}' não está entre os beneficiários do pedido #${r.pedido_id} (${opcoes.join(', ')})` })
          return false
        }
        r.beneficiario = achado
      } else if (opcoes.length === 1) {
        r.beneficiario = opcoes[0]
      } else {
        rejeitadas.push({ linha: r.linha, motivo: `pedido #${r.pedido_id} tem mais de um beneficiário (${opcoes.join(', ')}); informe fornecedor_beneficiario` })
        return false
      }
      return true
    })
    rejeitadas.sort((a, b) => a.linha - b.linha)

    if (validas.length === 0) {
      return NextResponse.json({ error: 'Nenhuma linha válida encontrada', rejeitadas }, { status: 400 })
    }

    const inserts = validas.map(r => ({
      pedido_id: r.pedido_id,
      fornecedor_beneficiario: r.beneficiario,
      data_vencimento: r.data_vencimento,
      valor_pagar: r.valor_pagar,
      tipo_pagamento: r.tipo_pagamento,
      data_pagamento: r.data_pagamento,
      valor_pagamento: r.valor_pagamento,
      status_pagamento: 1,
    }))

    const { error } = await supabaseServer.from('controle_pagamentos').insert(inserts)
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })

    return NextResponse.json({ ok: true, count: validas.length, rejeitadas })
  } catch (err) {
    console.error('Importar pagamentos lote error:', err)
    return NextResponse.json({ error: 'Erro ao processar arquivo' }, { status: 500 })
  }
}
