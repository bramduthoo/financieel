import { describe, it, expect } from 'vitest'
import { itemsToLines } from './textLayout.js'

// pdf.js item shape: transform is [a, b, c, d, x, y]; y grows UPWARD.
const item = (str, x, y, width = str.length * 5) => ({ str, width, transform: [1, 0, 0, 1, x, y] })

describe('itemsToLines', () => {
  it('groups fragments on the same baseline into one line', () => {
    // The real motivation: a statement row arrives as separate positioned fragments.
    const lines = itemsToLines([
      item('24-07-2026', 50, 700),
      item('Kinepolis Multi N.V.', 120, 700),
      item('-31,40', 480, 700),
      item('EUR', 530, 700),
    ])
    expect(lines).toHaveLength(1)
    expect(lines[0].text).toBe('24-07-2026 Kinepolis Multi N.V. -31,40 EUR')
  })

  it('orders lines top-to-bottom even when items arrive out of order', () => {
    const lines = itemsToLines([
      item('third', 50, 600),
      item('first', 50, 700),
      item('second', 50, 650),
    ])
    expect(lines.map(l => l.text)).toEqual(['first', 'second', 'third'])
  })

  it('orders fragments left-to-right within a line', () => {
    const lines = itemsToLines([item('world', 200, 700), item('hello', 50, 700)])
    expect(lines[0].text).toBe('hello world')
  })

  it('tolerates small baseline drift within a line', () => {
    const lines = itemsToLines([item('a', 50, 700), item('b', 100, 701)])
    expect(lines).toHaveLength(1)
  })

  it('keeps genuinely different lines apart', () => {
    const lines = itemsToLines([item('a', 50, 700), item('b', 50, 685)])
    expect(lines).toHaveLength(2)
  })

  it('does not insert a space between adjacent fragments of one word', () => {
    // endX of the first fragment touches the x of the second → same word.
    const lines = itemsToLines([
      { str: 'Kine', width: 20, transform: [1, 0, 0, 1, 50, 700] },
      { str: 'polis', width: 22, transform: [1, 0, 0, 1, 70, 700] },
    ])
    expect(lines[0].text).toBe('Kinepolis')
  })

  it('keeps per-fragment x positions for later column-aware parsing', () => {
    const lines = itemsToLines([item('date', 50, 700), item('-31,40', 480, 700)])
    expect(lines[0].cells.map(c => c.x)).toEqual([50, 480])
  })

  it('drops empty spacer items and empty lines', () => {
    const lines = itemsToLines([item('', 50, 700), item('   ', 60, 700), item('real', 50, 650)])
    expect(lines.map(l => l.text)).toEqual(['real'])
  })

  it('handles no items', () => {
    expect(itemsToLines([])).toEqual([])
    expect(itemsToLines(undefined)).toEqual([])
  })
})
