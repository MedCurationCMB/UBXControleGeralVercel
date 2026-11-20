// Regras do vinculo extrato <-> contas a pagar/receber. Saida (valor < 0) so vincula a conta a pagar,
// entrada (valor > 0) so a conta a receber. Valor tem que ser igual; se a conta ja tem data de pagamento,
// ela tem que ser a data do extrato (sem data de pagamento, so o vencimento serve de pista para sugerir).
import type { createServerClient } from '@/lib/supabase/server'

export type TipoConta = 'pagar' | 'receber'

export const CONTAS = {
  pagar: {
    tabela: 'controle_pagamentos', pedido: 'pedidos_solicitados', fluxo: 'pedidos_solicitados_fluxo',
    parte: 'fornecedor', benef: 'fornecedor_beneficiario', status: 'status_pagamento',
  },
  receber: {
    tabela: 'controle_recebimento', pedido: 'pedidos_solicitados_receita', fluxo: 'pedidos_solicitados_fluxo_receita',
    parte: 'cliente', benef: 'cliente_beneficiario', status: 'status_recebimento',
  },
} as const

export const tipoDoValor = (valor: number): TipoConta => (valor < 0 ? 'pagar' : 'receber')

export interface ContaLivre {
  id: number
  parte: string
  empresa: string
  data_vencimento: string | null
  data_pagamento: string | null
  valor_pagar: number | null
  valor_pagamento: number | null
}

export interface Candidato extends ContaLivre {
  valor: number
  sugerido: boolean // data do extrato bate com a data de pagamento (ou, sem ela, com o vencimento)
}

const cents = (n: number) => Math.round(n * 100)
const valorDaConta = (c: Pick<ContaLivre, 'valor_pagar' | 'valor_pagamento'>) => c.valor_pagamento ?? c.valor_pagar ?? 0

export function erroVinculo(l: { data: string; valor: number }, c: ContaLivre): string | null {
  if (cents(valorDaConta(c)) !== cents(Math.abs(l.valor))) return 'O valor da conta é diferente do valor da linha do extrato.'
  if (c.data_pagamento && c.data_pagamento.slice(0, 10) !== l.data) return 'A data de pagamento da conta é diferente da data da linha do extrato.'
  return null
}

// Varias contas numa linha do extrato (folha por colaborador, rateio por centro): a soma tem que fechar com o valor da linha
// e cada conta, se ja tem data de pagamento, tem que ser a da linha. Uma conta so e o caso particular.
export function erroGrupo(l: { data: string; valor: number }, contas: ContaLivre[]): string | null {
  if (contas.length === 0) return 'Marque ao menos uma conta.'
  if (contas.reduce((s, c) => s + cents(valorDaConta(c)), 0) !== cents(Math.abs(l.valor))) return 'A soma das contas marcadas é diferente do valor da linha do extrato.'
  if (contas.some(c => c.data_pagamento && c.data_pagamento.slice(0, 10) !== l.data)) return 'A data de pagamento de uma das contas é diferente da data da linha do extrato.'
  return null
}

// Contas livres que podem entrar no grupo da linha: pagas no dia da linha, mais as que casam sozinhas com o valor (ex.: sem data de pagamento).
export function contasDoDia(l: { data: string; valor: number }, contas: ContaLivre[]): Candidato[] {
  const sozinhas = new Set(candidatos(l, contas, Infinity).map(c => c.id))
  return contas
    .filter(c => c.data_pagamento?.slice(0, 10) === l.data || sozinhas.has(c.id))
    .map(c => ({ ...c, valor: valorDaConta(c), sugerido: (c.data_pagamento ?? c.data_vencimento)?.slice(0, 10) === l.data }))
    .sort((a, b) => a.id - b.id)
}

const PAGE = 1000

// ponytail: traz todas as contas sem vinculo do projeto e filtra em memoria; filtrar por valor no banco
// se passar de alguns milhares de contas abertas.
export async function carregarContasLivres(
  supabase: ReturnType<typeof createServerClient>,
  projetoId: number,
  tipo: TipoConta
): Promise<ContaLivre[]> {
  const { tabela, pedido, parte, benef } = CONTAS[tipo]
  const out: ContaLivre[] = []
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await supabase
      .from(tabela)
      .select(`id, data_vencimento, data_pagamento, valor_pagar, valor_pagamento, ${benef}, ${pedido}(empresa, ${parte})`)
      .eq('projeto_id', projetoId)
      .is('extrato_lancamento_id', null)
      .order('id')
      .range(offset, offset + PAGE - 1)
    if (error) throw new Error(error.message)
    for (const r of (data ?? []) as unknown as Record<string, unknown>[]) {
      const ped = (r[pedido] ?? {}) as Record<string, string>
      out.push({
        id: r.id as number,
        parte: (r[benef] as string | null) ?? ped[parte] ?? '',
        empresa: ped.empresa ?? '',
        data_vencimento: r.data_vencimento as string | null,
        data_pagamento: r.data_pagamento as string | null,
        valor_pagar: r.valor_pagar as number | null,
        valor_pagamento: r.valor_pagamento as number | null,
      })
    }
    if (!data || data.length < PAGE) return out
  }
}

const dias = (iso: string) => Date.parse(iso.slice(0, 10)) / 86400000

export function candidatos(l: { data: string; valor: number }, contas: ContaLivre[], max = 10): Candidato[] {
  return contas
    .filter(c => erroVinculo(l, c) === null)
    .map(c => {
      const dataChave = c.data_pagamento ?? c.data_vencimento
      return {
        c: { ...c, valor: valorDaConta(c), sugerido: dataChave?.slice(0, 10) === l.data },
        dist: dataChave ? Math.abs(dias(dataChave) - dias(l.data)) : Infinity,
      }
    })
    .sort((a, b) => a.dist - b.dist)
    .slice(0, max)
    .map(x => x.c)
}

// ---- Acesso ao banco (cliente de serviço, sempre filtrado pelo projeto): usado pelas rotas e pelo MCP ----
type Db = ReturnType<typeof createServerClient>
export interface ErroHttp { erro: string; status: number }

// Linha do extrato (do projeto) -> { id, data, descricao, valor }
export async function carregarLancamento(supabase: Db, projetoId: number, id: number) {
  const { data } = await supabase
    .from('extratos_bancarios_lancamentos')
    .select('id, data, descricao, valor, extratos_bancarios!inner(projeto_id)')
    .eq('id', id)
    .eq('extratos_bancarios.projeto_id', projetoId)
    .maybeSingle()
  return data as { id: number; data: string; descricao: string; valor: number } | null
}

// Extrato com as linhas, o vínculo de cada uma e as contas candidatas das que estão sem vínculo. null = não existe. Lança Error se o banco falhar.
export async function carregarExtrato(supabase: Db, projetoId: number, id: number | string) {
  const { data: extrato } = await supabase
    .from('extratos_bancarios')
    .select('id, conta, periodo_inicio, periodo_fim, saldo_inicial, saldo_final, formato_origem, nome_arquivo, criado_em')
    .eq('id', id)
    .eq('projeto_id', projetoId)
    .maybeSingle()
  if (!extrato) return null

  const { data: lancamentos, error } = await supabase
    .from('extratos_bancarios_lancamentos')
    .select('id, data, descricao, valor, saldo_apos, codigo_origem')
    .eq('extrato_id', id)
    .order('data', { ascending: true })
    .order('id', { ascending: true })
  if (error) throw new Error(error.message)

  const ids = (lancamentos ?? []).map(l => l.id as number)
  const [min, max] = [Math.min(...ids), Math.max(...ids)] // ids de um extrato são inseridos em lote, ficam contíguos
  const tipos = new Set<TipoConta>((lancamentos ?? []).map(l => tipoDoValor(l.valor as number)))

  // uma linha pode ter várias contas (folha, rateio por centro)
  const vinculos = new Map<number, { tipo: TipoConta; contas: { conta_id: number; parte: string; valor: number }[] }>()
  const livres = {} as Record<TipoConta, ContaLivre[]>
  for (const tipo of tipos) {
    const { tabela, pedido, parte, benef } = CONTAS[tipo]
    const { data } = await supabase
      .from(tabela)
      .select(`id, extrato_lancamento_id, valor_pagar, valor_pagamento, ${benef}, ${pedido}(${parte})`)
      .eq('projeto_id', projetoId)
      .gte('extrato_lancamento_id', min)
      .lte('extrato_lancamento_id', max)
      .order('id')
    for (const r of (data ?? []) as unknown as Record<string, unknown>[]) {
      const ped = (r[pedido] ?? {}) as Record<string, string>
      const v = vinculos.get(r.extrato_lancamento_id as number) ?? { tipo, contas: [] }
      v.contas.push({ conta_id: r.id as number, parte: (r[benef] as string | null) ?? ped[parte] ?? '', valor: (r.valor_pagamento ?? r.valor_pagar ?? 0) as number })
      vinculos.set(r.extrato_lancamento_id as number, v)
    }
    livres[tipo] = await carregarContasLivres(supabase, projetoId, tipo)
  }

  return {
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
  }
}

// Confere se as contas podem ir na linha (mesmas regras e códigos HTTP da rota). Não grava nada.
export async function conferirVinculo(supabase: Db, projetoId: number, lancamentoId: number, contaIds: number[]) {
  const unicos = [...new Set(contaIds)]
  const l = await carregarLancamento(supabase, projetoId, lancamentoId)
  if (!l) return { erro: 'Linha do extrato não encontrada', status: 404 } as ErroHttp

  const { tabela } = CONTAS[tipoDoValor(l.valor)]
  const { data: contas } = await supabase
    .from(tabela)
    .select('id, extrato_lancamento_id, data_vencimento, data_pagamento, valor_pagar, valor_pagamento')
    .in('id', unicos)
    .eq('projeto_id', projetoId)
  if (contas?.length !== unicos.length) return { erro: 'Conta não encontrada', status: 404 } as ErroHttp
  if (contas.some(c => c.extrato_lancamento_id)) return { erro: 'Uma das contas já está vinculada a outra linha do extrato.', status: 409 } as ErroHttp

  const erro = erroGrupo(l, contas.map(c => ({ ...c, parte: '', empresa: '' })))
  if (erro) return { erro, status: 422 } as ErroHttp

  // Sem índice único: a linha tem que estar livre, e depois de gravar só as contas marcadas podem estar nela (senão desfaz).
  const { count: jaNaLinha } = await supabase.from(tabela).select('id', { count: 'exact', head: true }).eq('extrato_lancamento_id', l.id)
  if (jaNaLinha) return { erro: 'Essa linha do extrato já está vinculada a outra conta.', status: 409 } as ErroHttp
  return { l, tabela, unicos }
}

// Vincula as contas à linha. null = ok.
export async function vincular(supabase: Db, projetoId: number, lancamentoId: number, contaIds: number[]): Promise<ErroHttp | null> {
  const c = await conferirVinculo(supabase, projetoId, lancamentoId, contaIds)
  if ('erro' in c) return c
  const { l, tabela, unicos } = c
  const { data: feitos, error } = await supabase
    .from(tabela)
    .update({ extrato_lancamento_id: l.id })
    .in('id', unicos)
    .eq('projeto_id', projetoId)
    .is('extrato_lancamento_id', null)
    .select('id')
  if (error) return { erro: error.message, status: 500 }
  const { count: naLinha } = await supabase.from(tabela).select('id', { count: 'exact', head: true }).eq('extrato_lancamento_id', l.id)
  if (feitos.length !== unicos.length || naLinha !== unicos.length) {
    await supabase.from(tabela).update({ extrato_lancamento_id: null }).in('id', feitos.map(f => f.id)).eq('extrato_lancamento_id', l.id)
    return { erro: 'Alguém alterou essas contas ou esta linha ao mesmo tempo. Nada foi vinculado; tente de novo.', status: 409 }
  }
  return null
}

// Solta todas as contas da linha. null = ok.
export async function desvincular(supabase: Db, projetoId: number, lancamentoId: number): Promise<ErroHttp | null> {
  const l = await carregarLancamento(supabase, projetoId, lancamentoId)
  if (!l) return { erro: 'Linha do extrato não encontrada', status: 404 }
  const { error } = await supabase
    .from(CONTAS[tipoDoValor(l.valor)].tabela)
    .update({ extrato_lancamento_id: null })
    .eq('extrato_lancamento_id', l.id)
    .eq('projeto_id', projetoId)
  return error ? { erro: error.message, status: 500 } : null
}
