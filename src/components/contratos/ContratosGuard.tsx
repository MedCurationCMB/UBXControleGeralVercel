'use client'

import { useContratosLiberados } from '@/lib/useContratosLiberados'

export default function ContratosGuard({ children }: { children: React.ReactNode }) {
  const liberado = useContratosLiberados()
  if (liberado === null) return <p className="text-slate-400 text-sm">Carregando...</p>
  if (!liberado) {
    return (
      <div className="card max-w-md">
        <p className="text-sm text-slate-600">
          O módulo de contratos não está liberado. Um administrador pode ativá-lo em Painel Admin → Configurações.
        </p>
      </div>
    )
  }
  return <>{children}</>
}
