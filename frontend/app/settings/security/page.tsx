'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { LogOut, Loader2, Clock, Key } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import SettingsHeader from '@/components/SettingsHeader'
import SettingsSection from '@/components/SettingsSection'

export default function SecuritySettingsPage() {
  const router = useRouter()
  const [lastSignIn, setLastSignIn] = useState<string | null>(null)
  const [signingOut, setSigningOut] = useState(false)
  const [resetting, setResetting]   = useState(false)
  const [resetMsg, setResetMsg]     = useState<string | null>(null)
  const [loading, setLoading]       = useState(true)

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setLastSignIn(user?.last_sign_in_at ?? null)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  const signOut = async () => {
    setSigningOut(true)
    try {
      await supabase.auth.signOut()
      router.push('/login')
    } finally {
      setSigningOut(false)
    }
  }

  const sendReset = async () => {
    setResetting(true)
    setResetMsg(null)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user?.email) { setResetMsg('No email on file.'); return }
      await supabase.auth.resetPasswordForEmail(user.email, {
        redirectTo: `${window.location.origin}/login`,
      })
      setResetMsg(`Password reset email sent to ${user.email}.`)
    } catch (e: any) {
      setResetMsg(e?.message || 'Could not send reset email.')
    } finally {
      setResetting(false)
    }
  }

  const sessionAgeHours = lastSignIn
    ? Math.floor((Date.now() - new Date(lastSignIn).getTime()) / 3_600_000)
    : null

  if (loading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="w-5 h-5 syn-text-muted animate-spin" /></div>
  }

  return (
    <>
      <SettingsHeader title="Security & Privacy" description="Session, authentication, and data handling" />

      <SettingsSection
        title="Current session"
        description="Sessions automatically expire after 24 hours."
      >
        <div className="divide-y divide-gray-100">
          <div className="flex items-start gap-3 px-5 py-3.5">
            <Clock className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-[12px] text-gray-500">Last sign-in</p>
              <p className="text-[12.5px] font-medium text-gray-900 mt-0.5">
                {lastSignIn ? new Date(lastSignIn).toLocaleString() : '—'}
                {sessionAgeHours !== null && (
                  <span className="text-gray-400 ml-2 font-normal">({sessionAgeHours}h ago)</span>
                )}
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3 px-5 py-3.5">
            <Key className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-[12px] text-gray-500">Auth provider</p>
              <p className="text-[12.5px] font-medium text-gray-900 mt-0.5">Supabase Auth (JWT)</p>
            </div>
          </div>
        </div>
      </SettingsSection>

      <SettingsSection
        title="Password"
        description="Password resets are sent via Supabase Auth to your registered email."
      >
        <div className="px-5 py-4">
          <button onClick={sendReset} disabled={resetting}
            className="px-3 py-1.5 text-[12px] font-medium rounded-md text-gray-700 border syn-border hover:bg-gray-50 disabled:opacity-50 transition-colors">
            {resetting ? 'Sending…' : 'Send password reset email'}
          </button>
          {resetMsg && (
            <p className="text-[11.5px] text-gray-600 mt-3">{resetMsg}</p>
          )}
        </div>
      </SettingsSection>

      <SettingsSection
        title="Data & privacy"
        description="How Synvelo handles your data"
      >
        <div className="px-5 py-4">
          <p className="text-[12px] text-gray-700 leading-relaxed">
            Your deal data is stored on PostgreSQL with org-level isolation enforced via{' '}
            <code className="bg-gray-100 px-1 rounded font-mono text-[11px]">org_id</code>{' '}
            filtering on every query. Document text and embeddings remain inside your tenant.
            AI usage is metered for 90 days; no document content is sent to OpenAI for training.
          </p>
        </div>
      </SettingsSection>

      <SettingsSection title="Sign out">
        <div className="px-5 py-4">
          <p className="text-[12px] text-gray-500 mb-3">
            End your session on this device. You will need to sign in again to access Synvelo.
          </p>
          <button onClick={signOut} disabled={signingOut}
            className="flex items-center gap-2 px-3 py-1.5 text-[12px] font-medium rounded-md
                       bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 transition-colors">
            {signingOut ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <LogOut className="w-3.5 h-3.5" />}
            {signingOut ? 'Signing out…' : 'Sign out of this device'}
          </button>
        </div>
      </SettingsSection>
    </>
  )
}
