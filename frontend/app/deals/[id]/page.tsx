'use client'
import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import {
  ArrowLeft, RefreshCw, FileText, Mail, TrendingUp,
  AlertTriangle, Clock, Building2, DollarSign,
  MessageSquare, Upload, Loader2, Send, CheckCircle2,
} from 'lucide-react'
import { useDropzone } from 'react-dropzone'
import { dealsApi, ingestApi } from '@/lib/api'
import SignalCards, { Signal } from '@/components/SignalCards'
import MEDDICPanel, { MEDDIC } from '@/components/MEDDICPanel'
import DealHealthTimeline, { HistoryPoint } from '@/components/DealHealthTimeline'
import DealBriefModal, { BriefData } from '@/components/DealBriefModal'
import FollowupModal, { FollowupData } from '@/components/FollowupModal'
import CallCaptureZone from '@/components/CallCaptureZone'
import SentimentTimeline from '@/components/SentimentTimeline'

// ── Types ──────────────────────────────────────────────────────────────────

interface Deal {
  id:                 string
  name:               string
  company:            string
  stage:              string
  value:              number
  owner:              string
  win_probability:    number | null
  probability_low:    number | null
  probability_high:   number | null
  time_to_close_days: number | null
  score_summary:      string | null
  risk_flags:         string[]
  signals:            Signal[]
  meddic:             MEDDIC | null
  brief:              BriefData | null
  brief_generated_at: string | null
  last_scored_at:     string | null
  created_at:         string
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

type RightTab = 'signals' | 'qa' | 'meddic' | 'timeline' | 'documents' | 'capture'

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

// ── Main page ──────────────────────────────────────────────────────────────

export default function DealDetailPage() {
  const { id } = useParams<{ id: string }>()

  const [deal,      setDeal]      = useState<Deal | null>(null)
  const [docs,      setDocs]      = useState<Doc[]>([])
  const [history,   setHistory]   = useState<HistoryPoint[]>([])
  const [evidence,  setEvidence]  = useState<EvidenceItem[]>([])

  const [rightTab, setRightTab] = useState<RightTab>('signals')

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

  const load = useCallback(async () => {
    if (!id || id === 'undefined') return
    const [dr, docsR, histR] = await Promise.all([
      dealsApi.get(id),
      ingestApi.documents(id),
      dealsApi.scoreHistory(id),
    ])
    setDeal(dr.data)
    setDocs(docsR.data || [])
    setHistory(histR.data || [])
  }, [id])

 useEffect(() => { if (id) load() }, [id, load])

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
            <p className="text-[12px] syn-text-secondary mt-1">{deal.company} · {deal.stage}</p>
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
              <div className="flex justify-center">
                {pct !== null
                  ? <ScoreGauge prob={deal.win_probability!} low={deal.probability_low!} high={deal.probability_high!} />
                  : <div className="w-36 h-20 flex items-center justify-center syn-surface-2 rounded-xl border syn-border">
                      <p className="text-[11px] syn-text-muted">Not scored</p>
                    </div>
                }
              </div>
              {/* Info grid — full width, no truncation */}
              <div className="grid grid-cols-2 gap-2">
                {[
                  { icon: DollarSign,   label: 'Value',      val: `$${(deal.value || 0).toLocaleString()}` },
                  { icon: Clock,        label: 'Est. Close', val: deal.time_to_close_days ? `${deal.time_to_close_days}d` : '—' },
                  { icon: Building2,    label: 'Company',    val: deal.company || '—' },
                  { icon: CheckCircle2, label: 'Owner',      val: deal.owner || '—' },
                ].map(({ icon: Icon, label, val }) => (
                  <div key={label} className="syn-surface-2 border syn-border rounded-xl p-3">
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <Icon className="w-3 h-3 syn-text-muted flex-shrink-0" />
                      <p className="text-[11px] syn-text-tertiary uppercase tracking-wider font-medium">{label}</p>
                    </div>
                    <p className="text-[13px] font-semibold text-gray-800 break-words leading-snug">{val}</p>
                  </div>
                ))}
              </div>
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
            <div className="space-y-4">
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
          <div className="px-5 py-2.5 border-b syn-border flex gap-1 flex-shrink-0 flex-wrap">
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
