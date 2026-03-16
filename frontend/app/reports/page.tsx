'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { FileText, Download, Trash2, Plus, Loader2, AlertCircle, Clock, Building2, ArrowRight, X } from 'lucide-react'
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
  'Qualification': 'bg-slate-100 text-slate-700',
  'Discovery':     'bg-blue-50 text-blue-700',
  'Demo':          'bg-violet-50 text-violet-700',
  'Proposal':      'bg-amber-50 text-amber-700',
  'Negotiation':   'bg-orange-50 text-orange-700',
  'Closed Won':    'bg-emerald-50 text-emerald-700',
  'Closed Lost':   'bg-red-50 text-red-700',
}

function ProbPill({ prob }: { prob: number | null }) {
  if (prob === null) return <span className="text-[11px] text-gray-400">—</span>
  const pct = Math.round(prob * 100)
  const color = pct >= 65 ? 'text-emerald-600' : pct >= 40 ? 'text-amber-600' : 'text-red-600'
  return <span className={`text-[12px] font-bold tabular-nums ${color}`}>{pct}%</span>
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
  const [generating, setGenerating] = useState<string | null>(null)
  const [downloading, setDownloading] = useState<string | null>(null)
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

  const dealsWithReports = new Set(reports.map(r => r.deal_id))

  return (
    <div className="flex-1 flex flex-col min-h-0">

      {/* Header */}
      <div className="h-16 border-b syn-border px-6 flex items-center justify-between flex-shrink-0">
        <div>
          <h1 className="text-[18px] font-semibold syn-text-primary">Deal Intelligence Reports</h1>
          <p className="text-[12px] syn-text-secondary">{reports.length} report{reports.length !== 1 ? 's' : ''} generated</p>
        </div>
        <button
          onClick={() => setShowDealPicker(true)}
          className="flex items-center gap-1.5 text-[12px] font-medium px-4 py-2 rounded-lg bg-brand-600 hover:bg-brand-500 text-white transition-colors"
        >
          <Plus className="w-3.5 h-3.5" /> Generate Report
        </button>
      </div>

      {/* Error banner */}
      {error && (
        <div className="mx-6 mt-4 flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
          <AlertCircle className="w-4 h-4 text-negative flex-shrink-0" />
          <p className="text-[12px] text-red-600">{error}</p>
          <button onClick={() => setError(null)} className="ml-auto text-gray-500 hover:text-gray-700 text-[12px]">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Generating banner */}
      {generating && (
        <div className="mx-6 mt-4 flex items-center gap-3 bg-brand-50 border border-brand-200 rounded-lg px-4 py-3">
          <Loader2 className="w-4 h-4 text-brand-700 animate-spin flex-shrink-0" />
          <div>
            <p className="text-[12px] text-brand-700 font-medium">Generating report...</p>
            <p className="text-[11px] text-gray-500 mt-0.5">
              Synthesising your deal documents. This takes 15-30 seconds.
            </p>
          </div>
        </div>
      )}

      {/* Info strip */}
      <div className="mx-6 mt-4 flex items-start gap-3 syn-surface-2 border syn-border rounded-lg px-4 py-3">
        <FileText className="w-4 h-4 text-brand-700 flex-shrink-0 mt-0.5" />
        <p className="text-[12px] text-gray-500 leading-relaxed">
          Reports synthesise all uploaded documents for a deal — including raw Whisper transcripts,
          copy-pasted email threads, and unstructured notes — into a clean analyst-grade PDF.
        </p>
      </div>

      {/* Report list */}
      <div className="flex-1 overflow-y-auto p-6 syn-scroll">
        {loading ? (
          <div className="flex items-center justify-center h-40">
            <Loader2 className="w-5 h-5 text-gray-400 animate-spin" />
          </div>
        ) : reports.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-60 text-center">
            <div className="w-14 h-14 rounded-xl syn-surface-2 border syn-border flex items-center justify-center mb-4">
              <FileText className="w-7 h-7 text-brand-700" />
            </div>
            <p className="text-[14px] text-gray-700 font-medium mb-2">No reports yet</p>
            <p className="text-[12px] text-gray-500 max-w-xs leading-relaxed mb-5">
              Generate your first Deal Intelligence Report. Upload documents to a deal,
              then click &ldquo;Generate Report&rdquo; above.
            </p>
            <button
              onClick={() => setShowDealPicker(true)}
              className="flex items-center gap-1.5 text-[12px] font-medium px-4 py-2 rounded-lg bg-brand-600 hover:bg-brand-500 text-white transition-colors"
            >
              <Plus className="w-3.5 h-3.5" /> Generate First Report
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3">
            {reports.map(report => (
              <div
                key={report.report_id}
                className="syn-card p-5 hover:border-gray-300 transition-colors"
              >
                <div className="flex items-start justify-between gap-4">

                  {/* Left: metadata */}
                  <div className="flex items-start gap-4 flex-1 min-w-0">
                    <div className="w-10 h-10 rounded-lg bg-brand-50 border border-brand-200 flex items-center justify-center flex-shrink-0">
                      <FileText className="w-5 h-5 text-brand-700" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2.5 mb-1 flex-wrap">
                        <p className="text-[14px] font-medium text-gray-900 truncate">{report.deal_name}</p>
                        {report.stage && (
                          <span className={`text-[11px] font-medium px-2 py-0.5 rounded-md flex-shrink-0 ${(STAGE_COLOR as any)[report.stage] || 'bg-gray-100 text-gray-500'}`}>
                            {report.stage}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-[12px] text-gray-500 flex-wrap">
                        {report.company && (
                          <span className="flex items-center gap-1">
                            <Building2 className="w-3 h-3" />
                            {report.company}
                          </span>
                        )}
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {fmt(report.created_at)}
                        </span>
                        <span>{report.page_count} page{report.page_count !== 1 ? 's' : ''}</span>
                        <span>Win: <ProbPill prob={report.win_probability} /></span>
                      </div>
                    </div>
                  </div>

                  {/* Right: actions */}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Link
                      href={`/deals/${report.deal_id}`}
                      className="flex items-center gap-1 text-[11px] text-gray-500 hover:text-gray-900 px-2.5 py-1.5 rounded-lg syn-surface-2 border syn-border transition-colors"
                    >
                      View Deal <ArrowRight className="w-3 h-3" />
                    </Link>
                    <button
                      onClick={() => handleDownload(report)}
                      disabled={downloading === report.report_id}
                      className="flex items-center gap-1.5 text-[11px] font-medium px-3 py-1.5 rounded-lg bg-brand-50 border border-brand-200 text-brand-700 hover:bg-brand-100 disabled:opacity-40 transition-colors"
                    >
                      {downloading === report.report_id
                        ? <Loader2 className="w-3 h-3 animate-spin" />
                        : <Download className="w-3 h-3" />
                      }
                      {downloading === report.report_id ? 'Downloading...' : 'Download PDF'}
                    </button>
                    <button
                      onClick={() => handleDelete(report.report_id)}
                      disabled={deleting === report.report_id}
                      className="w-8 h-8 flex items-center justify-center rounded-lg syn-surface-2 border syn-border text-gray-500 hover:text-negative hover:border-red-200 disabled:opacity-40 transition-colors"
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
          className="fixed inset-0 bg-gray-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4 syn-modal-backdrop"
          onClick={e => e.target === e.currentTarget && setShowDealPicker(false)}
        >
          <div className="syn-surface border syn-border rounded-xl w-full max-w-md p-6 shadow-2xl syn-modal-content">
            <div className="flex items-center justify-between mb-5">
              <div>
                <p className="text-[14px] font-semibold text-gray-900">Generate Report</p>
                <p className="text-[12px] text-gray-500 mt-0.5">Select a deal to synthesise</p>
              </div>
              <button
                onClick={() => setShowDealPicker(false)}
                className="w-8 h-8 rounded-lg syn-surface-2 border syn-border flex items-center justify-center text-gray-500 hover:text-gray-900 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-1.5 max-h-80 overflow-y-auto syn-scroll">
              {deals.length === 0 ? (
                <p className="text-[12px] text-gray-500 text-center py-6">No deals found. Create a deal first.</p>
              ) : deals.map(deal => {
                const isGenerating = generating === deal.id
                const hasReport = dealsWithReports.has(deal.id)
                return (
                  <button
                    key={deal.id}
                    onClick={() => handleGenerate(deal.id)}
                    disabled={!!generating}
                    className="w-full flex items-center justify-between px-4 py-3 rounded-lg syn-surface-2 border syn-border hover:border-brand-300 disabled:opacity-50 transition-all text-left group"
                  >
                    <div>
                      <p className="text-[13px] font-medium text-gray-800 group-hover:text-gray-900">{deal.name}</p>
                      {deal.company && <p className="text-[11px] text-gray-500 mt-0.5">{deal.company}</p>}
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {hasReport && (
                        <span className="text-[11px] text-emerald-600 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-md font-medium">
                          Has report
                        </span>
                      )}
                      {isGenerating
                        ? <Loader2 className="w-3.5 h-3.5 text-brand-700 animate-spin" />
                        : <ArrowRight className="w-3.5 h-3.5 text-gray-400 group-hover:text-brand-700 transition-colors" />
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
