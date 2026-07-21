// Compact wallet tile for the Budgeting rail (budgeting-page-plan.md §12.3).
//
// This is a TILE, not a content card: DESIGN-SPEC §8 Rule 1's hero-number + MetricBar + footer
// requirement deliberately does NOT apply (the exception is recorded in the spec). One prominent
// number, no bar.
//
// Must-fund wallets (fixed / accumulating / capped) show "% of budget funded". Free-pool wallets
// (Unallocated, investment) have no honest denominator, so they show the amount and a `free pool`
// label and never a percentage — never a fabricated ratio.

import { WalletIcon } from '../../lib/walletIcons'
import { formatMoney } from '../../lib/format'

export default function WalletTile({ wallet, funded = 0, budget = 0, freePool = false, onClick }) {
  const pct = budget > 0 ? (funded / budget) * 100 : null

  // A percentage is only honest with a real budget behind it. Free-pool wallets never have one, and
  // a must-fund wallet with no budget set doesn't either — showing "0%" next to real euros would be
  // exactly the fabricated ratio DESIGN-SPEC §8 Rule 1 forbids. Both fall back to the amount.
  const showPct = !freePool && pct != null

  // Nothing allocated reads as absent (muted); at/over budget reads as done (positive); anything
  // in between is ordinary ink — the number itself carries the shortfall.
  const tone = funded <= 0.005
    ? 'text-ink-muted'
    : showPct && pct >= 99.995
      ? 'text-positive'
      : 'text-ink'

  return (
    <button
      type="button"
      onClick={onClick}
      className="text-left p-3 rounded-[11px] border border-inner-border bg-card hover:border-card-border hover:bg-track/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-ink/30 transition-colors"
    >
      <div className="flex items-center gap-1.5 min-w-0">
        <WalletIcon wallet={wallet} size={13} className="text-ink-muted shrink-0" />
        <span className="text-[13px] text-ink truncate">{wallet.name}</span>
      </div>

      <p className={`mt-1.5 text-lg font-medium tracking-tight ${tone}`}>
        {showPct ? `${Math.round(pct)}%` : formatMoney(funded)}
      </p>

      <p className="text-[11px] text-ink-muted truncate">
        {showPct ? formatMoney(funded) : freePool ? 'free pool' : 'no budget'}
      </p>
    </button>
  )
}
