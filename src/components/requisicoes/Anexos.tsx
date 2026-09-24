'use client'

import { useRef } from 'react'
import { Paperclip, X, ExternalLink } from 'lucide-react'

export interface Anexo { id: string; nome: string }

// O corpo de uma função serverless na Vercel é limitado a ~4,5 MB.
const MAX_BYTES = 4 * 1024 * 1024

export async function enviarAnexos(files: File[]): Promise<Anexo[]> {
  const enviados: Anexo[] = []
  for (const f of files) {
    if (f.size > MAX_BYTES) throw new Error(`"${f.name}" excede 4 MB.`)
    const fd = new FormData()
    fd.append('file', f)
    const r = await fetch('/api/requisicoes/anexo', { method: 'POST', body: fd })
    const d = await r.json()
    if (!r.ok) throw new Error(d.error ?? `Falha ao enviar "${f.name}".`)
    enviados.push(d.anexo)
  }
  return enviados
}

// Só leitura: links para abrir os arquivos. Com onRemove, mostra o X de remover.
export function ListaAnexos({ anexos, onRemove }: { anexos: Anexo[]; onRemove?: (a: Anexo) => void }) {
  if (anexos.length === 0) return <p className="text-sm text-slate-400">Nenhum anexo.</p>
  return (
    <ul className="space-y-1">
      {anexos.map(a => (
        <li key={a.id} className="flex items-center gap-2 text-sm">
          <Paperclip size={13} className="text-slate-400 shrink-0" />
          <a href={`/api/b2/file?fileId=${a.id}`} target="_blank" rel="noopener noreferrer"
            className="text-blue-600 hover:underline truncate inline-flex items-center gap-1">
            {a.nome} <ExternalLink size={11} className="shrink-0" />
          </a>
          {onRemove && (
            <button type="button" onClick={() => onRemove(a)} className="text-slate-400 hover:text-red-500" title="Remover">
              <X size={14} />
            </button>
          )}
        </li>
      ))}
    </ul>
  )
}

// Botão "Anexar arquivo" (múltiplos). Devolve os arquivos escolhidos em onFiles.
export function BotaoAnexar({ onFiles, disabled, label = 'Anexar arquivo' }: {
  onFiles: (files: File[]) => void; disabled?: boolean; label?: string
}) {
  const ref = useRef<HTMLInputElement>(null)
  return (
    <>
      <input ref={ref} type="file" multiple className="hidden"
        onChange={e => { onFiles(Array.from(e.target.files ?? [])); e.target.value = '' }} />
      <button type="button" disabled={disabled} onClick={() => ref.current?.click()}
        className="btn-secondary text-sm gap-1.5 disabled:opacity-50">
        <Paperclip size={14} /> {label}
      </button>
    </>
  )
}
