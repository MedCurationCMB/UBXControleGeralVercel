// Dados do favorecido da remessa CNAB (PIX): usados pelo modal de remessa e pelo MCP.
const FORMA_INICIACAO_MAP: Record<string, string> = {
  telefone: '01', celular: '01', email: '02', 'e-mail': '02',
  cpf: '03', cnpj: '03', 'cpf/cnpj': '03',
  aleatoria: '04', aleatória: '04', 'chave aleatoria': '04', 'chave aleatória': '04',
  'dados bancarios': '05', 'dados bancários': '05',
}

export function getFormaIniciacao(tipoChaveId: number | null, tiposChaveMap: Record<number, string>): string {
  if (!tipoChaveId) return '03'
  const nome = (tiposChaveMap[tipoChaveId] ?? '').toLowerCase().trim()
  return FORMA_INICIACAO_MAP[nome] ?? '03'
}

export function cleanDoc(doc: string | null | undefined): string {
  return String(doc ?? '').replace(/\D/g, '')
}

export function getTipoDocFav(cnpjCpf: string | null): string {
  return cleanDoc(cnpjCpf).length <= 11 ? '1' : '2'
}
