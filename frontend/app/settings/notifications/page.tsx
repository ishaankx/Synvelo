'use client'
import { useState, useEffect } from 'react'
import { AlertTriangle, TrendingUp, ArrowRightLeft, Loader2, CheckCircle2, XCircle, MinusCircle } from 'lucide-react'
import { useUserPrefs } from '@/lib/userPrefs'
import { cn } from '@/lib/utils'
import SettingsHeader from '@/components/SettingsHeader'
import SettingsSection from '@/components/SettingsSection'

type PermState = 'default' | 'granted' | 'denied' | 'unsupported'

export default function NotificationsSettingsPage() {
  const { prefs, update, hydrated } = useUserPrefs()
  const [perm, setPerm] = useState<PermState>('default')
  const [requesting, setRequesting] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      setPerm('unsupported')
      return
    }
    setPerm(Notification.permission as PermState)
  }, [])

  const requestPermission = async () => {
    if (!('Notification' in window)) return
    setRequesting(true)
    try {
      const r = await Notification.requestPermission()
      setPerm(r as PermState)
    } finally {
      setRequesting(false)
    }
  }

  if (!hydrated) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="w-5 h-5 syn-text-muted animate-spin" /></div>
  }

  const permUI = {
    granted:     { Icon: CheckCircle2, color: 'text-emerald-600 bg-emerald-50 border-emerald-200', label: 'Allowed',     desc: 'Synvelo can send browser notifications.' },
    denied:      { Icon: XCircle,      color: 'text-red-600 bg-red-50 border-red-200',             label: 'Blocked',     desc: 'Notifications are blocked. Update browser permissions to enable them.' },
    default:     { Icon: MinusCircle,  color: 'text-gray-500 bg-gray-50 border-gray-200',          label: 'Not requested', desc: 'Synvelo has not requested permission yet.' },
    unsupported: { Icon: XCircle,      color: 'text-gray-500 bg-gray-50 border-gray-200',          label: 'Unsupported', desc: 'This browser does not support notifications.' },
  }[perm]

  return (
    <>
      <SettingsHeader title="Notifications" description="Browser alerts for important deal events" />

      <SettingsSection title="Browser permission">
        <div className="px-5 py-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3 flex-1 min-w-0">
              <permUI.Icon className={cn('w-4 h-4 flex-shrink-0 mt-0.5', permUI.color.split(' ')[0])} />
              <div>
                <p className="text-[13px] font-medium text-gray-900">{permUI.label}</p>
                <p className="text-[12px] text-gray-500 mt-0.5 leading-relaxed">{permUI.desc}</p>
              </div>
            </div>
            {perm === 'default' && (
              <button onClick={requestPermission} disabled={requesting}
                className="px-3 py-1.5 text-[12px] font-medium rounded-md bg-gray-900 text-white hover:bg-gray-800 disabled:opacity-50 transition-colors flex-shrink-0">
                {requesting ? 'Requesting…' : 'Enable'}
              </button>
            )}
          </div>
        </div>
      </SettingsSection>

      <SettingsSection
        title="Alert preferences"
        description="Choose which deal events trigger a browser notification"
      >
        <div className="divide-y divide-gray-100">
          <Toggle
            icon={AlertTriangle}
            iconColor="text-red-500"
            label="At-risk deals"
            description="When a deal's win probability drops below 40% or stalls in a stage."
            checked={prefs.notifyAtRisk}
            disabled={perm !== 'granted'}
            onChange={v => update('notifyAtRisk', v)}
          />
          <Toggle
            icon={TrendingUp}
            iconColor="text-emerald-500"
            label="Score changes"
            description="When a deal's win probability changes by more than 10 points."
            checked={prefs.notifyScoreChange}
            disabled={perm !== 'granted'}
            onChange={v => update('notifyScoreChange', v)}
          />
          <Toggle
            icon={ArrowRightLeft}
            iconColor="text-indigo-500"
            label="Stage transitions"
            description="When any deal moves to a new pipeline stage."
            checked={prefs.notifyStageChange}
            disabled={perm !== 'granted'}
            onChange={v => update('notifyStageChange', v)}
          />
        </div>
      </SettingsSection>

      <p className="text-[11px] syn-text-muted">
        Notification triggers run client-side based on data refreshes. Email and Slack delivery are not yet supported.
      </p>
    </>
  )
}

function Toggle({ icon: Icon, iconColor, label, description, checked, disabled, onChange }: {
  icon: React.ElementType, iconColor: string,
  label: string, description: string,
  checked: boolean, disabled?: boolean,
  onChange: (v: boolean) => void,
}) {
  return (
    <div className={cn('flex items-start gap-3 px-5 py-4', disabled && 'opacity-50')}>
      <Icon className={`w-4 h-4 ${iconColor} flex-shrink-0 mt-0.5`} />
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-medium text-gray-900">{label}</p>
        <p className="text-[12px] text-gray-500 leading-relaxed mt-0.5">{description}</p>
      </div>
      <button
        onClick={() => !disabled && onChange(!checked)}
        disabled={disabled}
        className={cn(
          'relative w-9 h-5 rounded-full transition-colors flex-shrink-0 mt-1',
          checked ? 'bg-indigo-600' : 'bg-gray-300',
          disabled && 'cursor-not-allowed',
        )}
      >
        <span className={cn(
          'absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform shadow-sm',
          checked && 'translate-x-4',
        )} />
      </button>
    </div>
  )
}
