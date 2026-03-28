'use client'
import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import {
  ArrowLeft, RefreshCw, FileText, Mail, TrendingUp,
  AlertTriangle, Clock, Building2, DollarSign,
  MessageSquare, Upload, Loader2, Send, CheckCircle2,
  Target, Search, Star, MonitorPlay, FileCheck2, Handshake,
  Banknote, CalendarCheck, User, Pencil,
} from 'lucide-react'
import { useDropzone } from 'react-dropzone'
import { dealsApi, ingestApi } from '@/lib/api'
import { fmtFullMoney, currencySymbol } from '@/lib/currency'
import SignalCards, { Signal } from '@/components/SignalCards'
import MEDDICPanel, { MEDDIC } from '@/components/MEDDICPanel'
import DealHealthTimeline, { HistoryPoint } from '@/components/DealHealthTimeline'
import DealBriefModal, { BriefData } from '@/components/DealBriefModal'
import FollowupModal, { FollowupData } from '@/components/FollowupModal'
import CallCaptureZone from '@/components/CallCaptureZone'
import SentimentTimeline from '@/components/SentimentTimeline'
import StageAdvancePanel from '@/components/StageAdvancePanel'
import ExitCriteriaChecklist from '@/components/ExitCriteriaChecklist'
import StageHistoryTimeline from '@/components/StageHistoryTimeline'
import JourneyReportPanel from '@/components/JourneyReportPanel'
import { type StageKey, type StageConfig, STAGE_COLORS, STAGE_ORDER, PROGRESSION_STAGES, isTerminal as isTerminalStage } from '@/lib/stage-utils'

// ── Types ──────────────────────────────────────────────────────────────────

interface Deal {
  id:                    string
  name:                  string
  company:               string
  stage:                 string
  value:                 number
  currency:              string
  owner:                 string
  win_probability:       number | null
  probability_low:       number | null
  probability_high:      number | null
  time_to_close_days:    number | null
  score_summary:         string | null
  risk_flags:            string[]
  signals:               Signal[]
  meddic:                MEDDIC | null
  brief:                 BriefData | null
  brief_generated_at:    string | null
  last_scored_at:        string | null
  created_at:            string
  stage_entered_at:      string | null
  days_in_current_stage: number
}

interface Doc {
  id:              string
  filename:        string
  source_type:     string
  status:          string
  sentiment_score: number | null
  sentiment_label: string | null
  created_at:      string
}

interface EvidenceItem {
  excerpt:     string
  source_type: string
  filename:    string
  impact:      number
  type:        'positive' | 'negative'
}

// ── Small UI helpers ───────────────────────────────────────────────────────

function ScoreGauge({ prob, low, high }: { prob: number; low: number; high: number }) {
  const pct   = Math.round(prob * 100)
  const color = pct >= 65 ? '#22c55e' : pct >= 40 ? '#f59e0b' : '#ef4444'
  const angle = -90 + (pct / 100) * 180
  return (
    <div className="flex flex-col items-center">
      <div className="relative w-36 h-20 overflow-hidden">
        <svg viewBox="0 0 128 72" className="w-full h-full">
          <path d="M12 68 A52 52 0 1 1 116 68" fill="none" stroke="#E5E7EB" strokeWidth="9" strokeLinecap="round" />
          <path d="M12 68 A52 52 0 1 1 116 68" fill="none" stroke={color} strokeWidth="9" strokeLinecap="round"
            strokeDasharray={`${pct * 1.634} 163.4`} style={{ transition: 'stroke-dasharray 0.8s ease' }} />
          <g transform={`rotate(${angle} 64 68)`}>
            <line x1="64" y1="68" x2="64" y2="20" stroke={color} strokeWidth="2" strokeLinecap="round" />
            <circle cx="64" cy="68" r="3.5" fill={color} />
          </g>
        </svg>
      </div>
      <p className="text-4xl font-black syn-text-primary -mt-1">
        {pct}<span className="text-lg syn-text-muted">%</span>
      </p>
      <p className="text-[11px] syn-text-tertiary mt-0.5">
        {Math.round(low * 100)}%–{Math.round(high * 100)}% CI
      </p>
    </div>
  )
}

function SentBadge({ score, label }: { score: number | null; label: string | null }) {
  if (score === null) return null
  const isPos = score >= 0.1
  const isNeg = score <= -0.1
  return (
    <span className={cn(
      'text-[11px] font-semibold px-1.5 py-0.5 rounded-full border',
      isPos ? 'bg-emerald-50 text-emerald-600 border-emerald-200'
       : isNeg ? 'bg-red-50 text-red-600 border-red-200'
       : 'bg-gray-100 text-gray-500 border-gray-200'
    )}>
      {isPos ? '▲' : isNeg ? '▼' : '–'} {label || 'neutral'}
    </span>
  )
}

type RightTab = 'signals' | 'qa' | 'meddic' | 'timeline' | 'documents' | 'capture' | 'pipeline' | 'journey'

function TabBtn({ active, onClick, children }: {
  active: boolean; onClick: () => void; children: React.ReactNode
}) {
  return (
    <button onClick={onClick}
      className={cn(
        'px-3 py-1.5 text-[12px] font-medium rounded-lg transition-all',
        active
          ? 'bg-brand-50 text-brand-700'
          : 'syn-text-tertiary hover:text-gray-700',
      )}>
      {children}
    </button>
  )
}

function PipelineTabBtn({ active, onClick, stage }: {
  active: boolean; onClick: () => void; stage: StageKey
}) {
  const colors = STAGE_COLORS[stage]
  return (
    <button onClick={onClick}
      className={cn(
        'px-3.5 py-1.5 text-[12px] font-bold rounded-lg transition-all',
        'flex items-center gap-1.5 border',
        active
          ? cn(colors.bg, colors.text, colors.border, 'shadow-sm ring-1', colors.border.replace('border-', 'ring-'))
          : cn('border-indigo-200 bg-indigo-50/60 text-indigo-600 hover:bg-indigo-50 hover:border-indigo-300'),
      )}>
      <span className={cn('w-2 h-2 rounded-full flex-shrink-0', active ? colors.dot : 'bg-indigo-400')} />
      Pipeline
    </button>
  )
}

// ── Editable Info Grid ─────────────────────────────────────────────────────

function EditableInfoGrid({ deal, onUpdate }: {
  deal: Deal
  onUpdate: (fields: Partial<Deal>) => void
}) {
  const [editing, setEditing] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)

  const fields = [
    { key: 'value',              icon: Banknote,      label: 'Value',      val: fmtFullMoney(deal.value || 0, deal.currency),                 type: 'number' as const },
    { key: 'time_to_close_days', icon: CalendarCheck,  label: 'Est. Close', val: deal.time_to_close_days ? `${deal.time_to_close_days}d` : '—', type: 'number' as const },
    { key: 'company',            icon: Building2,      label: 'Company',    val: deal.company || '—',                                          type: 'text' as const },
    { key: 'owner',              icon: User,           label: 'Owner',      val: deal.owner || '—',                                            type: 'text' as const },
  ]

  function startEdit(key: string) {
    setEditing(key)
    const raw = (deal as any)[key]
    setDraft(raw != null ? String(raw) : '')
  }

  async function saveEdit(key: string, type: 'number' | 'text') {
    const trimmed = draft.trim()
    if (!trimmed) { setEditing(null); return }
    const parsed = type === 'number' ? Number(trimmed) : trimmed
    if (type === 'number' && isNaN(parsed as number)) { setEditing(null); return }

    setSaving(true)
    try {
      const res = await dealsApi.update(deal.id, { [key]: parsed })
      onUpdate(res.data)
    } catch {
      // silent
    } finally {
      setSaving(false)
      setEditing(null)
    }
  }

  return (
    <div className="grid grid-cols-2 gap-3">
      {fields.map(({ key, icon: Icon, label, val, type }) => (
        <div key={key} className="flex items-center gap-3.5 py-1 group/info">
          <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center flex-shrink-0">
            <Icon className="w-[18px] h-[18px] text-gray-600" strokeWidth={1.8} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 mb-0.5">
              <p className="text-[10px] uppercase tracking-widest text-gray-400 font-semibold">{label}</p>
              {editing !== key && (
                <button
                  onClick={() => startEdit(key)}
                  className="opacity-0 group-hover/info:opacity-100 transition-opacity p-0.5 rounded hover:bg-gray-100"
                >
                  <Pencil className="w-2.5 h-2.5 text-gray-400" />
                </button>
              )}
            </div>
            {editing === key ? (
              <input
                autoFocus
                type={type}
                value={draft}
                onChange={e => setDraft(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') saveEdit(key, type)
                  if (e.key === 'Escape') setEditing(null)
                }}
                onBlur={() => saveEdit(key, type)}
                disabled={saving}
                className="w-full text-[13px] font-bold text-gray-800 bg-white border border-indigo-300 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-indigo-200"
              />
            ) : (
              <p className="text-[14px] font-bold text-gray-800 break-words leading-tight">{val}</p>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────

export default function DealDetailPage() {
  const { id } = useParams<{ id: string }>()

  const [deal,      setDeal]      = useState<Deal | null>(null)
  const [docs,      setDocs]      = useState<Doc[]>([])
  const [history,   setHistory]   = useState<HistoryPoint[]>([])
  const [evidence,  setEvidence]  = useState<EvidenceItem[]>([])

  const [rightTab, setRightTab] = useState<RightTab>('pipeline')

  const [scoring,   setScoring]   = useState(false)
  const [uploading, setUploading] = useState(false)

  const [showBrief,       setShowBrief]       = useState(false)
  const [genBrief,        setGenBrief]        = useState(false)
  const [showFollowup,    setShowFollowup]    = useState(false)
  const [genFollowup,     setGenFollowup]     = useState(false)
  const [followupData,    setFollowupData]    = useState<FollowupData | null>(null)

  const [qaInput,   setQaInput]   = useState('')
  const [qaHistory, setQaHistory] = useState<Array<{ q: string; a: string; sources: string[] }>>([])
  const [qaLoading, setQaLoading] = useState(false)

  // Stage pipeline state
  const [currentStage, setCurrentStage] = useState<StageKey>('Discovery')
  const [daysInStage, setDaysInStage] = useState(0)
  const [stageConfigs, setStageConfigs] = useState<Record<string, StageConfig>>({})
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0)

  const load = useCallback(async () => {
    if (!id || id === 'undefined') return
    const [dr, docsR, histR] = await Promise.all([
      dealsApi.get(id),
      ingestApi.documents(id),
      dealsApi.scoreHistory(id),
    ])
    setDeal(dr.data)
    setCurrentStage((dr.data.stage || 'Discovery') as StageKey)
    setDaysInStage(dr.data.days_in_current_stage || 0)
    setDocs(docsR.data || [])
    setHistory(histR.data || [])
  }, [id])

  // Fetch stage configs once
  useEffect(() => {
    dealsApi.stageConfigs().then(r => {
      const map: Record<string, StageConfig> = {}
      for (const s of r.data.stages) map[s.key] = s
      setStageConfigs(map)
    }).catch(() => {})
  }, [])

 useEffect(() => { if (id) load() }, [id, load])

  function handleStageChanged(newStage: StageKey, _previousStage: StageKey) {
    setCurrentStage(newStage)
    setDaysInStage(0)
    setHistoryRefreshKey(k => k + 1)
    // Re-fetch deal to update all fields
    load()
  }

  const handleScore = async () => {
    setScoring(true)
    try {
      const res = await dealsApi.score(id)
      setEvidence(res.data.top_reasons || [])
      await load()
    } catch (e: any) {
      alert(e.response?.data?.detail || 'Scoring failed')
    } finally { setScoring(false) }
  }

  const handleBrief = async () => {
    setGenBrief(true)
    try { await dealsApi.brief(id); await load() }
    finally { setGenBrief(false) }
  }

  const handleFollowup = async () => {
    setGenFollowup(true)
    try {
      const res = await dealsApi.followup(id)
      setFollowupData(res.data)
    } finally { setGenFollowup(false) }
  }

  const handleQa = async () => {
    if (!qaInput.trim()) return
    const q = qaInput; setQaInput(''); setQaLoading(true)
    try {
      const res = await dealsApi.ask(id, q)
      setQaHistory(h => [...h, { q, a: res.data.answer, sources: res.data.sources || [] }])
    } finally { setQaLoading(false) }
  }

  const onDrop = useCallback(async (files: File[]) => {
    setUploading(true)
    for (const file of files) {
      try { await ingestApi.upload(id, file) }
      catch (e: any) { alert(e.response?.data?.detail || e.message) }
    }
    await load(); setUploading(false)
  }, [id, load])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({ onDrop })

  if (!deal) return (
    <div className="flex-1 flex items-center justify-center h-screen syn-bg">
      <Loader2 className="w-6 h-6 syn-text-muted animate-spin" />
    </div>
  )

  const pct = deal.win_probability !== null ? Math.round(deal.win_probability * 100) : null

  return (
    <div className="flex flex-col h-screen syn-bg">

      {/* ── Top bar ──────────────────────────────────────────────── */}
      <div className="h-16 border-b syn-border px-5 flex items-center justify-between flex-shrink-0 syn-surface">
        <div className="flex items-center gap-3">
          <Link href="/deals"
            className="w-8 h-8 rounded-lg syn-surface-2 border syn-border
                       flex items-center justify-center hover:border-gray-300 transition-colors">
            <ArrowLeft className="w-4 h-4 syn-text-tertiary" />
          </Link>
          <div>
            <h1 className="text-base font-semibold syn-text-primary leading-none">{deal.name}</h1>
            <p className="text-[12px] syn-text-secondary mt-1">{deal.company} · {currentStage}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => { setShowFollowup(true); if (!followupData) handleFollowup() }}
            className="flex items-center gap-1.5 text-[12px] font-medium px-4 py-2 rounded-lg
                       syn-surface-2 border syn-border text-gray-700
                       hover:text-gray-900 hover:border-gray-300 transition-colors">
            <Mail className="w-3.5 h-3.5" /> Follow-up
          </button>
          <button
            onClick={() => setShowBrief(true)}
            className="flex items-center gap-1.5 text-[12px] font-medium px-4 py-2 rounded-lg
                       syn-surface-2 border syn-border text-brand-700
                       hover:border-brand-500/30 transition-colors">
            <FileText className="w-3.5 h-3.5" /> Brief
          </button>
          <button
            onClick={handleScore}
            disabled={scoring}
            className="flex items-center gap-1.5 text-[12px] font-medium px-4 py-2 rounded-lg
                       bg-brand-600 hover:bg-brand-500 disabled:opacity-50 text-white transition-colors">
            {scoring
              ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Scoring…</>
              : <><RefreshCw className="w-3.5 h-3.5" /> Score Deal</>
            }
          </button>
        </div>
      </div>

      {/* ── Body ──────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-hidden flex min-h-0">

        {/* LEFT — 400px: Score card + AI Assessment + Overview */}
        <div className="w-[400px] border-r syn-border flex flex-col flex-shrink-0">

          {/* Score card */}
          <div className="p-5 border-b syn-border flex-shrink-0">
            <div className="syn-card p-4 space-y-3">
              {/* Gauge row */}
              <div className="flex flex-col items-center">
                <div className="relative group/gauge">
                  <p className="text-[10px] uppercase tracking-widest text-gray-400 font-semibold text-center mb-2">Win Probability</p>
                  {pct !== null
                    ? <ScoreGauge prob={deal.win_probability!} low={deal.probability_low!} high={deal.probability_high!} />
                    : <div className="w-36 h-20 flex items-center justify-center syn-surface-2 rounded-xl border syn-border">
                        <p className="text-[11px] syn-text-muted">Not scored</p>
                      </div>
                  }
                  <div className="pointer-events-none absolute left-1/2 -translate-x-1/2 top-full mt-2 w-56 opacity-0 translate-y-1 group-hover/gauge:opacity-100 group-hover/gauge:translate-y-0 transition-all duration-200 z-50">
                    <div className="bg-white rounded-xl border border-gray-200 shadow-lg px-3.5 py-2.5">
                      <p className="text-[11px] font-semibold text-gray-700 mb-1">AI Win Probability</p>
                      <p className="text-[10.5px] text-gray-500 leading-relaxed">
                        Likelihood of closing this deal based on AI analysis of deal signals, engagement patterns, and historical outcomes.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
              {/* Editable info grid */}
              <EditableInfoGrid deal={deal} onUpdate={(updated) => setDeal({ ...deal, ...updated })} />
            </div>

            {/* AI Assessment */}
            {deal.score_summary && (
              <div className="mt-3 syn-surface-2 border syn-border rounded-xl p-3.5">
                <p className="text-[11px] text-brand-700 uppercase tracking-wider font-semibold mb-1.5">AI Assessment</p>
                <p className="text-[13px] text-gray-700 leading-relaxed">{deal.score_summary}</p>
              </div>
            )}
          </div>

          {/* Overview — scrollable, always visible */}
          <div className="flex-1 overflow-y-auto syn-scroll p-4">
            <div className="space-y-5">

              {/* Risk flags */}
              {deal.risk_flags?.length > 0 && (
                <div>
                  <p className="text-[11px] font-semibold syn-text-tertiary uppercase tracking-[0.1em] mb-2">Risk Flags</p>
                  <div className="space-y-1.5">
                    {deal.risk_flags.map((r, i) => (
                      <div key={i} className="flex items-start gap-2.5 bg-red-50 border border-red-200 rounded-xl p-3">
                        <AlertTriangle className="w-3.5 h-3.5 text-red-600 flex-shrink-0 mt-0.5" />
                        <p className="text-[12px] syn-text-secondary leading-relaxed">{r}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Evidence */}
              {evidence.length > 0 && (
                <div>
                  <p className="text-[11px] font-semibold syn-text-tertiary uppercase tracking-[0.1em] mb-2">Evidence</p>
                  <div className="space-y-2">
                    {evidence.map((e, i) => (
                      <div key={i} className={cn(
                        'rounded-xl border p-3',
                        e.type === 'positive' ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'
                      )}>
                        <div className="flex justify-between mb-1.5">
                          <span className={cn(
                            'text-[11px] font-bold uppercase tracking-wider',
                            e.type === 'positive' ? 'text-emerald-600' : 'text-red-600'
                          )}>
                            {e.type === 'positive' ? '▲' : '▼'} {e.impact > 0 ? '+' : ''}{Math.round(e.impact * 100)}pp
                          </span>
                          <span className="text-[11px] syn-text-muted">{e.filename}</span>
                        </div>
                        <p className="text-[12px] syn-text-secondary italic leading-relaxed">&ldquo;{e.excerpt}&rdquo;</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {!evidence.length && !deal.risk_flags?.length && (
                <div className="text-center py-10">
                  <p className="text-[12px] syn-text-muted">Upload documents then score the deal to see evidence.</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* RIGHT — flex-1: all tabs */}
        <div className="flex-1 flex flex-col min-w-0">

          {/* Right tab bar */}
          <div className="px-5 py-2.5 border-b syn-border flex items-center gap-1 flex-shrink-0 flex-wrap">
            <PipelineTabBtn active={rightTab === 'pipeline'} onClick={() => setRightTab('pipeline')} stage={currentStage} />
            <TabBtn active={rightTab === 'signals'} onClick={() => setRightTab('signals')}>
              Signals {deal.signals?.length ? `(${deal.signals.length})` : ''}
            </TabBtn>
            <TabBtn active={rightTab === 'qa'}       onClick={() => setRightTab('qa')}>Ask AI</TabBtn>
            <TabBtn active={rightTab === 'meddic'}   onClick={() => setRightTab('meddic')}>MEDDIC</TabBtn>
            <TabBtn active={rightTab === 'timeline'} onClick={() => setRightTab('timeline')}>Timeline</TabBtn>
            <TabBtn active={rightTab === 'documents'} onClick={() => setRightTab('documents')}>
              Documents {docs.length > 0 ? `(${docs.length})` : ''}
            </TabBtn>
            <TabBtn active={rightTab === 'capture'}  onClick={() => setRightTab('capture')}>Calls</TabBtn>
            <TabBtn active={rightTab === 'journey'}  onClick={() => setRightTab('journey')}>Journey</TabBtn>
          </div>

          {/* Signals */}
          {rightTab === 'signals' && (
            <div className="flex-1 overflow-y-auto syn-scroll p-5">
              {deal.signals?.length > 0
                ? <SignalCards signals={deal.signals} />
                : (
                  <div className="flex flex-col items-center justify-center h-full py-16 text-center">
                    <div className="w-12 h-12 rounded-xl syn-surface-2 border syn-border flex items-center justify-center mb-3">
                      <TrendingUp className="w-5 h-5 syn-text-muted" />
                    </div>
                    <p className="text-[13px] syn-text-tertiary">No signals detected yet.</p>
                    <p className="text-[12px] syn-text-muted mt-1">Upload documents and score the deal.</p>
                  </div>
                )
              }
            </div>
          )}

          {/* MEDDIC */}
          {rightTab === 'meddic' && (
            <div className="flex-1 overflow-y-auto syn-scroll p-5">
              <MEDDICPanel meddic={deal.meddic} onExtract={handleScore} extracting={scoring} />
            </div>
          )}

          {/* Timeline */}
          {rightTab === 'timeline' && (
            <div className="flex-1 overflow-y-auto syn-scroll p-5 space-y-6">
              <DealHealthTimeline history={history} />
              <SentimentTimeline dealId={id} />
            </div>
          )}

          {/* Documents */}
          {rightTab === 'documents' && (
            <div className="flex-1 overflow-y-auto syn-scroll p-5 space-y-3">
              <div {...getRootProps()}
                className={cn(
                  'border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-all',
                  isDragActive
                    ? 'border-brand-500/60 bg-brand-500/5'
                    : 'syn-border hover:border-gray-300'
                )}>
                <input {...getInputProps()} />
                {uploading
                  ? <div className="flex items-center justify-center gap-2 text-[12px] text-brand-700">
                      <Loader2 className="w-4 h-4 animate-spin" /> Uploading…
                    </div>
                  : <>
                      <Upload className="w-5 h-5 mx-auto mb-2 syn-text-muted" />
                      <p className="text-[12px] syn-text-tertiary">Drop PDF, audio, or text</p>
                    </>
                }
              </div>
              <div className="space-y-1.5">
                {docs.map(d => (
                  <div key={d.id} className="flex items-center gap-3 syn-card px-3.5 py-3">
                    <div className={cn(
                      'w-2 h-2 rounded-full flex-shrink-0',
                      d.status === 'done' ? 'bg-emerald-500' : d.status === 'processing' ? 'bg-amber-500 animate-pulse' : 'bg-gray-300'
                    )} />
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] text-gray-700 truncate">{d.filename}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <p className="text-[11px] syn-text-muted capitalize">{d.source_type}</p>
                        <SentBadge score={d.sentiment_score} label={d.sentiment_label} />
                      </div>
                    </div>
                  </div>
                ))}
                {docs.length === 0 && (
                  <p className="text-[12px] syn-text-muted text-center py-6">No documents yet.</p>
                )}
              </div>
            </div>
          )}

          {/* Calls */}
          {rightTab === 'capture' && (
            <div className="flex-1 overflow-y-auto syn-scroll p-5">
              <CallCaptureZone dealId={id} onComplete={load} />
            </div>
          )}

          {/* Pipeline */}
          {rightTab === 'pipeline' && (
            <div className="flex-1 overflow-y-auto syn-scroll p-5 space-y-5">

              {/* ── Visual pipeline rail ──────────────────────────────── */}
              <div className="syn-card p-5">
                <div className="flex items-center gap-2 mb-5">
                  <Target className="w-4 h-4 text-gray-400" />
                  <h3 className="text-[13px] font-semibold text-gray-800">Deal Progress</h3>
                </div>

                {(() => {
                  const stageIcons: Record<string, React.ReactNode> = {
                    'Discovery':     <Search className="w-4 h-4 text-white" />,
                    'Qualification': <Star className="w-4 h-4 text-white" />,
                    'Demo':          <MonitorPlay className="w-4 h-4 text-white" />,
                    'Proposal':      <FileCheck2 className="w-4 h-4 text-white" />,
                    'Negotiation':   <Handshake className="w-4 h-4 text-white" />,
                  }
                  const progIdx = PROGRESSION_STAGES.indexOf(currentStage as any)
                  const currentProgIdx = progIdx >= 0 ? progIdx : (isTerminalStage(currentStage) ? PROGRESSION_STAGES.length : 0)
                  const segments = PROGRESSION_STAGES.length - 1
                  const fillPercent = isTerminalStage(currentStage)
                    ? 100
                    : (currentProgIdx / segments) * 100

                  return (
                    <div className="relative">
                      {/* Track — anchored to center of first and last node */}
                      <div
                        className="absolute top-5 -translate-y-1/2 h-[3px]"
                        style={{ left: 28, right: 28 }}
                      >
                        {/* Background track */}
                        <div className="h-full bg-gray-100 rounded-full w-full" />
                        {/* Filled track */}
                        <div
                          className="h-full rounded-full absolute top-0 left-0 transition-all duration-700 ease-out"
                          style={{
                            width: `${fillPercent}%`,
                            background: isTerminalStage(currentStage)
                              ? (currentStage === 'Closed Won'
                                ? 'linear-gradient(90deg, #22c55e 0%, #16a34a 100%)'
                                : 'linear-gradient(90deg, #ef4444 0%, #dc2626 100%)')
                              : 'linear-gradient(90deg, #22c55e 0%, #22c55e 60%, #86efac 100%)',
                          }}
                        />
                      </div>

                      {/* Stage nodes — flush to edges */}
                      <div className="relative flex justify-between">
                        {PROGRESSION_STAGES.map((stage, idx) => {
                          const isPast = currentProgIdx > idx || isTerminalStage(currentStage)
                          const isCurrent = currentStage === stage
                          const colors = STAGE_COLORS[stage]

                          return (
                            <div key={stage} className="flex flex-col items-center relative z-10">
                              {/* Node */}
                              <div className={cn(
                                'w-10 h-10 rounded-full flex items-center justify-center transition-all duration-500',
                                isCurrent && 'ring-[3px] ring-offset-2 shadow-lg',
                                isCurrent && (colors.dot === 'bg-indigo-500' ? 'ring-indigo-300 bg-indigo-500'
                                  : colors.dot === 'bg-blue-500' ? 'ring-blue-300 bg-blue-500'
                                  : colors.dot === 'bg-cyan-500' ? 'ring-cyan-300 bg-cyan-500'
                                  : colors.dot === 'bg-amber-500' ? 'ring-amber-300 bg-amber-500'
                                  : 'ring-pink-300 bg-pink-500'),
                                isPast && !isCurrent && 'bg-emerald-500 shadow-sm shadow-emerald-200',
                                !isCurrent && !isPast && 'bg-gray-50 border-2 border-gray-200',
                              )}>
                                {isPast && !isCurrent && stageIcons[stage]}
                                {isCurrent && <div className="w-3 h-3 rounded-full bg-white shadow-inner" />}
                                {!isCurrent && !isPast && (
                                  <div className="w-2 h-2 rounded-full bg-gray-200" />
                                )}
                              </div>
                              {/* Label */}
                              <span className={cn(
                                'text-[11px] mt-2 whitespace-nowrap text-center',
                                isCurrent ? cn('font-bold', colors.text) : isPast ? 'font-medium text-emerald-600' : 'font-medium text-gray-300',
                              )}>
                                {stage}
                              </span>
                              {/* Days indicator */}
                              {isCurrent && daysInStage !== undefined && (
                                <span className="text-[10px] text-gray-400 mt-0.5">{daysInStage}d</span>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )
                })()}

                {/* Terminal badge if applicable */}
                {isTerminalStage(currentStage) && (
                  <div className={cn(
                    'mt-5 flex items-center justify-center gap-2 py-2.5 rounded-lg',
                    currentStage === 'Closed Won' ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200',
                  )}>
                    <CheckCircle2 className={cn('w-4 h-4', currentStage === 'Closed Won' ? 'text-green-600' : 'text-red-500')} />
                    <span className={cn('text-[13px] font-semibold', currentStage === 'Closed Won' ? 'text-green-700' : 'text-red-600')}>
                      {currentStage}
                    </span>
                  </div>
                )}
              </div>

              {/* ── Current stage detail card ─────────────────────────── */}
              {(() => {
                const config = stageConfigs[currentStage]
                if (!config) return null
                const colors = STAGE_COLORS[currentStage]
                const isOverdue = config.typical_duration_days > 0 && daysInStage > config.typical_duration_days

                return (
                  <div className={cn('rounded-xl border-2 overflow-hidden', colors.border)}>
                    {/* Header band */}
                    <div className={cn('px-5 py-3 flex items-center justify-between', colors.bg)}>
                      <div className="flex items-center gap-2.5">
                        <div className={cn('w-3 h-3 rounded-full', colors.dot)} />
                        <span className={cn('text-[14px] font-bold', colors.text)}>{currentStage}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        {daysInStage !== undefined && (
                          <div className="relative group/days">
                            <div className={cn(
                              'flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold cursor-help',
                              isOverdue
                                ? 'bg-red-100 text-red-700 border border-red-200'
                                : 'bg-white/70 text-gray-600 border border-gray-200',
                            )}>
                              <Clock className="w-3 h-3" />
                              {daysInStage}d / {config.typical_duration_days || '\u221e'}d
                            </div>
                            <div className="pointer-events-none absolute top-full right-0 mt-2 w-52 opacity-0 translate-y-1 group-hover/days:opacity-100 group-hover/days:translate-y-0 transition-all duration-200 z-50">
                              <div className="bg-white rounded-xl border border-gray-200 shadow-lg px-3.5 py-2.5">
                                <p className="text-[11px] font-semibold text-gray-700 mb-1">Stage Duration</p>
                                <p className="text-[10.5px] text-gray-500 leading-relaxed">
                                  {daysInStage} day{daysInStage !== 1 ? 's' : ''} in {currentStage}.
                                  {config.typical_duration_days
                                    ? ` Typical: ${config.typical_duration_days} days.`
                                    : ''}
                                  {isOverdue && <span className="text-red-500 font-medium"> Overdue.</span>}
                                </p>
                              </div>
                            </div>
                          </div>
                        )}
                        {config.ai_win_prob_floor !== undefined && (
                          <div className="relative group/prob">
                            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/70 text-gray-600 border border-gray-200 text-[11px] font-semibold cursor-help">
                              <TrendingUp className="w-3 h-3" />
                              {config.ai_win_prob_floor}%–{config.ai_win_prob_ceiling}%
                            </div>
                            <div className="pointer-events-none absolute top-full right-0 mt-2 w-56 opacity-0 translate-y-1 group-hover/prob:opacity-100 group-hover/prob:translate-y-0 transition-all duration-200 z-50">
                              <div className="bg-white rounded-xl border border-gray-200 shadow-lg px-3.5 py-2.5">
                                <p className="text-[11px] font-semibold text-gray-700 mb-1">Win Probability Range</p>
                                <p className="text-[10.5px] text-gray-500 leading-relaxed">
                                  Deals at {currentStage} typically close at {config.ai_win_prob_floor}%–{config.ai_win_prob_ceiling}% probability based on historical data.
                                </p>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Body */}
                    <div className="px-5 py-4 bg-white">
                      <p className="text-[12px] text-gray-600 leading-relaxed mb-4">{config.description}</p>

                      {/* Exit criteria checklist — interactive */}
                      <ExitCriteriaChecklist dealId={deal.id} stage={currentStage} />
                    </div>
                  </div>
                )
              })()}

              {/* ── Stage actions ──────────────────────────────────────── */}
              {Object.keys(stageConfigs).length > 0 && !isTerminalStage(currentStage) && (
                <div className="space-y-3">
                  <StageAdvancePanel
                    deal={{ id: deal.id, stage: currentStage, days_in_current_stage: daysInStage }}
                    stageConfigs={stageConfigs}
                    onStageChanged={handleStageChanged}
                    hideStageInfo
                  />
                </div>
              )}

              {/* Terminal state info */}
              {isTerminalStage(currentStage) && stageConfigs[currentStage] && (
                <div className={cn(
                  'rounded-xl border p-5',
                  currentStage === 'Closed Won' ? 'bg-green-50/50 border-green-200' : 'bg-red-50/50 border-red-200',
                )}>
                  <div className="flex items-center gap-2 mb-2">
                    <CheckCircle2 className={cn('w-5 h-5', currentStage === 'Closed Won' ? 'text-green-600' : 'text-red-500')} />
                    <span className={cn('font-semibold text-[14px]', currentStage === 'Closed Won' ? 'text-green-800' : 'text-red-700')}>
                      {currentStage}
                    </span>
                  </div>
                  <p className="text-[12px] text-gray-500">{stageConfigs[currentStage]?.description}</p>
                  {currentStage === 'Closed Lost' && (
                    <p className="text-[11px] text-gray-400 mt-3 pt-3 border-t border-red-100">
                      To re-engage this account, create a new deal. Stage history is preserved.
                    </p>
                  )}
                </div>
              )}

              {/* ── Stage history timeline ─────────────────────────────── */}
              <div className="syn-card p-5">
                <div className="flex items-center gap-2 mb-4">
                  <Clock className="w-4 h-4 text-gray-400" />
                  <h3 className="text-[13px] font-semibold text-gray-800">Stage History</h3>
                </div>
                <StageHistoryTimeline
                  dealId={deal.id}
                  refreshTrigger={historyRefreshKey}
                />
              </div>
            </div>
          )}

          {/* Q&A */}
          {rightTab === 'qa' && (
            <div className="flex-1 flex flex-col min-h-0">
              <div className="flex-1 overflow-y-auto syn-scroll p-5 space-y-4">
                {qaHistory.length === 0 && (
                  <div className="text-center py-12">
                    <MessageSquare className="w-8 h-8 syn-text-muted mx-auto mb-3" />
                    <p className="text-[13px] syn-text-tertiary mb-4">Ask anything about this deal</p>
                    {[
                      'Who is the decision maker?',
                      'What objections were raised?',
                      'What is the timeline?',
                    ].map(q => (
                      <button key={q} onClick={() => setQaInput(q)}
                        className="block w-full text-left text-[12px] syn-text-tertiary hover:syn-text-secondary
                                   syn-card px-3.5 py-2.5 mb-1.5 transition-colors">
                        {q}
                      </button>
                    ))}
                  </div>
                )}
                {qaHistory.map((item, i) => (
                  <div key={i} className="space-y-3">
                    <div className="flex justify-end">
                      <div className="bg-brand-50 border border-brand-200 rounded-xl px-4 py-2.5 max-w-[85%]">
                        <p className="text-[13px] text-brand-700">{item.q}</p>
                      </div>
                    </div>
                    <div className="syn-surface-2 border syn-border rounded-xl p-4 max-w-[95%]">
                      <p className="text-[13px] text-gray-700 leading-relaxed whitespace-pre-wrap">{item.a}</p>
                      {item.sources?.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-3 pt-3 border-t syn-border">
                          {item.sources.map((s, si) => (
                            <span key={si} className="text-[11px] syn-text-tertiary syn-surface-3 px-2 py-0.5 rounded-md">
                              {s}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
                {qaLoading && (
                  <div className="syn-surface-2 border syn-border rounded-xl p-3 w-14">
                    <Loader2 className="w-4 h-4 syn-text-tertiary animate-spin" />
                  </div>
                )}
              </div>

              {/* Input */}
              <div className="p-4 border-t syn-border">
                <div className="flex gap-2">
                  <input
                    value={qaInput}
                    onChange={e => setQaInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleQa()}
                    placeholder="Ask about this deal…"
                    className="flex-1 syn-surface-2 border syn-border rounded-xl px-4 py-2.5
                               text-[13px] syn-text-primary placeholder:syn-text-muted
                               focus:outline-none focus:border-brand-500/40 transition-colors"
                  />
                  <button onClick={handleQa} disabled={qaLoading || !qaInput.trim()}
                    className="w-10 h-10 flex items-center justify-center bg-brand-600
                               hover:bg-brand-500 disabled:opacity-40 rounded-xl transition-colors flex-shrink-0">
                    <Send className="w-4 h-4 text-white" />
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Journey Report */}
          {rightTab === 'journey' && (
            <JourneyReportPanel dealId={id} />
          )}
        </div>
      </div>

      {/* ── Modals ──────────────────────────────────────────────── */}
      {showBrief && (
        <DealBriefModal
          brief={deal.brief || null}
          onClose={() => setShowBrief(false)}
          onGenerate={handleBrief}
          generating={genBrief}
        />
      )}
      {showFollowup && (
        <FollowupModal
          data={followupData}
          onClose={() => setShowFollowup(false)}
          onGenerate={handleFollowup}
          generating={genFollowup}
        />
      )}
    </div>
  )
}
