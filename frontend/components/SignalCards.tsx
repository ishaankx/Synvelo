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
    card:   'syn-card border-red-200',
    icon:   'bg-red-50 text-red-600',
    badge:  'bg-red-50 text-red-600 border-red-200',
    sev:    'text-negative',
  },
  yellow: {
    card:   'syn-card border-amber-200',
    icon:   'bg-amber-50 text-amber-600',
    badge:  'bg-amber-50 text-amber-600 border-amber-200',
    sev:    'text-warning',
  },
  green: {
    card:   'syn-card border-emerald-200',
    icon:   'bg-emerald-50 text-emerald-600',
    badge:  'bg-emerald-50 text-emerald-600 border-emerald-200',
    sev:    'text-positive',
  },
}

export default function SignalCards({ signals }: { signals: Signal[] }) {
  if (!signals?.length) return null
  const c = (col: 'red'|'yellow'|'green') => signals.filter(s => s.color === col).length

  return (
    <div className="space-y-3">
      {/* Summary row */}
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
          Deal Signals
        </p>
        <div className="flex gap-1.5">
          {(['red','yellow','green'] as const).map(col => c(col) > 0 && (
            <span key={col}
              className={cn('text-[11px] font-bold px-2 py-0.5 rounded-md border', COLOR[col].badge)}>
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
          <div key={i} className={cn('p-3.5', style.card)}>
            <div className="flex items-start gap-3">
              <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0', style.icon)}>
                <Icon className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                  <span className={cn('text-[11px] font-semibold px-2 py-0.5 rounded-md border', style.badge)}>
                    {s.label}
                  </span>
                  <span className={cn('text-[11px] font-semibold uppercase tracking-wider', style.sev)}>
                    {s.severity}
                  </span>
                </div>
                <p className="text-[12px] text-gray-500 italic leading-relaxed line-clamp-2">
                  &ldquo;{s.excerpt}&rdquo;
                </p>
                <div className="flex items-center gap-1.5 mt-2">
                  <FileText className="w-3 h-3 text-gray-400 flex-shrink-0" />
                  <p className="text-[11px] text-gray-500 truncate">{s.filename}</p>
                </div>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
