import Link from 'next/link'
import { AlertCircle, TrendingUp, Clock } from 'lucide-react'

interface DealCardProps {
  id: string
  name: string
  company: string
  stage: string
  value: number
  win_probability: number | null
  risk_flags: string[]
  time_to_close_days: number | null
}

export default function DealCard({
  id, name, company, stage, value, win_probability, risk_flags, time_to_close_days
}: DealCardProps) {
  const prob = win_probability !== null ? Math.round(win_probability * 100) : null
  const probColor = prob === null ? 'text-gray-500'
    : prob >= 70 ? 'text-green-400'
    : prob >= 40 ? 'text-yellow-400'
    : 'text-red-400'

  const stageColors: Record<string, string> = {
    'Qualification': 'bg-blue-900/40 text-blue-400',
    'Proposal': 'bg-purple-900/40 text-purple-400',
    'Negotiation': 'bg-yellow-900/40 text-yellow-400',
    'Closed Won': 'bg-green-900/40 text-green-400',
    'Closed Lost': 'bg-red-900/40 text-red-400',
  }

  return (
    <Link href={`/deals/${id}`}
      className="block bg-[#161b22] border border-[#30363d] rounded-xl p-5
                 hover:border-purple-500/50 hover:bg-[#1c2230] transition-all group">
      {/* Header */}
      <div className="flex justify-between items-start mb-4">
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-white group-hover:text-purple-300
                         transition-colors truncate">{name}</h3>
          <p className="text-gray-500 text-sm mt-0.5">{company}</p>
        </div>
        <span className={`text-xs px-2 py-1 rounded-full ml-2 flex-shrink-0
                         ${stageColors[stage] || 'bg-gray-800 text-gray-400'}`}>
          {stage}
        </span>
      </div>

      {/* Score + Value */}
      <div className="flex items-end justify-between mb-3">
        <div>
          <p className="text-xs text-gray-600 mb-1">Win Probability</p>
          <p className={`text-3xl font-black ${probColor}`}>
            {prob !== null ? `${prob}%` : '—'}
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs text-gray-600 mb-1">Deal Value</p>
          <p className="text-lg font-semibold text-gray-300">
            ${value.toLocaleString()}
          </p>
        </div>
      </div>

      {/* Progress bar */}
      {prob !== null && (
        <div className="w-full bg-[#21262d] rounded-full h-1.5 mb-3">
          <div
            className={`h-1.5 rounded-full transition-all ${
              prob >= 70 ? 'bg-green-500' : prob >= 40 ? 'bg-yellow-500' : 'bg-red-500'
            }`}
            style={{ width: `${prob}%` }}
          />
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between">
        {risk_flags?.length > 0 ? (
          <div className="flex items-center gap-1.5">
            <AlertCircle className="w-3 h-3 text-yellow-500 flex-shrink-0" />
            <p className="text-xs text-yellow-600 truncate">{risk_flags[0]}</p>
          </div>
        ) : (
          <div className="flex items-center gap-1.5">
            <TrendingUp className="w-3 h-3 text-green-500" />
            <p className="text-xs text-green-600">No risk flags</p>
          </div>
        )}
        {time_to_close_days && (
          <div className="flex items-center gap-1 text-gray-600">
            <Clock className="w-3 h-3" />
            <p className="text-xs">{time_to_close_days}d</p>
          </div>
        )}
      </div>
    </Link>
  )
}