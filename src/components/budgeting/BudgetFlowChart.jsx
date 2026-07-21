// Combined income → wallet flow diagram (budgeting-page-plan.md §12.4). ONE card, ONE inline SVG,
// every included income — so a wallet fed by two incomes shows two stacked ribbons landing on one
// node, which the old per-income SalarySankey could not express.
//
// DESIGN-SPEC §6: inline SVG only — a chart-library import is a design-check violation.
// All geometry comes from the pure computeBudgetFlowLayout(); nothing is measured here.
//
// Colour (DESIGN-SPEC §2): one colour per income, taken from the wallet identity-ramp BAR STOPS and
// assigned by income display order — no invented hues. Wallet nodes stay neutral so the eye reads
// sources, not destinations; Unallocated keeps coral, which §2 reserves for it.

import { useMemo, useState } from 'react'
import { computeBudgetFlowLayout } from '../../lib/budgetFlowLayout'
import { formatMoney } from '../../lib/format'

// DESIGN-SPEC §2 identity-ramp bar stops, cycled by income index.
const INCOME_COLORS = ['#378ADD', '#639922', '#D4537E', '#7F77DD', '#EF9F27']
const colorFor = i => INCOME_COLORS[i % INCOME_COLORS.length]

const LABEL_W   = 150
const MIN_H     = 320
const MAX_H     = 420
const ROW_H     = 46      // comfortable vertical room per wallet label
const LABEL_GAP = 30      // hard minimum before labels would collide
const LABEL_PAD = 8       // matches decollide()'s edge padding

export default function BudgetFlowChart({ incomes = [], allocations = [], wallets = [], className = '' }) {
  const [hovered, setHovered] = useState(null)

  const walletCount = useMemo(() => {
    const ids = new Set(allocations.filter(a => Number(a.amount) > 0).map(a => a.wallet_id))
    return ids.size
  }, [allocations])

  // Bounded height (§12.4): grows with the number of wallet LABELS, never with the income amount.
  // The MAX_H cap yields to the label stack — with enough wallets, clipping labels off the bottom of
  // the viewBox would be worse than a taller card.
  const labelFloor = walletCount * LABEL_GAP + LABEL_PAD * 2
  const height = Math.max(MIN_H, Math.min(MAX_H, walletCount * ROW_H), labelFloor)
  const width  = 640

  const layout = useMemo(
    () => computeBudgetFlowLayout({
      incomes, allocations, wallets, width, height,
      labelWidth: LABEL_W, labelMinGap: LABEL_GAP,
    }),
    [incomes, allocations, wallets, height],
  )

  if (layout.links.length === 0) {
    return (
      <p className={`text-sm text-ink-faint py-16 text-center ${className}`}>
        Nothing distributed yet.
      </p>
    )
  }

  const dimmed = hovered != null

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width="100%"
      className={className}
      role="img"
      aria-label="How each recurring income is distributed across your wallets"
    >
      {/* Ribbons first so the nodes sit on top of them */}
      {layout.links.map(link => {
        const active = hovered === link.id
        // Dark mode needs a touch more alpha to read against the dark card (§12.4). Kept as Tailwind
        // variants rather than an inline style so the theme switch is automatic.
        const opacity = active
          ? 'opacity-[0.55]'
          : dimmed
            ? 'opacity-[0.08]'
            : 'opacity-[0.22] dark:opacity-[0.30]'
        return (
          <path
            key={link.id}
            d={link.path}
            fill={colorFor(link.colorIndex)}
            className={`transition-opacity ${opacity}`}
            onMouseEnter={() => setHovered(link.id)}
            onMouseLeave={() => setHovered(null)}
          >
            <title>{`${link.incomeName} → ${link.walletName}: ${formatMoney(link.amount)}`}</title>
          </path>
        )
      })}

      {/* Income nodes — thin, coloured, one per included income */}
      {layout.incomeNodes.map(n => (
        <g key={`i-${n.id}`}>
          <rect x={n.x} y={n.y} width={n.width} height={n.height} rx={4} fill={colorFor(n.colorIndex)} />
          <text
            x={n.x + n.width + 8}
            y={n.y + n.height / 2}
            fontSize={12}
            fontWeight="500"
            dominantBaseline="middle"
            className="fill-ink"
          >
            {n.name}
          </text>
        </g>
      ))}

      {/* Wallet nodes — neutral, except Unallocated which keeps coral (§2) */}
      {layout.walletNodes.map(n => (
        <rect
          key={`w-${n.id}`}
          x={n.x} y={n.y} width={n.width} height={n.height} rx={4}
          className={n.isUnallocated ? 'fill-accent-solid' : 'fill-ink-soft'}
        />
      ))}

      {/* Leader lines for labels the de-collision pass had to move off their node */}
      {layout.labels.filter(l => l.leader).map(l => (
        <line
          key={`l-${l.wallet_id}`}
          x1={l.leader.x1} y1={l.leader.y1} x2={l.leader.x2} y2={l.leader.y2}
          strokeWidth={1}
          className="stroke-ink-faint"
        />
      ))}

      {/* Wallet labels: name, then amount + share beneath */}
      {layout.labels.map(l => (
        <g key={`t-${l.wallet_id}`}>
          <text x={l.x} y={l.y - 5} fontSize={13} dominantBaseline="middle" className="fill-ink">
            {l.name}
          </text>
          <text x={l.x} y={l.y + 9} fontSize={11} dominantBaseline="middle" className="fill-ink-muted">
            {formatMoney(l.amount)} · {l.pct}%
          </text>
        </g>
      ))}
    </svg>
  )
}
