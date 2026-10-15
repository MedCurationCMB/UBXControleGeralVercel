// Teste de src/lib/relatorioPdf.ts (sem banco, sem navegador).
// Uso: node scripts/teste-relatorio-pdf.mts
import assert from 'node:assert/strict'
import { gerarRelatorioPdf, bytesParaBase64, type LinhaRelatorio } from '../src/lib/relatorioPdf.ts'

const linha = (i: number, origem?: string): LinhaRelatorio => ({
  pagamento_id: i, pedido_id: i % 3 ? 100 + i : null, fornecedor: 'JOÃO & CIA CONSTRUÇÕES', empresa: 'UBX ENGENHARIA',
  categoria: 'ISS', tipo_pagamento: i % 2 ? 1 : 3, data_pagamento: '2026-10-13', valor_pagamento: 773.38 + i,
  observacao: 'Pagamento do DAM de ISS retido da competência 09/2026. '.repeat(1 + (i % 4)), origem,
})
const paginas = (b: ArrayBuffer) => (Buffer.from(b).toString('latin1').match(/\/Type\s*\/Page[^s]/g) ?? []).length

// 1. sem origem (relatório de remessa): gera PDF válido
const a = await gerarRelatorioPdf({ titulo: 'T', cabecalho: ['Arquivo: x.rem'], rows: [linha(1), linha(2)] })
assert.equal(Buffer.from(a).subarray(0, 5).toString(), '%PDF-')
assert.equal(paginas(a), 1)

// 2. com origem (consolidado) e muitas linhas: pagina e não perde cards
const rows = Array.from({ length: 40 }, (_, i) => linha(i + 1, i % 2 ? 'Manual' : 'Remessa CI240_001_0000012.rem'))
const b = await gerarRelatorioPdf({ titulo: 'T', cabecalho: ['Dia do envio: 13/10/2026'], rows })
assert.ok(paginas(b) > 1, `esperava mais de 1 página, veio ${paginas(b)}`)
const bytesTexto = Buffer.from(b).toString('latin1')
assert.ok(bytesTexto.includes('Envio ao banco'), 'faltou o campo de origem')

// 3. base64 de arquivo grande não estoura a pilha e volta idêntico
const grande = new Uint8Array(500_000).map((_, i) => i % 251).buffer
assert.deepEqual(Buffer.from(bytesParaBase64(grande), 'base64'), Buffer.from(grande))

console.log(`OK: ${paginas(a)} pág. (remessa), ${paginas(b)} pág. (consolidado, 40 cards), base64 de 500 KB`)
