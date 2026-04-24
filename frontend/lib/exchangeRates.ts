/**
 * Static fallback exchange rates relative to USD.
 * Used only when the live fetch fails or before the first fetch completes.
 */
export const RATES_FROM_USD: Record<string, number> = {
  USD: 1.0,
  EUR: 0.92,
  GBP: 0.79,
  INR: 83.50,
  JPY: 149.00,
  CHF: 0.90,
  CAD: 1.36,
  AUD: 1.53,
}

const CACHE_KEY = 'synvelo_exchange_rates_v1'
const CACHE_TTL = 24 * 60 * 60 * 1000   // 24 hours in ms
const API_URL   = 'https://api.frankfurter.app/latest?base=USD'

interface RatesCache {
  rates:     Record<string, number>
  fetchedAt: number   // Unix ms timestamp
}

/**
 * Load cached rates from localStorage. Returns null if absent or stale (> 24h).
 */
function loadCached(): RatesCache | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const cached: RatesCache = JSON.parse(raw)
    if (Date.now() - cached.fetchedAt > CACHE_TTL) return null
    return cached
  } catch {
    return null
  }
}

/**
 * Fetch live rates from Frankfurter (ECB data, free, no key, CORS-enabled).
 * Falls back to static RATES_FROM_USD on any error.
 * Caches result in localStorage for 24 hours.
 *
 * @returns rates map (currency code → units per 1 USD)
 */
export async function fetchLiveRates(): Promise<Record<string, number>> {
  // Return cached rates if still fresh
  const cached = loadCached()
  if (cached) return cached.rates

  try {
    const res = await fetch(API_URL)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()

    // Frankfurter omits USD (it's the base), so we add it back
    const rates: Record<string, number> = { USD: 1.0, ...data.rates }

    localStorage.setItem(CACHE_KEY, JSON.stringify({
      rates,
      fetchedAt: Date.now(),
    } satisfies RatesCache))

    return rates
  } catch {
    // Network error, API down, etc. — return static fallback
    return RATES_FROM_USD
  }
}

/**
 * Convert an amount from one currency to another.
 *
 * @param rates  Live rates map from fetchLiveRates() / CurrencyContext.
 *               Defaults to static RATES_FROM_USD when omitted.
 */
export function convertCurrency(
  amount: number,
  from:   string,
  to:     string,
  rates:  Record<string, number> = RATES_FROM_USD,
): number {
  if (!amount || from === to) return amount
  const fromRate = rates[from] ?? 1.0
  const toRate   = rates[to]   ?? 1.0
  // source → USD → target
  return (amount / fromRate) * toRate
}

/**
 * Returns the Unix-ms timestamp stored in the live-rates cache,
 * or null if no cache exists yet.
 */
export function getCachedRatesTimestamp(): number | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const { fetchedAt }: RatesCache = JSON.parse(raw)
    return fetchedAt
  } catch {
    return null
  }
}

/**
 * Returns true if a list of currency codes contains more than one distinct currency.
 */
export function isMultiCurrency(currencies: string[]): boolean {
  return new Set(currencies).size > 1
}
