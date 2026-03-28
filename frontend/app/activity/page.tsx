'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { activityApi } from '@/lib/api'
import { cn } from '@/lib/utils'
import {
  Search, Filter, Calendar, ChevronLeft, ChevronRight,
  Plus, Trash2, ArrowRightLeft, Target, FileText, Mic,
  Zap, Brain, BarChart3, RefreshCw, User, MessageSquare,
  Building2, DollarSign, Clock,
  CheckCircle, Mail, BookOpen, Upload, FlaskConical,
  FileOutput, X,
} from 'lucide-react'

// ── Types ─────────────────────────────────────────────────────────────
interface ActivityItem {
  id: string
  event_type: string
  actor_id: string | null
  actor_name: string | null
  entity_type: string
  entity_id: string | null
  entity_name: string | null
  old_value: Record<string, unknown> | null
  new_value: Record<string, unknown> | null
  metadata: Record<string, unknown> | null
  created_at: string
}

interface Filters {
  event_type: string
  entity_type: string
  search: string
  date_from: string
  date_to: string
}

// ── Event Metadata ────────────────────────────────────────────────────
const EVENT_META: Record<string, { label: string; icon: typeof Plus; color: string; category: string }> = {
  deal_created:             { label: 'Deal Created',            icon: Plus,            color: 'text-emerald-600 bg-emerald-50',   category: 'Deals' },
  deal_deleted:             { label: 'Deal Deleted',            icon: Trash2,          color: 'text-red-600 bg-red-50',           category: 'Deals' },
  deal_stage_changed:       { label: 'Stage Changed',           icon: ArrowRightLeft,  color: 'text-indigo-600 bg-indigo-50',     category: 'Pipeline' },
  deal_value_changed:       { label: 'Value Changed',           icon: DollarSign,      color: 'text-amber-600 bg-amber-50',       category: 'Deals' },
  deal_company_changed:     { label: 'Company Changed',         icon: Building2,       color: 'text-blue-600 bg-blue-50',         category: 'Deals' },
  deal_owner_changed:       { label: 'Owner Changed',           icon: User,            color: 'text-violet-600 bg-violet-50',     category: 'Deals' },
  deal_time_to_close_days_changed: { label: 'Est. Close Changed', icon: Clock,        color: 'text-cyan-600 bg-cyan-50',         category: 'Deals' },
  deal_ask_ai:              { label: 'Ask AI Query',             icon: MessageSquare,   color: 'text-blue-600 bg-blue-50',         category: 'AI' },
  deal_scored:              { label: 'Deal Scored',             icon: Target,          color: 'text-orange-600 bg-orange-50',     category: 'AI' },
  brief_generated:          { label: 'Brief Generated',         icon: BookOpen,        color: 'text-purple-600 bg-purple-50',     category: 'AI' },
  followup_generated:       { label: 'Follow-up Generated',     icon: Mail,            color: 'text-pink-600 bg-pink-50',         category: 'AI' },
  document_uploaded:        { label: 'Document Uploaded',        icon: Upload,          color: 'text-teal-600 bg-teal-50',         category: 'Documents' },
  transcription_uploaded:   { label: 'Transcription Started',    icon: Mic,             color: 'text-sky-600 bg-sky-50',           category: 'Documents' },
  transcription_from_url:   { label: 'URL Transcription',        icon: Mic,             color: 'text-sky-600 bg-sky-50',           category: 'Documents' },
  pulse_query:              { label: 'Pulse Query',              icon: Zap,             color: 'text-yellow-600 bg-yellow-50',     category: 'Operations' },
  pulse_approved:           { label: 'Pulse Decision',           icon: CheckCircle,     color: 'text-green-600 bg-green-50',       category: 'Operations' },
  report_generated:         { label: 'Report Generated',         icon: FileText,        color: 'text-indigo-600 bg-indigo-50',     category: 'Documents' },
  report_deleted:           { label: 'Report Deleted',           icon: Trash2,          color: 'text-red-500 bg-red-50',           category: 'Documents' },
  nexus_model_trained:      { label: 'Model Trained',            icon: Brain,           color: 'text-emerald-600 bg-emerald-50',   category: 'NEXUS' },
  nexus_simulation_run:     { label: 'Simulation Run',           icon: FlaskConical,    color: 'text-violet-600 bg-violet-50',     category: 'NEXUS' },
  nexus_artifacts_generated:{ label: 'Artifacts Generated',      icon: FileOutput,      color: 'text-amber-600 bg-amber-50',       category: 'NEXUS' },
}

const ENTITY_TYPES = [
  { value: '', label: 'All Entities' },
  { value: 'deal', label: 'Deals' },
  { value: 'document', label: 'Documents' },
  { value: 'transcription', label: 'Transcriptions' },
  { value: 'pulse', label: 'Pulse Sync' },
  { value: 'report', label: 'Reports' },
  { value: 'nexus', label: 'NEXUS' },
]

const CATEGORY_COLORS: Record<string, string> = {
  Deals: 'text-emerald-600 bg-emerald-50 border-emerald-200',
  Pipeline: 'text-indigo-600 bg-indigo-50 border-indigo-200',
  AI: 'text-orange-600 bg-orange-50 border-orange-200',
  Documents: 'text-teal-600 bg-teal-50 border-teal-200',
  Operations: 'text-yellow-700 bg-yellow-50 border-yellow-200',
  NEXUS: 'text-violet-600 bg-violet-50 border-violet-200',
}

function getEventMeta(eventType: string) {
  return EVENT_META[eventType] || {
    label: eventType.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
    icon: BarChart3,
    color: 'text-gray-600 bg-gray-50',
    category: 'System',
  }
}

// ── Timestamp helpers ─────────────────────────────────────────────────
function parseTs(iso: string): number {
  const str = iso.endsWith('Z') || /[+-]\d{2}:\d{2}$/.test(iso) ? iso : iso + 'Z'
  return new Date(str).getTime()
}

function relativeTime(iso: string): string {
  const diff = Date.now() - parseTs(iso)
  if (diff < 0) return 'just now'
  const s = Math.floor(diff / 1000)
  const m = Math.floor(s / 60)
  const h = Math.floor(m / 60)
  const d = Math.floor(h / 24)
  if (d > 0) return `${d}d ago`
  if (h > 0) return `${h}h ago`
  if (m > 0) return `${m}m ago`
  return 'just now'
}

function absoluteTime(iso: string): string {
  const d = new Date(parseTs(iso))
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    + ' \u00B7 '
    + d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
}

function dayKey(iso: string): string {
  const d = new Date(parseTs(iso))
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
}

// ── Change Detail Renderer ────────────────────────────────────────────
function ChangeDetail({ item }: { item: ActivityItem }) {
  const { event_type, old_value, new_value, metadata } = item

  if (event_type === 'deal_created' && new_value) {
    return (
      <span className="text-[11.5px] text-gray-500">
        {new_value.company ? <>{String(new_value.company)} &middot; </> : null}
        {new_value.stage ? <>{String(new_value.stage)} &middot; </> : null}
        {new_value.value != null ? <>${Number(new_value.value).toLocaleString()}</> : null}
      </span>
    )
  }

  if (event_type === 'deal_deleted' && old_value) {
    return (
      <span className="text-[11.5px] text-gray-500">
        Last state: {String(old_value.stage)}
        {old_value.value != null ? <> &middot; ${Number(old_value.value).toLocaleString()}</> : null}
      </span>
    )
  }

  if (event_type === 'deal_stage_changed' && old_value && new_value) {
    return (
      <div className="flex items-center gap-1.5 text-[11.5px]">
        <span className="text-gray-500">{String(old_value.stage)}</span>
        <ArrowRightLeft className="w-3 h-3 text-gray-400" />
        <span className="font-medium text-gray-700">{String(new_value.stage)}</span>
        {metadata?.reason ? (
          <span className="text-gray-400 ml-1">&mdash; {String(metadata.reason)}</span>
        ) : null}
      </div>
    )
  }

  // Generic field change (value, owner, company, etc.)
  if (old_value && new_value) {
    const keys = Object.keys(new_value)
    return (
      <div className="text-[11.5px] text-gray-500">
        {keys.map(k => {
          const oldV = old_value[k]
          const newV = new_value[k]
          const isNum = typeof newV === 'number'
          return (
            <span key={k}>
              {isNum ? `$${Number(oldV).toLocaleString()}` : String(oldV ?? '(empty)')}
              {' \u2192 '}
              {isNum ? `$${Number(newV).toLocaleString()}` : String(newV ?? '(empty)')}
            </span>
          )
        })}
      </div>
    )
  }

  if (event_type === 'deal_ask_ai' && new_value) {
    return (
      <span className="text-[11.5px] text-gray-500 italic">
        &ldquo;{String(new_value.query)}&rdquo;
      </span>
    )
  }

  if (event_type === 'deal_scored' && new_value) {
    return (
      <span className="text-[11.5px] text-gray-500">
        Win probability: {Math.round(Number(new_value.win_probability) * 100)}%
      </span>
    )
  }

  if (event_type === 'document_uploaded' && new_value) {
    return (
      <span className="text-[11.5px] text-gray-500">
        {String(new_value.source_type)}
        {new_value.chunks_created ? <> &middot; {String(new_value.chunks_created)} chunks</> : null}
      </span>
    )
  }

  if (event_type === 'nexus_model_trained' && new_value) {
    return (
      <span className="text-[11.5px] text-gray-500">
        v{String(new_value.version)} &middot; {String(new_value.n_training_samples)} samples
        &middot; AUC {Number(new_value.cv_auc).toFixed(3)}
      </span>
    )
  }

  if (event_type === 'nexus_simulation_run' && new_value) {
    return (
      <span className="text-[11.5px] text-gray-500">
        {String(new_value.simulation_type)} &middot; {String(new_value.n_scenarios)} scenarios
      </span>
    )
  }

  if (metadata?.deal_name) {
    return <span className="text-[11.5px] text-gray-500">Deal: {String(metadata.deal_name)}</span>
  }

  return null
}

// ── Main Component ────────────────────────────────────────────────────
const PAGE_SIZE = 30

export default function ActivityPage() {
  const [items, setItems] = useState<ActivityItem[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [loading, setLoading] = useState(true)
  const [eventTypes, setEventTypes] = useState<string[]>([])
  const [filters, setFilters] = useState<Filters>({
    event_type: '',
    entity_type: '',
    search: '',
    date_from: '',
    date_to: '',
  })
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [refreshCounter, setRefreshCounter] = useState(0)

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(filters.search), 300)
    return () => clearTimeout(t)
  }, [filters.search])

  // Fetch event types for filter dropdown
  const fetchEventTypes = useCallback(() => {
    activityApi.eventTypes().then(r => setEventTypes(r.data)).catch(() => {})
  }, [])
  useEffect(() => { fetchEventTypes() }, [fetchEventTypes])

  // Fetch activity feed
  const fetchActivity = useCallback(async () => {
    setLoading(true)
    try {
      const params: Record<string, unknown> = {
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
      }
      if (filters.event_type) params.event_type = filters.event_type
      if (filters.entity_type) params.entity_type = filters.entity_type
      if (debouncedSearch) params.search = debouncedSearch
      if (filters.date_from) params.date_from = filters.date_from
      if (filters.date_to) params.date_to = filters.date_to

      const res = await activityApi.list(params as Parameters<typeof activityApi.list>[0])
      setItems(res.data.items)
      setTotal(res.data.total)
    } catch {
      // silently fail
    } finally {
      setLoading(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, filters.event_type, filters.entity_type, debouncedSearch, filters.date_from, filters.date_to, refreshCounter])

  useEffect(() => { fetchActivity() }, [fetchActivity])

  // Reset page when filters change
  useEffect(() => { setPage(0) }, [filters.event_type, filters.entity_type, debouncedSearch, filters.date_from, filters.date_to])

  const totalPages = Math.ceil(total / PAGE_SIZE)

  // Group items by day
  const grouped: { day: string; items: ActivityItem[] }[] = []
  let currentDay = ''
  for (const item of items) {
    const day = dayKey(item.created_at)
    if (day !== currentDay) {
      grouped.push({ day, items: [item] })
      currentDay = day
    } else {
      grouped[grouped.length - 1].items.push(item)
    }
  }

  const hasActiveFilters = filters.event_type || filters.entity_type || debouncedSearch || filters.date_from || filters.date_to

  return (
    <div className="max-w-[1100px] mx-auto px-6 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-[22px] font-bold text-gray-900 tracking-tight">Activity Feed</h1>
          <p className="text-[13px] text-gray-500 mt-0.5">
            Chronological log of all actions across your workspace
          </p>
        </div>
        <button
          onClick={() => { setRefreshCounter(c => c + 1); fetchEventTypes() }}
          disabled={loading}
          className="flex items-center gap-2 px-3.5 py-2 rounded-xl border border-gray-200 bg-white text-[13px] font-medium text-gray-600 hover:bg-gray-50 hover:border-gray-300 transition-all disabled:opacity-50"
        >
          <RefreshCw className={cn('w-3.5 h-3.5', loading && 'animate-spin')} />
          Refresh
        </button>
      </div>

      {/* Filter Bar */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 mb-6">
        <div className="flex flex-wrap items-center gap-3">
          {/* Search */}
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search activity..."
              value={filters.search}
              onChange={e => setFilters(f => ({ ...f, search: e.target.value }))}
              className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-gray-200 text-[13px] placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-300 transition-all"
            />
          </div>

          {/* Event Type Filter */}
          <div className="relative">
            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
            <select
              value={filters.event_type}
              onChange={e => setFilters(f => ({ ...f, event_type: e.target.value }))}
              className="pl-9 pr-8 py-2.5 rounded-xl border border-gray-200 text-[13px] text-gray-600 bg-white appearance-none focus:outline-none focus:ring-2 focus:ring-indigo-200 cursor-pointer"
            >
              <option value="">All Events</option>
              {eventTypes.map(t => (
                <option key={t} value={t}>{getEventMeta(t).label}</option>
              ))}
            </select>
          </div>

          {/* Entity Type Filter */}
          <select
            value={filters.entity_type}
            onChange={e => setFilters(f => ({ ...f, entity_type: e.target.value }))}
            className="px-3 py-2.5 rounded-xl border border-gray-200 text-[13px] text-gray-600 bg-white appearance-none focus:outline-none focus:ring-2 focus:ring-indigo-200 cursor-pointer"
          >
            {ENTITY_TYPES.map(t => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>

          {/* Date From */}
          <div className="relative">
            <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
            <input
              type="date"
              value={filters.date_from}
              onChange={e => setFilters(f => ({ ...f, date_from: e.target.value }))}
              className="pl-9 pr-3 py-2.5 rounded-xl border border-gray-200 text-[13px] text-gray-600 focus:outline-none focus:ring-2 focus:ring-indigo-200"
              placeholder="From"
            />
          </div>

          {/* Date To */}
          <div className="relative">
            <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
            <input
              type="date"
              value={filters.date_to}
              onChange={e => setFilters(f => ({ ...f, date_to: e.target.value }))}
              className="pl-9 pr-3 py-2.5 rounded-xl border border-gray-200 text-[13px] text-gray-600 focus:outline-none focus:ring-2 focus:ring-indigo-200"
              placeholder="To"
            />
          </div>

          {/* Clear Filters */}
          {hasActiveFilters && (
            <button
              onClick={() => setFilters({ event_type: '', entity_type: '', search: '', date_from: '', date_to: '' })}
              className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-[12px] font-medium text-red-500 hover:bg-red-50 transition-colors"
            >
              <X className="w-3.5 h-3.5" />
              Clear
            </button>
          )}
        </div>

        {/* Active filter count + total */}
        <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100">
          <p className="text-[12px] text-gray-400">
            {total.toLocaleString()} event{total !== 1 ? 's' : ''} found
          </p>
          {hasActiveFilters && (
            <p className="text-[12px] text-indigo-500 font-medium">
              Filters active
            </p>
          )}
        </div>
      </div>

      {/* Activity Feed */}
      {loading && items.length === 0 ? (
        <div className="space-y-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="animate-pulse bg-white rounded-2xl border border-gray-100 p-5 h-20" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-12 text-center">
          <div className="w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-4">
            <BarChart3 className="w-6 h-6 text-gray-400" />
          </div>
          <h3 className="text-[15px] font-semibold text-gray-700 mb-1">No activity yet</h3>
          <p className="text-[13px] text-gray-500 max-w-md mx-auto">
            {hasActiveFilters
              ? 'No events match your current filters. Try adjusting or clearing them.'
              : 'Activity will appear here as you create deals, upload documents, run scoring, and more.'}
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {grouped.map(group => (
            <div key={group.day}>
              {/* Day Header */}
              <div className="flex items-center gap-3 mb-3">
                <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider whitespace-nowrap">
                  {group.day}
                </span>
                <div className="flex-1 h-px bg-gray-200" />
              </div>

              {/* Events */}
              <div className="space-y-2">
                {group.items.map(item => {
                  const meta = getEventMeta(item.event_type)
                  const Icon = meta.icon
                  const catStyle = CATEGORY_COLORS[meta.category] || 'text-gray-600 bg-gray-50 border-gray-200'
                  const isAI = meta.category === 'AI' || meta.category === 'NEXUS'

                  return (
                    <div
                      key={item.id}
                      className="bg-white rounded-xl border border-gray-200 hover:border-gray-300 hover:shadow-sm transition-all px-4 py-3.5 flex items-start gap-3.5"
                    >
                      {/* Icon */}
                      <div className={cn(
                        'w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0',
                        meta.color,
                      )}>
                        <Icon className="w-4 h-4" />
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-[13px] font-semibold text-gray-800">
                                {meta.label}
                              </span>

                              {/* Category badge */}
                              <span className={cn(
                                'text-[9px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded-md border',
                                catStyle,
                              )}>
                                {meta.category}
                              </span>

                              {/* AI badge — only for non-AI categories that are AI-powered */}
                              {isAI && meta.category !== 'AI' && (
                                <span className="text-[9px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded-md text-purple-600 bg-purple-50 border border-purple-200">
                                  AI
                                </span>
                              )}
                            </div>

                            {/* Entity link */}
                            {item.entity_name && (
                              <div className="mt-0.5">
                                {item.entity_type === 'deal' && item.entity_id ? (
                                  <Link
                                    href={`/deals/${item.entity_id}`}
                                    className="text-[12.5px] text-indigo-600 hover:text-indigo-700 font-medium hover:underline"
                                  >
                                    {item.entity_name}
                                  </Link>
                                ) : (
                                  <span className="text-[12.5px] text-gray-600 font-medium">
                                    {item.entity_name}
                                  </span>
                                )}
                              </div>
                            )}

                            {/* Change detail */}
                            <div className="mt-0.5">
                              <ChangeDetail item={item} />
                            </div>
                          </div>

                          {/* Timestamps */}
                          <div className="flex flex-col items-end flex-shrink-0 gap-0.5">
                            <span className="text-[11px] font-semibold text-gray-500 whitespace-nowrap">
                              {relativeTime(item.created_at)}
                            </span>
                            <span className="text-[10px] text-gray-400 whitespace-nowrap">
                              {absoluteTime(item.created_at)}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-6 pt-4 border-t border-gray-200">
          <p className="text-[12px] text-gray-400">
            Page {page + 1} of {totalPages}
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage(p => Math.max(0, p - 1))}
              disabled={page === 0}
              className="flex items-center gap-1 px-3 py-2 rounded-lg border border-gray-200 text-[12px] font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              Previous
            </button>
            <button
              onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              className="flex items-center gap-1 px-3 py-2 rounded-lg border border-gray-200 text-[12px] font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
            >
              Next
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
