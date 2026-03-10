'use client'
import { useState } from 'react'
import { cn } from '@/lib/utils'
import { X, Copy, Check, AlertTriangle, ArrowRight, Loader2, FileText, Users } from 'lucide-react'

export interface BriefData {
  deal_status?:               string
  key_contacts?:              Array<{ name: string; role: string; authority: string }>
  last_interaction_summary?:  string
  win_probability_assessment?: string
  top_3_risks?:               Array<{ risk: string; severity: string; mitigation: string }>
  next_best_action?:          string
  deal_velocity?:             string
  executive_summary?:         string
}

const SEV: Record<string, string> = {
  high:   'text-red-400 bg-red-500/10 border-red-500/20',
  medium: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
  low:    'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
}

const AUTH: Record<string, string> = {
  'decision maker': 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20',
  champion:         'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  influencer:       'bg-amber-500/10 text-amber-400 border-amber-500/20',
  unknown:          'bg-slate-800/60 text-slate-500 border-white/[0.05]',
}

export default function DealBriefModal({
  brief, onClose, onGenerate, generating,
}: {
  brief:       BriefData | null
  onClose:     () => void
  onGenerate:  () => void
  generating:  boolean
}) {
  const [copied, setCopied] = useState(false)

  const copy = () => {
    if (!brief) return
    const text = [
      `DEAL BRIEF`,
      ``,
      brief.executive_summary,
      ``,
      `Status: ${brief.deal_status}`,
      `Velocity: ${brief.deal_velocity}`,
      `Next Action: ${brief.next_best_action}`,
      ``,
      `Risks:`,
      ...(brief.top_3_risks?.map(r => `• [${r.severity?.toUpperCase()}] ${r.risk}`) ?? []),
    ].join('\n')
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div
      className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-[#070b12] border border-white/[0.07] rounded-2xl w-full max-w-[620px] max-h-[88vh] overflow-hidden shadow-2xl flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06] flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
              <FileText className="w-4 h-4 text-amber-400" />
            </div>
            <div>
              <p className="text-[13px] font-semibold text-white">Deal Brief</p>
              <p className="text-[10px] text-slate-600">AI-generated executive summary</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {brief && (
              <button onClick={copy}
                className="flex items-center gap-1.5 text-[10px] px-2.5 py-1.5 rounded-lg
                           bg-slate-800/60 border border-white/[0.06] text-slate-500
                           hover:text-slate-300 transition-colors">
                {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                {copied ? 'Copied' : 'Copy'}
              </button>
            )}
            <button onClick={onClose}
              className="w-7 h-7 rounded-lg bg-slate-800/60 border border-white/[0.06]
                         flex items-center justify-center hover:bg-slate-700/60 transition-colors">
              <X className="w-3.5 h-3.5 text-slate-500" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 scrollbar-thin">

          {!brief && !generating && (
            <div className="flex flex-col items-center justify-center py-16 px-8 text-center">
              <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center mb-4">
                <FileText className="w-7 h-7 text-amber-400" />
              </div>
              <p className="text-[14px] font-semibold text-white mb-2">Generate Executive Brief</p>
              <p className="text-slate-600 text-[12px] max-w-xs mb-6 leading-relaxed">
                Full deal summary for CRO reviews, QBR prep, or manager handoffs — generated from all deal documents.
              </p>
              <button onClick={onGenerate}
                className="bg-amber-500 hover:bg-amber-400 text-black font-semibold px-5 py-2 rounded-xl text-[12px] transition-colors">
                Generate Brief
              </button>
            </div>
          )}

          {generating && (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <Loader2 className="w-7 h-7 text-amber-400 animate-spin" />
              <p className="text-slate-500 text-[12px]">Synthesizing deal documents…</p>
            </div>
          )}

          {brief && !generating && (
            <div className="p-5 space-y-3">

              {/* Executive summary */}
              <div className="bg-[#0c1220] border border-white/[0.06] rounded-xl p-4">
                <p className="text-[9px] font-semibold text-slate-600 uppercase tracking-[0.1em] mb-2">
                  Executive Summary
                </p>
                <p className="text-[12.5px] text-slate-200 leading-relaxed">
                  {brief.executive_summary}
                </p>
              </div>

              {/* Status + velocity */}
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: 'Deal Status',  val: brief.deal_status },
                  { label: 'Deal Velocity', val: brief.deal_velocity },
                ].map(({ label, val }) => val && (
                  <div key={label} className="bg-[#0c1220] border border-white/[0.06] rounded-xl p-3.5">
                    <p className="text-[9px] font-semibold text-slate-600 uppercase tracking-[0.1em] mb-1.5">{label}</p>
                    <p className="text-[11.5px] text-slate-300 leading-relaxed">{val}</p>
                  </div>
                ))}
              </div>

              {/* Key contacts */}
              {!!brief.key_contacts?.length && (
                <div className="bg-[#0c1220] border border-white/[0.06] rounded-xl p-3.5">
                  <div className="flex items-center gap-2 mb-2.5">
                    <Users className="w-3 h-3 text-slate-600" />
                    <p className="text-[9px] font-semibold text-slate-600 uppercase tracking-[0.1em]">Key Contacts</p>
                  </div>
                  <div className="space-y-2">
                    {brief.key_contacts.map((c, i) => (
                      <div key={i} className="flex items-center justify-between gap-3">
                        <span className="text-[12px] font-medium text-slate-200 flex-shrink-0">{c.name}</span>
                        <span className="text-[11px] text-slate-500 flex-1 text-center">{c.role}</span>
                        <span className={cn(
                          'text-[9px] font-semibold px-1.5 py-0.5 rounded-full border flex-shrink-0',
                          AUTH[c.authority?.toLowerCase()] ?? AUTH.unknown
                        )}>
                          {c.authority}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Risks */}
              {!!brief.top_3_risks?.length && (
                <div className="bg-[#0c1220] border border-white/[0.06] rounded-xl p-3.5">
                  <p className="text-[9px] font-semibold text-slate-600 uppercase tracking-[0.1em] mb-2.5">Top Risks</p>
                  <div className="space-y-2.5">
                    {brief.top_3_risks.map((r, i) => (
                      <div key={i} className="flex items-start gap-2.5">
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-500 flex-shrink-0 mt-0.5" />
                        <div>
                          <div className="flex items-center gap-1.5 mb-0.5">
                            <span className="text-[12px] text-slate-200 font-medium">{r.risk}</span>
                            <span className={cn(
                              'text-[9px] font-semibold px-1.5 py-0.5 rounded-full border',
                              SEV[r.severity?.toLowerCase()] ?? SEV.medium
                            )}>
                              {r.severity}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-600 leading-relaxed">{r.mitigation}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Next best action */}
              {brief.next_best_action && (
                <div className="bg-indigo-950/40 border border-indigo-500/20 rounded-xl p-3.5">
                  <p className="text-[9px] font-semibold text-indigo-500 uppercase tracking-[0.1em] mb-2">
                    Next Best Action
                  </p>
                  <div className="flex items-start gap-2">
                    <ArrowRight className="w-3.5 h-3.5 text-indigo-400 flex-shrink-0 mt-0.5" />
                    <p className="text-[12.5px] text-indigo-200 font-medium leading-relaxed">
                      {brief.next_best_action}
                    </p>
                  </div>
                </div>
              )}

              <button onClick={onGenerate}
                className="w-full text-center text-[10px] text-slate-700 hover:text-slate-500 transition-colors py-1">
                ↻ Regenerate
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
