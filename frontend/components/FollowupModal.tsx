'use client'
import { useState, useEffect } from 'react'
import { X, Copy, Check, Mail, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface FollowupData {
  subject:               string
  body:                  string
  key_points_referenced: string[]
  tone:                  string
}

const TONE_COLOR: Record<string, string> = {
  consultative:            'bg-brand-50 text-brand-700 border-brand-200',
  urgent:                  'bg-red-50 text-red-600 border-red-200',
  'relationship-building': 'bg-emerald-50 text-emerald-700 border-emerald-200',
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

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  const copy = () => {
    if (!data) return
    navigator.clipboard.writeText(`Subject: ${data.subject}\n\n${data.body}`)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div
      className="fixed inset-0 bg-gray-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4 syn-modal-backdrop"
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div className="syn-surface border syn-border rounded-xl w-full max-w-[560px] max-h-[88vh] overflow-hidden shadow-2xl flex flex-col syn-modal-content">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b syn-border flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-violet-50 flex items-center justify-center">
              <Mail className="w-[18px] h-[18px] text-violet-600" />
            </div>
            <div>
              <p className="text-[14px] font-semibold text-gray-900">Follow-up Email</p>
              <p className="text-[11px] text-gray-500">Context-aware draft from your deal documents</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {data && (
              <button onClick={copy}
                className="flex items-center gap-1.5 text-[11px] px-3 py-1.5 rounded-lg
                           syn-surface-2 border syn-border text-gray-500
                           hover:text-gray-700 transition-colors">
                {copied ? <Check className="w-3.5 h-3.5 text-positive" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? 'Copied' : 'Copy email'}
              </button>
            )}
            <button onClick={onClose}
              className="w-8 h-8 rounded-lg syn-surface-2 border syn-border
                         flex items-center justify-center hover:border-gray-300 transition-colors">
              <X className="w-4 h-4 text-gray-500" />
            </button>
          </div>
        </div>

        <div className="overflow-y-auto flex-1 syn-scroll">
          {!data && !generating && (
            <div className="flex flex-col items-center justify-center py-16 px-8 text-center">
              <div className="w-14 h-14 rounded-xl bg-violet-50 flex items-center justify-center mb-4">
                <Mail className="w-7 h-7 text-violet-600" />
              </div>
              <p className="text-[16px] font-semibold text-gray-900 mb-2">Draft Follow-up Email</p>
              <p className="text-gray-500 text-[13px] max-w-xs mb-6 leading-relaxed">
                References specific things from calls, emails, and ERP proposals — so your follow-up lands.
              </p>
              <button onClick={onGenerate}
                className="bg-violet-600 hover:bg-violet-500 text-white font-semibold px-5 py-2.5 rounded-lg text-[13px] transition-colors">
                Draft Email
              </button>
            </div>
          )}

          {generating && (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <Loader2 className="w-7 h-7 text-violet-600 animate-spin" />
              <p className="text-gray-500 text-[13px]">Reading your deal documents...</p>
            </div>
          )}

          {data && !generating && (
            <div className="p-5 space-y-3">
              {data.tone && (
                <span className={cn(
                  'inline-flex text-[11px] font-semibold px-2.5 py-1 rounded-md border capitalize',
                  TONE_COLOR[data.tone] ?? 'bg-gray-100 text-gray-500 border-gray-200'
                )}>
                  {data.tone}
                </span>
              )}

              {/* Subject */}
              <div className="syn-card p-4">
                <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                  Subject Line
                </p>
                <p className="text-[14px] font-medium text-gray-900">{data.subject}</p>
              </div>

              {/* Body */}
              <div className="syn-card p-4">
                <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-2.5">
                  Email Body
                </p>
                <pre className="text-[13px] text-gray-700 leading-relaxed whitespace-pre-wrap font-sans">
                  {data.body}
                </pre>
              </div>

              {/* Referenced points */}
              {!!data.key_points_referenced?.length && (
                <div className="syn-card p-4">
                  <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-2.5">
                    Referenced from documents
                  </p>
                  <ul className="space-y-2">
                    {data.key_points_referenced.map((pt, i) => (
                      <li key={i} className="flex items-start gap-2 text-[12px] text-gray-600">
                        <span className="text-brand-600 flex-shrink-0 mt-0.5">&#x2022;</span>
                        {pt}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <button onClick={onGenerate}
                className="w-full text-center text-[11px] text-gray-400 hover:text-gray-600 transition-colors py-2">
                Regenerate draft
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
