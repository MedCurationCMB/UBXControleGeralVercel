import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { assinar, verificar, type ClienteJwt } from '@/lib/mcp/oauth'

const esc = (s: string) => s.replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`)
const texto = (msg: string, status = 400) => new NextResponse(msg, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8' } })

// Confere cliente, redirect_uri e PKCE. Devolve a mensagem de erro (string) ou os dados; erro aqui NÃO redireciona (o redirect_uri ainda não é confiável).
async function validar(get: (k: string) => string | null) {
  const cliente = await verificar<ClienteJwt>('client', get('client_id'))
  const redirect = get('redirect_uri') ?? ''
  const challenge = get('code_challenge') ?? ''
  if (!cliente || !cliente.ru.includes(redirect)) return 'Cliente ou redirect_uri inválido.'
  if (get('response_type') !== 'code' || get('code_challenge_method') !== 'S256' || !challenge) return 'Requisição OAuth inválida (PKCE S256 é obrigatório).'
  return { cliente, redirect, challenge, clientId: get('client_id')!, state: get('state') ?? '' }
}

const voltar = (redirect: string, params: Record<string, string>) => {
  const u = new URL(redirect)
  for (const [k, v] of Object.entries(params)) if (v) u.searchParams.set(k, v)
  return NextResponse.redirect(u, 303)
}

// Sem login no UBX: vai para a tela de login e volta para cá (o login já aceita ?redirect=).
export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams
  const v = await validar(k => p.get(k))
  if (typeof v === 'string') return texto(v)

  const s = await getSession()
  if (!s || s.status_cadastro !== 'Autorizado') {
    return NextResponse.redirect(new URL(`/login?redirect=${encodeURIComponent(req.nextUrl.pathname + req.nextUrl.search)}`, req.url))
  }

  const campos = ['client_id', 'redirect_uri', 'response_type', 'code_challenge', 'code_challenge_method', 'state']
    .map(k => `<input type="hidden" name="${k}" value="${esc(p.get(k) ?? '')}">`).join('')
  return new NextResponse(`<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Conectar ao UBX</title>
<body style="font-family:system-ui,sans-serif;max-width:420px;margin:12vh auto;padding:0 16px;color:#1e293b">
<h2>Conectar ao UBX</h2>
<p><b>${esc(v.cliente.name)}</b> quer acessar o UBX como <b>${esc(s.username)}</b> no projeto <b>${esc(s.projetoNome)}</b>, com as mesmas permissões do seu perfil.</p>
<p style="font-size:13px;color:#64748b">Retorno para: ${esc(new URL(v.redirect).host)}</p>
<form method="post">${campos}
<button name="decisao" value="permitir" style="padding:10px 18px;background:#0f766e;color:#fff;border:0;border-radius:6px;font-size:15px">Permitir</button>
<button name="decisao" value="negar" style="padding:10px 18px;margin-left:8px;background:#e2e8f0;border:0;border-radius:6px;font-size:15px">Negar</button>
</form></body></html>`, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'X-Frame-Options': 'DENY', 'Cache-Control': 'no-store' } })
}

// O cookie da sessão é SameSite=lax: um POST vindo de outro site não o leva, então só o botão desta página chega aqui logado.
export async function POST(req: NextRequest) {
  const f = await req.formData().catch(() => null)
  if (!f) return texto('Requisição inválida.')
  const v = await validar(k => (f.has(k) ? String(f.get(k)) : null))
  if (typeof v === 'string') return texto(v)

  const s = await getSession()
  if (!s || s.status_cadastro !== 'Autorizado') return texto('Sessão expirada. Abra o conector de novo.', 401)
  if (f.get('decisao') !== 'permitir') return voltar(v.redirect, { error: 'access_denied', state: v.state })

  const code = await assinar('code', { uid: s.userId, pid: s.projetoId, cid: v.clientId, ru: v.redirect, cc: v.challenge }, '2m')
  return voltar(v.redirect, { code, state: v.state })
}
