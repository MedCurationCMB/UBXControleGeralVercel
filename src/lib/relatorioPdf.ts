// Relatório PDF de pagamentos enviados ao banco. Usado pelo relatório de cada remessa
// (RemessaRetornoModal) e pelo consolidado do dia (RelatorioEnviadosModal).

export interface LinhaRelatorio {
  pagamento_id: number; pedido_id: number | null; fornecedor: string
  empresa: string; categoria: string; tipo_pagamento: number
  data_pagamento: string; valor_pagamento: number; observacao: string
  origem?: string // quando informada, aparece no card (ex.: "Remessa CI240_001_0000012.rem" ou "Manual")
}

const TIPO_NOME: Record<number, string> = { 1: 'PIX', 2: 'Dinheiro', 3: 'Boleto', 4: 'Cartão', 5: 'À Definir' }

export async function gerarRelatorioPdf({ titulo, cabecalho, rows }: {
  titulo: string; cabecalho: string[]; rows: LinhaRelatorio[]
}): Promise<ArrayBuffer> {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const W = 210; const M = 15; const CW = W - M * 2
  const AZUL = '#1f4e79'; const CINZA = '#f4f6f9'; const LINHA = '#d0d5dd'

  const now = new Date()
  const dataHora = now.toLocaleDateString('pt-BR') + ' ' + now.toLocaleTimeString('pt-BR')
  let y = 15

  // ── Cabeçalho ──────────────────────────────────────────────────────────
  doc.setFillColor(AZUL)
  doc.rect(M, y, CW, 12, 'F')
  doc.setTextColor('#ffffff')
  doc.setFontSize(13); doc.setFont('helvetica', 'bold')
  doc.text(titulo, W / 2, y + 8, { align: 'center' })
  y += 16

  doc.setTextColor('#333333')
  doc.setFontSize(9); doc.setFont('helvetica', 'normal')
  for (const linha of cabecalho) { doc.text(linha, M, y); y += 5 }
  doc.text(`Gerado em: ${dataHora}`, M, y); y += 8

  doc.setDrawColor(AZUL)
  doc.setLineWidth(0.5)
  doc.line(M, y, M + CW, y)
  y += 6

  // ── Cards de pagamento ─────────────────────────────────────────────────
  const checkY = (needed: number) => { if (y + needed > 275) { doc.addPage(); y = 15 } }

  for (const row of rows) {
    const obsLines = doc.splitTextToSize(row.observacao || '—', CW - 4)
    const nLinhas = row.origem ? 4 : 3
    const bodyH = 6 * nLinhas + 4
    checkY(10 + bodyH + 5 + obsLines.length * 4.5 + 4 + 4)

    // Header do card
    doc.setFillColor(AZUL)
    doc.rect(M, y, CW, 8, 'F')
    doc.setTextColor('#ffffff')
    doc.setFontSize(9); doc.setFont('helvetica', 'bold')
    doc.text(`Pagamento #${row.pagamento_id}`, M + 3, y + 5.5)
    doc.text(`Pedido #${row.pedido_id ?? '—'}`, M + CW - 3, y + 5.5, { align: 'right' })
    y += 8

    // Corpo do card (fundo cinza)
    doc.setFillColor(CINZA)
    doc.rect(M, y, CW, bodyH, 'F')
    doc.setTextColor('#1f4e79')
    doc.setFontSize(8); doc.setFont('helvetica', 'bold')
    const col2 = M + CW / 2

    const fieldRow = (label1: string, val1: string, label2: string, val2: string, yy: number) => {
      doc.setFont('helvetica', 'bold'); doc.setTextColor('#1f4e79')
      doc.text(label1, M + 3, yy)
      doc.setFont('helvetica', 'normal'); doc.setTextColor('#222222')
      doc.text(val1, M + 3 + doc.getTextWidth(label1) + 1, yy)
      if (!label2) return
      doc.setFont('helvetica', 'bold'); doc.setTextColor('#1f4e79')
      doc.text(label2, col2, yy)
      doc.setFont('helvetica', 'normal'); doc.setTextColor('#222222')
      doc.text(val2, col2 + doc.getTextWidth(label2) + 1, yy)
    }

    const dataPgto = row.data_pagamento
      ? new Date(row.data_pagamento + 'T12:00:00').toLocaleDateString('pt-BR') : '—'
    const valorStr = row.valor_pagamento.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

    fieldRow('Empresa:', row.empresa || '—', 'Fornecedor:', row.fornecedor || '—', y + 5)
    doc.setDrawColor(LINHA); doc.setLineWidth(0.2); doc.line(M, y + 7, M + CW, y + 7)
    fieldRow('Categoria:', row.categoria || '—', 'Tipo de Pagamento:', TIPO_NOME[row.tipo_pagamento] ?? '—', y + 12)
    doc.line(M, y + 14, M + CW, y + 14)
    fieldRow('Data do Pagamento:', dataPgto, 'Valor:', valorStr, y + 19)
    if (row.origem) {
      doc.line(M, y + 21, M + CW, y + 21)
      fieldRow('Envio ao banco:', row.origem, '', '', y + 26)
    }
    y += bodyH

    // Descrição
    doc.setFillColor(CINZA)
    doc.rect(M, y, CW, obsLines.length * 4.5 + 8, 'F')
    doc.setFont('helvetica', 'bold'); doc.setTextColor('#1f4e79'); doc.setFontSize(8)
    doc.text('Descrição da Compra/Contratação:', M + 3, y + 5)
    doc.setFont('helvetica', 'normal'); doc.setTextColor('#222222')
    doc.text(obsLines, M + 3, y + 10)
    y += obsLines.length * 4.5 + 10
    y += 5
  }

  // ── Rodapé / resumo ────────────────────────────────────────────────────
  checkY(16)
  doc.setDrawColor(AZUL); doc.setLineWidth(0.5); doc.line(M, y, M + CW, y); y += 5
  doc.setFontSize(10); doc.setFont('helvetica', 'bold'); doc.setTextColor(AZUL)
  const totalValor = rows.reduce((s, r) => s + r.valor_pagamento, 0)
  doc.text(`Total de pagamentos: ${rows.length}`, M, y); y += 6
  doc.text(`Valor total: ${totalValor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`, M, y)

  return doc.output('arraybuffer')
}

export function baixarPdf(bytes: ArrayBuffer, nome: string) {
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }))
  const a = document.createElement('a')
  a.href = url; a.download = nome; a.click()
  URL.revokeObjectURL(url)
}

// btoa(String.fromCharCode(...bytes)) estoura a pilha em PDFs grandes; em blocos funciona sempre.
export function bytesParaBase64(bytes: ArrayBuffer): string {
  const u8 = new Uint8Array(bytes)
  let s = ''
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000))
  return btoa(s)
}
