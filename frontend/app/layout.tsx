import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import Sidebar from '@/components/Sidebar'
import AuthGuard from '@/components/AuthGuard'
import ClientProviders from '@/components/ClientProviders'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Synvelo — Revenue Execution Intelligence',
  description: 'AI-powered deal intelligence and execution platform',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${inter.variable} font-sans syn-bg text-gray-900 min-h-screen antialiased`}>
        <ClientProviders>
          <AuthGuard>
            <div className="flex h-screen overflow-hidden">
              <Sidebar />
              <main className="flex-1 overflow-auto syn-bg syn-scroll">
                {children}
              </main>
            </div>
          </AuthGuard>
        </ClientProviders>
      </body>
    </html>
  )
}
