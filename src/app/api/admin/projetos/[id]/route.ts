import { NextRequest, NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase/server'
import { sessaoGestor, ehOwner, negado } from '@/lib/gestao-projetos'

// PATCH: renomeia e/ou ativa/desativa um projeto (owner)
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await sessaoGestor()
  if ('erro' in g) return g.erro
  if (!ehOwner(g.session)) return negado()

  const projetoId = Number((await params).id)
  if (!Number.isInteger(projetoId)) return NextResponse.json({ error: 'Projeto inválido' }, { status: 400 })

  const body = await req.json()
  const campos: { nome?: string; ativo?: boolean } = {}
  if (body.nome !== undefined) {
    const nome = String(body.nome).trim()
    if (nome.length < 2 || nome.length > 60) return NextResponse.json({ error: 'Informe um nome de 2 a 60 caracteres' }, { status: 400 })
    campos.nome = nome
  }
  if (body.ativo !== undefined) {
    if (body.ativo === false && projetoId === g.session.projetoId) {
      return NextResponse.json({ error: 'Troque para outro projeto antes de desativar este' }, { status: 400 })
    }
    campos.ativo = Boolean(body.ativo)
  }
  if (Object.keys(campos).length === 0) return NextResponse.json({ error: 'Nada para alterar' }, { status: 400 })

  const { error } = await supabaseServer.from('projetos').update(campos).eq('id', projetoId)
  if (error) {
    return NextResponse.json(
      { error: error.code === '23505' ? 'Já existe um projeto com este nome' : error.message },
      { status: error.code === '23505' ? 409 : 400 }
    )
  }
  return NextResponse.json({ ok: true })
}
