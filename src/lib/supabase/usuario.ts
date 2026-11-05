import { createClient } from '@supabase/supabase-js'
import { criarTokenDb } from '@/lib/db-token'
import type { SessionPayload } from '@/types/database'

// Cliente server-side que age COMO o usuário (JWT + projeto ativo): o RLS (projeto, módulo e centros de resultado) vale.
// Use nas rotas que leem dados de pedidos/controle; o cliente de serviço (createServerClient) ignora o RLS.
export async function clienteDoUsuario(session: SessionPayload) {
  const token = await criarTokenDb(session.userId)
  if (!token) throw new Error('SUPABASE_JWT_SECRET não definido')
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}`, 'x-projeto-id': String(session.projetoId) } },
  })
}
