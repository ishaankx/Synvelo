'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import {
  BarChart, Bar, Cell, XAxis, YAxis, ResponsiveContainer, Tooltip,
} from 'recharts'
import {
  TrendingUp, DollarSign, Building2,
  Clock, Loader2, ChevronRight, Users, Zap,
} from 'lucide-react'
import { analyticsApi } from '@/lib/api'
import { fmtMoney as fmtCurrency } from '@/lib/currency'

// ── Types ──────────────────────────────────────────────────────────────────

interface SignalDeal {
  id: string; name: string; company: string; stage: string
  value: number; win_probability: number | null
  red: number; yellow: number; green: number; total: number
}

interface OwnerStat {
  owner: string; deal_count: number; value: number
  avg_prob: number; won: number; lost: number; win_rate: number | null
}

interface FunnelStage {
  stage: string; count: number; value: number; conversion_rate: number | null
}

interface Summary {
  total_deals:                  number
  total_pipeline_value:         number
  weighted_pipeline_value:      number
  avg_win_probability:          number
  avg_days_to_close:            number
  at_risk_count:                number
  unscored_count:               number
  by_stage:                     Array<{ stage: string; count: number; value: number; avg_prob: number }>
  stage_funnel:                 FunnelStage[]
  win_probability_distribution: Array<{ bucket: string; count: number }>
  at_risk_deals:                Array<{
    id: string; name: string; company: string; stage: string
    value: number; win_probability: number | null; top_risk: string
  }>
  recent_activity: Array<{
    date: string; deal_name: string; win_probability: number | null
    trigger_type: string; trigger_document: string | null
  }>
  signal_overview: SignalDeal[]
  by_owner:        OwnerStat[]
}

// ── Constants ──────────────────────────────────────────────────────────────

const STAGE_COLORS = [
  '#6366f1','#818cf8','#a78bfa','#3b82f6','#22c55e','#f59e0b','#ef4444',
]

const FUNNEL_COLORS: Record<string, string> = {
  Discovery:     '#6366f1',
  Qualification: '#818cf8',
  Demo:          '#a78bfa',
  Proposal:      '#3b82f6',
  Negotiation:   '#22c55e',
  'Closed Won':  '#f59e0b',
  'Closed Lost': '#ef4444',
}

const WIN_PROB_BUCKETS = ['0-25%', '25-50%', '50-75%', '75-100%'] as const

const BUCKET_BAR_COLOR: Record<string, string> = {
  '0-25%':   'bg-red-500',
  '25-50%':  'bg-amber-500',
  '50-75%':  'bg-indigo-500',
  '75-100%': 'bg-emerald-500',
}

const BUCKET_TEXT_COLOR: Record<string, string> = {
  '0-25%':   'text-red-600',
  '25-50%':  'text-amber-600',
  '50-75%':  'text-indigo-600',
  '75-100%': 'text-emerald-600',
}

// ── KPI accent border colors ──────────────────────────────────────────────

const KPI_BORDER_COLORS: Record<string, string> = {
  'bg-brand-500/10 text-brand-400':    'border-l-brand-500',
  'bg-violet-500/10 text-violet-400':  'border-l-violet-500',
  'bg-emerald-500/10 text-emerald-400':'border-l-emerald-500',
  'bg-slate-700/60 text-slate-400':    'border-l-slate-400',
  'bg-amber-500/10 text-amber-400':    'border-l-amber-500',
}

// ── Helpers ────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return fmtCurrency(n)
}

function fmtActivity(trigger: string) {
  return ({
    manual_score:       'Scored',
    document_ingested:  'Document uploaded',
  } as Record<string, string>)[trigger] ?? trigger
}

// ── Reusable components ────────────────────────────────────────────────────

function KpiCard({
  label, value, sub, icon: Icon, accent,
}: { label: string; value: string; sub?: string; icon: React.ElementType; accent: string }) {
  return (
    <div className={cn('syn-card p-6 border-l-4', KPI_BORDER_COLORS[accent] || 'border-l-gray-300')}>
      <div className="flex items-start justify-between mb-3">
        <p className="text-[11px] font-semibold syn-text-tertiary uppercase tracking-wider">{label}</p>
        <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center', accent)}>
          <Icon className="w-4 h-4" />
        </div>
      </div>
      <p className="text-[24px] font-bold text-gray-900 leading-none">{value}</p>
      {sub && <p className="text-[11px] syn-text-tertiary mt-1.5">{sub}</p>}
    </div>
  )
}

const CustomBarTip = ({ active, payload }: any) => {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  return (
    <div className="bg-white border border-gray-200 shadow-lg rounded-xl px-3 py-2.5 text-[11px]">
      <p className="text-gray-900 font-semibold mb-1">{d.stage}</p>
      <p className="text-gray-500">{d.count} deal{d.count !== 1 ? 's' : ''}</p>
      <p className="text-brand-600">{fmt(d.value)}</p>
      <p className="text-emerald-600">Avg: {d.avg_prob}%</p>
    </div>
  )
}

// ── Signal bar (inline) ────────────────────────────────────────────────────

function SignalBar({ red, yellow, green }: { red: number; yellow: number; green: number }) {
  const total = red + yellow + green
  if (total === 0) return null
  return (
    <div className="flex items-center gap-0.5 h-2 w-24 rounded-full overflow-hidden bg-gray-200">
      {red > 0 && (
        <div className="h-full bg-red-500 rounded-l-full" style={{ width: `${(red / total) * 100}%` }} />
      )}
      {yellow > 0 && (
        <div className="h-full bg-amber-500" style={{ width: `${(yellow / total) * 100}%` }} />
      )}
      {green > 0 && (
        <div className="h-full bg-emerald-500 rounded-r-full" style={{ width: `${(green / total) * 100}%` }} />
      )}
    </div>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────

type DashTab = 'pipeline' | 'signals' | 'owners'

export default function AnalyticsPage() {
  const [data,    setData]    = useState<Summary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(false)
  const [tab,     setTab]     = useState<DashTab>('pipeline')

  useEffect(() => {
    analyticsApi.summary()
      .then(r => setData(r.data))
      .catch(() => setError(true))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return (
    <div className="flex-1 flex items-center justify-center h-screen syn-bg">
      <Loader2 className="w-6 h-6 syn-text-muted animate-spin" />
    </div>
  )

  if (error || !data) return (
    <div className="flex-1 flex items-center justify-center h-screen syn-bg">
      <p className="syn-text-muted text-[12px]">Failed to load analytics.</p>
    </div>
  )

  const bucketMap = Object.fromEntries(
    data.win_probability_distribution.map(b => [b.bucket, b.count])
  )
  const totalScored = WIN_PROB_BUCKETS.reduce((s, b) => s + (bucketMap[b] || 0), 0)
  const unscoredCount = bucketMap['Unscored'] || 0

  const funnelData = (data.stage_funnel || [])
    .filter(s => s.stage !== 'Closed Lost' && s.count > 0)
    .map(s => ({
      name:  s.stage,
      value: s.count,
      fill:  FUNNEL_COLORS[s.stage] || '#6366f1',
    }))

  return (
    <div className="flex flex-col h-full syn-bg">

      {/* Page header */}
      <div className="h-16 border-b syn-border px-6 flex items-center justify-between flex-shrink-0">
        <div>
          <h1 className="text-[18px] font-semibold syn-text-primary">Analytics</h1>
          <p className="text-[12px] text-gray-500">Pipeline intelligence dashboard</p>
        </div>
        <div className="flex gap-1">
          {([
            ['pipeline', 'Pipeline',  TrendingUp],
            ['signals',  'Signals',   Zap],
            ['owners',   'Owners',    Users],
          ] as const).map(([key, label, Icon]) => (
            <button key={key} onClick={() => setTab(key as DashTab)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium rounded-lg transition-all',
                tab === key
                  ? 'bg-brand-50 text-brand-700'
                  : 'text-gray-500 hover:text-gray-700',
              )}>
              <Icon className="w-3.5 h-3.5" />
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto syn-scroll p-6 space-y-6">

        {/* KPI cards — always visible */}
        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
          <KpiCard label="Total Pipeline"    value={fmt(data.total_pipeline_value)}    icon={DollarSign}    accent="bg-brand-500/10 text-brand-400" />
          <KpiCard label="Weighted Pipeline" value={fmt(data.weighted_pipeline_value)} icon={TrendingUp}    accent="bg-violet-500/10 text-violet-400"
            sub={`${Math.round(data.weighted_pipeline_value / Math.max(data.total_pipeline_value, 1) * 100)}% of total`} />
          <KpiCard label="Avg Win Prob"      value={`${Math.round(data.avg_win_probability)}%`}  icon={TrendingUp}    accent="bg-emerald-500/10 text-emerald-400" />
          <KpiCard label="Total Deals"       value={String(data.total_deals)}          icon={Building2}    accent="bg-slate-700/60 text-slate-400"
            sub={`${data.unscored_count} unscored`} />
          <KpiCard label="Avg Days to Close" value={`${data.avg_days_to_close}d`}      icon={Clock}        accent="bg-amber-500/10 text-amber-400" />
        </div>

        {/* ═══════════════ PIPELINE TAB ═══════════════ */}
        {tab === 'pipeline' && (
          <>
            {/* Charts row */}
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">

              {/* Stage funnel */}
              <div className="lg:col-span-3 syn-card p-6">
                <p className="text-[12px] font-semibold text-gray-700 mb-1">
                  Stage Funnel
                </p>
                <p className="text-[12px] text-gray-500 mb-4">Deal distribution across pipeline stages</p>
                {funnelData.length === 0 ? (
                  <div className="h-[360px] flex items-center justify-center">
                    <p className="text-[11px] syn-text-muted">No stage data</p>
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={360}>
                    <BarChart data={data.by_stage} margin={{ top: 0, right: 0, left: -28, bottom: 0 }}>
                      <XAxis dataKey="stage" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                      <Tooltip content={<CustomBarTip />} cursor={{ fill: 'rgba(0,0,0,0.03)' }} />
                      <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                        {data.by_stage.map((s, i) => (
                          <Cell key={i} fill={FUNNEL_COLORS[s.stage] || STAGE_COLORS[i % STAGE_COLORS.length]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
                {/* Conversion rates */}
                {data.stage_funnel && data.stage_funnel.length > 0 && (
                  <div className="flex gap-2 mt-4 flex-wrap">
                    {data.stage_funnel
                      .filter(s => s.conversion_rate !== null && s.stage !== 'Closed Lost')
                      .map(s => (
                        <span key={s.stage}
                          className="text-[11px] px-2.5 py-1 rounded-lg syn-surface-2 syn-text-tertiary">
                          {s.stage}: <span className="text-gray-700 font-semibold">{s.conversion_rate}%</span>
                        </span>
                      ))}
                  </div>
                )}
              </div>

              {/* Win prob distribution */}
              <div className="lg:col-span-2 syn-card p-6 flex flex-col">
                <p className="text-[12px] font-semibold text-gray-700 mb-1">
                  Win Probability Distribution
                </p>
                <p className="text-[12px] text-gray-500 mb-6">Deals grouped by win probability range</p>

                {/* Summary */}
                <div className="flex items-baseline gap-2 mb-8">
                  <span className="text-[32px] font-bold syn-text-primary leading-none">{totalScored}</span>
                  <span className="text-[13px] syn-text-tertiary">scored deal{totalScored !== 1 ? 's' : ''}</span>
                  {unscoredCount > 0 && (
                    <span className="ml-auto text-[11px] syn-text-muted syn-surface-2 border syn-border px-2 py-0.5 rounded-md">
                      +{unscoredCount} unscored
                    </span>
                  )}
                </div>

                {/* Bars */}
                <div className="space-y-5 flex-1">
                  {WIN_PROB_BUCKETS.map(bucket => {
                    const count = bucketMap[bucket] || 0
                    const pct = totalScored > 0 ? (count / totalScored) * 100 : 0
                    return (
                      <div key={bucket}>
                        <div className="flex items-center justify-between mb-2">
                          <span className={cn('text-[12px] font-semibold', BUCKET_TEXT_COLOR[bucket])}>
                            {bucket}
                          </span>
                          <span className="text-[12px] tabular-nums syn-text-secondary">
                            {count} deal{count !== 1 ? 's' : ''}
                            {totalScored > 0 && (
                              <span className="syn-text-muted ml-1.5">({Math.round(pct)}%)</span>
                            )}
                          </span>
                        </div>
                        <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className={cn('h-full rounded-full transition-all duration-700', BUCKET_BAR_COLOR[bucket])}
                            style={{ width: `${pct}%`, minWidth: count > 0 ? '6px' : '0' }}
                          />
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>

            {/* Bottom row */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

              {/* At risk deals */}
              <div className="syn-card overflow-hidden">
                <div className="flex items-center justify-between px-6 py-4 border-b syn-border">
                  <p className="text-[12px] font-semibold text-gray-700">At Risk Deals</p>
                  <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-red-50 text-red-600 border border-red-200">
                    {data.at_risk_count}
                  </span>
                </div>
                {data.at_risk_deals.length === 0 ? (
                  <div className="py-10 text-center">
                    <p className="text-[11px] syn-text-muted">No at-risk deals</p>
                  </div>
                ) : (
                  <div className="divide-y divide-gray-100">
                    {data.at_risk_deals.map(d => {
                      const pct = d.win_probability !== null ? Math.round(d.win_probability * 100) : null
                      return (
                        <Link key={d.id} href={`/deals/${d.id}`}
                          className="flex items-center gap-3 px-6 py-3.5 hover:bg-gray-50 transition-colors group">
                          <div className="flex-1 min-w-0">
                            <p className="text-[13px] font-medium text-gray-800 group-hover:text-gray-900 transition-colors truncate">
                              {d.name}
                            </p>
                            <p className="text-[11px] syn-text-tertiary truncate mt-0.5">{d.top_risk}</p>
                          </div>
                          <div className="text-right flex-shrink-0">
                            <p className="text-[13px] font-semibold syn-text-secondary">{fmt(d.value)}</p>
                            <p className={cn(
                              'text-[11px] font-bold',
                              pct === null ? 'syn-text-muted' : pct < 25 ? 'text-red-600' : 'text-amber-600'
                            )}>
                              {pct !== null ? `${pct}%` : 'unscored'}
                            </p>
                          </div>
                          <ChevronRight className="w-3.5 h-3.5 syn-text-muted flex-shrink-0 group-hover:syn-text-tertiary transition-colors" />
                        </Link>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* Recent activity */}
              <div className="syn-card overflow-hidden">
                <div className="px-6 py-4 border-b syn-border">
                  <p className="text-[12px] font-semibold text-gray-700">Recent Activity</p>
                </div>
                {data.recent_activity.length === 0 ? (
                  <div className="py-10 text-center">
                    <p className="text-[11px] syn-text-muted">No activity yet. Score some deals.</p>
                  </div>
                ) : (
                  <div className="divide-y divide-gray-100">
                    {data.recent_activity.map((a, i) => {
                      const pct = a.win_probability !== null ? Math.round(a.win_probability * 100) : null
                      return (
                        <div key={i} className="flex items-start gap-3 px-6 py-3.5">
                          <div className={cn(
                            'w-1.5 h-1.5 rounded-full flex-shrink-0 mt-1.5',
                            a.trigger_type === 'manual_score' ? 'bg-brand-500' : 'bg-emerald-500'
                          )} />
                          <div className="flex-1 min-w-0">
                            <p className="text-[13px] font-medium text-gray-800 truncate">{a.deal_name}</p>
                            <p className="text-[11px] syn-text-tertiary mt-0.5">
                              {fmtActivity(a.trigger_type)}
                              {a.trigger_document ? ` · ${a.trigger_document}` : ''}
                            </p>
                          </div>
                          <div className="flex-shrink-0 text-right">
                            {pct !== null && (
                              <p className={cn(
                                'text-[11px] font-bold',
                                pct >= 65 ? 'text-emerald-600' : pct >= 40 ? 'text-amber-600' : 'text-red-600'
                              )}>
                                {pct}%
                              </p>
                            )}
                            <p className="text-[11px] syn-text-muted">
                              {new Date(a.date).toLocaleDateString()}
                            </p>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
          </>
        )}

        {/* ═══════════════ SIGNALS TAB ═══════════════ */}
        {tab === 'signals' && (
          <div className="syn-card overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b syn-border">
              <div>
                <p className="text-[12px] font-semibold text-gray-700">
                  Pipeline Signal Overview
                </p>
                <p className="text-[11px] syn-text-tertiary mt-0.5">
                  Deals sorted by most concerning signals
                </p>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-red-500" />
                  <span className="text-[11px] syn-text-tertiary">Critical</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-amber-500" />
                  <span className="text-[11px] syn-text-tertiary">Warning</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-emerald-500" />
                  <span className="text-[11px] syn-text-tertiary">Positive</span>
                </div>
              </div>
            </div>
            {data.signal_overview.length === 0 ? (
              <div className="py-16 text-center">
                <Zap className="w-8 h-8 syn-text-muted mx-auto mb-3" />
                <p className="text-[12px] syn-text-tertiary">No signals detected yet.</p>
                <p className="text-[11px] syn-text-muted mt-1">Upload documents and score deals to generate signals.</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-200">
                {data.signal_overview.map(d => {
                  const pct = d.win_probability !== null ? Math.round(d.win_probability * 100) : null
                  return (
                    <Link key={d.id} href={`/deals/${d.id}`}
                      className="flex items-center gap-4 px-6 py-3.5 hover:bg-gray-50 transition-colors group">

                      {/* Deal info */}
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-medium text-gray-800 group-hover:text-gray-900 transition-colors truncate">
                          {d.name}
                        </p>
                        <p className="text-[11px] syn-text-tertiary mt-0.5">{d.company} · {d.stage}</p>
                      </div>

                      {/* Signal counts */}
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        {d.red > 0 && (
                          <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-red-50 text-red-600 border border-red-200">
                            {d.red}
                          </span>
                        )}
                        {d.yellow > 0 && (
                          <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-600 border border-amber-200">
                            {d.yellow}
                          </span>
                        )}
                        {d.green > 0 && (
                          <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-200">
                            {d.green}
                          </span>
                        )}
                      </div>

                      {/* Signal bar */}
                      <SignalBar red={d.red} yellow={d.yellow} green={d.green} />

                      {/* Value + prob */}
                      <div className="text-right flex-shrink-0 w-16">
                        <p className="text-[13px] font-semibold syn-text-secondary">{fmt(d.value)}</p>
                        <p className={cn(
                          'text-[11px] font-bold',
                          pct === null ? 'syn-text-muted' : pct >= 65 ? 'text-emerald-600' : pct >= 40 ? 'text-amber-600' : 'text-red-600'
                        )}>
                          {pct !== null ? `${pct}%` : '—'}
                        </p>
                      </div>

                      <ChevronRight className="w-3.5 h-3.5 syn-text-muted flex-shrink-0 group-hover:syn-text-tertiary transition-colors" />
                    </Link>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* ═══════════════ OWNERS TAB ═══════════════ */}
        {tab === 'owners' && (
          <div className="syn-card overflow-hidden">
            <div className="px-6 py-4 border-b syn-border">
              <p className="text-[12px] font-semibold text-gray-700">
                Performance by Owner
              </p>
            </div>
            {data.by_owner.length === 0 ? (
              <div className="py-16 text-center">
                <Users className="w-8 h-8 syn-text-muted mx-auto mb-3" />
                <p className="text-[12px] syn-text-tertiary">No deal owners assigned yet.</p>
              </div>
            ) : (
              <div>
                {/* Header row */}
                <div className="grid grid-cols-7 gap-2 px-6 py-2.5 text-[11px] font-semibold syn-text-tertiary uppercase tracking-wider border-b syn-border">
                  <div className="col-span-2">Owner</div>
                  <div className="text-right">Deals</div>
                  <div className="text-right">Pipeline</div>
                  <div className="text-right">Avg Prob</div>
                  <div className="text-right">W / L</div>
                  <div className="text-right">Win Rate</div>
                </div>
                {/* Data rows */}
                <div className="divide-y divide-gray-200">
                  {data.by_owner.map(o => (
                    <div key={o.owner} className="grid grid-cols-7 gap-2 px-6 py-3.5 items-center hover:bg-gray-50 transition-colors">
                      <div className="col-span-2 flex items-center gap-2.5 min-w-0">
                        <div className="w-7 h-7 rounded-lg bg-gray-100 border border-gray-200 flex items-center justify-center flex-shrink-0">
                          <span className="text-[11px] font-bold syn-text-secondary">
                            {o.owner.charAt(0).toUpperCase()}
                          </span>
                        </div>
                        <p className="text-[13px] font-medium text-gray-800 truncate">{o.owner}</p>
                      </div>
                      <p className="text-[13px] syn-text-secondary text-right">{o.deal_count}</p>
                      <p className="text-[13px] text-gray-700 font-semibold text-right">{fmt(o.value)}</p>
                      <p className={cn(
                        'text-[13px] font-bold text-right',
                        o.avg_prob >= 65 ? 'text-emerald-600' : o.avg_prob >= 40 ? 'text-amber-600' : 'text-red-600'
                      )}>
                        {Math.round(o.avg_prob)}%
                      </p>
                      <p className="text-[13px] syn-text-secondary text-right">
                        <span className="text-emerald-600">{o.won}</span>
                        {' / '}
                        <span className="text-red-600">{o.lost}</span>
                      </p>
                      <div className="text-right">
                        {o.win_rate !== null ? (
                          <span className={cn(
                            'text-[11px] font-bold px-2.5 py-0.5 rounded-full',
                            o.win_rate >= 60 ? 'bg-emerald-50 text-emerald-600'
                              : o.win_rate >= 40 ? 'bg-amber-50 text-amber-600'
                              : 'bg-red-50 text-red-600'
                          )}>
                            {o.win_rate}%
                          </span>
                        ) : (
                          <span className="text-[11px] syn-text-muted">—</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  )
}
