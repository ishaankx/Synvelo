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
  pending:     'bg-slate-800 text-slate-500 border-white/[0.06]',
  downloading: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20',
  processing:  'bg-violet-500/10 text-violet-400 border-violet-500/20',
  done:        'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  error:       'bg-red-500/10 text-red-400 border-red-500/20',
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
              className="flex items-center gap-2.5 bg-[#0c1220] border border-white/[0.06]
                         hover:border-indigo-500/30 rounded-xl p-3 text-left transition-all group">
              <div className="w-7 h-7 rounded-lg bg-indigo-500/10 flex items-center justify-center flex-shrink-0">
                <Icon className="w-3.5 h-3.5 text-indigo-400" />
              </div>
              <div>
                <p className="text-[12px] font-medium text-slate-300">{label}</p>
                <p className="text-[10px] text-slate-600">{sub}</p>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Shared meta fields */}
      {mode !== 'idle' && (
        <div className="space-y-2">
          <button onClick={() => setMode('idle')}
            className="flex items-center gap-1 text-[10px] text-slate-600 hover:text-slate-400 transition-colors">
            <ChevronLeft className="w-3 h-3" /> Back
          </button>
          {[
            { val: callTitle, set: setCallTitle, ph: 'Call title (e.g. Discovery Call — Acme Inc.)' },
            { val: attendees, set: setAttendees, ph: 'Attendees: Sarah Chen, John Smith (optional)' },
          ].map(({ val, set, ph }) => (
            <input key={ph} value={val} onChange={e => set(e.target.value)} placeholder={ph}
              className="w-full bg-[#0c1220] border border-white/[0.06] rounded-xl px-3 py-2.5
                         text-[12px] text-white placeholder-slate-700
                         focus:outline-none focus:border-indigo-500/40 transition-colors" />
          ))}
        </div>
      )}

      {/* URL mode */}
      {mode === 'url' && (
        <div className="space-y-2">
          <div className="flex gap-2">
            <input value={url} onChange={e => setUrl(e.target.value)}
              placeholder="https://zoom.us/rec/... or Loom URL"
              className="flex-1 bg-[#0c1220] border border-white/[0.06] rounded-xl px-3 py-2.5
                         text-[12px] text-white placeholder-slate-700
                         focus:outline-none focus:border-indigo-500/40 transition-colors" />
            <select value={platform} onChange={e => setPlatform(e.target.value)}
              className="bg-[#0c1220] border border-white/[0.06] rounded-xl px-2 py-2.5
                         text-[12px] text-slate-400 focus:outline-none focus:border-indigo-500/40 transition-colors">
              {Object.entries(PLATFORMS).filter(([k]) => k !== 'upload').map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
          <button onClick={submitUrl} disabled={loading || !url.trim()}
            className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500
                       disabled:opacity-40 text-white rounded-xl py-2.5 text-[12px] font-medium transition-colors">
            {loading
              ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Processing…</>
              : <><Mic2 className="w-3.5 h-3.5" /> Transcribe</>
            }
          </button>
        </div>
      )}

      {/* File drop */}
      {mode === 'file' && (
        <div {...getRootProps()}
          className={cn(
            'border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-all',
            isDragActive ? 'border-indigo-500/60 bg-indigo-500/5' : 'border-white/[0.06] hover:border-white/[0.1]'
          )}>
          <input {...getInputProps()} />
          <Upload className={cn('w-5 h-5 mx-auto mb-2', isDragActive ? 'text-indigo-400' : 'text-slate-700')} />
          <p className="text-[12px] text-slate-500">
            {isDragActive ? 'Drop to transcribe' : 'Drop audio or video file'}
          </p>
          <p className="text-[10px] text-slate-700 mt-1">mp3 · mp4 · m4a · wav</p>
          {loading && (
            <div className="flex items-center justify-center gap-2 mt-2 text-[11px] text-violet-400">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Uploading…
            </div>
          )}
        </div>
      )}

      {/* Job list */}
      {jobs.length > 0 && (
        <div className="space-y-1.5 pt-1">
          <p className="text-[9px] font-semibold text-slate-700 uppercase tracking-[0.1em]">Jobs</p>
          {jobs.map(job => (
            <div key={job.id}
              className="flex items-center gap-2.5 bg-[#0c1220] border border-white/[0.05] rounded-xl px-3 py-2.5">
              {job.status === 'done'
                ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                : job.status === 'error'
                ? <AlertCircle className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />
                : <Loader2 className="w-3.5 h-3.5 text-indigo-400 animate-spin flex-shrink-0" />
              }
              <div className="flex-1 min-w-0">
                <p className="text-[11.5px] text-slate-300 truncate">{job.callTitle}</p>
                <p className="text-[9px] text-slate-700">{PLATFORMS[job.platform] || job.platform}</p>
              </div>
              <span className={cn('text-[9px] font-semibold px-1.5 py-0.5 rounded-full border flex-shrink-0', STATUS_STYLE[job.status])}>
                {STATUS_LABEL[job.status]}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
