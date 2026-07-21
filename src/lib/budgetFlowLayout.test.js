import { describe, it, expect } from 'vitest'
import { computeBudgetFlowLayout } from './budgetFlowLayout'

const wallets = [
  { id: 'rent',   name: 'Rent',        type: 'fixed' },
  { id: 'groc',   name: 'Groceries',   type: 'variable' },
  { id: 'cloth',  name: 'Clothing',    type: 'variable' },
  { id: 'unal',   name: 'Unallocated', is_system: true },
]
const incomes = [
  { id: 'sal',  name: 'Salary',   amount: 2000 },
  { id: 'gig',  name: 'Side gig', amount: 1000 },
]

const H = 360
const base = { wallets, width: 640, height: H, nodeGap: 10, minThickness: 3 }

describe('computeBudgetFlowLayout', () => {
  it('returns an empty layout for no incomes, no allocations, or all-zero amounts', () => {
    for (const args of [
      { ...base, incomes: [], allocations: [] },
      { ...base, incomes, allocations: [] },
      { ...base, incomes, allocations: [{ income_id: 'sal', wallet_id: 'rent', amount: 0 }] },
      { ...base, incomes, allocations: [{ income_id: 'sal', wallet_id: 'rent', amount: -50 }] },
    ]) {
      const out = computeBudgetFlowLayout(args)
      expect(out.links).toEqual([])
      expect(out.labels).toEqual([])
      expect(out.total).toBe(0)
    }
  })

  it('drops allocations naming an unknown income or wallet', () => {
    const out = computeBudgetFlowLayout({
      ...base, incomes,
      allocations: [
        { income_id: 'sal',   wallet_id: 'rent',    amount: 100 },
        { income_id: 'ghost', wallet_id: 'rent',    amount: 100 },
        { income_id: 'sal',   wallet_id: 'missing', amount: 100 },
      ],
    })
    expect(out.links).toHaveLength(1)
    expect(out.total).toBe(100)
  })

  it('makes ribbon thickness proportional to euros and fills the usable height', () => {
    const out = computeBudgetFlowLayout({
      ...base, incomes: [incomes[0]],
      allocations: [
        { income_id: 'sal', wallet_id: 'rent', amount: 1000 },
        { income_id: 'sal', wallet_id: 'groc', amount: 500 },
        { income_id: 'sal', wallet_id: 'unal', amount: 500 },
      ],
    })
    const [rent, groc, unal] = out.links
    expect(rent.thickness).toBeCloseTo(groc.thickness * 2, 5)
    expect(groc.thickness).toBeCloseTo(unal.thickness, 5)

    // 3 wallet nodes → 2 gaps; the whole ribbon stack fills what's left.
    const usable = H - 10 * 2
    const sum = out.links.reduce((s, l) => s + l.thickness, 0)
    expect(sum).toBeCloseTo(usable, 5)
  })

  it('respects the minimum thickness for a tiny flow without producing negatives', () => {
    const out = computeBudgetFlowLayout({
      ...base, incomes: [incomes[0]], minThickness: 3,
      allocations: [
        { income_id: 'sal', wallet_id: 'rent',  amount: 5000 },
        { income_id: 'sal', wallet_id: 'groc',  amount: 5000 },
        { income_id: 'sal', wallet_id: 'cloth', amount: 1 },      // would be sub-pixel
      ],
    })
    for (const l of out.links) {
      expect(l.thickness).toBeGreaterThanOrEqual(3 - 1e-9)
      expect(Number.isFinite(l.thickness)).toBe(true)
    }
    const usable = H - 10 * 2
    expect(out.links.reduce((s, l) => s + l.thickness, 0)).toBeCloseTo(usable, 5)
  })

  it('falls back to equal slices when the minimum cannot fit', () => {
    // 40 flows x 3px min = 120px > 60px box.
    const many = Array.from({ length: 40 }, (_, i) => ({ id: `w${i}`, name: `W${i}` }))
    const out = computeBudgetFlowLayout({
      incomes: [incomes[0]], wallets: many, width: 640, height: 60, nodeGap: 0, minThickness: 3,
      allocations: many.map(w => ({ income_id: 'sal', wallet_id: w.id, amount: 10 })),
    })
    expect(out.links).toHaveLength(40)
    for (const l of out.links) {
      expect(Number.isFinite(l.thickness)).toBe(true)
      expect(l.thickness).toBeGreaterThan(0)
    }
  })

  it('stacks two incomes feeding one wallet onto a single node', () => {
    const out = computeBudgetFlowLayout({
      ...base, incomes,
      allocations: [
        { income_id: 'sal', wallet_id: 'rent', amount: 800 },
        { income_id: 'gig', wallet_id: 'rent', amount: 400 },
      ],
    })
    expect(out.walletNodes).toHaveLength(1)
    const rentNode = out.walletNodes[0]
    expect(rentNode.amount).toBe(1200)

    // Both ribbons land inside that one node, contiguously and without overlapping.
    const rentLinks = out.links.filter(l => l.wallet_id === 'rent')
    expect(rentLinks).toHaveLength(2)
    const sum = rentLinks.reduce((s, l) => s + l.thickness, 0)
    expect(sum).toBeCloseTo(rentNode.height, 5)
  })

  it('gives each income its own colour index in display order', () => {
    const out = computeBudgetFlowLayout({
      ...base, incomes,
      allocations: [
        { income_id: 'gig', wallet_id: 'groc', amount: 400 },
        { income_id: 'sal', wallet_id: 'rent', amount: 800 },
      ],
    })
    // Colour follows the `incomes` array order, not allocation order.
    expect(out.incomeNodes.map(n => n.id)).toEqual(['sal', 'gig'])
    expect(out.incomeNodes.map(n => n.colorIndex)).toEqual([0, 1])
    expect(out.links.find(l => l.income_id === 'sal').colorIndex).toBe(0)
    expect(out.links.find(l => l.income_id === 'gig').colorIndex).toBe(1)
  })

  it('never emits NaN in any coordinate', () => {
    const out = computeBudgetFlowLayout({
      ...base, incomes,
      allocations: [
        { income_id: 'sal', wallet_id: 'rent',  amount: 1200 },
        { income_id: 'sal', wallet_id: 'unal',  amount: 300 },
        { income_id: 'gig', wallet_id: 'rent',  amount: 100 },
        { income_id: 'gig', wallet_id: 'cloth', amount: 200 },
      ],
    })
    const nums = [
      ...out.incomeNodes.flatMap(n => [n.x, n.y, n.width, n.height]),
      ...out.walletNodes.flatMap(n => [n.x, n.y, n.width, n.height]),
      ...out.labels.flatMap(l => [l.x, l.y, l.anchorY, l.pct]),
      ...out.links.map(l => l.thickness),
    ]
    for (const v of nums) expect(Number.isFinite(v)).toBe(true)
    for (const l of out.links) expect(l.path).not.toMatch(/NaN|undefined/)
  })

  describe('label de-collision', () => {
    // Many wallets, wildly uneven amounts → nodes bunch up and labels would overlap.
    const crowded = Array.from({ length: 8 }, (_, i) => ({ id: `w${i}`, name: `Wallet ${i}` }))
    const layout = () => computeBudgetFlowLayout({
      incomes: [incomes[0]], wallets: crowded, width: 640, height: 300,
      nodeGap: 4, minThickness: 3, labelMinGap: 30,
      allocations: crowded.map((w, i) => ({
        income_id: 'sal', wallet_id: w.id, amount: i === 0 ? 5000 : 20,
      })),
    })

    it('keeps every label at least labelMinGap apart', () => {
      const { labels } = layout()
      for (let i = 1; i < labels.length; i++) {
        expect(labels[i].y - labels[i - 1].y).toBeGreaterThanOrEqual(30 - 1e-9)
      }
    })

    it('is deterministic across runs', () => {
      const a = layout().labels.map(l => l.y)
      const b = layout().labels.map(l => l.y)
      expect(a).toEqual(b)
    })

    it('flags displaced labels and gives them a leader line back to the node', () => {
      const { labels } = layout()
      const moved = labels.filter(l => l.displaced)
      expect(moved.length).toBeGreaterThan(0)
      for (const l of moved) {
        expect(l.leader).not.toBeNull()
        expect(l.leader.y1).toBeCloseTo(l.anchorY, 5)
        expect(l.leader.y2).toBeCloseTo(l.y, 5)
      }
      for (const l of labels.filter(x => !x.displaced)) expect(l.leader).toBeNull()
    })

    it('leaves already-separated labels exactly on their node centres', () => {
      const { labels } = computeBudgetFlowLayout({
        ...base, incomes: [incomes[0]],
        allocations: [
          { income_id: 'sal', wallet_id: 'rent', amount: 1000 },
          { income_id: 'sal', wallet_id: 'groc', amount: 1000 },
        ],
      })
      for (const l of labels) {
        expect(l.displaced).toBe(false)
        expect(l.y).toBeCloseTo(l.anchorY, 5)
      }
    })
  })


  it('folds duplicate (income, wallet) pairs into one ribbon', () => {
    // Reachable in real data: an income can hold an explicit Unallocated rule AND the remainder
    // sweep. Two rows for the same pair must merge, not draw on top of each other.
    const out = computeBudgetFlowLayout({
      ...base, incomes: [incomes[0]],
      allocations: [
        { income_id: 'sal', wallet_id: 'unal', amount: 100 },
        { income_id: 'sal', wallet_id: 'unal', amount: 250 },
        { income_id: 'sal', wallet_id: 'rent', amount: 650 },
      ],
    })
    expect(out.links).toHaveLength(2)
    const unal = out.links.find(l => l.wallet_id === 'unal')
    expect(unal.amount).toBe(350)
    // Unique React keys, and the node height equals its single merged ribbon.
    expect(new Set(out.links.map(l => l.id)).size).toBe(out.links.length)
    const unalNode = out.walletNodes.find(n => n.id === 'unal')
    expect(unalNode.amount).toBe(350)
    expect(unalNode.height).toBeCloseTo(unal.thickness, 5)
  })

  it('keeps every label inside the box when the caller sizes it from labelMinGap', () => {
    const many = Array.from({ length: 12 }, (_, i) => ({ id: `w${i}`, name: `Wallet ${i}` }))
    const minGap = 30
    const height = many.length * minGap + 16   // what BudgetFlowChart computes
    const { labels } = computeBudgetFlowLayout({
      incomes: [incomes[0]], wallets: many, width: 640, height,
      nodeGap: 4, minThickness: 3, labelMinGap: minGap,
      allocations: many.map((w, i) => ({
        income_id: 'sal', wallet_id: w.id, amount: i === 0 ? 9000 : 15,
      })),
    })
    for (const l of labels) {
      expect(l.y).toBeGreaterThanOrEqual(8 - 1e-9)   // name row (y-5) stays visible
      expect(l.y).toBeLessThanOrEqual(height - 8 + 1e-9)
    }
  })

  it('reports each wallet percentage against the distributed total', () => {
    const { labels } = computeBudgetFlowLayout({
      ...base, incomes: [incomes[0]],
      allocations: [
        { income_id: 'sal', wallet_id: 'rent', amount: 750 },
        { income_id: 'sal', wallet_id: 'groc', amount: 250 },
      ],
    })
    expect(labels.find(l => l.wallet_id === 'rent').pct).toBe(75)
    expect(labels.find(l => l.wallet_id === 'groc').pct).toBe(25)
  })
})
