'use client'

import { useState, useEffect, useMemo } from 'react'
import { reportsApi } from '@/lib/api'
import { cn } from '@/lib/utils'
import {
  Loader2, FileText, Download, RefreshCw, Clock, ChevronDown,
  ChevronRight, TrendingUp, TrendingDown, AlertTriangle,
  CheckCircle2, XCircle, Zap, ArrowRight,
} from 'lucide-react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine,
} from 'recharts'

interface JourneyReport {
  report_id: string
  deal_id: string
  deal_name?: string
  company?: string
  stage?: string
  filename: string
  page_count: number
  report_json: JourneyReportData | null
  created_at: string
}

interface StageBreakdown {
  stage: string
  time_spent_days: number | null
  criteria_total: number
  criteria_completed: number
  criteria_skipped: string[]
  key_events: string[]
  win_prob_at_entry: number | null
  win_prob_at_exit: number | null
  movement_direction: 'forward' | 'backward' | 'skip'
  analysis: string
}

interface CriticalMoment {
  date: string
  event: string
  category: string
  significance: 'high' | 'medium' | 'low'
  analysis: string
}

interface NextAction {
  action: string
  priority: 'high' | 'medium' | 'low'
  rationale: string
}

interface DocTrail {
  filename: string
  uploaded_at: string
  stage_at_upload: string | null
  signal: string
}

interface HealthScore {
  date: string
  score: number
  components: string
}

interface JourneyReportData {
  executive_journey_summary: string
  stage_breakdown: StageBreakdown[]
  critical_moments: CriticalMoment[]
  win_probability_analysis: string
  document_evidence_trail: DocTrail[]
  field_change_analysis: string
  ai_tool_utilization: string
  what_went_well: string[]
  what_went_wrong: string[]
  recommendations_for_future: string[]
  next_best_actions: NextAction[]
  deal_health_scores: HealthScore[]
  _aggregated_data?: {
    win_probability_timeline: { scored_at: string; win_probability: number }[]
    stage_history: { to_stage: string; changed_at: string; days_in_stage: number | null }[]
    stage_benchmarks: Record<string, Record<string, { avg_days: number; sample_size: number }>>
  }
}

const SIG_COLORS = {
  high: { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200', dot: 'bg-red-500' },
  medium: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200', dot: 'bg-amber-500' },
  low: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', dot: 'bg-emerald-500' },
}

const PRI_COLORS = {
  high: 'text-red-600',
  medium: 'text-amber-600',
  low: 'text-emerald-600',
}

function Section({ title, children, icon: Icon }: {
  title: string; children: React.ReactNode; icon?: React.ElementType
}) {
  return (
    <div className="syn-card p-5 space-y-3">
      <div className="flex items-center gap-2">
        {Icon && <Icon className="w-4 h-4 text-brand-600" />}
        <h3 className="text-[13px] font-semibold syn-text-primary">{title}</h3>
      </div>
      {children}
    </div>
  )
}

function CollapsibleSection({ title, children, icon: Icon, defaultOpen = false }: {
  title: string; children: React.ReactNode; icon?: React.ElementType; defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="syn-card overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 p-4 hover:bg-gray-50 transition-colors text-left"
      >
        {Icon && <Icon className="w-4 h-4 text-brand-600 flex-shrink-0" />}
        <h3 className="text-[13px] font-semibold syn-text-primary flex-1">{title}</h3>
        <ChevronDown className={cn('w-4 h-4 syn-text-muted transition-transform', open && 'rotate-180')} />
      </button>
      {open && <div className="px-5 pb-5 space-y-3 border-t syn-border pt-3">{children}</div>}
    </div>
  )
}

export default function JourneyReportPanel({ dealId }: { dealId: string }) {
  const [report, setReport] = useState<JourneyReport | null>(null)
  const [reportData, setReportData] = useState<JourneyReportData | null>(null)
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchLatest = async () => {
    try {
      setLoading(true)
      const { data: list } = await reportsApi.listJourney(dealId)
      if (list.length > 0) {
        const latest = list[0]
        const { data: full } = await reportsApi.viewJourney(latest.report_id)
        setReport(full)
        setReportData(full.report_json || null)
      }
    } catch {
      // No reports yet — OK
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchLatest() }, [dealId])

  const handleGenerate = async () => {
    try {
      setGenerating(true)
      setError(null)
      await reportsApi.generateJourney(dealId)
      await fetchLatest()
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Generation failed'
      setError(msg)
    } finally {
      setGenerating(false)
    }
  }

  const handleDownload = async () => {
    if (!report) return
    try {
      const { data: blob } = await reportsApi.download(report.report_id)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `Synvelo_Journey_${report.deal_name || 'Report'}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      setError('Download failed')
    }
  }

  // Win probability chart data
  const chartData = useMemo(() => {
    const timeline = reportData?._aggregated_data?.win_probability_timeline || []
    return timeline.map((p, i) => ({
      idx: i + 1,
      date: p.scored_at ? new Date(p.scored_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : `#${i + 1}`,
      probability: p.win_probability != null ? Math.round(p.win_probability * 100) : null,
    })).filter(d => d.probability !== null)
  }, [reportData])

  // Health scores chart data
  const healthData = useMemo(() => {
    return (reportData?.deal_health_scores || []).map((h, i) => ({
      idx: i + 1,
      date: h.date ? new Date(h.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : `#${i + 1}`,
      score: h.score,
    }))
  }, [reportData])

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center p-10">
        <Loader2 className="w-5 h-5 animate-spin syn-text-muted" />
      </div>
    )
  }

  // No report yet — show generate CTA
  if (!reportData) {
    return (
      <div className="flex-1 overflow-y-auto syn-scroll p-5">
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-14 h-14 rounded-2xl syn-surface-2 border syn-border flex items-center justify-center mb-4">
            <FileText className="w-6 h-6 syn-text-muted" />
          </div>
          <h3 className="text-[14px] font-semibold syn-text-primary mb-1">No Journey Report Yet</h3>
          <p className="text-[12px] syn-text-tertiary max-w-sm mb-5">
            Generate a comprehensive chronological analysis of this deal&apos;s entire history —
            stage transitions, field changes, AI tool usage, and more.
          </p>
          {error && (
            <p className="text-[12px] text-red-600 mb-3">{error}</p>
          )}
          <button
            onClick={handleGenerate}
            disabled={generating}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-500
                       disabled:opacity-50 text-white text-[13px] font-medium transition-colors"
          >
            {generating
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Generating Journey Report...</>
              : <><FileText className="w-4 h-4" /> Generate Journey Report</>
            }
          </button>
        </div>
      </div>
    )
  }

  // Report exists — render it
  return (
    <div className="flex-1 overflow-y-auto syn-scroll">
      {/* Header strip */}
      <div className="px-5 py-3 border-b syn-border flex items-center justify-between flex-shrink-0 syn-surface-2">
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-brand-600" />
          <span className="text-[12px] font-semibold syn-text-primary">Journey Report</span>
          {report && (
            <span className="text-[11px] syn-text-muted">
              Generated {new Date(report.created_at).toLocaleDateString('en-US', {
                month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit'
              })}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleDownload}
            className="flex items-center gap-1.5 text-[11px] font-medium px-3 py-1.5
                       rounded-lg syn-surface border syn-border hover:border-gray-300 transition-colors"
          >
            <Download className="w-3.5 h-3.5" /> PDF
          </button>
          <button
            onClick={handleGenerate}
            disabled={generating}
            className="flex items-center gap-1.5 text-[11px] font-medium px-3 py-1.5
                       rounded-lg syn-surface border syn-border hover:border-gray-300
                       disabled:opacity-50 transition-colors"
          >
            {generating
              ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Regenerating...</>
              : <><RefreshCw className="w-3.5 h-3.5" /> Regenerate</>
            }
          </button>
        </div>
      </div>

      {error && (
        <div className="mx-5 mt-3 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-[12px] text-red-700">
          {error}
        </div>
      )}

      <div className="p-5 space-y-4">
        {/* Executive Summary */}
        <Section title="Executive Journey Summary" icon={FileText}>
          <div className="text-[13px] syn-text-secondary leading-relaxed space-y-2">
            {reportData.executive_journey_summary?.split('\n\n').map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </div>
        </Section>

        {/* Win Probability Chart */}
        {chartData.length > 1 && (
          <Section title="Win Probability Curve" icon={TrendingUp}>
            <div className="h-[220px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#6B7280' }} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: '#6B7280' }} unit="%" />
                  <Tooltip
                    contentStyle={{
                      background: '#fff', border: '1px solid #E5E7EB',
                      borderRadius: 8, fontSize: 12,
                    }}
                    formatter={(v) => [`${v}%`, 'Win Prob']}
                  />
                  <ReferenceLine y={50} stroke="#d97706" strokeDasharray="3 3" />
                  <Line type="monotone" dataKey="probability" stroke="#4f46e5"
                        strokeWidth={2} dot={{ r: 4, fill: '#4f46e5' }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            {reportData.win_probability_analysis && (
              <p className="text-[12px] syn-text-tertiary leading-relaxed mt-2">
                {reportData.win_probability_analysis}
              </p>
            )}
          </Section>
        )}

        {/* Health Score Chart */}
        {healthData.length > 1 && (
          <Section title="Deal Health Score Trend" icon={Zap}>
            <div className="h-[180px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={healthData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#6B7280' }} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: '#6B7280' }} />
                  <Tooltip
                    contentStyle={{
                      background: '#fff', border: '1px solid #E5E7EB',
                      borderRadius: 8, fontSize: 12,
                    }}
                  />
                  <Line type="monotone" dataKey="score" stroke="#7c3aed"
                        strokeWidth={2} dot={{ r: 4, fill: '#7c3aed' }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Section>
        )}

        {/* Stage-by-Stage Breakdown */}
        {reportData.stage_breakdown?.length > 0 && (
          <CollapsibleSection title="Stage-by-Stage Breakdown" icon={ArrowRight} defaultOpen>
            <div className="space-y-3">
              {reportData.stage_breakdown.map((s, i) => {
                const isRegression = s.movement_direction === 'backward'
                const isSkip = s.movement_direction === 'skip'
                const criteriaTotal = s.criteria_total || 0
                const criteriaDone = s.criteria_completed || 0
                const criteriaPct = criteriaTotal > 0 ? Math.round(criteriaDone / criteriaTotal * 100) : 0

                return (
                  <div key={i} className={cn(
                    'border rounded-xl p-4 space-y-2',
                    isRegression ? 'border-red-200 bg-red-50/30' :
                    isSkip ? 'border-amber-200 bg-amber-50/30' :
                    'syn-border bg-white',
                  )}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-[13px] font-semibold syn-text-primary">{s.stage}</span>
                        {isRegression && (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-red-100 text-red-700">
                            REGRESSION
                          </span>
                        )}
                        {isSkip && (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">
                            SKIPPED STAGES
                          </span>
                        )}
                      </div>
                      <span className="text-[11px] syn-text-muted">
                        {s.time_spent_days != null ? `${s.time_spent_days} days` : 'current'}
                      </span>
                    </div>

                    {/* Criteria progress */}
                    {criteriaTotal > 0 && (
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[11px] syn-text-tertiary">
                            Exit criteria: {criteriaDone}/{criteriaTotal}
                          </span>
                          <span className="text-[11px] font-medium syn-text-secondary">{criteriaPct}%</span>
                        </div>
                        <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className={cn(
                              'h-full rounded-full transition-all',
                              criteriaPct >= 80 ? 'bg-emerald-500' :
                              criteriaPct >= 50 ? 'bg-amber-500' : 'bg-red-500',
                            )}
                            style={{ width: `${criteriaPct}%` }}
                          />
                        </div>
                      </div>
                    )}

                    {/* Skipped criteria */}
                    {s.criteria_skipped?.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {s.criteria_skipped.map((c, j) => (
                          <span key={j} className="text-[10px] px-2 py-0.5 rounded-full bg-red-100 text-red-700 border border-red-200">
                            {c}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Win prob delta */}
                    {(s.win_prob_at_entry != null || s.win_prob_at_exit != null) && (
                      <div className="flex items-center gap-2 text-[11px]">
                        <span className="syn-text-muted">Win prob:</span>
                        <span className="font-medium syn-text-secondary">
                          {s.win_prob_at_entry != null ? `${Math.round(s.win_prob_at_entry * 100)}%` : '—'}
                        </span>
                        <ArrowRight className="w-3 h-3 syn-text-muted" />
                        <span className="font-medium syn-text-secondary">
                          {s.win_prob_at_exit != null ? `${Math.round(s.win_prob_at_exit * 100)}%` : '—'}
                        </span>
                      </div>
                    )}

                    {s.analysis && (
                      <p className="text-[12px] syn-text-secondary leading-relaxed">{s.analysis}</p>
                    )}
                  </div>
                )
              })}
            </div>
          </CollapsibleSection>
        )}

        {/* Critical Moments Timeline */}
        {reportData.critical_moments?.length > 0 && (
          <CollapsibleSection title="Critical Moments Timeline" icon={AlertTriangle} defaultOpen>
            <div className="relative pl-6 space-y-4">
              <div className="absolute left-2.5 top-1 bottom-1 w-px bg-gray-200" />
              {reportData.critical_moments.map((m, i) => {
                const colors = SIG_COLORS[m.significance] || SIG_COLORS.medium
                return (
                  <div key={i} className="relative">
                    <div className={cn('absolute -left-3.5 top-1.5 w-2.5 h-2.5 rounded-full border-2 border-white', colors.dot)} />
                    <div className="flex items-start gap-2">
                      <span className={cn(
                        'text-[10px] font-bold px-1.5 py-0.5 rounded',
                        colors.bg, colors.text, colors.border, 'border'
                      )}>
                        {m.significance.toUpperCase()}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] font-medium syn-text-muted">{m.date}</span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 syn-text-tertiary font-medium">
                            {m.category?.replace(/_/g, ' ')}
                          </span>
                        </div>
                        <p className="text-[12px] font-medium syn-text-primary mt-0.5">{m.event}</p>
                        {m.analysis && (
                          <p className="text-[11px] syn-text-tertiary mt-0.5">{m.analysis}</p>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </CollapsibleSection>
        )}

        {/* Document Evidence Trail */}
        {reportData.document_evidence_trail?.length > 0 && (
          <CollapsibleSection title="Document & Evidence Trail" icon={FileText}>
            <div className="space-y-2">
              {reportData.document_evidence_trail.map((d, i) => (
                <div key={i} className="flex items-start gap-3 p-3 rounded-lg syn-surface-2">
                  <FileText className="w-4 h-4 syn-text-muted flex-shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[12px] font-medium syn-text-primary truncate">{d.filename}</span>
                      {d.stage_at_upload && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-brand-50 text-brand-700 font-medium flex-shrink-0">
                          {d.stage_at_upload}
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] syn-text-muted mt-0.5">{d.uploaded_at}</p>
                    {d.signal && <p className="text-[11px] syn-text-tertiary mt-1">{d.signal}</p>}
                  </div>
                </div>
              ))}
            </div>
          </CollapsibleSection>
        )}

        {/* Field Change Analysis */}
        {reportData.field_change_analysis && (
          <CollapsibleSection title="Field Change Analysis" icon={TrendingUp}>
            <p className="text-[12px] syn-text-secondary leading-relaxed">
              {reportData.field_change_analysis}
            </p>
          </CollapsibleSection>
        )}

        {/* AI Tool Utilization */}
        {reportData.ai_tool_utilization && (
          <CollapsibleSection title="AI Tool Utilization Assessment" icon={Zap}>
            <p className="text-[12px] syn-text-secondary leading-relaxed">
              {reportData.ai_tool_utilization}
            </p>
          </CollapsibleSection>
        )}

        {/* What Went Well / What Went Wrong — two-column */}
        {(reportData.what_went_well?.length > 0 || reportData.what_went_wrong?.length > 0) && (
          <div className="grid grid-cols-2 gap-4">
            {reportData.what_went_well?.length > 0 && (
              <div className="syn-card p-4 border-l-4 border-l-emerald-500">
                <div className="flex items-center gap-2 mb-3">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <h3 className="text-[13px] font-semibold text-emerald-800">What Went Well</h3>
                </div>
                <ul className="space-y-2">
                  {reportData.what_went_well.map((item, i) => (
                    <li key={i} className="text-[12px] text-emerald-800 leading-relaxed flex items-start gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 flex-shrink-0 mt-1.5" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {reportData.what_went_wrong?.length > 0 && (
              <div className="syn-card p-4 border-l-4 border-l-red-500">
                <div className="flex items-center gap-2 mb-3">
                  <XCircle className="w-4 h-4 text-red-600" />
                  <h3 className="text-[13px] font-semibold text-red-800">What Went Wrong</h3>
                </div>
                <ul className="space-y-2">
                  {reportData.what_went_wrong.map((item, i) => (
                    <li key={i} className="text-[12px] text-red-800 leading-relaxed flex items-start gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-red-500 flex-shrink-0 mt-1.5" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* Recommendations */}
        {reportData.recommendations_for_future?.length > 0 && (
          <Section title="Recommendations for Future Deals" icon={TrendingUp}>
            <ol className="space-y-2">
              {reportData.recommendations_for_future.map((rec, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="w-5 h-5 rounded-full bg-brand-50 text-brand-700 text-[11px] font-bold
                                   flex items-center justify-center flex-shrink-0 mt-0.5">
                    {i + 1}
                  </span>
                  <p className="text-[12px] syn-text-secondary leading-relaxed">{rec}</p>
                </li>
              ))}
            </ol>
          </Section>
        )}

        {/* Next Best Actions */}
        {reportData.next_best_actions?.length > 0 && (
          <Section title="Next Best Actions" icon={Zap}>
            <div className="space-y-2">
              {reportData.next_best_actions.map((a, i) => (
                <div key={i} className="flex items-start gap-3 p-3 rounded-lg syn-surface-2">
                  <span className={cn(
                    'text-[10px] font-bold px-1.5 py-0.5 rounded flex-shrink-0',
                    PRI_COLORS[a.priority] || 'syn-text-muted',
                  )}>
                    [{a.priority.toUpperCase()}]
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] font-medium syn-text-primary">{a.action}</p>
                    {a.rationale && (
                      <p className="text-[11px] syn-text-tertiary mt-0.5">{a.rationale}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </Section>
        )}
      </div>
    </div>
  )
}
