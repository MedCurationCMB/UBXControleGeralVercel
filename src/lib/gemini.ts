import { GoogleGenerativeAI, Part } from '@google/generative-ai'
import { supabaseServer } from './supabase/server'

async function getGeminiKey(): Promise<string> {
  // Busca a chave vigente do banco (igual ao config.py original)
  const { data } = await supabaseServer
    .from('assistente_virtual')
    .select('chave')
    .eq('vigente', true)
    .single()

  if (data?.chave) return data.chave

  // Fallback para variável de ambiente
  const envKey = process.env.GEMINI_API_KEY
  if (envKey) return envKey

  throw new Error('Nenhuma chave Gemini encontrada no banco ou nas variáveis de ambiente')
}

function getClient(apiKey: string) {
  return new GoogleGenerativeAI(apiKey).getGenerativeModel({
    model: 'gemini-2.0-flash',
  })
}

// Chat livre com o assistente
export async function chatWithAssistant(
  userMessage: string,
  history: Array<{ role: 'user' | 'model'; parts: string }> = []
): Promise<string> {
  const apiKey = await getGeminiKey()
  const model = getClient(apiKey)

  const chat = model.startChat({
    history: history.map((h) => ({
      role: h.role,
      parts: [{ text: h.parts }],
    })),
  })

  const result = await chat.sendMessage(userMessage)
  return result.response.text()
}

// Extração de dados de boleto a partir de imagem/PDF (substitui python-doctr + PyTorch)
export interface DadosBoleto {
  codigo_barras: string | null
  nome_beneficiario: string | null
  data_vencimento: string | null  // formato YYYY-MM-DD
  valor_nominal: number | null
  valor_desconto: number | null
  valor_mora: number | null
  beneficiario_tipo: string | null
  beneficiario_documento: string | null
  beneficiario_nome: string | null
  nosso_numero: string | null
}

export async function extrairDadosBoleto(
  imageBase64: string,
  mimeType: 'image/jpeg' | 'image/png' | 'application/pdf' = 'image/jpeg'
): Promise<DadosBoleto> {
  const apiKey = await getGeminiKey()
  const model = getClient(apiKey)

  const prompt = `Analise esta imagem de boleto bancário e extraia EXATAMENTE os seguintes dados em formato JSON.
Se um campo não estiver presente, retorne null para ele.
Retorne APENAS o JSON, sem texto adicional, sem markdown, sem blocos de código.

{
  "codigo_barras": "linha digitável ou código de barras completo",
  "nome_beneficiario": "nome do beneficiário",
  "data_vencimento": "data no formato YYYY-MM-DD",
  "valor_nominal": número com duas casas decimais,
  "valor_desconto": número ou null,
  "valor_mora": número ou null,
  "beneficiario_tipo": "CNPJ ou CPF ou null",
  "beneficiario_documento": "número do documento do beneficiário",
  "beneficiario_nome": "razão social ou nome do beneficiário",
  "nosso_numero": "nosso número do boleto"
}`

  const imagePart: Part = {
    inlineData: {
      data: imageBase64,
      mimeType,
    },
  }

  const result = await model.generateContent([prompt, imagePart])
  const text = result.response.text().trim()

  try {
    return JSON.parse(text) as DadosBoleto
  } catch {
    // Tenta extrair JSON se o modelo adicionou texto ao redor
    const match = text.match(/\{[\s\S]*\}/)
    if (match) return JSON.parse(match[0]) as DadosBoleto
    throw new Error(`Gemini retornou formato inválido: ${text.slice(0, 200)}`)
  }
}

// Análise geral de documento (NF, contrato, etc.)
export async function analisarDocumento(
  imageBase64: string,
  mimeType: 'image/jpeg' | 'image/png' | 'application/pdf' = 'image/jpeg',
  instrucao?: string
): Promise<string> {
  const apiKey = await getGeminiKey()
  const model = getClient(apiKey)

  const defaultInstrucao = `Analise este documento e faça um resumo dos principais dados encontrados:
- Tipo de documento
- Partes envolvidas (emitente, destinatário, beneficiário, etc.)
- Valores relevantes
- Datas importantes
- Observações relevantes`

  const imagePart: Part = {
    inlineData: { data: imageBase64, mimeType },
  }

  const result = await model.generateContent([instrucao ?? defaultInstrucao, imagePart])
  return result.response.text()
}
