'use client'
import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, TrendingUp, DollarSign, Clock, Building2, Loader2, X } from 'lucide-react'
import { dealsApi } from '@/lib/api'
import { cn } from '@/lib/utils'

interface Deal {
  id: string
  name: string
  company: string
  stage: string
  value: number
  owner: string
  win_probability: number | null
  time_to_close_days: number | null
  last_scored_at: string | null
  created_at: string
}

const STAGES = ['Discovery', 'Qualification', 'Demo', 'Proposal', 'Negotiation', 'Closed Won', 'Closed Lost']

function WinBar({ prob }: { prob: number | null }) {
  if (prob === null) return <div className="h-1 w-full bg-slate-800 rounded-full" />
  const pct = Math.round(prob * 100)
  const color = pct >= 65 ? 'bg-emerald-500' : pct >= 40 ? 'bg-amber-500' : 'bg-red-500'
  return (
    <div className="h-1 w-full bg-slate-800 rounded-full overflow-hidden">
      <div className={`h-full ${color} rounded-full transition-all duration-700`} style={{ width: `${pct}%` }} />
    </div>
  )
}

function StageChip({ stage }: { stage: string }) {
  const colors: Record<string, string> = {
    'Discovery':    'bg-slate-800 text-slate-400 border-white/[0.06]',
    'Qualification':'bg-blue-500/10 text-blue-400 border-blue-500/20',
    'Demo':         'bg-violet-500/10 text-violet-400 border-violet-500/20',
    'Proposal':     'bg-amber-500/10 text-amber-400 border-amber-500/20',
    'Negotiation':  'bg-orange-500/10 text-orange-400 border-orange-500/20',
    'Closed Won':   'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    'Closed Lost':  'bg-red-500/10 text-red-400 border-red-500/20',
  }
  return (
    <span className={cn('text-[9px] font-semibold px-1.5 py-0.5 rounded-md border', colors[stage] || colors['Discovery'])}>
      {stage}
    </span>
  )
}

export default function DealsPage() {
  const router = useRouter()
  const [deals, setDeals] = useState<Deal[]>([])
  const [loading, setLoading] = useState(true)
  const [showNew, setShowNew] = useState(false)
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState({
    name: '', company: '', stage: 'Discovery',
    value: '', owner: '', time_to_close_days: ''
  })

  const load = useCallback(async () => {
    try {
      const res = await dealsApi.list()
      setDeals(res.data || [])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const handleCreate = async () => {
    if (!form.name.trim() || !form.company.trim()) return
    setCreating(true)
    try {
      const res = await dealsApi.create({
        name: form.name,
        company: form.company,
        stage: form.stage,
        value: parseFloat(form.value) || 0,
        owner: form.owner,
        time_to_close_days: form.time_to_close_days ? parseInt(form.time_to_close_days) : null,
      } as any)
      setShowNew(false)
      setForm({ name: '', company: '', stage: 'Discovery', value: '', owner: '', time_to_close_days: '' })
      router.push(`/deals/${res.data.id}`)
    } catch (e: any) {
      alert(e.response?.data?.detail || 'Failed to create deal')
    } finally {
      setCreating(false)
    }
  }

  // Pipeline stats
  const totalValue = deals.reduce((s, d) => s + (d.value || 0), 0)
  const weightedValue = deals.reduce((s, d) => s + (d.value || 0) * (d.win_probability || 0), 0)
  const scoredDeals = deals.filter(d => d.win_probability !== null)
  const avgProb = scoredDeals.length ? scoredDeals.reduce((s, d) => s + d.win_probability!, 0) / scoredDeals.length : null

  return (
    <div className="flex-1 flex flex-col min-h-0">

      {/* Header */}
      <div className="h-[60px] border-b border-white/[0.05] px-6 flex items-center justify-between flex-shrink-0">
        <div>
          <h1 className="text-[14px] font-semibold text-white">Pipeline</h1>
          <p className="text-[10px] text-slate-600">{deals.length} deal{deals.length !== 1 ? 's' : ''}</p>
        </div>
        <button
          onClick={() => setShowNew(true)}
          className="flex items-center gap-1.5 text-[11px] font-semibold px-3 py-1.5 rounded-xl
                     bg-indigo-600 hover:bg-indigo-500 text-white transition-colors">
          <Plus className="w-3.5 h-3.5" /> New Deal
        </button>
      </div>

      {/* Stats strip */}
      <div className="flex-shrink-0 border-b border-white/[0.05] px-6 py-3 flex gap-6">
        {[
          { label: 'Total Pipeline',   val: `$${(totalValue / 1000).toFixed(0)}k` },
          { label: 'Weighted',         val: `$${(weightedValue / 1000).toFixed(0)}k` },
          { label: 'Avg Win Prob',     val: avgProb !== null ? `${Math.round(avgProb * 100)}%` : '—' },
          { label: 'Deals',            val: String(deals.length) },
        ].map(({ label, val }) => (
          <div key={label}>
            <p className="text-[9px] text-slate-600 uppercase tracking-wider">{label}</p>
            <p className="text-[14px] font-bold text-white mt-0.5">{val}</p>
          </div>
        ))}
      </div>

      {/* Deal list */}
      <div className="flex-1 overflow-y-auto p-6">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-5 h-5 text-slate-600 animate-spin" />
          </div>
        ) : deals.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-12 h-12 rounded-xl bg-slate-800/60 flex items-center justify-center mb-4">
              <TrendingUp className="w-6 h-6 text-slate-600" />
            </div>
            <p className="text-[13px] text-slate-500">No deals yet</p>
            <p className="text-[11px] text-slate-700 mt-1 mb-4">Create your first deal to get started</p>
            <button onClick={() => setShowNew(true)}
              className="flex items-center gap-1.5 text-[11px] font-semibold px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white transition-colors">
              <Plus className="w-3.5 h-3.5" /> New Deal
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 max-w-4xl">
            {deals.map(deal => {
              const pct = deal.win_probability !== null ? Math.round(deal.win_probability * 100) : null
              const pctColor = pct === null ? 'text-slate-600' : pct >= 65 ? 'text-emerald-400' : pct >= 40 ? 'text-amber-400' : 'text-red-400'
              return (
                <div key={deal.id}
                  onClick={() => router.push(`/deals/${deal.id}`)}
                  className="bg-[#0d1117] border border-white/[0.05] rounded-2xl p-4 cursor-pointer
                             hover:border-white/[0.1] hover:bg-slate-900/60 transition-all group">
                  <div className="flex items-start justify-between gap-4 mb-3">
                    <div className="min-w-0">
                      <h3 className="text-[13px] font-medium text-white truncate group-hover:text-indigo-300 transition-colors">
                        {deal.name}
                      </h3>
                      <div className="flex items-center gap-2 mt-0.5">
                        <Building2 className="w-2.5 h-2.5 text-slate-700" />
                        <p className="text-[10px] text-slate-600">{deal.company}</p>
                        <span className="text-slate-800">·</span>
                        <p className="text-[10px] text-slate-600">{deal.owner || '—'}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <StageChip stage={deal.stage} />
                      <span className={cn('text-[13px] font-bold', pctColor)}>
                        {pct !== null ? `${pct}%` : '—'}
                      </span>
                    </div>
                  </div>
                  <WinBar prob={deal.win_probability} />
                  <div className="flex items-center justify-between mt-2.5">
                    <div className="flex items-center gap-1.5">
                      <DollarSign className="w-2.5 h-2.5 text-slate-700" />
                      <p className="text-[10px] text-slate-500 font-medium">
                        ${(deal.value || 0).toLocaleString()}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {deal.time_to_close_days && (
                        <>
                          <Clock className="w-2.5 h-2.5 text-slate-700" />
                          <p className="text-[10px] text-slate-600">{deal.time_to_close_days}d est.</p>
                        </>
                      )}
                      {!deal.last_scored_at && (
                        <span className="text-[9px] text-slate-700 bg-slate-800/60 px-1.5 py-0.5 rounded-md border border-white/[0.04]">
                          Not scored
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* New Deal modal */}
      {showNew && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-[#0d1117] border border-white/[0.08] rounded-2xl w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
              <h2 className="text-[13px] font-semibold text-white">New Deal</h2>
              <button onClick={() => setShowNew(false)} className="text-slate-600 hover:text-slate-400 transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 space-y-3">
              {[
                { label: 'Deal Name *', key: 'name', placeholder: 'e.g. NovaTech ERP Integration' },
                { label: 'Company *',   key: 'company', placeholder: 'e.g. NovaTech Manufacturing' },
                { label: 'Owner',       key: 'owner', placeholder: 'e.g. John Smith' },
                { label: 'Deal Value ($)', key: 'value', placeholder: 'e.g. 185000' },
                { label: 'Est. Days to Close', key: 'time_to_close_days', placeholder: 'e.g. 45' },
              ].map(({ label, key, placeholder }) => (
                <div key={key}>
                  <label className="block text-[10px] text-slate-600 uppercase tracking-wider mb-1">{label}</label>
                  <input
                    value={form[key as keyof typeof form]}
                    onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                    placeholder={placeholder}
                    className="w-full bg-slate-900/60 border border-white/[0.06] rounded-xl px-3 py-2
                               text-[12px] text-white placeholder-slate-700
                               focus:outline-none focus:border-indigo-500/50 transition-colors"
                  />
                </div>
              ))}
              <div>
                <label className="block text-[10px] text-slate-600 uppercase tracking-wider mb-1">Stage</label>
                <select
                  value={form.stage}
                  onChange={e => setForm(f => ({ ...f, stage: e.target.value }))}
                  className="w-full bg-slate-900/60 border border-white/[0.06] rounded-xl px-3 py-2
                             text-[12px] text-white focus:outline-none focus:border-indigo-500/50 transition-colors">
                  {STAGES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>
            <div className="flex gap-2 px-5 pb-5">
              <button onClick={() => setShowNew(false)}
                className="flex-1 py-2 text-[11px] font-medium rounded-xl border border-white/[0.06] text-slate-500 hover:text-slate-300 transition-colors">
                Cancel
              </button>
              <button onClick={handleCreate} disabled={creating || !form.name.trim() || !form.company.trim()}
                className="flex-1 py-2 text-[11px] font-semibold rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white transition-colors flex items-center justify-center gap-1.5">
                {creating ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Creating…</> : 'Create Deal'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}