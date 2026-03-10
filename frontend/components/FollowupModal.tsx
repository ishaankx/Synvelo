'use client'
import { useState } from 'react'
import { X, Copy, Check, Mail, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface FollowupData {
  subject:               string
  body:                  string
  key_points_referenced: string[]
  tone:                  string
}

const TONE_COLOR: Record<string, string> = {
  consultative:         'bg-indigo-500/10 text-indigo-400 border-indigo-500/20',
  urgent:               'bg-red-500/10 text-red-400 border-red-500/20',
  'relationship-building': 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
}

export default function FollowupModal({
  data, onClose, onGenerate, generating,
}: {
  data:        FollowupData | null
  onClose:     () => void
  onGenerate:  () => void
  generating:  boolean
}) {
  const [copied, setCopied] = useState(false)

  const copy = () => {
    if (!data) return
    navigator.clipboard.writeText(`Subject: ${data.subject}\n\n${data.body}`)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div
      className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-[#070b12] border border-white/[0.07] rounded-2xl w-full max-w-[560px] max-h-[88vh] overflow-hidden shadow-2xl flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06] flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center">
              <Mail className="w-4 h-4 text-violet-400" />
            </div>
            <div>
              <p className="text-[13px] font-semibold text-white">Follow-up Email</p>
              <p className="text-[10px] text-slate-600">Context-aware draft from your deal documents</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {data && (
              <button onClick={copy}
                className="flex items-center gap-1.5 text-[10px] px-2.5 py-1.5 rounded-lg
                           bg-slate-800/60 border border-white/[0.06] text-slate-500
                           hover:text-slate-300 transition-colors">
                {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                {copied ? 'Copied' : 'Copy email'}
              </button>
            )}
            <button onClick={onClose}
              className="w-7 h-7 rounded-lg bg-slate-800/60 border border-white/[0.06]
                         flex items-center justify-center hover:bg-slate-700/60 transition-colors">
              <X className="w-3.5 h-3.5 text-slate-500" />
            </button>
          </div>
        </div>

        <div className="overflow-y-auto flex-1">
          {!data && !generating && (
            <div className="flex flex-col items-center justify-center py-16 px-8 text-center">
              <div className="w-14 h-14 rounded-2xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center mb-4">
                <Mail className="w-7 h-7 text-violet-400" />
              </div>
              <p className="text-[14px] font-semibold text-white mb-2">Draft Follow-up Email</p>
              <p className="text-slate-600 text-[12px] max-w-xs mb-6 leading-relaxed">
                References specific things from calls, emails, and ERP proposals — so your follow-up lands.
              </p>
              <button onClick={onGenerate}
                className="bg-violet-600 hover:bg-violet-500 text-white font-semibold px-5 py-2 rounded-xl text-[12px] transition-colors">
                Draft Email
              </button>
            </div>
          )}

          {generating && (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <Loader2 className="w-7 h-7 text-violet-400 animate-spin" />
              <p className="text-slate-500 text-[12px]">Reading your deal documents…</p>
            </div>
          )}

          {data && !generating && (
            <div className="p-5 space-y-3">
              {data.tone && (
                <span className={cn(
                  'inline-flex text-[9px] font-semibold px-2 py-0.5 rounded-full border capitalize',
                  TONE_COLOR[data.tone] ?? 'bg-slate-800 text-slate-500 border-white/[0.06]'
                )}>
                  {data.tone}
                </span>
              )}

              {/* Subject */}
              <div className="bg-[#0c1220] border border-white/[0.06] rounded-xl p-3.5">
                <p className="text-[9px] font-semibold text-slate-600 uppercase tracking-[0.1em] mb-1.5">
                  Subject Line
                </p>
                <p className="text-[13px] font-medium text-white">{data.subject}</p>
              </div>

              {/* Body */}
              <div className="bg-[#0c1220] border border-white/[0.06] rounded-xl p-3.5">
                <p className="text-[9px] font-semibold text-slate-600 uppercase tracking-[0.1em] mb-2.5">
                  Email Body
                </p>
                <pre className="text-[11.5px] text-slate-300 leading-relaxed whitespace-pre-wrap font-sans">
                  {data.body}
                </pre>
              </div>

              {/* Referenced points */}
              {!!data.key_points_referenced?.length && (
                <div className="bg-[#0c1220] border border-white/[0.06] rounded-xl p-3.5">
                  <p className="text-[9px] font-semibold text-slate-600 uppercase tracking-[0.1em] mb-2">
                    Referenced from documents
                  </p>
                  <ul className="space-y-1.5">
                    {data.key_points_referenced.map((pt, i) => (
                      <li key={i} className="flex items-start gap-2 text-[11.5px] text-slate-500">
                        <span className="text-indigo-500 flex-shrink-0 mt-0.5">·</span>
                        {pt}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <button onClick={onGenerate}
                className="w-full text-center text-[10px] text-slate-700 hover:text-slate-500 transition-colors py-1">
                ↻ Regenerate draft
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
