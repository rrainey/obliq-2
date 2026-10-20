// Subsystem names render large and bold below the block; layout leaves room.

import { computeAutoLayout } from '@/lib/layout/autoLayout'
import {
  getBlockHeight,
  getNameBelowHeight,
  getNameBelowWidth,
  hasNameBelow,
  SUBSYSTEM_NAME_LABEL as L,
} from '@/lib/layout/blockGeometry'
import type { BlockData } from '@/components/BlockNode'

const sub = (id: string, name: string, parameters: Record<string, unknown> = {}): BlockData => ({
  id, type: 'subsystem', name, position: { x: 0, y: 0 },
  parameters: { inputPorts: ['in'], outputPorts: ['out'], sheets: [], ...parameters },
})

describe('subsystem name label', () => {
  it('applies to subsystems with a visible name only', () => {
    expect(hasNameBelow(sub('a', 'Frame'))).toBe(true)
    expect(hasNameBelow(sub('a', 'Frame', { showName: false }))).toBe(false)
    expect(hasNameBelow({ type: 'sum', name: 'Sum1', parameters: {} })).toBe(false)
    expect(getNameBelowHeight({ type: 'sum', name: 'Sum1', parameters: {} })).toBe(0)
  })

  it('is 250% of the 8px block-name size and at least 160px wide', () => {
    expect(L.fontPx).toBe(20)
    expect(getNameBelowWidth(sub('a', 'X'))).toBe(160)
    expect(getNameBelowWidth(sub('a', 'X', { width: 300 }))).toBe(300)
  })

  it('estimates wrapped lines from the label width', () => {
    const oneLine = L.gapPx + L.lineHeightPx
    expect(getNameBelowHeight(sub('a', 'Frame'))).toBe(oneLine)
    // 160px at 12px per glyph is 13 characters a line
    expect(getNameBelowHeight(sub('a', 'Flight Controller Estimators'))).toBe(L.gapPx + 3 * L.lineHeightPx)
    // A single long word breaks across lines too
    expect(getNameBelowHeight(sub('a', 'A'.repeat(30)))).toBe(L.gapPx + 3 * L.lineHeightPx)
  })

  it('auto-layout keeps the label clear of the next block in the column', () => {
    // Five lines (126px): taller than the 80px row gap on its own
    const name = 'A subsystem with a rather long descriptive name that wraps five times'
    const blocks = [sub('top', name), sub('bottom', 'B')]
    expect(getNameBelowHeight(blocks[0]!)).toBeGreaterThan(80)
    const { moves } = computeAutoLayout(blocks, [], {})
    const y = (id: string) => moves.find(m => m.id === id)?.position.y ?? blocks.find(b => b.id === id)!.position.y
    const [upper, lower] = ['top', 'bottom'].sort((a, b) => y(a) - y(b))
    const upperBlock = blocks.find(b => b.id === upper)!
    const labelBottom = y(upper) + getBlockHeight(upperBlock, 1, 1) + getNameBelowHeight(upperBlock)
    expect(y(lower)).toBeGreaterThanOrEqual(labelBottom)
  })
})
