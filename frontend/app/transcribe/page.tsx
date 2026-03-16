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
  pending:     'bg-gray-100 text-gray-500 border-gray-200',
  downloading: 'bg-cyan-50 text-cyan-700 border-cyan-200',
  processing:  'bg-violet-50 text-violet-700 border-violet-200',
  done:        'bg-emerald-50 text-emerald-700 border-emerald-200',
  error:       'bg-red-50 text-red-700 border-red-200',
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
      <div className="h-16 border-b syn-border px-6 flex items-center flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-brand-50 border border-brand-200 flex items-center justify-center">
            <Mic2 className="w-[18px] h-[18px] text-brand-600" />
          </div>
          <div>
            <h1 className="text-[16px] font-semibold syn-text-primary">Call Capture</h1>
            <p className="text-[12px] syn-text-secondary">Transcribe calls and auto-ingest into deals</p>
          </div>
        </div>
      </div>

      {/* Deal picker */}
      <div className="px-6 py-3 border-b syn-border flex items-center gap-3 flex-shrink-0">
        <p className="text-[11px] font-medium text-gray-500 uppercase tracking-wider flex-shrink-0">Deal</p>
        <select
          value={dealId}
          onChange={e => setDealId(e.target.value)}
          className="flex-1 max-w-xs syn-surface-2 border syn-border rounded-lg px-3 py-2
                     text-[13px] text-gray-700 focus:outline-none focus:border-brand-500/40 transition-colors"
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
        <div className="w-[380px] border-r syn-border p-5 overflow-y-auto flex-shrink-0 syn-scroll">
          <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-4">
            Add a Recording
          </p>
          {dealId
            ? <CallCaptureZone dealId={dealId} onComplete={loadJobs} />
            : <div className="flex flex-col items-center justify-center py-16 text-center">
                <p className="text-[12px] text-gray-500">Create a deal first.</p>
              </div>
          }
        </div>

        {/* Right: History */}
        <div className="flex-1 flex flex-col min-w-0">
          <div className="px-6 py-4 border-b syn-border flex-shrink-0">
            <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
              Transcription History
            </p>
          </div>

          <div className="flex-1 overflow-y-auto syn-scroll">
            {loadingJobs ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="w-5 h-5 text-gray-400 animate-spin" />
              </div>
            ) : jobs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center px-8">
                <div className="w-14 h-14 rounded-xl syn-surface-2 border syn-border flex items-center justify-center mb-4">
                  <Mic2 className="w-6 h-6 text-gray-500" />
                </div>
                <p className="text-[14px] text-gray-500 font-medium mb-1">No transcriptions yet</p>
                <p className="text-[12px] text-gray-500">
                  Upload a recording or paste a call URL to get started.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-gray-200">
                {jobs.map(job => (
                  <div key={job.id} className="flex items-center gap-4 px-6 py-4 hover:bg-gray-50 transition-colors">
                    <div className="flex-shrink-0">
                      {job.status === 'done'
                        ? <CheckCircle2 className="w-4 h-4 text-positive" />
                        : job.status === 'error'
                        ? <AlertCircle className="w-4 h-4 text-negative" />
                        : <Loader2 className="w-4 h-4 text-brand-600 animate-spin" />
                      }
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-medium text-gray-800 truncate">
                        {job.call_title || 'Untitled Recording'}
                      </p>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <p className="text-[11px] text-gray-500">
                          {PLATFORM_LABEL[job.platform] || job.platform}
                        </p>
                        {job.duration_seconds && (
                          <>
                            <span className="text-gray-300">·</span>
                            <p className="text-[11px] text-gray-500 flex items-center gap-1">
                              <Clock className="w-3 h-3" /> {fmtDur(job.duration_seconds)}
                            </p>
                          </>
                        )}
                        <span className="text-gray-300">·</span>
                        <p className="text-[11px] text-gray-500">
                          {new Date(job.created_at).toLocaleDateString()}
                        </p>
                      </div>
                      {job.error_message && (
                        <p className="text-[11px] text-negative mt-1 truncate">{job.error_message}</p>
                      )}
                    </div>
                    <span className={cn(
                      'text-[11px] font-semibold px-2 py-0.5 rounded-md border capitalize flex-shrink-0',
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
