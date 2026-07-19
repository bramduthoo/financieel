import { useMemo } from 'react'
import { sankeyLayout } from '../../lib/sankeyLayout'
import { formatMoney } from '../../lib/format'

// Proportional-ribbon Sankey for one recurring income → its wallets (budgeting-page-plan.md §5,
// DESIGN-SPEC §6: inline SVG only). Ribbon thickness ∝ euros; the salary node sits on the left, wallet
// nodes on the right with name + amount + % labels. Palette is tokenized and theme-aware — salary node
// and neutral ribbons use `ink`; the Unallocated flow uses coral `accent` (per §2). No chart library,
// no invented hues.
//
// Props: income (number, the income amount, drives the % labels), flows [{ wallet, amount }].
const VIEW_W    = 520
const NODE_W    = 12
const CHART_W   = 320                 // ribbon area width; target nodes land at CHART_W - NODE_W
const LABEL_X   = CHART_W + 8
const GAP       = 10
const ROW_MIN_H = 40

function ribbonPath(source, target) {
  const x1 = NODE_W
  const x2 = CHART_W - NODE_W
  const xc = (x1 + x2) / 2
  const sTop = source.y, sBot = source.y + source.height
  const tTop = target.y, tBot = target.y + target.height
  return [
    `M ${x1} ${sTop}`,
    `C ${xc} ${sTop}, ${xc} ${tTop}, ${x2} ${tTop}`,
    `L ${x2} ${tBot}`,
    `C ${xc} ${tBot}, ${xc} ${sBot}, ${x1} ${sBot}`,
    'Z',
  ].join(' ')
}

export default function SalarySankey({ income = 0, flows = [], className = '' }) {
  const items = useMemo(() => flows.filter(f => Number(f.amount) > 0), [flows])
  // Layout keys on wallet_id; keep a lookup so labels/colours can resolve the full wallet back.
  const walletById = useMemo(
    () => new Map(items.map((f, i) => [f.wallet?.id ?? `flow-${i}`, f.wallet])),
    [items],
  )
  const height = Math.max(ROW_MIN_H * Math.max(items.length, 1), 120)
  const layout = useMemo(
    () => sankeyLayout({
      flows: items.map((f, i) => ({ wallet_id: f.wallet?.id ?? `flow-${i}`, amount: f.amount })),
      width: CHART_W, height, nodeWidth: NODE_W, gap: GAP,
    }),
    [items, height],
  )

  if (items.length === 0) {
    return <p className={`text-sm text-ink-faint py-6 text-center ${className}`}>Nothing distributed yet.</p>
  }

  const total = Number(income) > 0 ? Number(income) : layout.total

  return (
    <svg viewBox={`0 0 ${VIEW_W} ${height}`} width="100%" className={className} role="img"
         aria-label="Income distribution flow">
      {/* Ribbons (drawn first so nodes sit on top) */}
      {layout.nodes.map(node => {
        const isUnalloc = walletById.get(node.wallet_id)?.is_system
        return (
          <path
            key={`r-${node.wallet_id}`}
            d={ribbonPath(node.source, node.target)}
            className={isUnalloc ? 'fill-accent-solid' : 'fill-ink'}
            opacity={isUnalloc ? 0.22 : 0.16}
          />
        )
      })}

      {/* Salary node */}
      <rect x={layout.salary.x} y={layout.salary.y} width={layout.salary.width} height={layout.salary.height}
            rx={3} className="fill-ink" />

      {/* Wallet nodes + labels */}
      {layout.nodes.map(node => {
        const w        = walletById.get(node.wallet_id)
        const isUnalloc = w?.is_system
        const cy   = node.target.y + node.target.height / 2
        const pct  = total > 0 ? Math.round((node.amount / total) * 100) : 0
        return (
          <g key={`n-${node.wallet_id}`}>
            <rect x={node.target.x} y={node.target.y} width={node.target.width} height={node.target.height}
                  rx={3} className={isUnalloc ? 'fill-accent-solid' : 'fill-ink'} />
            <text x={LABEL_X} y={cy - 5} fontSize={12} dominantBaseline="middle"
                  className="fill-ink" fontWeight="500">
              {w?.name ?? '—'}
            </text>
            <text x={LABEL_X} y={cy + 8} fontSize={10} dominantBaseline="middle" className="fill-ink-faint">
              {formatMoney(node.amount)} · {pct}%
            </text>
          </g>
        )
      })}
    </svg>
  )
}
