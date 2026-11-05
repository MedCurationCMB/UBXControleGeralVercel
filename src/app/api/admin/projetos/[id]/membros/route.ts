import { NextRequest, NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase/server'
import { sessaoGestor, podeGerenciarMembros, negado } from '@/lib/gestao-projetos'
import { lerPerfil } from '@/lib/modulos'

type Ctx = { params: Promise<{ id: string }> }

// GET: membros do projeto
export async function GET(_req: NextRequest, { params }: Ctx) {
  const g = await sessaoGestor()
  if ('erro' in g) return g.erro
  const projetoId = Number((await params).id)
  if (!Number.isInteger(projetoId) || !podeGerenciarMembros(g.session, projetoId)) return negado()

  const { data, error } = await supabaseServer
    .from('usuarios_projetos')
    .select('usuario_id, papel, modulo, todos_centros, usuarios!inner(username, email, status_cadastro)')
    .eq('projeto_id', projetoId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const { data: marcas } = await supabaseServer.from('usuarios_projetos_empresas').select('usuario_id').eq('projeto_id', projetoId)
  const qtd = new Map<number, number>()
  for (const x of marcas ?? []) qtd.set(x.usuario_id as number, (qtd.get(x.usuario_id as number) ?? 0) + 1)

  const membros = (data ?? []).map(r => {
    const u = r.usuarios as unknown as { username: string; email: string; status_cadastro: string }
    return { usuario_id: r.usuario_id, papel: r.papel, modulo: r.modulo, todos_centros: r.todos_centros !== false, centros: qtd.get(r.usuario_id as number) ?? 0, username: u.username, email: u.email, status: u.status_cadastro }
  }).sort((a, b) => a.username.localeCompare(b.username))
  return NextResponse.json({ membros, voce: g.session.userId })
}

// POST: adiciona um usuário existente ao projeto, pelo e-mail
export async function POST(req: NextRequest, { params }: Ctx) {
  const g = await sessaoGestor()
  if ('erro' in g) return g.erro
  const projetoId = Number((await params).id)
  if (!Number.isInteger(projetoId) || !podeGerenciarMembros(g.session, projetoId)) return negado()

  const { email, perfil } = await req.json()
  const p = lerPerfil(perfil)
  if (!p) return NextResponse.json({ error: 'Perfil inválido' }, { status: 400 })
  const mail = String(email ?? '').toLowerCase().trim()
  if (!mail) return NextResponse.json({ error: 'Informe o e-mail do usuário' }, { status: 400 })

  const { data: projeto } = await supabaseServer.from('projetos').select('id').eq('id', projetoId).maybeSingle()
  if (!projeto) return NextResponse.json({ error: 'Projeto não encontrado' }, { status: 404 })

  const { data: usuario } = await supabaseServer.from('usuarios').select('id, username, status_cadastro').eq('email', mail).maybeSingle()
  if (!usuario) return NextResponse.json({ error: 'Nenhum usuário cadastrado com este e-mail' }, { status: 404 })
  if (usuario.status_cadastro !== 'Autorizado') {
    return NextResponse.json({ error: 'Este usuário ainda não teve o cadastro autorizado pelo owner' }, { status: 400 })
  }

  const { error } = await supabaseServer.from('usuarios_projetos').insert({ usuario_id: usuario.id, projeto_id: projetoId, papel: p.papel, modulo: p.modulo })
  if (error) {
    return NextResponse.json(
      { error: error.code === '23505' ? 'Este usuário já faz parte do projeto' : error.message },
      { status: error.code === '23505' ? 409 : 400 }
    )
  }
  return NextResponse.json({ ok: true, username: usuario.username })
}
