'use client'

import { useState } from 'react'
import Script from 'next/script'
import { Landmark, Loader2, CheckCircle } from 'lucide-react'

declare global {
  interface Window {
    PluggyConnect: new (options: {
      connectToken: string
      includeSandbox?: boolean
      onSuccess: (itemData: { item: { id: string } }) => void
      onError: (error: unknown) => void
    }) => { init: () => void }
  }
}

interface ContaResumo {
  id: string
  nome: string
  tipo: string
  saldo: number
  moeda: string
  ultimosLancamentos: unknown[]
}

export default function PluggyTestePage() {
  const [connecting, setConnecting] = useState(false)
  const [loadingSummary, setLoadingSummary] = useState(false)
  const [summary, setSummary] = useState<{ itemId: string; accounts: ContaResumo[] } | null>(null)
  const [error, setError] = useState<unknown>(null)

  const handleConectar = async () => {
    if (!window.PluggyConnect) {
      setError({ error: 'Widget da Pluggy ainda não carregou, tenta de novo em alguns segundos.' })
      return
    }

    setConnecting(true)
    setError(null)
    setSummary(null)

    try {
      const res = await fetch('/api/pluggy-teste/token', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) {
        setConnecting(false)
        setError(data)
        return
      }

      const pluggyConnect = new window.PluggyConnect({
        connectToken: data.accessToken,
        includeSandbox: true,
        onSuccess: async (itemData) => {
          setConnecting(false)
          const itemId = itemData.item.id
          setLoadingSummary(true)
          try {
            const summaryRes = await fetch(`/api/pluggy-teste/summary?itemId=${itemId}`)
            const summaryData = await summaryRes.json()
            if (!summaryRes.ok) setError(summaryData)
            else setSummary(summaryData)
          } catch (err) {
            setError({ error: (err as Error).message })
          } finally {
            setLoadingSummary(false)
          }
        },
        onError: (err) => {
          setConnecting(false)
          setError({ error: 'Erro na conexão com o banco', detalhe: err })
        },
      })
      pluggyConnect.init()
    } catch (err) {
      setConnecting(false)
      setError({ error: (err as Error).message })
    }
  }

  return (
    <div className="space-y-5 max-w-3xl">
      <Script src="https://cdn.pluggy.ai/pluggy-connect/v2.8.2/pluggy-connect.js" strategy="afterInteractive" />

      <div>
        <h1 className="page-title">Teste Pluggy (Open Finance)</h1>
        <p className="page-subtitle">Conecta uma conta bancária via Pluggy e mostra saldo e últimos lançamentos.</p>
      </div>

      <div className="card p-5 space-y-4">
        <ol className="list-decimal list-inside space-y-2 text-sm text-slate-700">
          <li>
            Se ainda não tem, crie uma conta gratuita em{' '}
            <a href="https://meu.pluggy.ai" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
              meu.pluggy.ai
            </a>{' '}
            e conecte sua conta bancária lá (ou use o conector de teste &quot;Pluggy Bank&quot;, sem precisar de banco de verdade).
          </li>
          <li>Clique em &quot;Conectar conta&quot; abaixo.</li>
          <li>No widget que abrir, escolha a conexão que você já fez (ou &quot;Pluggy Bank&quot; pra testar com dado fictício).</li>
          <li>Assim que autorizar, saldo e últimos lançamentos aparecem aqui embaixo.</li>
        </ol>

        <button onClick={handleConectar} disabled={connecting || loadingSummary} className="btn-primary w-full justify-center">
          {connecting || loadingSummary ? (
            <>
              <Loader2 size={16} className="animate-spin" />
              {connecting ? 'Conectando...' : 'Buscando dados...'}
            </>
          ) : (
            <>
              <Landmark size={16} />
              Conectar conta
            </>
          )}
        </button>
      </div>

      {error !== null && error !== undefined ? (
        <div className="card p-5 border-red-200 bg-red-50">
          <h2 className="font-semibold text-red-800 mb-2">Erro</h2>
          <pre className="bg-red-100 p-3 rounded text-xs overflow-x-auto text-red-900">
            {JSON.stringify(error, null, 2)}
          </pre>
        </div>
      ) : null}

      {summary ? (
        <div className="card p-5 space-y-4">
          <h2 className="font-semibold text-green-700 flex items-center gap-2">
            <CheckCircle size={18} />
            Contas conectadas
          </h2>

          <div className="space-y-3">
            {summary.accounts.map((account) => (
              <div key={account.id} className="border border-slate-200 rounded-lg p-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-medium">{account.nome} ({account.tipo})</span>
                  <span className="text-lg font-bold">
                    {account.saldo?.toLocaleString('pt-BR', { style: 'currency', currency: account.moeda || 'BRL' })}
                  </span>
                </div>
                <div className="text-sm text-slate-500">{account.ultimosLancamentos.length} lançamento(s) recente(s)</div>
              </div>
            ))}
          </div>

          <details>
            <summary className="cursor-pointer text-sm text-slate-500 hover:text-slate-700">
              Ver JSON completo (contas + lançamentos)
            </summary>
            <pre className="mt-2 bg-slate-50 p-3 rounded text-xs overflow-x-auto max-h-96">
              {JSON.stringify(summary, null, 2)}
            </pre>
          </details>
        </div>
      ) : null}
    </div>
  )
}
