import { Suspense } from 'react'
import LoginForm from './_components/LoginForm'

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-50 flex items-center justify-center"><div className="text-slate-400">Carregando...</div></div>}>
      <LoginForm />
    </Suspense>
  )
}
