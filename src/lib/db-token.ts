import { SignJWT } from 'jose'
import type { NextRequest, NextResponse } from 'next/server'

// JWT do Supabase (role "authenticated" + usuario_id) que o navegador manda ao banco.
// O RLS usa usuario_id + cabeçalho x-projeto-id para decidir o que cada usuário enxerga.
// O vínculo usuário × projeto é conferido no banco a cada consulta (não vai no token).
export const DB_COOKIE = 'ubx_db'
const TTL_SEGUNDOS = 60 * 60 * 24
const RENOVAR_ABAIXO_DE = 60 * 60 * 12

function segredo() {
  const s = process.env.SUPABASE_JWT_SECRET
  return s ? new TextEncoder().encode(s) : null
}

export async function criarTokenDb(userId: number): Promise<string | null> {
  const key = segredo()
  if (!key) return null
  return new SignJWT({ role: 'authenticated', usuario_id: userId })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(String(userId))
    .setIssuedAt()
    .setExpirationTime(`${TTL_SEGUNDOS}s`)
    .sign(key)
}

function segundosRestantes(token: string | undefined): number {
  try {
    const exp = JSON.parse(atob((token ?? '').split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).exp as number
    return exp - Math.floor(Date.now() / 1000)
  } catch {
    return 0
  }
}

// Chamado no middleware: cria/renova o cookie do token (cobre também sessões abertas antes do RLS).
// Sem SUPABASE_JWT_SECRET configurado não faz nada.
export async function garantirTokenDb(req: NextRequest, res: NextResponse, userId: number) {
  if (segundosRestantes(req.cookies.get(DB_COOKIE)?.value) > RENOVAR_ABAIXO_DE) return
  const token = await criarTokenDb(userId)
  if (!token) return
  res.cookies.set(DB_COOKIE, token, {
    httpOnly: false, // o cliente Supabase do navegador precisa ler
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: TTL_SEGUNDOS,
    path: '/',
  })
}
