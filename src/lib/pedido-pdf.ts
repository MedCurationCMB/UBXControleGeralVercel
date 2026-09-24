interface PedidoPdf {
  titulo: string
  arquivo: string
  campos: [string, string | null | undefined][]
  cronogramaTitulo: string
  cronograma: { periodo: string; valor: string; status: string }[]
}

const X_LABEL = 20
const X_VALOR = 70
const LARGURA_VALOR = 120 // 210mm de página - 70 de início - 20 de margem
const ALTURA_LINHA = 5
const Y_MAX = 280

// Quebra texto longo/multilinha (ex: observação) em linhas que cabem na página
// e pula de página, em vez de escrever tudo na mesma altura.
export async function gerarPdfPedido({ titulo, arquivo, campos, cronogramaTitulo, cronograma }: PedidoPdf) {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })

  doc.setFontSize(16); doc.setFont('helvetica', 'bold')
  doc.text(titulo, 105, 18, { align: 'center' })
  doc.setFontSize(10)

  let y = 32
  const garantirEspaco = (altura: number) => {
    if (y + altura > Y_MAX) { doc.addPage(); y = 20 }
  }

  for (const [k, v] of campos) {
    const linhas: string[] = doc.splitTextToSize(v || '—', LARGURA_VALOR)
    garantirEspaco(linhas.length * ALTURA_LINHA)
    doc.setFont('helvetica', 'bold'); doc.text(`${k}:`, X_LABEL, y)
    doc.setFont('helvetica', 'normal'); doc.text(linhas, X_VALOR, y)
    y += linhas.length * ALTURA_LINHA + 2
  }

  if (cronograma.length > 0) {
    y += 5
    garantirEspaco(ALTURA_LINHA * 2)
    doc.setFont('helvetica', 'bold'); doc.text(cronogramaTitulo, X_LABEL, y)
    y += 7
    doc.setFont('helvetica', 'normal')
    for (const r of cronograma) {
      garantirEspaco(6)
      doc.text(r.periodo, 25, y); doc.text(r.valor, 80, y); doc.text(r.status, 140, y)
      y += 6
    }
  }

  doc.save(arquivo)
}
