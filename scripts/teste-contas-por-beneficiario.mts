// node scripts/teste-contas-por-beneficiario.mts
import assert from 'node:assert/strict'
import { contasPorBeneficiario } from '../src/lib/contasPorBeneficiario.ts'

const l = (valor_referente: number, beneficiario: string | null) => ({ valor_referente, beneficiario })

// pedido normal (vários meses, mesmo fornecedor): uma conta pelo valor do pedido
assert.deepEqual(contasPorBeneficiario([l(100, null), l(100, null)], 'Joao', 200), [{ beneficiario: 'Joao', valor: 200 }])
assert.deepEqual(contasPorBeneficiario([l(100, 'Joao'), l(100, 'Joao')], 'Joao', 200), [{ beneficiario: 'Joao', valor: 200 }])
// um beneficiário diferente do fornecedor, só ele: conta no nome dele
assert.deepEqual(contasPorBeneficiario([l(50, 'Maria')], 'Joao', 50), [{ beneficiario: 'Maria', valor: 50 }])
// vários: uma conta por beneficiário, somando os meses
assert.deepEqual(
  contasPorBeneficiario([l(100, 'Joao'), l(40, 'Maria'), l(60, 'Maria'), l(10, null)], 'Joao', 210),
  [{ beneficiario: 'Joao', valor: 110 }, { beneficiario: 'Maria', valor: 100 }]
)
// pedido sem fluxo: uma conta no nome do fornecedor
assert.deepEqual(contasPorBeneficiario([], 'Joao', 99), [{ beneficiario: 'Joao', valor: 99 }])
console.log('ok')
