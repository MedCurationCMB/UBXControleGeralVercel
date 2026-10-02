// Contas a criar na autorização de um pedido, conforme o fluxo: uma por beneficiário (mesmo pedido).
// Um beneficiário só (todo pedido normal) = uma conta pelo valor do pedido, como sempre foi.
export function contasPorBeneficiario(
  linhas: { valor_referente: number; beneficiario: string | null }[],
  partePedido: string,
  valorPedido: number
): { beneficiario: string; valor: number }[] {
  const totais = new Map<string, number>()
  for (const l of linhas) {
    const b = l.beneficiario ?? partePedido
    totais.set(b, (totais.get(b) ?? 0) + Number(l.valor_referente))
  }
  if (totais.size > 1) return [...totais].map(([beneficiario, valor]) => ({ beneficiario, valor }))
  return [{ beneficiario: [...totais.keys()][0] ?? partePedido, valor: valorPedido }]
}
