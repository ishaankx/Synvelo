'use client'
import { useState } from 'react'
import { cn } from '@/lib/utils'
import { dealsApi } from '@/lib/api'
import {
  type StageKey, type StageConfig, STAGE_COLORS, STAGE_ORDER,
  getNextStage, isTerminal,
} from '@/lib/stage-utils'
import {
  ChevronRight, CheckCircle, AlertCircle, Clock, ArrowRight,
} from 'lucide-react'

interface StageAdvancePanelProps {
  deal: {
    id: string
    stage: StageKey
    days_in_current_stage?: number
  }
  stageConfigs: Record<string, StageConfig>
  onStageChanged: (newStage: StageKey, previousStage: StageKey) => void
  hideStageInfo?: boolean
}

export default function StageAdvancePanel({
  deal,
  stageConfigs,
  onStageChanged,
  hideStageInfo = false,
}: StageAdvancePanelProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showManualOverride, setShowManualOverride] = useState(false)
  const [selectedManualStage, setSelectedManualStage] = useState<StageKey | ''>('')
  const [reason, setReason] = useState('')
  const [showReasonField, setShowReasonField] = useState(false)
  const [pendingStage, setPendingStage] = useState<StageKey | null>(null)

  const currentStage = deal.stage
  const currentConfig = stageConfigs[currentStage]
  const nextStage = getNextStage(currentStage)
  const colors = STAGE_COLORS[currentStage]
  const isTerminalStage = isTerminal(currentStage)

  async function performTransition(toStage: StageKey, transitionReason?: string) {
    setIsLoading(true)
    setError(null)
    try {
      const res = await dealsApi.transitionStage(
        deal.id, toStage, transitionReason || undefined, 'manual',
      )
      onStageChanged(res.data.new_stage, res.data.previous_stage)
      setReason('')
      setSelectedManualStage('')
      setShowManualOverride(false)
      setShowReasonField(false)
      setPendingStage(null)
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message || 'Failed to update stage.')
    } finally {
      setIsLoading(false)
    }
  }

  function handleAdvanceClick() {
    if (!nextStage) return
    setPendingStage(nextStage)
    setShowReasonField(false)
    performTransition(nextStage)
  }

  function handleTerminalClick(stage: 'Closed Won' | 'Closed Lost') {
    setPendingStage(stage)
    setShowReasonField(true)
  }

  function handleManualSelect(e: React.ChangeEvent<HTMLSelectElement>) {
    const val = e.target.value as StageKey
    setSelectedManualStage(val)
    const selectedOrder = STAGE_ORDER.indexOf(val)
    const currentOrder = STAGE_ORDER.indexOf(currentStage)
    if (selectedOrder < currentOrder) {
      setShowReasonField(true)
      setPendingStage(val)
    }
  }

  function handleConfirmWithReason() {
    const target = pendingStage || selectedManualStage
    if (!target) return
    performTransition(target as StageKey, reason || undefined)
  }

  if (isTerminalStage) {
    return (
      <div className={cn(
        'rounded-xl border p-5',
        currentStage === 'Closed Won' ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200',
      )}>
        <div className="flex items-center gap-2 mb-2">
          <CheckCircle className={cn('w-5 h-5', currentStage === 'Closed Won' ? 'text-green-600' : 'text-red-500')} />
          <span className={cn('font-semibold text-sm', currentStage === 'Closed Won' ? 'text-green-800' : 'text-red-700')}>
            {currentStage}
          </span>
        </div>
        <p className="text-xs text-gray-500">{currentConfig?.description}</p>
        {currentStage === 'Closed Lost' && (
          <p className="text-xs text-gray-400 mt-2">
            To re-engage this account, create a new deal. Stage history is preserved.
          </p>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Current stage info — hidden when parent already shows it */}
      {!hideStageInfo && (
        <div className={cn('rounded-xl border p-4', colors.bg, colors.border)}>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <span className={cn('w-2 h-2 rounded-full', colors.dot)} />
              <span className={cn('text-sm font-semibold', colors.text)}>{currentStage}</span>
            </div>
            {deal.days_in_current_stage !== undefined && (
              <div className="flex items-center gap-1 text-xs text-gray-400">
                <Clock className="w-3 h-3" />
                {deal.days_in_current_stage}d in this stage
                {currentConfig?.typical_duration_days > 0 && (
                  <span className={deal.days_in_current_stage > currentConfig.typical_duration_days ? 'text-red-400 ml-1' : 'ml-1'}>
                    (typical: {currentConfig.typical_duration_days}d)
                  </span>
                )}
              </div>
            )}
          </div>
          <p className="text-xs text-gray-600 mb-3">{currentConfig?.description}</p>

          {currentConfig?.exit_criteria?.length > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-widest text-gray-400 font-medium mb-1.5">
                Exit criteria for this stage
              </p>
              <ul className="space-y-1">
                {currentConfig.exit_criteria.map((criterion, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs text-gray-500">
                    <span className="mt-0.5 text-gray-300">&#9675;</span>
                    {criterion}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Advance to next stage */}
      {nextStage && !isTerminal(nextStage) && (
        <button
          onClick={handleAdvanceClick}
          disabled={isLoading}
          className={cn(
            'w-full flex items-center justify-between px-4 py-3 rounded-xl border-2 font-medium text-sm transition-all',
            'border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 hover:border-indigo-300',
            'disabled:opacity-50 disabled:cursor-not-allowed',
          )}
        >
          <span>Advance to {nextStage}</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      )}

      {/* Negotiation -> Closed Won */}
      {nextStage === 'Closed Won' && (
        <button
          onClick={() => handleTerminalClick('Closed Won')}
          disabled={isLoading}
          className="w-full flex items-center justify-between px-4 py-3 rounded-xl border-2 font-medium text-sm transition-all border-green-200 bg-green-50 text-green-700 hover:bg-green-100 disabled:opacity-50"
        >
          <span>Mark as Closed Won</span>
          <CheckCircle className="w-4 h-4" />
        </button>
      )}

      {/* Terminal actions */}
      <div className="flex gap-2">
        <button
          onClick={() => handleTerminalClick('Closed Won')}
          disabled={isLoading || nextStage === 'Closed Won'}
          className={cn(
            'flex-1 px-3 py-2 rounded-lg border text-xs font-medium transition-all',
            'border-green-200 text-green-700 bg-white hover:bg-green-50',
            'disabled:opacity-30 disabled:cursor-not-allowed',
          )}
        >
          Won
        </button>
        <button
          onClick={() => handleTerminalClick('Closed Lost')}
          disabled={isLoading}
          className="flex-1 px-3 py-2 rounded-lg border text-xs font-medium transition-all border-red-200 text-red-600 bg-white hover:bg-red-50 disabled:opacity-50"
        >
          Lost
        </button>
      </div>

      {/* Reason input */}
      {showReasonField && pendingStage && (
        <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 space-y-3">
          <p className="text-xs font-medium text-gray-600">
            {pendingStage === 'Closed Lost'
              ? 'Why was this deal lost? (recommended for pipeline analytics)'
              : pendingStage === 'Closed Won'
                ? 'Any notes for the win? (optional)'
                : 'Why is this deal moving back? (required)'}
          </p>
          <textarea
            value={reason}
            onChange={e => setReason(e.target.value)}
            placeholder={
              pendingStage === 'Closed Lost'
                ? 'e.g. Budget frozen for Q3, re-evaluate Q4...'
                : 'Optional note...'
            }
            className="w-full text-xs border border-gray-200 rounded-lg p-2.5 resize-none h-16 focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-white"
          />
          <div className="flex gap-2">
            <button
              onClick={handleConfirmWithReason}
              disabled={isLoading}
              className="flex-1 px-3 py-2 rounded-lg bg-gray-800 text-white text-xs font-medium hover:bg-gray-700 disabled:opacity-50"
            >
              {isLoading ? 'Updating...' : `Confirm \u2192 ${pendingStage}`}
            </button>
            <button
              onClick={() => { setShowReasonField(false); setPendingStage(null); setReason('') }}
              className="px-3 py-2 rounded-lg border border-gray-200 text-xs text-gray-500 hover:bg-gray-100"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Manual override */}
      <button
        onClick={() => setShowManualOverride(!showManualOverride)}
        className="text-xs text-gray-400 hover:text-gray-600 transition-colors flex items-center gap-1"
      >
        <ChevronRight className={cn('w-3 h-3 transition-transform', showManualOverride && 'rotate-90')} />
        Jump to any stage manually
      </button>

      {showManualOverride && (
        <div className="space-y-2">
          <select
            value={selectedManualStage}
            onChange={handleManualSelect}
            className="w-full text-xs border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300"
          >
            <option value="">Select a stage...</option>
            {STAGE_ORDER.filter(s => s !== currentStage).map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          {selectedManualStage && !showReasonField && (
            <button
              onClick={() => performTransition(selectedManualStage as StageKey, reason || undefined)}
              disabled={isLoading}
              className="w-full px-3 py-2 rounded-lg bg-gray-800 text-white text-xs font-medium hover:bg-gray-700 disabled:opacity-50"
            >
              {isLoading ? 'Moving...' : `Move to ${selectedManualStage}`}
            </button>
          )}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 border border-red-200">
          <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
          <p className="text-xs text-red-600">{error}</p>
        </div>
      )}
    </div>
  )
}
