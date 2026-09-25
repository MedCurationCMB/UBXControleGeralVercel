import { createHash } from 'crypto'
import { SignJWT, jwtVerify } from 'jose'
import { cookies } from 'next/headers'
import type { SessionPayload } from '@/types/database'

const SESSION_COOKIE = 'ubx_session'
const PROJETO_COOKIE = 'ubx_projeto'
const SESSION_MAX_AGE = 60 * 60 * 24 // 24 horas em segundos

function getSecretKey() {
  const secret = process.env.SESSION_SECRET
  if (!secret) throw new Error('SESSION_SECRET não definido')
  return new TextEncoder().encode(secret)
}

// SHA-256 — mantém compatibilidade com as senhas já salvas no banco
export function hashPassword(password: string): string {
  return createHash('sha256').update(password).digest('hex')
}

export async function createSession(payload: SessionPayload): Promise<string> {
  const token = await new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('24h')
    .sign(getSecretKey())

  return token
}

export async function verifySession(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecretKey())
    return payload as unknown as SessionPayload
  } catch {
    return null
  }
}

export async function getSession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies()
  const token = cookieStore.get(SESSION_COOKIE)?.value
  if (!token) return null
  const s = await verifySession(token)
  if (!s) return null
  // Sessões emitidas antes do multi-projeto não têm projeto: são do UBX (id 1)
  return { ...s, projetoId: s.projetoId ?? 1, projetoNome: s.projetoNome ?? 'UBX' }
}

export async function setSessionCookie(token: string) {
  const cookieStore = await cookies()
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: SESSION_MAX_AGE,
    path: '/',
  })
}

// Projeto ativo para o navegador: o cliente Supabase lê este cookie e manda o cabeçalho x-projeto-id.
// Não é confiável por si só (o servidor usa a sessão); o RLS da fase 4 valida o vínculo.
export async function setProjetoCookie(projetoId: number) {
  const cookieStore = await cookies()
  cookieStore.set(PROJETO_COOKIE, String(projetoId), {
    httpOnly: false,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: SESSION_MAX_AGE,
    path: '/',
  })
}

export async function clearSessionCookie() {
  const cookieStore = await cookies()
  cookieStore.delete(SESSION_COOKIE)
  cookieStore.delete(PROJETO_COOKIE)
}

export { SESSION_COOKIE, PROJETO_COOKIE }
