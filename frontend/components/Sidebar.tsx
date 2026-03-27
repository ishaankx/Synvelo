'use client'
import Image from 'next/image'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  LayoutGrid, Zap, Mic, BarChart3,
  FileText, LogOut, ChevronRight, Brain,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'

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
]

export default function Sidebar() {
  const path   = usePathname()
  const router = useRouter()

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.replace('/login')
  }

  if (path === '/login') return null

  return (
    <div className="w-[240px] h-full flex flex-col flex-shrink-0"
         style={{ backgroundColor: '#1e1b4b' }}>

      {/* Logo — large and prominent */}
      <div className="h-[72px] px-5 flex items-center gap-3 flex-shrink-0 border-b border-white/[0.08]">
        <Image
          src="/SynveloLogo_v1.png"
          alt="Synvelo"
          width={44}
          height={44}
          className="flex-shrink-0"
        />
        <span className="text-[18px] font-bold text-white tracking-tight">
          Synvelo
        </span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-5 px-3 syn-scroll-dark">
        {NAV_GROUPS.map((group) => (
          <div key={group.label} className="mb-6">
            <p className="text-[10px] font-semibold text-indigo-300/50 uppercase tracking-[0.1em] px-3 mb-2">
              {group.label}
            </p>
            <div className="space-y-0.5">
              {group.items.map(({ href, icon: Icon, label }) => {
                const active = path.startsWith(href)
                return (
                  <Link
                    key={href}
                    href={href}
                    className={cn(
                      'flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-[13px] font-medium transition-all group',
                      active
                        ? 'bg-white/[0.12] text-white'
                        : 'text-indigo-200/70 hover:text-white hover:bg-white/[0.06]',
                    )}
                  >
                    <Icon className={cn(
                      'w-[18px] h-[18px] flex-shrink-0',
                      active ? 'text-white' : 'text-indigo-300/50 group-hover:text-indigo-200',
                    )} />
                    <span className="flex-1 truncate">{label}</span>
                    {active && (
                      <ChevronRight className="w-3.5 h-3.5 text-white/50" />
                    )}
                  </Link>
                )
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Bottom — logout */}
      <div className="px-3 pb-4 pt-2 border-t border-white/[0.08] flex-shrink-0">
        <button
          onClick={handleLogout}
          className="flex items-center gap-2.5 w-full px-3 py-2.5 rounded-lg
                     text-[13px] font-medium text-indigo-200/60
                     hover:text-red-300 hover:bg-red-500/[0.08] transition-all"
        >
          <LogOut className="w-[18px] h-[18px]" />
          <span>Sign out</span>
        </button>
      </div>
    </div>
  )
}
