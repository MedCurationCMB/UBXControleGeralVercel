import { createClient } from '@supabase/supabase-js'

// Cliente server-side com service role — use somente em Server Components e API Routes
// NUNCA exponha a service role key no browser
export function createServerClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  )
}

// Singleton para reutilizar em Server Components (sem cookies de usuário)
export const supabaseServer = createServerClient()
