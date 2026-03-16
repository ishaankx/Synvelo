'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Loader2, LayoutDashboard, CheckCircle } from 'lucide-react'

export default function LoginPage() {
  const router = useRouter()
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState<string | null>(null)
  const [success,  setSuccess]  = useState<string | null>(null)
  const [mode,     setMode]     = useState<'login' | 'signup'>('login')
  const [orgName,  setOrgName]  = useState('')

  const handleSubmit = async () => {
    if (!email || !password) return
    setLoading(true)
    setError(null)
    setSuccess(null)

    try {
      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
        router.push('/deals')

      } else {
        // Step 1: Create Supabase user
        const { error: signupError } = await supabase.auth.signUp({ email, password })
        if (signupError) throw signupError

        // Step 2: Create org with unique slug
        const baseSlug   = orgName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
        const uniqueSlug = `${baseSlug}-${Math.random().toString(36).slice(2, 6)}`

        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/organisations/`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: orgName, slug: uniqueSlug, plan: 'free' }),
        })
        if (!res.ok) {
          const err = await res.json().catch(() => ({}))
          throw new Error(err.detail || 'Failed to create organisation')
        }
        const org = await res.json()

        // Step 3: Write org_id into user metadata
        const { error: updateError } = await supabase.auth.updateUser({
          data: { org_id: org.id, org_name: org.name }
        })
        if (updateError) throw updateError

        // Step 4: Sign out — user must log in fresh so JWT contains org_id
        await supabase.auth.signOut()

        // Step 5: Wait for AuthGuard to process signOut before updating UI
        await new Promise(r => setTimeout(r, 400))

        // Step 6: Show success, switch to login mode
        setSuccess('Account created! Sign in with your new credentials.')
        setMode('login')
        setPassword('')
        setOrgName('')
      }
    } catch (e: any) {
      setError(e.message || 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#070b12] flex items-center justify-center p-4">
      <div className="w-full max-w-sm">

        {/* Logo */}
        <div className="flex items-center gap-3 mb-8 justify-center">
          <div className="w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center">
            <LayoutDashboard className="w-5 h-5 text-white" />
          </div>
          <span className="text-[18px] font-bold text-white">Synvelo</span>
        </div>

        <div className="bg-[#0d1117] border border-white/[0.07] rounded-2xl p-7 shadow-2xl">
          <h1 className="text-[15px] font-semibold text-white mb-1">
            {mode === 'login' ? 'Sign in to Synvelo' : 'Create your account'}
          </h1>
          <p className="text-[11px] text-slate-600 mb-6">
            {mode === 'login' ? 'Revenue execution intelligence platform' : 'Start your free account'}
          </p>

          <div className="space-y-3">
            {mode === 'signup' && (
              <div>
                <label className="block text-[10px] text-slate-600 uppercase tracking-wider mb-1">
                  Company / Org Name
                </label>
                <input
                  value={orgName}
                  onChange={e => setOrgName(e.target.value)}
                  placeholder="e.g. Acme Sales Team"
                  className="w-full bg-slate-900/60 border border-white/[0.06] rounded-xl px-3 py-2.5
                             text-[12px] text-white placeholder-slate-700
                             focus:outline-none focus:border-indigo-500/50 transition-colors"
                />
              </div>
            )}

            <div>
              <label className="block text-[10px] text-slate-600 uppercase tracking-wider mb-1">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@company.com"
                className="w-full bg-slate-900/60 border border-white/[0.06] rounded-xl px-3 py-2.5
                           text-[12px] text-white placeholder-slate-700
                           focus:outline-none focus:border-indigo-500/50 transition-colors"
              />
            </div>

            <div>
              <label className="block text-[10px] text-slate-600 uppercase tracking-wider mb-1">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                onKeyDown={e => e.key === 'Enter' && handleSubmit()}
                className="w-full bg-slate-900/60 border border-white/[0.06] rounded-xl px-3 py-2.5
                           text-[12px] text-white placeholder-slate-700
                           focus:outline-none focus:border-indigo-500/50 transition-colors"
              />
            </div>
          </div>

          {error && (
            <p className="text-[11px] text-red-400 mt-3 bg-red-950/30 border border-red-500/20 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          {success && (
            <div className="flex items-start gap-2 mt-3 bg-green-950/30 border border-green-500/20 rounded-lg px-3 py-2">
              <CheckCircle className="w-3.5 h-3.5 text-green-400 mt-0.5 flex-shrink-0" />
              <p className="text-[11px] text-green-400">{success}</p>
            </div>
          )}

          <button
            onClick={handleSubmit}
            disabled={loading || !email || !password || (mode === 'signup' && !orgName)}
            className="w-full mt-5 py-2.5 text-[12px] font-semibold rounded-xl
                       bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50
                       text-white transition-colors flex items-center justify-center gap-2"
          >
            {loading
              ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> {mode === 'login' ? 'Signing in…' : 'Creating account…'}</>
              : mode === 'login' ? 'Sign In' : 'Create Account'
            }
          </button>

          <p className="text-center text-[11px] text-slate-600 mt-4">
            {mode === 'login' ? "Don't have an account? " : 'Already have an account? '}
            <button
              onClick={() => { setMode(m => m === 'login' ? 'signup' : 'login'); setError(null); setSuccess(null) }}
              className="text-indigo-400 hover:text-indigo-300 transition-colors"
            >
              {mode === 'login' ? 'Sign up' : 'Sign in'}
            </button>
          </p>
        </div>
      </div>
    </div>
  )
}