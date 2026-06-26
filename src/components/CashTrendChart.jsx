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
    <div className="bg-white border border-stone-200 rounded-2xl p-5">
      <h3 className="text-[11px] font-medium text-gray-400 uppercase tracking-wider mb-4">Cash trend</h3>

      <svg viewBox={`0 0 ${W} ${H}`} width="100%">
        {ticks.map((tick, i) => (
          <g key={i}>
            <line
              x1={ML} y1={py(tick)} x2={ML + CW} y2={py(tick)}
              stroke={Math.abs(tick) < 0.01 ? '#e7e5e4' : '#f5f5f4'} strokeWidth={1}
            />
            <text x={ML - 8} y={py(tick) + 4} textAnchor="end" fontSize={10} fill="#a8a29e">
              {fmtY(tick)}
            </text>
          </g>
        ))}

        {areaPath && <path d={areaPath} fill="#444441" fillOpacity={0.08} />}
        {linePath && <path d={linePath} fill="none" stroke="#444441" strokeWidth={2} />}

        {points.map((p, i) => (
          <g key={i}>
            <circle
              cx={p.x} cy={p.y}
              r={i === points.length - 1 ? 4 : 2.5}
              fill={i === points.length - 1 ? '#444441' : '#a8a29e'}
            >
              <title>{data[i].label} · €{data[i].totalCash.toFixed(2)}</title>
            </circle>
            <text
              x={p.x} y={MT + CH + 18}
              textAnchor="middle" fontSize={10} fill="#a8a29e"
            >
              {data[i].label}
            </text>
          </g>
        ))}

        <line x1={ML} y1={py(0)} x2={ML + CW} y2={py(0)} stroke="#e7e5e4" strokeWidth={1} />
      </svg>
    </div>
  )
}
