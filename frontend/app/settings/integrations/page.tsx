'use client'
import { useEffect, useState } from 'react'
import { CheckCircle2, XCircle, Loader2, Sparkles, Database, ShieldCheck, Server, AlertCircle, Globe, AlertTriangle } from 'lucide-react'
import api from '@/lib/api'
import SettingsHeader from '@/components/SettingsHeader'
import SettingsSection from '@/components/SettingsSection'

interface Health {
  status:    string
  version?:  string
  database?: string
}

type Status = 'live' | 'degraded' | 'offline' | 'unknown'

export default function IntegrationsSettingsPage() {
  const [health, setHealth] = useState<Health | null>(null)
  const [healthError, setHealthError] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get('/health')
      .then(r => setHealth(r.data))
      .catch(() => setHealthError(true))
      .finally(() => setLoading(false))
  }, [])

  const apiStatus: Status = healthError ? 'offline' : health?.status === 'ok' ? 'live' : 'unknown'
  const dbStatus:  Status =
    health?.database === 'connected'    ? 'live' :
    health?.database === 'disconnected' ? 'offline' : 'unknown'

  return (
    <>
      <SettingsHeader title="Integrations" description="External services powering Synvelo" />

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-5 h-5 syn-text-muted animate-spin" />
        </div>
      ) : (
        <>
          <SettingsSection title="Core infrastructure">
            <div className="divide-y divide-gray-100">
              <IntegrationRow
                icon={Server} iconColor="text-emerald-600"
                name="Synvelo Backend API"
                description={health?.version ? `FastAPI ${health.version}` : 'FastAPI service'}
                status={apiStatus}
              />
              <IntegrationRow
                icon={Database} iconColor="text-blue-600"
                name="PostgreSQL + pgvector"
                description="Primary database — deals, documents, embeddings"
                status={dbStatus}
              />
              <IntegrationRow
                icon={Database} iconColor="text-red-500"
                name="Redis"
                description="Rate limiting and AI usage metering"
                status="unknown"
                note="Health is reported only at server startup. Falls back to in-memory if unreachable in dev."
              />
            </div>
          </SettingsSection>

          <SettingsSection title="AI & authentication">
            <div className="divide-y divide-gray-100">
              <IntegrationRow
                icon={Sparkles} iconColor="text-violet-600"
                name="OpenAI"
                description="GPT-4o, GPT-4o-mini, Whisper, text-embedding-3-small"
                status="live"
                note="Status reflects backend configuration. Live OpenAI uptime is not polled."
              />
              <IntegrationRow
                icon={ShieldCheck} iconColor="text-indigo-600"
                name="Supabase Auth"
                description="JWT issuer for user authentication"
                status="live"
              />
            </div>
          </SettingsSection>

          <SettingsSection title="External data">
            <div className="divide-y divide-gray-100">
              <IntegrationRow
                icon={Globe} iconColor="text-pink-600"
                name="Frankfurter (ECB FX rates)"
                description="Daily exchange rates for currency consolidation"
                status="live"
                note="Cached client-side for 24 hours. See Currency settings for details."
              />
              <IntegrationRow
                icon={AlertTriangle} iconColor="text-amber-600"
                name="Pulse Sync ERP (Mock)"
                description="Hardcoded inventory and shipping mock — not a real ERP integration"
                status="degraded"
                note="A real SAP / Oracle / NetSuite connector is on the roadmap."
              />
            </div>
          </SettingsSection>
        </>
      )}
    </>
  )
}

function IntegrationRow({ icon: Icon, iconColor, name, description, status, note }: {
  icon: React.ElementType, iconColor: string,
  name: string, description: string,
  status: Status, note?: string,
}) {
  const statusUI = {
    live:     { color: 'text-emerald-700 bg-emerald-50 border-emerald-200', label: 'Connected', Dot: CheckCircle2 },
    degraded: { color: 'text-amber-700 bg-amber-50 border-amber-200',       label: 'Mock',      Dot: AlertCircle },
    offline:  { color: 'text-red-700 bg-red-50 border-red-200',             label: 'Offline',   Dot: XCircle },
    unknown:  { color: 'text-gray-600 bg-gray-50 border-gray-200',          label: 'Unknown',   Dot: AlertCircle },
  }[status]
  const StatusIcon = statusUI.Dot

  return (
    <div className="flex items-start gap-3 px-5 py-4">
      <Icon className={`w-4 h-4 ${iconColor} flex-shrink-0 mt-0.5`} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2 mb-0.5">
          <p className="text-[13px] font-medium text-gray-900">{name}</p>
          <span className={`flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider border px-2 py-0.5 rounded-md flex-shrink-0 ${statusUI.color}`}>
            <StatusIcon className="w-3 h-3" />
            {statusUI.label}
          </span>
        </div>
        <p className="text-[12px] text-gray-500 leading-relaxed">{description}</p>
        {note && <p className="text-[11px] text-gray-400 italic mt-1">{note}</p>}
      </div>
    </div>
  )
}
