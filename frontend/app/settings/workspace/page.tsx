'use client'
import { useEffect, useState } from 'react'
import { Loader2, ExternalLink } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { organisationsApi } from '@/lib/api'
import SettingsHeader from '@/components/SettingsHeader'
import SettingsSection from '@/components/SettingsSection'

interface OrgData {
  id:         string
  name:       string
  slug:       string
  plan:       string
  created_at: string
}

const PLAN_BADGE: Record<string, { color: string; label: string }> = {
  free:       { color: 'bg-gray-50 text-gray-700 border-gray-200',          label: 'Free' },
  starter:    { color: 'bg-blue-50 text-blue-700 border-blue-200',           label: 'Starter' },
  growth:     { color: 'bg-violet-50 text-violet-700 border-violet-200',     label: 'Growth' },
  enterprise: { color: 'bg-amber-50 text-amber-700 border-amber-200',        label: 'Enterprise' },
}

export default function WorkspaceSettingsPage() {
  const [org, setOrg]         = useState<OrgData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)

  useEffect(() => {
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        const meta = (user?.user_metadata ?? {}) as Record<string, any>
        const app  = (user?.app_metadata  ?? {}) as Record<string, any>
        const orgId = meta.org_id || app.org_id
        if (!orgId) { setError('No organisation linked to your account.'); setLoading(false); return }
        const r = await organisationsApi.get(orgId)
        setOrg(r.data)
      } catch (e: any) {
        setError(e?.response?.data?.detail || 'Could not load workspace.')
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  if (loading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="w-5 h-5 syn-text-muted animate-spin" /></div>
  }

  const plan = org ? (PLAN_BADGE[org.plan] || PLAN_BADGE.free) : PLAN_BADGE.free

  return (
    <>
      <SettingsHeader title="Workspace" description="Organisation details, plan tier, and team configuration" />

      {error && (
        <div className="mb-6 px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-[12px] text-red-700">
          {error}
        </div>
      )}

      {org && (
        <>
          {/* Hero card */}
          <section className="mb-8">
            <div className="bg-white border syn-border rounded-xl p-6">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-4 min-w-0">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-white font-bold text-[18px] flex-shrink-0">
                    {org.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="text-[18px] font-semibold text-gray-900 truncate">{org.name}</p>
                    <p className="text-[12px] text-gray-500 font-mono mt-0.5">@{org.slug}</p>
                  </div>
                </div>
                <span className={`text-[10.5px] font-bold uppercase tracking-wider border px-2.5 py-1 rounded-md flex-shrink-0 ${plan.color}`}>
                  {plan.label}
                </span>
              </div>
            </div>
          </section>

          <SettingsSection title="Organisation details">
            <div className="divide-y divide-gray-100">
              <Row label="Organisation ID" value={org.id} mono />
              <Row label="Slug"            value={org.slug} mono />
              <Row label="Plan"            value={plan.label} />
              <Row label="Created"
                value={org.created_at ? new Date(org.created_at).toLocaleString() : '—'} />
            </div>
          </SettingsSection>

          <SettingsSection title="Manage workspace" description="Plan changes, renaming, and team invitations">
            <a
              href="mailto:support@synvelo.com?subject=Workspace%20upgrade%20request"
              className="flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition-colors group"
            >
              <div>
                <p className="text-[13px] font-medium text-gray-900">Contact support</p>
                <p className="text-[12px] text-gray-500 mt-0.5">Upgrade your plan, rename the workspace, or invite teammates.</p>
              </div>
              <ExternalLink className="w-4 h-4 text-gray-400 group-hover:text-gray-600 flex-shrink-0" />
            </a>
          </SettingsSection>
        </>
      )}
    </>
  )
}

function Row({ label, value, mono }: { label: string, value: string, mono?: boolean }) {
  return (
    <div className="flex items-center px-5 py-3.5">
      <p className="text-[12px] text-gray-500 w-40 flex-shrink-0">{label}</p>
      <p className={`text-[12.5px] text-gray-900 truncate ${mono ? 'font-mono text-[11.5px] text-gray-700' : ''}`}>
        {value}
      </p>
    </div>
  )
}
