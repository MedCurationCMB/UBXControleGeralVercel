'use client'

import { useState } from 'react'
import { X } from 'lucide-react'
import { solicitarAjuste, type ModuloPedido } from '@/lib/ajuste'

export default function AjusteModal({ mod, pedidoId, usuario, onClose, onDone }: {
  mod: ModuloPedido; pedidoId: number; usuario: string; onClose: () => void; onDone: () => void
}) {
  const [comentario, setComentario] = useState('')
  const [processing, setProcessing] = useState(false)
  const [error, setError] = useState('')

  const confirmar = async () => {
    if (!comentario.trim()) { setError('O comentário é obrigatório.'); return }
    setProcessing(true)
    const err = await solicitarAjuste(mod, pedidoId, comentario, usuario)
    setProcessing(false)
    if (err) { setError(err); return }
    onDone()
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900">Solicitar Ajuste — Pedido #{pedidoId}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
        </div>
        <p className="text-sm text-slate-500">
          Descreva o que precisa ser ajustado. O solicitante verá este comentário, poderá editar e reenviar o pedido.
        </p>
        <textarea
          className="input w-full min-h-[100px] resize-none"
          placeholder="Comentário obrigatório..."
          value={comentario}
          onChange={e => { setComentario(e.target.value); setError('') }}
        />
        {error && <p className="text-xs text-red-600">{error}</p>}
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="btn-secondary text-sm">Cancelar</button>
          <button
            onClick={confirmar}
            disabled={processing}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-orange-500 text-white rounded-lg text-sm font-medium hover:bg-orange-600 disabled:opacity-50"
          >
            {processing ? 'Enviando...' : 'Solicitar Ajuste'}
          </button>
        </div>
      </div>
    </div>
  )
}
