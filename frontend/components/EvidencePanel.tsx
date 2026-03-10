import { FileText, TrendingUp, TrendingDown } from 'lucide-react'

interface Evidence {
  excerpt: string
  source_type: string
  filename: string
  impact: number | null
  type: string
}

export default function EvidencePanel({ evidence }: { evidence: Evidence[] }) {
  if (!evidence || evidence.length === 0) return null

  return (
    <div className="space-y-3">
      {evidence.map((e, i) => {
        const positive = e.impact === null || e.impact >= 0
        return (
          <div key={i} className="flex gap-3">
            {/* Color bar */}
            <div className={`w-1 rounded-full flex-shrink-0 self-stretch min-h-[48px]
                            ${positive ? 'bg-green-500' : 'bg-red-500'}`} />
            <div className="flex-1 min-w-0">
              {/* Quote */}
              <p className="text-sm text-gray-200 italic leading-relaxed">
                "{e.excerpt}"
              </p>
              {/* Source */}
              <div className="flex items-center gap-2 mt-1.5">
                <FileText className="w-3 h-3 text-gray-600 flex-shrink-0" />
                <p className="text-xs text-gray-500">
                  {e.filename} · {e.source_type}
                </p>
                {e.impact !== null && (
                  <div className={`flex items-center gap-0.5 ml-auto
                                  ${positive ? 'text-green-400' : 'text-red-400'}`}>
                    {positive
                      ? <TrendingUp className="w-3 h-3" />
                      : <TrendingDown className="w-3 h-3" />}
                    <span className="text-xs font-medium">
                      {positive ? '+' : ''}{Math.round(e.impact * 100)}%
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}