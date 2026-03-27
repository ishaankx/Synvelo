'use client'
import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, TrendingUp, DollarSign, Clock, Building2, Loader2, X, Trash2, AlertTriangle, ChevronDown } from 'lucide-react'
import { dealsApi } from '@/lib/api'
import { cn } from '@/lib/utils'
import StagePipelineBar from '@/components/StagePipelineBar'
import { type StageKey } from '@/lib/stage-utils'

interface Deal {
  id: string
  name: string
  company: string
  stage: string
  value: number
  owner: string
  win_probability: number | null
  time_to_close_days: number | null
  last_scored_at: string | null
  created_at: string
  days_in_current_stage?: number
}

const STAGES = ['Discovery', 'Qualification', 'Demo', 'Proposal', 'Negotiation', 'Closed Won', 'Closed Lost']

function fmtMoney(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(1)}K`
  return `$${n.toLocaleString()}`
}
const DELETE_PHRASE = 'Yes I want to delete this deal'

function WinBar({ prob }: { prob: number | null }) {
  if (prob === null) return <div className="h-[2px] w-full bg-gray-200 rounded-full" />
  const pct = Math.round(prob * 100)
  const color = pct >= 65 ? 'bg-emerald-500' : pct >= 40 ? 'bg-amber-500' : 'bg-red-500'
  return (
    <div className="h-[2px] w-full bg-gray-200 rounded-full overflow-hidden">
      <div className={`h-full ${color} rounded-full transition-all duration-700`} style={{ width: `${pct}%` }} />
    </div>
  )
}

// ── Delete Confirmation Modal ────────────────────────────────────────────────

function DeleteModal({
  deal,
  onClose,
  onConfirm,
  deleting,
}: {
  deal: Deal
  onClose: () => void
  onConfirm: () => void
  deleting: boolean
}) {
  const [typed, setTyped] = useState('')
  const confirmed = typed === DELETE_PHRASE

  // Close on Escape
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
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b syn-border">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-600" />
            <h2 className="text-[13px] font-semibold text-gray-900">Delete deal</h2>
          </div>
          <button
            onClick={onClose}
            className="syn-text-muted hover:syn-text-secondary transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          <p className="text-[12px] syn-text-secondary leading-relaxed">
            This action <span className="font-semibold text-gray-900">cannot be undone</span>. This will permanently delete the deal{' '}
            <span className="font-semibold text-gray-900">&ldquo;{deal.name}&rdquo;</span>, along with all its documents, scores, and analysis history.
          </p>

          {/* Deal summary */}
          <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3">
            <p className="text-[12px] syn-text-tertiary">
              <span className="syn-text-secondary font-medium">{deal.company}</span>
              {' \u00b7 '}{deal.stage}
              {' \u00b7 '}<span className="syn-text-secondary">${(deal.value || 0).toLocaleString()}</span>
            </p>
          </div>

          {/* Typing confirmation */}
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

        {/* Footer */}
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
    value: '', owner: '', time_to_close_days: ''
  })

  // Delete state
  const [deleteTarget, setDeleteTarget] = useState<Deal | null>(null)
  const [deleting, setDeleting] = useState(false)

  // KPI card expand state
  const [expandedCard, setExpandedCard] = useState<'pipeline' | 'weighted' | null>(null)

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
        owner: form.owner,
        time_to_close_days: form.time_to_close_days ? parseInt(form.time_to_close_days) : null,
      } as any)
      setShowNew(false)
      setForm({ name: '', company: '', stage: 'Discovery', value: '', owner: '', time_to_close_days: '' })
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

  const totalValue    = deals.reduce((s, d) => s + (d.value || 0), 0)
  const weightedValue = deals.reduce((s, d) => s + (d.value || 0) * (d.win_probability || 0), 0)
  const scoredDeals   = deals.filter(d => d.win_probability !== null)
  const avgProb       = scoredDeals.length
    ? scoredDeals.reduce((s, d) => s + d.win_probability!, 0) / scoredDeals.length
    : null

  return (
    <div className="flex-1 flex flex-col min-h-0">

      {/* Header */}
      <div className="h-[64px] border-b syn-border px-6 flex items-center justify-between flex-shrink-0">
        <div>
          <h1 className="text-[18px] font-semibold syn-text-primary">Pipeline</h1>
          <p className="text-[12px] syn-text-secondary">{deals.length} deal{deals.length !== 1 ? 's' : ''} in pipeline</p>
        </div>
        <button
          onClick={() => setShowNew(true)}
          className="flex items-center gap-1.5 text-[12px] font-semibold px-4 py-2 rounded-lg
                     bg-brand-600 hover:bg-brand-500 text-white transition-colors">
          <Plus className="w-3.5 h-3.5" /> New Deal
        </button>
      </div>

      {/* KPI Stats Strip */}
      <div className="flex-shrink-0 border-b syn-border px-6 py-4">
        <div className="grid grid-cols-4 gap-3">

          {/* Total Pipeline — expandable */}
          <div className="relative" onClick={e => e.stopPropagation()}>
            <button
              onClick={() => setExpandedCard(expandedCard === 'pipeline' ? null : 'pipeline')}
              className={cn(
                'w-full bg-white border syn-border rounded-lg px-4 py-3 shadow-sm border-l-4 border-l-brand-500',
                'text-left transition-colors hover:border-gray-300',
                expandedCard === 'pipeline' && 'border-brand-300'
              )}
            >
              <div className="flex items-center justify-between">
                <p className="text-[11px] syn-text-tertiary uppercase tracking-wider font-medium">Total Pipeline</p>
                <ChevronDown className={cn('w-3.5 h-3.5 syn-text-muted transition-transform duration-200', expandedCard === 'pipeline' && 'rotate-180')} />
              </div>
              <p className="text-[20px] font-bold syn-text-primary mt-1">{fmtMoney(totalValue)}</p>
            </button>
            {expandedCard === 'pipeline' && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-white border syn-border rounded-lg shadow-lg z-20">
                <div className="p-2 max-h-[240px] overflow-y-auto syn-scroll">
                  {deals.map(deal => (
                    <div key={deal.id} className="flex items-center justify-between px-3 py-2 rounded-md hover:bg-gray-50 transition-colors">
                      <div className="min-w-0 flex-1">
                        <p className="text-[12px] font-medium syn-text-primary truncate">{deal.name}</p>
                        <p className="text-[11px] syn-text-tertiary truncate">{deal.company}</p>
                      </div>
                      <span className="text-[13px] font-semibold syn-text-secondary tabular-nums ml-3">
                        {fmtMoney(deal.value || 0)}
                      </span>
                    </div>
                  ))}
                  <div className="border-t syn-border mt-1 pt-2 px-3 pb-1 flex justify-between items-center">
                    <span className="text-[11px] syn-text-tertiary font-medium uppercase tracking-wider">Total</span>
                    <span className="text-[13px] font-bold syn-text-primary tabular-nums">{fmtMoney(totalValue)}</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Weighted — expandable */}
          <div className="relative" onClick={e => e.stopPropagation()}>
            <button
              onClick={() => setExpandedCard(expandedCard === 'weighted' ? null : 'weighted')}
              className={cn(
                'w-full bg-white border syn-border rounded-lg px-4 py-3 shadow-sm border-l-4 border-l-violet-500',
                'text-left transition-colors hover:border-gray-300',
                expandedCard === 'weighted' && 'border-violet-300'
              )}
            >
              <div className="flex items-center justify-between">
                <p className="text-[11px] syn-text-tertiary uppercase tracking-wider font-medium">Weighted</p>
                <ChevronDown className={cn('w-3.5 h-3.5 syn-text-muted transition-transform duration-200', expandedCard === 'weighted' && 'rotate-180')} />
              </div>
              <p className="text-[20px] font-bold syn-text-primary mt-1">{fmtMoney(weightedValue)}</p>
            </button>
            {expandedCard === 'weighted' && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-white border syn-border rounded-lg shadow-lg z-20">
                <div className="p-2 max-h-[240px] overflow-y-auto syn-scroll">
                  {deals.map(deal => {
                    const contrib = (deal.value || 0) * (deal.win_probability || 0)
                    const pct = deal.win_probability !== null ? Math.round(deal.win_probability * 100) : null
                    return (
                      <div key={deal.id} className="flex items-center justify-between px-3 py-2 rounded-md hover:bg-gray-50 transition-colors">
                        <div className="min-w-0 flex-1">
                          <p className="text-[12px] font-medium syn-text-primary truncate">{deal.name}</p>
                          <p className="text-[11px] syn-text-tertiary truncate">
                            {fmtMoney(deal.value || 0)} &times; {pct !== null ? `${pct}%` : '—'}
                          </p>
                        </div>
                        <span className="text-[13px] font-semibold syn-text-secondary tabular-nums ml-3">
                          {pct !== null ? fmtMoney(contrib) : '—'}
                        </span>
                      </div>
                    )
                  })}
                  <div className="border-t syn-border mt-1 pt-2 px-3 pb-1 flex justify-between items-center">
                    <span className="text-[11px] syn-text-tertiary font-medium uppercase tracking-wider">Total</span>
                    <span className="text-[13px] font-bold syn-text-primary tabular-nums">{fmtMoney(weightedValue)}</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Avg Win Prob — static */}
          <div className="bg-white border syn-border rounded-lg px-4 py-3 shadow-sm border-l-4 border-l-emerald-500">
            <p className="text-[11px] syn-text-tertiary uppercase tracking-wider font-medium">Avg Win Prob</p>
            <p className="text-[20px] font-bold syn-text-primary mt-1">
              {avgProb !== null ? `${Math.round(avgProb * 100)}%` : '\u2014'}
            </p>
          </div>

          {/* Deals — static */}
          <div className="bg-white border syn-border rounded-lg px-4 py-3 shadow-sm border-l-4 border-l-amber-500">
            <p className="text-[11px] syn-text-tertiary uppercase tracking-wider font-medium">Deals</p>
            <p className="text-[20px] font-bold syn-text-primary mt-1">{deals.length}</p>
          </div>

        </div>
      </div>

      {/* Deal list */}
      <div className="flex-1 overflow-y-auto syn-scroll p-6">
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
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {deals.map(deal => {
              const pct = deal.win_probability !== null ? Math.round(deal.win_probability * 100) : null
              const pctColor = pct === null ? 'syn-text-muted' : pct >= 65 ? 'text-emerald-600' : pct >= 40 ? 'text-amber-600' : 'text-red-600'
              const borderIndicator = pct === null
                ? 'border-l-gray-300'
                : pct >= 65
                  ? 'border-l-emerald-500'
                  : pct >= 40
                    ? 'border-l-amber-500'
                    : 'border-l-red-500'
              return (
                <div key={deal.id}
                  onClick={() => router.push(`/deals/${deal.id}`)}
                  className={cn(
                    'syn-surface border syn-border rounded-xl p-4 cursor-pointer',
                    'hover:border-gray-300 transition-all group relative',
                    'border-l-2', borderIndicator
                  )}>

                  {/* Delete button -- visible on hover, top-right corner */}
                  <button
                    onClick={e => {
                      e.stopPropagation() // prevent navigating to deal
                      setDeleteTarget(deal)
                    }}
                    className="absolute top-3 right-3 opacity-0 group-hover:opacity-100
                               w-7 h-7 rounded-lg flex items-center justify-center
                               syn-text-muted hover:text-red-400 hover:bg-red-500/10
                               transition-all duration-150 z-10"
                    title="Delete deal"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>

                  <div className="flex items-center justify-between gap-4 mb-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2.5 mb-1">
                        <h3 className="text-[14px] font-medium text-gray-900 truncate group-hover:text-brand-400 transition-colors">
                          {deal.name}
                        </h3>
                        <StagePipelineBar currentStage={deal.stage as StageKey} compact />
                      </div>
                      <div className="flex items-center gap-2">
                        <Building2 className="w-3 h-3 syn-text-muted flex-shrink-0" />
                        <p className="text-[12px] text-gray-500">{deal.company}</p>
                        <span className="syn-text-muted">&middot;</span>
                        <p className="text-[12px] text-gray-500">{deal.owner || '\u2014'}</p>
                      </div>
                    </div>
                    <div className="flex-shrink-0 text-right pr-8">
                      <span className={cn('text-[18px] font-bold tabular-nums', pctColor)}>
                        {pct !== null ? `${pct}%` : '\u2014'}
                      </span>
                    </div>
                  </div>

                  <WinBar prob={deal.win_probability} />

                  <div className="flex items-center justify-between mt-2.5">
                    <div className="flex items-center gap-1.5">
                      <DollarSign className="w-3 h-3 syn-text-muted" />
                      <p className="text-[14px] syn-text-secondary font-semibold tabular-nums">
                        ${(deal.value || 0).toLocaleString()}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {deal.days_in_current_stage != null && deal.days_in_current_stage > 0 && (
                        <span className="text-[11px] syn-text-muted">
                          {deal.days_in_current_stage}d in stage
                        </span>
                      )}
                      {deal.time_to_close_days && (
                        <div className="flex items-center gap-1">
                          <Clock className="w-3 h-3 syn-text-muted" />
                          <p className="text-[12px] syn-text-tertiary">{deal.time_to_close_days}d est.</p>
                        </div>
                      )}
                      {!deal.last_scored_at && (
                        <span className="text-[11px] syn-text-muted syn-surface-2 px-2 py-0.5 rounded-md">
                          Not scored
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
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
                { label: 'Deal Value ($)',      key: 'value',              placeholder: 'e.g. 185000' },
                { label: 'Est. Days to Close', key: 'time_to_close_days', placeholder: 'e.g. 45' },
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
