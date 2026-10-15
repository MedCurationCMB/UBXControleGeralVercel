'use client'

import { useState } from 'react'
import { X, FileText, RefreshCw } from 'lucide-react'
import { gerarRelatorioPdf, baixarPdf } from '@/lib/relatorioPdf'

interface Enviado {
  id: number; pedido_id: number | null; fornecedor: string; empresa: string; categoria: string
  tipo_pagamento: number | null; data_vencimento: string | null; data_pagamento: string | null
  valor_pagar: number | null; valor_pagamento: number | null; observacao: string | null
  enviado_banco_em: string; remessa_arquivo: string | null
}

// "Hoje" no fuso de Brasília (o navegador pode estar em outro fuso)
const hoje = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })

export default function RelatorioEnviadosModal({ onClose }: { onClose: () => void }) {
  const [dia, setDia] = useState(hoje())
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState('')
  const [erro, setErro] = useState('')

  const gerar = async () => {
    setLoading(true); setMsg(''); setErro('')
    try {
      const res = await fetch(`/api/controle-pagamentos/listar?enviado_em=${dia}&export=true`)
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !Array.isArray(data.rows)) { setErro(data.error ?? 'Erro ao buscar os pagamentos'); return }
      const rows = (data.rows as Enviado[]).sort((a, b) => a.enviado_banco_em.localeCompare(b.enviado_banco_em) || a.id - b.id)
      const dataBr = new Date(dia + 'T12:00:00').toLocaleDateString('pt-BR')
      if (rows.length === 0) { setMsg(`Nenhum pagamento foi enviado ao banco em ${dataBr}.`); return }

      const manuais = rows.filter(r => !r.remessa_arquivo).length
      const bytes = await gerarRelatorioPdf({
        titulo: 'Relatório de Pagamentos Enviados ao Banco',
        cabecalho: [`Dia do envio: ${dataBr}`, `Via remessa: ${rows.length - manuais} · Manual: ${manuais}`],
        rows: rows.map(r => ({
          pagamento_id: r.id, pedido_id: r.pedido_id, fornecedor: r.fornecedor, empresa: r.empresa, categoria: r.categoria,
          tipo_pagamento: r.tipo_pagamento ?? 0,
          // enquanto não há retorno do banco, data/valor do pagamento ainda não existem: usa vencimento/valor a pagar
          data_pagamento: r.data_pagamento ?? r.data_vencimento ?? '',
          valor_pagamento: r.valor_pagamento ?? r.valor_pagar ?? 0,
          observacao: r.observacao ?? '',
          origem: r.remessa_arquivo ? `Remessa ${r.remessa_arquivo}` : 'Manual',
        })),
      })
      baixarPdf(bytes, `enviados_banco_${dia}.pdf`)
      setMsg(`Relatório gerado: ${rows.length} pagamento(s) (${rows.length - manuais} via remessa, ${manuais} manual).`)
    } catch (e) {
      setErro(String(e))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">Relatório de enviados ao banco</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
        </div>
        <p className="text-xs text-slate-500">
          Reúne tudo que passou para &quot;Enviado ao banco&quot; no dia escolhido, por remessa ou manualmente,
          num único PDF. Pagamentos enviados antes de 15/10/2026 não têm data de envio e não entram.
        </p>
        <div>
          <label className="label">Dia do envio</label>
          <input type="date" className="input" value={dia} max={hoje()} onChange={e => { setDia(e.target.value); setMsg(''); setErro('') }} />
        </div>
        {erro && <p className="text-sm text-red-600">{erro}</p>}
        {msg && <p className="text-sm text-slate-700">{msg}</p>}
        <button onClick={gerar} disabled={loading || !dia} className="btn-primary gap-2 text-sm">
          {loading ? <><RefreshCw size={14} className="animate-spin" /> Gerando...</> : <><FileText size={14} /> Gerar PDF</>}
        </button>
      </div>
    </div>
  )
}
