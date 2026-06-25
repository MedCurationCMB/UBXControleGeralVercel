'use client'

import { useState, useEffect } from 'react'
import type { SessionPayload } from '@/types/database'

export function useSession() {
  const [session, setSession] = useState<SessionPayload | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/auth/me')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => setSession(data))
      .finally(() => setLoading(false))
  }, [])

  return { session, loading }
}
