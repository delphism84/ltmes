import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import 'bootstrap/dist/css/bootstrap.min.css'
import './globals.css'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap'
})

export const metadata: Metadata = {
  title: 'LT MES - 중량 관리 시스템',
  description: '㈜LT 원료 중량 모니터링 및 배합비 관리 시스템'
}

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang='ko' className={inter.variable}>
      <body className={`${inter.className} min-h-screen bg-gray-50 text-slate-900 antialiased`}>{children}</body>
    </html>
  )
}
