'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

export type Role = 'owner' | 'admin' | 'member' | 'viewer' | null

const RANK: Record<Exclude<Role, null>, number> = {
  viewer: 0,
  member: 1,
  admin: 2,
  owner: 3,
}

/**
 * Reads the current user's role from the Supabase JWT (user_metadata.role
 * or app_metadata.role). Returns null while loading or if no role is set.
 *
 * Backend is the authoritative source — this is only for UI gating.
 */
export function useRole(): { role: Role; loading: boolean; atLeast: (r: Exclude<Role, null>) => boolean } {
  const [role, setRole] = useState<Role>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!active) return
      const r =
        (user?.user_metadata?.role as Role) ||
        (user?.app_metadata?.role as Role) ||
        null
      setRole(r && r in RANK ? r : null)
      setLoading(false)
    })
    return () => { active = false }
  }, [])

  const atLeast = (target: Exclude<Role, null>) =>
    role !== null && RANK[role] >= RANK[target]

  return { role, loading, atLeast }
}
