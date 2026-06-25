'use client'

import Modal from './Modal'

interface ConfirmProps {
  open: boolean
  onClose: () => void
  onConfirm: () => void
  title?: string
  message: string
  confirmLabel?: string
  loading?: boolean
}

export default function Confirm({
  open, onClose, onConfirm, title = 'Confirmar', message,
  confirmLabel = 'Confirmar', loading = false,
}: ConfirmProps) {
  return (
    <Modal open={open} onClose={onClose} title={title} size="sm">
      <p className="text-sm text-slate-700 mb-6">{message}</p>
      <div className="flex justify-end gap-3">
        <button onClick={onClose} className="btn-secondary" disabled={loading}>Cancelar</button>
        <button onClick={onConfirm} className="btn-danger" disabled={loading}>
          {loading ? 'Aguarde...' : confirmLabel}
        </button>
      </div>
    </Modal>
  )
}
