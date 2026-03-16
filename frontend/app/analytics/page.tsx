'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import {
  BarChart, Bar, Cell, XAxis, YAxis, ResponsiveContainer, Tooltip,
  PieChart, Pie, Legend,
} from 'recharts'
import {
  TrendingUp, DollarSign, AlertTriangle, Building2,
  Clock, Loader2, ChevronRight,
} from 'lucide-react'
import { analyticsApi } from '@/lib/api'

interface Summary {
  total_deals:                  number
  total_pipeline_value:         number
  weighted_pipeline_value:      number
  avg_win_probability:          number
  avg_days_to_close:            number
  at_risk_count:                number
  unscored_count:               number
  by_stage:                     Array<{ stage: string; count: number; value: number; avg_prob: number }>
  win_probability_distribution: Array<{ bucket: string; count: number }>
  at_risk_deals:                Array<{
    id: string; name: string; company: string; stage: string
    value: number; win_probability: number | null; top_risk: string
  }>
  recent_activity: Array<{
    date: string; deal_name: string; win_probability: number | null
    trigger_type: string; trigger_document: string | null
  }>
}

const STAGE_COLORS = [
  '#6366f1','#8b5cf6','#a78bfa','#60a5fa','#34d399','#fbbf24','#f87171',
]

const BUCKET_COLORS: Record<string, string> = {
  'Unscored': '#374151',
  '0–25%':    '#ef4444',
  '25–50%':   '#f59e0b',
  '50–75%':   '#6366f1',
  '75–100%':  '#22c55e',
}

function fmt(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(0)}K`
  return `$${n}`
}

function KpiCard({
  label, value, sub, icon: Icon, accent,
}: { label: string; value: string; sub?: string; icon: React.ElementType; accent: string }) {
  return (
    <div className="bg-[#0c1220] border border-white/[0.06] rounded-2xl p-5">
      <div className="flex items-start justify-between mb-3">
        <p className="text-[10px] font-semibold text-slate-600 uppercase tracking-[0.1em]">{label}</p>
        <div className={cn('w-8 h-8 rounded-xl flex items-center justify-center', accent)}>
          <Icon className="w-4 h-4" />
        </div>
      </div>
      <p className="text-[26px] font-black text-white leading-none">{value}</p>
      {sub && <p className="text-[10px] text-slate-600 mt-1.5">{sub}</p>}
    </div>
  )
}

const CustomBarTip = ({ active, payload }: any) => {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  return (
    <div className="bg-[#0c1220] border border-white/[0.08] rounded-xl px-3 py-2.5 text-[11px] shadow-xl">
      <p className="text-white font-semibold mb-1">{d.stage}</p>
      <p className="text-slate-400">{d.count} deal{d.count !== 1 ? 's' : ''}</p>
      <p className="text-indigo-300">{fmt(d.value)}</p>
      <p className="text-emerald-400">Avg: {d.avg_prob}%</p>
    </div>
  )
}

const CustomPieTip = ({ active, payload }: any) => {
  if (!active || !payload?.length) return null
  const d = payload[0]
  return (
    <div className="bg-[#0c1220] border border-white/[0.08] rounded-xl px-3 py-2 text-[11px] shadow-xl">
      <p style={{ color: d.payload.fill }} className="font-semibold">{d.name}</p>
      <p className="text-slate-400">{d.value} deal{d.value !== 1 ? 's' : ''}</p>
    </div>
  )
}

function fmtActivity(trigger: string) {
  return ({
    manual_score:       'Scored',
    document_ingested:  'Document uploaded',
  } as Record<string, string>)[trigger] ?? trigger
}

export default function AnalyticsPage() {
  const [data,    setData]    = useState<Summary | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    analyticsApi.summary()
      .then(r => setData(r.data))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return (
    <div className="flex-1 flex items-center justify-center h-screen">
      <Loader2 className="w-6 h-6 text-slate-600 animate-spin" />
    </div>
  )

  if (!data) return (
    <div className="flex-1 flex items-center justify-center h-screen">
      <p className="text-slate-600 text-[12px]">Failed to load analytics.</p>
    </div>
  )

  const pieData = data.win_probability_distribution.map(b => ({
    name:  b.bucket,
    value: b.count,
    fill:  BUCKET_COLORS[b.bucket] ?? '#6366f1',
  }))

  return (
    <div className="flex flex-col h-full">

      {/* Top bar */}
      <div className="h-[58px] border-b border-white/[0.06] px-6 flex items-center flex-shrink-0">
        <div>
          <h1 className="text-[13px] font-semibold text-white">Analytics</h1>
          <p className="text-[10px] text-slate-600">Pipeline health overview</p>
        </div>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">

        {/* KPI cards */}
        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
          <KpiCard label="Total Pipeline"    value={fmt(data.total_pipeline_value)}    icon={DollarSign}    accent="bg-indigo-500/10 text-indigo-400" />
          <KpiCard label="Weighted Pipeline" value={fmt(data.weighted_pipeline_value)} icon={TrendingUp}    accent="bg-violet-500/10 text-violet-400"
            sub={`${Math.round(data.weighted_pipeline_value / Math.max(data.total_pipeline_value, 1) * 100)}% of total`} />
          <KpiCard label="Avg Win Prob"      value={`${Math.round(data.avg_win_probability)}%`}  icon={TrendingUp}    accent="bg-emerald-500/10 text-emerald-400" />
          <KpiCard label="Total Deals"       value={String(data.total_deals)}          icon={Building2}    accent="bg-slate-700/60 text-slate-400"
            sub={`${data.unscored_count} unscored`} />
          <KpiCard label="Avg Days to Close" value={`${data.avg_days_to_close}d`}      icon={Clock}        accent="bg-amber-500/10 text-amber-400" />
        </div>

        {/* Charts row */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">

          {/* Stage bar chart */}
          <div className="lg:col-span-3 bg-[#0c1220] border border-white/[0.06] rounded-2xl p-5">
            <p className="text-[10px] font-semibold text-slate-600 uppercase tracking-[0.1em] mb-5">
              Pipeline by Stage
            </p>
            {data.by_stage.length === 0 ? (
              <div className="h-48 flex items-center justify-center">
                <p className="text-[11px] text-slate-700">No stage data</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={data.by_stage} margin={{ top: 0, right: 0, left: -28, bottom: 0 }}>
                  <XAxis dataKey="stage" tick={{ fontSize: 9, fill: '#4b5563' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 9, fill: '#4b5563' }} axisLine={false} tickLine={false} />
                  <Tooltip content={<CustomBarTip />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
                  <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                    {data.by_stage.map((_, i) => (
                      <Cell key={i} fill={STAGE_COLORS[i % STAGE_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Win prob pie */}
          <div className="lg:col-span-2 bg-[#0c1220] border border-white/[0.06] rounded-2xl p-5">
            <p className="text-[10px] font-semibold text-slate-600 uppercase tracking-[0.1em] mb-5">
              Win Probability Distribution
            </p>
            {pieData.every(d => d.value === 0) ? (
              <div className="h-48 flex items-center justify-center">
                <p className="text-[11px] text-slate-700">No data yet</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie
                    data={pieData} cx="50%" cy="45%" innerRadius={50} outerRadius={72}
                    dataKey="value" paddingAngle={2}
                  >
                    {pieData.map((d, i) => <Cell key={i} fill={d.fill} />)}
                  </Pie>
                  <Tooltip content={<CustomPieTip />} />
                  <Legend
                    iconType="circle" iconSize={7}
                    formatter={(v) => <span className="text-[10px] text-slate-500">{v}</span>}
                  />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Bottom row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

          {/* At risk deals */}
          <div className="bg-[#0c1220] border border-white/[0.06] rounded-2xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.05]">
              <p className="text-[10px] font-semibold text-slate-600 uppercase tracking-[0.1em]">At Risk Deals</p>
              <span className="text-[9px] font-semibold px-2 py-0.5 rounded-full bg-red-500/10 text-red-400 border border-red-500/20">
                {data.at_risk_count}
              </span>
            </div>
            {data.at_risk_deals.length === 0 ? (
              <div className="py-10 text-center">
                <p className="text-[11px] text-slate-700">No at-risk deals 🎉</p>
              </div>
            ) : (
              <div className="divide-y divide-white/[0.03]">
                {data.at_risk_deals.map(d => {
                  const pct = d.win_probability !== null ? Math.round(d.win_probability * 100) : null
                  return (
                    <Link key={d.id} href={`/deals/${d.id}`}
                      className="flex items-center gap-3 px-5 py-3 hover:bg-white/[0.02] transition-colors group">
                      <div className="flex-1 min-w-0">
                        <p className="text-[12px] font-medium text-slate-200 group-hover:text-white transition-colors truncate">
                          {d.name}
                        </p>
                        <p className="text-[10px] text-slate-600 truncate mt-0.5">{d.top_risk}</p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-[12px] font-semibold text-slate-400">{fmt(d.value)}</p>
                        <p className={cn(
                          'text-[10px] font-bold',
                          pct === null ? 'text-slate-600' : pct < 25 ? 'text-red-400' : 'text-amber-400'
                        )}>
                          {pct !== null ? `${pct}%` : 'unscored'}
                        </p>
                      </div>
                      <ChevronRight className="w-3.5 h-3.5 text-slate-700 flex-shrink-0 group-hover:text-slate-500 transition-colors" />
                    </Link>
                  )
                })}
              </div>
            )}
          </div>

          {/* Recent activity */}
          <div className="bg-[#0c1220] border border-white/[0.06] rounded-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-white/[0.05]">
              <p className="text-[10px] font-semibold text-slate-600 uppercase tracking-[0.1em]">Recent Activity</p>
            </div>
            {data.recent_activity.length === 0 ? (
              <div className="py-10 text-center">
                <p className="text-[11px] text-slate-700">No activity yet. Score some deals.</p>
              </div>
            ) : (
              <div className="divide-y divide-white/[0.03]">
                {data.recent_activity.map((a, i) => {
                  const pct = a.win_probability !== null ? Math.round(a.win_probability * 100) : null
                  return (
                    <div key={i} className="flex items-start gap-3 px-5 py-3">
                      <div className={cn(
                        'w-1.5 h-1.5 rounded-full flex-shrink-0 mt-1.5',
                        a.trigger_type === 'manual_score' ? 'bg-indigo-500' : 'bg-emerald-500'
                      )} />
                      <div className="flex-1 min-w-0">
                        <p className="text-[12px] font-medium text-slate-200 truncate">{a.deal_name}</p>
                        <p className="text-[10px] text-slate-600 mt-0.5">
                          {fmtActivity(a.trigger_type)}
                          {a.trigger_document ? ` · ${a.trigger_document}` : ''}
                        </p>
                      </div>
                      <div className="flex-shrink-0 text-right">
                        {pct !== null && (
                          <p className={cn(
                            'text-[11px] font-bold',
                            pct >= 65 ? 'text-emerald-400' : pct >= 40 ? 'text-amber-400' : 'text-red-400'
                          )}>
                            {pct}%
                          </p>
                        )}
                        <p className="text-[9px] text-slate-700">
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
      </div>
    </div>
  )
}
