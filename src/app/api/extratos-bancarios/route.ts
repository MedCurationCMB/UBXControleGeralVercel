import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase/server'
import { uploadFile } from '@/lib/b2'
import { parseExtrato } from '@/lib/extratoBancarioParser'

export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('extratos_bancarios')
    .select('id, conta, periodo_inicio, periodo_fim, saldo_inicial, saldo_final, formato_origem, nome_arquivo, criado_em')
    .eq('projeto_id', session.projetoId)
    .order('periodo_inicio', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ extratos: data })
}

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const form = await req.formData()
  const file = form.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'Arquivo obrigatório' }, { status: 400 })

  const buffer = Buffer.from(await file.arrayBuffer())
  let text: string
  try {
    text = buffer.toString('utf-8')
  } catch {
    text = buffer.toString('latin1')
  }

  let formato: 'csv' | 'ofx' | 'txt'
  let extrato: ReturnType<typeof parseExtrato>['extrato']
  try {
    ;({ formato, extrato } = parseExtrato(file.name, text))
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 422 })
  }

  if (extrato.lancamentos.length === 0) {
    return NextResponse.json({ error: 'Nenhum lançamento encontrado no arquivo' }, { status: 422 })
  }

  const supabase = createServerClient()

  const { data: existente } = await supabase
    .from('extratos_bancarios')
    .select('id, formato_origem, nome_arquivo, criado_em')
    .eq('projeto_id', session.projetoId)
    .eq('conta', extrato.conta)
    .eq('periodo_inicio', extrato.periodoInicio)
    .eq('periodo_fim', extrato.periodoFim)
    .maybeSingle()

  if (existente) {
    return NextResponse.json(
      {
        error: `Esse extrato (conta ${extrato.conta}, período ${extrato.periodoInicio} a ${extrato.periodoFim}) já foi enviado anteriormente (arquivo ${existente.nome_arquivo}, formato ${existente.formato_origem}).`,
        duplicado: true,
      },
      { status: 409 }
    )
  }

  let anexoId: string | null = null
  try {
    const { fileId } = await uploadFile(buffer, file.name, 'text/plain')
    anexoId = fileId
  } catch (e) {
    console.warn('B2 upload do extrato falhou:', e)
  }

  const { data: extratoInserido, error: erroExtrato } = await supabase
    .from('extratos_bancarios')
    .insert({
      projeto_id: session.projetoId,
      conta: extrato.conta,
      periodo_inicio: extrato.periodoInicio,
      periodo_fim: extrato.periodoFim,
      saldo_inicial: extrato.saldoInicial,
      saldo_final: extrato.saldoFinal,
      formato_origem: formato,
      nome_arquivo: file.name,
      anexo_id: anexoId,
      usuario: session.username,
    })
    .select('id, conta, periodo_inicio, periodo_fim, saldo_inicial, saldo_final, formato_origem, nome_arquivo, criado_em')
    .single()

  if (erroExtrato || !extratoInserido) {
    return NextResponse.json({ error: erroExtrato?.message ?? 'Falha ao salvar extrato' }, { status: 500 })
  }

  const { error: erroLancamentos } = await supabase.from('extratos_bancarios_lancamentos').insert(
    extrato.lancamentos.map(l => ({
      extrato_id: extratoInserido.id,
      data: l.data,
      descricao: l.descricao,
      valor: l.valor,
      saldo_apos: l.saldoApos,
      codigo_origem: l.codigoOrigem,
    }))
  )

  if (erroLancamentos) {
    return NextResponse.json({ error: erroLancamentos.message }, { status: 500 })
  }

  return NextResponse.json({ duplicado: false, extrato: extratoInserido, lancamentos: extrato.lancamentos })
}
