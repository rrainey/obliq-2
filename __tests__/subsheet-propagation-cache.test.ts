// Guards the memoisation added to subsystem-interior type propagation.
//
// getSubsystemOutputType re-propagates a subsystem's sheet whenever an output
// port's driving type isn't already known. Unmemoised that fired ~49,000 times
// on a 163-sheet model. The cache is keyed on the identity of the sheet's
// `blocks` and `connections` arrays, which the store replaces on every edit, so
// the risk it must not have is serving a stale type after a model change.

import { propagateSignalTypesMultiSheet } from '@/lib/signalTypePropagation'
import type { BlockData } from '@/components/BlockNode'

const block = (id: string, type: string, params: Record<string, any> = {}): BlockData =>
  ({ id, type, name: id, position: { x: 0, y: 0 }, parameters: params })

const wire = (id: string, s: string, sp: number, t: string, tp: number) =>
  ({ id, sourceBlockId: s, sourcePortIndex: sp, targetBlockId: t, targetPortIndex: tp })

/** A subsystem whose interior drives Out1 from a source of the given type. */
function modelWithSubsystem(sourceType: string) {
  const interior = {
    id: 'sub_main', name: 'Sub Main',
    blocks: [
      block('inner_src', 'source', { value: 1, dataType: sourceType }),
      block('inner_out', 'output_port', { portName: 'Out1' }),
    ],
    connections: [wire('iw1', 'inner_src', 0, 'inner_out', 0)],
    extents: { width: 1000, height: 800 },
  }
  const sub = block('sub', 'subsystem', {
    inputPorts: ['In1'], outputPorts: ['Out1'], sheets: [interior],
  })
  return [{
    blocks: [sub, block('display', 'signal_display')],
    connections: [wire('w1', 'sub', 0, 'display', 0)],
  }]
}

const typeOfWire = (sheets: any[], wireId: string) =>
  propagateSignalTypesMultiSheet(sheets).signalTypes.get(wireId)?.type

describe('subsystem interior propagation cache', () => {
  test('resolves a subsystem output type through its interior', () => {
    expect(typeOfWire(modelWithSubsystem('double[3]'), 'w1')).toBe('double[3]')
  })

  test('repeated runs over the same arrays agree', () => {
    const sheets = modelWithSubsystem('double[3]')
    expect(typeOfWire(sheets, 'w1')).toBe('double[3]')
    expect(typeOfWire(sheets, 'w1')).toBe('double[3]')
  })

  test('an edited interior is not served from cache', () => {
    // First run populates the cache for the original interior.
    expect(typeOfWire(modelWithSubsystem('double[3]'), 'w1')).toBe('double[3]')
    // A different interior must produce a different answer, not the cached one.
    expect(typeOfWire(modelWithSubsystem('double[4][1]'), 'w1')).toBe('double[4][1]')
  })

  test('mutating a block in place still invalidates when arrays are replaced', () => {
    // Mirrors how the store edits: new arrays, changed contents.
    const sheets = modelWithSubsystem('double[3]')
    expect(typeOfWire(sheets, 'w1')).toBe('double[3]')

    const sub: any = sheets[0].blocks[0]
    const interior = sub.parameters.sheets[0]
    const editedBlocks = interior.blocks.map((b: BlockData) =>
      b.id === 'inner_src'
        ? { ...b, parameters: { ...b.parameters, dataType: 'float' } }
        : b
    )
    sub.parameters.sheets = [{ ...interior, blocks: editedBlocks, connections: [...interior.connections] }]

    expect(typeOfWire(sheets, 'w1')).toBe('float')
  })

  test('nested subsystems resolve through multiple levels', () => {
    const inner = {
      id: 'deep_main', name: 'Deep Main',
      blocks: [
        block('deep_src', 'source', { value: 1, dataType: 'double[2]' }),
        block('deep_out', 'output_port', { portName: 'Out1' }),
      ],
      connections: [wire('dw1', 'deep_src', 0, 'deep_out', 0)],
      extents: { width: 1000, height: 800 },
    }
    const innerSub = block('deep', 'subsystem', {
      inputPorts: ['In1'], outputPorts: ['Out1'], sheets: [inner],
    })
    const outer = {
      id: 'outer_main', name: 'Outer Main',
      blocks: [innerSub, block('outer_out', 'output_port', { portName: 'Out1' })],
      connections: [wire('ow1', 'deep', 0, 'outer_out', 0)],
      extents: { width: 1000, height: 800 },
    }
    const outerSub = block('outer', 'subsystem', {
      inputPorts: ['In1'], outputPorts: ['Out1'], sheets: [outer],
    })
    const sheets = [{
      blocks: [outerSub, block('display', 'signal_display')],
      connections: [wire('w1', 'outer', 0, 'display', 0)],
    }]
    expect(typeOfWire(sheets, 'w1')).toBe('double[2]')
  })
})
