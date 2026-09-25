import { supabaseServer } from '@/lib/supabase/server'
import { getSituacao } from '@/lib/controle-pagamentos-server'

// Painel consolidado do owner: lê todos os projetos com a service role (ignora o RLS).
// Só chamar de rotas que já confirmaram que o usuário é owner.
// ponytail: agrega em Node (pagina de 1000 em 1000). Se passar de umas dezenas de milhares de linhas, mover para funções SQL.

export type Modulo = 'pagamentos' | 'recebimentos'
const TAB = {
  pagamentos:   { orc: 'controle_orcamento',         ped: 'pedidos_solicitados',         ctl: 'controle_pagamentos' },
  recebimentos: { orc: 'controle_orcamento_receita', ped: 'pedidos_solicitados_receita', ctl: 'controle_recebimento' },
} as const

export interface Bloco {
  orcamento: number; consumido: number; saldo: number
  aPagar: number; pago: number; emAberto: number; atrasadoValor: number; atrasadoQtd: number
  pedidos: Record<string, { qtd: number; valor: number }>
}
const vazio = (): Bloco => ({ orcamento: 0, consumido: 0, saldo: 0, aPagar: 0, pago: 0, emAberto: 0, atrasadoValor: 0, atrasadoQtd: 0, pedidos: {} })
const n = (v: unknown) => Number(v ?? 0)

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function paginar<T>(build: () => any): Promise<T[]> {
  const out: T[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await build().range(from, from + 999)
    if (error) throw new Error(error.message)
    out.push(...(data ?? []))
    if ((data?.length ?? 0) < 1000) break
  }
  return out
}

const idx = (ano: number, mes: number) => ano * 12 + mes
const chaveMes = (ano: number, mes: number) => `${ano}-${String(mes).padStart(2, '0')}`

export async function montarPainel(projetoIds: number[], de: string, ate: string) {
  const [anoDe, mesDe] = de.split('-').map(Number)
  const [anoAte, mesAte] = ate.split('-').map(Number)
  const iDe = idx(anoDe, mesDe), iAte = idx(anoAte, mesAte)
  const dataDe = `${de}-01`
  const dataAte = `${ate}-${String(new Date(anoAte, mesAte, 0).getDate()).padStart(2, '0')}`

  const { data: projs } = await supabaseServer.from('projetos').select('id, nome').in('id', projetoIds).order('id')
  const projetos = projs ?? []

  const porProjeto: Record<number, Record<Modulo, Bloco>> = {}
  for (const p of projetos) porProjeto[p.id] = { pagamentos: vazio(), recebimentos: vazio() }
  const mensal: Record<string, Record<Modulo, { orcamento: number; consumido: number; pago: number }>> = {}
  const mes = (k: string) => (mensal[k] ??= {
    pagamentos: { orcamento: 0, consumido: 0, pago: 0 }, recebimentos: { orcamento: 0, consumido: 0, pago: 0 },
  })
  // meses do período sempre presentes (mesmo sem dados)
  for (let i = iDe; i <= iAte; i++) mes(chaveMes(Math.floor((i - 1) / 12), ((i - 1) % 12) + 1))
  const porEmpresa: Record<Modulo, Record<string, number>> = { pagamentos: {}, recebimentos: {} }
  const nomeProjeto = Object.fromEntries(projetos.map(p => [p.id, p.nome as string]))

  for (const modulo of ['pagamentos', 'recebimentos'] as Modulo[]) {
    const t = TAB[modulo]

    const orcs = await paginar<{ projeto_id: number; empresa: string; mes: number; ano: number; valor_orcamento: number; valor_pedidos_solicitados: number }>(
      () => supabaseServer.from(t.orc).select('projeto_id, empresa, mes, ano, valor_orcamento, valor_pedidos_solicitados')
        .in('projeto_id', projetoIds).gte('ano', anoDe).lte('ano', anoAte).order('id'))
    for (const o of orcs) {
      const i = idx(o.ano, o.mes)
      if (i < iDe || i > iAte) continue
      const b = porProjeto[o.projeto_id][modulo]
      b.orcamento += n(o.valor_orcamento); b.consumido += n(o.valor_pedidos_solicitados)
      const m = mes(chaveMes(o.ano, o.mes))[modulo]
      m.orcamento += n(o.valor_orcamento); m.consumido += n(o.valor_pedidos_solicitados)
      const chave = `${nomeProjeto[o.projeto_id]} · ${o.empresa}`
      porEmpresa[modulo][chave] = (porEmpresa[modulo][chave] ?? 0) + n(o.valor_pedidos_solicitados)
    }

    const peds = await paginar<{ projeto_id: number; status: string; cancelado: boolean | null; valor_pedido: number }>(
      () => supabaseServer.from(t.ped).select('projeto_id, status, cancelado, valor_pedido')
        .in('projeto_id', projetoIds).gte('data_solicitacao', dataDe).lte('data_solicitacao', dataAte).order('id'))
    for (const p of peds) {
      const st = p.cancelado ? 'Cancelado' : p.status
      const slot = (porProjeto[p.projeto_id][modulo].pedidos[st] ??= { qtd: 0, valor: 0 })
      slot.qtd++; slot.valor += n(p.valor_pedido)
    }

    const ctls = await paginar<{ projeto_id: number; valor_pagar: number | null; valor_pagamento: number | null; data_vencimento: string | null }>(
      () => supabaseServer.from(t.ctl).select('projeto_id, valor_pagar, valor_pagamento, data_vencimento')
        .in('projeto_id', projetoIds).gte('data_vencimento', dataDe).lte('data_vencimento', dataAte).order('id'))
    for (const c of ctls) {
      const b = porProjeto[c.projeto_id][modulo]
      const pagar = n(c.valor_pagar), pago = n(c.valor_pagamento)
      b.aPagar += pagar; b.pago += pago
      const sit = getSituacao(c)
      if (sit !== 'Quitado') b.emAberto += Math.max(pagar - pago, 0)
      if (sit === 'Atrasado') { b.atrasadoValor += Math.max(pagar - pago, 0); b.atrasadoQtd++ }
      if (c.data_vencimento) {
        const [a, m2] = c.data_vencimento.split('-').map(Number)
        mes(chaveMes(a, m2))[modulo].pago += pago
      }
    }
  }

  for (const p of projetos) for (const m of ['pagamentos', 'recebimentos'] as Modulo[]) {
    const b = porProjeto[p.id][m]; b.saldo = b.orcamento - b.consumido
  }
  const topo = (m: Modulo) => Object.entries(porEmpresa[m]).sort((a, b) => b[1] - a[1]).slice(0, 10)
    .filter(([, v]) => v > 0).map(([nome, consumido]) => ({ nome, consumido }))

  return {
    periodo: { de, ate },
    projetos: projetos.map(p => ({ id: p.id, nome: p.nome as string, ...porProjeto[p.id] })),
    mensal: Object.entries(mensal).sort(([a], [b]) => a.localeCompare(b)).map(([mesAno, v]) => ({ mes: mesAno, ...v })),
    topEmpresas: { pagamentos: topo('pagamentos'), recebimentos: topo('recebimentos') },
  }
}
