import { createClient } from '@supabase/supabase-js'

// Projeto ativo: cookie ubx_projeto (definido no login/troca de projeto)
const projetoAtivo = () =>
  typeof document === 'undefined' ? null : document.cookie.match(/(?:^|; )ubx_projeto=(\d+)/)?.[1] ?? null

// Cliente para uso no browser (componentes client-side).
// Toda requisição leva o cabeçalho x-projeto-id: o banco usa o projeto ativo como padrão nos inserts
// e (com RLS, fase 4) para filtrar as consultas.
export const supabaseBrowser = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  {
    global: {
      fetch: (input, init) => {
        const projeto = projetoAtivo()
        if (!projeto) return fetch(input, init)
        const headers = new Headers(init?.headers)
        headers.set('x-projeto-id', projeto)
        return fetch(input, { ...init, headers })
      },
    },
  }
)
