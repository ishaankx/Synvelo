import { cn } from '@/lib/utils'
import {
  AlertTriangle, CheckCircle, Clock, Users,
  Target, Flame, Wrench, DollarSign, FileText,
} from 'lucide-react'

export interface Signal {
  type:     string
  severity: 'high' | 'medium' | 'low'
  label:    string
  excerpt:  string
  filename: string
  color:    'red' | 'yellow' | 'green'
}

const TYPE_ICON: Record<string, React.ElementType> = {
  competitor_mentioned:  Target,
  budget_concern:        DollarSign,
  timeline_risk:         Clock,
  multi_stakeholder:     Users,
  champion_identified:   CheckCircle,
  urgency_signal:        Flame,
  technical_fit:         Wrench,
  negotiation_opening:   DollarSign,
}

const COLOR = {
  red: {
    card:   'bg-red-950/30 border-red-500/20',
    icon:   'bg-red-500/10 text-red-400',
    badge:  'bg-red-500/10 text-red-400 border-red-500/20',
    sev:    'text-red-500',
  },
  yellow: {
    card:   'bg-amber-950/20 border-amber-500/20',
    icon:   'bg-amber-500/10 text-amber-400',
    badge:  'bg-amber-500/10 text-amber-400 border-amber-500/20',
    sev:    'text-amber-500',
  },
  green: {
    card:   'bg-emerald-950/20 border-emerald-500/20',
    icon:   'bg-emerald-500/10 text-emerald-400',
    badge:  'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    sev:    'text-emerald-500',
  },
}

export default function SignalCards({ signals }: { signals: Signal[] }) {
  if (!signals?.length) return null
  const c = (col: 'red'|'yellow'|'green') => signals.filter(s => s.color === col).length

  return (
    <div className="space-y-3">
      {/* Summary row */}
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-[0.1em]">
          Deal Signals
        </p>
        <div className="flex gap-1.5">
          {(['red','yellow','green'] as const).map(col => c(col) > 0 && (
            <span key={col}
              className={cn('text-[9px] font-semibold px-1.5 py-0.5 rounded-full border', COLOR[col].badge)}>
              {c(col)}
            </span>
          ))}
        </div>
      </div>

      {/* Cards */}
      {signals.map((s, i) => {
        const style = COLOR[s.color] ?? COLOR.yellow
        const Icon  = TYPE_ICON[s.type] ?? AlertTriangle
        return (
          <div key={i} className={cn('rounded-xl border p-3', style.card)}>
            <div className="flex items-start gap-2.5">
              <div className={cn('w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5', style.icon)}>
                <Icon className="w-[11px] h-[11px]" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                  <span className={cn('text-[9px] font-bold px-2 py-0.5 rounded-full border', style.badge)}>
                    {s.label}
                  </span>
                  <span className={cn('text-[9px] font-semibold uppercase tracking-wider', style.sev)}>
                    {s.severity}
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 italic leading-relaxed line-clamp-2">
                  &ldquo;{s.excerpt}&rdquo;
                </p>
                <div className="flex items-center gap-1 mt-1.5">
                  <FileText className="w-2.5 h-2.5 text-slate-700 flex-shrink-0" />
                  <p className="text-[9px] text-slate-600 truncate">{s.filename}</p>
                </div>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
