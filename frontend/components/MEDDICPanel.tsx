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
      <div className="flex-1 h-[3px] bg-slate-800 rounded-full overflow-hidden">
        <div
          className={cn(
            'h-full rounded-full transition-all',
            pct >= 70 ? 'bg-emerald-500' : pct >= 40 ? 'bg-amber-500' : 'bg-red-500'
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-[9px] text-slate-600 w-6 text-right flex-shrink-0">{pct}%</span>
    </div>
  )
}

function MEDDICRow({ def, data }: { def: typeof FIELDS[0]; data?: MEDDICField }) {
  const [open, setOpen] = useState(false)
  const found = !!(data?.value && data.value !== 'null' && data.value !== 'None')
  const pct   = Math.round((data?.confidence || 0) * 100)

  return (
    <div className={cn(
      'rounded-xl border transition-colors overflow-hidden',
      found ? 'bg-[#0c1220] border-white/[0.07]' : 'bg-[#080c16] border-white/[0.04]'
    )}>
      <button
        onClick={() => found && setOpen(v => !v)}
        className={cn('w-full flex items-center gap-3 px-3.5 py-3 text-left', found ? 'cursor-pointer' : 'cursor-default')}
      >
        {/* Letter badge */}
        <div className={cn(
          'w-7 h-7 rounded-[8px] flex items-center justify-center text-[11px] font-black flex-shrink-0',
          found ? 'bg-indigo-500/20 text-indigo-400' : 'bg-slate-800/60 text-slate-700'
        )}>
          {def.letter}
        </div>

        <div className="flex-1 min-w-0 space-y-1">
          <div className="flex items-center justify-between gap-2">
            <span className={cn('text-[12px] font-semibold', found ? 'text-slate-200' : 'text-slate-600')}>
              {def.label}
            </span>
            {found
              ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
              : <span className="text-[9px] text-slate-700 bg-slate-800/50 px-1.5 py-0.5 rounded-full border border-white/[0.04]">
                  not found
                </span>
            }
          </div>
          {found ? (
            <>
              <p className="text-[11px] text-slate-400 truncate">{data!.value}</p>
              <ConfBar pct={pct} />
            </>
          ) : (
            <p className="text-[10px] text-slate-700 italic">{def.hint}</p>
          )}
        </div>

        {found && (
          open
            ? <ChevronDown className="w-3.5 h-3.5 text-slate-600 flex-shrink-0" />
            : <ChevronRight className="w-3.5 h-3.5 text-slate-600 flex-shrink-0" />
        )}
      </button>

      {/* Excerpt */}
      {open && found && data?.excerpt && (
        <div className="px-3.5 pb-3 pl-[52px] flex gap-2.5">
          <div className="w-px bg-indigo-500/20 rounded-full flex-shrink-0" />
          <div className="pl-2">
            <div className="flex items-center gap-1 mb-1">
              <Quote className="w-2.5 h-2.5 text-slate-700" />
              <span className="text-[9px] text-slate-700 uppercase tracking-wider">Source evidence</span>
            </div>
            <p className="text-[11px] text-slate-500 italic leading-relaxed">&ldquo;{data.excerpt}&rdquo;</p>
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
          <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-[0.1em]">
            MEDDIC Qualification
          </p>
          <div className="flex items-center gap-2 mt-1">
            <div className="flex gap-0.5">
              {FIELDS.map((_, i) => {
                const d = (meddic as any)?.[FIELDS[i].key] as MEDDICField | undefined
                const ok = d?.value && d.value !== 'null'
                return <div key={i} className={cn('w-2 h-2 rounded-sm', ok ? 'bg-indigo-500' : 'bg-slate-800')} />
              })}
            </div>
            <span className="text-[10px] text-slate-600">{filled}/6 identified</span>
          </div>
        </div>
        <button
          onClick={onExtract}
          disabled={extracting}
          className="flex items-center gap-1.5 text-[10px] font-medium px-2.5 py-1.5 rounded-lg
                     bg-slate-800/60 border border-white/[0.06] text-slate-500
                     hover:text-slate-300 hover:border-white/[0.1] disabled:opacity-40 transition-all"
        >
          <RefreshCw className={cn('w-2.5 h-2.5', extracting && 'animate-spin')} />
          {extracting ? 'Extracting…' : 'Re-extract'}
        </button>
      </div>

      {/* Rows */}
      <div className="space-y-1.5">
        {FIELDS.map(f => (
          <MEDDICRow key={f.key} def={f} data={(meddic as any)?.[f.key]} />
        ))}
      </div>
    </div>
  )
}
