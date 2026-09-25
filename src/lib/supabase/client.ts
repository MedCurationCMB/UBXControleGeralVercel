import { createClient } from '@supabase/supabase-js'

const cookie = (nome: string) =>
  typeof document === 'undefined' ? null : document.cookie.match(new RegExp(`(?:^|; )${nome}=([^;]+)`))?.[1] ?? null

// Cliente para uso no browser (componentes client-side).
// Toda requisição leva:
//  - x-projeto-id: projeto ativo (cookie ubx_projeto). O banco usa como padrão nos inserts e o RLS filtra por ele;
//  - Authorization: JWT do usuário (cookie ubx_db, criado pelo middleware). É ele que o RLS usa para
//    saber quem é e a quais projetos tem acesso. Sem ele, só a chave anônima: o banco não devolve nada.
export const supabaseBrowser = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  {
    global: {
      fetch: (input, init) => {
        const projeto = cookie('ubx_projeto')
        const token = cookie('ubx_db')
        if (!projeto && !token) return fetch(input, init)
        const headers = new Headers(init?.headers)
        if (projeto) headers.set('x-projeto-id', projeto)
        if (token) headers.set('Authorization', `Bearer ${token}`)
        return fetch(input, { ...init, headers })
      },
    },
  }
)
