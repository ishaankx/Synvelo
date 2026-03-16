'use client'
import { useState } from 'react'
import { cn } from '@/lib/utils'
import { CheckCircle2, ChevronRight, ChevronDown, Quote, RefreshCw } from 'lucide-react'

export interface MEDDICField {
  value:      string | null
  confidence: number
  excerpt:    string | null
}
export interface MEDDIC {
  metrics?:           MEDDICField
  economic_buyer?:    MEDDICField
  decision_criteria?: MEDDICField
  decision_process?:  MEDDICField
  identify_pain?:     MEDDICField
  champion?:          MEDDICField
}

const FIELDS = [
  { key: 'metrics',           letter: 'M', label: 'Metrics',           hint: 'Quantifiable business value' },
  { key: 'economic_buyer',    letter: 'E', label: 'Economic Buyer',    hint: 'Who controls the budget' },
  { key: 'decision_criteria', letter: 'D', label: 'Decision Criteria', hint: 'How they evaluate vendors' },
  { key: 'decision_process',  letter: 'D', label: 'Decision Process',  hint: 'Internal procurement steps' },
  { key: 'identify_pain',     letter: 'I', label: 'Identify Pain',     hint: 'Core problem being solved' },
  { key: 'champion',          letter: 'C', label: 'Champion',          hint: 'Internal advocate for you' },
]

function ConfBar({ pct }: { pct: number }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1 bg-gray-200 rounded-full overflow-hidden">
        <div
          className={cn(
            'h-full rounded-full transition-all duration-500',
            pct >= 70 ? 'bg-positive' : pct >= 40 ? 'bg-warning' : 'bg-negative'
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-[11px] text-gray-500 w-7 text-right flex-shrink-0 tabular-nums">{pct}%</span>
    </div>
  )
}

function MEDDICRow({ def, data }: { def: typeof FIELDS[0]; data?: MEDDICField }) {
  const [open, setOpen] = useState(false)
  const found = !!(data?.value && data.value !== 'null' && data.value !== 'None')
  const pct   = Math.round((data?.confidence || 0) * 100)

  return (
    <div className={cn(
      'syn-card overflow-hidden transition-colors',
      found ? '' : 'opacity-60'
    )}>
      <button
        onClick={() => found && setOpen(v => !v)}
        className={cn('w-full flex items-center gap-3 px-4 py-3 text-left', found ? 'cursor-pointer' : 'cursor-default')}
      >
        {/* Letter badge */}
        <div className={cn(
          'w-8 h-8 rounded-lg flex items-center justify-center text-[12px] font-black flex-shrink-0',
          found ? 'bg-brand-50 text-brand-700' : 'bg-gray-100 text-gray-400'
        )}>
          {def.letter}
        </div>

        <div className="flex-1 min-w-0 space-y-1">
          <div className="flex items-center justify-between gap-2">
            <span className={cn('text-[13px] font-semibold', found ? 'text-gray-800' : 'text-gray-500')}>
              {def.label}
            </span>
            {found
              ? <CheckCircle2 className="w-4 h-4 text-positive flex-shrink-0" />
              : <span className="text-[11px] text-gray-400 bg-gray-100 px-2 py-0.5 rounded-md">
                  not found
                </span>
            }
          </div>
          {found ? (
            <>
              <p className="text-[12px] text-gray-600 truncate">{data!.value}</p>
              <ConfBar pct={pct} />
            </>
          ) : (
            <p className="text-[11px] text-gray-400 italic">{def.hint}</p>
          )}
        </div>

        {found && (
          open
            ? <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" />
            : <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" />
        )}
      </button>

      {/* Excerpt */}
      {open && found && data?.excerpt && (
        <div className="px-4 pb-3 pl-[56px] flex gap-2.5">
          <div className="w-px border-brand-200 bg-brand-200 rounded-full flex-shrink-0" />
          <div className="pl-2">
            <div className="flex items-center gap-1.5 mb-1">
              <Quote className="w-3 h-3 text-gray-400" />
              <span className="text-[11px] text-gray-400 uppercase tracking-wider">Source evidence</span>
            </div>
            <p className="text-[12px] text-gray-500 italic leading-relaxed">&ldquo;{data.excerpt}&rdquo;</p>
          </div>
        </div>
      )}
    </div>
  )
}

export default function MEDDICPanel({
  meddic,
  onExtract,
  extracting,
}: {
  meddic:     MEDDIC | null | undefined
  onExtract:  () => void
  extracting: boolean
}) {
  const filled = FIELDS.filter(f => {
    const d = (meddic as any)?.[f.key] as MEDDICField | undefined
    return d?.value && d.value !== 'null' && d.value !== 'None'
  }).length

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
            MEDDIC Qualification
          </p>
          <div className="flex items-center gap-2.5 mt-1.5">
            <div className="flex gap-1">
              {FIELDS.map((_, i) => {
                const d = (meddic as any)?.[FIELDS[i].key] as MEDDICField | undefined
                const ok = d?.value && d.value !== 'null'
                return <div key={i} className={cn('w-2.5 h-2.5 rounded-sm', ok ? 'bg-brand-500' : 'bg-gray-200')} />
              })}
            </div>
            <span className="text-[11px] text-gray-500">{filled}/6 identified</span>
          </div>
        </div>
        <button
          onClick={onExtract}
          disabled={extracting}
          className="flex items-center gap-1.5 text-[11px] font-medium px-3 py-1.5 rounded-lg
                     syn-surface-2 border syn-border text-gray-500
                     hover:text-gray-700 hover:border-gray-300 disabled:opacity-40 transition-all"
        >
          <RefreshCw className={cn('w-3.5 h-3.5', extracting && 'animate-spin')} />
          {extracting ? 'Extracting...' : 'Re-extract'}
        </button>
      </div>

      {/* Rows */}
      <div className="space-y-2">
        {FIELDS.map(f => (
          <MEDDICRow key={f.key} def={f} data={(meddic as any)?.[f.key]} />
        ))}
      </div>
    </div>
  )
}
