import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import AppShell from '@/components/layout/AppShell'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession()
  if (!session) redirect('/login')

  return (
    <AppShell username={session.username} hierarquia={session.hierarquia} projetoId={session.projetoId} projetoNome={session.projetoNome}>
      {children}
    </AppShell>
  )
}
