'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { nexusApi } from '@/lib/api'
import {
  Dna, Loader2, ArrowLeft, TrendingUp, TrendingDown,
  ArrowUpRight, ArrowDownRight,
} from 'lucide-react'

interface Factor {
  factor_name: string
  display_name: string
  direction: string
  magnitude: number
  plain_text: string
}

interface WinDNA {
  org_id: string
  model_version: number
  n_training_samples: number
  cv_auc: number
  top_win_factors: Factor[]
  top_loss_factors: Factor[]
  narrative: string
  trained_at: string | null
  ready: boolean
}

function FactorBar({ factor, maxMag, type }: { factor: Factor; maxMag: number; type: 'win' | 'loss' }) {
  const pct = maxMag > 0 ? (factor.magnitude / maxMag) * 100 : 0
  const isWin = type === 'win'
  return (
    <div className="group">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[12px] font-medium syn-text-primary">{factor.display_name}</span>
        <span className={cn('text-[11px] font-semibold tabular-nums',
          isWin ? 'text-emerald-600' : 'text-red-600')}>
          {(factor.magnitude * 100).toFixed(1)}
        </span>
      </div>
      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
        <div
          className={cn('h-full rounded-full transition-all duration-700',
            isWin ? 'bg-emerald-500' : 'bg-red-500')}
          style={{ width: `${Math.max(pct, 4)}%` }}
        />
      </div>
      <p className="text-[11px] syn-text-muted mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
        {factor.plain_text}
      </p>
    </div>
  )
}

export default function WinDnaPage() {
  const [data, setData] = useState<WinDNA | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    nexusApi.winDna()
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
    <div className="flex-1 flex flex-col items-center justify-center h-screen syn-bg gap-3">
      <Dna className="w-10 h-10 syn-text-muted" />
      <p className="syn-text-muted text-[13px]">No Win DNA available yet.</p>
      <Link href="/nexus" className="text-[12px] text-indigo-600 hover:underline">
        Go to NEXUS to train a model
      </Link>
    </div>
  )

  const maxWinMag = Math.max(...data.top_win_factors.map(f => f.magnitude), 0.001)
  const maxLossMag = Math.max(...data.top_loss_factors.map(f => f.magnitude), 0.001)

  return (
    <div className="flex flex-col h-full syn-bg">
      {/* Header */}
      <div className="h-16 border-b syn-border px-6 flex items-center gap-3 flex-shrink-0">
        <Link href="/nexus" className="text-gray-400 hover:text-gray-600 transition-colors">
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <div className="w-9 h-9 rounded-lg bg-emerald-500/10 flex items-center justify-center">
          <Dna className="w-5 h-5 text-emerald-500" />
        </div>
        <div>
          <h1 className="text-[18px] font-semibold syn-text-primary">Win DNA</h1>
          <p className="text-[12px] text-gray-500">
            Model v{data.model_version} · {data.n_training_samples} deals · AUC {(data.cv_auc * 100).toFixed(1)}%
          </p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto syn-scroll p-6 space-y-6">

        {/* Narrative Card */}
        <div className="syn-card p-6 border-l-4 border-l-emerald-500">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center flex-shrink-0 mt-0.5">
              <Dna className="w-4 h-4 text-emerald-500" />
            </div>
            <div>
              <p className="text-[11px] font-semibold syn-text-tertiary uppercase tracking-wider mb-2">AI-Generated Win DNA Narrative</p>
              <p className="text-[14px] syn-text-primary leading-relaxed">{data.narrative}</p>
            </div>
          </div>
        </div>

        {/* Factors Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          {/* Win Factors */}
          <div className="syn-card p-6">
            <div className="flex items-center gap-2 mb-5">
              <div className="w-7 h-7 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                <TrendingUp className="w-4 h-4 text-emerald-500" />
              </div>
              <div>
                <p className="text-[13px] font-semibold syn-text-primary">Win Factors</p>
                <p className="text-[11px] syn-text-muted">Patterns that predict deal wins</p>
              </div>
            </div>
            <div className="space-y-4">
              {data.top_win_factors.slice(0, 8).map((f, i) => (
                <FactorBar key={i} factor={f} maxMag={maxWinMag} type="win" />
              ))}
              {data.top_win_factors.length === 0 && (
                <p className="text-[12px] syn-text-muted py-4 text-center">No win factors identified</p>
              )}
            </div>
          </div>

          {/* Loss Factors */}
          <div className="syn-card p-6">
            <div className="flex items-center gap-2 mb-5">
              <div className="w-7 h-7 rounded-lg bg-red-500/10 flex items-center justify-center">
                <TrendingDown className="w-4 h-4 text-red-500" />
              </div>
              <div>
                <p className="text-[13px] font-semibold syn-text-primary">Loss Factors</p>
                <p className="text-[11px] syn-text-muted">Patterns that predict deal losses</p>
              </div>
            </div>
            <div className="space-y-4">
              {data.top_loss_factors.slice(0, 8).map((f, i) => (
                <FactorBar key={i} factor={f} maxMag={maxLossMag} type="loss" />
              ))}
              {data.top_loss_factors.length === 0 && (
                <p className="text-[12px] syn-text-muted py-4 text-center">No loss factors identified</p>
              )}
            </div>
          </div>
        </div>

        {/* Model Stats */}
        <div className="syn-card p-6">
          <p className="text-[13px] font-semibold syn-text-primary mb-4">Model Performance</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-gray-50 rounded-lg p-3">
              <p className="text-[11px] syn-text-tertiary uppercase tracking-wider mb-1">AUC Score</p>
              <p className="text-[22px] font-bold text-emerald-600">{(data.cv_auc * 100).toFixed(1)}%</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-3">
              <p className="text-[11px] syn-text-tertiary uppercase tracking-wider mb-1">Training Data</p>
              <p className="text-[22px] font-bold syn-text-primary">{data.n_training_samples}</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-3">
              <p className="text-[11px] syn-text-tertiary uppercase tracking-wider mb-1">Model Version</p>
              <p className="text-[22px] font-bold syn-text-primary">v{data.model_version}</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-3">
              <p className="text-[11px] syn-text-tertiary uppercase tracking-wider mb-1">Trained</p>
              <p className="text-[14px] font-bold syn-text-primary mt-1">
                {data.trained_at ? new Date(data.trained_at).toLocaleDateString() : '—'}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
