'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { dealsApi, nexusApi } from '@/lib/api'
import {
  FlaskConical, Loader2, ArrowLeft, ChevronRight,
  TrendingUp, DollarSign, Zap, CheckCircle2, Shield,
} from 'lucide-react'

interface Deal {
  id: string; name: string; company: string; stage: string; value: number
  win_probability: number | null
}

interface Scenario {
  scenario_id: string; action_type: string; action_params: Record<string, any>
  win_prob: number; margin_pct: number; expected_value: number
  net_revenue_delta: number; rank: number; plain_text: string
}

interface SimResult {
  simulation_id: string; deal_id: string
  baseline_win_prob: number; baseline_expected_value: number
  recommended_action_type: string; recommended_action_params: Record<string, any>
  recommended_win_prob_new: number; recommended_ev_new: number
  recommended_net_rev_delta: number; recommended_reasoning: string
  top_scenarios: Scenario[]
  erp_validated: boolean; erp_flags: string[]
  model_version: number; run_duration_ms: number
}

function fmt(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`
  return `$${n.toFixed(0)}`
}

export default function SimulatePage() {
  const [deals, setDeals] = useState<Deal[]>([])
  const [selectedDeal, setSelectedDeal] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [simulating, setSimulating] = useState(false)
  const [result, setResult] = useState<SimResult | null>(null)

  useEffect(() => {
    dealsApi.list().then(r => {
      setDeals(r.data)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  const handleSimulate = async () => {
    if (!selectedDeal) return
    setSimulating(true)
    setResult(null)
    try {
      const r = await nexusApi.simulate(selectedDeal)
      setResult(r.data)
    } catch (e: any) {
      alert(e.response?.data?.detail || 'Simulation failed. Make sure a model is trained.')
    }
    setSimulating(false)
  }

  if (loading) return (
    <div className="flex-1 flex items-center justify-center h-screen syn-bg">
      <Loader2 className="w-6 h-6 syn-text-muted animate-spin" />
    </div>
  )

  return (
    <div className="flex flex-col h-full syn-bg">
      {/* Header */}
      <div className="h-16 border-b syn-border px-6 flex items-center gap-3 flex-shrink-0">
        <Link href="/nexus" className="text-gray-400 hover:text-gray-600 transition-colors">
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <div className="w-9 h-9 rounded-lg bg-violet-500/10 flex items-center justify-center">
          <FlaskConical className="w-5 h-5 text-violet-500" />
        </div>
        <div>
          <h1 className="text-[18px] font-semibold syn-text-primary">Scenario Simulator</h1>
          <p className="text-[12px] text-gray-500">Run ML-powered what-if scenarios on live deals</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto syn-scroll p-6 space-y-6">

        {/* Deal Selector */}
        <div className="syn-card p-6">
          <p className="text-[13px] font-semibold syn-text-primary mb-3">Select a Deal</p>
          <div className="flex gap-3">
            <select value={selectedDeal} onChange={e => setSelectedDeal(e.target.value)}
              className="flex-1 px-3 py-2.5 border syn-border rounded-lg text-[13px] syn-text-primary bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20">
              <option value="">Choose a deal…</option>
              {deals.map(d => (
                <option key={d.id} value={d.id}>
                  {d.name} — {d.company} ({d.stage}) · {fmt(d.value)}
                </option>
              ))}
            </select>
            <button onClick={handleSimulate} disabled={!selectedDeal || simulating}
              className="flex items-center gap-2 px-5 py-2.5 text-[12px] font-medium rounded-lg
                         bg-violet-600 text-white hover:bg-violet-700 transition-all disabled:opacity-50">
              {simulating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FlaskConical className="w-3.5 h-3.5" />}
              {simulating ? 'Simulating…' : 'Run Simulation'}
            </button>
          </div>
        </div>

        {/* Results */}
        {result && (
          <>
            {/* Recommendation Banner */}
            <div className="syn-card p-6 border-l-4 border-l-violet-500">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-violet-500/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <Zap className="w-4 h-4 text-violet-500" />
                </div>
                <div className="flex-1">
                  <p className="text-[11px] font-semibold syn-text-tertiary uppercase tracking-wider mb-1">Recommended Action</p>
                  <p className="text-[14px] syn-text-primary leading-relaxed">{result.recommended_reasoning}</p>
                </div>
                {result.erp_validated && (
                  <span className="flex items-center gap-1 text-[11px] font-semibold text-emerald-600 bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 rounded-full flex-shrink-0">
                    <Shield className="w-3 h-3" /> ERP Validated
                  </span>
                )}
              </div>
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="syn-card p-5 border-l-4 border-l-gray-300">
                <p className="text-[11px] syn-text-tertiary uppercase tracking-wider mb-1">Baseline Win %</p>
                <p className="text-[24px] font-bold syn-text-primary">{(result.baseline_win_prob * 100).toFixed(0)}%</p>
              </div>
              <div className="syn-card p-5 border-l-4 border-l-violet-500">
                <p className="text-[11px] syn-text-tertiary uppercase tracking-wider mb-1">New Win %</p>
                <p className="text-[24px] font-bold text-violet-600">{(result.recommended_win_prob_new * 100).toFixed(0)}%</p>
                <p className="text-[11px] text-emerald-600 font-semibold">
                  +{((result.recommended_win_prob_new - result.baseline_win_prob) * 100).toFixed(1)} pts
                </p>
              </div>
              <div className="syn-card p-5 border-l-4 border-l-emerald-500">
                <p className="text-[11px] syn-text-tertiary uppercase tracking-wider mb-1">Expected Value</p>
                <p className="text-[24px] font-bold text-emerald-600">{fmt(result.recommended_ev_new)}</p>
              </div>
              <div className="syn-card p-5 border-l-4 border-l-amber-500">
                <p className="text-[11px] syn-text-tertiary uppercase tracking-wider mb-1">Net Revenue Delta</p>
                <p className={cn('text-[24px] font-bold',
                  result.recommended_net_rev_delta >= 0 ? 'text-emerald-600' : 'text-red-600')}>
                  {result.recommended_net_rev_delta >= 0 ? '+' : ''}{fmt(result.recommended_net_rev_delta)}
                </p>
              </div>
            </div>

            {/* Scenario Table */}
            <div className="syn-card overflow-hidden">
              <div className="px-6 py-4 border-b syn-border flex items-center justify-between">
                <div>
                  <p className="text-[13px] font-semibold syn-text-primary">Top Scenarios</p>
                  <p className="text-[11px] syn-text-muted">Ranked by expected net revenue impact</p>
                </div>
                <span className="text-[11px] syn-text-muted">
                  {result.run_duration_ms}ms · model v{result.model_version}
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="text-[11px] font-semibold syn-text-tertiary uppercase tracking-wider border-b syn-border">
                      <th className="px-6 py-3 text-left">#</th>
                      <th className="px-4 py-3 text-left">Action</th>
                      <th className="px-4 py-3 text-right">Win %</th>
                      <th className="px-4 py-3 text-right">Margin</th>
                      <th className="px-4 py-3 text-right">Exp. Value</th>
                      <th className="px-4 py-3 text-right">Net Delta</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {result.top_scenarios.slice(0, 15).map((s, i) => (
                      <tr key={s.scenario_id}
                        className={cn('hover:bg-gray-50 transition-colors',
                          i === 0 && 'bg-violet-50/50')}>
                        <td className="px-6 py-3 text-[12px] syn-text-muted">{s.rank}</td>
                        <td className="px-4 py-3">
                          <p className="text-[12px] font-medium syn-text-primary">{s.plain_text}</p>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className={cn('text-[12px] font-semibold',
                            s.win_prob > result.baseline_win_prob ? 'text-emerald-600' : 'syn-text-secondary')}>
                            {(s.win_prob * 100).toFixed(0)}%
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right text-[12px] syn-text-secondary">
                          {(s.margin_pct * 100).toFixed(1)}%
                        </td>
                        <td className="px-4 py-3 text-right text-[12px] font-semibold syn-text-primary">
                          {fmt(s.expected_value)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className={cn('text-[12px] font-bold',
                            s.net_revenue_delta >= 0 ? 'text-emerald-600' : 'text-red-600')}>
                            {s.net_revenue_delta >= 0 ? '+' : ''}{fmt(s.net_revenue_delta)}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Generate Artifacts CTA */}
            <div className="syn-card p-6 flex items-center justify-between">
              <div>
                <p className="text-[13px] font-semibold syn-text-primary">Generate Execution Artifacts</p>
                <p className="text-[12px] syn-text-muted">
                  Create proposals, ROI calculators, battle cards, and emails from this simulation
                </p>
              </div>
              <Link href={`/nexus/artifacts?sim=${result.simulation_id}&deal=${result.deal_id}`}
                className="flex items-center gap-2 px-4 py-2.5 text-[12px] font-medium rounded-lg
                           bg-amber-500 text-white hover:bg-amber-600 transition-all">
                Generate Artifacts <ChevronRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
