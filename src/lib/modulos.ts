// Perfis por módulo: o perfil de um membro do projeto é papel (admin|user) × módulo.
// módulo null = vê os dois módulos (Usuário e Administrador de sempre). Sem dependências: vale no servidor e no navegador.
export type Modulo = 'pagamentos' | 'recebimentos'
export type Papel = 'admin' | 'user'

export const veModulo = (m: Modulo | null | undefined, alvo: Modulo) => !m || m === alvo

const NOME_MODULO: Record<Modulo, string> = { pagamentos: 'Pagamento', recebimentos: 'Recebimento' }

export const nomePerfil = (papel: Papel, modulo: Modulo | null | undefined) =>
  `${papel === 'admin' ? 'Administrador' : 'Usuário'}${modulo ? ` ${NOME_MODULO[modulo]}` : ''}`

// Valor do <select> de perfil: 'user', 'admin', 'user:pagamentos', ...
export const perfilValor = (papel: Papel, modulo: Modulo | null | undefined) => (modulo ? `${papel}:${modulo}` : papel)

export const PERFIS: { valor: string; label: string }[] = (['user', 'admin'] as Papel[]).flatMap(p => [
  { valor: perfilValor(p, null), label: nomePerfil(p, null) },
  { valor: perfilValor(p, 'pagamentos'), label: nomePerfil(p, 'pagamentos') },
  { valor: perfilValor(p, 'recebimentos'), label: nomePerfil(p, 'recebimentos') },
])

export function lerPerfil(v: unknown): { papel: Papel; modulo: Modulo | null } | null {
  const [papel, modulo, resto] = String(v ?? '').split(':')
  if ((papel !== 'admin' && papel !== 'user') || resto !== undefined) return null
  if (modulo !== undefined && modulo !== 'pagamentos' && modulo !== 'recebimentos') return null
  return { papel, modulo: (modulo as Modulo | undefined) ?? null }
}
