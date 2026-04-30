'use client'
/**
 * Local-only user preferences persisted to localStorage.
 * Used by the Settings pages for client-side toggles that don't need a backend.
 */
import { useEffect, useState } from 'react'

const PREFS_KEY = 'synvelo_user_prefs_v1'

export interface UserPrefs {
  // Notifications
  notifyAtRisk:        boolean   // Browser notification when a deal becomes at-risk
  notifyScoreChange:   boolean   // Browser notification when win-prob changes by >10pts
  notifyStageChange:   boolean   // Notify on stage transitions

  // Appearance
  density:             'comfortable' | 'compact'
  showWelcomeBanner:   boolean

  // AI behaviour
  autoSuggestQuestions: boolean   // Show ARIA suggested questions on Ask AI
}

const DEFAULTS: UserPrefs = {
  notifyAtRisk:         false,
  notifyScoreChange:    false,
  notifyStageChange:    false,
  density:              'comfortable',
  showWelcomeBanner:    true,
  autoSuggestQuestions: true,
}

function load(): UserPrefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY)
    if (!raw) return DEFAULTS
    return { ...DEFAULTS, ...JSON.parse(raw) }
  } catch {
    return DEFAULTS
  }
}

export function useUserPrefs() {
  const [prefs, setPrefs] = useState<UserPrefs>(DEFAULTS)
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    setPrefs(load())
    setHydrated(true)
  }, [])

  const update = <K extends keyof UserPrefs>(key: K, value: UserPrefs[K]) => {
    setPrefs(prev => {
      const next = { ...prev, [key]: value }
      try { localStorage.setItem(PREFS_KEY, JSON.stringify(next)) } catch {}
      return next
    })
  }

  const reset = () => {
    try { localStorage.removeItem(PREFS_KEY) } catch {}
    setPrefs(DEFAULTS)
  }

  return { prefs, update, reset, hydrated }
}
