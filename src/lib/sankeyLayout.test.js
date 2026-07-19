import { describe, it, expect } from 'vitest'
import { sankeyLayout } from './sankeyLayout'

describe('sankeyLayout', () => {
  it('ribbon thickness is proportional to amount and fills the usable height', () => {
    const { nodes, salary, total } = sankeyLayout({
      flows: [{ wallet_id: 'a', amount: 300 }, { wallet_id: 'b', amount: 100 }],
      width: 480, height: 200, nodeWidth: 12, gap: 8,
    })
    expect(total).toBe(400)
    // usable = 200 - 8 (one gap) = 192; split 3:1 → 144 / 48.
    expect(nodes[0].thickness).toBeCloseTo(144, 5)
    expect(nodes[1].thickness).toBeCloseTo(48, 5)
    expect(nodes[0].thickness + nodes[1].thickness).toBeCloseTo(192, 5)
    expect(salary.height).toBeCloseTo(192, 5)
  })

  it('stacks source bands flush and target nodes with gaps', () => {
    const { nodes } = sankeyLayout({
      flows: [{ wallet_id: 'a', amount: 300 }, { wallet_id: 'b', amount: 100 }],
      width: 480, height: 200, gap: 8, nodeWidth: 12,
    })
    // Source: flush stack from 0.
    expect(nodes[0].source.y).toBeCloseTo(0, 5)
    expect(nodes[1].source.y).toBeCloseTo(144, 5)
    // Target: second node is pushed by the first node's height + one gap.
    expect(nodes[0].target.y).toBeCloseTo(0, 5)
    expect(nodes[1].target.y).toBeCloseTo(152, 5)
    // Target nodes sit on the right edge.
    expect(nodes[0].target.x).toBe(480 - 12)
  })

  it('drops zero/negative flows and handles an empty distribution', () => {
    const withZero = sankeyLayout({ flows: [{ wallet_id: 'a', amount: 100 }, { wallet_id: 'b', amount: 0 }] })
    expect(withZero.nodes).toHaveLength(1)

    const empty = sankeyLayout({ flows: [] })
    expect(empty.total).toBe(0)
    expect(empty.nodes).toHaveLength(0)
  })
})
