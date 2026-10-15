// Leitura do arquivo de retorno CNAB 240 do Inter (manual: segmentos A, J e O; ocorrências na Nota 01).
// Usado pela prévia no navegador e pela importação no servidor, para as duas sempre lerem igual.

export interface RegistroRetorno {
  docEmpresa: string
  dataPagamento: string
  valorNominal: number
  dataEfetivacao: string
  valorEfetivo: number
  ocorrencia: string // campo cru, posições 231-240
  motivo: string // ocorrência em texto
  status: 'Pago' | 'Não Pago'
}

// Manual, Nota 01 (códigos de ocorrência para retorno)
const OCORRENCIAS: Record<string, string> = {
  '00': 'Crédito ou débito efetivado', '02': 'Cancelado pelo pagador/credor', AR: 'Valor do lançamento inválido',
  AG: 'Agência/conta/DV inválido', ZI: 'Beneficiário divergente', AP: 'Data de lançamento inválida',
  HF: 'Saldo insuficiente na conta da empresa', AB: 'Tipo de operação inválido', AC: 'Tipo de serviço inválido',
  HA: 'Lote não aceito', BD: 'Inclusão efetuada com sucesso', PA: 'Pix não efetivado', PJ: 'Chave não cadastrada no DICT',
  PM: 'Chave de pagamento inválida', PN: 'Chave de pagamento não informada', PK: 'QR Code inválido/vencido',
  PB: 'Erro no PSP do recebedor', PD: 'Tipo incorreto para a conta transacional', PE: 'Tipo de transação não suportado na conta',
  PH: 'Ordem rejeitada pelo PSP do recebedor', AL: 'Código do banco favorecido inválido', PG: 'CPF/CNPJ do recebedor incorreto',
  AS: 'Aviso ao favorecido: identificação inválida', ZK: 'Boleto já liquidado', HC: 'Convênio com a empresa inexistente/inválido',
  CD: 'Código de barras: valor do título inválido', ZH: 'Sistema em contingência', PI: 'ISPB do PSP do pagador inválido',
  HE: 'Tipo de serviço inválido para o contrato', YA: 'Título não encontrado', PF: 'CPF/CNPJ do recebedor inconsistente com a chave',
  ZJ: 'Limite diário de pagamentos excedido',
}

// O campo tem 10 posições: até 5 códigos de 2 caracteres.
export const codigosOcorrencia = (campo: string): string[] => campo.trim().match(/.{1,2}/g) ?? []

export const descreverOcorrencia = (campo: string): string =>
  codigosOcorrencia(campo).map(c => OCORRENCIAS[c] ?? `ocorrência ${c}`).join('; ')

function registro(base: Omit<RegistroRetorno, 'motivo' | 'status'>, pago: boolean): RegistroRetorno {
  return { ...base, motivo: descreverOcorrencia(base.ocorrencia), status: pago ? 'Pago' : 'Não Pago' }
}

const dataPreenchida = (d: string) => !!d && d !== '00000000'
const centavos = (s: string) => (parseInt(s.trim()) || 0) / 100

export function parseRet(text: string): RegistroRetorno[] {
  const lines = text.split(/\r?\n/).map(l => (l.length >= 240 ? l : l.padEnd(240, ' '))).filter(l => l.trim())
  const records: RegistroRetorno[] = []
  for (const line of lines) {
    if (line[7] !== '3') continue
    const ocorrencia = line.slice(230, 240).trim()
    const codigos = codigosOcorrencia(ocorrencia)

    // Segmento A (PIX/TED): o banco preenche a data real da efetivação (posições 155-162)
    if (line[13] === 'A') {
      const dataEfetivacao = line.slice(154, 162).trim()
      records.push(registro({
        docEmpresa: line.slice(73, 93).trim(),
        dataPagamento: line.slice(93, 101).trim(),
        valorNominal: centavos(line.slice(119, 134)),
        dataEfetivacao,
        valorEfetivo: centavos(line.slice(162, 177)),
        ocorrencia,
      }, dataPreenchida(dataEfetivacao)))
    }

    // Segmentos J (boleto) e O (tributo) não têm "data real": a data de pagamento volta igual à enviada na remessa,
    // então só a ocorrência diz se pagou ("00"). Sem ocorrência nenhuma, cai na regra antiga (data preenchida).
    // O J-52 (extensão com pagador/beneficiário, "52" nas posições 18-19) não é pagamento.
    const ehJ = line[13] === 'J' && line.slice(17, 19) !== '52'
    const ehO = line[13] === 'O'
    if (ehJ || ehO) {
      const dataPag = ehJ ? line.slice(144, 152).trim() : line.slice(99, 107).trim()
      const pago = codigos.length ? codigos.includes('00') : dataPreenchida(dataPag)
      records.push(registro({
        docEmpresa: (ehJ ? line.slice(182, 202) : line.slice(122, 142)).trim(),
        dataPagamento: line.slice(91, 99).trim(), // vencimento, nos dois layouts (posições 92-99)
        valorNominal: centavos(ehJ ? line.slice(99, 114) : line.slice(107, 122)),
        dataEfetivacao: dataPag,
        valorEfetivo: centavos(ehJ ? line.slice(152, 167) : line.slice(107, 122)),
        ocorrencia,
      }, pago))
    }
  }
  return records
}
