'use client'

import { useCallback, useEffect, useState } from 'react'
import Modal from '@/components/ui/Modal'
import { supabaseBrowser as supabase } from '@/lib/supabase/client'
import { TAB_PEDIDO, type ModuloPedido } from '@/lib/ajuste'

interface Coment { id: number; comentario: string; usuario: string; data_comentario: string }
const fmtDataHora = (d: string) => new Date(d).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })

// Comentários do pedido: lista (mais recentes primeiro) e campo para comentar.
// Só texto; anexos e tipo de documento ficam na tela de detalhes do pedido.
export default function ComentariosPedido({ mod, pedidoId, usuario }: { mod: ModuloPedido; pedidoId: number; usuario: string }) {
  const tabela = TAB_PEDIDO[mod].comentarios
  const [lista, setLista] = useState<Coment[]>([])
  const [loading, setLoading] = useState(true)
  const [texto, setTexto] = useState('')
  const [saving, setSaving] = useState(false)
  const [erro, setErro] = useState('')

  const load = useCallback(async () => {
    const { data } = await supabase.from(tabela).select('id, comentario, usuario, data_comentario').eq('pedido_id', pedidoId).order('data_comentario', { ascending: false })
    setLista((data ?? []) as Coment[])
    setLoading(false)
  }, [tabela, pedidoId])

  useEffect(() => { load() }, [load])

  const comentar = async () => {
    if (!texto.trim()) return
    setSaving(true); setErro('')
    const { error } = await supabase.from(tabela).insert({
      pedido_id: pedidoId, comentario: texto.trim(), usuario, data_comentario: new Date().toISOString(),
    })
    setSaving(false)
    if (error) { setErro(error.message); return }
    setTexto('')
    load()
  }

  return (
    <div className="space-y-3">
      <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
        {loading && <p className="text-sm text-slate-400">Carregando...</p>}
        {!loading && lista.length === 0 && <p className="text-sm text-slate-400">Nenhum comentário ainda.</p>}
        {lista.map(c => (
          <div key={c.id} className="text-sm border-l-2 border-slate-200 pl-3">
            <p className="text-slate-800 whitespace-pre-wrap">{c.comentario}</p>
            <p className="text-xs text-slate-500">{c.usuario} · {fmtDataHora(c.data_comentario)}</p>
          </div>
        ))}
      </div>
      <textarea className="input w-full min-h-[70px] resize-none" placeholder="Escreva um comentário..." value={texto} onChange={e => setTexto(e.target.value)} />
      {erro && <p className="text-xs text-red-600">{erro}</p>}
      <div className="flex justify-end">
        <button onClick={comentar} disabled={saving || !texto.trim()} className="btn-primary text-sm">{saving ? 'Salvando...' : 'Comentar'}</button>
      </div>
    </div>
  )
}

export function ComentariosModal({ mod, pedidoId, usuario, onClose }: { mod: ModuloPedido; pedidoId: number; usuario: string; onClose: () => void }) {
  return (
    <Modal open onClose={onClose} title={`Comentários — Pedido #${pedidoId}`} size="sm">
      <ComentariosPedido mod={mod} pedidoId={pedidoId} usuario={usuario} />
    </Modal>
  )
}
