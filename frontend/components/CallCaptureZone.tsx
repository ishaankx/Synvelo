'use client'
import { useState, useCallback, useEffect } from 'react'
import { useDropzone } from 'react-dropzone'
import { cn } from '@/lib/utils'
import {
  Link as LinkIcon, Upload, CheckCircle2,
  Loader2, AlertCircle, Mic2, ChevronLeft, Clock,
} from 'lucide-react'
import { transcribeApi } from '@/lib/api'

type Mode      = 'idle' | 'url' | 'file'
type JobStatus = 'pending' | 'downloading' | 'processing' | 'done' | 'error'

interface Job {
  id:        string
  status:    JobStatus
  callTitle: string
  platform:  string
  error?:    string
}

const PLATFORMS: Record<string, string> = {
  zoom:   'Zoom',
  meet:   'Google Meet',
  teams:  'Microsoft Teams',
  slack:  'Slack Huddle',
  loom:   'Loom',
  upload: 'Upload',
}

const STATUS_LABEL: Record<JobStatus, string> = {
  pending:     'Queued',
  downloading: 'Downloading',
  processing:  'Transcribing',
  done:        'Done',
  error:       'Failed',
}

const STATUS_STYLE: Record<JobStatus, string> = {
  pending:     'bg-gray-100 text-gray-500 border-gray-200',
  downloading: 'bg-cyan-50 text-cyan-700 border-cyan-200',
  processing:  'bg-violet-50 text-violet-700 border-violet-200',
  done:        'bg-emerald-50 text-emerald-700 border-emerald-200',
  error:       'bg-red-50 text-red-700 border-red-200',
}

export default function CallCaptureZone({
  dealId, onComplete,
}: {
  dealId:     string
  onComplete: () => void
}) {
  const [mode,       setMode]       = useState<Mode>('idle')
  const [url,        setUrl]        = useState('')
  const [callTitle,  setCallTitle]  = useState('')
  const [attendees,  setAttendees]  = useState('')
  const [platform,   setPlatform]   = useState('zoom')
  const [jobs,       setJobs]       = useState<Job[]>([])
  const [loading,    setLoading]    = useState(false)

  const poll = useCallback((jobId: string) => {
    const iv = setInterval(async () => {
      try {
        const res = await transcribeApi.status(jobId)
        const s   = res.data.status as JobStatus
        setJobs(j => j.map(j2 =>
          j2.id === jobId ? { ...j2, status: s, error: res.data.error_message } : j2
        ))
        if (s === 'done')  { clearInterval(iv); onComplete() }
        if (s === 'error')   clearInterval(iv)
      } catch { clearInterval(iv) }
    }, 3000)
  }, [onComplete])

  const submitUrl = async () => {
    if (!url.trim()) return
    setLoading(true)
    try {
      const res = await transcribeApi.fromUrl(dealId, url, platform, callTitle, attendees)
      const id  = res.data.transcription_id
      setJobs(j => [{ id, status: 'pending', callTitle: callTitle || url.slice(0, 40), platform }, ...j])
      setUrl('')
      setMode('idle')
      poll(id)
    } catch (e: any) {
      alert(e.response?.data?.detail || e.message)
    } finally { setLoading(false) }
  }

  const onDrop = useCallback(async (files: File[]) => {
    setLoading(true)
    for (const file of files) {
      try {
        const res = await transcribeApi.uploadAudio(dealId, file, callTitle || file.name, attendees, 'upload')
        const id  = res.data.transcription_id
        setJobs(j => [{ id, status: 'pending', callTitle: callTitle || file.name, platform: 'upload' }, ...j])
        poll(id)
      } catch (e: any) {
        alert(e.response?.data?.detail || e.message)
      }
    }
    setMode('idle')
    setLoading(false)
  }, [dealId, callTitle, attendees, poll])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    disabled: loading,
    accept: {
      'audio/*':  ['.mp3', '.wav', '.m4a', '.ogg'],
      'video/mp4': ['.mp4'],
    },
  })

  return (
    <div className="space-y-3">

      {/* Idle: pick mode */}
      {mode === 'idle' && (
        <div className="grid grid-cols-2 gap-2">
          {[
            { m: 'url'  as Mode, Icon: LinkIcon, label: 'Paste URL',    sub: 'Zoom · Meet · Loom' },
            { m: 'file' as Mode, Icon: Upload,   label: 'Upload File',  sub: 'mp3 · mp4 · m4a' },
          ].map(({ m, Icon, label, sub }) => (
            <button key={m} onClick={() => setMode(m)}
              className="flex items-center gap-2.5 syn-surface-2 border syn-border
                         hover:border-brand-500/30 rounded-lg p-3 text-left transition-all group">
              <div className="w-8 h-8 rounded-lg bg-brand-50 flex items-center justify-center flex-shrink-0">
                <Icon className="w-3.5 h-3.5 text-brand-600" />
              </div>
              <div>
                <p className="text-[12px] font-medium text-gray-700">{label}</p>
                <p className="text-[11px] text-gray-500">{sub}</p>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Shared meta fields */}
      {mode !== 'idle' && (
        <div className="space-y-2">
          <button onClick={() => setMode('idle')}
            className="flex items-center gap-1 text-[11px] text-gray-500 hover:text-gray-700 transition-colors">
            <ChevronLeft className="w-3 h-3" /> Back
          </button>
          {[
            { val: callTitle, set: setCallTitle, ph: 'Call title (e.g. Discovery Call — Acme Inc.)' },
            { val: attendees, set: setAttendees, ph: 'Attendees: Sarah Chen, John Smith (optional)' },
          ].map(({ val, set, ph }) => (
            <input key={ph} value={val} onChange={e => set(e.target.value)} placeholder={ph}
              className="w-full syn-surface-2 border syn-border rounded-lg px-3 py-2.5
                         text-[13px] text-gray-900 placeholder-gray-400
                         focus:outline-none focus:border-brand-500/40 transition-colors" />
          ))}
        </div>
      )}

      {/* URL mode */}
      {mode === 'url' && (
        <div className="space-y-2">
          <div className="flex gap-2">
            <input value={url} onChange={e => setUrl(e.target.value)}
              placeholder="https://zoom.us/rec/... or Loom URL"
              className="flex-1 syn-surface-2 border syn-border rounded-lg px-3 py-2.5
                         text-[13px] text-gray-900 placeholder-gray-400
                         focus:outline-none focus:border-brand-500/40 transition-colors" />
            <select value={platform} onChange={e => setPlatform(e.target.value)}
              className="syn-surface-2 border syn-border rounded-lg px-2 py-2.5
                         text-[13px] text-gray-500 focus:outline-none focus:border-brand-500/40 transition-colors">
              {Object.entries(PLATFORMS).filter(([k]) => k !== 'upload').map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
          <button onClick={submitUrl} disabled={loading || !url.trim()}
            className="w-full flex items-center justify-center gap-2 bg-brand-600 hover:bg-brand-500
                       disabled:opacity-40 text-white rounded-lg py-2.5 text-[12px] font-medium transition-colors">
            {loading
              ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Processing...</>
              : <><Mic2 className="w-3.5 h-3.5" /> Transcribe</>
            }
          </button>
        </div>
      )}

      {/* File drop */}
      {mode === 'file' && (
        <div {...getRootProps()}
          className={cn(
            'border-2 border-dashed rounded-lg p-5 text-center cursor-pointer transition-all',
            isDragActive ? 'border-brand-400 bg-brand-50' : 'border-gray-300 hover:border-gray-400'
          )}>
          <input {...getInputProps()} />
          <Upload className={cn('w-5 h-5 mx-auto mb-2', isDragActive ? 'text-brand-600' : 'text-gray-500')} />
          <p className="text-[12px] text-gray-500">
            {isDragActive ? 'Drop to transcribe' : 'Drop audio or video file'}
          </p>
          <p className="text-[11px] text-gray-400 mt-1">mp3 · mp4 · m4a · wav</p>
          {loading && (
            <div className="flex items-center justify-center gap-2 mt-2 text-[11px] text-violet-600">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Uploading...
            </div>
          )}
        </div>
      )}

      {/* Job list */}
      {jobs.length > 0 && (
        <div className="space-y-1.5 pt-1">
          <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Jobs</p>
          {jobs.map(job => (
            <div key={job.id}
              className="flex items-center gap-2.5 syn-card px-3 py-2.5">
              {job.status === 'done'
                ? <CheckCircle2 className="w-3.5 h-3.5 text-positive flex-shrink-0" />
                : job.status === 'error'
                ? <AlertCircle className="w-3.5 h-3.5 text-negative flex-shrink-0" />
                : <Loader2 className="w-3.5 h-3.5 text-brand-600 animate-spin flex-shrink-0" />
              }
              <div className="flex-1 min-w-0">
                <p className="text-[12px] text-gray-700 truncate">{job.callTitle}</p>
                <p className="text-[11px] text-gray-500">{PLATFORMS[job.platform] || job.platform}</p>
              </div>
              <span className={cn('text-[11px] font-semibold px-2 py-0.5 rounded-md border flex-shrink-0', STATUS_STYLE[job.status])}>
                {STATUS_LABEL[job.status]}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
