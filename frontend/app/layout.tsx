import type { Metadata } from 'next'
import { Inter, Geist } from 'next/font/google'
import './globals.css'
import Sidebar from '@/components/Sidebar'
import { cn } from '@/lib/utils'

const geist = Geist({ subsets: ['latin'], variable: '--font-sans' })
const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Synvelo — Revenue Execution Intelligence',
  description: 'AI-powered deal intelligence and execution platform',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={cn('dark', 'font-sans', geist.variable)}>
      <body className={`${inter.className} bg-[#070b12] text-gray-100 min-h-screen`}>
        <div className="flex h-screen overflow-hidden">
          <Sidebar />
          <main className="flex-1 overflow-auto bg-[#070b12]">
            {children}
          </main>
        </div>
      </body>
    </html>
  )
}
