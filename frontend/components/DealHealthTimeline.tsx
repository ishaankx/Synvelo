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
    <div className="bg-white border border-gray-200 shadow-lg rounded-lg px-3 py-2.5">
      <p className="text-[11px] text-gray-500 mb-1">{d.label}</p>
      {d.prob !== null && (
        <p className="text-[13px] text-brand-600 font-semibold">Win Prob: {d.prob}%</p>
      )}
      {d.low !== null && (
        <p className="text-[11px] text-gray-500">
          CI: {Math.round((d.low || 0) * 100)}% – {Math.round((d.high || 0) * 100)}%
        </p>
      )}
      {d.sent !== null && d.sent !== undefined && (
        <p className={`text-[11px] ${d.sent >= 0 ? 'text-positive' : 'text-negative'}`}>
          Sentiment: {d.sent > 0 ? '+' : ''}{Number(d.sent).toFixed(2)}
        </p>
      )}
      {d.doc && (
        <p className="text-[11px] text-gray-400 mt-1 max-w-[180px] truncate">
          {d.doc}
        </p>
      )}
    </div>
  )
}

export default function DealHealthTimeline({ history }: { history: HistoryPoint[] }) {
  if (!history?.length) {
    return (
      <div className="syn-card p-6 flex flex-col items-center justify-center">
        <p className="text-[12px] text-gray-500 text-center">
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

  // Determine trend for color encoding
  const probValues = data.filter(d => d.prob !== null).map(d => d.prob!)
  const trend = probValues.length >= 2
    ? probValues[probValues.length - 1] - probValues[0]
    : 0
  const trendColor = trend > 0 ? '#22c55e' : trend < 0 ? '#ef4444' : '#6366f1'

  return (
    <div className="space-y-5">
      {/* Win Probability */}
      <div className="syn-card p-4">
        <div className="flex items-center justify-between mb-4">
          <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
            Win Probability Over Time
          </p>
          {probValues.length >= 2 && (
            <span className={`text-[11px] font-semibold ${trend > 0 ? 'text-positive' : trend < 0 ? 'text-negative' : 'text-gray-500'}`}>
              {trend > 0 ? '+' : ''}{trend}pp
            </span>
          )}
        </div>
        <ResponsiveContainer width="100%" height={240}>
          <AreaChart data={data} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="probGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor={trendColor} stopOpacity={0.2} />
                <stop offset="95%" stopColor={trendColor} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="2 4" stroke="rgba(0,0,0,0.06)" vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 11, fill: '#64748b', fontWeight: 500 }}
              axisLine={false} tickLine={false}
            />
            <YAxis
              domain={[0, 100]}
              tick={{ fontSize: 11, fill: '#64748b', fontWeight: 500 }}
              axisLine={false} tickLine={false}
              tickFormatter={v => `${v}%`}
            />
            <Tooltip content={<CustomTip />} />
            <ReferenceLine y={50} stroke="rgba(0,0,0,0.08)" strokeDasharray="4 4" />
            <Area
              type="monotone" dataKey="prob"
              stroke={trendColor} strokeWidth={2}
              fill="url(#probGrad)"
              dot={{ fill: trendColor, r: 4, strokeWidth: 2, stroke: 'var(--syn-surface-1)' }}
              activeDot={{ r: 5, fill: trendColor, stroke: 'var(--syn-surface-1)', strokeWidth: 2 }}
              connectNulls={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Buyer Sentiment */}
      {hasSentiment && (
        <div className="syn-card p-4">
          <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-4">
            Buyer Sentiment Trend
          </p>
          <ResponsiveContainer width="100%" height={180}>
            <AreaChart data={data} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="sentGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#22c55e" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="2 4" stroke="rgba(0,0,0,0.06)" vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11, fill: '#64748b', fontWeight: 500 }}
                axisLine={false} tickLine={false}
              />
              <YAxis
                domain={[-1, 1]}
                tick={{ fontSize: 11, fill: '#64748b', fontWeight: 500 }}
                axisLine={false} tickLine={false}
              />
              <Tooltip content={<CustomTip />} />
              <ReferenceLine y={0} stroke="rgba(0,0,0,0.08)" strokeDasharray="4 4" />
              <Area
                type="monotone" dataKey="sent"
                stroke="#22c55e" strokeWidth={2}
                fill="url(#sentGrad)"
                dot={{ fill: '#22c55e', r: 3, strokeWidth: 2, stroke: 'var(--syn-surface-1)' }}
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
