'use client'
import { Loader2, Sparkles, MessageSquare } from 'lucide-react'
import { useUserPrefs } from '@/lib/userPrefs'
import { cn } from '@/lib/utils'
import SettingsHeader from '@/components/SettingsHeader'
import SettingsSection from '@/components/SettingsSection'

export default function AppearanceSettingsPage() {
  const { prefs, update, hydrated } = useUserPrefs()

  if (!hydrated) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="w-5 h-5 syn-text-muted animate-spin" /></div>
  }

  return (
    <>
      <SettingsHeader title="Appearance" description="Visual preferences for your workspace" />

      <SettingsSection
        title="Theme"
        description="Synvelo currently uses a single light enterprise theme. Dark mode is on the roadmap."
      >
        <div className="grid grid-cols-3 gap-px bg-gray-100">
          <ThemeChip name="Light" selected disabled={false} />
          <ThemeChip name="Dark"  selected={false} disabled />
          <ThemeChip name="Auto"  selected={false} disabled />
        </div>
      </SettingsSection>

      <SettingsSection
        title="Display density"
        description="Controls spacing in lists, tables, and cards"
      >
        <div className="grid grid-cols-2 gap-px bg-gray-100">
          <DensityChip
            label="Comfortable"
            description="Default spacing, easier scanning"
            selected={prefs.density === 'comfortable'}
            onClick={() => update('density', 'comfortable')}
          />
          <DensityChip
            label="Compact"
            description="Tighter spacing, more on screen"
            selected={prefs.density === 'compact'}
            onClick={() => update('density', 'compact')}
          />
        </div>
      </SettingsSection>

      <SettingsSection title="Interface elements">
        <div className="divide-y divide-gray-100">
          <Toggle
            icon={Sparkles}
            iconColor="text-violet-500"
            label="Show welcome banner"
            description="Display the contextual welcome message at the top of the deals list."
            checked={prefs.showWelcomeBanner}
            onChange={v => update('showWelcomeBanner', v)}
          />
          <Toggle
            icon={MessageSquare}
            iconColor="text-indigo-500"
            label="ARIA suggested questions"
            description="Show 3 context-aware question suggestions in the Ask AI panel."
            checked={prefs.autoSuggestQuestions}
            onChange={v => update('autoSuggestQuestions', v)}
          />
        </div>
      </SettingsSection>
    </>
  )
}

function ThemeChip({ name, selected, disabled }: { name: string, selected: boolean, disabled: boolean }) {
  return (
    <div className={cn(
      'px-4 py-4 text-center bg-white',
      selected      && 'bg-indigo-50/40',
      disabled      && 'cursor-not-allowed',
    )}>
      <p className={cn(
        'text-[13px] font-semibold',
        selected  ? 'text-indigo-700' :
        disabled  ? 'text-gray-400'   : 'text-gray-800'
      )}>{name}</p>
      {disabled && <p className="text-[10px] font-normal text-gray-400 mt-0.5">Coming soon</p>}
      {selected && !disabled && <div className="w-1.5 h-1.5 rounded-full bg-indigo-600 mx-auto mt-2" />}
    </div>
  )
}

function DensityChip({ label, description, selected, onClick }: {
  label: string, description: string, selected: boolean, onClick: () => void
}) {
  return (
    <button onClick={onClick}
      className={cn(
        'px-5 py-4 text-left bg-white transition-colors',
        selected ? 'bg-indigo-50/40' : 'hover:bg-gray-50',
      )}
    >
      <p className={cn('text-[13px] font-semibold', selected ? 'text-indigo-700' : 'text-gray-900')}>{label}</p>
      <p className="text-[11.5px] text-gray-500 mt-0.5">{description}</p>
    </button>
  )
}

function Toggle({ icon: Icon, iconColor, label, description, checked, onChange }: {
  icon: React.ElementType, iconColor: string,
  label: string, description: string,
  checked: boolean,
  onChange: (v: boolean) => void,
}) {
  return (
    <div className="flex items-start gap-3 px-5 py-4">
      <Icon className={`w-4 h-4 ${iconColor} flex-shrink-0 mt-0.5`} />
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-medium text-gray-900">{label}</p>
        <p className="text-[12px] text-gray-500 leading-relaxed mt-0.5">{description}</p>
      </div>
      <button
        onClick={() => onChange(!checked)}
        className={cn(
          'relative w-9 h-5 rounded-full transition-colors flex-shrink-0 mt-1',
          checked ? 'bg-indigo-600' : 'bg-gray-300',
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
