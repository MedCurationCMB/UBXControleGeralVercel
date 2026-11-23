// Regras de CPF/CNPJ e chave Pix dos cadastros de fornecedor e cliente (telas e MCP). Sem dependências.
export const UFS = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO']

export function somenteDigitos(v: string) { return v.replace(/\D/g, '') }

export function validarCpfCnpj(v: string): { ok: boolean; digitos: string } {
  const d = somenteDigitos(v)
  return { ok: d.length === 11 || d.length === 14, digitos: d }
}

export function formatarCpfCnpj(d: string): string {
  if (d.length === 11) return `${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6,9)}-${d.slice(9,11)}`
  if (d.length === 14) return `${d.slice(0,2)}.${d.slice(2,5)}.${d.slice(5,8)}/${d.slice(8,12)}-${d.slice(12,14)}`
  return d
}

// Chave Pix tipo telefone precisa ir no arquivo remessa como +55DDDNNNNNNNNN (E.164)
export function formatarChaveTelefone(v: string): { ok: boolean; chave: string } {
  let d = somenteDigitos(v)
  if (d.length === 10 || d.length === 11) d = '55' + d
  const ok = d.length === 12 || d.length === 13
  return { ok, chave: ok ? `+${d}` : v }
}
