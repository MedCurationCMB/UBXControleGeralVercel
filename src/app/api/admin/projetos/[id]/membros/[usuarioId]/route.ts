import { NextRequest, NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase/server'
import { sessaoGestor, podeGerenciarMembros, negado } from '@/lib/gestao-projetos'
import { lerPerfil } from '@/lib/modulos'

type Ctx = { params: Promise<{ id: string; usuarioId: string }> }

async function alvo(params: Ctx['params']) {
  const p = await params
  return { projetoId: Number(p.id), usuarioId: Number(p.usuarioId) }
}

// PATCH: muda o perfil (papel + módulo) de um membro
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const g = await sessaoGestor()
  if ('erro' in g) return g.erro
  const { projetoId, usuarioId } = await alvo(params)
  if (!Number.isInteger(projetoId) || !Number.isInteger(usuarioId) || !podeGerenciarMembros(g.session, projetoId)) return negado()
  if (usuarioId === g.session.userId) return NextResponse.json({ error: 'Você não pode alterar o seu próprio acesso' }, { status: 400 })

  const p = lerPerfil((await req.json()).perfil)
  if (!p) return NextResponse.json({ error: 'Perfil inválido' }, { status: 400 })

  const { data, error } = await supabaseServer.from('usuarios_projetos')
    .update({ papel: p.papel, modulo: p.modulo }).eq('projeto_id', projetoId).eq('usuario_id', usuarioId).select('usuario_id')
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  if (!data?.length) return NextResponse.json({ error: 'Vínculo não encontrado' }, { status: 404 })
  return NextResponse.json({ ok: true })
}

// DELETE: remove o acesso de um membro ao projeto
export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const g = await sessaoGestor()
  if ('erro' in g) return g.erro
  const { projetoId, usuarioId } = await alvo(params)
  if (!Number.isInteger(projetoId) || !Number.isInteger(usuarioId) || !podeGerenciarMembros(g.session, projetoId)) return negado()
  if (usuarioId === g.session.userId) return NextResponse.json({ error: 'Você não pode remover o seu próprio acesso' }, { status: 400 })

  const { data, error } = await supabaseServer.from('usuarios_projetos')
    .delete().eq('projeto_id', projetoId).eq('usuario_id', usuarioId).select('usuario_id')
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  if (!data?.length) return NextResponse.json({ error: 'Vínculo não encontrado' }, { status: 404 })
  return NextResponse.json({ ok: true })
}
