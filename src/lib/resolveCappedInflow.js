// Pure money math for the automated capped-wallet mechanic (budgeting-page-plan.md §4.2).
//
// A capped wallet fills up to its ceiling (`max` = cap_max) at full rate; the part of the inflow
// that would push the balance above the ceiling is reduced to `rate` (0..1, the fraction the
// wallet keeps). Whatever the wallet does not keep is the overflow, routed elsewhere by the caller.
//
//   room     = max(0, max − balance)
//   full     = min(amount, room)          // fills up to the ceiling at 100%
//   over     = amount − full              // the part above the ceiling
//   received = full + over * rate         // what the capped wallet keeps
//   overflow = amount − received          // what flows to the overflow wallet
//
// `overflow` is derived from the rounded `received` so `received + overflow === amount` exactly
// (conservation nets within 0.005).
export function resolveCappedInflow({ balance, amount, max, rate }) {
  const b = Number(balance)
  const B = Number(amount)
  const M = Number(max)
  const r = Number(rate)

  const room     = Math.max(0, M - b)
  const full     = Math.min(B, room)
  const over     = B - full
  const received = Number((full + over * r).toFixed(2))
  const overflow = Number((B - received).toFixed(2))

  return { received, overflow }
}
