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
  const angle = -135 + (pct / 100) * 270
  return (
    <div className="flex flex-col items-center">
      <div className="relative w-32 h-[72px] overflow-hidden">
        <svg viewBox="0 0 128 72" className="w-full h-full">
          <path d="M12 68 A52 52 0 1 1 116 68" fill="none" stroke="#111827" strokeWidth="9" strokeLinecap="round" />
          <path d="M12 68 A52 52 0 1 1 116 68" fill="none" stroke={color} strokeWidth="9" strokeLinecap="round"
            strokeDasharray={`${pct * 1.634} 163.4`} style={{ transition: 'stroke-dasharray 0.8s ease' }} />
          <g transform={`rotate(${angle} 64 68)`}>
            <line x1="64" y1="68" x2="64" y2="22" stroke={color} strokeWidth="2" strokeLinecap="round" />
            <circle cx="64" cy="68" r="3.5" fill={color} />
          </g>
        </svg>
      </div>
      <p className="text-3xl font-black text-white -mt-1.5">
        {pct}<span className="text-lg text-slate-500">%</span>
      </p>
      <p className="text-[9px] text-slate-600 mt-0.5">
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
      'text-[9px] font-semibold px-1.5 py-0.5 rounded-full border',
      isPos ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
       : isNeg ? 'bg-red-500/10 text-red-400 border-red-500/20'
       : 'bg-slate-800/60 text-slate-500 border-white/[0.05]'
    )}>
      {isPos ? '▲' : isNeg ? '▼' : '–'} {label || 'neutral'}
    </span>
  )
}

type Tab      = 'overview' | 'meddic' | 'timeline' | 'documents' | 'capture'
type RightTab = 'signals'  | 'qa'

function TabBtn({ active, onClick, children }: {
  active: boolean; onClick: () => void; children: React.ReactNode
}) {
  return (
    <button onClick={onClick}
      className={cn(
        'px-3 py-1.5 text-[11px] font-medium rounded-lg transition-all',
        active
          ? 'bg-indigo-500/[0.12] text-indigo-300 border border-indigo-500/20'
          : 'text-slate-500 hover:text-slate-300 border border-transparent',
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

  const [tab,       setTab]       = useState<Tab>('overview')
  const [rightTab,  setRightTab]  = useState<RightTab>('signals')

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
    <div className="flex-1 flex items-center justify-center h-screen">
      <Loader2 className="w-6 h-6 text-slate-600 animate-spin" />
    </div>
  )

  const pct = deal.win_probability !== null ? Math.round(deal.win_probability * 100) : null
  const scoreColor = pct === null ? 'text-slate-600' : pct >= 65 ? 'text-emerald-400' : pct >= 40 ? 'text-amber-400' : 'text-red-400'

  return (
    <div className="flex flex-col h-screen">

      {/* ── Top bar ──────────────────────────────────────────────── */}
      <div className="h-[58px] border-b border-white/[0.06] px-5 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3">
          <Link href="/deals"
            className="w-7 h-7 rounded-lg bg-slate-800/60 border border-white/[0.06]
                       flex items-center justify-center hover:bg-slate-700/60 transition-colors">
            <ArrowLeft className="w-3.5 h-3.5 text-slate-500" />
          </Link>
          <div>
            <h1 className="text-[13px] font-semibold text-white leading-none">{deal.name}</h1>
            <p className="text-[10px] text-slate-600 mt-0.5">{deal.company} · {deal.stage}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => { setShowFollowup(true); if (!followupData) handleFollowup() }}
            className="flex items-center gap-1.5 text-[11px] font-medium px-3 py-1.5 rounded-xl
                       bg-slate-800/60 border border-white/[0.06] text-slate-400
                       hover:text-slate-200 hover:border-white/[0.1] transition-colors">
            <Mail className="w-3.5 h-3.5" /> Follow-up
          </button>
          <button
            onClick={() => setShowBrief(true)}
            className="flex items-center gap-1.5 text-[11px] font-medium px-3 py-1.5 rounded-xl
                       bg-amber-500/10 border border-amber-500/20 text-amber-400
                       hover:bg-amber-500/[0.15] transition-colors">
            <FileText className="w-3.5 h-3.5" /> Brief
          </button>
          <button
            onClick={handleScore}
            disabled={scoring}
            className="flex items-center gap-1.5 text-[11px] font-semibold px-3 py-1.5 rounded-xl
                       bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white transition-colors">
            {scoring
              ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Scoring…</>
              : <><RefreshCw className="w-3.5 h-3.5" /> Score Deal</>
            }
          </button>
        </div>
      </div>

      {/* ── Body ──────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-hidden flex min-h-0">

        {/* LEFT ─ 400px */}
        <div className="w-[400px] border-r border-white/[0.06] flex flex-col flex-shrink-0">

          {/* Score card */}
          <div className="p-5 border-b border-white/[0.06]">
            <div className="flex items-start gap-4">
              {pct !== null
                ? <ScoreGauge prob={deal.win_probability!} low={deal.probability_low!} high={deal.probability_high!} />
                : <div className="w-32 h-[72px] flex items-center justify-center bg-slate-900/40 rounded-xl border border-white/[0.04]">
                    <p className="text-[9px] text-slate-600">Not scored</p>
                  </div>
              }
              <div className="flex-1 grid grid-cols-2 gap-2">
                {[
                  { icon: DollarSign, label: 'Value',     val: `$${(deal.value || 0).toLocaleString()}` },
                  { icon: Clock,      label: 'Est. Close', val: deal.time_to_close_days ? `${deal.time_to_close_days}d` : '—' },
                  { icon: Building2,  label: 'Company',   val: deal.company || '—' },
                  { icon: CheckCircle2,label:'Owner',      val: deal.owner || '—' },
                ].map(({ icon: Icon, label, val }) => (
                  <div key={label} className="bg-slate-900/40 border border-white/[0.04] rounded-xl p-2">
                    <div className="flex items-center gap-1 mb-1">
                      <Icon className="w-2.5 h-2.5 text-slate-700" />
                      <p className="text-[8px] text-slate-600 uppercase tracking-wider">{label}</p>
                    </div>
                    <p className="text-[11px] font-medium text-slate-300 truncate">{val}</p>
                  </div>
                ))}
              </div>
            </div>
            {deal.score_summary && (
              <div className="mt-3 bg-slate-900/30 border border-white/[0.04] rounded-xl p-3">
                <p className="text-[9px] text-slate-600 uppercase tracking-wider mb-1">AI Assessment</p>
                <p className="text-[11.5px] text-slate-300 leading-relaxed">{deal.score_summary}</p>
              </div>
            )}
          </div>

          {/* Tabs */}
          <div className="px-3 py-2.5 border-b border-white/[0.06] flex gap-1 flex-shrink-0 flex-wrap">
            {([
              ['overview',  'Overview'],
              ['meddic',    'MEDDIC'],
              ['timeline',  'Timeline'],
              ['documents', 'Documents'],
              ['capture',   '🎙 Calls'],
            ] as const).map(([t, label]) => (
              <TabBtn key={t} active={tab === t} onClick={() => setTab(t)}>{label}</TabBtn>
            ))}
          </div>

          {/* Tab body */}
          <div className="flex-1 overflow-y-auto p-4">

            {/* Overview */}
            {tab === 'overview' && (
              <div className="space-y-4">
                {deal.risk_flags?.length > 0 && (
                  <div>
                    <p className="text-[9px] font-semibold text-slate-600 uppercase tracking-[0.1em] mb-2">Risk Flags</p>
                    <div className="space-y-1.5">
                      {deal.risk_flags.map((r, i) => (
                        <div key={i} className="flex items-start gap-2 bg-red-950/20 border border-red-500/15 rounded-xl p-2.5">
                          <AlertTriangle className="w-3 h-3 text-red-400 flex-shrink-0 mt-0.5" />
                          <p className="text-[11px] text-slate-400 leading-relaxed">{r}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {evidence.length > 0 && (
                  <div>
                    <p className="text-[9px] font-semibold text-slate-600 uppercase tracking-[0.1em] mb-2">Evidence</p>
                    <div className="space-y-2">
                      {evidence.map((e, i) => (
                        <div key={i} className={cn(
                          'rounded-xl border p-3',
                          e.type === 'positive'
                            ? 'bg-emerald-950/20 border-emerald-500/15'
                            : 'bg-red-950/20 border-red-500/15'
                        )}>
                          <div className="flex justify-between mb-1.5">
                            <span className={cn(
                              'text-[9px] font-bold uppercase tracking-wider',
                              e.type === 'positive' ? 'text-emerald-400' : 'text-red-400'
                            )}>
                              {e.type === 'positive' ? '▲' : '▼'} {e.impact > 0 ? '+' : ''}{Math.round(e.impact * 100)}pp
                            </span>
                            <span className="text-[9px] text-slate-700">{e.filename}</span>
                          </div>
                          <p className="text-[11px] text-slate-400 italic leading-relaxed">&ldquo;{e.excerpt}&rdquo;</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {!evidence.length && !deal.risk_flags?.length && (
                  <div className="text-center py-10">
                    <p className="text-[11px] text-slate-700">Upload documents then score the deal to see evidence.</p>
                  </div>
                )}
              </div>
            )}

            {/* MEDDIC */}
            {tab === 'meddic' && (
              <MEDDICPanel meddic={deal.meddic} onExtract={handleScore} extracting={scoring} />
            )}

            {/* Timeline */}
            {tab === 'timeline' && <DealHealthTimeline history={history} />}

            {/* Documents */}
            {tab === 'documents' && (
              <div className="space-y-3">
                <div {...getRootProps()}
                  className={cn(
                    'border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition-all',
                    isDragActive ? 'border-indigo-500/60 bg-indigo-500/5' : 'border-white/[0.05] hover:border-white/[0.1]'
                  )}>
                  <input {...getInputProps()} />
                  {uploading
                    ? <div className="flex items-center justify-center gap-2 text-[11px] text-indigo-400">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" /> Uploading…
                      </div>
                    : <>
                        <Upload className="w-4 h-4 mx-auto mb-1.5 text-slate-700" />
                        <p className="text-[11px] text-slate-600">Drop PDF, audio, or text</p>
                      </>
                  }
                </div>
                <div className="space-y-1.5">
                  {docs.map(d => (
                    <div key={d.id} className="flex items-center gap-2.5 bg-[#0c1220] border border-white/[0.05] rounded-xl px-3 py-2.5">
                      <div className={cn(
                        'w-1.5 h-1.5 rounded-full flex-shrink-0',
                        d.status === 'done' ? 'bg-emerald-500' : d.status === 'processing' ? 'bg-amber-500 animate-pulse' : 'bg-slate-700'
                      )} />
                      <div className="flex-1 min-w-0">
                        <p className="text-[12px] text-slate-300 truncate">{d.filename}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <p className="text-[9px] text-slate-700 capitalize">{d.source_type}</p>
                          <SentBadge score={d.sentiment_score} label={d.sentiment_label} />
                        </div>
                      </div>
                    </div>
                  ))}
                  {docs.length === 0 && (
                    <p className="text-[11px] text-slate-700 text-center py-6">No documents yet.</p>
                  )}
                </div>
              </div>
            )}

            {/* Call capture */}
            {tab === 'capture' && <CallCaptureZone dealId={id} onComplete={load} />}
          </div>
        </div>

        {/* RIGHT ─ flex-1 */}
        <div className="flex-1 flex flex-col min-w-0">

          {/* Right tab bar */}
          <div className="px-5 py-2.5 border-b border-white/[0.06] flex gap-1 flex-shrink-0">
            <TabBtn active={rightTab === 'signals'} onClick={() => setRightTab('signals')}>
              ⚡ Signals {deal.signals?.length ? `(${deal.signals.length})` : ''}
            </TabBtn>
            <TabBtn active={rightTab === 'qa'} onClick={() => setRightTab('qa')}>
              💬 Ask AI
            </TabBtn>
          </div>

          {/* Signals */}
          {rightTab === 'signals' && (
            <div className="flex-1 overflow-y-auto p-5">
              {deal.signals?.length > 0
                ? <SignalCards signals={deal.signals} />
                : (
                  <div className="flex flex-col items-center justify-center h-full py-16 text-center">
                    <div className="w-10 h-10 rounded-xl bg-slate-800/60 flex items-center justify-center mb-3">
                      <TrendingUp className="w-5 h-5 text-slate-600" />
                    </div>
                    <p className="text-[12px] text-slate-600">No signals detected yet.</p>
                    <p className="text-[11px] text-slate-700 mt-1">Upload documents and score the deal.</p>
                  </div>
                )
              }
            </div>
          )}

          {/* Q&A */}
          {rightTab === 'qa' && (
            <div className="flex-1 flex flex-col min-h-0">
              <div className="flex-1 overflow-y-auto p-5 space-y-4">
                {qaHistory.length === 0 && (
                  <div className="text-center py-12">
                    <MessageSquare className="w-8 h-8 text-slate-700 mx-auto mb-3" />
                    <p className="text-[12px] text-slate-600 mb-3">Ask anything about this deal</p>
                    {[
                      'Who is the decision maker?',
                      'What objections were raised?',
                      'What is the timeline?',
                    ].map(q => (
                      <button key={q} onClick={() => setQaInput(q)}
                        className="block w-full text-left text-[11px] text-slate-600 hover:text-slate-400
                                   bg-slate-900/40 border border-white/[0.04] rounded-xl px-3 py-2 mb-1.5 transition-colors">
                        {q}
                      </button>
                    ))}
                  </div>
                )}
                {qaHistory.map((item, i) => (
                  <div key={i} className="space-y-2">
                    <div className="flex justify-end">
                      <div className="bg-indigo-500/10 border border-indigo-500/20 rounded-xl px-3 py-2 max-w-[85%]">
                        <p className="text-[12px] text-indigo-200">{item.q}</p>
                      </div>
                    </div>
                    <div className="bg-slate-900/40 border border-white/[0.04] rounded-xl p-3 max-w-[95%]">
                      <p className="text-[12px] text-slate-300 leading-relaxed whitespace-pre-wrap">{item.a}</p>
                      {item.sources?.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-2 pt-2 border-t border-white/[0.05]">
                          {item.sources.map((s, si) => (
                            <span key={si} className="text-[9px] text-slate-600 bg-slate-800/60 px-1.5 py-0.5 rounded-md">
                              📄 {s}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
                {qaLoading && (
                  <div className="bg-slate-900/40 border border-white/[0.04] rounded-xl p-3 w-14">
                    <Loader2 className="w-4 h-4 text-slate-600 animate-spin" />
                  </div>
                )}
              </div>

              {/* Input */}
              <div className="p-4 border-t border-white/[0.06]">
                <div className="flex gap-2">
                  <input
                    value={qaInput}
                    onChange={e => setQaInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleQa()}
                    placeholder="Ask about this deal…"
                    className="flex-1 bg-[#0c1220] border border-white/[0.06] rounded-xl px-3 py-2.5
                               text-[12px] text-white placeholder-slate-700
                               focus:outline-none focus:border-indigo-500/40 transition-colors"
                  />
                  <button onClick={handleQa} disabled={qaLoading || !qaInput.trim()}
                    className="w-9 h-9 flex items-center justify-center bg-indigo-600
                               hover:bg-indigo-500 disabled:opacity-40 rounded-xl transition-colors flex-shrink-0">
                    <Send className="w-3.5 h-3.5 text-white" />
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
