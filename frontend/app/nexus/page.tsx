'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { nexusApi } from '@/lib/api'
import {
  Brain, Dna, FlaskConical, FileOutput, Loader2,
  ChevronRight, AlertTriangle, CheckCircle2, Database,
} from 'lucide-react'

interface ModelStatus {
  org_id: string
  has_model: boolean
  model_ready: boolean
  model_version: number | null
  n_training_samples: number | null
  cv_auc: number | null
  trained_at: string | null
  min_samples_needed: number
  current_sample_count: number
  can_train: boolean
  training_in_progress: boolean
}

const NEXUS_MODULES = [
  {
    href: '/nexus/win-dna',
    icon: Dna,
    label: 'Win DNA',
    desc: 'Discover what makes your deals win or lose. SHAP-powered causal attribution from your historical data.',
    color: 'text-emerald-500',
    bg: 'bg-emerald-500/10',
    border: 'border-l-emerald-500',
  },
  {
    href: '/nexus/simulate',
    icon: FlaskConical,
    label: 'Scenario Simulator',
    desc: 'Run 500+ pricing, timing, and action scenarios on any live deal. Find the optimal next move.',
    color: 'text-violet-500',
    bg: 'bg-violet-500/10',
    border: 'border-l-violet-500',
  },
  {
    href: '/nexus/artifacts',
    icon: FileOutput,
    label: 'Execution Artifacts',
    desc: 'Generate proposals, ROI calculators, battle cards, and next-best emails grounded in simulation data.',
    color: 'text-amber-500',
    bg: 'bg-amber-500/10',
    border: 'border-l-amber-500',
  },
]

export default function NexusPage() {
  const [status, setStatus] = useState<ModelStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [extracting, setExtracting] = useState(false)
  const [training, setTraining] = useState(false)

  useEffect(() => {
    nexusApi.status().then(r => setStatus(r.data)).catch(() => {}).finally(() => setLoading(false))
  }, [])

  const handleExtract = async () => {
    setExtracting(true)
    try {
      await nexusApi.extractAll()
      const r = await nexusApi.status()
      setStatus(r.data)
    } catch {}
    setExtracting(false)
  }

  const handleTrain = async () => {
    setTraining(true)
    try {
      await nexusApi.train(true)
      const r = await nexusApi.status()
      setStatus(r.data)
    } catch {}
    setTraining(false)
  }

  if (loading) return (
    <div className="flex-1 flex items-center justify-center h-screen syn-bg">
      <Loader2 className="w-6 h-6 syn-text-muted animate-spin" />
    </div>
  )

  return (
    <div className="flex flex-col h-full syn-bg">
      {/* Header */}
      <div className="h-16 border-b syn-border px-6 flex items-center gap-3 flex-shrink-0">
        <div className="w-9 h-9 rounded-lg bg-indigo-500/10 flex items-center justify-center">
          <Brain className="w-5 h-5 text-indigo-500" />
        </div>
        <div>
          <h1 className="text-[18px] font-semibold syn-text-primary">NEXUS</h1>
          <p className="text-[12px] text-gray-500">Revenue Simulation Engine</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto syn-scroll p-6 space-y-6">

        {/* Model Status Card */}
        <div className="syn-card p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Database className="w-4 h-4 syn-text-tertiary" />
              <p className="text-[13px] font-semibold syn-text-primary">Model Status</p>
            </div>
            {status?.model_ready ? (
              <span className="flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-200">
                <CheckCircle2 className="w-3 h-3" /> Ready v{status.model_version}
              </span>
            ) : (
              <span className="flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-600 border border-amber-200">
                <AlertTriangle className="w-3 h-3" /> Not trained
              </span>
            )}
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-5">
            <div className="bg-gray-50 rounded-lg p-3">
              <p className="text-[11px] syn-text-tertiary uppercase tracking-wider mb-1">Training Samples</p>
              <p className="text-[20px] font-bold syn-text-primary">{status?.current_sample_count ?? 0}</p>
              <p className="text-[11px] syn-text-muted">min {status?.min_samples_needed ?? 30} needed</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-3">
              <p className="text-[11px] syn-text-tertiary uppercase tracking-wider mb-1">Model AUC</p>
              <p className="text-[20px] font-bold syn-text-primary">
                {status?.cv_auc ? `${(status.cv_auc * 100).toFixed(1)}%` : '—'}
              </p>
              <p className="text-[11px] syn-text-muted">cross-validated</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-3">
              <p className="text-[11px] syn-text-tertiary uppercase tracking-wider mb-1">Version</p>
              <p className="text-[20px] font-bold syn-text-primary">{status?.model_version ?? '—'}</p>
              <p className="text-[11px] syn-text-muted">
                {status?.trained_at ? new Date(status.trained_at).toLocaleDateString() : 'never'}
              </p>
            </div>
            <div className="bg-gray-50 rounded-lg p-3">
              <p className="text-[11px] syn-text-tertiary uppercase tracking-wider mb-1">Status</p>
              <p className="text-[20px] font-bold syn-text-primary">
                {status?.model_ready ? 'Active' : 'Inactive'}
              </p>
              <p className="text-[11px] syn-text-muted">
                {status?.training_in_progress ? 'training...' : 'idle'}
              </p>
            </div>
          </div>

          <div className="flex gap-3">
            <button onClick={handleExtract} disabled={extracting}
              className="flex items-center gap-2 px-4 py-2 text-[12px] font-medium rounded-lg
                         bg-gray-100 text-gray-700 hover:bg-gray-200 transition-all disabled:opacity-50">
              {extracting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Database className="w-3.5 h-3.5" />}
              {extracting ? 'Extracting…' : 'Extract Features'}
            </button>
            <button onClick={handleTrain} disabled={training || (status?.current_sample_count ?? 0) < 5}
              className="flex items-center gap-2 px-4 py-2 text-[12px] font-medium rounded-lg
                         bg-indigo-600 text-white hover:bg-indigo-700 transition-all disabled:opacity-50">
              {training ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Brain className="w-3.5 h-3.5" />}
              {training ? 'Training…' : 'Train Model'}
            </button>
          </div>
        </div>

        {/* Module Cards */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {NEXUS_MODULES.map(({ href, icon: Icon, label, desc, color, bg, border }) => (
            <Link key={href} href={href}
              className={cn('syn-card p-6 border-l-4 hover:shadow-md transition-all group', border)}>
              <div className="flex items-start justify-between mb-3">
                <div className={cn('w-10 h-10 rounded-lg flex items-center justify-center', bg)}>
                  <Icon className={cn('w-5 h-5', color)} />
                </div>
                <ChevronRight className="w-4 h-4 syn-text-muted group-hover:text-gray-600 transition-colors" />
              </div>
              <h3 className="text-[15px] font-semibold syn-text-primary mb-1.5">{label}</h3>
              <p className="text-[12px] syn-text-tertiary leading-relaxed">{desc}</p>
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
