import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { supabaseServer } from '@/lib/supabase/server'
import { sendEmail, templateAlertaVencimento } from '@/lib/smtp'

// POST /api/email — envio manual de alertas (equivalente aos scripts send_email_*.py)
export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session || (session.hierarquia !== 'admin' && session.hierarquia !== 'owner')) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  try {
    const { tipo } = await req.json()
    // tipo: 'geral_pagamento' | 'emergencial_pagamento' | 'geral_recebimento' | 'emergencial_recebimento'

    const isEmergencia = tipo.includes('emergencial')
    const isReceita = tipo.includes('recebimento')
    const tabela = isReceita ? 'controle_recebimento' : 'controle_pagamentos'
    const statusField = isReceita ? 'status_recebimento' : 'status_pagamento'

    // Busca pagamentos/recebimentos pendentes com vencimento próximo (7 dias) ou já vencidos
    const hoje = new Date()
    const limite = new Date(hoje)
    limite.setDate(hoje.getDate() + (isEmergencia ? 2 : 7))

    const { data: itens } = await supabaseServer
      .from(tabela)
      .select(`*, pedidos_solicitados(empresa, fornecedor, cliente)`)
      .eq(statusField, 1) // 1 = Pendente
      .lte('data_vencimento', limite.toISOString().split('T')[0])

    if (!itens?.length) return NextResponse.json({ ok: true, enviados: 0 })

    // Busca usuários para notificar
    const { data: usuarios } = await supabaseServer
      .from('usuarios')
      .select('email')
      .eq('status_cadastro', 'Autorizado')

    if (!usuarios?.length) return NextResponse.json({ ok: true, enviados: 0 })

    const emails = usuarios.map((u) => u.email)
    const tipoAlerta = isReceita ? 'recebimento' : 'pagamento'

    const html = templateAlertaVencimento(
      tipoAlerta,
      itens.map((i: Record<string, unknown>) => ({
        fornecedor_cliente: String((i.pedidos_solicitados as Record<string, unknown>)?.fornecedor ?? (i.pedidos_solicitados as Record<string, unknown>)?.cliente ?? ''),
        valor: Number(i.valor_pagar ?? 0),
        vencimento: String(i.data_vencimento ?? ''),
        empresa: String((i.pedidos_solicitados as Record<string, unknown>)?.empresa ?? ''),
      }))
    )

    await sendEmail({
      to: emails,
      subject: `[CMB Gestão] Alerta de ${isEmergencia ? 'Emergência — ' : ''}${isReceita ? 'Recebimentos' : 'Pagamentos'} Pendentes`,
      html,
    })

    return NextResponse.json({ ok: true, enviados: emails.length })
  } catch (err) {
    console.error('Email route error:', err)
    return NextResponse.json({ error: 'Erro ao enviar email' }, { status: 500 })
  }
}
