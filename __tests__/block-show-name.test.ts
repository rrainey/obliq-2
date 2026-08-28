// Newly created blocks hide their name; a Subsystem is the exception. Blocks
// saved before the setting existed carry no `showName` and must keep showing
// their names, so "missing" reads as visible everywhere it is consulted.

import { createBlock, getDefaultBlockParameters, defaultShowName } from '@/lib/blockFactory'
import { BlockTypes } from '@/lib/blockTypeRegistry'
import type { BlockData } from '@/components/BlockNode'

/** The rule BlockNode and the PDF renderer both apply. */
const nameIsVisible = (block: BlockData) => block.parameters?.showName !== false

const make = (type: string) =>
  createBlock(type, { position: { x: 0, y: 0 }, existingBlockCount: 1 }) as BlockData

describe('showName defaults', () => {
  test('a new block hides its name', () => {
    for (const type of ['scale', 'sum', 'source', 'integrator', 'signal_display', 'input_port']) {
      expect(make(type).parameters?.showName).toBe(false)
    }
  })

  test('a new subsystem shows its name', () => {
    expect(make('subsystem').parameters?.showName).toBe(true)
  })

  test('defaultShowName singles out the subsystem type', () => {
    expect(defaultShowName(BlockTypes.SUBSYSTEM)).toBe(true)
    expect(defaultShowName('scale')).toBe(false)
  })

  test('the default is applied to every type, not a hand-maintained list', () => {
    // A block type with no entry in the type-specific switch still gets it.
    expect(getDefaultBlockParameters('atmosphere')).toHaveProperty('showName', false)
  })

  test('type-specific defaults are preserved alongside it', () => {
    const sub = getDefaultBlockParameters('subsystem')
    expect(sub.showName).toBe(true)
    expect(sub.inputPorts).toEqual(['Input1'])
    expect(sub.outputPorts).toEqual(['Output1'])
  })
})

describe('rendering rule', () => {
  const block = (parameters: Record<string, any>): BlockData =>
    ({ id: 'b', type: 'scale', name: 'Gain', position: { x: 0, y: 0 }, parameters })

  test('a block saved before the setting existed still shows its name', () => {
    expect(nameIsVisible(block({ gain: 2 }))).toBe(true)
  })

  test('an explicit false hides it', () => {
    expect(nameIsVisible(block({ showName: false }))).toBe(false)
  })

  test('an explicit true shows it', () => {
    expect(nameIsVisible(block({ showName: true }))).toBe(true)
  })

  test('a block with no parameters at all still shows its name', () => {
    expect(nameIsVisible({ id: 'b', type: 'scale', name: 'G', position: { x: 0, y: 0 } })).toBe(true)
  })
})

describe('toggling', () => {
  // Mirrors the context-menu handler: flip against the same "missing means
  // visible" rule, merging so no other parameters are lost.
  const toggle = (b: BlockData): BlockData => ({
    ...b,
    parameters: { ...(b.parameters || {}), showName: b.parameters?.showName === false },
  })

  test('a legacy block toggles to hidden first', () => {
    const legacy: BlockData = { id: 'b', type: 'scale', name: 'G', position: { x: 0, y: 0 }, parameters: { gain: 2 } }
    expect(nameIsVisible(toggle(legacy))).toBe(false)
  })

  test('toggling twice returns to visible', () => {
    let b = make('subsystem')
    expect(nameIsVisible(b)).toBe(true)
    b = toggle(b); expect(nameIsVisible(b)).toBe(false)
    b = toggle(b); expect(nameIsVisible(b)).toBe(true)
  })

  test('toggling preserves a subsystem\'s sheets and ports', () => {
    const sub = make('subsystem')
    const toggled = toggle(sub)
    expect(toggled.parameters?.sheets).toBe(sub.parameters?.sheets)
    expect(toggled.parameters?.inputPorts).toEqual(sub.parameters?.inputPorts)
  })
})
