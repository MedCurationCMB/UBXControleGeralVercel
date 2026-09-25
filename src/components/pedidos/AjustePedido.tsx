'use client'

import { useState, useEffect, useCallback } from 'react'
import { AlertTriangle, Edit2, Check, RefreshCw, Send, X } from 'lucide-react'
import { supabaseBrowser as supabase } from '@/lib/supabase/client'
import { TAB_PEDIDO, type ModuloPedido } from '@/lib/ajuste'

type Usuario = { username: string; hierarquia?: string }
interface FluxoRow { id: number; mes: number; ano: number; valor_referente: number; status: string }
interface Comentario { id: number; comentario: string; usuario: string; data_comentario: string }
export interface PedidoAjuste {
  id: number; empresa: string; categoria: string; valor_pedido: number
  observacao: string | null; status: string; usuario_solicitante?: string | null
}

const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']
const fmtMoeda = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

// Só quem pediu o pedido (ou um admin) ajusta e reenvia. Pedidos antigos, sem solicitante, ficam livres.
export const podeAjustarPedido = (p: { usuario_solicitante?: string | null }, u: Usuario | null) =>
  !p.usuario_solicitante || p.usuario_solicitante === u?.username || u?.hierarquia === 'admin' || u?.hierarquia === 'owner'

// Banner "Aguardando Ajuste": histórico do gestor, edição do pedido (dados + cronograma) e reenvio.
export default function AjustePedido({ mod, pedido, parte, fluxo, user, onChanged }: {
  mod: ModuloPedido; pedido: PedidoAjuste; parte: string; fluxo: FluxoRow[]; user: Usuario | null; onChanged: () => void
}) {
  const t = TAB_PEDIDO[mod]
  const pedidoId = pedido.id
  const podeAjustar = podeAjustarPedido(pedido, user)

  const [historico, setHistorico] = useState<Comentario[]>([])
  const [editando, setEditando] = useState(false)
  const [editForm, setEditForm] = useState({ empresa: pedido.empresa, categoria: pedido.categoria, parte, observacao: pedido.observacao ?? '' })
  const [editPeriodos, setEditPeriodos] = useState<{ mes: number; ano: string; valor: string }[]>([])
  const [editErro, setEditErro] = useState('')
  const [catPares, setCatPares] = useState<{ empresa: string; categoria: string }[]>([])
  const [partes, setPartes] = useState<string[]>([])
  const [controlaOrcamento, setControlaOrcamento] = useState(false)
  const [savingEdit, setSavingEdit] = useState(false)
  const [reenviando, setReenviando] = useState(false)

  const load = useCallback(async () => {
    const [{ data: coms }, { data: cats }, { data: ps }, { data: cfgFluxo }, { data: cfgOrc }] = await Promise.all([
      supabase.from(t.comentarios).select('id, comentario, usuario, data_comentario')
        .eq('pedido_id', pedidoId).order('data_comentario', { ascending: false }),
      // Empresas/categorias vêm do cadastro (a busca antiga nos pedidos era cortada em 1000 linhas)
      supabase.from(t.categorias).select('empresa, categoria'),
      supabase.from(t.partes).select('nome').order('nome'),
      supabase.from('config').select('valor').eq('chave', t.cfgFluxo).maybeSingle(),
      supabase.from('config').select('valor').eq('chave', 'controla_orcamento').maybeSingle(),
    ])
    setHistorico(coms ?? [])
    setCatPares(cats ?? [])
    setPartes((ps ?? []).map((r: { nome: string }) => r.nome))
    const padrao = mod === 'pagamentos' ? (cfgOrc?.valor === 'true' ? '1' : '2') : '1'
    const fluxoSistema = cfgFluxo?.valor || padrao
    setControlaOrcamento(fluxoSistema === '1' || fluxoSistema === '4')
  }, [t, mod, pedidoId])

  useEffect(() => { load() }, [load])

  const abrirEdicao = () => {
    setEditForm({ empresa: pedido.empresa, categoria: pedido.categoria, parte, observacao: pedido.observacao ?? '' })
    setEditPeriodos(fluxo.map(r => ({ mes: r.mes, ano: String(r.ano), valor: String(r.valor_referente) })))
    setEditErro('')
    setEditando(true)
  }

  const setPeriodo = (i: number, patch: Partial<{ mes: number; ano: string; valor: string }>) =>
    setEditPeriodos(ps => ps.map((p, j) => j === i ? { ...p, ...patch } : p))

  const registrar = (comentario: string) => supabase.from(t.comentarios).insert({
    pedido_id: pedidoId, comentario, usuario: user?.username ?? 'sistema',
    data_comentario: new Date().toISOString(), tipo_documento: null,
  })

  // Salva dados + cronograma mensal. O orçamento é calculado a partir do cronograma
  // (tabela de fluxo), então valor/empresa/categoria mudam nos dois lugares
  // e, no Fluxo 1/4, o saldo é conferido de novo.
  const handleSaveEdit = async () => {
    setEditErro('')
    if (!editForm.empresa || !editForm.categoria || !editForm.parte) {
      setEditErro(`Selecione empresa, categoria e ${t.parteRotulo.toLowerCase()}.`); return
    }
    const periodos = editPeriodos.map(p => ({ mes: p.mes, ano: parseInt(p.ano), valor: parseFloat(p.valor.replace(',', '.')) }))
    if (periodos.length === 0) { setEditErro('Informe ao menos um período.'); return }
    if (periodos.some(p => !p.ano || !(p.valor > 0))) { setEditErro('Todos os períodos precisam de ano e valor maior que zero.'); return }
    if (new Set(periodos.map(p => `${p.ano}-${p.mes}`)).size !== periodos.length) {
      setEditErro('Há períodos repetidos (mesmo mês e ano).'); return
    }
    const total = periodos.reduce((s, p) => s + p.valor, 0)

    setSavingEdit(true)

    if (controlaOrcamento) {
      for (const p of periodos) {
        const rotulo = `${MESES[p.mes - 1]}/${p.ano}`
        const { data: orc } = await supabase.from(t.orcamento)
          .select('valor_orcamento, valor_pedidos_solicitados')
          .eq('empresa', editForm.empresa).eq('categoria', editForm.categoria)
          .eq('mes', p.mes).eq('ano', p.ano).maybeSingle()
        if (!orc) { setSavingEdit(false); setEditErro(`Não existe orçamento para ${rotulo}.`); return }
        // O que este pedido já consome nesse mesmo empresa/categoria/mês volta para o saldo
        const jaConsumido = pedido.empresa === editForm.empresa && pedido.categoria === editForm.categoria
          ? fluxo.filter(r => r.mes === p.mes && r.ano === p.ano).reduce((s, r) => s + Number(r.valor_referente), 0)
          : 0
        const disponivel = orc.valor_orcamento - orc.valor_pedidos_solicitados + jaConsumido
        if (p.valor > disponivel + 0.005) {
          setSavingEdit(false)
          setEditErro(`Valor ${fmtMoeda(p.valor)} excede o saldo disponível de ${fmtMoeda(disponivel)} para ${rotulo}.`)
          return
        }
      }
    }

    const antigosDados = { empresa: pedido.empresa, categoria: pedido.categoria, [t.parte]: parte, valor_pedido: pedido.valor_pedido, observacao: pedido.observacao }
    const linhasAntigas = (fluxo as unknown as Record<string, unknown>[]).map(r => {
      const { id: _id, ...resto } = r
      return resto
    })
    // Colunas extras do cronograma (ex.: pedido_status) são herdadas da primeira linha existente
    const { id: _i, mes: _m, ano: _a, valor_referente: _v, ...extras } = (fluxo[0] ?? {}) as unknown as Record<string, unknown>
    const linhasNovas = periodos.map(p => ({
      ...extras,
      pedido_id: pedidoId,
      empresa: editForm.empresa, categoria: editForm.categoria, [t.parte]: editForm.parte,
      mes: p.mes, ano: p.ano, valor_referente: p.valor,
      status: pedido.status,
    }))

    const desfazer = async (motivo: string) => {
      await supabase.from(t.pedido).update(antigosDados).eq('id', pedidoId)
      await supabase.from(t.fluxo).delete().eq('pedido_id', pedidoId)
      if (linhasAntigas.length) await supabase.from(t.fluxo).insert(linhasAntigas)
      setSavingEdit(false)
      setEditErro(`Não foi possível salvar (${motivo}). Nada foi alterado, tente novamente.`)
      onChanged()
    }

    const { error: e1 } = await supabase.from(t.pedido).update({
      empresa: editForm.empresa,
      categoria: editForm.categoria,
      [t.parte]: editForm.parte,
      valor_pedido: total,
      observacao: editForm.observacao || null,
    }).eq('id', pedidoId)
    if (e1) { setSavingEdit(false); setEditErro(e1.message); return }

    // Zera antes de apagar: o trigger de exclusão não recalcula o orçamento, o de atualização recalcula.
    const { error: e2 } = await supabase.from(t.fluxo).update({ valor_referente: 0 }).eq('pedido_id', pedidoId)
    if (e2) return desfazer(e2.message)
    const { error: e3 } = await supabase.from(t.fluxo).delete().eq('pedido_id', pedidoId)
    if (e3) return desfazer(e3.message)
    const { error: e4 } = await supabase.from(t.fluxo).insert(linhasNovas)
    if (e4) return desfazer(e4.message)

    // Registra no histórico o que mudou (de → para)
    const curto = (x: string) => (x.length > 100 ? `${x.slice(0, 100)}…` : x) || '—'
    const descreverPeriodos = (rows: { mes: number; ano: number; valor: number }[]) =>
      [...rows].sort((a, b) => a.ano - b.ano || a.mes - b.mes)
        .map(r => `${MESES[r.mes - 1].slice(0, 3)}/${r.ano} ${fmtMoeda(r.valor)}`).join(', ')
    const mudancas: string[] = []
    const dif = (rotulo: string, antes: string, depois: string) => {
      if (antes.trim() !== depois.trim()) mudancas.push(`${rotulo}: ${curto(antes)} → ${curto(depois)}`)
    }
    dif('Empresa', pedido.empresa, editForm.empresa)
    dif('Categoria', pedido.categoria, editForm.categoria)
    dif(t.parteRotulo, parte, editForm.parte)
    dif('Observação', pedido.observacao ?? '', editForm.observacao)
    dif('Valor total', fmtMoeda(Number(pedido.valor_pedido)), fmtMoeda(total))
    dif('Períodos',
      descreverPeriodos(fluxo.map(r => ({ mes: r.mes, ano: r.ano, valor: Number(r.valor_referente) }))),
      descreverPeriodos(periodos))
    if (mudancas.length > 0) {
      await registrar(`Alterações no pedido:\n${mudancas.map(m => `• ${m}`).join('\n')}`)
    }

    setSavingEdit(false)
    setEditando(false)
    onChanged()
  }

  const handleReenviar = async () => {
    if (!podeAjustar) return
    setReenviando(true)
    await supabase.from(t.pedido).update({ status: 'Aguardando Autorização' }).eq('id', pedidoId)
    // Marca para o autorizador (ignora erro se a coluna ainda não existir)
    await supabase.from(t.pedido).update({ ajuste_reenviado: true }).eq('id', pedidoId)
    await supabase.from(t.fluxo).update({ status: 'Aguardando Autorização' }).eq('pedido_id', pedidoId)
    await registrar('Pedido reenviado para aprovação após ajustes.')
    setReenviando(false)
    onChanged()
  }

  const editEmpresas = [...new Set(catPares.map(c => c.empresa).filter(Boolean))].sort()
  const editCategorias = [...new Set(catPares.filter(c => c.empresa === editForm.empresa).map(c => c.categoria))].sort()
  const editTotal = editPeriodos.reduce((s, p) => s + (parseFloat(p.valor.replace(',', '.')) || 0), 0)

  return (
    <div className="border border-orange-200 bg-orange-50 rounded-xl p-5 space-y-4">
      <div className="flex items-start gap-3">
        <AlertTriangle size={20} className="text-orange-500 shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-orange-800 mb-1">Este pedido aguarda ajustes solicitados pelo gestor</p>
          <p className="text-xs text-orange-700">Edite os campos necessários abaixo e clique em "Reenviar para Aprovação".</p>
        </div>
      </div>

      {historico.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-orange-800 uppercase tracking-wide">Histórico: comentários e alterações</p>
          {historico.map(c => (
            <div key={c.id} className="bg-white border border-orange-200 rounded-lg px-4 py-3">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-medium text-slate-700">{c.usuario}</span>
                <span className="text-xs text-slate-400">{new Date(c.data_comentario).toLocaleString('pt-BR')}</span>
              </div>
              <p className="text-sm text-slate-800 whitespace-pre-wrap">{c.comentario}</p>
            </div>
          ))}
        </div>
      )}

      {!podeAjustar && (
        <p className="text-sm text-orange-800">
          Somente {pedido.usuario_solicitante} ou um administrador pode ajustar e reenviar este pedido.
        </p>
      )}

      {!podeAjustar ? null : !editando ? (
        <button onClick={abrirEdicao} className="btn-secondary gap-1.5 text-sm">
          <Edit2 size={14} /> Editar Pedido
        </button>
      ) : (
        <div className="bg-white border border-orange-200 rounded-lg p-4 space-y-3">
          <p className="text-xs font-semibold text-slate-700 uppercase tracking-wide">Editar Dados do Pedido</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="label">Empresa</label>
              <select className="input" value={editForm.empresa}
                onChange={e => setEditForm(f => ({ ...f, empresa: e.target.value, categoria: '' }))}>
                <option value="">Selecionar...</option>
                {editEmpresas.map(e => <option key={e} value={e}>{e}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Categoria</label>
              <select className="input" value={editForm.categoria}
                onChange={e => setEditForm(f => ({ ...f, categoria: e.target.value }))}>
                <option value="">Selecionar...</option>
                {editCategorias.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="label">{t.parteRotulo}</label>
              <select className="input" value={editForm.parte}
                onChange={e => setEditForm(f => ({ ...f, parte: e.target.value }))}>
                <option value="">Selecionar...</option>
                {partes.map(f => <option key={f} value={f}>{f}</option>)}
              </select>
            </div>
            <div className="md:col-span-2">
              <label className="label">Períodos e valores (R$)</label>
              <div className="space-y-2">
                {editPeriodos.map((p, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <select className="input w-40" value={p.mes} onChange={e => setPeriodo(i, { mes: Number(e.target.value) })}>
                      {MESES.map((m, k) => <option key={m} value={k + 1}>{m}</option>)}
                    </select>
                    <input className="input w-24" type="number" value={p.ano} onChange={e => setPeriodo(i, { ano: e.target.value })} />
                    <input className="input flex-1" type="number" min="0.01" step="0.01" placeholder="0,00"
                      value={p.valor} onChange={e => setPeriodo(i, { valor: e.target.value })} />
                    <button type="button" onClick={() => setEditPeriodos(ps => ps.filter((_, j) => j !== i))}
                      className="text-slate-400 hover:text-red-500 p-1" title="Remover"><X size={14} /></button>
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between mt-2">
                <button type="button" className="btn-secondary text-xs"
                  onClick={() => setEditPeriodos(ps => [...ps, { mes: new Date().getMonth() + 1, ano: String(new Date().getFullYear()), valor: '' }])}>
                  + Adicionar período
                </button>
                <span className="text-sm font-semibold text-slate-700">Total do pedido: {fmtMoeda(editTotal)}</span>
              </div>
            </div>
            <div className="md:col-span-2">
              <label className="label">Observação</label>
              <textarea className="input resize-none h-24" value={editForm.observacao}
                onChange={e => setEditForm(f => ({ ...f, observacao: e.target.value }))} />
            </div>
          </div>
          {editErro && <p className="text-sm text-red-600">{editErro}</p>}
          <div className="flex gap-2">
            <button onClick={handleSaveEdit} disabled={savingEdit} className="btn-primary gap-1.5 text-sm">
              {savingEdit ? <><RefreshCw size={13} className="animate-spin" /> Salvando...</> : <><Check size={13} /> Salvar Alterações</>}
            </button>
            <button onClick={() => { setEditando(false); setEditErro('') }} className="btn-secondary text-sm">Cancelar</button>
          </div>
        </div>
      )}

      {!editando && podeAjustar && (
        <button onClick={handleReenviar} disabled={reenviando}
          className="inline-flex items-center gap-1.5 px-4 py-2 bg-orange-500 text-white rounded-lg text-sm font-medium hover:bg-orange-600 disabled:opacity-50">
          {reenviando ? <><RefreshCw size={14} className="animate-spin" /> Reenviando...</> : <><Send size={14} /> Reenviar para Aprovação</>}
        </button>
      )}
    </div>
  )
}
