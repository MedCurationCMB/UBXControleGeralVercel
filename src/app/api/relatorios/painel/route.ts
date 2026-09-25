import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { supabaseServer } from '@/lib/supabase/server'
import { montarPainel } from '@/lib/relatorios'

const MES = /^\d{4}-(0[1-9]|1[0-2])$/

// GET /api/relatorios/painel?projetos=1,2&de=2026-01&ate=2026-12 — só owner
export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  if (session.hierarquia !== 'owner') return NextResponse.json({ error: 'Acesso restrito ao owner' }, { status: 403 })

  const q = req.nextUrl.searchParams
  const ano = new Date().getFullYear()
  const de = q.get('de') || `${ano}-01`
  const ate = q.get('ate') || `${ano}-12`
  if (!MES.test(de) || !MES.test(ate) || de > ate) {
    return NextResponse.json({ error: 'Período inválido' }, { status: 400 })
  }
  const anos = Number(ate.slice(0, 4)) - Number(de.slice(0, 4))
  if (anos > 5) return NextResponse.json({ error: 'Período máximo de 6 anos' }, { status: 400 })

  const { data: todos } = await supabaseServer.from('projetos').select('id, nome, ativo').order('id')
  const pedidos = (q.get('projetos') ?? '').split(',').map(Number).filter(x => Number.isInteger(x) && x > 0)
  const ids = pedidos.length ? (todos ?? []).filter(p => pedidos.includes(p.id)).map(p => p.id) : (todos ?? []).map(p => p.id)
  if (ids.length === 0) return NextResponse.json({ error: 'Nenhum projeto selecionado' }, { status: 400 })

  try {
    const painel = await montarPainel(ids, de, ate)
    return NextResponse.json({ ...painel, todosProjetos: todos ?? [] })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
