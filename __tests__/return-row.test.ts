// The mirrored return row of the ELK layout (src/lib/layout/returnRow.ts,
// `mirrorReturnPath`), Phase 4 of docs/layout-improvement-plan-pass-2.md.

import * as fs from 'fs'
import * as path from 'path'
import { tuneModelLayout, DEFAULT_TUNE_OPTIONS, type TuneLayoutOptions } from '@/lib/layout/tuneModelLayout'
import { computeElkLayout, applyToSheet, mirroredReturnPath } from '@/lib/layout/elkLayout'
import { scoreSheetLayout, scoreSheetTree, blockWireGeometry, wirePolyline, wireEndsFollowPorts } from '@/lib/layout/layoutMetrics'
import { buildFullPlan } from '@/lib/export/sheetTree'
import type { BlockData } from '@/components/BlockNode'
import type { WireData } from '@/components/Wire'
import type { Sheet } from '@/lib/modelStore'

const blk = (id: string, type = 'scale', parameters: Record<string, any> = { gain: 1 }): BlockData =>
  ({ id, type, name: id, position: { x: 0, y: 0 }, parameters })
const sub = (id: string, fn: string, inputs: string[], outputs: string[]): BlockData =>
  blk(id, 'subsystem', { inputPorts: inputs, outputPorts: outputs, subsystemFunction: fn, sheets: [{ id: `${id}_s`, name: id, blocks: [], connections: [] }] })
const wire = (id: string, s: string, t: string, sp = 0, tp = 0): WireData =>
  ({ id, sourceBlockId: s, sourcePortIndex: sp, targetBlockId: t, targetPortIndex: tp })
const sheetOf = (blocks: BlockData[], connections: WireData[]): Sheet =>
  ({ id: 'main', name: 'Main', blocks, connections, extents: { width: 1000, height: 800 } })
const ELK: TuneLayoutOptions = { ...DEFAULT_TUNE_OPTIONS, scope: 'model', engine: 'elk' }

/**
 * reference -> controller -> actuator -> plant -> output, with the plant
 * output measured by a sensor, scaled by a gain, back into the controller.
 * The sensor output also goes to a Sheet Label Sink.
 */
function loop() {
  const blocks = [
    blk('ref', 'input_port', { portName: 'ref' }),
    sub('c', 'controller', ['ref', 'meas'], ['u']),
    sub('a', 'actuator', ['u'], ['f']),
    sub('p', 'plant', ['f'], ['x']),
    sub('s', 'sensor', ['x'], ['y']),
    blk('k', 'scale', { gain: 2 }),
    blk('tag', 'sheet_label_sink', { signalName: 'meas_y' }),
    blk('out', 'output_port', { portName: 'x' }),
  ]
  const wires = [
    wire('w_ref', 'ref', 'c', 0, 0),
    wire('w_u', 'c', 'a'),
    wire('w_f', 'a', 'p'),
    wire('w_x', 'p', 's'),
    wire('w_out', 'p', 'out'),
    wire('w_y', 's', 'k'),
    wire('w_tag', 's', 'tag'),
    wire('w_fb', 'k', 'c', 0, 1),
  ]
  return { blocks, wires }
}

const rect = (b: BlockData) => blockWireGeometry(b).rect

describe('return row on a controller, actuator, plant, sensor loop', () => {
  let laid: Sheet
  let summary: Awaited<ReturnType<typeof tuneModelLayout>>['summary']

  beforeAll(async () => {
    const { blocks, wires } = loop()
    const r = await tuneModelLayout([sheetOf(blocks, wires)], 'main', ELK)
    laid = r.sheets[0]
    summary = r.summary
  })
  const at = (id: string) => laid.blocks.find(b => b.id === id)!

  it('flips the return path (sensor and gain) and its satellite, and no other block', () => {
    const flipped = laid.blocks.filter(b => b.parameters?.flipped === true).map(b => b.id).sort()
    expect(flipped).toEqual(['k', 's', 'tag'])
    expect(summary.blocksFlipped).toBe(3)
  })

  it('reads controller, actuator, plant from left to right on the forward row', () => {
    expect(rect(at('c')).x).toBeLessThan(rect(at('a')).x)
    expect(rect(at('a')).x).toBeLessThan(rect(at('p')).x)
  })

  it('puts the return path below the forward path, between the controller and the plant, right to left', () => {
    const forwardBottom = Math.max(...['ref', 'c', 'a', 'p', 'out'].map(id => rect(at(id)).y + rect(at(id)).h))
    for (const id of ['s', 'k', 'tag']) expect(rect(at(id)).y).toBeGreaterThan(forwardBottom)
    // The centre of the row is between the left edge of the controller and the right edge of the plant
    const row = ['s', 'k', 'tag'].map(id => rect(at(id)))
    const centre = (Math.min(...row.map(r => r.x)) + Math.max(...row.map(r => r.x + r.w))) / 2
    expect(centre).toBeGreaterThan(rect(at('c')).x)
    expect(centre).toBeLessThan(rect(at('p')).x + rect(at('p')).w)
    // The sensor feeds the gain to its left
    expect(rect(at('k')).x).toBeLessThan(rect(at('s')).x)
  })

  it('has no hard fault, and each wire leaves and enters its ports in their directions', () => {
    const m = scoreSheetLayout(laid.blocks, laid.connections)
    expect(m).toMatchObject({ throughBlock: 0, overlaps: 0, blockOverlaps: 0, diagonalSegments: 0, portDirection: 0 })
    const byId = new Map(laid.blocks.map(b => [b.id, b]))
    for (const w of laid.connections) {
      const sg = blockWireGeometry(byId.get(w.sourceBlockId)!), tg = blockWireGeometry(byId.get(w.targetBlockId)!)
      const s = sg.sourceEnd(w.sourcePortIndex), t = tg.targetEnd(w.targetPortIndex)
      const pts = wirePolyline(s, t, w.routing, { source: sg.rect, target: tg.rect })
      expect(wireEndsFollowPorts(pts, s.dir, t.dir)).toBe(true)
    }
    // The plant output comes into the right side of the sensor; the gain output leaves from its left side
    expect(blockWireGeometry(at('s')).targetEnd(0).dir).toBe(1)
    expect(blockWireGeometry(at('k')).sourceEnd(0).dir).toBe(-1)
  })

  it('is idempotent', async () => {
    const again = await tuneModelLayout([laid], 'main', ELK)
    expect(again.summary).toMatchObject({ blocksMoved: 0, wiresRouted: 0, blocksFlipped: 0, sheetsAffected: 0 })
  })

  it('does not depend on the stored flags', async () => {
    // A block flipped by hand on the forward path is unflipped by the layout
    const handFlipped = { ...laid, blocks: laid.blocks.map(b => (b.id === 'a' ? { ...b, parameters: { ...b.parameters, flipped: true } } : b)) }
    const r = await tuneModelLayout([handFlipped], 'main', ELK)
    expect(r.summary.blocksFlipped).toBe(1)
    expect(r.sheets[0].blocks.find(b => b.id === 'a')!.parameters?.flipped).toBeUndefined()
    expect(r.sheets[0].blocks.map(b => b.position)).toEqual(laid.blocks.map(b => b.position))
  })
})

describe('mirrorReturnPath off', () => {
  it('lays out as before (the sensor right of the plant) and keeps the stored flags', async () => {
    const { blocks, wires } = loop()
    const r = await tuneModelLayout([sheetOf(blocks, wires)], 'main', { ...ELK, mirrorReturnPath: false })
    const s = r.sheets[0]
    expect(s.blocks.some(b => b.parameters?.flipped)).toBe(false)
    const x = (id: string) => s.blocks.find(b => b.id === id)!.position.x
    expect(x('p')).toBeLessThan(x('s'))
    expect(r.summary.blocksFlipped).toBe(0)
  })

  it('draws a block that the user flipped with its ports on the swapped sides, with no hard fault', async () => {
    // in -> g1 -> f (flipped) -> g2 -> out
    const blocks = [
      blk('in', 'input_port', { portName: 'u' }), blk('g1'), blk('f', 'scale', { gain: 3, flipped: true }), blk('g2'),
      blk('out', 'output_port', { portName: 'y' }),
    ]
    const wires = [wire('w1', 'in', 'g1'), wire('w2', 'g1', 'f'), wire('w3', 'f', 'g2'), wire('w4', 'g2', 'out')]
    const layout = await computeElkLayout(blocks, wires)
    expect(layout.flips).toBeUndefined()
    const [placed, routed] = applyToSheet(blocks, wires, layout)
    expect(scoreSheetLayout(placed, routed)).toMatchObject({ throughBlock: 0, overlaps: 0, blockOverlaps: 0, diagonalSegments: 0, portDirection: 0 })
    expect(placed.find(b => b.id === 'f')!.parameters?.flipped).toBe(true)
  })
})

describe('mirroredReturnPath', () => {
  it('mirrors only the return path that a plant feeds', () => {
    const roles = new Map([['p', 'plant'], ['s', 'sensor'], ['e', 'compensator']] as const)
    const wires = [wire('1', 'p', 's'), wire('2', 's', 'k'), wire('3', 'x', 'e')]
    expect([...mirroredReturnPath(new Set(['s', 'k', 'e']), wires, roles)].sort()).toEqual(['k', 's'])
  })
})

describe('return row on the FPV vehicle', () => {
  // The shipped file has the mirrored layout (Sensors flipped). Without the
  // mirror, the layout keeps the stored flags, so start from unflipped blocks.
  const raw = JSON.parse(
    fs.readFileSync(path.join(__dirname, '..', 'reference-models', 'fpv-vehicle.json'), 'utf8'),
    (key, value) => (key === 'flipped' ? undefined : value),
  )
  const sheets: Sheet[] = (raw.data ?? raw).sheets
  let tuned: Sheet[]
  let flat: Sheet[]

  beforeAll(async () => {
    tuned = (await tuneModelLayout(sheets, null, ELK)).sheets
    flat = (await tuneModelLayout(sheets, null, { ...ELK, mirrorReturnPath: false })).sheets
    // Two layouts of the whole vehicle: about 12 s alone, more in a full run
  }, 120000)

  it('puts Sensors, flipped, below the forward path of Main', () => {
    const main = buildFullPlan(tuned).sheets.find(s => s.path.join('/') === 'Main')!
    const at = (name: string) => main.blocks.find(b => b.name === name)!
    const x = (name: string) => at(name).position.x
    for (const m of ['Motor_RR', 'Motor_FR', 'Motor_RL', 'Motor_FL']) {
      expect(x('FlightController')).toBeLessThan(x(m))
      expect(x(m)).toBeLessThan(x('Frame'))
    }
    expect(at('Sensors').parameters?.flipped).toBe(true)
    for (const name of ['FlightController', 'Frame', 'Battery', 'Motor_RR']) {
      expect(rect(at('Sensors')).y).toBeGreaterThan(rect(at(name)).y + rect(at(name)).h)
      expect(at(name).parameters?.flipped).toBeUndefined()
    }
    // Between the controller and the plant
    expect(x('Sensors')).toBeGreaterThan(x('FlightController'))
    expect(x('Sensors')).toBeLessThan(x('Frame') + rect(at('Frame')).w)
    // Its Output Ports (beside its outputs) and the gnss_env Input Port are on the row too, flipped
    const flipped = main.blocks.filter(b => b.parameters?.flipped)
    expect(flipped.map(b => b.name)).toContain('gnss_env')
    expect(flipped.filter(b => b.type === 'output_port').map(b => b.name).sort()).toEqual(
      ['gnss_course', 'gnss_fix', 'gnss_pos', 'gnss_vel_ned', 'imu_accel', 'imu_gyro', 'mag', 'pressure'])
  })

  it('has no hard fault on any sheet and flips nothing on the inner sheets', () => {
    for (const s of scoreSheetTree(tuned)) {
      expect({ sheet: s.path.join('/'), ...s.metrics }).toMatchObject({
        sheet: s.path.join('/'), throughBlock: 0, overlaps: 0, blockOverlaps: 0, diagonalSegments: 0, portDirection: 0,
      })
    }
    const inner = buildFullPlan(tuned).sheets.filter(s => s.path.join('/') !== 'Main')
    expect(inner.flatMap(s => s.blocks).filter(b => b.parameters?.flipped)).toEqual([])
  })

  it('makes Main shorter in wire length and crossings than without the mirror', () => {
    const score = (sh: Sheet[]) => scoreSheetTree(sh).find(s => s.path.join('/') === 'Main')!.metrics
    expect(score(tuned).wireLength).toBeLessThan(score(flat).wireLength)
    expect(score(tuned).crossings).toBeLessThan(score(flat).crossings)
  })

  it('gives the known result with the option off', () => {
    // Phase 3 gave Main 86 crossings, 3226 × 1821 px, and 3540 crossings in
    // total (3546 after the micro-jog fix of Phase 6). Release 3.8.1 removed
    // the Telemetry sheet and put the Output Ports on Main, beside their hosts.
    const main = scoreSheetTree(flat).find(s => s.path.join('/') === 'Main')!.metrics
    expect(main).toMatchObject({ crossings: 88, width: 3568, height: 1739 })
    const total = scoreSheetTree(flat).reduce((n, s) => n + s.metrics.crossings, 0)
    expect(total).toBe(3261)
    expect(buildFullPlan(flat).sheets.flatMap(s => s.blocks).some(b => b.parameters?.flipped)).toBe(false)
  })
})
