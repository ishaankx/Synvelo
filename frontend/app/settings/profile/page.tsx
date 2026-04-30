'use client'
import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import SettingsHeader from '@/components/SettingsHeader'
import SettingsSection from '@/components/SettingsSection'

interface ProfileData {
  email:        string
  user_id:      string
  full_name:    string
  org_id:       string | null
  created_at:   string | null
  last_sign_in: string | null
}

export default function ProfileSettingsPage() {
  const [profile, setProfile]     = useState<ProfileData | null>(null)
  const [editing, setEditing]     = useState(false)
  const [nameInput, setNameInput] = useState('')
  const [saving, setSaving]       = useState(false)
  const [loading, setLoading]     = useState(true)

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) { setLoading(false); return }
      const meta = (user.user_metadata ?? {}) as Record<string, any>
      const app  = (user.app_metadata  ?? {}) as Record<string, any>
      const fullName = meta.full_name || meta.name || ''
      setProfile({
        email:        user.email ?? '',
        user_id:      user.id,
        full_name:    fullName,
        org_id:       meta.org_id || app.org_id || null,
        created_at:   user.created_at ?? null,
        last_sign_in: user.last_sign_in_at ?? null,
      })
      setNameInput(fullName)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  const save = async () => {
    setSaving(true)
    try {
      await supabase.auth.updateUser({ data: { full_name: nameInput } })
      setProfile(p => p ? { ...p, full_name: nameInput } : p)
      setEditing(false)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="w-5 h-5 syn-text-muted animate-spin" /></div>
  }

  if (!profile) {
    return (
      <>
        <SettingsHeader title="Profile" description="Your personal information" />
        <p className="text-[13px] text-gray-500">Sign in to view profile.</p>
      </>
    )
  }

  return (
    <>
      <SettingsHeader title="Profile" description="Manage your personal information and account details" />

      <SettingsSection title="Display name" description="How you appear across Synvelo">
        <div className="px-5 py-4">
          {editing ? (
            <div className="flex gap-2">
              <input
                value={nameInput}
                onChange={e => setNameInput(e.target.value)}
                placeholder="Your full name"
                autoFocus
                className="flex-1 px-3 py-2 border syn-border rounded-lg text-[13px] focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400"
              />
              <button onClick={save} disabled={saving}
                className="px-4 py-2 text-[12px] font-medium rounded-lg bg-gray-900 text-white hover:bg-gray-800 disabled:opacity-50 transition-colors">
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Save'}
              </button>
              <button onClick={() => { setEditing(false); setNameInput(profile.full_name) }}
                className="px-4 py-2 text-[12px] font-medium rounded-lg border syn-border text-gray-700 hover:bg-gray-50 transition-colors">
                Cancel
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <p className="text-[14px] text-gray-900">
                {profile.full_name || <span className="text-gray-400 italic">Not set</span>}
              </p>
              <button onClick={() => setEditing(true)}
                className="px-3 py-1.5 text-[12px] font-medium rounded-md text-gray-700 border syn-border hover:bg-gray-50 transition-colors">
                Edit
              </button>
            </div>
          )}
        </div>
      </SettingsSection>

      <SettingsSection title="Account details" description="Read-only identifiers tied to your account">
        <div className="divide-y divide-gray-100">
          <Row label="Email"           value={profile.email} />
          <Row label="User ID"         value={profile.user_id} mono />
          <Row label="Organisation ID" value={profile.org_id || '—'} mono />
          <Row label="Account created" value={profile.created_at  ? new Date(profile.created_at).toLocaleString()  : '—'} />
          <Row label="Last sign-in"    value={profile.last_sign_in ? new Date(profile.last_sign_in).toLocaleString() : '—'} />
        </div>
      </SettingsSection>

      <p className="text-[11px] syn-text-muted">
        Email changes are managed via Supabase Auth and require email verification.
      </p>
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
