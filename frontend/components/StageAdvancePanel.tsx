'use client'
import { useState, useRef, useEffect } from 'react'
import { cn } from '@/lib/utils'
import { dealsApi } from '@/lib/api'
import {
  type StageKey, type StageConfig, STAGE_COLORS, STAGE_ORDER,
  getNextStage, isTerminal,
} from '@/lib/stage-utils'
import {
  CheckCircle, AlertCircle, Clock, ArrowRight,
  Trophy, XCircle, ArrowDownUp, ChevronDown,
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
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const currentStage = deal.stage
  const currentConfig = stageConfigs[currentStage]
  const nextStage = getNextStage(currentStage)
  const colors = STAGE_COLORS[currentStage]
  const isTerminalStage = isTerminal(currentStage)

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false)
      }
    }
    if (dropdownOpen) document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [dropdownOpen])

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
      setDropdownOpen(false)
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message || 'Failed to update stage.')
    } finally {
      setIsLoading(false)
    }
  }

  function handleAdvanceClick() {
    if (!nextStage) return
    setPendingStage(nextStage)
    setShowReasonField(true)
  }

  function handleTerminalClick(stage: 'Closed Won' | 'Closed Lost') {
    setPendingStage(stage)
    setShowReasonField(true)
  }

  function handleStageSelect(stage: StageKey) {
    setSelectedManualStage(stage)
    setDropdownOpen(false)
    // All dropdown selections require a reason — either backward or forward skip
    setShowReasonField(true)
    setPendingStage(stage)
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

  const availableStages = STAGE_ORDER.filter(
    s => s !== currentStage && s !== nextStage && s !== 'Closed Won' && s !== 'Closed Lost',
  )

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
        </div>
      )}

      {/* ── Two-column layout: Advance + Terminal (left) | Manual Override (right) ── */}
      <div className="flex gap-3">
        {/* LEFT — Advance + Won/Lost */}
        <div className="flex-1 flex flex-col gap-2.5">
          {/* Advance button — solid indigo */}
          {nextStage && !isTerminal(nextStage) && (
            <button
              onClick={handleAdvanceClick}
              disabled={isLoading}
              className={cn(
                'w-full flex items-center justify-center gap-2 px-4 py-3.5 rounded-xl font-semibold text-[13px] text-white transition-all',
                'bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800',
                'shadow-sm hover:shadow-md',
                'disabled:opacity-50 disabled:cursor-not-allowed',
              )}
            >
              <span>Advance to {nextStage}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          )}

          {/* Negotiation -> Closed Won (primary advance) */}
          {nextStage === 'Closed Won' && (
            <button
              onClick={() => handleTerminalClick('Closed Won')}
              disabled={isLoading}
              className={cn(
                'w-full flex items-center justify-center gap-2 px-4 py-3.5 rounded-xl font-semibold text-[13px] text-white transition-all',
                'bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800',
                'shadow-sm hover:shadow-md',
                'disabled:opacity-50 disabled:cursor-not-allowed',
              )}
            >
              <span>Mark as Closed Won</span>
              <Trophy className="w-4 h-4" />
            </button>
          )}

          {/* Won / Lost row */}
          <div className="flex gap-2">
            <button
              onClick={() => handleTerminalClick('Closed Won')}
              disabled={isLoading || nextStage === 'Closed Won'}
              className={cn(
                'flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl border text-[12px] font-semibold transition-all',
                'border-green-200 text-green-700 bg-white hover:bg-green-50',
                'disabled:opacity-30 disabled:cursor-not-allowed',
              )}
            >
              <Trophy className="w-3.5 h-3.5" />
              Won
            </button>
            <button
              onClick={() => handleTerminalClick('Closed Lost')}
              disabled={isLoading}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl border text-[12px] font-semibold transition-all border-red-200 text-red-600 bg-white hover:bg-red-50 disabled:opacity-50"
            >
              <XCircle className="w-3.5 h-3.5" />
              Lost
            </button>
          </div>
        </div>

        {/* RIGHT — Manual Override (zero layout shift) */}
        <div ref={dropdownRef} className="flex-1 relative">
          <button
            onClick={() => setDropdownOpen(!dropdownOpen)}
            className={cn(
              'w-full h-full flex items-center gap-3 rounded-xl border bg-white px-4 text-left transition-all',
              dropdownOpen ? 'border-indigo-300 shadow-md' : 'border-gray-200 hover:border-gray-300 hover:shadow-sm',
            )}
          >
            <div className={cn(
              'w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 transition-colors',
              dropdownOpen ? 'bg-indigo-100' : 'bg-indigo-50',
            )}>
              <ArrowDownUp className="w-4 h-4 text-indigo-500" />
            </div>
            <div className="flex-1 min-w-0">
              {selectedManualStage ? (
                <>
                  <div className="flex items-center gap-2">
                    <span className={cn('w-2 h-2 rounded-full', STAGE_COLORS[selectedManualStage as StageKey]?.dot)} />
                    <span className="text-[13px] font-semibold text-gray-700">{selectedManualStage}</span>
                  </div>
                  <span
                    role="link"
                    onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); setSelectedManualStage(''); setDropdownOpen(false) }}
                    className="text-[11px] text-gray-400 hover:text-red-500 transition-colors cursor-pointer"
                  >
                    Cancel selection
                  </span>
                </>
              ) : (
                <>
                  <p className="text-[12px] font-semibold text-gray-700">Change Stage</p>
                  <p className="text-[11px] text-gray-400">Jump to any stage manually</p>
                </>
              )}
            </div>
            {selectedManualStage && (() => {
              const selIdx = STAGE_ORDER.indexOf(selectedManualStage as StageKey)
              const curIdx = STAGE_ORDER.indexOf(currentStage)
              const isBack = selIdx < curIdx
              return (
                <span className={cn(
                  'text-[9px] uppercase tracking-wider font-semibold px-2 py-1 rounded-md flex-shrink-0',
                  isBack ? 'text-amber-600 bg-amber-50' : 'text-indigo-600 bg-indigo-50',
                )}>
                  {isBack ? 'back' : 'forward'}
                </span>
              )
            })()}
            <ChevronDown className={cn(
              'w-4 h-4 text-gray-400 transition-transform flex-shrink-0',
              dropdownOpen && 'rotate-180 text-indigo-500',
            )} />
          </button>

          {/* Dropdown — absolute overlay, zero layout impact */}
          {dropdownOpen && (
            <div className="absolute z-50 mt-1.5 left-0 right-0 bg-white rounded-xl border border-gray-200 shadow-xl py-1.5 overflow-hidden">
              {availableStages.map((stage) => {
                const sc = STAGE_COLORS[stage]
                const stageIdx = STAGE_ORDER.indexOf(stage)
                const currentIdx = STAGE_ORDER.indexOf(currentStage)
                const isBack = stageIdx < currentIdx
                const isForward = stageIdx > currentIdx

                return (
                  <button
                    key={stage}
                    onClick={() => handleStageSelect(stage)}
                    className={cn(
                      'w-full flex items-center gap-2.5 px-4 py-2.5 text-left text-[12px] transition-colors',
                      'hover:bg-gray-50',
                      selectedManualStage === stage && 'bg-indigo-50',
                    )}
                  >
                    <span className={cn('w-2.5 h-2.5 rounded-full flex-shrink-0', sc.dot)} />
                    <span className="font-medium text-gray-700 flex-1">{stage}</span>
                    {isBack && (
                      <span className="text-[9px] uppercase tracking-wider text-amber-500 font-semibold bg-amber-50 px-1.5 py-0.5 rounded">back</span>
                    )}
                    {isForward && (
                      <span className="text-[9px] uppercase tracking-wider text-indigo-500 font-semibold bg-indigo-50 px-1.5 py-0.5 rounded">forward</span>
                    )}
                  </button>
                )
              })}

              {/* Cancel */}
              <div className="px-3 pt-1 pb-1.5 border-t border-gray-100 mt-0.5">
                <button
                  onClick={() => { setDropdownOpen(false); setSelectedManualStage('') }}
                  className="w-full py-1.5 text-[12px] text-gray-400 hover:text-gray-600 font-medium transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Reason input — full width below */}
      {showReasonField && pendingStage && (
        <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 space-y-3">
          <p className="text-xs font-medium text-gray-600">
            {pendingStage === 'Closed Lost'
              ? 'Why was this deal lost? (recommended for pipeline analytics)'
              : pendingStage === 'Closed Won'
                ? 'Any notes for the win? (optional)'
                : pendingStage === nextStage
                  ? 'Add a note for this transition (optional)'
                  : STAGE_ORDER.indexOf(pendingStage) > STAGE_ORDER.indexOf(currentStage)
                    ? 'Why is this deal skipping stages? (required for pipeline analytics)'
                    : 'Why is this deal moving back? (required)'}
          </p>
          <textarea
            value={reason}
            onChange={e => setReason(e.target.value)}
            placeholder={
              pendingStage === 'Closed Lost'
                ? 'e.g. Budget frozen for Q3, re-evaluate Q4...'
                : pendingStage === 'Closed Won'
                  ? 'e.g. Contract signed, onboarding scheduled...'
                  : pendingStage === nextStage
                    ? 'e.g. Demo went well, stakeholders aligned...'
                    : 'e.g. Champion fast-tracked decision, skipped formal RFP...'
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
