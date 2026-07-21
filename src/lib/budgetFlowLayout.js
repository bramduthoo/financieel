// Pure geometry for the combined budget flow diagram (budgeting-page-plan.md §12.4). Given every
// included income, the euro allocations between incomes and wallets, and an SVG box, it returns the
// node rects, ribbon paths and de-collided label positions. The React component only renders what
// this returns — no geometry in JSX. No drawing, no theming, no formatting here.
//
// Unlike the single-income sankeyLayout it replaces, this lays out BOTH columns: a wallet fed by two
// incomes gets two ribbons stacked on one node.

const round2 = n => Number(Number(n).toFixed(2))

// Resolve proportional thicknesses under a minimum. Links below `minThickness` are pinned to it and
// removed from the proportional pool, then the rest re-scale against what's left; repeat until
// stable. Without this, a €5 flow next to a €2000 one renders as a sub-pixel invisible sliver.
// Degenerate case (every link pinned / no room) falls back to equal division — never negatives.
function resolveThicknesses(amounts, usable, minThickness) {
  const n = amounts.length
  if (n === 0) return []
  if (usable <= 0) return amounts.map(() => 0)
  // Not enough room to give everyone the minimum → equal slices, ignore proportionality.
  if (n * minThickness >= usable) return amounts.map(() => usable / n)

  const pinned = new Array(n).fill(false)
  for (;;) {
    const freeIdx   = amounts.map((_, i) => i).filter(i => !pinned[i])
    const freeSum   = freeIdx.reduce((s, i) => s + amounts[i], 0)
    const freeSpace = usable - (n - freeIdx.length) * minThickness
    // Everything ended up at the floor: give them all exactly the minimum.
    if (freeIdx.length === 0 || freeSum <= 0) return amounts.map(() => minThickness)

    const scale = freeSpace / freeSum
    const next  = freeIdx.filter(i => amounts[i] * scale < minThickness)
    if (next.length === 0) {
      const out = new Array(n).fill(minThickness)
      for (const i of freeIdx) out[i] = amounts[i] * scale
      return out
    }
    for (const i of next) pinned[i] = true
  }
}

// Push labels apart so they never overlap, then pull the stack back inside the box. Deterministic:
// same input always yields the same output (forward pass, then backward pass, then clamp).
// `pad` keeps the stack clear of the box edges — labels draw a name ABOVE their y and an amount
// below it, so a label sitting exactly at y=0 would have its name row clipped by the viewBox.
function decollide(desired, minGap, height, pad = 8) {
  const n = desired.length
  if (n === 0) return []
  const y = desired.slice()
  // Forward: nothing may sit closer than minGap to the label above it.
  for (let i = 1; i < n; i++) if (y[i] - y[i - 1] < minGap) y[i] = y[i - 1] + minGap
  // Backward: pull the stack up if it overran the bottom edge.
  if (y[n - 1] > height - pad) {
    y[n - 1] = height - pad
    for (let i = n - 2; i >= 0; i--) if (y[i + 1] - y[i] < minGap) y[i] = y[i + 1] - minGap
  }
  // If it now overruns the top, the stack is taller than the box can hold: sit it flush at `pad` and
  // overflow the bottom evenly rather than bunching every label on the first line. The caller sizes
  // the box from labelMinGap precisely so this stays unreachable in practice.
  if (y[0] < pad) {
    const shift = pad - y[0]
    for (let i = 0; i < n; i++) y[i] += shift
  }
  return y
}

function ribbonPath(x1, x2, sTop, sBot, tTop, tBot) {
  const xc = (x1 + x2) / 2
  return [
    `M ${x1} ${sTop}`,
    `C ${xc} ${sTop}, ${xc} ${tTop}, ${x2} ${tTop}`,
    `L ${x2} ${tBot}`,
    `C ${xc} ${tBot}, ${xc} ${sBot}, ${x1} ${sBot}`,
    'Z',
  ].join(' ')
}

// incomes:     [{ id, name, amount }] in display order (drives colour index)
// allocations: [{ income_id, wallet_id, amount }] — euros; zero/negative are dropped
// wallets:     [{ id, name, is_system, type }]
export function computeBudgetFlowLayout({
  incomes = [],
  allocations = [],
  wallets = [],
  width = 640,
  height = 360,
  nodeWidth = 8,
  minThickness = 3,
  nodeGap = 10,
  labelMinGap = 30,
  labelWidth = 150,
} = {}) {
  const walletById = new Map(wallets.map(w => [w.id, w]))
  const incomeById = new Map(incomes.map(i => [i.id, i]))

  // Fold duplicate (income, wallet) pairs into one ribbon. A single income CAN hold two rules for the
  // same wallet — DistributionPopup lets Unallocated be an explicit target while the remainder sweep
  // is also on — and without this they'd share a band key, draw on top of each other, double-count
  // the node height and collide on the React key.
  const merged = new Map()
  for (const a of allocations) {
    const amount = Number(a.amount)
    if (!(amount > 0) || !incomeById.has(a.income_id) || !walletById.has(a.wallet_id)) continue
    const key = `${a.income_id}|${a.wallet_id}`
    const prev = merged.get(key)
    if (prev) prev.amount += amount
    else merged.set(key, { income_id: a.income_id, wallet_id: a.wallet_id, amount })
  }
  const links = [...merged.values()]

  const empty = {
    width, height, incomeNodes: [], walletNodes: [], links: [], labels: [], total: 0,
  }
  if (links.length === 0) return empty

  // Column membership, in the caller's display order (deterministic — never Set/Map iteration order
  // of the allocations, which would reshuffle when the DB returns rows differently).
  const incomeOrder = incomes.map(i => i.id).filter(id => links.some(l => l.income_id === id))
  const walletOrder = wallets.map(w => w.id).filter(id => links.some(l => l.wallet_id === id))
  const incomeRank  = new Map(incomeOrder.map((id, i) => [id, i]))
  const walletRank  = new Map(walletOrder.map((id, i) => [id, i]))

  const total = round2(links.reduce((s, l) => s + l.amount, 0))

  // One shared scale so both ends of a ribbon are the same thickness; the column with fewer nodes
  // keeps the slack and gets centred. Sorting is by (column rank, other-column rank) so ribbons
  // never cross more than they must.
  const usableIncome = Math.max(0, height - nodeGap * Math.max(0, incomeOrder.length - 1))
  const usableWallet = Math.max(0, height - nodeGap * Math.max(0, walletOrder.length - 1))
  const usable       = Math.min(usableIncome, usableWallet)

  const bySource = links.slice().sort((a, b) =>
    (incomeRank.get(a.income_id) - incomeRank.get(b.income_id)) ||
    (walletRank.get(a.wallet_id) - walletRank.get(b.wallet_id)))

  const thick = resolveThicknesses(bySource.map(l => l.amount), usable, minThickness)
  const thicknessById = new Map(bySource.map((l, i) => [`${l.income_id}|${l.wallet_id}`, thick[i]]))
  const thicknessOf = l => thicknessById.get(`${l.income_id}|${l.wallet_id}`) ?? 0

  // ── Left column: stack each income's outgoing ribbons in wallet order ──────────────────────
  const incomeSpan = incomeOrder.map(id => {
    const own = bySource.filter(l => l.income_id === id)
    return { id, height: own.reduce((s, l) => s + thicknessOf(l), 0), links: own }
  })
  const incomeStackH = incomeSpan.reduce((s, g) => s + g.height, 0) + nodeGap * Math.max(0, incomeOrder.length - 1)
  let iy = Math.max(0, (height - incomeStackH) / 2)
  const incomeNodes = []
  const sourceBand  = new Map()
  for (const [idx, g] of incomeSpan.entries()) {
    const inc = incomeById.get(g.id)
    incomeNodes.push({
      id: g.id,
      name: inc?.name ?? '',
      amount: round2(g.links.reduce((s, l) => s + l.amount, 0)),
      colorIndex: idx,
      x: 0, y: iy, width: nodeWidth, height: g.height,
    })
    let cursor = iy
    for (const l of g.links) {
      sourceBand.set(`${l.income_id}|${l.wallet_id}`, { top: cursor, bottom: cursor + thicknessOf(l) })
      cursor += thicknessOf(l)
    }
    iy += g.height + nodeGap
  }

  // ── Right column: stack each wallet's incoming ribbons in income order ─────────────────────
  const byTarget = links.slice().sort((a, b) =>
    (walletRank.get(a.wallet_id) - walletRank.get(b.wallet_id)) ||
    (incomeRank.get(a.income_id) - incomeRank.get(b.income_id)))

  const walletSpan = walletOrder.map(id => {
    const own = byTarget.filter(l => l.wallet_id === id)
    return { id, height: own.reduce((s, l) => s + thicknessOf(l), 0), links: own }
  })
  const walletStackH = walletSpan.reduce((s, g) => s + g.height, 0) + nodeGap * Math.max(0, walletOrder.length - 1)
  const nodeX = Math.max(0, width - labelWidth - nodeWidth)
  let wy = Math.max(0, (height - walletStackH) / 2)
  const walletNodes = []
  const targetBand  = new Map()
  for (const g of walletSpan) {
    const w = walletById.get(g.id)
    walletNodes.push({
      id: g.id,
      name: w?.name ?? '',
      amount: round2(g.links.reduce((s, l) => s + l.amount, 0)),
      isUnallocated: !!w?.is_system,
      x: nodeX, y: wy, width: nodeWidth, height: g.height,
    })
    let cursor = wy
    for (const l of g.links) {
      targetBand.set(`${l.income_id}|${l.wallet_id}`, { top: cursor, bottom: cursor + thicknessOf(l) })
      cursor += thicknessOf(l)
    }
    wy += g.height + nodeGap
  }

  // ── Ribbons ────────────────────────────────────────────────────────────────────────────────
  const outLinks = bySource.map(l => {
    const key = `${l.income_id}|${l.wallet_id}`
    const s = sourceBand.get(key)
    const t = targetBand.get(key)
    return {
      id: key,
      income_id: l.income_id,
      wallet_id: l.wallet_id,
      incomeName: incomeById.get(l.income_id)?.name ?? '',
      walletName: walletById.get(l.wallet_id)?.name ?? '',
      amount: l.amount,
      thickness: thicknessOf(l),
      colorIndex: incomeRank.get(l.income_id),
      path: ribbonPath(nodeWidth, nodeX, s.top, s.bottom, t.top, t.bottom),
    }
  })

  // ── Labels, de-collided against each other ─────────────────────────────────────────────────
  const anchors = walletNodes.map(n => n.y + n.height / 2)
  const placed  = decollide(anchors, labelMinGap, height)
  const labels  = walletNodes.map((n, i) => {
    const y = placed[i]
    const displaced = Math.abs(y - anchors[i]) > 1.5
    return {
      wallet_id: n.id,
      name: n.name,
      amount: n.amount,
      pct: total > 0 ? Math.round((n.amount / total) * 100) : 0,
      isUnallocated: n.isUnallocated,
      x: nodeX + nodeWidth + 10,
      y,
      anchorY: anchors[i],
      displaced,
      leader: displaced
        ? { x1: nodeX + nodeWidth, y1: anchors[i], x2: nodeX + nodeWidth + 7, y2: y }
        : null,
    }
  })

  return { width, height, total, incomeNodes, walletNodes, links: outLinks, labels }
}
