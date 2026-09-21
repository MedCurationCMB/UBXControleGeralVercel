// Converte a linha digitável (47 dígitos, impressa e confiável de ler/digitar)
// para o código de barras (44 dígitos) exigido no Segmento J do CNAB240.
// Algoritmo padrão Febraban: cada um dos 3 primeiros campos da linha digitável
// carrega um dígito verificador próprio que não existe no código de barras.
export function linhaDigitavelParaCodigoBarras(valor: string): string {
  const d = valor.replace(/\D/g, '')
  if (d.length === 44) return d
  if (d.length !== 47) return d // formato desconhecido: devolve como veio

  const campo1 = d.slice(0, 9)   // banco(3)+moeda(1)+campo-livre[0:5], sem DV
  const campo2 = d.slice(10, 20) // campo-livre[5:15], sem DV
  const campo3 = d.slice(21, 31) // campo-livre[15:25], sem DV
  const dvGeral = d.slice(32, 33)
  const fatorVencimentoValor = d.slice(33, 47) // fator vencimento(4) + valor(10)

  return campo1.slice(0, 4) + dvGeral + fatorVencimentoValor + campo1.slice(4) + campo2 + campo3
}
