'use client'

import { useEffect, useId, useRef } from 'react'
import { X } from 'lucide-react'

interface ModalProps {
  open: boolean
  onClose: () => void
  title: string
  children: React.ReactNode
  size?: 'sm' | 'md' | 'lg'
}

export default function Modal({ open, onClose, title, children, size = 'md' }: ModalProps) {
  const tituloId = useId()
  const caixa = useRef<HTMLDivElement>(null)

  // onClose costuma vir como arrow inline: guarda em ref para o efeito rodar só ao abrir/fechar
  const aoFechar = useRef(onClose)
  aoFechar.current = onClose

  useEffect(() => {
    if (!open) return
    const anterior = document.activeElement as HTMLElement | null
    if (!caixa.current?.contains(anterior)) caixa.current?.focus({ preventScroll: true })
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') aoFechar.current() }
    window.addEventListener('keydown', handler)
    return () => {
      window.removeEventListener('keydown', handler)
      anterior?.focus({ preventScroll: true })
    }
  }, [open])

  if (!open) return null

  const maxW = { sm: 'max-w-sm', md: 'max-w-xl', lg: 'max-w-3xl' }[size]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
      onClick={onClose}>
      <div ref={caixa} role="dialog" aria-modal="true" aria-labelledby={tituloId} tabIndex={-1}
        className={`bg-background border rounded-lg w-full ${maxW} max-h-[90vh] overflow-y-auto outline-none`}
        onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b sticky top-0 bg-background">
          <h2 id={tituloId} className="text-base font-semibold text-foreground">{title}</h2>
          <button onClick={onClose} aria-label="Fechar" className="p-1 rounded-md text-muted-foreground hover:bg-accent">
            <X size={18} />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  )
}
