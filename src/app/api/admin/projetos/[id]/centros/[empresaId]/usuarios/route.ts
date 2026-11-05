import { NextRequest, NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase/server'
import { sessaoGestor, podeGerenciarMembros, negado } from '@/lib/gestao-projetos'

type Ctx = { params: Promise<{ id: string; empresaId: string }> }

// Quem vê um centro. Só interessa quem é restrito (todos_centros = false): quem vê "todos" já vê este e os centros novos.

// GET: membros restritos do projeto, com a marca de quais veem este centro
export async function GET(_req: NextRequest, { params }: Ctx) {
  const g = await sessaoGestor()
  if ('erro' in g) return g.erro
  const p = await params
  const projetoId = Number(p.id)
  if (!Number.isInteger(projetoId) || !podeGerenciarMembros(g.session, projetoId)) return negado()

  const [{ data: restritos }, { data: marcados }] = await Promise.all([
    supabaseServer.from('usuarios_projetos').select('usuario_id, usuarios!inner(username)').eq('projeto_id', projetoId).eq('todos_centros', false),
    supabaseServer.from('usuarios_projetos_empresas').select('usuario_id').eq('projeto_id', projetoId).eq('empresa_id', p.empresaId),
  ])
  const set = new Set((marcados ?? []).map(m => m.usuario_id as number))
  const usuarios = (restritos ?? []).map(r => ({
    usuario_id: r.usuario_id as number,
    username: (r.usuarios as unknown as { username: string }).username,
    marcado: set.has(r.usuario_id as number),
  })).sort((a, b) => a.username.localeCompare(b.username))
  return NextResponse.json({ usuarios })
}

// PUT: { ids: number[] } — define quais membros restritos veem este centro (os demais restritos deixam de ver)
export async function PUT(req: NextRequest, { params }: Ctx) {
  const g = await sessaoGestor()
  if ('erro' in g) return g.erro
  const p = await params
  const projetoId = Number(p.id)
  if (!Number.isInteger(projetoId) || !podeGerenciarMembros(g.session, projetoId)) return negado()

  const { ids } = await req.json() as { ids: number[] }
  if (!Array.isArray(ids)) return NextResponse.json({ error: 'Dados inválidos' }, { status: 400 })

  const { data: emp } = await supabaseServer.from('empresas').select('id').eq('projeto_id', projetoId).eq('id', p.empresaId).maybeSingle()
  if (!emp) return NextResponse.json({ error: 'Centro de resultado não encontrado' }, { status: 404 })
  const { data: restritos } = await supabaseServer.from('usuarios_projetos').select('usuario_id').eq('projeto_id', projetoId).eq('todos_centros', false)
  const permitidos = new Set((restritos ?? []).map(r => r.usuario_id as number))
  const escolhidos = [...new Set(ids.filter(i => permitidos.has(i)))]

  const del = await supabaseServer.from('usuarios_projetos_empresas').delete().eq('projeto_id', projetoId).eq('empresa_id', p.empresaId)
  if (del.error) return NextResponse.json({ error: del.error.message }, { status: 400 })
  if (escolhidos.length) {
    const ins = await supabaseServer.from('usuarios_projetos_empresas').insert(escolhidos.map(usuario_id => ({ usuario_id, projeto_id: projetoId, empresa_id: p.empresaId })))
    if (ins.error) return NextResponse.json({ error: ins.error.message }, { status: 400 })
  }
  return NextResponse.json({ ok: true })
}
