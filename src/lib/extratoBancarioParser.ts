// Parsers para os 3 formatos de extrato exportados pelo Banco Inter (CSV / OFX / TXT-CNAB240 segmento E).
// Todos produzem o mesmo formato normalizado, usado para detectar duplicidade (conta + periodo)
// e para gravar os lancamentos, independente de qual formato o usuario escolheu subir.

export interface LancamentoExtrato {
  data: string // ISO yyyy-mm-dd
  descricao: string
  valor: number // positivo = entrada, negativo = saida
  saldoApos: number | null
  codigoOrigem: string | null
}

export interface ExtratoParseado {
  conta: string
  periodoInicio: string // ISO yyyy-mm-dd
  periodoFim: string // ISO yyyy-mm-dd
  saldoInicial: number | null
  saldoFinal: number | null
  lancamentos: LancamentoExtrato[]
}

function dataBrParaIso(dd: string, mm: string, yyyy: string): string {
  return `${yyyy}-${mm}-${dd}`
}

function numeroBr(valor: string): number {
  return parseFloat(valor.trim().replace(/\./g, '').replace(',', '.'))
}

export function parseExtratoCsv(text: string): ExtratoParseado {
  const linhas = text.split(/\r?\n/).map(l => l.trimEnd())

  const linhaConta = linhas.find(l => l.startsWith('Conta'))
  const linhaPeriodo = linhas.find(l => l.startsWith('Período') || l.startsWith('Periodo'))
  if (!linhaConta || !linhaPeriodo) throw new Error('Não foi possível ler conta/período do CSV')

  const conta = linhaConta.split(';')[1]?.trim()
  const [inicioBr, fimBr] = linhaPeriodo.split(';')[1]?.split(' a ').map(s => s.trim()) ?? []
  if (!conta || !inicioBr || !fimBr) throw new Error('Não foi possível ler conta/período do CSV')

  const [di, mi, yi] = inicioBr.split('/')
  const [df, mf, yf] = fimBr.split('/')

  const headerIdx = linhas.findIndex(l => l.startsWith('Data Lançamento') || l.startsWith('Data Lancamento'))
  if (headerIdx === -1) throw new Error('Cabeçalho da tabela não encontrado no CSV')

  const lancamentos: LancamentoExtrato[] = []
  for (const linha of linhas.slice(headerIdx + 1)) {
    if (!linha.trim()) continue
    const [dataBr, descricao, valorStr, saldoStr] = linha.split(';')
    if (!dataBr || !valorStr) continue
    const [dd, mm, yyyy] = dataBr.split('/')
    lancamentos.push({
      data: dataBrParaIso(dd, mm, yyyy),
      descricao: (descricao ?? '').trim(),
      valor: numeroBr(valorStr),
      saldoApos: saldoStr ? numeroBr(saldoStr) : null,
      codigoOrigem: null,
    })
  }

  const primeiro = lancamentos[0]
  const ultimo = lancamentos[lancamentos.length - 1]

  return {
    conta,
    periodoInicio: dataBrParaIso(di, mi, yi),
    periodoFim: dataBrParaIso(df, mf, yf),
    saldoInicial: primeiro?.saldoApos != null ? primeiro.saldoApos - primeiro.valor : null,
    saldoFinal: ultimo?.saldoApos ?? null,
    lancamentos,
  }
}

export function parseExtratoOfx(text: string): ExtratoParseado {
  const acctId = text.match(/<ACCTID>([^<\r\n]*)/)?.[1]?.trim()
  const dtStart = text.match(/<DTSTART>(\d{8})/)?.[1]
  const dtEnd = text.match(/<DTEND>(\d{8})/)?.[1]
  if (!acctId || !dtStart || !dtEnd) throw new Error('Não foi possível ler conta/período do OFX')

  const isoData = (yyyymmdd: string) => `${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}`

  const lancamentos: LancamentoExtrato[] = []
  const blocos = text.match(/<STMTTRN>[\s\S]*?<\/STMTTRN>/g) ?? []
  for (const bloco of blocos) {
    const dtPosted = bloco.match(/<DTPOSTED>(\d{8})/)?.[1]
    const trnAmt = bloco.match(/<TRNAMT>(-?[\d.]+)/)?.[1]
    if (!dtPosted || !trnAmt) continue
    const memo = bloco.match(/<MEMO>([^<\r\n]*)/)?.[1]?.trim()
    const name = bloco.match(/<NAME>([^<\r\n]*)/)?.[1]?.trim()
    const fitId = bloco.match(/<FITID>([^<\r\n]*)/)?.[1]?.trim()
    lancamentos.push({
      data: isoData(dtPosted),
      descricao: memo || name || '',
      valor: parseFloat(trnAmt),
      saldoApos: null,
      codigoOrigem: fitId ?? null,
    })
  }

  return {
    conta: acctId,
    periodoInicio: isoData(dtStart),
    periodoFim: isoData(dtEnd),
    // LEDGERBAL do OFX é o saldo atual no momento da exportação, não o saldo do fim do período — não dá pra usar aqui.
    saldoInicial: null,
    saldoFinal: null,
    lancamentos,
  }
}

// TXT: layout fixo de 240 colunas nos moldes do CNAB240 (mesma convenção do parser de retorno em
// src/app/api/remessa/importar-retorno/route.ts), usando o segmento proprietário "E" do Inter para extrato.
// Offsets abaixo foram conferidos byte a byte contra um arquivo real (soma dos lançamentos bate com
// saldo_final - saldo_inicial do próprio arquivo).
export function parseExtratoTxt(text: string): ExtratoParseado {
  const linhas = text
    .split(/\r?\n/)
    .map(l => (l.length >= 240 ? l : l.padEnd(240, ' ')))
    .filter(l => l.trim())

  const isoData = (ddmmyyyy: string) => `${ddmmyyyy.slice(4, 8)}-${ddmmyyyy.slice(2, 4)}-${ddmmyyyy.slice(0, 2)}`
  const valorComSinal = (linha: string) => {
    const num = parseInt(linha.slice(150, 168), 10) || 0
    const sinal = linha[168] === 'D' ? -1 : 1
    return (num / 100) * sinal
  }

  const headerLote = linhas.find(l => l[7] === '1')
  const trailerLote = linhas.find(l => l[7] === '5')
  if (!headerLote || !trailerLote) throw new Error('Não foi possível ler cabeçalho/rodapé do TXT')

  // o campo de 19 dígitos em [52,71) traz um prefixo interno do banco antes da conta; a conta em si
  // são os últimos 9 dígitos (mesmo valor exibido no CSV/OFX, ex.: "58155872")
  const conta = headerLote.slice(62, 71).trim().replace(/^0+/, '')
  const periodoInicio = isoData(headerLote.slice(142, 150))
  const periodoFim = isoData(trailerLote.slice(142, 150))

  const lancamentos: LancamentoExtrato[] = []
  for (const linha of linhas) {
    if (linha[7] !== '3' || linha[13] !== 'E') continue
    lancamentos.push({
      data: isoData(linha.slice(142, 150)),
      descricao: linha.slice(176, 200).trim(),
      valor: valorComSinal(linha),
      saldoApos: null,
      codigoOrigem: linha.slice(200, 240).trim() || null,
    })
  }

  return {
    conta,
    periodoInicio,
    periodoFim,
    saldoInicial: valorComSinal(headerLote),
    saldoFinal: valorComSinal(trailerLote),
    lancamentos,
  }
}

export function parseExtrato(nomeArquivo: string, text: string): { formato: 'csv' | 'ofx' | 'txt'; extrato: ExtratoParseado } {
  const ext = nomeArquivo.split('.').pop()?.toLowerCase()
  if (ext === 'csv') return { formato: 'csv', extrato: parseExtratoCsv(text) }
  if (ext === 'ofx') return { formato: 'ofx', extrato: parseExtratoOfx(text) }
  if (ext === 'txt') return { formato: 'txt', extrato: parseExtratoTxt(text) }
  throw new Error('Formato de arquivo não suportado. Envie .csv, .ofx ou .txt')
}
