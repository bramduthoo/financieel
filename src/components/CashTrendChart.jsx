import { formatMoney } from '../lib/format'

// SVG layout
const W = 720, H = 200
const MT = 15, MR = 15, MB = 30, ML = 60
const CW = W - ML - MR
const CH = H - MT - MB

function niceMax(val) {
  if (val <= 0) return 10
  const mag = Math.pow(10, Math.floor(Math.log10(val)))
  return Math.ceil(val / mag) * mag
}

function fmtY(val) {
  if (val >= 1000) return `€${(val / 1000).toFixed(val % 1000 === 0 ? 0 : 1)}k`
  return `€${Math.round(val)}`
}

export default function CashTrendChart({ data }) {
  const values = data.map(d => d.totalCash)
  const minVal = Math.min(0, ...values)
  const maxVal = niceMax(Math.max(...values, 0))
  const range  = maxVal - minVal || 1
  const ticks  = Array.from({ length: 5 }, (_, i) => minVal + (range / 4) * i)

  const stepX = data.length > 1 ? CW / (data.length - 1) : 0
  function px(i)   { return ML + i * stepX }
  function py(val) { return MT + CH - ((val - minVal) / range) * CH }

  const points  = data.map((d, i) => ({ x: px(i), y: py(d.totalCash) }))
  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')
  const areaPath = points.length > 0
    ? `${linePath} L ${points[points.length - 1].x} ${MT + CH} L ${points[0].x} ${MT + CH} Z`
    : ''

  return (
    <div className="bg-card border border-card-border rounded-[14px] p-6">
      <h3 className="text-[11px] font-medium text-ink-muted uppercase tracking-wider mb-4">Cash trend</h3>

      <svg viewBox={`0 0 ${W} ${H}`} width="100%">
        {ticks.map((tick, i) => (
          <g key={i}>
            <line
              x1={ML} y1={py(tick)} x2={ML + CW} y2={py(tick)}
              className={Math.abs(tick) < 0.01 ? 'stroke-ink-faint' : 'stroke-track'} strokeWidth={1}
            />
            <text x={ML - 8} y={py(tick) + 4} textAnchor="end" fontSize={10} className="fill-ink-faint">
              {fmtY(tick)}
            </text>
          </g>
        ))}

        {areaPath && <path d={areaPath} className="fill-ink" fillOpacity={0.08} />}
        {linePath && <path d={linePath} fill="none" className="stroke-ink" strokeWidth={2} />}

        {points.map((p, i) => (
          <g key={i}>
            <circle
              cx={p.x} cy={p.y}
              r={i === points.length - 1 ? 4 : 2.5}
              className={i === points.length - 1 ? 'fill-ink' : 'fill-ink-faint'}
            >
              <title>{data[i].label} · {formatMoney(data[i].totalCash)}</title>
            </circle>
            <text
              x={p.x} y={MT + CH + 18}
              textAnchor="middle" fontSize={10} className="fill-ink-faint"
            >
              {data[i].label}
            </text>
          </g>
        ))}

        <line x1={ML} y1={py(0)} x2={ML + CW} y2={py(0)} className="stroke-ink-faint" strokeWidth={1} />
      </svg>
    </div>
  )
}
