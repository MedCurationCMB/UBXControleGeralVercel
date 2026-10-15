// Converte a linha digitável (47 dígitos, impressa e confiável de ler/digitar)
// para o código de barras (44 dígitos) exigido no Segmento J do CNAB240.
// Algoritmo padrão Febraban: cada um dos 3 primeiros campos da linha digitável
// carrega um dígito verificador próprio que não existe no código de barras.
//
// Tributo/convênio (ex.: DAM do ISS) tem linha digitável de 48 dígitos: 4 blocos de 11 + 1 DV cada,
// e o código de barras de 44 dígitos é só a junção dos 4 blocos sem os DVs (vai no Segmento O).
export function linhaDigitavelParaCodigoBarras(valor: string): string {
  const d = valor.replace(/\D/g, '')
  if (d.length === 44) return d
  if (d.length === 48) return [0, 12, 24, 36].map(i => d.slice(i, i + 11)).join('')
  if (d.length !== 47) return d // formato desconhecido: devolve como veio

  const campo1 = d.slice(0, 9)   // banco(3)+moeda(1)+campo-livre[0:5], sem DV
  const campo2 = d.slice(10, 20) // campo-livre[5:15], sem DV
  const campo3 = d.slice(21, 31) // campo-livre[15:25], sem DV
  const dvGeral = d.slice(32, 33)
  const fatorVencimentoValor = d.slice(33, 47) // fator vencimento(4) + valor(10)

  return campo1.slice(0, 4) + dvGeral + fatorVencimentoValor + campo1.slice(4) + campo2 + campo3
}

// Código de barras de arrecadação/convênio/tributo começa com 8.
export const ehTributo = (codigoBarras44: string) => codigoBarras44.length === 44 && codigoBarras44[0] === '8'

// Confere os dígitos verificadores dos 4 blocos de uma linha digitável de 48 dígitos. Pega erro de leitura do OCR
// antes de gerar a remessa. Só o módulo 10 (3º dígito 6 ou 7, o caso do DAM de Fortaleza) é conferido;
// o módulo 11 (3º dígito 8 ou 9) fica sem conferência em vez de arriscar recusar um código bom.
export function dvTributoValido(linha48: string): boolean {
  const d = linha48.replace(/\D/g, '')
  if (d.length !== 48) return false
  if (d[0] !== '8' || !['6', '7'].includes(d[2])) return true
  return [0, 12, 24, 36].every(i => dvModulo10(d.slice(i, i + 11)) === Number(d[i + 11]))
}

function dvModulo10(bloco: string): number {
  let soma = 0
  for (let i = bloco.length - 1, peso = 2; i >= 0; i--, peso = peso === 2 ? 1 : 2) {
    const p = Number(bloco[i]) * peso
    soma += p > 9 ? p - 9 : p
  }
  return (10 - (soma % 10)) % 10
}
