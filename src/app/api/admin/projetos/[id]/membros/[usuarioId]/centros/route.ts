import { NextRequest, NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase/server'
import { sessaoGestor, podeGerenciarMembros, negado } from '@/lib/gestao-projetos'

type Ctx = { params: Promise<{ id: string; usuarioId: string }> }

async function alvo(params: Ctx['params']) {
  const p = await params
  return { projetoId: Number(p.id), usuarioId: Number(p.usuarioId) }
}

// GET: centros de resultado do projeto, com a marca de quais este membro vê
export async function GET(_req: NextRequest, { params }: Ctx) {
  const g = await sessaoGestor()
  if ('erro' in g) return g.erro
  const { projetoId, usuarioId } = await alvo(params)
  if (!Number.isInteger(projetoId) || !Number.isInteger(usuarioId) || !podeGerenciarMembros(g.session, projetoId)) return negado()

  const [{ data: vinculo }, { data: empresas }, { data: marcados }] = await Promise.all([
    supabaseServer.from('usuarios_projetos').select('todos_centros').eq('projeto_id', projetoId).eq('usuario_id', usuarioId).maybeSingle(),
    supabaseServer.from('empresas').select('id, empresa').eq('projeto_id', projetoId).order('empresa'),
    supabaseServer.from('usuarios_projetos_empresas').select('empresa_id').eq('projeto_id', projetoId).eq('usuario_id', usuarioId),
  ])
  if (!vinculo) return NextResponse.json({ error: 'Vínculo não encontrado' }, { status: 404 })
  const set = new Set((marcados ?? []).map(m => m.empresa_id as string))
  return NextResponse.json({
    todos: vinculo.todos_centros !== false,
    empresas: (empresas ?? []).map(e => ({ id: e.id as string, empresa: e.empresa as string, marcado: set.has(e.id as string) })),
  })
}

// PUT: { todos: boolean, ids: string[] } — define os centros que o membro vê
// ponytail: apaga e regrava em duas chamadas (sem transação); se a segunda falhar o membro fica sem centros marcados (vê nada), nunca com a mais.
export async function PUT(req: NextRequest, { params }: Ctx) {
  const g = await sessaoGestor()
  if ('erro' in g) return g.erro
  const { projetoId, usuarioId } = await alvo(params)
  if (!Number.isInteger(projetoId) || !Number.isInteger(usuarioId) || !podeGerenciarMembros(g.session, projetoId)) return negado()
  if (usuarioId === g.session.userId) return NextResponse.json({ error: 'Você não pode alterar os seus próprios centros' }, { status: 400 })

  const { todos, ids } = await req.json() as { todos: boolean; ids: string[] }
  if (typeof todos !== 'boolean' || !Array.isArray(ids)) return NextResponse.json({ error: 'Dados inválidos' }, { status: 400 })

  const { data: validos } = await supabaseServer.from('empresas').select('id').eq('projeto_id', projetoId).in('id', ids.length ? ids : ['00000000-0000-0000-0000-000000000000'])
  const escolhidos = todos ? [] : (validos ?? []).map(e => e.id as string)

  const { data: ok, error } = await supabaseServer.from('usuarios_projetos').update({ todos_centros: todos })
    .eq('projeto_id', projetoId).eq('usuario_id', usuarioId).select('usuario_id')
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  if (!ok?.length) return NextResponse.json({ error: 'Vínculo não encontrado' }, { status: 404 })

  const del = await supabaseServer.from('usuarios_projetos_empresas').delete().eq('projeto_id', projetoId).eq('usuario_id', usuarioId)
  if (del.error) return NextResponse.json({ error: del.error.message }, { status: 400 })
  if (escolhidos.length) {
    const ins = await supabaseServer.from('usuarios_projetos_empresas').insert(escolhidos.map(empresa_id => ({ usuario_id: usuarioId, projeto_id: projetoId, empresa_id })))
    if (ins.error) return NextResponse.json({ error: ins.error.message }, { status: 400 })
  }
  return NextResponse.json({ ok: true })
}
