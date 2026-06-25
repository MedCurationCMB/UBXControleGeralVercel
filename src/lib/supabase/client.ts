import { createClient } from '@supabase/supabase-js'

// Cliente para uso no browser (componentes client-side)
export const supabaseBrowser = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)
