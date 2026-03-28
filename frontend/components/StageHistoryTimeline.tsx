'use client'
import { useEffect, useState, useCallback } from 'react'
import { cn } from '@/lib/utils'
import { dealsApi } from '@/lib/api'
import {
  type StageKey, type StageHistoryEntry,
  STAGE_COLORS, STAGE_ORDER,
} from '@/lib/stage-utils'
import { ArrowUp, ArrowDown, SkipForward, Trophy, XCircle } from 'lucide-react'

interface StageHistoryTimelineProps {
  dealId: string
  refreshTrigger?: number
}

function parseTimestamp(isoString: string): number {
  // If the backend returns a naive ISO string (no Z/offset), treat it as UTC
  const str = isoString.endsWith('Z') || /[+-]\d{2}:\d{2}$/.test(isoString)
    ? isoString
    : isoString + 'Z'
  return new Date(str).getTime()
}

function formatRelativeTime(isoString: string, now: number): string {
  const diff = now - parseTimestamp(isoString)
  if (diff < 0) return '0 Min ago'
  const seconds = Math.floor(diff / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)
  const weeks = Math.floor(days / 7)
  const months = Math.floor(days / 30)
  const years = Math.floor(days / 365)

  if (years > 0) return `${years} Year${years > 1 ? 's' : ''} ago`
  if (months > 0) return `${months} Month${months > 1 ? 's' : ''} ago`
  if (weeks > 0) return `${weeks} Week${weeks > 1 ? 's' : ''} ago`
  if (days > 0) return `${days} Day${days > 1 ? 's' : ''} ago`
  if (hours > 0) return `${hours} Hr${hours > 1 ? 's' : ''} ago`
  if (minutes > 0) return `${minutes} Min${minutes > 1 ? 's' : ''} ago`
  return '0 Min ago'
}

/** Returns the right refresh interval based on the oldest entry's age */
function getTickInterval(history: StageHistoryEntry[]): number {
  if (history.length === 0) return 60_000
  const now = Date.now()
  const oldest = Math.min(...history.map(e => parseTimestamp(e.changed_at)))
  const ageDays = (now - oldest) / 86_400_000
  if (ageDays >= 365) return 86_400_000   // yearly range  → tick daily
  if (ageDays >= 30)  return 86_400_000   // monthly range → tick daily
  if (ageDays >= 7)   return 3_600_000    // weekly range  → tick hourly
  if (ageDays >= 1)   return 3_600_000    // daily range   → tick hourly
  return 60_000                            // minutes/hours → tick every minute
}

type TransitionType = 'advanced' | 'skipped' | 'moved_back' | 'closed_won' | 'closed_lost'

function getTransitionType(entry: StageHistoryEntry): TransitionType {
  if (entry.to_stage === 'Closed Won') return 'closed_won'
  if (entry.to_stage === 'Closed Lost') return 'closed_lost'

  const fromIdx = entry.from_stage ? STAGE_ORDER.indexOf(entry.from_stage as StageKey) : -1
  const toIdx = STAGE_ORDER.indexOf(entry.to_stage as StageKey)

  if (fromIdx === -1) return 'advanced'
  if (toIdx < fromIdx) return 'moved_back'
  if (toIdx - fromIdx > 1) return 'skipped'
  return 'advanced'
}

function getTransitionLabel(type: TransitionType, toStage: string): string {
  switch (type) {
    case 'advanced': return `Advanced to ${toStage}`
    case 'skipped': return `Moved to ${toStage}`
    case 'moved_back': return `Moved back to ${toStage}`
    case 'closed_won': return 'Closed Won'
    case 'closed_lost': return 'Closed Lost'
  }
}

function getTransitionStyle(type: TransitionType) {
  switch (type) {
    case 'advanced':
      return { dot: 'bg-emerald-500', text: 'text-emerald-700', icon: ArrowUp, iconColor: 'text-emerald-500' }
    case 'skipped':
      return { dot: 'bg-emerald-500', text: 'text-emerald-700', icon: SkipForward, iconColor: 'text-emerald-500' }
    case 'moved_back':
      return { dot: 'bg-red-400', text: 'text-red-600', icon: ArrowDown, iconColor: 'text-red-400' }
    case 'closed_won':
      return { dot: 'bg-emerald-500', text: 'text-emerald-700', icon: Trophy, iconColor: 'text-emerald-500' }
    case 'closed_lost':
      return { dot: 'bg-red-400', text: 'text-red-600', icon: XCircle, iconColor: 'text-red-400' }
  }
}

export default function StageHistoryTimeline({
  dealId,
  refreshTrigger = 0,
}: StageHistoryTimelineProps) {
  const [history, setHistory] = useState<StageHistoryEntry[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [now, setNow] = useState(Date.now())

  useEffect(() => {
    async function fetchHistory() {
      setIsLoading(true)
      try {
        const res = await dealsApi.stageHistory(dealId)
        setHistory(res.data.history || [])
        setNow(Date.now())
      } catch {
        // silently fail
      } finally {
        setIsLoading(false)
      }
    }
    fetchHistory()
  }, [dealId, refreshTrigger])

  // Smart tick — refreshes the "X ago" labels at the right cadence
  useEffect(() => {
    const interval = getTickInterval(history)
    const timer = setInterval(() => setNow(Date.now()), interval)
    return () => clearInterval(timer)
  }, [history])

  if (isLoading) {
    return <div className="animate-pulse h-24 bg-gray-100 rounded-xl" />
  }

  if (history.length === 0) {
    return (
      <p className="text-xs text-gray-400 text-center py-4">
        No stage transitions recorded yet.
      </p>
    )
  }

  // Sort newest first
  const sorted = [...history].sort(
    (a, b) => new Date(b.changed_at).getTime() - new Date(a.changed_at).getTime(),
  )

  return (
    <div className="relative">
      {/* Vertical timeline line */}
      <div className="absolute left-[11px] top-3 bottom-3 w-px bg-gray-200" />

      <div className="space-y-0">
        {sorted.map((entry, idx) => {
          const type = getTransitionType(entry)
          const style = getTransitionStyle(type)
          const label = getTransitionLabel(type, entry.to_stage)
          const Icon = style.icon
          const isLast = idx === sorted.length - 1

          return (
            <div key={entry.id} className={cn('relative flex items-start gap-3.5', !isLast && 'pb-5')}>
              {/* Dot */}
              <div className={cn(
                'w-[22px] h-[22px] rounded-full flex items-center justify-center flex-shrink-0 z-10 border-[3px] border-white',
                style.dot,
              )}>
                <Icon className="w-2.5 h-2.5 text-white" strokeWidth={2.5} />
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0 pt-0.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className={cn('text-[13px] font-semibold leading-tight', style.text)}>
                      {label}
                    </p>
                    {entry.reason && (
                      <p className="text-[11.5px] text-gray-500 mt-1 leading-relaxed">
                        {entry.reason}
                      </p>
                    )}
                    {entry.triggered_by === 'ai_recommendation' && (
                      <span className="inline-block mt-1 text-[9px] uppercase tracking-wider font-semibold text-indigo-500 bg-indigo-50 px-1.5 py-0.5 rounded">
                        AI Suggested
                      </span>
                    )}
                    {entry.triggered_by === 'system' && (
                      <span className="inline-block mt-1 text-[9px] uppercase tracking-wider font-semibold text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">
                        Auto
                      </span>
                    )}
                  </div>

                  {/* Time badge — right side */}
                  <span className="text-[10px] uppercase tracking-wider font-semibold text-gray-400 bg-gray-100 px-2.5 py-1 rounded-lg flex-shrink-0 whitespace-nowrap">
                    {formatRelativeTime(entry.changed_at, now)}
                  </span>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
