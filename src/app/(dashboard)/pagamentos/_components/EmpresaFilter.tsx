'use client'

import { useRouter, usePathname } from 'next/navigation'

interface EmpresaFilterProps {
  empresas: string[]
  selected: string
}

export default function EmpresaFilter({ empresas, selected }: EmpresaFilterProps) {
  const router = useRouter()
  const pathname = usePathname()

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value
    const url = new URL(pathname, window.location.origin)
    if (value) url.searchParams.set('empresa', value)
    else url.searchParams.delete('empresa')
    router.push(url.pathname + url.search)
  }

  return (
    <select value={selected} onChange={handleChange} className="input w-64">
      <option value="">Todas as empresas</option>
      {empresas.map((e) => <option key={e} value={e}>{e}</option>)}
    </select>
  )
}
