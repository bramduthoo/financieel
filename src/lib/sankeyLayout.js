// Pure proportional geometry for the salary → wallets Sankey (budgeting-page-plan.md §5). Given the
// per-wallet flow amounts and an SVG box, it returns the salary node rect, per-wallet target node
// rects, and the source/target bands each ribbon connects — heights strictly proportional to euros.
// The React component draws the Béziers from these coordinates; no drawing or theming here.

const round2 = n => Number(Number(n).toFixed(2))

// flows: ordered [{ wallet_id, amount, ... }]. Ribbons stack flush on the salary (source) side and
// are separated by `gap` px on the wallet (target) side. Zero/negative flows are dropped.
export function sankeyLayout({ flows = [], width = 480, height = 200, nodeWidth = 12, gap = 8 } = {}) {
  const items    = flows.filter(f => Number(f.amount) > 0)
  const total    = round2(items.reduce((s, f) => s + Number(f.amount), 0))
  const n        = items.length
  const totalGap = gap * Math.max(0, n - 1)
  const usable   = Math.max(0, height - totalGap)   // total ribbon thickness (excludes target gaps)

  let sourceY = 0
  let targetY = 0
  const nodes = items.map(f => {
    const amount    = Number(f.amount)
    const thickness = total > 0 ? (amount / total) * usable : (n > 0 ? usable / n : 0)
    const node = {
      wallet_id: f.wallet_id,
      amount,
      thickness,
      // Band on the salary node's right edge this ribbon leaves from (flush stack).
      source: { y: sourceY, height: thickness },
      // The wallet node rect on the right (also the ribbon's landing band).
      target: { x: width - nodeWidth, y: targetY, width: nodeWidth, height: thickness },
    }
    sourceY += thickness
    targetY += thickness + gap
    return node
  })

  // Salary node spans the flush ribbon stack (height === usable), so both ends stay proportional.
  const salary = { x: 0, y: 0, width: nodeWidth, height: usable }

  return { total, salary, nodes, width, height, nodeWidth }
}
