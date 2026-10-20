import type { Metadata } from 'next'
import { IBM_Plex_Sans } from 'next/font/google'
import './globals.css'

const fonte = IBM_Plex_Sans({ subsets: ['latin'], weight: ['400', '500', '600'], variable: '--font-sans' })

export const metadata: Metadata = {
  title: 'UBX Controle Geral — CMB Capital',
  description: 'Sistema de controle de pagamentos e recebimentos',
  icons: {
    icon: '/assets/logo2.png',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className={`${fonte.variable} font-sans`}>{children}</body>
    </html>
  )
}
