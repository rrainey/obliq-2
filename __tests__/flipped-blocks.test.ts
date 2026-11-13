// Mirrored (flipped) blocks, Phase 4 of docs/layout-improvement-plan-pass-2.md.
//
// A `scale` block is 80 x 64 px with one port at mid-height. Unflipped, its
// output end is at (x + 86, y + 32) and its input end at (x - 6, y + 32).
// Flipped (`parameters.flipped: true`), its input end is at (x + 86, y + 32)
// and its output end at (x - 6, y + 32).

jest.mock('@/lib/modelApi', () => ({ modelApi: {}, ModelApiError: class extends Error {} }))

import { PDFDocument, decodePDFRawStream, PDFRawStream, PDFArray } from 'pdf-lib'
import {
  dataPortGeometry, dataPortSide, isFlipped, defaultWirePath, defaultWireRoute, wireEndAt, WIRE_STUB, HANDLE_OUTSET,
} from '@/lib/layout/blockGeometry'
import { scoreSheetLayout, wirePolyline, blockWireGeometry, wireEndsFollowPorts } from '@/lib/layout/layoutMetrics'
import { repairWiresAfterBlockChange } from '@/lib/layout/waypointRepair'
import { computeAutoLayout } from '@/lib/layout/autoLayout'
import { tuneModelLayout, DEFAULT_TUNE_OPTIONS } from '@/lib/layout/tuneModelLayout'
import { findSatellites } from '@/lib/layout/satellites'
import { renderModelToPdf, DEFAULT_PDF_OPTIONS, wirePoints } from '@/lib/export/pdfRenderer'
import { buildFullPlan } from '@/lib/export/sheetTree'
import { generateStepPathSegments } from '@/lib/wireRoutingUtils'
import { validateBlockParameters } from '@/lib/blockParameterValidator'
import { mergeDialogParameters, withPreviousParameters } from '@/lib/blocks/dialogParameters'
import { useModelStore } from '@/lib/modelStore'
import type { BlockData } from '@/components/BlockNode'
import type { WireData } from '@/components/Wire'

const blk = (id: string, x: number, y: number, flipped = false, type = 'scale', parameters: Record<string, any> = { gain: 1 }): BlockData =>
  ({ id, type, name: id, position: { x, y }, parameters: flipped ? { ...parameters, flipped: true } : parameters })
const wire = (id: string, s: string, t: string, routing?: WireData['routing'], sp = 0, tp = 0): WireData =>
  ({ id, sourceBlockId: s, sourcePortIndex: sp, targetBlockId: t, targetPortIndex: tp, routing })

describe('dataPortGeometry', () => {
  it('puts inputs on the left and outputs on the right of a block that is not flipped', () => {
    const b = blk('a', 0, 0)
    expect(isFlipped(b)).toBe(false)
    expect(dataPortGeometry(b, 'input', 0, 1, 80, 64)).toEqual({ side: 'left', dir: -1, edgeX: 0, endX: -HANDLE_OUTSET, y: 32 })
    expect(dataPortGeometry(b, 'output', 0, 1, 80, 64)).toEqual({ side: 'right', dir: 1, edgeX: 80, endX: 80 + HANDLE_OUTSET, y: 32 })
  })

  it('swaps the sides of a flipped block and keeps the port y', () => {
    const b = { type: 'sum', parameters: { flipped: true, signs: '+-' } }
    expect(isFlipped(b)).toBe(true)
    expect(dataPortSide(b, 'input')).toBe('right')
    expect(dataPortSide(b, 'output')).toBe('left')
    expect(dataPortGeometry(b, 'input', 1, 2, 80, 64)).toMatchObject({ side: 'right', dir: 1, endX: 86 })
    expect(dataPortGeometry(b, 'input', 1, 2, 80, 64).y).toBeCloseTo(64 * 2 / 3)
    expect(dataPortGeometry(b, 'output', 0, 1, 80, 64)).toMatchObject({ side: 'left', dir: -1, endX: -6, y: 32 })
  })

  it('treats only the value true as flipped', () => {
    expect(isFlipped({ type: 'scale', parameters: { flipped: 'yes' } })).toBe(false)
    expect(isFlipped({ type: 'scale', parameters: null })).toBe(false)
  })

  it('gives the wire ends in sheet coordinates', () => {
    expect(wireEndAt(blk('a', 10, 20, true), { x: 10, y: 20 }, 'input', 0, 1, 80, 64)).toEqual({ x: 96, y: 52, dir: 1 })
  })
})

describe('defaultWirePath', () => {
  const r = (x: number, y: number) => ({ x, y, w: 80, h: 64 })

  it('keeps the three-segment step for ports that face each other', () => {
    expect(defaultWirePath({ x: 86, y: 32, dir: 1 }, { x: 294, y: 82, dir: -1 }, 10)).toEqual([
      { x: 86, y: 32 }, { x: 200, y: 32 }, { x: 200, y: 82 }, { x: 294, y: 82 },
    ])
    expect(wirePolyline({ x: 0, y: 0 }, { x: 100, y: 50 }, { midpointOffset: 10 })).toEqual([
      { x: 0, y: 0 }, { x: 60, y: 0 }, { x: 60, y: 50 }, { x: 100, y: 50 },
    ])
  })

  it('mirrors the step for two flipped blocks (target to the left)', () => {
    // Output of a flipped block at x = 300 faces left; input of a flipped block at x = 0 faces right
    expect(defaultWirePath({ x: 294, y: 32, dir: -1 }, { x: 86, y: 82, dir: 1 }, -4)).toEqual([
      { x: 294, y: 32 }, { x: 186, y: 32 }, { x: 186, y: 82 }, { x: 86, y: 82 },
    ])
  })

  it('turns past the outer port when both ports face right (plant output into a flipped sensor)', () => {
    const route = defaultWireRoute({ x: 386, y: 32, dir: 1 }, { x: 286, y: 232, dir: 1 }, 0, { source: r(300, 0), target: r(200, 200) })
    expect(route.shape).toBe('step')
    expect(route.points).toEqual([{ x: 386, y: 32 }, { x: 396, y: 32 }, { x: 396, y: 232 }, { x: 286, y: 232 }])
    // The offset moves the turn, as for the usual step
    expect(defaultWirePath({ x: 386, y: 32, dir: 1 }, { x: 286, y: 232, dir: 1 }, 30)[1].x).toBe(386 + WIRE_STUB + 30)
  })

  it('turns past the outer port when both ports face left (sensor output into a controller input)', () => {
    expect(defaultWirePath({ x: 194, y: 232, dir: -1 }, { x: -6, y: 32, dir: -1 })).toEqual([
      { x: 194, y: 232 }, { x: -16, y: 232 }, { x: -16, y: 32 }, { x: -6, y: 32 },
    ])
  })

  it('goes around when a same-side run would go through the other block', () => {
    // Target (flipped, input on the right) at the height of the source port, to the right of it
    const route = defaultWireRoute({ x: 86, y: 32, dir: 1 }, { x: 286, y: 40, dir: 1 }, 0, { source: r(0, 0), target: r(200, 8) })
    expect(route.shape).toBe('loop')
    expect(route.points).toHaveLength(6)
    expect(wireEndsFollowPorts(route.points, 1, 1)).toBe(true)
  })

  it('draws a backward wire without routing around its blocks, with a stub out of each port', () => {
    // From a block at x = 300 back to a block at x = 0, both at y = 0: below both blocks
    const pts = defaultWirePath({ x: 386, y: 32, dir: 1 }, { x: -6, y: 32, dir: -1 }, 0, { source: r(300, 0), target: r(0, 0) })
    expect(pts).toEqual([
      { x: 386, y: 32 }, { x: 396, y: 32 }, { x: 396, y: 84 }, { x: -16, y: 84 }, { x: -16, y: 32 }, { x: -6, y: 32 },
    ])
    // Between the blocks when one is above the other
    const between = defaultWirePath({ x: 386, y: 32, dir: 1 }, { x: -6, y: 232, dir: -1 }, 0, { source: r(300, 0), target: r(0, 200) })
    expect(between[2].y).toBe(132)
  })

  it('keeps the earlier shape of a backward wire with a stored offset (classic engine)', () => {
    expect(defaultWireRoute({ x: 386, y: 32, dir: 1 }, { x: -6, y: 82, dir: -1 }, -150).shape).toBe('step')
  })

  it('leaves and enters each port in the direction of the port for every side combination', () => {
    const dirs = [1, -1] as const
    for (const sd of dirs) for (const td of dirs) for (const tx of [-300, 0, 300]) for (const ty of [0, 5, 200, -200]) {
      const s = { x: 0, y: 0, dir: sd }
      const t = { x: tx, y: ty, dir: td }
      const pts = defaultWirePath(s, t, 0, { source: { x: sd > 0 ? -86 : 6, y: -32, w: 80, h: 64 }, target: { x: td > 0 ? tx - 86 : tx + 6, y: ty - 32, w: 80, h: 64 } })
      for (let i = 0; i + 1 < pts.length; i++) {
        expect(pts[i].x === pts[i + 1].x || pts[i].y === pts[i + 1].y).toBe(true)
      }
      expect(wireEndsFollowPorts(pts, sd, td)).toBe(true)
    }
  })

  it('gives the same path in the unused wireRoutingUtils helper', () => {
    const segs = generateStepPathSegments({ x: 386, y: 32 }, { x: 286, y: 232 }, undefined, 1, 1)
    expect(segs.map(s => s.end)).toEqual([{ x: 396, y: 32 }, { x: 396, y: 232 }, { x: 286, y: 232 }])
  })
})

describe('layout score with flipped blocks', () => {
  it('scores a wire into a flipped block from its right side', () => {
    // Plant p at (0, 0), sensor s (flipped) at (0, 200): the wire goes right, down, left
    const m = scoreSheetLayout([blk('p', 0, 0), blk('s', 0, 200, true)], [wire('w', 'p', 's')])
    expect(m).toMatchObject({ throughBlock: 0, throughOwnBlock: 0, portDirection: 0, bends: 2, wireLength: 10 + 200 + 10 })
  })

  it('counts a wire that runs back through its own block', () => {
    // A waypoint path that leaves the output to the left through the source
    // block, and enters the input from the right through the target block
    const m = scoreSheetLayout([blk('a', 300, 0), blk('b', 0, 200)], [wire('w', 'a', 'b', { waypoints: [{ x: 200, y: 32 }, { x: 200, y: 232 }] })])
    expect(m.portDirection).toBe(1)
    expect(m.throughOwnBlock).toBe(2)
  })

  it('does not count a flipped return path as backward', () => {
    // Two flipped blocks: the wire runs right to left, in the direction of its ports
    const m = scoreSheetLayout([blk('a', 300, 0, true), blk('b', 0, 0, true)], [wire('w', 'a', 'b')])
    expect(m).toMatchObject({ backward: 0, straight: 1, portDirection: 0 })
  })

  it('gives blockWireGeometry the port directions', () => {
    const g = blockWireGeometry(blk('s', 0, 200, true))
    expect(g.targetEnd(0)).toEqual({ x: 86, y: 232, dir: 1 })
    expect(g.sourceEnd(0)).toEqual({ x: -6, y: 232, dir: -1 })
  })
})

describe('flip in the editor store, with wire repair', () => {
  beforeEach(() => {
    useModelStore.getState().setBlocks([blk('a', 0, 0), blk('m', 200, 0), blk('c', 400, 0)])
    useModelStore.getState().setWires([
      wire('w1', 'a', 'c', { waypoints: [{ x: 150, y: 32 }, { x: 150, y: 120 }, { x: 350, y: 120 }, { x: 350, y: 32 }] }),
      wire('w2', 'a', 'm', { midpointOffset: 20 }),
      wire('w3', 'm', 'c'),
    ])
  })

  it('sets the flag, keeps the other parameters, and clears the routes of the flipped block', () => {
    useModelStore.getState().setBlocksFlipped(['a'], true)
    const { blocks, wires } = useModelStore.getState()
    expect(blocks.find(b => b.id === 'a')!.parameters).toEqual({ gain: 1, flipped: true })
    // The waypoints left the output to the right; the output is now on the left
    expect(wires.find(w => w.id === 'w1')!.routing).toBeUndefined()
    // The offset was for the old sides
    expect(wires.find(w => w.id === 'w2')!.routing).toBeUndefined()
    expect(wires.find(w => w.id === 'w3')).toBe(wires.find(w => w.id === 'w3'))
    const m = scoreSheetLayout(blocks, wires)
    expect(m).toMatchObject({ diagonalSegments: 0, portDirection: 0 })
  })

  it('removes the key when the block is unflipped, and does nothing when the flag does not change', () => {
    useModelStore.getState().setBlocksFlipped(['a'], true)
    useModelStore.getState().setBlocksFlipped(['a'], false)
    expect(useModelStore.getState().blocks.find(b => b.id === 'a')!.parameters).toEqual({ gain: 1 })
    const before = useModelStore.getState().blocks
    useModelStore.getState().setBlocksFlipped(['a'], false)
    expect(useModelStore.getState().blocks).toBe(before)
  })

  it('repairs or clears waypoints with repairWiresAfterBlockChange', () => {
    const before = [blk('a', 0, 0), blk('m', 200, 0), blk('c', 400, 0)]
    const after = before.map(b => (b.id === 'c' ? blk('c', 400, 0, true) : b))
    const w = wire('w', 'a', 'c', { waypoints: [{ x: 150, y: 32 }, { x: 150, y: 120 }, { x: 350, y: 120 }, { x: 350, y: 32 }] })
    expect(repairWiresAfterBlockChange([w], before, after)[0].routing).toBeUndefined()
  })
})

describe('satellites of flipped hosts', () => {
  it('keeps a satellite in the graph when its flip is not the flip of its host', () => {
    const blocks = [blk('h', 0, 0, true), blk('sink', 0, 0, false, 'sheet_label_sink', { signalName: 'x' })]
    const d = findSatellites(blocks, [wire('w', 'h', 'sink')])
    expect(d.satellites.size).toBe(0)
    expect(d.kept).toEqual([{ id: 'sink', reason: 'flip' }])
    const both = [blk('h', 0, 0, true), blk('sink', 0, 0, true, 'sheet_label_sink', { signalName: 'x' })]
    expect(findSatellites(both, [wire('w', 'h', 'sink')]).satellites.get('sink')).toMatchObject({ side: 'east' })
  })
})

describe('classic engine with a flipped block', () => {
  it('lays out and routes without an offset on the wires of the flipped block', () => {
    const blocks = [blk('in', 0, 0, false, 'input_port', { portName: 'u' }), blk('g', 0, 0), blk('f', 0, 0, true), blk('out', 0, 0, false, 'output_port', { portName: 'y' })]
    const wires = [wire('w1', 'in', 'g'), wire('w2', 'g', 'f'), wire('w3', 'f', 'out')]
    const layout = computeAutoLayout(blocks, wires)
    expect(layout.moves).toHaveLength(4)
    for (const id of ['w2', 'w3']) expect(layout.routes.find(r => r.id === id)!.midpointOffset).toBeUndefined()
    const placed = blocks.map(b => ({ ...b, position: layout.moves.find(m => m.id === b.id)!.position }))
    const m = scoreSheetLayout(placed, wires)
    expect(m).toMatchObject({ wires: 3, diagonalSegments: 0, portDirection: 0 })
  })

  it('keeps the flags in tuneModelLayout', async () => {
    const sheet = { id: 'main', name: 'Main', blocks: [blk('g', 0, 0), blk('f', 300, 0, true)], connections: [wire('w', 'g', 'f')], extents: { width: 1, height: 1 } }
    const { sheets, summary } = await tuneModelLayout([sheet], 'main', { ...DEFAULT_TUNE_OPTIONS, engine: 'classic' })
    expect(sheets[0].blocks.find(b => b.id === 'f')!.parameters?.flipped).toBe(true)
    expect(summary.blocksFlipped).toBe(0)
  })
})

describe('PDF export of flipped blocks', () => {
  const ctx = { modelName: 'M', printedAt: new Date('2026-01-15T10:30:00Z') }
  const opts = { ...DEFAULT_PDF_OPTIONS, fileName: 'f.pdf', scaling: '100' as const }

  /** The horizontal line segments (stroked "m ... l") of the first page. */
  async function horizontalLines(blocks: BlockData[], wires: WireData[] = []) {
    const bytes = await renderModelToPdf(buildFullPlan([{ id: 'm', name: 'M', blocks, connections: wires }]), opts, ctx)
    const doc = await PDFDocument.load(bytes)
    const contents = doc.getPages()[0].node.Contents()!
    const streams = contents instanceof PDFArray ? contents.asArray().map(r => doc.context.lookup(r)) : [contents]
    let text = ''
    for (const s of streams) text += Buffer.from(decodePDFRawStream(s as PDFRawStream).decode()).toString('latin1')
    const out: Array<{ x1: number; x2: number; y: number }> = []
    const re = /(-?[\d.]+) (-?[\d.]+) m\s+(-?[\d.]+) (-?[\d.]+) l/g
    let mm: RegExpExecArray | null
    while ((mm = re.exec(text))) {
      const [x1, y1, x2, y2] = mm.slice(1).map(Number)
      if (Math.abs(y1 - y2) < 0.01) out.push({ x1: Math.min(x1, x2), x2: Math.max(x1, x2), y: y1 })
    }
    return out
  }

  it('draws the port stubs on the swapped sides', async () => {
    const stubs = (lines: Array<{ x1: number; x2: number; y: number }>) => lines.filter(l => Math.abs(l.x2 - l.x1 - 6) < 0.01)
    const sum = (flipped: boolean) => blk('s', 0, 0, flipped, 'sum', { signs: '++' })
    const plain = stubs(await horizontalLines([sum(false)]))
    const mirrored = stubs(await horizontalLines([sum(true)]))
    expect(plain).toHaveLength(3)
    expect(mirrored).toHaveLength(3)
    // Not flipped: the two input stubs are left of the output stub. Flipped: right of it.
    const out = (ls: typeof plain) => ls.find(l => ls.filter(k => Math.abs(k.x1 - l.x1) < 0.01).length === 1)!
    const ins = (ls: typeof plain) => ls.filter(l => l !== out(ls))
    for (const l of ins(plain)) expect(l.x2).toBeLessThan(out(plain).x1)
    for (const l of ins(mirrored)) expect(l.x1).toBeGreaterThan(out(mirrored).x2)
    // The block occupies the same place: the stubs are mirror images about its centre
    const centre = (ls: typeof plain) => (Math.min(...ls.map(l => l.x1)) + Math.max(...ls.map(l => l.x2))) / 2
    expect(centre(mirrored)).toBeCloseTo(centre(plain), 3)
  })

  it('draws a wire into a flipped block from the right, as the score does', async () => {
    const blocks = [blk('p', 0, 0), blk('s', 0, 200, true)]
    const w = wire('w', 'p', 's')
    const metrics = new Map(blocks.map(b => [b.id, { width: 80, height: 64, inputs: 1, outputs: 1 }]))
    // From the block edges; the stubs cover the last HANDLE_OUTSET px
    expect(wirePoints(w, blocks[0], blocks[1], metrics)).toEqual([
      { x: 80, y: 32 }, { x: 96, y: 32 }, { x: 96, y: 232 }, { x: 80, y: 232 },
    ])
    const score = wirePolyline(blockWireGeometry(blocks[0]).sourceEnd(0), blockWireGeometry(blocks[1]).targetEnd(0), undefined)
    expect(score.slice(1, -1)).toEqual([{ x: 96, y: 32 }, { x: 96, y: 232 }])
    const lines = await horizontalLines(blocks, [w])
    expect(lines.length).toBeGreaterThan(0)
  })

  it('keeps a wire outside the blocks inside the page (the bounds include wires)', async () => {
    // A backward wire below both blocks
    const blocks = [blk('a', 300, 0), blk('b', 0, 0)]
    const bytes = await renderModelToPdf(buildFullPlan([{ id: 'm', name: 'M', blocks, connections: [wire('w', 'a', 'b')] }]), { ...opts, scaling: 'fit' }, ctx)
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(1)
  })
})

describe('the flipped parameter in the Model Builder validator', () => {
  it('accepts a boolean on blocks with ports and rejects other values', () => {
    expect(validateBlockParameters('scale', { gain: 2, flipped: true }).sanitizedParameters).toMatchObject({ flipped: true })
    expect(validateBlockParameters('subsystem', { inputPorts: ['a'], outputPorts: ['b'], flipped: false }).sanitizedParameters).toMatchObject({ flipped: false })
    expect(validateBlockParameters('scale', { gain: 2, flipped: 'yes' }).valid).toBe(false)
    expect(validateBlockParameters('comment', { text: 'x', flipped: true }).valid).toBe(false)
    expect('flipped' in validateBlockParameters('scale', { gain: 2, flipped: null }).sanitizedParameters!).toBe(true)
  })
})

describe('block dialog saves', () => {
  it('keep the canvas parameters that the dialog does not show', () => {
    // ScaleConfig saves { gain } only
    expect(mergeDialogParameters('scale', { gain: 1, flipped: true, showName: false }, { gain: 3 }))
      .toEqual({ gain: 3, flipped: true, showName: false })
    // A subsystem also keeps its size and its own sample time
    expect(mergeDialogParameters('subsystem', { width: 300, height: 200, sampleTimeSec: 0.002, flipped: true, inputPorts: ['a'] }, { inputPorts: ['b'] }))
      .toEqual({ inputPorts: ['b'], width: 300, height: 200, sampleTimeSec: 0.002, flipped: true })
    // A key that the dialog writes is the dialog's choice
    expect(mergeDialogParameters('scale', { showName: false }, { showName: true })).toEqual({ showName: true })
    // width and height of other block types are the dialog's (Comment has its own size fields)
    expect(mergeDialogParameters('comment', { width: 100, height: 50 }, { text: 'x' })).toEqual({ text: 'x' })
  })

  it('merge the subsystem dialog save into the existing parameters', () => {
    const previous = { sheets: [], inputPorts: ['a'], outputPorts: ['y'], width: 320, height: 240, showName: false, sampleTimeSec: 0.01, flipped: true }
    expect(withPreviousParameters(previous, { inputPorts: ['a', 'b'], subsystemFunction: undefined })).toEqual({
      ...previous, inputPorts: ['a', 'b'], subsystemFunction: undefined,
    })
  })
})
