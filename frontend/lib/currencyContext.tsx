'use client'
import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react'
import { type CurrencyCode } from '@/lib/currency'
import {
  RATES_FROM_USD,
  fetchLiveRates,
  convertCurrency,
  getCachedRatesTimestamp,
} from '@/lib/exchangeRates'

const STORAGE_KEY = 'synvelo_consolidation_currency'

interface CurrencyContextType {
  /** The user-selected currency all aggregates are displayed in. */
  consolidationCurrency: CurrencyCode
  setConsolidationCurrency: (c: CurrencyCode) => void

  /** Live exchange rates (units per 1 USD). Falls back to static until fetched. */
  exchangeRates: Record<string, number>

  /** When the live rates were last successfully fetched (null = never / still loading). */
  ratesLastUpdated: Date | null

  /** Whether a live-rates fetch is in progress. */
  ratesFetching: boolean

  /**
   * Convert `amount` from `from` to `to` using the current live rates.
   * Drop-in replacement for the standalone convertCurrency utility.
   */
  convert: (amount: number, from: string, to: string) => number

  /** Force an immediate re-fetch of live rates (bypasses cache). */
  refreshRates: () => Promise<void>
}

const CurrencyContext = createContext<CurrencyContextType>({
  consolidationCurrency:    'USD',
  setConsolidationCurrency: () => {},
  exchangeRates:            RATES_FROM_USD,
  ratesLastUpdated:         null,
  ratesFetching:            false,
  convert:                  (a, f, t) => convertCurrency(a, f, t),
  refreshRates:             async () => {},
})

export function CurrencyProvider({ children }: { children: ReactNode }) {
  const [consolidationCurrency, setCurrency] = useState<CurrencyCode>('USD')
  const [exchangeRates, setExchangeRates]     = useState<Record<string, number>>(RATES_FROM_USD)
  const [ratesLastUpdated, setRatesLastUpdated] = useState<Date | null>(null)
  const [ratesFetching, setRatesFetching]     = useState(false)

  // Load persisted consolidation-currency preference
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY) as CurrencyCode | null
    if (stored) setCurrency(stored)
  }, [])

  // Initialise last-updated from cache before the first fetch returns
  useEffect(() => {
    const ts = getCachedRatesTimestamp()
    if (ts) setRatesLastUpdated(new Date(ts))
  }, [])

  const doFetch = useCallback(async () => {
    setRatesFetching(true)
    try {
      const rates = await fetchLiveRates()
      setExchangeRates(rates)
      const ts = getCachedRatesTimestamp()
      setRatesLastUpdated(ts ? new Date(ts) : new Date())
    } finally {
      setRatesFetching(false)
    }
  }, [])

  // Fetch live rates on mount
  useEffect(() => { doFetch() }, [doFetch])

  // Force-refresh: clears the cache entry so fetchLiveRates() goes to the network
  const refreshRates = useCallback(async () => {
    try { localStorage.removeItem('synvelo_exchange_rates_v1') } catch {}
    await doFetch()
  }, [doFetch])

  const setConsolidationCurrency = useCallback((c: CurrencyCode) => {
    setCurrency(c)
    localStorage.setItem(STORAGE_KEY, c)
  }, [])

  const convert = useCallback(
    (amount: number, from: string, to: string) =>
      convertCurrency(amount, from, to, exchangeRates),
    [exchangeRates],
  )

  return (
    <CurrencyContext.Provider value={{
      consolidationCurrency,
      setConsolidationCurrency,
      exchangeRates,
      ratesLastUpdated,
      ratesFetching,
      convert,
      refreshRates,
    }}>
      {children}
    </CurrencyContext.Provider>
  )
}

export function useCurrency() {
  return useContext(CurrencyContext)
}
