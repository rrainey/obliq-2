// Subsystem names render large and bold inside the block, below the icon,
// and an unsized subsystem grows to fit its name.

import { computeAutoLayout } from '@/lib/layout/autoLayout'
import {
  DEFAULT_WIDTH,
  getBlockHeight,
  getBlockWidth,
  getIntrinsicBlockHeight,
  hasSubsystemName,
  subsystemNameContentHeight,
  subsystemNameLines,
  subsystemNameTextWidth,
  SUBSYSTEM_NAME_LABEL as L,
} from '@/lib/layout/blockGeometry'
import type { BlockData } from '@/components/BlockNode'

const sub = (id: string, name: string, parameters: Record<string, unknown> = {}): BlockData => ({
  id, type: 'subsystem', name, position: { x: 0, y: 0 },
  parameters: { inputPorts: ['in'], outputPorts: ['out'], sheets: [], ...parameters },
})

const inset = 2 * (L.paddingPx + L.borderPx) // 20px
const content = (lines: number) => inset + L.iconPx + L.gapPx + lines * L.lineHeightPx

describe('subsystem name inside the block', () => {
  it('applies to subsystems with a visible name only', () => {
    expect(hasSubsystemName(sub('a', 'Frame'))).toBe(true)
    expect(hasSubsystemName(sub('a', 'Frame', { showName: false }))).toBe(false)
    expect(hasSubsystemName({ type: 'sum', name: 'Sum1', parameters: {} })).toBe(false)
    expect(subsystemNameContentHeight({ type: 'sum', name: 'Sum1', parameters: {} }, 80)).toBe(0)
  })

  it('is 250% of the 8px block-name size', () => {
    expect(L.fontPx).toBe(20)
  })

  it('estimates text width from bold glyph widths', () => {
    // Capitals and wide letters cost more than narrow ones
    expect(subsystemNameTextWidth('MW')).toBeGreaterThan(subsystemNameTextWidth('il') * 2)
    expect(subsystemNameTextWidth('AngleMode')).toBeGreaterThan(9 * 12) // more than a flat 0.6 em
  })

  it('an unsized subsystem is wide enough for its name on one line, within limits', () => {
    const fit = (name: string) => Math.ceil(subsystemNameTextWidth(name)) + inset
    expect(getBlockWidth(sub('a', 'Frame'))).toBe(Math.max(DEFAULT_WIDTH, fit('Frame')))
    expect(getBlockWidth(sub('a', 'Motor_RR'))).toBe(fit('Motor_RR'))
    expect(getBlockWidth(sub('a', 'AttitudeEstimator'))).toBe(fit('AttitudeEstimator'))
    for (const n of ['AngleMode', 'AttitudeEstimator', 'FlightController']) {
      expect(subsystemNameLines(n, getBlockWidth(sub('a', n)))).toBe(1)
    }
    expect(getBlockWidth(sub('a', 'A much longer descriptive subsystem name'))).toBe(L.maxAutoWidthPx)
    // Hidden name: the old default size
    expect(getBlockWidth(sub('a', 'AttitudeEstimator', { showName: false }))).toBe(DEFAULT_WIDTH)
  })

  it('an unsized subsystem is tall enough for the icon and the wrapped name', () => {
    expect(getIntrinsicBlockHeight(sub('a', 'Frame'), 1, 1)).toBe(content(1))
    const long = sub('a', 'A much longer descriptive subsystem name')
    const lines = subsystemNameLines(long.name, getBlockWidth(long))
    expect(lines).toBeGreaterThanOrEqual(2)
    expect(getIntrinsicBlockHeight(long, 1, 1)).toBe(content(lines))
    // Many ports still win
    expect(getIntrinsicBlockHeight(sub('a', 'Frame'), 8, 1)).toBe(8 * 20 + 20)
  })

  it('a resized subsystem keeps its size; the name wraps inside it', () => {
    const b = sub('a', 'FlightController', { width: 120, height: 200 })
    expect(getBlockWidth(b)).toBe(120)
    expect(getBlockHeight(b, 1, 1)).toBe(200)
    expect(subsystemNameLines(b.name, 120)).toBe(2) // one long word, broken mid-word
  })

  it('auto-layout spaces blocks by the name-sized height', () => {
    const blocks = [sub('top', 'A much longer descriptive subsystem name'), sub('bottom', 'B')]
    const { moves } = computeAutoLayout(blocks, [], {})
    const y = (id: string) => moves.find(m => m.id === id)?.position.y ?? blocks.find(b => b.id === id)!.position.y
    const [upper, lower] = ['top', 'bottom'].sort((a, b) => y(a) - y(b))
    const upperBlock = blocks.find(b => b.id === upper)!
    expect(y(lower)).toBeGreaterThanOrEqual(y(upper) + getBlockHeight(upperBlock, 1, 1))
  })
})
