import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase/server'
import { uploadFile } from '@/lib/b2'

interface ParsedRecord {
  docEmpresa: string
  dataPagamento: string
  valorNominal: number
  dataEfetivacao: string
  valorEfetivo: number
  ocorrencia: string
  status: 'Pago' | 'Não Pago'
}

function parseRetFile(text: string): ParsedRecord[] {
  const lines = text
    .split(/\r?\n/)
    .map(l => (l.length >= 240 ? l : l.padEnd(240, ' ')))
    .filter(l => l.trim())

  const records: ParsedRecord[] = []
  for (const line of lines) {
    if (line[7] !== '3') continue
    if (line[13] !== 'A') continue

    const nominalStr = line.slice(119, 134).trim()
    const efetivoStr = line.slice(162, 177).trim()
    const dataEfetivacao = line.slice(154, 162).trim()

    records.push({
      docEmpresa: line.slice(73, 93).trim(),
      dataPagamento: line.slice(93, 101).trim(),
      valorNominal: (parseInt(nominalStr) || 0) / 100,
      dataEfetivacao,
      valorEfetivo: (parseInt(efetivoStr) || 0) / 100,
      ocorrencia: line.slice(230, 240).trim(),
      status: dataEfetivacao && dataEfetivacao !== '00000000' ? 'Pago' : 'Não Pago',
    })
  }
  return records
}

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const form = await req.formData()
  const file = form.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'Arquivo obrigatório' }, { status: 400 })

  const buffer = Buffer.from(await file.arrayBuffer())
  let text: string
  try {
    text = buffer.toString('utf-8')
  } catch {
    text = buffer.toString('latin1')
  }

  const records = parseRetFile(text)
  if (records.length === 0) {
    return NextResponse.json({ error: 'Nenhum Segmento A encontrado no arquivo' }, { status: 422 })
  }

  const supabase = createServerClient()

  // Check if file already imported
  const { data: existing } = await supabase
    .from('documentos')
    .select('id')
    .eq('nome_documento', file.name)
    .maybeSingle()

  if (existing) {
    return NextResponse.json(
      { error: `Arquivo '${file.name}' já foi importado anteriormente.` },
      { status: 409 }
    )
  }

  // Update paid records in controle_pagamentos
  let updatedCount = 0
  const pagos = records.filter(r => r.status === 'Pago')

  for (const reg of pagos) {
    const idNum = parseInt(reg.docEmpresa)
    if (isNaN(idNum)) continue

    const de = reg.dataEfetivacao
    const dataFormatada = `${de.slice(4, 8)}-${de.slice(2, 4)}-${de.slice(0, 2)}`

    const { error } = await supabase
      .from('controle_pagamentos')
      .update({
        data_pagamento: dataFormatada,
        valor_pagamento: reg.valorEfetivo,
        status_pagamento: 3,
      })
      .eq('id', idNum)

    if (!error) updatedCount++
  }

  // Upload file to B2 and save to documentos
  let b2FileId: string | null = null
  try {
    const { fileId } = await uploadFile(buffer, file.name, 'text/plain')
    b2FileId = fileId

    const { data: uploadedDoc } = await supabase
      .from('documentos')
      .insert({
        pedido_id: null,
        pagamento_id: null,
        usuario: session.username,
        tipo_documento: -4,
        anexo_id: fileId,
        nome_documento: file.name,
        data_upload: new Date().toISOString(),
      })
      .select('id')
      .single()

    if (updatedCount === 0) {
      b2FileId = null
    }
    void uploadedDoc
  } catch (e) {
    console.warn('B2 upload do retorno falhou:', e)
  }

  return NextResponse.json({ ok: true, records, updated_count: updatedCount, b2_file_id: b2FileId })
}
