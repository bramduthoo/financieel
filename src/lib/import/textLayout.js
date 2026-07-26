// Line reconstruction from pdf.js positioned text items.
//
// Kept in its own PURE module (no pdf.js import) so it is unit-testable under the node
// Vitest environment — `extractText.js` imports pdf.js and its `?url` worker asset, which
// only resolve inside Vite.
//
// pdf.js returns text as fragments in content-stream order, not reading order: each item
// carries a transform matrix where [4] = x and [5] = y (y grows UPWARD). Reading order is
// recovered by bucketing on y, then sorting on x.

const Y_TOLERANCE = 2   // pt — same visual line if baselines differ by less than this
const SPACE_GAP = 1     // pt — horizontal gap that implies a word break

/**
 * @param {Array<{str: string, width: number, transform: number[]}>} items
 * @param {{ yTolerance?: number, spaceGap?: number }} [opts]
 * @returns {Array<{ y: number, text: string, cells: Array<{x: number, endX: number, str: string}> }>}
 */
export function itemsToLines(items, { yTolerance = Y_TOLERANCE, spaceGap = SPACE_GAP } = {}) {
  const rows = []

  for (const item of items ?? []) {
    if (!item?.str) continue                    // pdf.js emits empty spacer items
    const x = item.transform[4]
    const y = item.transform[5]

    let row = rows.find(r => Math.abs(r.y - y) <= yTolerance)
    if (!row) { row = { y, items: [] }; rows.push(row) }
    row.items.push({ x, endX: x + (item.width ?? 0), str: item.str })
  }

  return rows
    .sort((a, b) => b.y - a.y)                  // top of the page first
    .map(row => {
      const cells = row.items.sort((a, b) => a.x - b.x)
      let text = ''
      let prevEnd = null
      for (const cell of cells) {
        if (prevEnd !== null && cell.x - prevEnd > spaceGap) text += ' '
        text += cell.str
        prevEnd = cell.endX
      }
      // Per-cell x positions are deliberately KEPT on the line. Bank statements are column
      // layouts; a later column-aware parser needs them and they cost nothing to carry.
      return { y: row.y, text: text.replace(/\s+/g, ' ').trim(), cells }
    })
    .filter(line => line.text)
}
