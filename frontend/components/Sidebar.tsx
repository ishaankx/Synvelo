'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard, TrendingUp, Zap, Mic, BarChart3, FileText
} from 'lucide-react'

const NAV = [
  { href: '/deals',     icon: TrendingUp,     label: 'Pipeline'   },
  { href: '/pulse',     icon: Zap,            label: 'Pulse Sync' },
  { href: '/transcribe',icon: Mic,            label: 'Transcribe' },
  { href: '/analytics', icon: BarChart3,      label: 'Analytics'  },
  { href: '/reports',   icon: FileText,       label: 'Reports'    },
]

export default function Sidebar() {
  const path = usePathname()

  return (
    <div className="w-[56px] h-full bg-[#060910] border-r border-white/[0.05] flex flex-col items-center py-4 flex-shrink-0">
      {/* Logo */}
      <div className="w-8 h-8 rounded-xl bg-indigo-600 flex items-center justify-center mb-6 flex-shrink-0">
        <LayoutDashboard className="w-4 h-4 text-white" />
      </div>

      <nav className="flex flex-col gap-1.5 flex-1">
        {NAV.map(({ href, icon: Icon, label }) => {
          const active = path.startsWith(href)
          return (
            <Link
              key={href}
              href={href}
              title={label}
              className={`
                w-9 h-9 rounded-xl flex items-center justify-center transition-all
                ${active
                  ? 'bg-indigo-500/[0.15] text-indigo-400 border border-indigo-500/[0.2]'
                  : 'text-slate-600 hover:text-slate-300 hover:bg-white/[0.04] border border-transparent'
                }
              `}
            >
              <Icon className="w-4 h-4" />
            </Link>
          )
        })}
      </nav>
    </div>
  )
}