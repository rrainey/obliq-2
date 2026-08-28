// The Tune Model Layout action applies three independent adjustments across a
// chosen scope, reaching sheets nested inside subsystems that are not mounted.

import { tuneModelLayout, isNoOp, DEFAULT_TUNE_OPTIONS, type TuneLayoutOptions } from '@/lib/layout/tuneModelLayout'
import { computeAutoLayout } from '@/lib/layout/autoLayout'
import { countSheetsInScope } from '@/lib/layout/tuneModelLayout'
import type { Sheet } from '@/lib/modelStore'
import type { BlockData } from '@/components/BlockNode'

const b = (id: string, type: string, params: Record<string, any> = {}, x = 0, y = 0): BlockData =>
  ({ id, type, name: id, position: { x, y }, parameters: params })
const w = (id: string, s: string, sp: number, t: string, tp: number) =>
  ({ id, sourceBlockId: s, sourcePortIndex: sp, targetBlockId: t, targetPortIndex: tp })

/** Inner sheet inside a subsystem, plus a top sheet holding that subsystem. */
function model(): Sheet[] {
  const inner: Sheet = {
    id: 'sub_main', name: 'Sub Main', extents: { width: 1000, height: 800 },
    blocks: [
      b('i_src', 'source', { value: 1 }, 400, 300),
      b('i_gain', 'scale', { gain: 2 }, 100, 50),
      b('i_out', 'output_port', { portName: 'y' }, 700, 500),
    ],
    connections: [w('iw1', 'i_src', 0, 'i_gain', 0), w('iw2', 'i_gain', 0, 'i_out', 0)],
  }
  // Every subsystem port is wired to its own neighbour: the resize fit needs
  // several distinct port positions before it can grow the block beyond its
  // natural height.
  const top: Sheet = {
    id: 'main', name: 'Main', extents: { width: 1000, height: 800 },
    blocks: [
      b('t_src', 'source', { value: 3 }, 500, 400),
      b('t_src2', 'source', { value: 4 }, 500, 200),
      b('t_src3', 'source', { value: 5 }, 500, 600),
      b('sub', 'subsystem', {
        inputPorts: ['a', 'b', 'c'], outputPorts: ['y', 'z'], sheets: [inner],
      }, 100, 100),
      b('t_out', 'output_port', { portName: 'out' }, 900, 20),
      b('t_out2', 'output_port', { portName: 'out2' }, 900, 700),
    ],
    connections: [
      w('tw1', 't_src', 0, 'sub', 0),
      w('tw2', 't_src2', 0, 'sub', 1),
      w('tw3', 't_src3', 0, 'sub', 2),
      w('tw4', 'sub', 0, 't_out', 0),
      w('tw5', 'sub', 1, 't_out2', 0),
    ],
  }
  return [top]
}

const opts = (o: Partial<TuneLayoutOptions> = {}): TuneLayoutOptions =>
  ({ ...DEFAULT_TUNE_OPTIONS, ...o })

const sheetById = (sheets: Sheet[], id: string): Sheet | null => {
  for (const s of sheets) {
    if (s.id === id) return s
    for (const blk of s.blocks || []) {
      if (blk.type === 'subsystem' && Array.isArray(blk.parameters?.sheets)) {
        const found = sheetById(blk.parameters.sheets, id)
        if (found) return found
      }
    }
  }
  return null
}
const blockIn = (sheets: Sheet[], sheetId: string, blockId: string) =>
  sheetById(sheets, sheetId)!.blocks.find(x => x.id === blockId)!

describe('no-op handling', () => {
  test('all three adjustments off is a no-op', () => {
    const o = opts({ cleanUpLayout: false, resizeSubsystems: false, hideBlockNames: false, subsystemPortLabels: 'asis' })
    expect(isNoOp(o)).toBe(true)
    const before = model()
    const { sheets, summary } = tuneModelLayout(before, 'main', o)
    expect(sheets).toBe(before)
    expect(summary.sheetsAffected).toBe(0)
  })
})

describe('scope', () => {
  test('current sheet leaves nested subsystem sheets untouched', () => {
    const before = model()
    const innerBefore = sheetById(before, 'sub_main')!
    const { sheets } = tuneModelLayout(before, 'main', opts({ scope: 'sheet' }))
    // Untouched sheets are returned by identity, protecting downstream memoisation.
    expect(sheetById(sheets, 'sub_main')).toBe(innerBefore)
  })

  test('entire model reaches sheets nested inside subsystems', () => {
    const before = model()
    const innerBefore = sheetById(before, 'sub_main')!
    const { sheets, summary } = tuneModelLayout(before, 'main', opts({ scope: 'model' }))
    expect(sheetById(sheets, 'sub_main')).not.toBe(innerBefore)
    expect(summary.sheetsAffected).toBe(2)
  })

  test('current subsystem tunes only that subsystem\'s sheets', () => {
    const before = model()
    const topBefore = sheetById(before, 'main')!
    const { sheets } = tuneModelLayout(before, 'sub_main', opts({ scope: 'subsystem' }))
    expect(sheetById(sheets, 'sub_main')!.blocks).not.toBe(topBefore.blocks)
    // The top sheet's own blocks are not re-laid-out, only rebuilt to carry the
    // updated subsystem; its non-subsystem blocks keep their positions.
    expect(blockIn(sheets, 'main', 't_src').position).toEqual({ x: 500, y: 400 })
  })

  test('current subsystem from a top-level sheet falls back to the whole model', () => {
    const { summary } = tuneModelLayout(model(), 'main', opts({ scope: 'subsystem' }))
    expect(summary.sheetsAffected).toBe(2)
  })
})

describe('adjustments are independent', () => {
  test('layout only moves blocks, and does not resize or rename', () => {
    const { summary } = tuneModelLayout(model(), 'main',
      opts({ cleanUpLayout: true, resizeSubsystems: false, hideBlockNames: false }))
    expect(summary.blocksMoved).toBeGreaterThan(0)
    expect(summary.blocksResized).toBe(0)
    expect(summary.namesHidden).toBe(0)
  })

  test('resize only changes sizes, leaving positions alone', () => {
    const before = model()
    const { sheets, summary } = tuneModelLayout(before, 'main',
      opts({ cleanUpLayout: false, resizeSubsystems: true, hideBlockNames: false }))
    expect(summary.blocksMoved).toBe(0)
    expect(summary.blocksResized).toBeGreaterThan(0)
    expect(blockIn(sheets, 'main', 't_src').position).toEqual({ x: 500, y: 400 })
    const sub = blockIn(sheets, 'main', 'sub')
    expect(typeof sub.parameters?.height).toBe('number')
  })

  test('resizing a subsystem preserves its sheets', () => {
    const { sheets } = tuneModelLayout(model(), 'main',
      opts({ cleanUpLayout: false, resizeSubsystems: true }))
    const sub = blockIn(sheets, 'main', 'sub')
    expect(sub.parameters?.sheets).toHaveLength(1)
    expect(sub.parameters?.inputPorts).toEqual(['a', 'b', 'c'])
  })

  test('hiding names spares subsystems and moves nothing', () => {
    const { sheets, summary } = tuneModelLayout(model(), 'main',
      opts({ cleanUpLayout: false, resizeSubsystems: false, hideBlockNames: true }))
    expect(summary.blocksMoved).toBe(0)
    expect(blockIn(sheets, 'main', 't_src').parameters?.showName).toBe(false)
    expect(blockIn(sheets, 'main', 't_out').parameters?.showName).toBe(false)
    expect(blockIn(sheets, 'main', 'sub').parameters?.showName).toBe(true)
  })

  test('all three together apply at once', () => {
    const { summary } = tuneModelLayout(model(), 'main',
      opts({ cleanUpLayout: true, resizeSubsystems: true, hideBlockNames: true, scope: 'model' }))
    expect(summary.blocksMoved).toBeGreaterThan(0)
    expect(summary.blocksResized).toBeGreaterThan(0)
    expect(summary.namesHidden).toBeGreaterThan(0)
  })
})

describe('subsystem port labels', () => {
  const labelOf = (sheets: Sheet[]) => blockIn(sheets, 'main', 'sub').parameters?.showPortNames

  test('show turns them on', () => {
    const { sheets, summary } = tuneModelLayout(model(), 'main',
      opts({ cleanUpLayout: false, subsystemPortLabels: 'show' }))
    expect(labelOf(sheets)).toBe(true)
    expect(summary.portLabelsChanged).toBe(1)
  })

  test('hide turns off a subsystem that was showing them', () => {
    const shown = tuneModelLayout(model(), 'main',
      opts({ cleanUpLayout: false, subsystemPortLabels: 'show' })).sheets
    const { sheets, summary } = tuneModelLayout(shown, 'main',
      opts({ cleanUpLayout: false, subsystemPortLabels: 'hide' }))
    expect(labelOf(sheets)).toBe(false)
    expect(summary.portLabelsChanged).toBe(1)
  })

  test('hide on an already-hidden subsystem writes nothing', () => {
    // showPortNames is opt-in on the canvas, so an absent value already reads
    // as hidden; comparing effective state avoids pointless churn.
    const before = model()
    const { sheets, summary } = tuneModelLayout(before, 'main',
      opts({ cleanUpLayout: false, subsystemPortLabels: 'hide' }))
    expect(summary.portLabelsChanged).toBe(0)
    expect(sheetById(sheets, 'main')).toBe(sheetById(before, 'main'))
  })

  test('leave as-is touches nothing', () => {
    const before = model()
    const { sheets, summary } = tuneModelLayout(before, 'main',
      opts({ cleanUpLayout: false, subsystemPortLabels: 'asis' }))
    expect(sheets).toBe(before)
    expect(summary.portLabelsChanged).toBe(0)
  })

  test('only subsystems are affected', () => {
    const { sheets } = tuneModelLayout(model(), 'main',
      opts({ cleanUpLayout: false, subsystemPortLabels: 'show' }))
    expect(blockIn(sheets, 'main', 't_src').parameters?.showPortNames).toBeUndefined()
  })

  test('a subsystem already in the wanted state is not counted', () => {
    const first = tuneModelLayout(model(), 'main',
      opts({ cleanUpLayout: false, subsystemPortLabels: 'show' }))
    const second = tuneModelLayout(first.sheets, 'main',
      opts({ cleanUpLayout: false, subsystemPortLabels: 'show' }))
    expect(second.summary.portLabelsChanged).toBe(0)
    // The outer array is always rebuilt; what must be preserved is each sheet,
    // since the type-propagation cache keys on the block arrays they hold.
    expect(sheetById(second.sheets, 'main')).toBe(sheetById(first.sheets, 'main'))
  })

  test('port labels alone is not a no-op', () => {
    expect(isNoOp(opts({
      cleanUpLayout: false, resizeSubsystems: false,
      hideBlockNames: false, subsystemPortLabels: 'show',
    }))).toBe(false)
  })

  test('changing labels preserves the subsystem\'s sheets', () => {
    const { sheets } = tuneModelLayout(model(), 'main',
      opts({ cleanUpLayout: false, subsystemPortLabels: 'show' }))
    expect(blockIn(sheets, 'main', 'sub').parameters?.sheets).toHaveLength(1)
  })
})

describe('mounting the sheet changes nothing', () => {
  // Tuning an off-screen sheet must match tuning it while it is the active
  // sheet on the canvas. computeAutoLayout reads block geometry from
  // blockGeometry, never from React Flow's measured DOM, so there is nothing
  // for mounting to contribute -- this pins that down.
  test('a nested sheet tuned via scope matches laying it out directly', () => {
    const tuned = tuneModelLayout(model(), 'main', opts({ scope: 'model' })).sheets
    const nested = sheetById(tuned, 'sub_main')!

    const original = sheetById(model(), 'sub_main')!
    const direct = computeAutoLayout(original.blocks, original.connections)
    const directById = new Map(direct.moves.map(m => [m.id, m.position]))

    for (const block of nested.blocks) {
      expect(block.position).toEqual(directById.get(block.id))
    }
  })

  test('the same holds with resizing enabled', () => {
    const o = opts({ scope: 'model', resizeSubsystems: true })
    const tuned = tuneModelLayout(model(), 'main', o).sheets
    const top = sheetById(tuned, 'main')!

    const original = sheetById(model(), 'main')!
    const direct = computeAutoLayout(original.blocks, original.connections, { resizeBlocks: true })
    const sizeById = new Map(direct.resizes.map(r => [r.id, r]))

    const sub = top.blocks.find(b => b.id === 'sub')!
    const expected = sizeById.get('sub')!
    expect(sub.parameters?.width).toBe(expected.width)
    expect(sub.parameters?.height).toBe(expected.height)
  })
})

describe('defaults', () => {
  test('the dialog opens on current sheet, layout only', () => {
    expect(DEFAULT_TUNE_OPTIONS).toEqual({
      cleanUpLayout: true, resizeSubsystems: false, subsystemPortLabels: 'asis',
      hideBlockNames: false, scope: 'sheet',
    })
  })
})

describe('scope counting', () => {
  test('reports what each scope will touch', () => {
    const m = model()
    expect(countSheetsInScope(m, 'main', 'sheet')).toBe(1)
    expect(countSheetsInScope(m, 'main', 'model')).toBe(2)
  })

  test('the count matches what tuning actually changes', () => {
    // The dialog's warning must not be able to disagree with the outcome.
    for (const scope of ['sheet', 'subsystem', 'model'] as const) {
      const m = model()
      const predicted = countSheetsInScope(m, 'main', scope)
      const { summary } = tuneModelLayout(m, 'main', opts({ scope, cleanUpLayout: true }))
      expect(summary.sheetsAffected).toBe(predicted)
    }
  })
})
