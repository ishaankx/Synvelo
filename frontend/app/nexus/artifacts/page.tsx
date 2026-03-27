'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { cn } from '@/lib/utils'
import { nexusApi, dealsApi } from '@/lib/api'
import {
  FileOutput, Loader2, ArrowLeft, FileText, Calculator,
  Swords, Mail, CheckCircle2, AlertTriangle, ChevronDown, ChevronUp,
} from 'lucide-react'

interface Artifact {
  artifact_id: string
  artifact_type: string
  status: string
  content_json: Record<string, any> | null
  created_at: string | null
}

interface Deal {
  id: string; name: string; company: string
}

const TYPE_META: Record<string, { icon: any; label: string; color: string; bg: string }> = {
  proposal_pdf:    { icon: FileText,   label: 'Proposal',        color: 'text-indigo-600', bg: 'bg-indigo-500/10' },
  roi_calculator:  { icon: Calculator, label: 'ROI Calculator',  color: 'text-emerald-600', bg: 'bg-emerald-500/10' },
  battle_card:     { icon: Swords,     label: 'Battle Card',     color: 'text-amber-600', bg: 'bg-amber-500/10' },
  next_best_email: { icon: Mail,       label: 'Next Best Email', color: 'text-violet-600', bg: 'bg-violet-500/10' },
}

const ALL_TYPES = ['proposal_pdf', 'roi_calculator', 'battle_card', 'next_best_email']

function ArtifactCard({ artifact }: { artifact: Artifact }) {
  const [expanded, setExpanded] = useState(false)
  const meta = TYPE_META[artifact.artifact_type] || TYPE_META.proposal_pdf
  const Icon = meta.icon

  return (
    <div className="syn-card overflow-hidden">
      <button onClick={() => setExpanded(!expanded)}
        className="w-full px-6 py-4 flex items-center gap-3 hover:bg-gray-50 transition-colors">
        <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center', meta.bg)}>
          <Icon className={cn('w-4 h-4', meta.color)} />
        </div>
        <div className="flex-1 text-left">
          <p className="text-[13px] font-semibold syn-text-primary">{meta.label}</p>
          <p className="text-[11px] syn-text-muted">
            {artifact.created_at ? new Date(artifact.created_at).toLocaleString() : '—'}
          </p>
        </div>
        {artifact.status === 'ready' ? (
          <CheckCircle2 className="w-4 h-4 text-emerald-500" />
        ) : (
          <AlertTriangle className="w-4 h-4 text-amber-500" />
        )}
        {expanded ? <ChevronUp className="w-4 h-4 syn-text-muted" /> : <ChevronDown className="w-4 h-4 syn-text-muted" />}
      </button>

      {expanded && artifact.content_json && (
        <div className="px-6 pb-5 border-t syn-border pt-4">
          {artifact.artifact_type === 'proposal_pdf' && <ProposalView data={artifact.content_json} />}
          {artifact.artifact_type === 'roi_calculator' && <RoiView data={artifact.content_json} />}
          {artifact.artifact_type === 'battle_card' && <BattleCardView data={artifact.content_json} />}
          {artifact.artifact_type === 'next_best_email' && <EmailView data={artifact.content_json} />}
        </div>
      )}
    </div>
  )
}

function ProposalView({ data }: { data: Record<string, any> }) {
  return (
    <div className="space-y-4">
      {data.title && <h3 className="text-[15px] font-bold syn-text-primary">{data.title}</h3>}
      {data.executive_summary && <p className="text-[13px] syn-text-secondary leading-relaxed">{data.executive_summary}</p>}
      {data.value_proposition && (
        <div>
          <p className="text-[11px] font-semibold syn-text-tertiary uppercase tracking-wider mb-2">Value Proposition</p>
          <ul className="space-y-1">
            {data.value_proposition.map((v: string, i: number) => (
              <li key={i} className="text-[12px] syn-text-secondary flex items-start gap-2">
                <span className="text-emerald-500 mt-0.5">•</span> {v}
              </li>
            ))}
          </ul>
        </div>
      )}
      {data.pricing && (
        <div className="bg-gray-50 rounded-lg p-4">
          <p className="text-[11px] font-semibold syn-text-tertiary uppercase tracking-wider mb-2">Pricing</p>
          <div className="grid grid-cols-3 gap-3 text-[12px]">
            <div><span className="syn-text-muted">Base:</span> <span className="font-semibold">${data.pricing.base_value?.toLocaleString()}</span></div>
            <div><span className="syn-text-muted">Discount:</span> <span className="font-semibold">{data.pricing.discount_pct}%</span></div>
            <div><span className="syn-text-muted">Final:</span> <span className="font-semibold text-emerald-600">${data.pricing.final_value?.toLocaleString()}</span></div>
          </div>
        </div>
      )}
    </div>
  )
}

function RoiView({ data }: { data: Record<string, any> }) {
  return (
    <div className="space-y-4">
      {data.headline && <h3 className="text-[15px] font-bold syn-text-primary">{data.headline}</h3>}
      {data.payback_period && (
        <div className="flex gap-4">
          <div className="bg-emerald-50 rounded-lg p-3 flex-1">
            <p className="text-[11px] text-emerald-700 font-semibold">Payback Period</p>
            <p className="text-[18px] font-bold text-emerald-600">{data.payback_period}</p>
          </div>
          {data.three_year_roi_pct != null && (
            <div className="bg-indigo-50 rounded-lg p-3 flex-1">
              <p className="text-[11px] text-indigo-700 font-semibold">3-Year ROI</p>
              <p className="text-[18px] font-bold text-indigo-600">{data.three_year_roi_pct}%</p>
            </div>
          )}
        </div>
      )}
      {data.roi_timeline && (
        <div className="space-y-2">
          {data.roi_timeline.map((t: any, i: number) => (
            <div key={i} className="flex items-center gap-3 text-[12px]">
              <span className="w-20 syn-text-muted font-medium">{t.period}</span>
              <span className="flex-1 syn-text-secondary">{t.milestone}</span>
              <span className="font-semibold text-emerald-600">${t.cumulative_savings?.toLocaleString()}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function BattleCardView({ data }: { data: Record<string, any> }) {
  return (
    <div className="space-y-4">
      {data.win_theme && (
        <div className="bg-indigo-50 rounded-lg p-3">
          <p className="text-[11px] text-indigo-700 font-semibold uppercase">Win Theme</p>
          <p className="text-[13px] text-indigo-800 font-medium">{data.win_theme}</p>
        </div>
      )}
      {data.our_strengths && (
        <div>
          <p className="text-[11px] font-semibold text-emerald-700 uppercase tracking-wider mb-1">Our Strengths</p>
          <ul className="space-y-1">{data.our_strengths.map((s: string, i: number) => (
            <li key={i} className="text-[12px] syn-text-secondary">• {s}</li>
          ))}</ul>
        </div>
      )}
      {data.objection_handlers && (
        <div>
          <p className="text-[11px] font-semibold syn-text-tertiary uppercase tracking-wider mb-2">Objection Handlers</p>
          <div className="space-y-2">
            {data.objection_handlers.map((o: any, i: number) => (
              <div key={i} className="bg-gray-50 rounded-lg p-3">
                <p className="text-[12px] font-semibold text-red-600 mb-1">"{o.objection}"</p>
                <p className="text-[12px] syn-text-secondary">{o.response}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function EmailView({ data }: { data: Record<string, any> }) {
  return (
    <div className="space-y-3">
      <div className="bg-gray-50 rounded-lg p-4">
        <p className="text-[11px] syn-text-muted mb-1">Subject</p>
        <p className="text-[14px] font-semibold syn-text-primary">{data.subject}</p>
      </div>
      <div className="bg-white border syn-border rounded-lg p-4">
        <pre className="text-[13px] syn-text-secondary whitespace-pre-wrap font-sans leading-relaxed">
          {data.body}
        </pre>
      </div>
      {data.call_to_action && (
        <div className="flex items-center gap-2">
          <span className="text-[11px] syn-text-muted">CTA:</span>
          <span className="text-[12px] font-medium text-indigo-600">{data.call_to_action}</span>
        </div>
      )}
      {data.send_timing && (
        <p className="text-[11px] syn-text-muted">Recommended send: {data.send_timing}</p>
      )}
    </div>
  )
}

export default function ArtifactsPage() {
  const params = useSearchParams()
  const simId = params.get('sim') || ''
  const dealId = params.get('deal') || ''

  const [artifacts, setArtifacts] = useState<Artifact[]>([])
  const [generating, setGenerating] = useState(false)
  const [loading, setLoading] = useState(true)
  const [deals, setDeals] = useState<Deal[]>([])
  const [selectedDeal, setSelectedDeal] = useState(dealId)

  useEffect(() => {
    dealsApi.list().then(r => setDeals(r.data)).catch(() => {})
  }, [])

  useEffect(() => {
    if (selectedDeal) {
      setLoading(true)
      nexusApi.artifacts(selectedDeal)
        .then(r => setArtifacts(r.data))
        .catch(() => {})
        .finally(() => setLoading(false))
    } else {
      setArtifacts([])
      setLoading(false)
    }
  }, [selectedDeal])

  const handleGenerate = async () => {
    if (!simId || !selectedDeal) return
    setGenerating(true)
    try {
      const r = await nexusApi.generateArtifacts(simId, selectedDeal, ALL_TYPES)
      setArtifacts(r.data)
    } catch (e: any) {
      alert(e.response?.data?.detail || 'Generation failed')
    }
    setGenerating(false)
  }

  return (
    <div className="flex flex-col h-full syn-bg">
      {/* Header */}
      <div className="h-16 border-b syn-border px-6 flex items-center gap-3 flex-shrink-0">
        <Link href="/nexus" className="text-gray-400 hover:text-gray-600 transition-colors">
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <div className="w-9 h-9 rounded-lg bg-amber-500/10 flex items-center justify-center">
          <FileOutput className="w-5 h-5 text-amber-500" />
        </div>
        <div>
          <h1 className="text-[18px] font-semibold syn-text-primary">Execution Artifacts</h1>
          <p className="text-[12px] text-gray-500">ML-grounded proposals, ROI calculators, battle cards, emails</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto syn-scroll p-6 space-y-6">

        {/* Deal Selector + Generate */}
        <div className="syn-card p-6">
          <div className="flex gap-3 items-end">
            <div className="flex-1">
              <p className="text-[11px] font-semibold syn-text-tertiary uppercase tracking-wider mb-1.5">Deal</p>
              <select value={selectedDeal} onChange={e => setSelectedDeal(e.target.value)}
                className="w-full px-3 py-2.5 border syn-border rounded-lg text-[13px] syn-text-primary bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20">
                <option value="">Select a deal…</option>
                {deals.map(d => (
                  <option key={d.id} value={d.id}>{d.name} — {d.company}</option>
                ))}
              </select>
            </div>
            {simId && (
              <button onClick={handleGenerate} disabled={generating || !selectedDeal}
                className="flex items-center gap-2 px-5 py-2.5 text-[12px] font-medium rounded-lg
                           bg-amber-500 text-white hover:bg-amber-600 transition-all disabled:opacity-50">
                {generating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileOutput className="w-3.5 h-3.5" />}
                {generating ? 'Generating…' : 'Generate All Artifacts'}
              </button>
            )}
          </div>
        </div>

        {/* Artifacts List */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-5 h-5 syn-text-muted animate-spin" />
          </div>
        ) : artifacts.length === 0 ? (
          <div className="syn-card p-12 text-center">
            <FileOutput className="w-10 h-10 syn-text-muted mx-auto mb-3" />
            <p className="text-[13px] syn-text-tertiary">No artifacts yet.</p>
            <p className="text-[12px] syn-text-muted mt-1">
              Run a simulation first, then generate artifacts from the results.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {artifacts.map(a => (
              <ArtifactCard key={a.artifact_id || a.artifact_type} artifact={a} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
