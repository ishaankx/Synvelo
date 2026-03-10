'use client'
import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import { Mic2, CheckCircle2, AlertCircle, Loader2, Clock } from 'lucide-react'
import { dealsApi, transcribeApi } from '@/lib/api'
import CallCaptureZone from '@/components/CallCaptureZone'

interface Deal { id: string; name: string; company: string }
interface Job {
  id:               string
  platform:         string
  status:           string
  call_title:       string | null
  duration_seconds: number | null
  error_message:    string | null
  created_at:       string
  completed_at:     string | null
}

const STATUS_STYLE: Record<string, string> = {
  pending:     'bg-slate-800 text-slate-500 border-white/[0.06]',
  downloading: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20',
  processing:  'bg-violet-500/10 text-violet-400 border-violet-500/20',
  done:        'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  error:       'bg-red-500/10 text-red-400 border-red-500/20',
}

const PLATFORM_LABEL: Record<string, string> = {
  zoom: 'Zoom', meet: 'Google Meet', teams: 'Microsoft Teams',
  slack: 'Slack', loom: 'Loom', upload: 'Uploaded File',
}

function fmtDur(s: number | null) {
  if (!s) return '—'
  return `${Math.floor(s / 60)}m ${s % 60}s`
}

export default function TranscribePage() {
  const [deals,       setDeals]       = useState<Deal[]>([])
  const [dealId,      setDealId]      = useState('')
  const [jobs,        setJobs]        = useState<Job[]>([])
  const [loadingJobs, setLoadingJobs] = useState(false)

  useEffect(() => {
    dealsApi.list().then(r => {
      const d = r.data || []
      setDeals(d)
      if (d.length > 0) setDealId(d[0].id)
    })
  }, [])

  useEffect(() => {
    if (!dealId) return
    setLoadingJobs(true)
    transcribeApi.list(dealId)
      .then(r => setJobs(r.data || []))
      .finally(() => setLoadingJobs(false))
  }, [dealId])

  const loadJobs = () => {
    if (!dealId) return
    transcribeApi.list(dealId).then(r => setJobs(r.data || []))
  }

  return (
    <div className="flex flex-col h-full">

      {/* Top bar */}
      <div className="h-[58px] border-b border-white/[0.06] px-6 flex items-center flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center">
            <Mic2 className="w-4 h-4 text-indigo-400" />
          </div>
          <div>
            <h1 className="text-[13px] font-semibold text-white">Call Capture</h1>
            <p className="text-[10px] text-slate-600">Transcribe calls and auto-ingest into deals</p>
          </div>
        </div>
      </div>

      {/* Deal picker */}
      <div className="px-6 py-3 border-b border-white/[0.06] flex items-center gap-3 flex-shrink-0">
        <p className="text-[10px] font-semibold text-slate-600 uppercase tracking-wider flex-shrink-0">Deal</p>
        <select
          value={dealId}
          onChange={e => setDealId(e.target.value)}
          className="flex-1 max-w-xs bg-[#0c1220] border border-white/[0.06] rounded-xl px-3 py-2
                     text-[12px] text-slate-300 focus:outline-none focus:border-indigo-500/40 transition-colors"
        >
          {deals.length === 0
            ? <option value="">No deals yet</option>
            : deals.map(d => (
                <option key={d.id} value={d.id}>
                  {d.name}{d.company ? ` — ${d.company}` : ''}
                </option>
              ))
          }
        </select>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-hidden flex min-h-0">

        {/* Left: Capture widget */}
        <div className="w-[380px] border-r border-white/[0.06] p-5 overflow-y-auto flex-shrink-0">
          <p className="text-[10px] font-semibold text-slate-600 uppercase tracking-[0.1em] mb-4">
            Add a Recording
          </p>
          {dealId
            ? <CallCaptureZone dealId={dealId} onComplete={loadJobs} />
            : <div className="flex flex-col items-center justify-center py-16 text-center">
                <p className="text-[11px] text-slate-700">Create a deal first.</p>
              </div>
          }
        </div>

        {/* Right: History */}
        <div className="flex-1 flex flex-col min-w-0">
          <div className="px-6 py-4 border-b border-white/[0.06] flex-shrink-0">
            <p className="text-[10px] font-semibold text-slate-600 uppercase tracking-[0.1em]">
              Transcription History
            </p>
          </div>

          <div className="flex-1 overflow-y-auto">
            {loadingJobs ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="w-5 h-5 text-slate-600 animate-spin" />
              </div>
            ) : jobs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center px-8">
                <div className="w-12 h-12 rounded-2xl bg-slate-800/60 flex items-center justify-center mb-4">
                  <Mic2 className="w-6 h-6 text-slate-600" />
                </div>
                <p className="text-[12px] text-slate-600 font-medium mb-1">No transcriptions yet</p>
                <p className="text-[11px] text-slate-700">
                  Upload a recording or paste a call URL to get started.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-white/[0.03]">
                {jobs.map(job => (
                  <div key={job.id} className="flex items-center gap-4 px-6 py-4">
                    <div className="flex-shrink-0">
                      {job.status === 'done'
                        ? <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                        : job.status === 'error'
                        ? <AlertCircle className="w-4 h-4 text-red-400" />
                        : <Loader2 className="w-4 h-4 text-indigo-400 animate-spin" />
                      }
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[12px] font-medium text-slate-200 truncate">
                        {job.call_title || 'Untitled Recording'}
                      </p>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <p className="text-[10px] text-slate-600">
                          {PLATFORM_LABEL[job.platform] || job.platform}
                        </p>
                        {job.duration_seconds && (
                          <>
                            <span className="text-slate-700">·</span>
                            <p className="text-[10px] text-slate-600 flex items-center gap-1">
                              <Clock className="w-2.5 h-2.5" /> {fmtDur(job.duration_seconds)}
                            </p>
                          </>
                        )}
                        <span className="text-slate-700">·</span>
                        <p className="text-[10px] text-slate-600">
                          {new Date(job.created_at).toLocaleDateString()}
                        </p>
                      </div>
                      {job.error_message && (
                        <p className="text-[10px] text-red-400 mt-1 truncate">{job.error_message}</p>
                      )}
                    </div>
                    <span className={cn(
                      'text-[9px] font-semibold px-2 py-0.5 rounded-full border capitalize flex-shrink-0',
                      STATUS_STYLE[job.status] ?? STATUS_STYLE.pending
                    )}>
                      {job.status}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
