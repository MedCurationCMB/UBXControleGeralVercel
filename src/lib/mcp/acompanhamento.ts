import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { TAB_PEDIDO } from '@/lib/ajuste'
import { CONTAS } from '@/lib/extratoVinculo'
import { clienteDoUsuario } from '@/lib/supabase/usuario'
import { veModulo } from '@/lib/modulos'
import { brl, falha, modulo, ok } from '@/lib/mcp/pedidos'
import { controlaOrcamento, fluxoDe, MESES } from '@/lib/mcp/solicitacoes'
import { linkUpload } from '@/lib/mcp/upload'
import type { SessionPayload } from '@/types/database'

const CONTROLE = { pagamentos: 'controle_pagamentos', recebimentos: 'controle_recebimento' } as const
const preview = (resumo: string) => ok(`${resumo}\nNada foi feito ainda. Para executar, chame de novo com confirmar=true.`)

// Acompanhamento do pedido: comentar, cancelar e ajustar/reenviar (depois de "pedir ajuste"), com as regras das telas.
export function registrarAcompanhamento(server: McpServer, s: SessionPayload, origin: string) {
  const db = () => clienteDoUsuario(s)
  async function carregar(m: 'pagamentos' | 'recebimentos', id: number) {
    const { data } = await (await db()).from(TAB_PEDIDO[m].pedido).select('*').eq('id', id).maybeSingle()
    return data as Record<string, unknown> | null
  }
  const comentar = async (m: 'pagamentos' | 'recebimentos', id: number, texto: string) =>
    (await db()).from(TAB_PEDIDO[m].comentarios).insert({ pedido_id: id, comentario: texto, usuario: s.username, data_comentario: new Date().toISOString() }).select('id').single()

  server.registerTool('adicionar_comentario', {
    description: 'Comenta num pedido (aparece no histórico para todos que acompanham). Com com_anexo=true o resultado traz um link (vale 30 min) para o usuário enviar PDFs que ficam ligados ao comentário. Use confirmar=false antes, como nas outras escritas.',
    inputSchema: { modulo, pedido_id: z.number().int(), comentario: z.string().min(1), com_anexo: z.boolean().default(false), confirmar: z.boolean().default(false) },
    annotations: { destructiveHint: true },
  }, async ({ modulo: m, pedido_id, comentario, com_anexo, confirmar }) => {
    if (!veModulo(s.modulo, m)) return falha('Seu perfil não acessa este módulo.')
    const p = await carregar(m, pedido_id)
    if (!p) return falha('Pedido não encontrado (ou fora dos seus centros).')
    const resumo = `COMENTAR no pedido #${pedido_id} (${p.empresa}) como ${s.username}: "${comentario.trim()}"`
    if (!confirmar) return preview(resumo)
    const { data, error } = await comentar(m, pedido_id, comentario.trim())
    if (error || !data) return falha(error?.message ?? 'Erro ao comentar.')
    return ok(`Feito: ${resumo}${com_anexo ? `\nLink para enviar o(s) PDF(s) do comentário #${data.id} (vale 30 min): ${await linkUpload(origin, s, m, 'comentario', data.id)}` : ''}`)
  })

  server.registerTool('cancelar_pedido', {
    description: 'Cancela um pedido (status Cancelado; o orçamento é devolvido). Vale para pedidos ainda não rejeitados, inclusive os já autorizados: o resumo avisa quantas contas existem e quantas já foram pagas. ' +
      'Não dá para desfazer. Use confirmar=false antes e só confirme com o OK explícito do usuário.',
    inputSchema: { modulo, pedido_id: z.number().int(), confirmar: z.boolean().default(false) },
    annotations: { destructiveHint: true },
  }, async ({ modulo: m, pedido_id, confirmar }) => {
    if (!veModulo(s.modulo, m)) return falha('Seu perfil não acessa este módulo.')
    const t = TAB_PEDIDO[m]
    const p = await carregar(m, pedido_id)
    if (!p) return falha('Pedido não encontrado (ou fora dos seus centros).')
    if (p.cancelado || p.status === 'Cancelado') return falha('Este pedido já está cancelado.')
    if (p.status === 'Não Autorizado') return falha('Pedido rejeitado não precisa ser cancelado.')
    const cli = await db()
    const { count: pend } = await cli.from('realocacoes').select('id', { count: 'exact', head: true }).eq('modulo', m).eq('pedido_id', pedido_id).eq('status', 'Aguardando Autorização')
    if (pend) return falha('Há uma realocação aguardando autorização neste pedido: autorize ou recuse antes de cancelar.')
    const { data: contas } = await cli.from(CONTROLE[m]).select('id, valor_pagamento').eq('pedido_id', pedido_id)
    const pagas = (contas ?? []).filter(c => c.valor_pagamento != null).length
    const resumo = `CANCELAR pedido #${pedido_id} (${p.empresa} · ${p[t.parte]} · ${brl(Number(p.valor_pedido))}, status ${p.status})` +
      (contas?.length ? `\nATENÇÃO: o pedido tem ${contas.length} conta(s) no controle, ${pagas} já com ${m === 'pagamentos' ? 'pagamento' : 'recebimento'} registrado.` : '')
    if (!confirmar) return preview(resumo)
    const { error } = await cli.from(t.pedido).update({ cancelado: true, status: 'Cancelado' }).eq('id', pedido_id)
    if (error) return falha(error.message)
    await cli.from(t.fluxo).update({ status: 'Cancelado' }).eq('pedido_id', pedido_id)
    return ok(`Feito: ${resumo}`)
  })

  // Responder ao "pedir ajuste": edita o pedido (dados e/ou cronograma) e/ou reenvia para aprovação, como o banner de ajuste da tela.
  server.registerTool('ajustar_pedido', {
    description: 'Responde a um pedido em "Aguardando Ajuste": altera centro, categoria, fornecedor/cliente, observação e/ou o cronograma (periodos substitui TODOS os meses) e, com reenviar=true, devolve o pedido para aprovação. ' +
      'Só quem pediu o pedido ou um administrador. Nos fluxos 1 e 4 o saldo do orçamento é conferido de novo. O histórico do pedido registra o de → para. Use confirmar=false antes.',
    inputSchema: {
      modulo, pedido_id: z.number().int(), centro: z.string().optional(), categoria: z.string().optional(), parte: z.string().optional().describe('fornecedor (pagamentos) ou cliente (recebimentos)'),
      observacao: z.string().optional(),
      periodos: z.array(z.object({ mes: z.number().int().min(1).max(12), ano: z.number().int().min(2025).max(2050), valor: z.number().positive(), beneficiario: z.string().optional() })).min(1).max(36).optional(),
      reenviar: z.boolean().default(false), confirmar: z.boolean().default(false),
    },
    annotations: { destructiveHint: true },
  }, async ({ modulo: m, pedido_id, centro, categoria, parte, observacao, periodos, reenviar, confirmar }) => {
    if (!veModulo(s.modulo, m)) return falha('Seu perfil não acessa este módulo.')
    const t = TAB_PEDIDO[m]
    const colBenef = CONTAS[m === 'pagamentos' ? 'pagar' : 'receber'].benef
    const cli = await db()
    const p = await carregar(m, pedido_id)
    if (!p) return falha('Pedido não encontrado (ou fora dos seus centros).')
    if (p.status !== 'Aguardando Ajuste') return falha(`Este pedido não está aguardando ajuste (status: ${p.status}).`)
    const solicitante = p.usuario_solicitante as string | null
    if (solicitante && solicitante !== s.username && s.hierarquia !== 'admin' && s.hierarquia !== 'owner') return falha(`Somente ${solicitante} ou um administrador pode ajustar e reenviar este pedido.`)

    const { data: fluxoAtual } = await cli.from(t.fluxo).select('*').eq('pedido_id', pedido_id).order('ano').order('mes')
    const antigas = (fluxoAtual ?? []) as Record<string, unknown>[]
    const novo = { empresa: centro?.trim() || String(p.empresa), categoria: categoria?.trim() || String(p.categoria), parte: parte?.trim() || String(p[t.parte]), obs: observacao !== undefined ? observacao : ((p.observacao as string | null) ?? '') }
    const editou = !!(centro || categoria || parte || observacao !== undefined || periodos)
    if (!editou && !reenviar) return falha('Nada para fazer: informe o que ajustar e/ou reenviar=true.')

    let linhas: { mes: number; ano: number; valor: number; benef: string }[] = []
    if (editou) {
      const { data: cat } = await cli.from(t.categorias).select('categoria').eq('empresa', novo.empresa).eq('categoria', novo.categoria).maybeSingle()
      if (!cat) return falha(`Categoria "${novo.categoria}" não encontrada no centro "${novo.empresa}" (use os nomes exatos).`)
      const { data: ex } = await cli.from(t.partes).select('nome').eq('nome', novo.parte).maybeSingle()
      if (!ex) return falha(`${t.parteRotulo} "${novo.parte}" não cadastrado (use o nome exato).`)
      // sem periodos: mantém os meses atuais; quem recebia como o fornecedor/cliente antigo passa para o novo
      linhas = periodos
        ? periodos.map(x => ({ mes: x.mes, ano: x.ano, valor: Math.round(x.valor * 100) / 100, benef: x.beneficiario?.trim() || novo.parte }))
        : antigas.map(r => ({ mes: Number(r.mes), ano: Number(r.ano), valor: Number(r.valor_referente), benef: !r[colBenef] || r[colBenef] === p[t.parte] ? novo.parte : String(r[colBenef]) }))
      if (!linhas.length) return falha('O pedido não tem cronograma: informe os periodos.')
      if (new Set(linhas.map(x => `${x.ano}-${x.mes}-${x.benef}`)).size !== linhas.length) return falha('Há períodos repetidos (mesmo mês, ano e beneficiário).')
      const faltam = [...new Set(linhas.map(x => x.benef))].filter(b => b !== novo.parte)
      if (faltam.length) {
        const { data: bs } = await cli.from(t.partes).select('nome').in('nome', faltam)
        const nao = faltam.filter(b => !(bs ?? []).some(x => x.nome === b))
        if (nao.length) return falha(`${t.parteRotulo} não cadastrado: ${nao.join(', ')}.`)
      }
      if (controlaOrcamento(await fluxoDe(cli, m))) {
        const porMes = new Map<string, number>()
        for (const x of linhas) porMes.set(`${x.mes}/${x.ano}`, (porMes.get(`${x.mes}/${x.ano}`) ?? 0) + x.valor)
        for (const [k, v] of porMes) {
          const [mes, ano] = k.split('/').map(Number)
          const { data: o } = await cli.from(t.orcamento).select('valor_orcamento, valor_pedidos_solicitados').eq('empresa', novo.empresa).eq('categoria', novo.categoria).eq('mes', mes).eq('ano', ano).maybeSingle()
          if (!o) return falha(`Não existe orçamento para ${MESES[mes - 1]}/${ano}.`)
          // o que este pedido já consome nesse mesmo centro/categoria/mês volta para o saldo
          const jaConsumido = p.empresa === novo.empresa && p.categoria === novo.categoria
            ? antigas.filter(r => Number(r.mes) === mes && Number(r.ano) === ano).reduce((a, r) => a + Number(r.valor_referente), 0) : 0
          const disponivel = o.valor_orcamento - o.valor_pedidos_solicitados + jaConsumido
          if (v > disponivel + 0.005) return falha(`Valor ${brl(v)} excede o saldo disponível de ${brl(disponivel)} para ${MESES[mes - 1]}/${ano}.`)
        }
      }
    }

    const total = Math.round(linhas.reduce((a, x) => a + x.valor, 0) * 100) / 100
    const descrever = (rs: { mes: number; ano: number; valor: number }[]) => [...rs].sort((a, b) => a.ano - b.ano || a.mes - b.mes).map(r => `${MESES[r.mes - 1]}/${r.ano} ${brl(r.valor)}`).join(', ')
    const curto = (x: string) => (x.length > 100 ? `${x.slice(0, 100)}…` : x) || '—'
    const mudancas: string[] = []
    if (editou) {
      const dif = (rotulo: string, antes: string, depois: string) => { if (antes.trim() !== depois.trim()) mudancas.push(`${rotulo}: ${curto(antes)} → ${curto(depois)}`) }
      dif('Centro de Resultado', String(p.empresa), novo.empresa); dif('Categoria', String(p.categoria), novo.categoria); dif(t.parteRotulo, String(p[t.parte]), novo.parte)
      dif('Observação', String(p.observacao ?? ''), novo.obs); dif('Valor total', brl(Number(p.valor_pedido)), brl(total))
      dif('Períodos', descrever(antigas.map(r => ({ mes: Number(r.mes), ano: Number(r.ano), valor: Number(r.valor_referente) }))), descrever(linhas))
    }
    const resumo = `AJUSTAR pedido #${pedido_id}${mudancas.length ? `\n${mudancas.map(x => `  • ${x}`).join('\n')}` : editou ? ' (nada muda nos dados)' : ''}${reenviar ? '\n  → reenviar para aprovação' : ''}`
    if (!confirmar) return preview(resumo)

    if (editou) {
      const antigosDados = { empresa: p.empresa, categoria: p.categoria, [t.parte]: p[t.parte], valor_pedido: p.valor_pedido, observacao: p.observacao }
      const desfazer = async (motivo: string) => {
        await cli.from(t.pedido).update(antigosDados).eq('id', pedido_id)
        await cli.from(t.fluxo).delete().eq('pedido_id', pedido_id)
        if (antigas.length) await cli.from(t.fluxo).insert(antigas.map(({ id: _id, ...r }) => r))
        return falha(`Não foi possível salvar (${motivo}). Nada foi alterado, tente novamente.`)
      }
      const { error: e1 } = await cli.from(t.pedido).update({ empresa: novo.empresa, categoria: novo.categoria, [t.parte]: novo.parte, valor_pedido: total, observacao: novo.obs || null }).eq('id', pedido_id)
      if (e1) return falha(e1.message)
      // zera antes de apagar: o gatilho de exclusão não recalcula o orçamento, o de atualização recalcula (como a tela)
      const { error: e2 } = await cli.from(t.fluxo).update({ valor_referente: 0 }).eq('pedido_id', pedido_id)
      if (e2) return desfazer(e2.message)
      const { error: e3 } = await cli.from(t.fluxo).delete().eq('pedido_id', pedido_id)
      if (e3) return desfazer(e3.message)
      const { id: _i, mes: _m, ano: _a, valor_referente: _v, ...extras } = (antigas[0] ?? {}) as Record<string, unknown>
      const { error: e4 } = await cli.from(t.fluxo).insert(linhas.map(x => ({
        ...extras, pedido_id, empresa: novo.empresa, categoria: novo.categoria, [t.parte]: novo.parte, [colBenef]: x.benef, mes: x.mes, ano: x.ano, valor_referente: x.valor, status: p.status,
      })))
      if (e4) return desfazer(e4.message)
      if (mudancas.length) await comentar(m, pedido_id, `Alterações no pedido:\n${mudancas.map(x => `• ${x}`).join('\n')}`)
    }
    if (reenviar) {
      await cli.from(t.pedido).update({ status: 'Aguardando Autorização' }).eq('id', pedido_id)
      await cli.from(t.pedido).update({ ajuste_reenviado: true }).eq('id', pedido_id) // marca para o autorizador
      await cli.from(t.fluxo).update({ status: 'Aguardando Autorização' }).eq('pedido_id', pedido_id)
      await comentar(m, pedido_id, 'Pedido reenviado para aprovação após ajustes.')
    }
    return ok(`Feito: ${resumo}`)
  })
}
