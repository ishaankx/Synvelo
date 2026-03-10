'use client'

interface ScoreGaugeProps {
  probability: number  // 0 to 1
  low: number
  high: number
}

export default function ScoreGauge({ probability, low, high }: ScoreGaugeProps) {
  const pct = Math.round(probability * 100)
  const lowPct = Math.round(low * 100)
  const highPct = Math.round(high * 100)

  const color = pct >= 70 ? '#3fb950' : pct >= 40 ? '#d29922' : '#f85149'
  const trackColor = '#21262d'

  // SVG arc params
  const r = 54
  const cx = 70
  const cy = 70
  const startAngle = -210
  const endAngle = 30
  const totalAngle = endAngle - startAngle

  const polarToCartesian = (angle: number) => {
    const rad = (angle * Math.PI) / 180
    return {
      x: cx + r * Math.cos(rad),
      y: cy + r * Math.sin(rad),
    }
  }

  const describeArc = (start: number, end: number) => {
    const s = polarToCartesian(start)
    const e = polarToCartesian(end)
    const large = end - start > 180 ? 1 : 0
    return `M ${s.x} ${s.y} A ${r} ${r} 0 ${large} 1 ${e.x} ${e.y}`
  }

  const fillEnd = startAngle + (totalAngle * probability)

  return (
    <div className="flex flex-col items-center">
      <svg width="140" height="100" viewBox="0 0 140 100">
        {/* Track */}
        <path
          d={describeArc(startAngle, endAngle)}
          fill="none"
          stroke={trackColor}
          strokeWidth="10"
          strokeLinecap="round"
        />
        {/* Fill */}
        <path
          d={describeArc(startAngle, fillEnd)}
          fill="none"
          stroke={color}
          strokeWidth="10"
          strokeLinecap="round"
        />
        {/* Center text */}
        <text x={cx} y={cy - 4} textAnchor="middle"
          fill={color} fontSize="22" fontWeight="900">
          {pct}%
        </text>
        <text x={cx} y={cy + 14} textAnchor="middle"
          fill="#8b949e" fontSize="9">
          WIN PROBABILITY
        </text>
      </svg>
      <p className="text-xs text-gray-600 mt-1">
        CI: {lowPct}% – {highPct}%
      </p>
    </div>
  )
}