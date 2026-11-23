import { uploadFile } from '@/lib/b2'
import { parseExtrato, type ExtratoParseado } from '@/lib/extratoBancarioParser'
import type { ErroHttp } from '@/lib/extratoVinculo'
import type { createServerClient } from '@/lib/supabase/server'

type Db = ReturnType<typeof createServerClient>
const COLS = 'id, conta, periodo_inicio, periodo_fim, saldo_inicial, saldo_final, formato_origem, nome_arquivo, criado_em'

export type ResultadoImportacao =
  | { extrato: Record<string, unknown>; lancamentos: ExtratoParseado['lancamentos'] }
  | (ErroHttp & { duplicado?: boolean })

// Importa um extrato (CSV, OFX ou TXT) no projeto: lê, recusa duplicado (mesma conta e período), guarda o original no B2 e grava extrato + linhas.
// Usado pela rota da tela e pela página de upload do MCP.
export async function importarExtrato(supabase: Db, projetoId: number, usuario: string, nomeArquivo: string, buffer: Buffer): Promise<ResultadoImportacao> {
  let formato: 'csv' | 'ofx' | 'txt'
  let extrato: ExtratoParseado
  try {
    ;({ formato, extrato } = parseExtrato(nomeArquivo, buffer.toString('utf-8')))
  } catch (e) {
    return { erro: (e as Error).message, status: 422 }
  }
  if (extrato.lancamentos.length === 0) return { erro: 'Nenhum lançamento encontrado no arquivo', status: 422 }

  const { data: existente } = await supabase.from('extratos_bancarios').select('id, formato_origem, nome_arquivo, criado_em')
    .eq('projeto_id', projetoId).eq('conta', extrato.conta).eq('periodo_inicio', extrato.periodoInicio).eq('periodo_fim', extrato.periodoFim).maybeSingle()
  if (existente) {
    return {
      erro: `Esse extrato (conta ${extrato.conta}, período ${extrato.periodoInicio} a ${extrato.periodoFim}) já foi enviado anteriormente (arquivo ${existente.nome_arquivo}, formato ${existente.formato_origem}).`,
      status: 409, duplicado: true,
    }
  }

  let anexoId: string | null = null
  try {
    anexoId = (await uploadFile(buffer, nomeArquivo, 'text/plain')).fileId
  } catch (e) {
    console.warn('B2 upload do extrato falhou:', e)
  }

  const { data: inserido, error: erroExtrato } = await supabase.from('extratos_bancarios').insert({
    projeto_id: projetoId, conta: extrato.conta, periodo_inicio: extrato.periodoInicio, periodo_fim: extrato.periodoFim,
    saldo_inicial: extrato.saldoInicial, saldo_final: extrato.saldoFinal, formato_origem: formato, nome_arquivo: nomeArquivo, anexo_id: anexoId, usuario,
  }).select(COLS).single()
  if (erroExtrato || !inserido) return { erro: erroExtrato?.message ?? 'Falha ao salvar extrato', status: 500 }

  const { error: erroLancamentos } = await supabase.from('extratos_bancarios_lancamentos').insert(extrato.lancamentos.map(l => ({
    extrato_id: inserido.id, data: l.data, descricao: l.descricao, valor: l.valor, saldo_apos: l.saldoApos, codigo_origem: l.codigoOrigem,
  })))
  if (erroLancamentos) return { erro: erroLancamentos.message, status: 500 }

  return { extrato: inserido, lancamentos: extrato.lancamentos }
}
