'use client'
import { Settings, Globe, Info, RefreshCw } from 'lucide-react'
import { useCurrency } from '@/lib/currencyContext'
import { CURRENCIES, type CurrencyCode } from '@/lib/currency'
import { cn } from '@/lib/utils'

function fmtRelativeTime(date: Date): string {
  const diffMs  = Date.now() - date.getTime()
  const diffMin = Math.floor(diffMs / 60_000)
  if (diffMin < 1)  return 'just now'
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24)  return `${diffHr}h ago`
  return `${Math.floor(diffHr / 24)}d ago`
}

export default function SettingsPage() {
  const {
    consolidationCurrency,
    setConsolidationCurrency,
    exchangeRates,
    ratesLastUpdated,
    ratesFetching,
    refreshRates,
  } = useCurrency()

  return (
    <div className="flex flex-col h-full syn-bg">

      {/* Header */}
      <div className="h-16 border-b syn-border px-6 flex items-center gap-3 flex-shrink-0">
        <div className="w-8 h-8 rounded-lg bg-gray-100 border syn-border flex items-center justify-center">
          <Settings className="w-4 h-4 text-gray-500" />
        </div>
        <div>
          <h1 className="text-[18px] font-semibold syn-text-primary">Settings</h1>
          <p className="text-[12px] text-gray-500">Workspace preferences</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto syn-scroll p-6">
        <div className="max-w-xl space-y-6">

          {/* Currency Consolidation */}
          <div className="syn-card p-6">
            <div className="flex items-start gap-3 mb-5">
              <div className="w-9 h-9 rounded-lg bg-brand-50 border border-brand-200 flex items-center justify-center flex-shrink-0">
                <Globe className="w-4 h-4 text-brand-700" />
              </div>
              <div>
                <p className="text-[14px] font-semibold text-gray-900">Consolidation Currency</p>
                <p className="text-[12px] text-gray-500 mt-0.5 leading-relaxed">
                  Pipeline totals, Analytics, and NEXUS aggregates are displayed in this currency.
                  Individual deal values are always shown in their original currency.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {CURRENCIES.map(c => {
                const selected = consolidationCurrency === c.code
                return (
                  <button
                    key={c.code}
                    onClick={() => setConsolidationCurrency(c.code as CurrencyCode)}
                    className={cn(
                      'flex items-center gap-3 px-4 py-3 rounded-xl border text-left transition-all',
                      selected
                        ? 'bg-brand-50 border-brand-400 ring-1 ring-brand-300'
                        : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                    )}
                  >
                    <div className={cn(
                      'w-8 h-8 rounded-lg flex items-center justify-center text-[13px] font-bold flex-shrink-0',
                      selected ? 'bg-brand-600 text-white' : 'bg-gray-100 text-gray-600'
                    )}>
                      {c.symbol}
                    </div>
                    <div>
                      <p className={cn(
                        'text-[13px] font-semibold',
                        selected ? 'text-brand-700' : 'text-gray-800'
                      )}>{c.code}</p>
                      <p className="text-[11px] text-gray-500">{c.label.replace(` (${c.symbol})`, '').replace(` (${c.code})`, '')}</p>
                    </div>
                    {selected && (
                      <div className="ml-auto w-2 h-2 rounded-full bg-brand-500 flex-shrink-0" />
                    )}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Live Exchange Rates */}
          <div className="syn-card p-6">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                <Info className="w-4 h-4 text-gray-400" />
                <p className="text-[13px] font-semibold text-gray-700">Live Exchange Rates</p>
              </div>
              <button
                onClick={refreshRates}
                disabled={ratesFetching}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium
                           text-indigo-600 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200
                           disabled:opacity-50 transition-all"
              >
                <RefreshCw className={cn('w-3 h-3', ratesFetching && 'animate-spin')} />
                {ratesFetching ? 'Fetching…' : 'Refresh'}
              </button>
            </div>

            <p className="text-[12px] text-gray-500 mb-1 leading-relaxed">
              Rates relative to 1 USD, sourced from the{' '}
              <span className="font-medium text-gray-700">European Central Bank</span> via Frankfurter.
              Refreshed every 24 hours. Values marked{' '}
              <span className="font-mono text-amber-600 bg-amber-50 px-1 rounded">≈</span>{' '}
              in the app indicate approximate conversions.
            </p>

            {ratesLastUpdated && (
              <p className="text-[11px] text-gray-400 mb-4">
                Last updated: {ratesLastUpdated.toLocaleString()} ({fmtRelativeTime(ratesLastUpdated)})
              </p>
            )}

            <div className="grid grid-cols-4 gap-2">
              {CURRENCIES.map(c => (
                <div key={c.code} className="syn-surface-2 border syn-border rounded-lg px-3 py-2 text-center">
                  <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">{c.code}</p>
                  <p className="text-[13px] font-bold text-gray-800 mt-0.5 tabular-nums">
                    {c.code === 'USD' ? '1.00' : (exchangeRates[c.code] ?? '—').toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Pulse Sync note */}
          <div className="flex items-start gap-3 px-4 py-3 rounded-xl bg-amber-50 border border-amber-200">
            <Info className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
            <p className="text-[12px] text-amber-700 leading-relaxed">
              <span className="font-semibold">Pulse Sync</span> uses the ERP mock inventory which is priced in USD.
              Pulse proposal costs are always shown in USD regardless of this setting.
            </p>
          </div>

        </div>
      </div>
    </div>
  )
}
