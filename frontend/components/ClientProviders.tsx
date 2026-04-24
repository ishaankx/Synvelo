'use client'
import { CurrencyProvider } from '@/lib/currencyContext'
import type { ReactNode } from 'react'

export default function ClientProviders({ children }: { children: ReactNode }) {
  return <CurrencyProvider>{children}</CurrencyProvider>
}
