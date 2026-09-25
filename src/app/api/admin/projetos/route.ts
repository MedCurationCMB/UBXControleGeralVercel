import { NextRequest, NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase/server'
import { sessaoGestor, ehOwner, negado } from '@/lib/gestao-projetos'

// GET: todos os projetos com contagem de membros (owner)
export async function GET() {
  const g = await sessaoGestor()
  if ('erro' in g) return g.erro
  if (!ehOwner(g.session)) return negado()

  const [{ data: projetos }, { data: vinculos }] = await Promise.all([
    supabaseServer.from('projetos').select('id, nome, ativo, criado_em').order('id'),
    supabaseServer.from('usuarios_projetos').select('projeto_id'),
  ])
  const membros: Record<number, number> = {}
  for (const v of vinculos ?? []) membros[v.projeto_id] = (membros[v.projeto_id] ?? 0) + 1
  return NextResponse.json({
    ativo: g.session.projetoId,
    projetos: (projetos ?? []).map(p => ({ ...p, membros: membros[p.id] ?? 0 })),
  })
}

// POST: cria projeto (owner)
export async function POST(req: NextRequest) {
  const g = await sessaoGestor()
  if ('erro' in g) return g.erro
  if (!ehOwner(g.session)) return negado()

  const { nome } = await req.json()
  const limpo = String(nome ?? '').trim()
  if (limpo.length < 2 || limpo.length > 60) {
    return NextResponse.json({ error: 'Informe um nome de 2 a 60 caracteres' }, { status: 400 })
  }
  const { data, error } = await supabaseServer.from('projetos').insert({ nome: limpo }).select('id, nome, ativo').single()
  if (error) {
    return NextResponse.json(
      { error: error.code === '23505' ? 'Já existe um projeto com este nome' : error.message },
      { status: error.code === '23505' ? 409 : 400 }
    )
  }
  return NextResponse.json({ ok: true, projeto: data })
}
