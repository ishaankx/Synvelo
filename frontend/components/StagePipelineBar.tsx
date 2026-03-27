'use client'
import React from 'react'
import { cn } from '@/lib/utils'
import {
  type StageKey, STAGE_COLORS, STAGE_ORDER,
  PROGRESSION_STAGES, isTerminal, getStageIndex,
} from '@/lib/stage-utils'

interface StagePipelineBarProps {
  currentStage: StageKey
  daysInStage?: number
  onStageClick?: (stage: StageKey) => void
  compact?: boolean
}

export default function StagePipelineBar({
  currentStage,
  daysInStage,
  onStageClick,
  compact = false,
}: StagePipelineBarProps) {
  const currentIndex = getStageIndex(currentStage)
  const isTerminalStage = isTerminal(currentStage)

  if (compact) {
    const colors = STAGE_COLORS[currentStage]
    return (
      <span className={cn(
        'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-medium border',
        colors.bg, colors.text, colors.border,
      )}>
        <span className={cn('w-1.5 h-1.5 rounded-full', colors.dot)} />
        {currentStage}
      </span>
    )
  }

  return (
    <div className="w-full">
      <div className="flex items-center gap-0 w-full">
        {PROGRESSION_STAGES.map((stage, idx) => {
          const stageIdx = STAGE_ORDER.indexOf(stage)
          const isPast = !isTerminalStage && currentIndex > stageIdx
          const isCurrent = currentStage === stage
          const colors = STAGE_COLORS[stage]
          const isLast = idx === PROGRESSION_STAGES.length - 1

          return (
            <React.Fragment key={stage}>
              <button
                onClick={() => onStageClick?.(stage)}
                disabled={!onStageClick}
                className={cn(
                  'flex flex-col items-center gap-1 px-3 py-2 rounded-lg transition-all min-w-[80px]',
                  isCurrent && cn('border', colors.border, colors.bg),
                  isPast && 'opacity-60',
                  !isCurrent && !isPast && 'opacity-30',
                  onStageClick ? 'hover:opacity-80 cursor-pointer' : 'cursor-default',
                )}
              >
                <div className={cn(
                  'w-3 h-3 rounded-full border-2',
                  isCurrent && `${colors.dot} border-current`,
                  isPast && 'bg-gray-400 border-gray-400',
                  !isCurrent && !isPast && 'bg-white border-gray-200',
                )} />
                <span className={cn(
                  'text-[11px] font-medium whitespace-nowrap',
                  isCurrent ? colors.text : 'text-gray-400',
                )}>
                  {stage}
                </span>
                {isCurrent && daysInStage !== undefined && (
                  <span className="text-[10px] text-gray-400 font-normal">
                    {daysInStage}d here
                  </span>
                )}
              </button>

              {!isLast && (
                <div className={cn(
                  'flex-1 h-0.5 mx-1',
                  isPast || isCurrent ? 'bg-gray-300' : 'bg-gray-100',
                )} />
              )}
            </React.Fragment>
          )
        })}

        {/* Separator + terminal outcomes */}
        <div className="w-px h-8 bg-gray-200 mx-3 flex-shrink-0" />
        <div className="flex flex-col gap-1">
          {(['Closed Won', 'Closed Lost'] as StageKey[]).map(terminal => {
            const isActive = currentStage === terminal
            const colors = STAGE_COLORS[terminal]
            return (
              <button
                key={terminal}
                onClick={() => onStageClick?.(terminal)}
                disabled={!onStageClick}
                className={cn(
                  'text-[10px] font-medium px-2 py-0.5 rounded border transition-all',
                  isActive
                    ? cn(colors.bg, colors.text, colors.border)
                    : 'text-gray-300 border-gray-100 bg-gray-50',
                  onStageClick ? 'hover:opacity-70 cursor-pointer' : 'cursor-default',
                )}
              >
                {terminal}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
