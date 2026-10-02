// node scripts/teste-extrato-vinculo.mts  (regras de valor/data do vinculo extrato <-> conta)
import assert from 'node:assert/strict'
import { candidatos, erroVinculo, type ContaLivre } from '../src/lib/extratoVinculo.ts'

const conta = (o: Partial<ContaLivre>): ContaLivre => ({
  id: 1, parte: 'Diepi', empresa: 'X', data_vencimento: null, data_pagamento: null, valor_pagar: 100, valor_pagamento: null, ...o,
})
const l = { data: '2026-08-03', valor: -100 }

assert.equal(erroVinculo(l, conta({})), null)
assert.ok(erroVinculo({ ...l, valor: -200 }, conta({})), 'valor diferente nao vincula')
assert.ok(erroVinculo(l, conta({ data_pagamento: '2026-08-04' })), 'data de pagamento diferente nao vincula')
assert.equal(erroVinculo(l, conta({ data_pagamento: '2026-08-03' })), null)
assert.equal(erroVinculo(l, conta({ valor_pagar: 300, valor_pagamento: 100 })), null, 'compara o valor pago, se houver')

const c = candidatos(l, [
  conta({ id: 1, data_vencimento: '2026-08-10' }),
  conta({ id: 2, data_vencimento: '2026-08-03' }),
  conta({ id: 3, valor_pagar: 50 }),
])
assert.deepEqual(c.map(x => x.id), [2, 1], 'mesma data primeiro; outro valor fora')
assert.equal(c[0].sugerido, true)
assert.equal(c[1].sugerido, false)
console.log('ok')
