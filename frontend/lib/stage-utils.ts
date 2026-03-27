export type StageKey =
  | 'Discovery'
  | 'Qualification'
  | 'Demo'
  | 'Proposal'
  | 'Negotiation'
  | 'Closed Won'
  | 'Closed Lost'

export interface StageConfig {
  key: StageKey
  label: string
  order: number
  color: string
  description: string
  exit_criteria: string[]
  typical_duration_days: number
  ai_win_prob_floor: number
  ai_win_prob_ceiling: number
  next_stage: StageKey | null
  is_terminal: boolean
}

export interface StageHistoryEntry {
  id: string
  from_stage: StageKey | null
  to_stage: StageKey
  changed_at: string
  reason: string | null
  triggered_by: 'manual' | 'ai_recommendation' | 'system'
}

export const STAGE_ORDER: StageKey[] = [
  'Discovery', 'Qualification', 'Demo', 'Proposal',
  'Negotiation', 'Closed Won', 'Closed Lost',
]

export const PROGRESSION_STAGES: StageKey[] = [
  'Discovery', 'Qualification', 'Demo', 'Proposal', 'Negotiation',
]

export const STAGE_COLORS: Record<StageKey, { bg: string; text: string; border: string; dot: string }> = {
  'Discovery':     { bg: 'bg-indigo-50',  text: 'text-indigo-700',  border: 'border-indigo-200', dot: 'bg-indigo-500' },
  'Qualification': { bg: 'bg-blue-50',    text: 'text-blue-700',    border: 'border-blue-200',   dot: 'bg-blue-500' },
  'Demo':          { bg: 'bg-cyan-50',    text: 'text-cyan-700',    border: 'border-cyan-200',   dot: 'bg-cyan-500' },
  'Proposal':      { bg: 'bg-amber-50',   text: 'text-amber-700',   border: 'border-amber-200',  dot: 'bg-amber-500' },
  'Negotiation':   { bg: 'bg-pink-50',    text: 'text-pink-700',    border: 'border-pink-200',   dot: 'bg-pink-500' },
  'Closed Won':    { bg: 'bg-green-50',   text: 'text-green-700',   border: 'border-green-200',  dot: 'bg-green-500' },
  'Closed Lost':   { bg: 'bg-red-50',     text: 'text-red-700',     border: 'border-red-200',    dot: 'bg-red-400' },
}

export function getStageIndex(stage: StageKey): number {
  return STAGE_ORDER.indexOf(stage)
}

export function getNextStage(stage: StageKey): StageKey | null {
  const map: Record<StageKey, StageKey | null> = {
    'Discovery':     'Qualification',
    'Qualification': 'Demo',
    'Demo':          'Proposal',
    'Proposal':      'Negotiation',
    'Negotiation':   'Closed Won',
    'Closed Won':    null,
    'Closed Lost':   null,
  }
  return map[stage]
}

export function isTerminal(stage: StageKey): boolean {
  return stage === 'Closed Won' || stage === 'Closed Lost'
}
