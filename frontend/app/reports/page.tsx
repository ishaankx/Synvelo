'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { FileText, Download, Trash2, Plus, Loader2, AlertCircle, Clock, Building2, ArrowRight } from 'lucide-react'
import api from '@/lib/api'

interface Report {
  report_id: string
  deal_id: string
  deal_name: string
  company: string | null
  stage: string | null
  win_probability: number | null
  filename: string
  page_count: number
  created_at: string
}

interface Deal {
  id: string
  name: string
  company: string
}

const STAGE_COLOR: Record<string, string> = {
  'Qualification': 'bg-slate-700/60 text-slate-400',
  'Discovery':     'bg-blue-500/[0.12] text-blue-400 border-blue-500/20',
  'Demo':          'bg-violet-500/[0.12] text-violet-400 border-violet-500/20',
  'Proposal':      'bg-amber-500/[0.12] text-amber-400 border-amber-500/20',
  'Negotiation':   'bg-orange-500/[0.12] text-orange-400 border-orange-500/20',
  'Closed Won':    'bg-emerald-500/[0.12] text-emerald-400 border-emerald-500/20',
  'Closed Lost':   'bg-red-500/[0.12] text-red-400 border-red-500/20',
}

function ProbPill({ prob }: { prob: number | null }) {
  if (prob === null) return <span className="text-[10px] text-slate-600">—</span>
  const pct = Math.round(prob * 100)
  const color = pct >= 65 ? 'text-emerald-400' : pct >= 40 ? 'text-amber-400' : 'text-red-400'
  return <span className={`text-[11px] font-bold ${color}`}>{pct}%</span>
}

function fmt(iso: string) {
  try {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  } catch { return iso }
}

export default function ReportsPage() {
  const [reports, setReports] = useState<Report[]>([])
  const [deals, setDeals] = useState<Deal[]>([])
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState<string | null>(null)   // deal_id being generated
  const [downloading, setDownloading] = useState<string | null>(null) // report_id being downloaded
  const [deleting, setDeleting] = useState<string | null>(null)
  const [showDealPicker, setShowDealPicker] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    try {
      const [rRes, dRes] = await Promise.all([
        api.get('/reports/all'),
        api.get('/deals/'),
      ])
      setReports(rRes.data || [])
      setDeals(dRes.data || [])
    } catch (e: any) {
      setError(e.response?.data?.detail || 'Failed to load reports')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const handleGenerate = async (dealId: string) => {
    setShowDealPicker(false)
    setGenerating(dealId)
    setError(null)
    try {
      await api.post(`/reports/generate/${dealId}`)
      await load()
    } catch (e: any) {
      setError(e.response?.data?.detail || 'Report generation failed')
    } finally {
      setGenerating(null)
    }
  }

  const handleDownload = async (report: Report) => {
    setDownloading(report.report_id)
    try {
      const res = await api.get(`/reports/download/${report.report_id}`, {
        responseType: 'blob',
      })
      const url = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }))
      const a = document.createElement('a')
      a.href = url
      a.download = `Synvelo_Report_${report.deal_name.replace(/\s+/g, '_').slice(0, 40)}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e: any) {
      setError('Download failed')
    } finally {
      setDownloading(null)
    }
  }

  const handleDelete = async (reportId: string) => {
    if (!confirm('Delete this report?')) return
    setDeleting(reportId)
    try {
      await api.delete(`/reports/${reportId}`)
      setReports(r => r.filter(x => x.report_id !== reportId))
    } catch {
      setError('Delete failed')
    } finally {
      setDeleting(null)
    }
  }

  // Deals that don't have a report yet (for the picker badge)
  const dealsWithReports = new Set(reports.map(r => r.deal_id))

  return (
    <div className="flex-1 flex flex-col min-h-0">

      {/* Header */}
      <div className="h-[60px] border-b border-white/[0.05] px-6 flex items-center justify-between flex-shrink-0">
        <div>
          <h1 className="text-[13px] font-semibold text-white">Deal Intelligence Reports</h1>
          <p className="text-[10px] text-slate-600">{reports.length} report{reports.length !== 1 ? 's' : ''} generated</p>
        </div>
        <button
          onClick={() => setShowDealPicker(true)}
          className="flex items-center gap-1.5 text-[11px] font-semibold px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white transition-colors"
        >
          <Plus className="w-3.5 h-3.5" /> Generate Report
        </button>
      </div>

      {/* Error banner */}
      {error && (
        <div className="mx-6 mt-4 flex items-center gap-2 bg-red-950/30 border border-red-500/20 rounded-xl px-4 py-3">
          <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
          <p className="text-[12px] text-red-300">{error}</p>
          <button onClick={() => setError(null)} className="ml-auto text-slate-600 hover:text-slate-400 text-xs">✕</button>
        </div>
      )}

      {/* Generating banner */}
      {generating && (
        <div className="mx-6 mt-4 flex items-center gap-3 bg-indigo-950/40 border border-indigo-500/20 rounded-xl px-4 py-3">
          <Loader2 className="w-4 h-4 text-indigo-400 animate-spin flex-shrink-0" />
          <div>
            <p className="text-[12px] text-indigo-200 font-medium">Generating report…</p>
            <p className="text-[10px] text-slate-500 mt-0.5">
              GPT-4o is synthesising your deal documents. This takes 15–30 seconds.
            </p>
          </div>
        </div>
      )}

      {/* Info strip */}
      <div className="mx-6 mt-4 flex items-start gap-3 bg-slate-900/40 border border-white/[0.05] rounded-xl px-4 py-3">
        <FileText className="w-4 h-4 text-indigo-400 flex-shrink-0 mt-0.5" />
        <p className="text-[11px] text-slate-500 leading-relaxed">
          Reports synthesise all uploaded documents for a deal — including raw Whisper transcripts,
          copy-pasted email threads, and unstructured notes — into a clean analyst-grade PDF.
          GPT-4o extracts the business signal and ignores all noise automatically.
        </p>
      </div>

      {/* Report list */}
      <div className="flex-1 overflow-y-auto p-6">
        {loading ? (
          <div className="flex items-center justify-center h-40">
            <Loader2 className="w-5 h-5 text-slate-600 animate-spin" />
          </div>
        ) : reports.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-60 text-center">
            <div className="w-14 h-14 rounded-2xl bg-indigo-500/[0.08] border border-indigo-500/20 flex items-center justify-center mb-4">
              <FileText className="w-7 h-7 text-indigo-400" />
            </div>
            <p className="text-[13px] text-slate-400 font-semibold mb-2">No reports yet</p>
            <p className="text-[11px] text-slate-600 max-w-xs leading-relaxed mb-5">
              Generate your first Deal Intelligence Report. Upload documents to a deal,
              then click "Generate Report" above.
            </p>
            <button
              onClick={() => setShowDealPicker(true)}
              className="flex items-center gap-1.5 text-[11px] font-semibold px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white transition-colors"
            >
              <Plus className="w-3.5 h-3.5" /> Generate First Report
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3">
            {reports.map(report => (
              <div
                key={report.report_id}
                className="bg-[#0d1117] border border-white/[0.06] rounded-2xl p-5 hover:border-white/[0.1] transition-colors"
              >
                <div className="flex items-start justify-between gap-4">

                  {/* Left: metadata */}
                  <div className="flex items-start gap-4 flex-1 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-indigo-500/[0.1] border border-indigo-500/20 flex items-center justify-center flex-shrink-0">
                      <FileText className="w-5 h-5 text-indigo-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2.5 mb-1 flex-wrap">
                        <p className="text-[13px] font-semibold text-white truncate">{report.deal_name}</p>
                        {report.stage && (
                          <span className={`text-[9px] font-medium px-1.5 py-0.5 rounded-full border flex-shrink-0 ${(STAGE_COLOR as any)[report.stage] || 'bg-slate-800 text-slate-500 border-white/[0.04]'}`}>
                            {report.stage}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-[10px] text-slate-600 flex-wrap">
                        {report.company && (
                          <span className="flex items-center gap-1">
                            <Building2 className="w-2.5 h-2.5" />
                            {report.company}
                          </span>
                        )}
                        <span className="flex items-center gap-1">
                          <Clock className="w-2.5 h-2.5" />
                          {fmt(report.created_at)}
                        </span>
                        <span>{report.page_count} page{report.page_count !== 1 ? 's' : ''}</span>
                        <span>Win prob: <ProbPill prob={report.win_probability} /></span>
                      </div>
                    </div>
                  </div>

                  {/* Right: actions */}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Link
                      href={`/deals/${report.deal_id}`}
                      className="flex items-center gap-1 text-[10px] text-slate-500 hover:text-slate-300 px-2 py-1.5 rounded-lg bg-slate-800/40 border border-white/[0.05] transition-colors"
                    >
                      View Deal <ArrowRight className="w-2.5 h-2.5" />
                    </Link>
                    <button
                      onClick={() => handleDownload(report)}
                      disabled={downloading === report.report_id}
                      className="flex items-center gap-1.5 text-[10px] font-medium px-3 py-1.5 rounded-lg bg-indigo-500/[0.1] border border-indigo-500/20 text-indigo-400 hover:bg-indigo-500/[0.18] disabled:opacity-40 transition-colors"
                    >
                      {downloading === report.report_id
                        ? <Loader2 className="w-3 h-3 animate-spin" />
                        : <Download className="w-3 h-3" />
                      }
                      {downloading === report.report_id ? 'Downloading…' : 'Download PDF'}
                    </button>
                    <button
                      onClick={() => handleDelete(report.report_id)}
                      disabled={deleting === report.report_id}
                      className="w-7 h-7 flex items-center justify-center rounded-lg bg-slate-800/40 border border-white/[0.05] text-slate-600 hover:text-red-400 hover:border-red-500/20 disabled:opacity-40 transition-colors"
                    >
                      {deleting === report.report_id
                        ? <Loader2 className="w-3 h-3 animate-spin" />
                        : <Trash2 className="w-3 h-3" />
                      }
                    </button>
                  </div>

                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Deal picker modal */}
      {showDealPicker && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={e => e.target === e.currentTarget && setShowDealPicker(false)}
        >
          <div className="bg-[#080c14] border border-white/[0.07] rounded-2xl w-full max-w-md p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-5">
              <div>
                <p className="text-sm font-semibold text-white">Generate Report</p>
                <p className="text-[10px] text-slate-600 mt-0.5">Select a deal to synthesise</p>
              </div>
              <button
                onClick={() => setShowDealPicker(false)}
                className="w-7 h-7 rounded-lg bg-slate-800/60 border border-white/[0.06] flex items-center justify-center text-slate-500 hover:text-slate-300 transition-colors"
              >
                ✕
              </button>
            </div>

            <div className="space-y-1.5 max-h-80 overflow-y-auto">
              {deals.length === 0 ? (
                <p className="text-[12px] text-slate-600 text-center py-6">No deals found. Create a deal first.</p>
              ) : deals.map(deal => {
                const isGenerating = generating === deal.id
                const hasReport = dealsWithReports.has(deal.id)
                return (
                  <button
                    key={deal.id}
                    onClick={() => handleGenerate(deal.id)}
                    disabled={!!generating}
                    className="w-full flex items-center justify-between px-4 py-3 rounded-xl bg-[#0d1117] border border-white/[0.05] hover:border-indigo-500/30 disabled:opacity-50 transition-all text-left group"
                  >
                    <div>
                      <p className="text-[12px] font-medium text-slate-200 group-hover:text-white">{deal.name}</p>
                      {deal.company && <p className="text-[10px] text-slate-600 mt-0.5">{deal.company}</p>}
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {hasReport && (
                        <span className="text-[9px] text-emerald-500 bg-emerald-500/[0.08] border border-emerald-500/20 px-1.5 py-0.5 rounded-full">
                          Has report
                        </span>
                      )}
                      {isGenerating
                        ? <Loader2 className="w-3.5 h-3.5 text-indigo-400 animate-spin" />
                        : <ArrowRight className="w-3.5 h-3.5 text-slate-600 group-hover:text-indigo-400 transition-colors" />
                      }
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}