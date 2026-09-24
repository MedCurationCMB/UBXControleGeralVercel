'use client'

import { useEffect, useState } from 'react'
import { supabaseBrowser as supabase } from '@/lib/supabase/client'

export const CONTRATOS_EVENT = 'contratos-liberados-changed'

// Config `contratos_liberados` = 'true' libera tudo de contrato (menu, pedido, modelos).
// Sem config ou 'false' = oculto. Devolve null enquanto carrega (tratar como oculto).
export function useContratosLiberados(): boolean | null {
  const [liberado, setLiberado] = useState<boolean | null>(null)

  useEffect(() => {
    supabase.from('config').select('valor').eq('chave', 'contratos_liberados').maybeSingle()
      .then(({ data }) => setLiberado(data?.valor === 'true'))
    const handler = (e: Event) => setLiberado((e as CustomEvent<boolean>).detail)
    window.addEventListener(CONTRATOS_EVENT, handler)
    return () => window.removeEventListener(CONTRATOS_EVENT, handler)
  }, [])

  return liberado
}
