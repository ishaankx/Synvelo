'use client'
import { cn } from '@/lib/utils'

interface Props {
  title?:       string
  description?: string
  children:     React.ReactNode
  className?:   string
}

/**
 * A titled section block inside a settings page.
 * Title is rendered above a bordered card containing the children.
 */
export default function SettingsSection({ title, description, children, className }: Props) {
  return (
    <section className="mb-8 last:mb-0">
      {(title || description) && (
        <header className="mb-3">
          {title       && <h2 className="text-[14px] font-semibold syn-text-primary">{title}</h2>}
          {description && <p className="text-[12px] text-gray-500 mt-0.5 leading-relaxed">{description}</p>}
        </header>
      )}
      <div className={cn('bg-white border syn-border rounded-xl', className)}>
        {children}
      </div>
    </section>
  )
}
