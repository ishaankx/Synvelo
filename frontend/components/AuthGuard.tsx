'use client'
import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Loader2 } from 'lucide-react'

const PUBLIC_PATHS = ['/login']
const MAX_SESSION_AGE_MS = 24 * 60 * 60 * 1000 // 24 hours
const AUTH_TIMEOUT_MS    = 4000                 // fail fast if Supabase is unreachable

function isSessionExpired(session: { user: { last_sign_in_at?: string } }): boolean {
  const signedInAt = session.user.last_sign_in_at
  if (!signedInAt) return true
  return Date.now() - new Date(signedInAt).getTime() > MAX_SESSION_AGE_MS
}

/**
 * Race getSession against a timeout so the UI is never blocked
 * for more than AUTH_TIMEOUT_MS when Supabase is slow/unreachable.
 */
async function getSessionWithTimeout() {
  const timeout = new Promise<null>(resolve =>
    setTimeout(() => resolve(null), AUTH_TIMEOUT_MS),
  )
  const sessionPromise = supabase.auth.getSession()
    .then(({ data: { session } }) => session)
    .catch(() => null)

  return Promise.race([sessionPromise, timeout])
}

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const router   = useRouter()
  const pathname = usePathname()
  const [checking, setChecking] = useState(true)
  const [authed,   setAuthed]   = useState(false)

  useEffect(() => {
    // Check initial session — with a timeout so we never block the UI
    getSessionWithTimeout().then(async (session) => {
      const isPublic = PUBLIC_PATHS.includes(pathname)

      if (session && isSessionExpired(session)) {
        try { await supabase.auth.signOut() } catch {}
        router.replace('/login')
        setChecking(false)
        return
      }

      if (!session && !isPublic) {
        router.replace('/login')
      } else if (session && pathname === '/login') {
        router.replace('/deals')
      } else {
        setAuthed(true)
      }
      setChecking(false)
    })

    // Listen for auth state changes (login, logout, token refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, _session) => {
      if (event === 'SIGNED_OUT') {
        router.replace('/login')
      }
      if (event === 'SIGNED_IN' && pathname === '/login') {
        router.replace('/deals')
      }
    })

    return () => subscription.unsubscribe()
  }, [pathname, router])

  if (checking) {
    return (
      <div className="min-h-screen bg-[#F8F9FA] flex items-center justify-center">
        <Loader2 className="w-5 h-5 text-gray-400 animate-spin" />
      </div>
    )
  }

  // Show login page without sidebar
  if (PUBLIC_PATHS.includes(pathname)) {
    return <>{children}</>
  }

  if (!authed) return null

  return <>{children}</>
}