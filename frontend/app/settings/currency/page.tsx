'use client'
import { Info, RefreshCw, AlertCircle } from 'lucide-react'
import { useCurrency } from '@/lib/currencyContext'
import { CURRENCIES, type CurrencyCode } from '@/lib/currency'
import { cn } from '@/lib/utils'
import SettingsHeader from '@/components/SettingsHeader'
import SettingsSection from '@/components/SettingsSection'

function fmtRelativeTime(date: Date): string {
  const diffMs  = Date.now() - date.getTime()
  const diffMin = Math.floor(diffMs / 60_000)
  if (diffMin < 1)  return 'just now'
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24)  return `${diffHr}h ago`
  return `${Math.floor(diffHr / 24)}d ago`
}

export default function CurrencySettingsPage() {
  const {
    consolidationCurrency,
    setConsolidationCurrency,
    exchangeRates,
    ratesLastUpdated,
    ratesFetching,
    refreshRates,
  } = useCurrency()

  return (
    <>
      <SettingsHeader
        title="Currency"
        description="How aggregate values are displayed across pipeline, analytics, and NEXUS"
      />

      <SettingsSection
        title="Consolidation currency"
        description="Pipeline totals and analytics aggregates are converted to this currency. Individual deal values remain in their original currency."
      >
        <div className="grid grid-cols-2 gap-px bg-gray-100">
          {CURRENCIES.map(c => {
            const selected = consolidationCurrency === c.code
            return (
              <button
                key={c.code}
                onClick={() => setConsolidationCurrency(c.code as CurrencyCode)}
                className={cn(
                  'flex items-center gap-3 px-4 py-3 text-left transition-colors bg-white',
                  selected ? 'bg-indigo-50/40' : 'hover:bg-gray-50'
                )}
              >
                <div className={cn(
                  'w-8 h-8 rounded-md flex items-center justify-center text-[13px] font-bold flex-shrink-0',
                  selected ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600'
                )}>
                  {c.symbol}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-semibold text-gray-900">{c.code}</p>
                  <p className="text-[11px] text-gray-500 truncate">
                    {c.label.replace(` (${c.symbol})`, '').replace(` (${c.code})`, '')}
                  </p>
                </div>
                {selected && (
                  <div className="w-1.5 h-1.5 rounded-full bg-indigo-600 flex-shrink-0" />
                )}
              </button>
            )
          })}
        </div>
      </SettingsSection>

      <SettingsSection
        title="Live exchange rates"
        description="Sourced from the European Central Bank via Frankfurter, refreshed every 24 hours."
      >
        <div className="px-5 py-4 flex items-center justify-between border-b syn-border">
          <div>
            {ratesLastUpdated ? (
              <>
                <p className="text-[12px] text-gray-700">
                  Updated <span className="font-medium">{fmtRelativeTime(ratesLastUpdated)}</span>
                </p>
                <p className="text-[11px] text-gray-400 mt-0.5">
                  {ratesLastUpdated.toLocaleString()}
                </p>
              </>
            ) : (
              <p className="text-[12px] text-gray-500">Loading rates…</p>
            )}
          </div>
          <button
            onClick={refreshRates}
            disabled={ratesFetching}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11.5px] font-medium
                       text-gray-700 border syn-border hover:bg-gray-50 disabled:opacity-50 transition-colors"
          >
            <RefreshCw className={cn('w-3 h-3', ratesFetching && 'animate-spin')} />
            {ratesFetching ? 'Fetching…' : 'Refresh now'}
          </button>
        </div>
        <div className="grid grid-cols-4 gap-px bg-gray-100">
          {CURRENCIES.map(c => (
            <div key={c.code} className="bg-white px-3 py-3 text-center">
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">{c.code}</p>
              <p className="text-[13px] font-bold text-gray-800 mt-1 tabular-nums">
                {c.code === 'USD'
                  ? '1.00'
                  : (exchangeRates[c.code] ?? '—').toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
              </p>
            </div>
          ))}
        </div>
      </SettingsSection>

      {/* Inline notes */}
      <div className="space-y-2">
        <Note tone="neutral" icon={Info}>
          Values displayed with the <span className="font-mono text-amber-700 bg-amber-50 px-1 rounded">≈</span> indicator
          are approximate conversions across multiple currencies.
        </Note>
        <Note tone="amber" icon={AlertCircle}>
          <span className="font-medium">Pulse Sync</span> uses the ERP mock inventory which is priced in USD.
          Pulse proposal costs are always shown in USD regardless of this setting.
        </Note>
      </div>
    </>
  )
}

function Note({ tone, icon: Icon, children }: {
  tone: 'neutral' | 'amber',
  icon: React.ElementType,
  children: React.ReactNode,
}) {
  const tones = {
    neutral: 'bg-gray-50 border-gray-200 text-gray-700',
    amber:   'bg-amber-50/60 border-amber-200 text-amber-800',
  }
  return (
    <div className={cn('flex items-start gap-2.5 px-4 py-3 rounded-lg border text-[12px] leading-relaxed', tones[tone])}>
      <Icon className="w-3.5 h-3.5 flex-shrink-0 mt-0.5 opacity-70" />
      <span>{children}</span>
    </div>
  )
}
