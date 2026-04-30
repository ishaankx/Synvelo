'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  User, Building2, Globe, Bell, Palette,
  Plug, BarChart3, Shield, Settings as SettingsIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface NavItem {
  href:    string
  label:   string
  icon:    React.ElementType
}

interface NavGroup {
  label: string
  items: NavItem[]
}

const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Account',
    items: [
      { href: '/settings/profile',  label: 'Profile',           icon: User },
      { href: '/settings/security', label: 'Security & Privacy', icon: Shield },
    ],
  },
  {
    label: 'Workspace',
    items: [
      { href: '/settings/workspace', label: 'Workspace',     icon: Building2 },
      { href: '/settings/usage',     label: 'AI Usage',      icon: BarChart3 },
    ],
  },
  {
    label: 'Preferences',
    items: [
      { href: '/settings/currency',      label: 'Currency',      icon: Globe },
      { href: '/settings/notifications', label: 'Notifications', icon: Bell },
      { href: '/settings/appearance',    label: 'Appearance',    icon: Palette },
    ],
  },
  {
    label: 'Advanced',
    items: [
      { href: '/settings/integrations',  label: 'Integrations',  icon: Plug },
    ],
  },
]

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  return (
    <div className="flex h-full syn-bg">

      {/* Left rail */}
      <aside className="w-64 flex-shrink-0 border-r syn-border bg-white flex flex-col overflow-hidden">
        <div className="h-16 px-5 flex items-center gap-2.5 border-b syn-border flex-shrink-0">
          <div className="w-7 h-7 rounded-lg bg-gray-100 border syn-border flex items-center justify-center">
            <SettingsIcon className="w-3.5 h-3.5 text-gray-500" />
          </div>
          <div>
            <p className="text-[13px] font-semibold syn-text-primary leading-tight">Settings</p>
            <p className="text-[10px] text-gray-400 leading-tight">Workspace · personal</p>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto syn-scroll px-3 py-4 space-y-5">
          {NAV_GROUPS.map(group => (
            <div key={group.label}>
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider px-2 mb-1.5">
                {group.label}
              </p>
              <div className="space-y-0.5">
                {group.items.map(item => {
                  const Icon   = item.icon
                  const active = pathname === item.href || pathname.startsWith(item.href + '/')
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={cn(
                        'flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[12.5px] font-medium transition-colors',
                        active
                          ? 'bg-gray-100 text-gray-900'
                          : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900',
                      )}
                    >
                      <Icon className={cn(
                        'w-3.5 h-3.5 flex-shrink-0',
                        active ? 'text-indigo-600' : 'text-gray-400',
                      )} />
                      <span>{item.label}</span>
                    </Link>
                  )
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className="px-5 py-3 border-t syn-border flex-shrink-0">
          <p className="text-[10px] text-gray-400">
            Synvelo v2.1
          </p>
        </div>
      </aside>

      {/* Main panel */}
      <main className="flex-1 overflow-y-auto syn-scroll">
        <div className="max-w-3xl mx-auto px-10 py-10">
          {children}
        </div>
      </main>
    </div>
  )
}
