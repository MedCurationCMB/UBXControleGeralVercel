import { NextRequest, NextResponse } from 'next/server'
import { jwtVerify } from 'jose'
import { SESSION_COOKIE } from '@/lib/auth'
import { garantirTokenDb } from '@/lib/db-token'
import type { Modulo } from '@/lib/modulos'

const PUBLIC_ROUTES = ['/login', '/recuperar-senha', '/api/auth/login', '/api/auth/cadastro', '/api/auth/recuperar-senha']
const ADMIN_ROUTES = ['/admin', '/api/admin', '/projetos']
const OWNER_ROUTES: string[] = ['/relatorios', '/api/relatorios'] // rotas exclusivas do owner

// Rotas de cada módulo (perfis Pagamento/Recebimento só entram nas do próprio módulo) e rotas só do perfil sem módulo.
// O banco (RLS) já separa os dados; isto cobre as rotas de servidor, que usam a chave de serviço.
// ponytail: vale o módulo da sessão (até 24h para refletir uma mudança de perfil); o RLS vale na hora.
const ROTAS_MODULO: Record<Modulo, string[]> = {
  pagamentos: ['/pagamentos', '/api/pedidos', '/api/controle-pagamentos', '/api/orcamentos', '/api/fornecedores', '/api/remessa', '/api/email', '/api/modelos-contrato'],
  recebimentos: ['/recebimentos', '/api/pedidos-receita', '/api/controle-recebimentos', '/api/orcamentos-receita', '/api/clientes'],
}
const ROTAS_SEM_MODULO = ['/extratos-bancarios', '/api/extratos-bancarios', '/admin', '/api/admin', '/projetos']
const casa = (pathname: string, base: string) => pathname === base || pathname.startsWith(base + '/')

function getSecretKey() {
  const secret = process.env.SESSION_SECRET
  if (!secret) throw new Error('SESSION_SECRET não definido')
  return new TextEncoder().encode(secret)
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  // Rotas públicas passam direto
  if (PUBLIC_ROUTES.some((r) => pathname.startsWith(r))) {
    return NextResponse.next()
  }

  const token = req.cookies.get(SESSION_COOKIE)?.value

  if (!token) {
    const loginUrl = new URL('/login', req.url)
    loginUrl.searchParams.set('redirect', pathname)
    return NextResponse.redirect(loginUrl)
  }

  try {
    const { payload } = await jwtVerify(token, getSecretKey())
    const hierarquia = payload.hierarquia as string
    const status = payload.status_cadastro as string

    // Usuários não autorizados só podem ver a tela de aguardando aprovação
    if (status !== 'Autorizado' && !pathname.startsWith('/api/auth')) {
      return NextResponse.redirect(new URL('/login?status=pendente', req.url))
    }

    // Rotas de admin: requer admin ou owner
    if (ADMIN_ROUTES.some((r) => pathname.startsWith(r))) {
      if (hierarquia !== 'admin' && hierarquia !== 'owner') {
        return NextResponse.redirect(new URL('/?erro=acesso_negado', req.url))
      }
    }

    // Rotas de owner: requer owner
    if (OWNER_ROUTES.some((r) => pathname.startsWith(r))) {
      if (hierarquia !== 'owner') {
        return NextResponse.redirect(new URL('/?erro=acesso_negado', req.url))
      }
    }

    // Perfil de um módulo só: bloqueia o outro módulo e as rotas dos dois (extratos, acessos, painel)
    const modulo = (payload.modulo as Modulo | null | undefined) ?? null
    if (modulo && hierarquia !== 'owner') {
      const outro: Modulo = modulo === 'pagamentos' ? 'recebimentos' : 'pagamentos'
      if (ROTAS_MODULO[outro].some(r => casa(pathname, r)) || ROTAS_SEM_MODULO.some(r => casa(pathname, r))) {
        return pathname.startsWith('/api/')
          ? NextResponse.json({ error: 'Sem acesso a este módulo' }, { status: 403 })
          : NextResponse.redirect(new URL('/?erro=acesso_negado', req.url))
      }
    }

    const res = NextResponse.next()
    // Token do banco (RLS). Não no logout: a rota apaga o cookie na mesma resposta.
    if (pathname !== '/api/auth/logout') await garantirTokenDb(req, res, Number(payload.userId))
    return res
  } catch {
    // Token inválido ou expirado
    const loginUrl = new URL('/login', req.url)
    const response = NextResponse.redirect(loginUrl)
    response.cookies.delete(SESSION_COOKIE)
    return response
  }
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|public|assets).*)',
  ],
}
