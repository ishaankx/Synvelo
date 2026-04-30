'use client'
import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { analyticsApi } from '@/lib/api'
import SettingsHeader from '@/components/SettingsHeader'
import SettingsSection from '@/components/SettingsSection'

interface UsageData {
  org_id:  string
  month:   string
  usage:   Record<string, number>
  total:   number
}

const FEATURE_LABELS: Record<string, string> = {
  score:               'Deal Scoring',
  brief:               'Executive Brief',
  brief_gen:           'Executive Brief',
  followup:            'Follow-up Email',
  followup_email:      'Follow-up Email',
  ask_ai:              'Ask AI (legacy)',
  ask_ai_v2:           'Ask AI (ARIA)',
  report_intelligence: 'Intelligence Report',
  journey_report:      'Journey Report',
  nexus_score:         'NEXUS Scoring',
  nexus_train:         'NEXUS Training',
  nexus_simulate:      'NEXUS Simulation',
  transcribe:          'Call Transcription',
  total:               'Total',
}

export default function UsageSettingsPage() {
  const [data, setData] = useState<UsageData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    analyticsApi.usage()
      .then(r => setData(r.data))
      .catch(() => setError(true))
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="w-5 h-5 syn-text-muted animate-spin" /></div>
  }

  const entries = data
    ? Object.entries(data.usage).filter(([k]) => k !== 'total').sort(([, a], [, b]) => b - a)
    : []
  const max = entries.length ? Math.max(...entries.map(([, v]) => v)) : 1
  const total = data?.total ?? 0

  return (
    <>
      <SettingsHeader title="AI Usage" description="Monthly AI feature usage and rate limits" />

      {error && (
        <div className="mb-6 px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-[12px] text-red-700">
          Could not load usage stats.
        </div>
      )}

      {data && (
        <>
          {/* Hero metric */}
          <section className="mb-8">
            <div className="bg-white border syn-border rounded-xl p-6">
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Total AI calls · {data.month}</p>
              <p className="text-[36px] font-semibold text-gray-900 tabular-nums mt-1 leading-none">
                {total.toLocaleString()}
              </p>
              <p className="text-[12px] text-gray-500 mt-2">
                Counted across all AI endpoints for your organisation this month.
              </p>
            </div>
          </section>

          <SettingsSection title="Breakdown by feature">
            <div className="px-5 py-5">
              {entries.length === 0 ? (
                <p className="text-[12px] text-gray-400 italic text-center py-8">
                  No AI usage recorded this month.
                </p>
              ) : (
                <div className="space-y-3.5">
                  {entries.map(([key, value]) => {
                    const pct = (value / max) * 100
                    return (
                      <div key={key}>
                        <div className="flex items-center justify-between text-[12px] mb-1.5">
                          <span className="text-gray-700 font-medium">
                            {FEATURE_LABELS[key] || key}
                          </span>
                          <span className="text-gray-900 font-semibold tabular-nums">{value.toLocaleString()}</span>
                        </div>
                        <div className="h-1 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-indigo-500 rounded-full transition-all"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </SettingsSection>

          <SettingsSection title="Rate limits">
            <div className="divide-y divide-gray-100">
              <Row label="General API endpoints" value="100 / minute" />
              <Row label="AI endpoints" sublabel="score, brief, follow-up, ask-AI" value="10 / minute" />
              <Row label="Suggested questions" value="30 / minute" />
            </div>
          </SettingsSection>

          <p className="text-[11px] syn-text-muted">
            Limits apply per-organisation. Hitting a limit returns HTTP 429 with a retry-after hint.
            Usage data is retained for 90 days.
          </p>
        </>
      )}
    </>
  )
}

function Row({ label, sublabel, value }: { label: string, sublabel?: string, value: string }) {
  return (
    <div className="flex items-center justify-between px-5 py-3.5">
      <div>
        <p className="text-[12.5px] text-gray-900">{label}</p>
        {sublabel && <p className="text-[11px] text-gray-400 mt-0.5">{sublabel}</p>}
      </div>
      <span className="text-[12.5px] font-semibold text-gray-900 tabular-nums">{value}</span>
    </div>
  )
}
