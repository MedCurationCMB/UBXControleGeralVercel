'use client'

import { useState } from 'react'
import Modal from '@/components/ui/Modal'
import { marcarAtendidaSemPedido } from '@/lib/requisicao'
import type { ModuloPedido } from '@/lib/ajuste'

// Confirma "Atendida sem pedido" com observação opcional. autorizar: a requisição ainda está aguardando autorização.
export default function AtendidaModal({ mod, id, usuario, autorizar, onClose, onDone }: {
  mod: ModuloPedido; id: number; usuario: string; autorizar: boolean; onClose: () => void; onDone: () => void
}) {
  const [obs, setObs] = useState('')
  const [busy, setBusy] = useState(false)
  const [erro, setErro] = useState('')

  const confirmar = async () => {
    setBusy(true)
    const e = await marcarAtendidaSemPedido(mod, id, usuario, obs, autorizar)
    setBusy(false)
    if (e) { setErro(e); return }
    onDone()
  }

  return (
    <Modal open onClose={onClose} title={`Atendida sem pedido — Requisição #${id}`} size="sm">
      <p className="text-sm text-slate-600 mb-3">
        Registra que a requisição foi atendida sem necessidade de compra ou contratação. Ela não poderá gerar pedido
        nem {mod === 'pagamentos' ? 'pagamento' : 'recebimento'}.{autorizar && ' A requisição também será autorizada.'}
      </p>
      <textarea className="input w-full min-h-[80px] resize-none" placeholder="Observação (opcional)" value={obs} onChange={e => setObs(e.target.value)} />
      {erro && <p className="text-xs text-red-600 mt-2">{erro}</p>}
      <div className="flex justify-end gap-3 mt-4">
        <button onClick={onClose} className="btn-secondary" disabled={busy}>Cancelar</button>
        <button onClick={confirmar} className="btn-primary" disabled={busy}>{busy ? 'Aguarde...' : 'Marcar como atendida'}</button>
      </div>
    </Modal>
  )
}
