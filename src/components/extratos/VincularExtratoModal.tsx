'use client'

import { useState, useEffect } from 'react'

interface LinhaExtrato { id: number; data: string; descricao: string; valor: number; sugerido: boolean }

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const dataBr = (iso: string) => iso.slice(8, 10) + '/' + iso.slice(5, 7) + '/' + iso.slice(0, 4)

// Lista as linhas do extrato (saída p/ conta a pagar, entrada p/ conta a receber) compatíveis com uma conta e vincula.
export default function VincularExtratoModal({ tipo, contaId, titulo, dataPagamento, onClose, onDone }: {
  tipo: 'pagar' | 'receber'
  contaId: number
  titulo: string
  dataPagamento: string | null
  onClose: () => void
  onDone: () => void
}) {
  const [linhas, setLinhas] = useState<LinhaExtrato[] | null>(null)
  const [erro, setErro] = useState('')

  useEffect(() => {
    fetch(`/api/extratos-bancarios/vinculos?tipo=${tipo}&conta_id=${contaId}`)
      .then(r => r.json())
      .then(d => setLinhas(d.lancamentos ?? []))
      .catch(() => setLinhas([]))
  }, [tipo, contaId])

  const vincular = async (lancamentoId: number) => {
    setErro('')
    const r = await fetch('/api/extratos-bancarios/vinculos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lancamento_id: lancamentoId, conta_id: contaId }),
    })
    if (r.ok) return onDone()
    setErro((await r.json().catch(() => ({}))).error ?? 'Erro ao vincular')
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full p-6 space-y-3" onClick={e => e.stopPropagation()}>
        <p className="font-semibold text-slate-900">Vincular ao extrato — {titulo}</p>
        {erro && <p className="text-sm text-red-600">{erro}</p>}
        {linhas === null ? (
          <p className="text-sm text-slate-400">Carregando...</p>
        ) : linhas.length === 0 ? (
          <p className="text-sm text-slate-500">
            Nenhuma linha de {tipo === 'pagar' ? 'saída' : 'entrada'} do extrato, sem vínculo, com esse valor{dataPagamento ? ` em ${dataBr(dataPagamento)}` : ''}.
            Se a data de {tipo === 'pagar' ? 'pagamento' : 'recebimento'} da conta estiver diferente do extrato, ajuste-a e tente de novo.
          </p>
        ) : (
          <div className="max-h-[50vh] overflow-auto">
            <table className="w-full text-sm">
              <tbody>
                {linhas.map(l => (
                  <tr key={l.id} className="table-row">
                    <td className="table-cell whitespace-nowrap">{dataBr(l.data)}</td>
                    <td className="table-cell max-w-xs truncate" title={l.descricao}>{l.descricao}</td>
                    <td className="table-cell text-right whitespace-nowrap">{brl(l.valor)}</td>
                    <td className="table-cell text-right whitespace-nowrap">
                      {l.sugerido && <span className="text-xs text-amber-600 mr-2">mesma data</span>}
                      <button onClick={() => vincular(l.id)} className="btn-primary">Vincular</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <button onClick={onClose} className="btn-secondary">Fechar</button>
      </div>
    </div>
  )
}
