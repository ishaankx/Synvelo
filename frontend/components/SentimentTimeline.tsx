'use client'
import { useEffect, useState } from 'react'
import {
  AreaChart, Area, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts'
import { Loader2, FileText } from 'lucide-react'
import { cn } from '@/lib/utils'
import { dealsApi } from '@/lib/api'

export interface SentimentPoint {
  id:              string
  filename:        string
  source_type:     string
  sentiment_score: number
  sentiment_label: string
  created_at:      string
}

function fmtDate(iso: string) {
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
      <p className={cn(
        'text-[13px] font-semibold',
        d.score >= 0.1 ? 'text-positive' : d.score <= -0.1 ? 'text-negative' : 'text-gray-500'
      )}>
        Sentiment: {d.score > 0 ? '+' : ''}{d.score.toFixed(2)}
      </p>
      <p className={cn(
        'text-[11px] font-semibold uppercase tracking-wider mt-0.5',
        d.sentLabel === 'positive' ? 'text-positive'
          : d.sentLabel === 'negative' ? 'text-negative'
          : 'text-gray-500'
      )}>
        {d.sentLabel}
      </p>
      <div className="flex items-center gap-1.5 mt-2 pt-1.5 border-t syn-border">
        <FileText className="w-3 h-3 text-gray-400 flex-shrink-0" />
        <p className="text-[11px] text-gray-500 truncate max-w-[160px]">{d.filename}</p>
      </div>
    </div>
  )
}

export default function SentimentTimeline({ dealId }: { dealId: string }) {
  const [data,    setData]    = useState<SentimentPoint[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!dealId) return
    dealsApi.sentimentTimeline(dealId)
      .then(r => setData(r.data || []))
      .catch(() => setData([]))
      .finally(() => setLoading(false))
  }, [dealId])

  if (loading) {
    return (
      <div className="syn-card p-6 flex items-center justify-center">
        <Loader2 className="w-4 h-4 text-gray-400 animate-spin" />
      </div>
    )
  }

  if (!data.length) {
    return (
      <div className="syn-card p-6 flex flex-col items-center justify-center">
        <p className="text-[12px] text-gray-500 text-center">
          Upload documents to see sentiment trend over time.
        </p>
      </div>
    )
  }

  const chartData = data.map(d => ({
    label:     fmtDate(d.created_at),
    score:     Number(d.sentiment_score.toFixed(2)),
    sentLabel: d.sentiment_label,
    filename:  d.filename,
  }))

  // Running average line
  let runAvg = 0
  const withAvg = chartData.map((d, i) => {
    runAvg = (runAvg * i + d.score) / (i + 1)
    return { ...d, avg: Number(runAvg.toFixed(2)) }
  })

  return (
    <div className="syn-card p-4">
      <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-4">
        Document Sentiment Over Time
      </p>
      <ResponsiveContainer width="100%" height={240}>
        <AreaChart data={withAvg} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
          <defs>
            <linearGradient id="docSentGradPos" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor="#a78bfa" stopOpacity={0.2} />
              <stop offset="95%" stopColor="#a78bfa" stopOpacity={0} />
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
          <ReferenceLine y={0} stroke="rgba(0,0,0,0.08)" strokeDasharray="4 4" label={{
            value: 'Neutral',
            position: 'right',
            fill: '#9CA3AF',
            fontSize: 11,
          }} />
          <Area
            type="monotone" dataKey="score"
            stroke="#a78bfa" strokeWidth={2}
            fill="url(#docSentGradPos)"
            dot={(props: any) => {
              const { cx, cy, payload } = props
              const color = payload.score >= 0.1 ? '#22c55e' : payload.score <= -0.1 ? '#ef4444' : '#64748b'
              return (
                <circle
                  cx={cx} cy={cy} r={4.5}
                  fill={color}
                  stroke="var(--syn-surface-1)" strokeWidth={2}
                />
              )
            }}
            activeDot={{ r: 6, fill: '#a78bfa', stroke: 'var(--syn-surface-1)', strokeWidth: 2 }}
          />
          <Area
            type="monotone" dataKey="avg"
            stroke="#9CA3AF" strokeWidth={1} strokeDasharray="4 4"
            fill="none" dot={false}
          />
        </AreaChart>
      </ResponsiveContainer>
      <div className="flex items-center gap-4 mt-3 pt-2 border-t syn-border">
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-positive" />
          <span className="text-[11px] text-gray-500">Positive</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-negative" />
          <span className="text-[11px] text-gray-500">Negative</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="inline-block w-4 border-t border-dashed border-gray-300" />
          <span className="text-[11px] text-gray-500">Running avg</span>
        </div>
      </div>
    </div>
  )
}
