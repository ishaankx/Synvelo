'use client'
import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Loader2 } from 'lucide-react'

const PUBLIC_PATHS = ['/login']

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const router   = useRouter()
  const pathname = usePathname()
  const [checking, setChecking] = useState(true)
  const [authed,   setAuthed]   = useState(false)

  useEffect(() => {
    // Check initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      const isPublic = PUBLIC_PATHS.includes(pathname)

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
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
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
      <div className="min-h-screen bg-[#070b12] flex items-center justify-center">
        <Loader2 className="w-5 h-5 text-slate-600 animate-spin" />
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