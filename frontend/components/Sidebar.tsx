'use client'
import Image from 'next/image'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import {
  LayoutGrid, Zap, Mic, BarChart3,
  FileText, LogOut, ChevronLeft, Brain, Activity, Settings,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'

const COLLAPSE_KEY     = 'synvelo_sidebar_collapsed'
const SIDEBAR_W_OPEN   = 240
const SIDEBAR_W_CLOSED = 72

const NAV_GROUPS = [
  {
    label: 'Intelligence',
    items: [
      { href: '/deals',      icon: LayoutGrid, label: 'Pipeline'    },
      { href: '/analytics',  icon: BarChart3,  label: 'Analytics'   },
    ],
  },
  {
    label: 'Simulation',
    items: [
      { href: '/nexus',      icon: Brain,      label: 'NEXUS'       },
    ],
  },
  {
    label: 'Operations',
    items: [
      { href: '/pulse',      icon: Zap,        label: 'Pulse Sync'  },
      { href: '/transcribe', icon: Mic,        label: 'Transcribe'  },
      { href: '/reports',    icon: FileText,   label: 'Reports'     },
    ],
  },
  {
    label: 'Monitoring',
    items: [
      { href: '/activity',   icon: Activity,   label: 'Activity'    },
    ],
  },
]

export default function Sidebar() {
  const path   = usePathname()
  const router = useRouter()
  const [collapsed, setCollapsed] = useState(false)
  const [hydrated, setHydrated]   = useState(false)

  useEffect(() => {
    try {
      const stored = localStorage.getItem(COLLAPSE_KEY)
      if (stored === '1') setCollapsed(true)
    } catch {}
    setHydrated(true)
  }, [])

  const toggle = () => {
    setCollapsed(prev => {
      const next = !prev
      try { localStorage.setItem(COLLAPSE_KEY, next ? '1' : '0') } catch {}
      return next
    })
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.replace('/login')
  }

  if (path === '/login') return null

  return (
    <div
      className={cn(
        'h-full flex flex-col flex-shrink-0',
        'transition-[width] duration-300 ease-in-out',
        !hydrated && 'invisible',
      )}
      style={{
        width: collapsed ? SIDEBAR_W_CLOSED : SIDEBAR_W_OPEN,
        backgroundColor: '#1e1b4b',
      }}
    >

      {/* Logo header — collapsed: logo-only and clickable to expand. Expanded: logo + wordmark + chevron. */}
      <div className="h-[72px] flex-shrink-0 border-b border-white/[0.08] flex items-center pl-3 pr-2">
        <button
          onClick={collapsed ? toggle : undefined}
          aria-label={collapsed ? 'Expand sidebar' : undefined}
          disabled={!collapsed}
          className={cn(
            'flex items-center gap-1 rounded-md transition-all duration-200',
            collapsed
              ? 'cursor-pointer hover:opacity-80 active:scale-95'
              : 'cursor-default',
          )}
        >
          <Image
            src="/SynveloLogo_v1.png"
            alt="Synvelo"
            width={50}
            height={50}
            className="flex-shrink-0"
            priority
          />
          <span className={cn(
            'text-[18px] font-bold text-white tracking-tight whitespace-nowrap overflow-hidden',
            'transition-all duration-300 ease-in-out',
            collapsed ? 'max-w-0 opacity-0 ml-0' : 'max-w-[140px] opacity-100 ml-1',
          )}>
            Synvelo
          </span>
        </button>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Toggle chevron — visible only when expanded. Smoothly fades on collapse. */}
        <button
          onClick={toggle}
          aria-label="Collapse sidebar"
          className={cn(
            'flex-shrink-0 w-7 h-7 rounded-md flex items-center justify-center',
            'text-white/70 hover:text-white hover:bg-white/10',
            'transition-all duration-200',
            collapsed
              ? 'opacity-0 scale-90 w-0 pointer-events-none'
              : 'opacity-100 scale-100',
          )}
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto overflow-x-hidden py-4 syn-scroll-dark">
        {NAV_GROUPS.map((group) => (
          <div key={group.label} className="mb-5">
            <p className={cn(
              'text-[10px] font-semibold text-indigo-300/50 uppercase tracking-[0.1em]',
              'transition-all duration-200 overflow-hidden whitespace-nowrap',
              collapsed
                ? 'h-0 mb-0 opacity-0 px-0'
                : 'h-auto mb-2 opacity-100 px-5',
            )}>
              {group.label}
            </p>
            <div className="space-y-0.5 px-2">
              {group.items.map(({ href, icon: Icon, label }) => (
                <NavLink
                  key={href}
                  href={href}
                  Icon={Icon}
                  label={label}
                  active={path.startsWith(href)}
                  collapsed={collapsed}
                />
              ))}
            </div>
          </div>
        ))}
      </nav>

      {/* Bottom — settings + logout, same px-2 column */}
      <div className="border-t border-white/[0.08] flex-shrink-0 py-3 px-2 space-y-0.5">
        <NavLink
          href="/settings"
          Icon={Settings}
          label="Settings"
          active={path.startsWith('/settings')}
          collapsed={collapsed}
        />
        <button
          onClick={handleLogout}
          title={collapsed ? 'Sign out' : undefined}
          className={cn(
            'w-full h-10 flex items-center rounded-lg text-[13px] font-medium',
            'text-indigo-200/60 hover:text-red-300 hover:bg-red-500/[0.08]',
            'transition-colors duration-150',
            collapsed ? 'justify-center px-0' : 'gap-2.5 px-3',
          )}
        >
          <LogOut className="w-[18px] h-[18px] flex-shrink-0" />
          <span className={cn(
            'overflow-hidden whitespace-nowrap transition-all duration-200',
            collapsed ? 'max-w-0 opacity-0' : 'max-w-[140px] opacity-100',
          )}>
            Sign out
          </span>
        </button>
      </div>
    </div>
  )
}

function NavLink({ href, Icon, label, active, collapsed }: {
  href:      string
  Icon:      React.ElementType
  label:     string
  active:    boolean
  collapsed: boolean
}) {
  return (
    <Link
      href={href}
      title={collapsed ? label : undefined}
      className={cn(
        'relative w-full h-10 flex items-center rounded-lg text-[13px] font-medium',
        'transition-colors duration-150 group',
        active
          ? 'bg-white/[0.10] text-white'
          : 'text-indigo-200/70 hover:text-white hover:bg-white/[0.05]',
        collapsed ? 'justify-center px-0' : 'gap-2.5 px-3',
      )}
    >
      {/* Purple active strip — anchored to the sidebar's left edge.
          Parent column has px-2 (8px) so we use -left-2 to escape it. */}
      {active && (
        <span
          aria-hidden
          className="absolute top-1/2 -translate-y-1/2 -left-2 w-[3px] h-5 rounded-r-full bg-indigo-400"
        />
      )}

      <Icon className={cn(
        'w-[18px] h-[18px] flex-shrink-0',
        active ? 'text-white' : 'text-indigo-300/60 group-hover:text-indigo-100',
      )} />

      <span className={cn(
        'overflow-hidden whitespace-nowrap transition-all duration-200',
        collapsed ? 'max-w-0 opacity-0' : 'max-w-[160px] opacity-100',
      )}>
        {label}
      </span>
    </Link>
  )
}
