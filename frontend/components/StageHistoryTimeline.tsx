'use client'
import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import { dealsApi } from '@/lib/api'
import { type StageKey, type StageHistoryEntry, STAGE_COLORS } from '@/lib/stage-utils'
import { ArrowRight, Clock } from 'lucide-react'

interface StageHistoryTimelineProps {
  dealId: string
  refreshTrigger?: number
}

function formatRelativeTime(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime()
  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)
  if (days > 0) return `${days}d ago`
  if (hours > 0) return `${hours}h ago`
  if (minutes > 0) return `${minutes}m ago`
  return 'just now'
}

export default function StageHistoryTimeline({
  dealId,
  refreshTrigger = 0,
}: StageHistoryTimelineProps) {
  const [history, setHistory] = useState<StageHistoryEntry[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    async function fetchHistory() {
      setIsLoading(true)
      try {
        const res = await dealsApi.stageHistory(dealId)
        setHistory(res.data.history || [])
      } catch {
        // silently fail
      } finally {
        setIsLoading(false)
      }
    }
    fetchHistory()
  }, [dealId, refreshTrigger])

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

  return (
    <div className="space-y-0">
      <div className="relative">
        {/* Vertical line */}
        <div className="absolute left-2 top-3 bottom-3 w-px bg-gray-100" />

        {history.map(entry => {
          const toColors = STAGE_COLORS[entry.to_stage as StageKey] || STAGE_COLORS['Discovery']
          return (
            <div key={entry.id} className="relative flex gap-3 pb-4">
              <div className={cn(
                'w-4 h-4 rounded-full border-2 border-white mt-1 flex-shrink-0 z-10',
                toColors.dot,
              )} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  {entry.from_stage && (
                    <>
                      <span className="text-xs text-gray-400">{entry.from_stage}</span>
                      <ArrowRight className="w-3 h-3 text-gray-300 flex-shrink-0" />
                    </>
                  )}
                  <span className={cn('text-xs font-semibold', toColors.text)}>
                    {entry.to_stage}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <Clock className="w-3 h-3 text-gray-300" />
                  <span className="text-[10px] text-gray-400">
                    {formatRelativeTime(entry.changed_at)}
                    {entry.triggered_by === 'ai_recommendation' && ' \u00b7 AI suggested'}
                    {entry.triggered_by === 'system' && ' \u00b7 Auto'}
                  </span>
                </div>
                {entry.reason && (
                  <p className="text-[11px] text-gray-500 mt-1 italic">
                    &ldquo;{entry.reason}&rdquo;
                  </p>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
