// Layout score (src/lib/layout/layoutMetrics.ts).
//
// The unit tests use small sheets with values worked out by hand from the
// block geometry: a `scale` block is 80 x 64 px with one port at mid-height,
// so its output is at (x + 86, y + 32) and its input at (x - 6, y + 32).
//
// The regression test lays out the FPV vehicle reference model with each
// engine (classic and ELK) and compares the hard metrics of each sheet with
// layout-metrics.golden.json, one entry for each engine. To refresh
// the golden file after a layout change that improves the score, run:
//   UPDATE_LAYOUT_GOLDEN=1 npx jest __tests__/layout-metrics.test.ts

import * as fs from 'fs'
import * as path from 'path'
import { scoreSheetLayout, scoreSheetTree, HARD_METRICS, wirePolyline, microJogsOf } from '@/lib/layout/layoutMetrics'
import { tuneModelLayout, DEFAULT_TUNE_OPTIONS } from '@/lib/layout/tuneModelLayout'
import type { BlockData } from '@/components/BlockNode'
import type { WireData } from '@/components/Wire'

const blk = (id: string, x: number, y: number, type = 'scale', parameters: Record<string, any> = { gain: 1 }): BlockData =>
  ({ id, type, name: id, position: { x, y }, parameters })
const wire = (id: string, s: string, t: string, routing?: WireData['routing'], sp = 0, tp = 0): WireData =>
  ({ id, sourceBlockId: s, sourcePortIndex: sp, targetBlockId: t, targetPortIndex: tp, routing })

describe('wirePolyline', () => {
  it('turns at the midpoint plus the stored offset', async () => {
    expect(wirePolyline({ x: 0, y: 0 }, { x: 100, y: 50 }, { midpointOffset: 10 })).toEqual([
      { x: 0, y: 0 }, { x: 60, y: 0 }, { x: 60, y: 50 }, { x: 100, y: 50 },
    ])
  })

  it('uses the waypoints and ignores the offset when waypoints are present', async () => {
    expect(wirePolyline({ x: 0, y: 0 }, { x: 100, y: 50 }, { midpointOffset: 10, waypoints: [{ x: 30, y: 0 }, { x: 30, y: 50 }] }))
      .toEqual([{ x: 0, y: 0 }, { x: 30, y: 0 }, { x: 30, y: 50 }, { x: 100, y: 50 }])
  })
})

describe('scoreSheetLayout', () => {
  it('scores a straight wire', async () => {
    const m = scoreSheetLayout([blk('a', 0, 0), blk('b', 200, 0)], [wire('w', 'a', 'b')])
    expect(m).toMatchObject({
      wires: 1, nets: 1, straight: 1, bends: 0, crossings: 0, overlaps: 0, throughBlock: 0,
      backward: 0, wireLength: 108, width: 280, height: 64,
    })
  })

  it('counts a crossing between two nets', async () => {
    // Net 1 is straight at y = 132. Net 2 goes down at x = 190 from y = 32 to y = 232.
    const blocks = [blk('a1', 0, 100), blk('b1', 300, 100), blk('a2', 0, 0), blk('b2', 300, 200)]
    const m = scoreSheetLayout(blocks, [wire('w1', 'a1', 'b1'), wire('w2', 'a2', 'b2')])
    expect(m).toMatchObject({ crossings: 1, overlaps: 0, throughBlock: 0, straight: 1, bends: 2 })
  })

  it('counts an overlap between collinear segments of two nets', async () => {
    // Both wires turn at x = 190: y 32..232 and y 132..332 share 100 px.
    const blocks = [blk('a1', 0, 0), blk('b1', 300, 200), blk('a2', 0, 100), blk('b2', 300, 300)]
    const m = scoreSheetLayout(blocks, [wire('w1', 'a1', 'b1'), wire('w2', 'a2', 'b2')])
    expect(m).toMatchObject({ overlaps: 1, overlapLength: 100, crossings: 0 })
  })

  it('moves the turn with midpointOffset, which removes the overlap', async () => {
    const blocks = [blk('a1', 0, 0), blk('b1', 300, 200), blk('a2', 0, 100), blk('b2', 300, 300)]
    const m = scoreSheetLayout(blocks, [wire('w1', 'a1', 'b1', { midpointOffset: -20 }), wire('w2', 'a2', 'b2')])
    expect(m.overlaps).toBe(0)
    // Net 2's run at y = 132 crosses net 1's turn at x = 170, and net 1's run
    // at y = 232 crosses net 2's turn at x = 190
    expect(m.crossings).toBe(2)
  })

  it('does not count segments of one net against each other', async () => {
    // One output feeds two blocks: the two wires share their first run and turn.
    const blocks = [blk('a', 0, 0), blk('b1', 300, 200), blk('b2', 300, 300)]
    const m = scoreSheetLayout(blocks, [wire('w1', 'a', 'b1'), wire('w2', 'a', 'b2')])
    expect(m).toMatchObject({ nets: 1, overlaps: 0, crossings: 0 })
    // The shared run and turn are drawn once
    expect(m.inkLength).toBeLessThan(m.wireLength)
  })

  it('counts a wire through a block', async () => {
    const blocks = [blk('a', 0, 0), blk('m', 200, 0), blk('c', 400, 0)]
    const m = scoreSheetLayout(blocks, [wire('w', 'a', 'c')])
    expect(m).toMatchObject({ throughBlock: 1, throughOwnBlock: 0, straight: 1 })
  })

  it('counts a net through a block once, however many of its wires pass it', async () => {
    const blocks = [blk('a', 0, 0), blk('m', 200, 0), blk('c', 400, 0), blk('d', 400, 100)]
    const m = scoreSheetLayout(blocks, [wire('w1', 'a', 'c'), wire('w2', 'a', 'd', { midpointOffset: 50 })])
    expect(m.throughBlock).toBe(1)
  })

  it('ignores comment blocks', async () => {
    const blocks = [blk('a', 0, 0), blk('note', 200, 0, 'comment', { text: 'x' }), blk('c', 400, 0)]
    const m = scoreSheetLayout(blocks, [wire('w', 'a', 'c')])
    expect(m).toMatchObject({ blocks: 2, throughBlock: 0 })
  })

  it('scores a wire with waypoints as the polyline the editor draws', async () => {
    // Around the middle block: right, down, right, up, right
    const blocks = [blk('a', 0, 0), blk('m', 200, 0), blk('c', 400, 0)]
    const waypoints = [{ x: 150, y: 32 }, { x: 150, y: 120 }, { x: 350, y: 120 }, { x: 350, y: 32 }]
    const m = scoreSheetLayout(blocks, [wire('w', 'a', 'c', { waypoints, midpointOffset: 50 })])
    expect(m).toMatchObject({ throughBlock: 0, bends: 4, straight: 0, diagonalSegments: 0, wireLength: 64 + 88 + 200 + 88 + 44 })
    // The waypoints are outside the blocks, so they extend the sheet
    expect(m.height).toBe(120)
  })

  it('measures a waypoint path that is not orthogonal as drawn', async () => {
    // The editor joins waypoints with straight lines: (150, 32) -> (294, 232) is diagonal
    const m = scoreSheetLayout([blk('a', 0, 0), blk('b', 300, 200)], [wire('w', 'a', 'b', { waypoints: [{ x: 150, y: 32 }] })])
    expect(m).toMatchObject({ diagonalSegments: 1, bends: 1 })
    expect(m.wireLength).toBe(Math.round(64 + Math.hypot(144, 200)))
  })

  it('counts a diagonal crossing', async () => {
    const blocks = [blk('a1', 0, 100), blk('b1', 300, 100), blk('a2', 0, 0), blk('b2', 300, 200)]
    const m = scoreSheetLayout(blocks, [
      wire('w1', 'a1', 'b1'),
      wire('w2', 'a2', 'b2', { waypoints: [{ x: 150, y: 32 }, { x: 250, y: 232 }] }),
    ])
    expect(m.crossings).toBe(1)
  })

  it('scores a backward wire without routing as the path around the blocks', async () => {
    // From the right block back to the left block. The default path leaves
    // the output to the right, goes below both blocks (y = 64 + 20) and
    // comes into the input from the left: 10 + 52 + 412 + 52 + 10 px.
    const m = scoreSheetLayout([blk('a', 300, 0), blk('b', 0, 0)], [wire('w', 'a', 'b')])
    expect(m).toMatchObject({
      backward: 1, backwardLength: 536, straight: 0, bends: 4, throughBlock: 0, throughOwnBlock: 0, portDirection: 0,
    })
  })

  it('keeps the earlier shape of a backward wire with a turn offset, and counts the blocks it runs through', async () => {
    // A stored offset (the classic engine writes one): three segments that
    // turn at x = 190 + 10, straight back along y = 32 through both blocks
    const m = scoreSheetLayout([blk('a', 300, 0), blk('b', 0, 0)], [wire('w', 'a', 'b', { midpointOffset: 10 })])
    expect(m).toMatchObject({ backward: 1, backwardLength: 392, straight: 1, throughBlock: 0, throughOwnBlock: 2, portDirection: 1 })
  })

  it('keeps enable and reset wires out of the routed metrics', async () => {
    const blocks = [blk('a', 0, 0), blk('m', 200, 0), blk('c', 400, 0)]
    const m = scoreSheetLayout(blocks, [wire('w', 'a', 'c', undefined, 0, -1)])
    expect(m).toMatchObject({ wires: 0, controlWires: 1, throughBlock: 0, wireLength: 0 })
  })

  it('counts a sub-pixel step between two port rows as a micro jog', async () => {
    // The ports are 0.5 px apart: the default path turns twice, 0.5 px apart
    const m = scoreSheetLayout([blk('a', 0, 0), blk('b', 200, 0.5)], [wire('w', 'a', 'b')])
    expect(m).toMatchObject({ microJogs: 1, straight: 1 })
    expect(scoreSheetLayout([blk('a', 0, 0), blk('b', 200, 0)], [wire('w', 'a', 'b')]).microJogs).toBe(0)
    // A step of 30 px is not a micro jog
    expect(scoreSheetLayout([blk('a', 0, 0), blk('b', 200, 30)], [wire('w', 'a', 'b')]).microJogs).toBe(0)
  })

  it('does not count a step that the port pitches force', async () => {
    // A two-input evaluate (64 px: inputs at 21.33 and 42.67) fed by a
    // three-output demux (80 px: outputs at 20, 40, 60), first ports aligned:
    // the second wire must step 1.33 px, whatever the positions are
    const demux = blk('d', 0, 1.3333333333333357, 'demux', { outputCount: 3 })
    const ev = blk('e', 200, 0, 'evaluate', { numInputs: 2, expression: 'in(0) + in(1)' })
    const ws = [wire('w0', 'd', 'e', undefined, 0, 0), wire('w1', 'd', 'e', undefined, 1, 1)]
    expect(scoreSheetLayout([demux, ev], ws).microJogs).toBe(0)
    // The same step without the straight sibling wire is counted
    expect(scoreSheetLayout([demux, ev], [ws[1]]).microJogs).toBe(1)
  })

  it('counts wires to a block that is not on the sheet', async () => {
    const m = scoreSheetLayout([blk('a', 0, 0)], [wire('w', 'a', 'gone')])
    expect(m).toMatchObject({ wires: 0, unresolvedWires: 1 })
  })
})

describe('microJogsOf', () => {
  it('counts short segments with a bend at an end, on the exact polyline', () => {
    // Two bends 1 px apart
    expect(microJogsOf([{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 50, y: 1 }, { x: 100, y: 1 }])).toBe(1)
    // A bend 1.5 px from the wire end
    expect(microJogsOf([{ x: 0, y: 0 }, { x: 1.5, y: 0 }, { x: 1.5, y: 40 }, { x: 100, y: 40 }])).toBe(1)
    // Bends 2 px apart or more, a straight wire, a short wire with no bend
    expect(microJogsOf([{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 50, y: 2 }, { x: 100, y: 2 }])).toBe(0)
    expect(microJogsOf([{ x: 0, y: 0 }, { x: 100, y: 0 }])).toBe(0)
    expect(microJogsOf([{ x: 0, y: 0 }, { x: 1, y: 0 }])).toBe(0)
    // A repeated point and a point in the middle of a straight run are not bends
    expect(microJogsOf([{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 50, y: 0 }, { x: 51, y: 0 }, { x: 100, y: 0 }])).toBe(0)
  })
})

describe('scoreSheetTree', () => {
  it('scores nested sheets with their paths', async () => {
    const inner = { id: 'inner', name: 'Inner', blocks: [blk('x', 0, 0), blk('y', 200, 0)], connections: [wire('iw', 'x', 'y')] }
    const top = {
      id: 'main', name: 'Main',
      blocks: [blk('sub', 0, 0, 'subsystem', { inputPorts: [], outputPorts: [], sheets: [inner] })],
      connections: [],
    }
    const scores = scoreSheetTree([top])
    expect(scores.map(s => s.path.join('/'))).toEqual(['Main', 'Main/sub/Inner'])
    expect(scores[1].metrics.straight).toBe(1)
  })
})

// One golden entry for each engine: `fpv-vehicle` (classic) and `fpv-vehicle:elk`
describe.each([
  { engine: 'classic' as const, key: 'fpv-vehicle' },
  { engine: 'elk' as const, key: 'fpv-vehicle:elk' },
])('layout score of the reference models ($engine engine)', ({ engine, key }) => {
  const goldenPath = path.join(__dirname, 'layout-metrics.golden.json')
  const modelPath = path.join(__dirname, '..', 'reference-models', 'fpv-vehicle.json')

  it('does not make a hard metric worse on the FPV vehicle', async () => {
    const raw = JSON.parse(fs.readFileSync(modelPath, 'utf8'))
    const sheets = (raw.data ?? raw).sheets
    const result = await tuneModelLayout(sheets, null, { ...DEFAULT_TUNE_OPTIONS, scope: 'model', engine })
    const scores = scoreSheetTree(result.sheets)

    const current: Record<string, Record<string, number>> = {}
    for (const s of scores) {
      const entry: Record<string, number> = { wires: s.metrics.wires }
      for (const k of HARD_METRICS) entry[k] = s.metrics[k]
      current[s.path.join('/')] = entry
    }

    if (process.env.UPDATE_LAYOUT_GOLDEN) {
      const golden = JSON.parse(fs.existsSync(goldenPath) ? fs.readFileSync(goldenPath, 'utf8') : '{}')
      golden[key] = current
      fs.writeFileSync(goldenPath, JSON.stringify(golden, null, 2) + '\n')
      return
    }

    const golden = JSON.parse(fs.readFileSync(goldenPath, 'utf8'))[key] as typeof current
    expect(Object.keys(current).sort()).toEqual(Object.keys(golden).sort())

    const worse: string[] = []
    const better: string[] = []
    for (const [sheet, want] of Object.entries(golden)) {
      const got = current[sheet]
      // A different wire count means that the model changed, not the layout
      expect({ sheet, wires: got.wires }).toEqual({ sheet, wires: want.wires })
      for (const k of HARD_METRICS) {
        if (got[k] > want[k]) worse.push(`${sheet}: ${k} ${want[k]} -> ${got[k]}`)
        if (got[k] < want[k]) better.push(`${sheet}: ${k} ${want[k]} -> ${got[k]}`)
      }
    }
    if (better.length > 0) {
      console.log(
        `The ${engine} layout score is better than layout-metrics.golden.json:\n  ` + better.join('\n  ') +
        '\nRefresh the golden file: UPDATE_LAYOUT_GOLDEN=1 npx jest __tests__/layout-metrics.test.ts',
      )
    }
    expect(worse).toEqual([])
  })
})
