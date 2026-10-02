import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase/server'
import { CONTAS, candidatos, carregarContasLivres, tipoDoValor, type TipoConta } from '@/lib/extratoVinculo'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { id } = await params
  const supabase = createServerClient()

  const { data: extrato } = await supabase
    .from('extratos_bancarios')
    .select('id, conta, periodo_inicio, periodo_fim, saldo_inicial, saldo_final, formato_origem, nome_arquivo, criado_em')
    .eq('id', id)
    .eq('projeto_id', session.projetoId)
    .maybeSingle()

  if (!extrato) return NextResponse.json({ error: 'Extrato não encontrado' }, { status: 404 })

  const { data: lancamentos, error } = await supabase
    .from('extratos_bancarios_lancamentos')
    .select('id, data, descricao, valor, saldo_apos, codigo_origem')
    .eq('extrato_id', id)
    .order('data', { ascending: true })
    .order('id', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  try {
    const ids = (lancamentos ?? []).map(l => l.id as number)
    const [min, max] = [Math.min(...ids), Math.max(...ids)] // ids de um extrato são inseridos em lote, ficam contíguos
    const tipos = new Set<TipoConta>((lancamentos ?? []).map(l => tipoDoValor(l.valor as number)))

    const vinculos = new Map<number, { tipo: TipoConta; conta_id: number; parte: string }>()
    const livres = {} as Record<TipoConta, Awaited<ReturnType<typeof carregarContasLivres>>>
    for (const tipo of tipos) {
      const { tabela, pedido, parte, benef } = CONTAS[tipo]
      const { data } = await supabase
        .from(tabela)
        .select(`id, extrato_lancamento_id, ${benef}, ${pedido}(${parte})`)
        .eq('projeto_id', session.projetoId)
        .gte('extrato_lancamento_id', min)
        .lte('extrato_lancamento_id', max)
      for (const r of (data ?? []) as unknown as Record<string, unknown>[]) {
        const ped = (r[pedido] ?? {}) as Record<string, string>
        vinculos.set(r.extrato_lancamento_id as number, { tipo, conta_id: r.id as number, parte: (r[benef] as string | null) ?? ped[parte] ?? '' })
      }
      livres[tipo] = await carregarContasLivres(supabase, session.projetoId, tipo)
    }

    return NextResponse.json({
      extrato,
      lancamentos: (lancamentos ?? []).map(l => {
        const vinculo = vinculos.get(l.id as number) ?? null
        return {
          ...l,
          tipo: tipoDoValor(l.valor as number),
          vinculo,
          candidatos: vinculo ? [] : candidatos(l as { data: string; valor: number }, livres[tipoDoValor(l.valor as number)]),
        }
      }),
    })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
