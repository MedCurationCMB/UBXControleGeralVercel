import { createHash } from 'crypto'
import { SignJWT, jwtVerify } from 'jose'

// OAuth do MCP sem tabela: cliente, código e tokens são JWTs assinados.
// Chave própria (SESSION_SECRET + ':mcp') e claim `typ`: um token do MCP nunca vale como cookie de sessão, nem o contrário.
// ponytail: código de uso único não é garantido (vale 2 min e exige PKCE) e refresh token não é revogável
// (o usuário é reconferido no banco a cada chamada); tabela de códigos/revogação se isso importar.
type Typ = 'client' | 'code' | 'access' | 'refresh'

const key = () => {
  const s = process.env.SESSION_SECRET
  if (!s) throw new Error('SESSION_SECRET não definido')
  return new TextEncoder().encode(`${s}:mcp`)
}

export const assinar = (typ: Typ, claims: Record<string, unknown>, exp: string) =>
  new SignJWT({ ...claims, typ }).setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime(exp).sign(key())

export async function verificar<T = Record<string, unknown>>(typ: Typ, token: string | null | undefined): Promise<T | null> {
  if (!token) return null
  try {
    const { payload } = await jwtVerify(token, key())
    return payload.typ === typ ? (payload as T) : null
  } catch {
    return null
  }
}

export const baseUrl = (req: Request) => new URL(req.url).origin

export const pkceOk = (verifier: string, challenge: string) =>
  createHash('sha256').update(verifier).digest('base64url') === challenge

// https, ou http só em localhost (clientes de desenvolvimento)
export function uriOk(u: string) {
  try {
    const x = new URL(u)
    return x.protocol === 'https:' || (x.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(x.hostname))
  } catch {
    return false
  }
}

export interface ClienteJwt { ru: string[]; name: string }
export interface CodigoJwt { uid: number; pid: number; cid: string; ru: string; cc: string }
export interface TokenJwt { uid: number; pid: number; cid: string }

// access (1h) + refresh (30d)
export async function emitirTokens(t: TokenJwt) {
  return {
    access_token: await assinar('access', { ...t }, '1h'),
    token_type: 'Bearer',
    expires_in: 3600,
    refresh_token: await assinar('refresh', { ...t }, '30d'),
  }
}
