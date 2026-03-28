'use client'
import { useEffect, useState, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import {
  Plus, TrendingUp, Loader2, X,
  Trash2, AlertTriangle, ChevronDown, Search,
  ArrowUpRight, FileBarChart2
} from 'lucide-react'
import { dealsApi } from '@/lib/api'
import { cn } from '@/lib/utils'
import { type StageKey, STAGE_COLORS } from '@/lib/stage-utils'
import { fmtMoney, fmtFullMoney, CURRENCIES } from '@/lib/currency'

interface Deal {
  id: string
  name: string
  company: string
  stage: string
  value: number
  currency: string
  owner: string
  win_probability: number | null
  time_to_close_days: number | null
  last_scored_at: string | null
  created_at: string
  days_in_current_stage?: number
}

type SortOption = 'latest' | 'oldest' | 'highest_value' | 'lowest_value' |
  'most_days' | 'fewest_days' | 'highest_prob' | 'lowest_prob'

const STAGES = ['Discovery', 'Qualification', 'Demo', 'Proposal', 'Negotiation', 'Closed Won', 'Closed Lost']

const SORT_LABELS: Record<SortOption, string> = {
  latest: 'Latest deals',
  oldest: 'Oldest deals',
  highest_value: 'Highest value',
  lowest_value: 'Lowest value',
  most_days: 'Most days remaining',
  fewest_days: 'Fewest days remaining',
  highest_prob: 'Highest win probability',
  lowest_prob: 'Lowest win probability',
}

function getDaysRemaining(deal: Deal): number | null {
  if (!deal.time_to_close_days || !deal.created_at) return null
  const created = new Date(deal.created_at).getTime()
  const estClose = created + deal.time_to_close_days * 86400000
  return Math.ceil((estClose - Date.now()) / 86400000)
}

function getEstCloseDate(deal: Deal): Date | null {
  if (!deal.time_to_close_days || !deal.created_at) return null
  const d = new Date(deal.created_at)
  d.setDate(d.getDate() + deal.time_to_close_days)
  return d
}

function fmtShortDate(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

const DELETE_PHRASE = 'Yes I want to delete this deal'

// ── Sub-components ──────────────────────────────────────────────────────────

function OwnerAvatar({ name }: { name: string }) {
  const initials = name
    ? name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
    : '?'
  const palettes = [
    'bg-indigo-100 text-indigo-700',
    'bg-violet-100 text-violet-700',
    'bg-blue-100 text-blue-700',
    'bg-emerald-100 text-emerald-700',
    'bg-amber-100 text-amber-700',
    'bg-pink-100 text-pink-700',
  ]
  const idx = name ? name.charCodeAt(0) % palettes.length : 0
  return (
    <div className={cn(
      'w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-semibold flex-shrink-0',
      palettes[idx]
    )}>
      {initials}
    </div>
  )
}

function DealIcon({ stage }: { stage: string }) {
  const colors = STAGE_COLORS[stage as StageKey]
  return (
    <div className={cn(
      'w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0',
      colors?.bg || 'bg-gray-50'
    )}>
      <FileBarChart2 className={cn('w-5 h-5', colors?.text || 'text-gray-400')} />
    </div>
  )
}

function StageBadge({ stage }: { stage: string }) {
  const colors = STAGE_COLORS[stage as StageKey]
  if (!colors) return <span className="text-[10px] text-gray-500 uppercase">{stage}</span>
  return (
    <span className={cn(
      'inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border',
      colors.bg, colors.text, colors.border
    )}>
      {stage}
    </span>
  )
}

function ProbBar({ prob, className }: { prob: number | null; className?: string }) {
  if (prob === null) return <div className={cn('h-1.5 w-full bg-gray-100 rounded-full', className)} />
  const pct = Math.round(prob * 100)
  return (
    <div className={cn('h-1.5 w-full bg-gray-100 rounded-full overflow-hidden', className)}>
      <div
        className="h-full bg-brand-600 rounded-full transition-all duration-700"
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}

// ── Delete Confirmation Modal ────────────────────────────────────────────────

function DeleteModal({
  deal, onClose, onConfirm, deleting,
}: {
  deal: Deal; onClose: () => void; onConfirm: () => void; deleting: boolean
}) {
  const [typed, setTyped] = useState('')
  const confirmed = typed === DELETE_PHRASE

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  return (
    <div
      className="syn-modal-backdrop fixed inset-0 bg-gray-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="syn-modal-content syn-surface border border-red-200 rounded-xl w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b syn-border">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-600" />
            <h2 className="text-[13px] font-semibold text-gray-900">Delete deal</h2>
          </div>
          <button onClick={onClose} className="syn-text-muted hover:syn-text-secondary transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-5 space-y-4">
          <p className="text-[12px] syn-text-secondary leading-relaxed">
            This action <span className="font-semibold text-gray-900">cannot be undone</span>. This will permanently delete the deal{' '}
            <span className="font-semibold text-gray-900">&ldquo;{deal.name}&rdquo;</span>, along with all its documents, scores, and analysis history.
          </p>
          <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3">
            <p className="text-[12px] syn-text-tertiary">
              <span className="syn-text-secondary font-medium">{deal.company}</span>
              {' \u00b7 '}{deal.stage}
              {' \u00b7 '}<span className="syn-text-secondary">${(deal.value || 0).toLocaleString()}</span>
            </p>
          </div>
          <div>
            <label className="block text-[11px] syn-text-tertiary mb-1.5">
              To confirm, type{' '}
              <span className="font-mono syn-text-secondary bg-gray-100 px-1.5 py-0.5 rounded text-[11px]">
                {DELETE_PHRASE}
              </span>
            </label>
            <input
              autoFocus
              value={typed}
              onChange={e => setTyped(e.target.value)}
              placeholder={DELETE_PHRASE}
              className={cn(
                'w-full syn-surface-2 border rounded-lg px-3 py-2',
                'text-[13px] text-gray-900 placeholder-gray-400',
                'focus:outline-none transition-colors font-mono',
                confirmed
                  ? 'border-red-500/50 focus:border-red-500'
                  : 'syn-border focus:border-brand-500'
              )}
            />
          </div>
        </div>
        <div className="flex gap-2 px-5 pb-5">
          <button
            onClick={onClose}
            disabled={deleting}
            className="flex-1 py-2 text-[13px] font-medium rounded-lg border syn-border
                       syn-text-tertiary hover:syn-text-secondary transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={!confirmed || deleting}
            className={cn(
              'flex-1 py-2 text-[13px] font-semibold rounded-lg transition-colors',
              'flex items-center justify-center gap-1.5',
              confirmed && !deleting
                ? 'bg-red-600 hover:bg-red-500 text-white cursor-pointer'
                : 'bg-red-100 text-red-300 cursor-not-allowed'
            )}
          >
            {deleting
              ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Deleting&hellip;</>
              : <><Trash2 className="w-3.5 h-3.5" /> Delete deal</>
            }
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function DealsPage() {
  const router = useRouter()
  const [deals, setDeals] = useState<Deal[]>([])
  const [loading, setLoading] = useState(true)
  const [showNew, setShowNew] = useState(false)
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState({
    name: '', company: '', stage: 'Discovery',
    value: '', currency: 'USD', owner: '', time_to_close_days: ''
  })
  const [deleteTarget, setDeleteTarget] = useState<Deal | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [expandedCard, setExpandedCard] = useState<'pipeline' | 'weighted' | null>(null)

  // Search, sort, filter
  const [searchQuery, setSearchQuery] = useState('')
  const [sortBy, setSortBy] = useState<SortOption>('latest')
  const [filterBy, setFilterBy] = useState('all')

  // Updated timestamp
  const [lastFetchedAt, setLastFetchedAt] = useState<Date | null>(null)
  const [, tick] = useState(0)

  useEffect(() => {
    const interval = setInterval(() => tick(c => c + 1), 30000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    if (!expandedCard) return
    const handler = () => setExpandedCard(null)
    document.addEventListener('click', handler)
    return () => document.removeEventListener('click', handler)
  }, [expandedCard])

  const load = useCallback(async () => {
    try {
      const res = await dealsApi.list()
      setDeals(res.data || [])
      setLastFetchedAt(new Date())
    } catch (err: any) {
      if (err?.response?.status === 401 || err?.response?.status === 403) {
        setDeals([])
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const handleCreate = async () => {
    if (!form.name.trim() || !form.company.trim()) return
    setCreating(true)
    try {
      const res = await dealsApi.create({
        name: form.name,
        company: form.company,
        stage: form.stage,
        value: parseFloat(form.value) || 0,
        currency: form.currency,
        owner: form.owner,
        time_to_close_days: form.time_to_close_days ? parseInt(form.time_to_close_days) : null,
      } as any)
      setShowNew(false)
      setForm({ name: '', company: '', stage: 'Discovery', value: '', currency: 'USD', owner: '', time_to_close_days: '' })
      router.push(`/deals/${res.data.id}`)
    } catch (e: any) {
      alert(e.response?.data?.detail || 'Failed to create deal')
    } finally {
      setCreating(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await dealsApi.delete(deleteTarget.id)
      setDeals(prev => prev.filter(d => d.id !== deleteTarget.id))
      setDeleteTarget(null)
    } catch (e: any) {
      alert(e.response?.data?.detail || 'Failed to delete deal')
    } finally {
      setDeleting(false)
    }
  }

  // ── Computed values ──────────────────────────────────────────────────

  const totalValue    = deals.reduce((s, d) => s + (d.value || 0), 0)
  const weightedValue = deals.reduce((s, d) => s + (d.value || 0) * (d.win_probability || 0), 0)
  const scoredDeals   = deals.filter(d => d.win_probability !== null)
  const avgProb       = scoredDeals.length
    ? scoredDeals.reduce((s, d) => s + d.win_probability!, 0) / scoredDeals.length
    : null
  const weightedRatio = totalValue > 0 ? Math.round((weightedValue / totalValue) * 100) : 0

  // Dominant currency for aggregated stats
  const mainCurrency = useMemo(() => {
    if (deals.length === 0) return 'USD'
    const counts: Record<string, number> = {}
    deals.forEach(d => { counts[d.currency || 'USD'] = (counts[d.currency || 'USD'] || 0) + 1 })
    return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0]
  }, [deals])

  const activeDeals = deals.filter(d => d.stage !== 'Closed Won' && d.stage !== 'Closed Lost')
  const closedDeals = deals.filter(d => d.stage === 'Closed Won' || d.stage === 'Closed Lost')

  // Growth: % of pipeline value from deals created in last 30 days
  const thirtyDaysAgo = Date.now() - 30 * 86400000
  const recentValue = deals
    .filter(d => new Date(d.created_at).getTime() > thirtyDaysAgo)
    .reduce((s, d) => s + (d.value || 0), 0)
  const growth = totalValue > 0 ? Math.round((recentValue / totalValue) * 100) : 0

  const updatedAgo = lastFetchedAt
    ? (() => {
        const secs = Math.floor((Date.now() - lastFetchedAt.getTime()) / 1000)
        if (secs < 60) return 'Updated just now'
        const mins = Math.floor(secs / 60)
        if (mins < 60) return `Updated ${mins}m ago`
        return `Updated ${Math.floor(mins / 60)}h ago`
      })()
    : ''

  // ── Filtered & sorted deals ──────────────────────────────────────────

  const filteredAndSortedDeals = useMemo(() => {
    let result = [...deals]

    // Filter
    if (filterBy === 'active') {
      result = result.filter(d => d.stage !== 'Closed Won' && d.stage !== 'Closed Lost')
    } else if (filterBy === 'closed_won') {
      result = result.filter(d => d.stage === 'Closed Won')
    } else if (filterBy === 'closed_lost') {
      result = result.filter(d => d.stage === 'Closed Lost')
    } else if (filterBy.startsWith('stage:')) {
      const stage = filterBy.replace('stage:', '')
      result = result.filter(d => d.stage === stage)
    }

    // Search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim()
      result = result.filter(d =>
        d.name.toLowerCase().includes(q) ||
        d.company.toLowerCase().includes(q) ||
        (d.owner || '').toLowerCase().includes(q)
      )
    }

    // Sort
    result.sort((a, b) => {
      switch (sortBy) {
        case 'latest':
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        case 'oldest':
          return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        case 'highest_value':
          return (b.value || 0) - (a.value || 0)
        case 'lowest_value':
          return (a.value || 0) - (b.value || 0)
        case 'most_days': {
          const ar = getDaysRemaining(a), br = getDaysRemaining(b)
          if (ar === null && br === null) return 0
          if (ar === null) return 1
          if (br === null) return -1
          return br - ar
        }
        case 'fewest_days': {
          const ar = getDaysRemaining(a), br = getDaysRemaining(b)
          if (ar === null && br === null) return 0
          if (ar === null) return 1
          if (br === null) return -1
          return ar - br
        }
        case 'highest_prob': {
          if (a.win_probability === null && b.win_probability === null) return 0
          if (a.win_probability === null) return 1
          if (b.win_probability === null) return -1
          return b.win_probability - a.win_probability
        }
        case 'lowest_prob': {
          if (a.win_probability === null && b.win_probability === null) return 0
          if (a.win_probability === null) return 1
          if (b.win_probability === null) return -1
          return a.win_probability - b.win_probability
        }
        default: return 0
      }
    })

    return result
  }, [deals, filterBy, searchQuery, sortBy])

  // Available stages for filter sub-menu
  const availableStages = useMemo(() => {
    const stageSet = new Set(deals.map(d => d.stage))
    return STAGES.filter(s => stageSet.has(s))
  }, [deals])

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="flex-1 flex flex-col min-h-0">

      {/* Header */}
      <div className="px-8 pt-8 pb-2 flex-shrink-0">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-[28px] font-bold syn-text-primary tracking-tight">Pipeline</h1>
            <p className="text-[13px] syn-text-tertiary mt-0.5">
              {deals.length} deal{deals.length !== 1 ? 's' : ''} in pipeline
              {updatedAgo && (
                <> <span className="syn-text-muted">&middot;</span> {updatedAgo}</>
              )}
            </p>
          </div>
          <button
            onClick={() => setShowNew(true)}
            className="flex items-center gap-1.5 text-[13px] font-semibold px-5 py-2.5 rounded-lg
                       bg-brand-600 hover:bg-brand-500 text-white transition-colors shadow-sm"
          >
            <Plus className="w-4 h-4" /> New Deal
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="flex-shrink-0 px-8 py-5">
        <div className="grid grid-cols-4 gap-4">

          {/* Total Pipeline — expandable */}
          <div className="relative" onClick={e => e.stopPropagation()}>
            <button
              onClick={() => setExpandedCard(expandedCard === 'pipeline' ? null : 'pipeline')}
              className={cn(
                'w-full bg-white border syn-border rounded-xl px-5 py-4 shadow-sm',
                'text-left transition-all hover:shadow-md',
                expandedCard === 'pipeline' && 'ring-1 ring-brand-200 border-brand-200'
              )}
            >
              <div className="flex items-center justify-between mb-1">
                <p className="text-[11px] syn-text-muted uppercase tracking-widest font-semibold">
                  Total Pipeline
                </p>
                <ChevronDown className={cn(
                  'w-3.5 h-3.5 syn-text-muted transition-transform duration-200',
                  expandedCard === 'pipeline' && 'rotate-180'
                )} />
              </div>
              <div className="flex items-baseline gap-2.5">
                <p className="text-[26px] font-bold syn-text-primary tracking-tight">
                  {fmtMoney(totalValue, mainCurrency)}
                </p>
                {growth > 0 && (
                  <span className="flex items-center gap-0.5 text-[12px] font-semibold text-emerald-600">
                    <ArrowUpRight className="w-3.5 h-3.5" />
                    {growth}%
                  </span>
                )}
              </div>
              <div className="mt-3 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-brand-600 rounded-full transition-all duration-700"
                  style={{ width: `${weightedRatio}%` }}
                />
              </div>
            </button>
            {expandedCard === 'pipeline' && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-white border syn-border rounded-xl shadow-lg z-20">
                <div className="p-2 max-h-[240px] overflow-y-auto syn-scroll">
                  {deals.map(deal => (
                    <div key={deal.id} className="flex items-center justify-between px-3 py-2 rounded-lg hover:bg-gray-50 transition-colors">
                      <div className="min-w-0 flex-1">
                        <p className="text-[12px] font-medium syn-text-primary truncate">{deal.name}</p>
                        <p className="text-[11px] syn-text-tertiary truncate">{deal.company}</p>
                      </div>
                      <span className="text-[13px] font-semibold syn-text-secondary tabular-nums ml-3">
                        {fmtMoney(deal.value || 0, deal.currency)}
                      </span>
                    </div>
                  ))}
                  <div className="border-t syn-border mt-1 pt-2 px-3 pb-1 flex justify-between items-center">
                    <span className="text-[11px] syn-text-tertiary font-medium uppercase tracking-wider">Total</span>
                    <span className="text-[13px] font-bold syn-text-primary tabular-nums">{fmtMoney(totalValue, mainCurrency)}</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Weighted Value — expandable */}
          <div className="relative" onClick={e => e.stopPropagation()}>
            <button
              onClick={() => setExpandedCard(expandedCard === 'weighted' ? null : 'weighted')}
              className={cn(
                'w-full bg-white border syn-border rounded-xl px-5 py-4 shadow-sm',
                'text-left transition-all hover:shadow-md',
                expandedCard === 'weighted' && 'ring-1 ring-brand-200 border-brand-200'
              )}
            >
              <div className="flex items-center justify-between mb-1">
                <p className="text-[11px] syn-text-muted uppercase tracking-widest font-semibold">
                  Weighted Value
                </p>
                <ChevronDown className={cn(
                  'w-3.5 h-3.5 syn-text-muted transition-transform duration-200',
                  expandedCard === 'weighted' && 'rotate-180'
                )} />
              </div>
              <div className="flex items-baseline gap-2.5">
                <p className="text-[26px] font-bold syn-text-primary tracking-tight">
                  {fmtMoney(weightedValue, mainCurrency)}
                </p>
                <span className="text-[12px] syn-text-muted font-medium">
                  {weightedRatio}% ratio
                </span>
              </div>
              <div className="mt-3 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-brand-600 rounded-full transition-all duration-700"
                  style={{ width: `${weightedRatio}%` }}
                />
              </div>
            </button>
            {expandedCard === 'weighted' && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-white border syn-border rounded-xl shadow-lg z-20">
                <div className="p-2 max-h-[240px] overflow-y-auto syn-scroll">
                  {deals.map(deal => {
                    const contrib = (deal.value || 0) * (deal.win_probability || 0)
                    const pct = deal.win_probability !== null ? Math.round(deal.win_probability * 100) : null
                    return (
                      <div key={deal.id} className="flex items-center justify-between px-3 py-2 rounded-lg hover:bg-gray-50 transition-colors">
                        <div className="min-w-0 flex-1">
                          <p className="text-[12px] font-medium syn-text-primary truncate">{deal.name}</p>
                          <p className="text-[11px] syn-text-tertiary truncate">
                            {fmtMoney(deal.value || 0, deal.currency)} &times; {pct !== null ? `${pct}%` : '\u2014'}
                          </p>
                        </div>
                        <span className="text-[13px] font-semibold syn-text-secondary tabular-nums ml-3">
                          {pct !== null ? fmtMoney(contrib, deal.currency) : '\u2014'}
                        </span>
                      </div>
                    )
                  })}
                  <div className="border-t syn-border mt-1 pt-2 px-3 pb-1 flex justify-between items-center">
                    <span className="text-[11px] syn-text-tertiary font-medium uppercase tracking-wider">Total</span>
                    <span className="text-[13px] font-bold syn-text-primary tabular-nums">{fmtMoney(weightedValue, mainCurrency)}</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Avg Win Prob */}
          <div className="bg-white border syn-border rounded-xl px-5 py-4 shadow-sm">
            <p className="text-[11px] syn-text-muted uppercase tracking-widest font-semibold mb-1">
              Avg Win Prob
            </p>
            <p className="text-[26px] font-bold syn-text-primary tracking-tight">
              {avgProb !== null ? `${Math.round(avgProb * 100)}%` : '\u2014'}
            </p>
            <div className="mt-3 h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-brand-600 rounded-full transition-all duration-700"
                style={{ width: avgProb !== null ? `${Math.round(avgProb * 100)}%` : '0%' }}
              />
            </div>
          </div>

          {/* Active Deals */}
          <div className="bg-white border syn-border rounded-xl px-5 py-4 shadow-sm">
            <p className="text-[11px] syn-text-muted uppercase tracking-widest font-semibold mb-1">
              Active Deals
            </p>
            <div className="flex items-center gap-2.5">
              <p className="text-[26px] font-bold syn-text-primary tracking-tight">
                {activeDeals.length}
              </p>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-blue-50 text-blue-600 border border-blue-200">
                Live
              </span>
            </div>
            {closedDeals.length > 0 && (
              <p className="text-[12px] syn-text-muted mt-2">
                {closedDeals.length} closed
              </p>
            )}
          </div>

        </div>
      </div>

      {/* Search & Filter Bar */}
      {deals.length > 0 && (
        <div className="flex-shrink-0 px-8 pb-4">
          <div className="flex items-center gap-3">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 syn-text-muted" />
              <input
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search deals, companies, owners..."
                className="w-full pl-9 pr-3 py-2 bg-white border syn-border rounded-lg
                           text-[13px] syn-text-primary placeholder-gray-400
                           focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-200
                           transition-all"
              />
            </div>
            <div className="flex items-center gap-2 ml-auto">
              <select
                value={sortBy}
                onChange={e => setSortBy(e.target.value as SortOption)}
                className="bg-white border syn-border rounded-lg px-3 py-2
                           text-[12px] syn-text-secondary font-medium
                           focus:outline-none focus:border-brand-500 transition-colors cursor-pointer"
              >
                {(Object.entries(SORT_LABELS) as [SortOption, string][]).map(([val, label]) => (
                  <option key={val} value={val}>{label}</option>
                ))}
              </select>
              <select
                value={filterBy}
                onChange={e => setFilterBy(e.target.value)}
                className="bg-white border syn-border rounded-lg px-3 py-2
                           text-[12px] syn-text-secondary font-medium
                           focus:outline-none focus:border-brand-500 transition-colors cursor-pointer"
              >
                <option value="all">All deals</option>
                <option value="active">Active only</option>
                <option value="closed_won">Closed (won)</option>
                <option value="closed_lost">Closed (lost)</option>
                {availableStages.length > 0 && (
                  <optgroup label="By Stage">
                    {availableStages.map(s => (
                      <option key={s} value={`stage:${s}`}>{s}</option>
                    ))}
                  </optgroup>
                )}
              </select>
            </div>
          </div>
        </div>
      )}

      {/* Deal List */}
      <div className="flex-1 overflow-y-auto syn-scroll px-8 pb-8">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-5 h-5 syn-text-muted animate-spin" />
          </div>
        ) : deals.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="w-14 h-14 rounded-xl syn-surface-2 border syn-border flex items-center justify-center mb-5">
              <TrendingUp className="w-6 h-6 syn-text-tertiary" />
            </div>
            <p className="text-[14px] font-medium syn-text-secondary">No deals yet</p>
            <p className="text-[12px] syn-text-tertiary mt-1.5 mb-5 max-w-[240px]">
              Create your first deal to start tracking your pipeline
            </p>
            <button onClick={() => setShowNew(true)}
              className="flex items-center gap-1.5 text-[12px] font-semibold px-4 py-2 rounded-lg bg-brand-600 hover:bg-brand-500 text-white transition-colors">
              <Plus className="w-3.5 h-3.5" /> New Deal
            </button>
          </div>
        ) : filteredAndSortedDeals.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Search className="w-8 h-8 syn-text-muted mb-3" />
            <p className="text-[14px] font-medium syn-text-secondary">No deals match your search</p>
            <p className="text-[12px] syn-text-tertiary mt-1 mb-4">
              Try adjusting your search or filter criteria
            </p>
            <button
              onClick={() => { setSearchQuery(''); setFilterBy('all') }}
              className="text-[12px] font-medium text-brand-600 hover:text-brand-500 transition-colors"
            >
              Clear filters
            </button>
          </div>
        ) : (
          <>
            {/* Column Headers */}
            <div
              className="grid gap-4 mb-3 px-4"
              style={{ gridTemplateColumns: '1fr 140px 180px 140px 100px' }}
            >
              <span className="text-[10px] syn-text-muted uppercase tracking-widest font-semibold">
                Deal Details
              </span>
              <span className="text-[10px] syn-text-muted uppercase tracking-widest font-semibold">
                Value
              </span>
              <span className="text-[10px] syn-text-muted uppercase tracking-widest font-semibold">
                Status &amp; Prob.
              </span>
              <span className="text-[10px] syn-text-muted uppercase tracking-widest font-semibold">
                Owner
              </span>
              <span className="text-[10px] syn-text-muted uppercase tracking-widest font-semibold text-right">
                Estimate
              </span>
            </div>

            {/* Deal Rows */}
            <div className="space-y-3">
              {filteredAndSortedDeals.map(deal => {
                const pct = deal.win_probability !== null
                  ? Math.round(deal.win_probability * 100) : null
                const daysRem = getDaysRemaining(deal)
                const estDate = getEstCloseDate(deal)

                return (
                  <div
                    key={deal.id}
                    onClick={() => router.push(`/deals/${deal.id}`)}
                    className="bg-white border syn-border rounded-xl px-4 py-4 cursor-pointer
                               hover:border-gray-300 hover:shadow-md transition-all group relative"
                  >
                    {/* Delete button — hover only */}
                    <button
                      onClick={e => { e.stopPropagation(); setDeleteTarget(deal) }}
                      className="absolute top-3 right-3 opacity-0 group-hover:opacity-100
                                 w-7 h-7 rounded-lg flex items-center justify-center
                                 syn-text-muted hover:text-red-400 hover:bg-red-500/10
                                 transition-all duration-150 z-10"
                      title="Delete deal"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>

                    <div
                      className="grid items-center gap-4"
                      style={{ gridTemplateColumns: '1fr 140px 180px 140px 100px' }}
                    >
                      {/* Deal Details */}
                      <div className="flex items-center gap-3 min-w-0">
                        <DealIcon stage={deal.stage} />
                        <div className="min-w-0">
                          <p className="text-[14px] font-semibold syn-text-primary truncate group-hover:text-brand-600 transition-colors">
                            {deal.company}
                          </p>
                          <p className="text-[12px] syn-text-tertiary truncate">
                            {deal.name}
                          </p>
                        </div>
                      </div>

                      {/* Value */}
                      <div>
                        <p className="text-[14px] font-bold syn-text-primary tabular-nums">
                          {fmtFullMoney(deal.value || 0, deal.currency)}
                        </p>
                        {deal.win_probability !== null && (
                          <p className="text-[11px] syn-text-muted">
                            {fmtMoney((deal.value || 0) * deal.win_probability, deal.currency)} weighted
                          </p>
                        )}
                      </div>

                      {/* Status & Prob */}
                      <div>
                        <div className="flex items-center gap-2 mb-1.5">
                          <StageBadge stage={deal.stage} />
                          <span className={cn(
                            'text-[13px] font-bold tabular-nums',
                            pct === null ? 'syn-text-muted' : 'syn-text-primary'
                          )}>
                            {pct !== null ? `${pct}%` : '\u2014'}
                          </span>
                        </div>
                        <ProbBar prob={deal.win_probability} />
                      </div>

                      {/* Owner */}
                      <div className="flex items-center gap-2 min-w-0">
                        {deal.owner ? (
                          <>
                            <OwnerAvatar name={deal.owner} />
                            <span className="text-[12px] syn-text-secondary font-medium truncate">
                              {deal.owner}
                            </span>
                          </>
                        ) : (
                          <span className="text-[12px] syn-text-muted">&mdash;</span>
                        )}
                      </div>

                      {/* Estimate */}
                      <div className="text-right pr-6">
                        {daysRem !== null ? (
                          <>
                            <p className={cn(
                              'text-[14px] font-bold tabular-nums',
                              daysRem < 0 ? 'text-red-500' : 'syn-text-primary'
                            )}>
                              {daysRem < 0 ? 'Overdue' : `${daysRem}d`}
                            </p>
                            {estDate && (
                              <p className="text-[11px] syn-text-muted">
                                {fmtShortDate(estDate)} est.
                              </p>
                            )}
                          </>
                        ) : (
                          <span className="text-[12px] syn-text-muted">&mdash;</span>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        )}
      </div>

      {/* New Deal modal */}
      {showNew && (
        <div
          className="syn-modal-backdrop fixed inset-0 bg-gray-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onClick={(e) => { if (e.target === e.currentTarget) setShowNew(false) }}
        >
          <div className="syn-modal-content syn-surface border syn-border rounded-xl w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between px-5 py-4 border-b syn-border">
              <h2 className="text-[14px] font-semibold text-gray-900">New Deal</h2>
              <button onClick={() => setShowNew(false)} className="syn-text-muted hover:syn-text-secondary transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 space-y-3">
              {[
                { label: 'Deal Name *',        key: 'name',               placeholder: 'e.g. NovaTech ERP Integration' },
                { label: 'Company *',          key: 'company',            placeholder: 'e.g. NovaTech Manufacturing' },
                { label: 'Owner',              key: 'owner',              placeholder: 'e.g. John Smith' },
              ].map(({ label, key, placeholder }) => (
                <div key={key}>
                  <label className="block text-[11px] syn-text-tertiary uppercase tracking-wider mb-1.5 font-medium">{label}</label>
                  <input
                    value={form[key as keyof typeof form]}
                    onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                    placeholder={placeholder}
                    className="w-full syn-surface-2 border syn-border rounded-lg px-3 py-2
                               text-[13px] text-gray-900 placeholder-gray-400
                               focus:outline-none focus:border-brand-500 transition-colors"
                  />
                </div>
              ))}
              {/* Deal Value + Currency */}
              <div>
                <label className="block text-[11px] syn-text-tertiary uppercase tracking-wider mb-1.5 font-medium">Deal Value</label>
                <div className="flex gap-2">
                  <select
                    value={form.currency}
                    onChange={e => setForm(f => ({ ...f, currency: e.target.value }))}
                    className="w-[110px] syn-surface-2 border syn-border rounded-lg px-2 py-2
                               text-[13px] text-gray-900 focus:outline-none focus:border-brand-500 transition-colors
                               flex-shrink-0"
                  >
                    {CURRENCIES.map(c => (
                      <option key={c.code} value={c.code}>{c.symbol} {c.code}</option>
                    ))}
                  </select>
                  <input
                    value={form.value}
                    onChange={e => setForm(f => ({ ...f, value: e.target.value }))}
                    placeholder="e.g. 185000"
                    className="flex-1 syn-surface-2 border syn-border rounded-lg px-3 py-2
                               text-[13px] text-gray-900 placeholder-gray-400
                               focus:outline-none focus:border-brand-500 transition-colors"
                  />
                </div>
              </div>
              {/* Est. Days to Close */}
              <div>
                <label className="block text-[11px] syn-text-tertiary uppercase tracking-wider mb-1.5 font-medium">Est. Days to Close</label>
                <input
                  value={form.time_to_close_days}
                  onChange={e => setForm(f => ({ ...f, time_to_close_days: e.target.value }))}
                  placeholder="e.g. 45"
                  className="w-full syn-surface-2 border syn-border rounded-lg px-3 py-2
                             text-[13px] text-gray-900 placeholder-gray-400
                             focus:outline-none focus:border-brand-500 transition-colors"
                />
              </div>
              <div>
                <label className="block text-[11px] syn-text-tertiary uppercase tracking-wider mb-1.5 font-medium">Stage</label>
                <select
                  value={form.stage}
                  onChange={e => setForm(f => ({ ...f, stage: e.target.value }))}
                  className="w-full syn-surface-2 border syn-border rounded-lg px-3 py-2
                             text-[13px] text-gray-900 focus:outline-none focus:border-brand-500 transition-colors">
                  {STAGES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>
            <div className="flex gap-2 px-5 pb-5">
              <button onClick={() => setShowNew(false)}
                className="flex-1 py-2 text-[13px] font-medium rounded-lg border syn-border syn-text-tertiary hover:syn-text-secondary transition-colors">
                Cancel
              </button>
              <button onClick={handleCreate} disabled={creating || !form.name.trim() || !form.company.trim()}
                className="flex-1 py-2 text-[13px] font-semibold rounded-lg bg-brand-600 hover:bg-brand-500 disabled:opacity-50 text-white transition-colors flex items-center justify-center gap-1.5">
                {creating ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Creating&hellip;</> : 'Create Deal'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteTarget && (
        <DeleteModal
          deal={deleteTarget}
          onClose={() => !deleting && setDeleteTarget(null)}
          onConfirm={handleDelete}
          deleting={deleting}
        />
      )}
    </div>
  )
}
