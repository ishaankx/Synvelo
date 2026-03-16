'use client'
import { useState, useEffect } from 'react'
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
  high:   'text-red-600 bg-red-50 border-red-200',
  medium: 'text-amber-600 bg-amber-50 border-amber-200',
  low:    'text-emerald-600 bg-emerald-50 border-emerald-200',
}

const AUTH: Record<string, string> = {
  'decision maker': 'bg-brand-50 text-brand-700 border-brand-200',
  champion:         'bg-emerald-50 text-emerald-700 border-emerald-200',
  influencer:       'bg-amber-50 text-amber-700 border-amber-200',
  unknown:          'bg-gray-100 text-gray-500 border-gray-200',
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

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

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
      className="fixed inset-0 bg-gray-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4 syn-modal-backdrop"
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div className="syn-surface border syn-border rounded-xl w-full max-w-[620px] max-h-[88vh] overflow-hidden shadow-2xl flex flex-col syn-modal-content">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b syn-border flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-amber-50 flex items-center justify-center">
              <FileText className="w-[18px] h-[18px] text-amber-600" />
            </div>
            <div>
              <p className="text-[14px] font-semibold text-gray-900">Deal Brief</p>
              <p className="text-[11px] text-gray-500">AI-generated executive summary</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {brief && (
              <button onClick={copy}
                className="flex items-center gap-1.5 text-[11px] px-3 py-1.5 rounded-lg
                           syn-surface-2 border syn-border text-gray-500
                           hover:text-gray-700 transition-colors">
                {copied ? <Check className="w-3.5 h-3.5 text-positive" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? 'Copied' : 'Copy'}
              </button>
            )}
            <button onClick={onClose}
              className="w-8 h-8 rounded-lg syn-surface-2 border syn-border
                         flex items-center justify-center hover:border-gray-300 transition-colors">
              <X className="w-4 h-4 text-gray-500" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 syn-scroll">

          {!brief && !generating && (
            <div className="flex flex-col items-center justify-center py-16 px-8 text-center">
              <div className="w-14 h-14 rounded-xl bg-amber-50 flex items-center justify-center mb-4">
                <FileText className="w-7 h-7 text-amber-600" />
              </div>
              <p className="text-[16px] font-semibold text-gray-900 mb-2">Generate Executive Brief</p>
              <p className="text-gray-500 text-[13px] max-w-xs mb-6 leading-relaxed">
                Full deal summary for CRO reviews, QBR prep, or manager handoffs — generated from all deal documents.
              </p>
              <button onClick={onGenerate}
                className="bg-amber-500 hover:bg-amber-400 text-white font-semibold px-5 py-2.5 rounded-lg text-[13px] transition-colors">
                Generate Brief
              </button>
            </div>
          )}

          {generating && (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <Loader2 className="w-7 h-7 text-amber-600 animate-spin" />
              <p className="text-gray-500 text-[13px]">Synthesizing deal documents...</p>
            </div>
          )}

          {brief && !generating && (
            <div className="p-5 space-y-3">

              {/* Executive summary */}
              <div className="syn-card p-4">
                <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-2">
                  Executive Summary
                </p>
                <p className="text-[13px] text-gray-800 leading-relaxed">
                  {brief.executive_summary}
                </p>
              </div>

              {/* Status + velocity */}
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: 'Deal Status',  val: brief.deal_status },
                  { label: 'Deal Velocity', val: brief.deal_velocity },
                ].map(({ label, val }) => val && (
                  <div key={label} className="syn-card p-4">
                    <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5">{label}</p>
                    <p className="text-[12px] text-gray-700 leading-relaxed">{val}</p>
                  </div>
                ))}
              </div>

              {/* Key contacts */}
              {!!brief.key_contacts?.length && (
                <div className="syn-card p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Users className="w-4 h-4 text-gray-500" />
                    <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Key Contacts</p>
                  </div>
                  <div className="space-y-2.5">
                    {brief.key_contacts.map((c, i) => (
                      <div key={i} className="flex items-center justify-between gap-3">
                        <span className="text-[13px] font-medium text-gray-800 flex-shrink-0">{c.name}</span>
                        <span className="text-[12px] text-gray-500 flex-1 text-center">{c.role}</span>
                        <span className={cn(
                          'text-[11px] font-semibold px-2 py-0.5 rounded-md border flex-shrink-0',
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
                <div className="syn-card p-4">
                  <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-3">Top Risks</p>
                  <div className="space-y-3">
                    {brief.top_3_risks.map((r, i) => (
                      <div key={i} className="flex items-start gap-2.5">
                        <AlertTriangle className="w-4 h-4 text-warning flex-shrink-0 mt-0.5" />
                        <div>
                          <div className="flex items-center gap-2 mb-0.5">
                            <span className="text-[13px] text-gray-800 font-medium">{r.risk}</span>
                            <span className={cn(
                              'text-[11px] font-semibold px-2 py-0.5 rounded-md border',
                              SEV[r.severity?.toLowerCase()] ?? SEV.medium
                            )}>
                              {r.severity}
                            </span>
                          </div>
                          <p className="text-[12px] text-gray-500 leading-relaxed">{r.mitigation}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Next best action */}
              {brief.next_best_action && (
                <div className="bg-brand-50 border border-brand-200 rounded-xl p-4">
                  <p className="text-[11px] font-semibold text-brand-700 uppercase tracking-wider mb-2">
                    Next Best Action
                  </p>
                  <div className="flex items-start gap-2">
                    <ArrowRight className="w-4 h-4 text-brand-700 flex-shrink-0 mt-0.5" />
                    <p className="text-[13px] text-brand-700 font-medium leading-relaxed">
                      {brief.next_best_action}
                    </p>
                  </div>
                </div>
              )}

              <button onClick={onGenerate}
                className="w-full text-center text-[11px] text-gray-400 hover:text-gray-600 transition-colors py-2">
                Regenerate brief
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
