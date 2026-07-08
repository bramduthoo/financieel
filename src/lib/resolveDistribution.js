// Pure distribution-resolution logic, lifted verbatim from DistributionPopup.jsx so it can be unit
// tested and reused. This is the single source of truth for turning a set of per-wallet
// {mode, value} rows (euro or percent) into resolved euro amounts, plus the "send remainder to
// Unallocated" sweep. It computes money only — no React, no DB, no display formatting.
//
// Distribution rule (PROJECT-CONTEXT §7): percentages are always of the TOTAL input amount, never
// of the running remainder.

const round2 = n => Number(Number(n).toFixed(2))

// The per-item primitive: resolve one row's {mode, value} against a base amount, UNROUNDED.
// Shared with unallocatedPlans.firePlan (whose per-item math is identical) — each caller applies
// its own rounding, so this stays unrounded. euro = literal euros; percent = that % of the base.
export function resolveRowExact(mode, value, base) {
  const v = Number(value || 0)
  if (!v || v <= 0) return 0
  return mode === 'euro' ? v : (v / 100) * base
}

// Resolve a full distribution. `rows` is an ORDERED array of { wallet_id, mode, value } — order is
// preserved into `explicit`/`allRows` because callers use array position as the rule `priority`.
// `total` is the amount being distributed. Options carry the remainder-sweep intent.
//
// Returns everything the popup needs to both drive its live progress/gating and build the
// onConfirm payload:
//   explicit     — resolved rows the user actually assigned (amount > 0), with mode/value/amount
//   distributed  — raw sum of explicit amounts (matches the popup's resolvedTotal; not re-rounded)
//   remainder    — round2(total - distributed)
//   complete     — |distributed - total| < 0.005
//   notOver      — distributed <= total + 0.005
//   remainderRow — materialised Unallocated sweep entry, or null
//   allRows      — explicit (+ remainderRow when present)
//   distributions— [{ wallet_id, amount }] over allRows (euros only; includes the sweep)
export function resolveDistribution(rows, total, { sendRemainder = false, unallocatedWalletId = null } = {}) {
  const explicit = []
  for (const r of rows) {
    const amount = round2(resolveRowExact(r?.mode, r?.value, total))
    if (amount <= 0) continue
    explicit.push({ wallet_id: r.wallet_id, mode: r.mode, value: round2(r.value), amount })
  }

  const distributed = explicit.reduce((s, r) => s + r.amount, 0)
  const remainder   = round2(total - distributed)
  const complete    = Math.abs(distributed - total) < 0.005
  const notOver     = distributed <= total + 0.005

  const remainderRow = (sendRemainder && remainder > 0.005 && unallocatedWalletId)
    ? { wallet_id: unallocatedWalletId, mode: 'euro', value: remainder, amount: remainder }
    : null
  const allRows = remainderRow ? [...explicit, remainderRow] : explicit

  const distributions = allRows.map(({ wallet_id, amount }) => ({ wallet_id, amount }))

  return { explicit, distributed, remainder, complete, notOver, remainderRow, allRows, distributions }
}
