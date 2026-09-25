// Leitura de células/valores das planilhas de importação em lote (controle de pagamentos e recebimentos).

// Valor da célula como texto/número (fórmula, texto formatado e link viram o conteúdo visível).
export function valorCelula(v: unknown): unknown {
  if (v && typeof v === 'object' && !(v instanceof Date)) {
    const o = v as { result?: unknown; richText?: { text: string }[]; text?: unknown }
    if ('result' in o) return o.result
    if (o.richText) return o.richText.map(t => t.text).join('')
    if ('text' in o) return o.text
  }
  return v
}

const dataValida = (y: number, m: number, d: number) => {
  const dt = new Date(Date.UTC(y, m - 1, d))
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d
}

// Retorna a data ISO, null se vazia, ou undefined se inválida.
export function parseDate(v: unknown): string | null | undefined {
  if (v == null || v === '') return null
  if (v instanceof Date) return isNaN(v.getTime()) ? undefined : v.toISOString().split('T')[0]
  const s = String(v).trim()
  const br = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (br) return dataValida(+br[3], +br[2], +br[1]) ? `${br[3]}-${br[2].padStart(2, '0')}-${br[1].padStart(2, '0')}` : undefined
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (iso) return dataValida(+iso[1], +iso[2], +iso[3]) ? `${iso[1]}-${iso[2]}-${iso[3]}` : undefined
  return undefined
}

// Retorna o número, null se vazio, ou undefined se inválido/ambíguo.
// Aceita 1500.50, 1500,50 e 1.500,50. "1.500" (só ponto + 3 dígitos) é ambíguo e é rejeitado.
export function parseNumero(v: unknown): number | null | undefined {
  if (v == null || v === '') return null
  if (typeof v === 'number') return isFinite(v) ? v : undefined
  let s = String(v).replace(/R\$|\s/g, '')
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.')
  else if (/^\d{1,3}\.\d{3}$/.test(s)) return undefined
  return /^\d+(\.\d+)?$/.test(s) ? parseFloat(s) : undefined
}
