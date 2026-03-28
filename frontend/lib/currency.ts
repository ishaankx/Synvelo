/**
 * Currency formatting utilities for Synvelo.
 *
 * Supported currencies: USD, EUR, GBP, INR, JPY, CHF, CAD, AUD
 */

export type CurrencyCode = 'USD' | 'EUR' | 'GBP' | 'INR' | 'JPY' | 'CHF' | 'CAD' | 'AUD'

export interface CurrencyInfo {
  code: CurrencyCode
  symbol: string
  label: string
  locale: string
}

export const CURRENCIES: CurrencyInfo[] = [
  { code: 'USD', symbol: '$',   label: 'US Dollar ($)',       locale: 'en-US' },
  { code: 'EUR', symbol: '€',   label: 'Euro (€)',            locale: 'de-DE' },
  { code: 'GBP', symbol: '£',   label: 'British Pound (£)',   locale: 'en-GB' },
  { code: 'INR', symbol: '₹',   label: 'Indian Rupee (₹)',    locale: 'en-IN' },
  { code: 'JPY', symbol: '¥',   label: 'Japanese Yen (¥)',    locale: 'ja-JP' },
  { code: 'CHF', symbol: 'CHF', label: 'Swiss Franc (CHF)',   locale: 'de-CH' },
  { code: 'CAD', symbol: 'C$',  label: 'Canadian Dollar (C$)', locale: 'en-CA' },
  { code: 'AUD', symbol: 'A$',  label: 'Australian Dollar (A$)', locale: 'en-AU' },
]

const CURRENCY_MAP = Object.fromEntries(CURRENCIES.map(c => [c.code, c])) as Record<CurrencyCode, CurrencyInfo>

function getCurrency(code: string): CurrencyInfo {
  return CURRENCY_MAP[code as CurrencyCode] || CURRENCY_MAP.USD
}

/**
 * Abbreviated format: $15.3M, ₹1.2Cr, €500K, $1,234
 */
export function fmtMoney(n: number, currencyCode = 'USD'): string {
  const { symbol } = getCurrency(currencyCode)

  // Indian numbering: Cr (crore) and L (lakh)
  if (currencyCode === 'INR') {
    if (n >= 1_00_00_000) return `${symbol}${(n / 1_00_00_000).toFixed(1)}Cr`
    if (n >= 1_00_000)    return `${symbol}${(n / 1_00_000).toFixed(1)}L`
    if (n >= 1_000)       return `${symbol}${(n / 1_000).toFixed(0)}K`
    return `${symbol}${n.toLocaleString('en-IN')}`
  }

  // JPY: no decimals
  if (currencyCode === 'JPY') {
    if (n >= 100_000_000) return `${symbol}${(n / 100_000_000).toFixed(1)}億`
    if (n >= 10_000)      return `${symbol}${(n / 10_000).toFixed(0)}万`
    return `${symbol}${n.toLocaleString('ja-JP')}`
  }

  // Western currencies
  if (n >= 1_000_000) return `${symbol}${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000)     return `${symbol}${(n / 1_000).toFixed(0)}K`
  return `${symbol}${n.toLocaleString()}`
}

/**
 * Full format with locale-aware thousand separators: $5,800,000 or ₹58,00,000
 */
export function fmtFullMoney(n: number, currencyCode = 'USD'): string {
  const info = getCurrency(currencyCode)
  if (currencyCode === 'INR') {
    return `${info.symbol}${n.toLocaleString('en-IN')}`
  }
  return `${info.symbol}${n.toLocaleString()}`
}

/**
 * Get just the currency symbol for a code.
 */
export function currencySymbol(code = 'USD'): string {
  return getCurrency(code).symbol
}
