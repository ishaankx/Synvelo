'use client'
import {
  AreaChart, Area, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts'

export interface HistoryPoint {
  scored_at:        string
  win_probability:  number | null
  probability_low:  number | null
  probability_high: number | null
  sentiment_avg:    number | null
  trigger_type:     string
  trigger_document: string | null
}

function fmt(iso: string) {
  try {
    const d = new Date(iso)
    return `${d.toLocaleString('default', { month: 'short' })} ${d.getDate()}`
  } catch {
    return iso.slice(0, 10)
  }
}

const CustomTip = ({ active, payload }: any) => {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  return (
    <div className="bg-[#0c1220] border border-white/[0.08] rounded-xl px-3 py-2.5 text-[11px] shadow-xl">
      <p className="text-slate-500 mb-1.5">{d.label}</p>
      {d.prob !== null && (
        <p className="text-indigo-300 font-semibold">Win Prob: {d.prob}%</p>
      )}
      {d.low !== null && (
        <p className="text-slate-600">
          CI: {Math.round((d.low || 0) * 100)}% – {Math.round((d.high || 0) * 100)}%
        </p>
      )}
      {d.sent !== null && d.sent !== undefined && (
        <p className={d.sent >= 0 ? 'text-emerald-400' : 'text-red-400'}>
          Sentiment: {d.sent > 0 ? '+' : ''}{Number(d.sent).toFixed(2)}
        </p>
      )}
      {d.doc && (
        <p className="text-slate-700 mt-1 max-w-[160px] truncate">📄 {d.doc}</p>
      )}
    </div>
  )
}

export default function DealHealthTimeline({ history }: { history: HistoryPoint[] }) {
  if (!history?.length) {
    return (
      <div className="h-28 flex items-center justify-center">
        <p className="text-[11px] text-slate-700 text-center">
          Score the deal at least once to see the health timeline.
        </p>
      </div>
    )
  }

  const data = history.map(h => ({
    label: fmt(h.scored_at),
    prob:  h.win_probability !== null ? Math.round((h.win_probability || 0) * 100) : null,
    low:   h.probability_low,
    high:  h.probability_high,
    sent:  h.sentiment_avg !== null ? Number(Number(h.sentiment_avg).toFixed(2)) : null,
    doc:   h.trigger_document,
  }))

  const hasSentiment = data.some(d => d.sent !== null)

  return (
    <div className="space-y-6">
      {/* Win Probability */}
      <div>
        <p className="text-[9px] font-semibold text-slate-700 uppercase tracking-[0.1em] mb-3">
          Win Probability Over Time
        </p>
        <ResponsiveContainer width="100%" height={140}>
          <AreaChart data={data} margin={{ top: 4, right: 4, left: -28, bottom: 0 }}>
            <defs>
              <linearGradient id="probGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="#6366f1" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="2 4" stroke="#111827" />
            <XAxis dataKey="label" tick={{ fontSize: 9, fill: '#475569' }} axisLine={false} tickLine={false} />
            <YAxis domain={[0, 100]} tick={{ fontSize: 9, fill: '#475569' }} axisLine={false} tickLine={false} tickFormatter={v => `${v}%`} />
            <Tooltip content={<CustomTip />} />
            <ReferenceLine y={50} stroke="#1f2937" strokeDasharray="3 3" />
            <Area
              type="monotone" dataKey="prob"
              stroke="#6366f1" strokeWidth={2}
              fill="url(#probGrad)"
              dot={{ fill: '#6366f1', r: 3, strokeWidth: 0 }}
              activeDot={{ r: 4, fill: '#6366f1' }}
              connectNulls={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Buyer Sentiment */}
      {hasSentiment && (
        <div>
          <p className="text-[9px] font-semibold text-slate-700 uppercase tracking-[0.1em] mb-3">
            Buyer Sentiment Trend
          </p>
          <ResponsiveContainer width="100%" height={110}>
            <AreaChart data={data} margin={{ top: 4, right: 4, left: -28, bottom: 0 }}>
              <defs>
                <linearGradient id="sentGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#10b981" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="2 4" stroke="#111827" />
              <XAxis dataKey="label" tick={{ fontSize: 9, fill: '#475569' }} axisLine={false} tickLine={false} />
              <YAxis domain={[-1, 1]} tick={{ fontSize: 9, fill: '#475569' }} axisLine={false} tickLine={false} />
              <Tooltip content={<CustomTip />} />
              <ReferenceLine y={0} stroke="#1f2937" strokeDasharray="3 3" />
              <Area
                type="monotone" dataKey="sent"
                stroke="#10b981" strokeWidth={2}
                fill="url(#sentGrad)"
                dot={{ fill: '#10b981', r: 3, strokeWidth: 0 }}
                activeDot={{ r: 4 }}
                connectNulls={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}
