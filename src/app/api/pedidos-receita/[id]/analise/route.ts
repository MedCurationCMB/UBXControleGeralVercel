import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { supabaseServer } from '@/lib/supabase/server'
import { chatWithAssistant } from '@/lib/gemini'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { id } = await params
  const pedidoId = parseInt(id)
  if (isNaN(pedidoId)) return NextResponse.json({ error: 'ID inválido' }, { status: 400 })

  const { data: pedido } = await supabaseServer
    .from('pedidos_solicitados_receita')
    .select('analise_texto, arquivo_texto, empresa, categoria, cliente, valor_pedido, observacao')
    .eq('id', pedidoId)
    .maybeSingle()

  if (!pedido) return NextResponse.json({ error: 'Pedido não encontrado' }, { status: 404 })

  // Return cached analysis if exists
  if (pedido.analise_texto) {
    return NextResponse.json({ analise: pedido.analise_texto, cached: true })
  }

  const textoOcr = pedido.arquivo_texto as string | null

  if (!textoOcr) {
    return NextResponse.json({ analise: null, sem_documento: true })
  }

  const prompt = `Você é um assistente de análise de documentos financeiros e de recebimentos.
Analise o seguinte texto extraído de um documento de pedido de recebimento e forneça um resumo estruturado contendo:
1. Tipo de documento identificado
2. Partes envolvidas (emitente, destinatário, cliente)
3. Valores encontrados
4. Datas importantes
5. Dados bancários ou de pagamento (se houver)
6. Observações relevantes ou alertas

Contexto do pedido:
- Empresa: ${pedido.empresa}
- Categoria: ${pedido.categoria}
- Cliente: ${pedido.cliente}
- Valor do pedido: R$ ${Number(pedido.valor_pedido).toFixed(2)}
${pedido.observacao ? `- Observação: ${pedido.observacao}` : ''}

Texto do documento:
${textoOcr}`

  try {
    const analise = await chatWithAssistant(prompt, [])

    // Cache the analysis
    await supabaseServer
      .from('pedidos_solicitados_receita')
      .update({ analise_texto: analise })
      .eq('id', pedidoId)

    return NextResponse.json({ analise, cached: false })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('Análise error:', msg)

    if (msg.includes('429') || msg.includes('Too Many Requests') || msg.includes('quota')) {
      return NextResponse.json(
        { error: 'Cota da API Gemini excedida. Tente novamente em alguns minutos ou ative o faturamento no Google Cloud.' },
        { status: 429 }
      )
    }

    return NextResponse.json({ error: `Erro ao analisar documento: ${msg}` }, { status: 500 })
  }
}
