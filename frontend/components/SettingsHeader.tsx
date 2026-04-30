'use client'
/**
 * Page-level title block for a settings sub-page.
 * The left rail (in app/settings/layout.tsx) provides global nav,
 * so each page just renders this title + its content.
 */
interface Props {
  title:       string
  description: string
}

export default function SettingsHeader({ title, description }: Props) {
  return (
    <div className="mb-8 pb-6 border-b syn-border">
      <h1 className="text-[22px] font-semibold syn-text-primary tracking-tight">{title}</h1>
      <p className="text-[13px] text-gray-500 mt-1">{description}</p>
    </div>
  )
}
