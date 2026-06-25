import { NextRequest, NextResponse } from 'next/server'
import { jwtVerify } from 'jose'
import { SESSION_COOKIE } from '@/lib/auth'

const PUBLIC_ROUTES = ['/login', '/recuperar-senha', '/api/auth/login', '/api/auth/recuperar-senha']
const ADMIN_ROUTES = ['/admin', '/api/admin']
const OWNER_ROUTES: string[] = [] // rotas exclusivas do owner, se necessário

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

    return NextResponse.next()
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
