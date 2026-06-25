import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Formatação de moeda brasileira
export function formatCurrency(value: number | null | undefined): string {
  if (value == null) return 'R$ —'
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value)
}

// Formatação de data
export function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—'
  try {
    return format(parseISO(dateStr), 'dd/MM/yyyy', { locale: ptBR })
  } catch {
    return dateStr
  }
}

export function formatDateTime(dateStr: string | null | undefined): string {
  if (!dateStr) return '—'
  try {
    return format(parseISO(dateStr), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })
  } catch {
    return dateStr
  }
}

// Nomes dos meses em português (igual ao config.py original)
export const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril',
  'Maio', 'Junho', 'Julho', 'Agosto',
  'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]

export function getMesNome(mes: number): string {
  return MESES[mes - 1] ?? String(mes)
}

// Validação de CNPJ/CPF
export function validarCnpjCpf(value: string): boolean {
  const digits = value.replace(/\D/g, '')
  return digits.length === 11 || digits.length === 14
}

// Validação de CEP
export function validarCep(value: string): boolean {
  return /^\d{8}$/.test(value.replace(/\D/g, ''))
}

// Conversão de arquivo para base64 (para enviar ao Gemini)
export async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      // Remove o prefixo "data:...;base64,"
      resolve(result.split(',')[1])
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

// Buffer para base64 (server-side)
export function bufferToBase64(buffer: Buffer): string {
  return buffer.toString('base64')
}

// Gera nome de arquivo seguro para o B2
export function gerarNomeArquivo(prefix: string, nomeOriginal: string): string {
  const timestamp = Date.now()
  const ext = nomeOriginal.split('.').pop() ?? 'bin'
  const safe = nomeOriginal
    .replace(/\.[^/.]+$/, '')
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .slice(0, 40)
  return `${prefix}_${safe}_${timestamp}.${ext}`
}

// Status badge color
export function getStatusColor(status: string): string {
  const map: Record<string, string> = {
    'Autorizado': 'bg-green-100 text-green-800',
    'Aguardando Autorização': 'bg-yellow-100 text-yellow-800',
    'Não Autorizado': 'bg-red-100 text-red-800',
    'Pago': 'bg-green-100 text-green-800',
    'Pendente': 'bg-yellow-100 text-yellow-800',
    'Vencido': 'bg-red-100 text-red-800',
    'Cancelado': 'bg-gray-100 text-gray-800',
  }
  return map[status] ?? 'bg-gray-100 text-gray-600'
}
