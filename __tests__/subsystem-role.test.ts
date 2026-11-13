// Subsystem function and the role-driven signal-flow order (Phase 3 of
// docs/layout-improvement-plan-pass-2.md): src/lib/layout/subsystemRole.ts,
// signalFlowAnalysis() in autoLayout.ts, and the minimum subsystem height and
// the port-name clearance of the ELK engine.

import * as fs from 'fs'
import * as path from 'path'
import {
  suggestFromContent, sheetSubsystemRoles, effectiveSheetRoles, modelBlockLookup, nameWords,
  ROLE_CONFIDENCE_THRESHOLD,
} from '@/lib/layout/subsystemRole'
import { signalFlowAnalysis, signalFlowOrder } from '@/lib/layout/autoLayout'
import { buildElkGraph, computeElkLayout } from '@/lib/layout/elkLayout'
import { tuneModelLayout, minimumHeightResizes, DEFAULT_TUNE_OPTIONS, type TuneLayoutOptions } from '@/lib/layout/tuneModelLayout'
import { blockWireGeometry, wirePolyline } from '@/lib/layout/layoutMetrics'
import { portLabelWidth, PORT_LABEL_MARGIN } from '@/lib/layout/satellites'
import { validateBlockParameters } from '@/lib/blockParameterValidator'
import type { BlockData } from '@/components/BlockNode'
import type { WireData } from '@/components/Wire'
import type { Sheet } from '@/lib/modelStore'

const blk = (id: string, type = 'scale', parameters: Record<string, any> = { gain: 1 }, name = id): BlockData =>
  ({ id, type, name, position: { x: 0, y: 0 }, parameters })
const wire = (id: string, s: string, t: string, sp = 0, tp = 0): WireData =>
  ({ id, sourceBlockId: s, sourcePortIndex: sp, targetBlockId: t, targetPortIndex: tp })
const sheetOf = (blocks: BlockData[], connections: WireData[] = [], id = 'main'): Sheet =>
  ({ id, name: id, blocks, connections, extents: { width: 1000, height: 800 } })
/** A subsystem with the given content blocks (types), `inputs` inputs and `outputs` outputs. */
const sub = (id: string, content: string[] = [], extra: Record<string, any> = {}, inputs = 1, outputs = 1): BlockData =>
  blk(id, 'subsystem', {
    inputPorts: Array.from({ length: inputs }, (_, i) => `u${i}`),
    outputPorts: Array.from({ length: outputs }, (_, i) => `y${i}`),
    sheets: [sheetOf(content.map((t, i) => blk(`${id}_${i}`, t, t === 'sum' ? { signs: '+-' } : {})), [], `${id}_sheet`)],
    ...extra,
  })
const ELK: TuneLayoutOptions = { ...DEFAULT_TUNE_OPTIONS, scope: 'model', engine: 'elk' }

describe('suggestFromContent: rules', () => {
  it('splits names into words', () => {
    expect(nameWords('FlightController')).toEqual(['flight', 'controller'])
    expect(nameWords('Motor_RR')).toEqual(['motor', 'rr'])
    expect(nameWords('GNSS')).toEqual(['gnss'])
    expect(nameWords('ImuFrontEnd')).toEqual(['imu', 'front', 'end'])
  })

  it('gives a keyword in the head noun the full weight, and in another word half', () => {
    const rescue = suggestFromContent({ ...sub('r'), name: 'GpsRescue' })
    expect(rescue.role).toBe('controller')
    expect(rescue.scores.controller).toBe(3)
    expect(rescue.scores.sensor).toBe(1.5)
    // A short last word is a position code, not the head noun
    expect(suggestFromContent({ ...sub('m'), name: 'Motor_FL' }).scores.actuator).toBe(3)
  })

  it('finds a sensor from noise and quantisers, with no name keyword', () => {
    const s = suggestFromContent({ ...sub('x', ['random_noise', 'quantizer', 'unit_delay', 'sum']), name: 'Unit7' })
    expect(s.role).toBe('sensor')
    expect(s.confidence).toBeGreaterThanOrEqual(ROLE_CONFIDENCE_THRESHOLD)
    expect(s.reasons.join(' ')).toMatch(/noise/)
  })

  it('finds a plant from continuous states and rigid-body blocks', () => {
    const s = suggestFromContent({ ...sub('x', ['integrator', 'integrator', 'integrator', 'cross', 'matrix_multiply']), name: 'Thing' })
    expect(s.role).toBe('plant')
    expect(s.scores.plant).toBe(4)
  })

  it('finds a controller from an error sum, a saturation and gains', () => {
    const s = suggestFromContent({ ...sub('x', ['sum', 'limit', 'scale', 'discrete_transform']), name: 'Block' })
    expect(s.role).toBe('controller')
    expect(s.scores.controller).toBe(2)
  })

  it('finds a compensator from discrete filters', () => {
    const s = suggestFromContent({ ...sub('x', ['notch_filter', 'notch_filter', 'scale']), name: 'Stage' })
    expect(s.role).toBe('compensator')
  })

  it('calls a subsystem with no inputs "other" (a source of signals)', () => {
    const s = suggestFromContent(sub('Pilot', ['lookup_1d', 'clock'], {}, 0, 1))
    expect(s.role).toBe('other')
  })

  it('gives no suggestion when no rule applies', () => {
    const s = suggestFromContent({ ...sub('x', ['evaluate', 'unit_delay']), name: 'Arming' })
    expect(s).toMatchObject({ role: null, confidence: 0, reasons: [] })
  })

  it('reads the content of a subsystem reference from its definition', () => {
    const def = { ...sub('def', ['random_noise', 'quantizer']), name: 'Unit' }
    const ref = blk('ref', 'subsystem', { inputPorts: ['u0'], outputPorts: ['y0'], sheets: [], isReference: true, referencedSubsystemId: 'def' }, 'Copy')
    expect(suggestFromContent(ref).role).toBeNull()
    expect(suggestFromContent(ref, modelBlockLookup([sheetOf([def, ref])])).role).toBe('sensor')
  })
})

/**
 * A closed loop of four subsystems, listed in a scrambled order, with a
 * reference input to the controller and a disturbance input to the plant.
 * The names give the functions.
 */
function loop(names = { c: 'Controller', a: 'Actuator', p: 'Plant', s: 'Sensor' }, extra: Record<string, Record<string, any>> = {}) {
  const blocks = [
    sub('s', [], extra.s, 1, 1), sub('p', [], extra.p, 2, 1), blk('ref', 'input_port', { portName: 'ref' }),
    sub('a', [], extra.a, 1, 1), blk('dist', 'input_port', { portName: 'dist' }), sub('c', [], extra.c, 2, 1),
  ]
  for (const b of blocks) if (b.id in names) b.name = (names as any)[b.id]
  const wires = [
    wire('w_ref', 'ref', 'c', 0, 0), wire('w_dist', 'dist', 'p', 0, 1),
    wire('w_ca', 'c', 'a'), wire('w_ap', 'a', 'p'), wire('w_ps', 'p', 's'), wire('w_sc', 's', 'c', 0, 1),
  ]
  return { blocks, wires }
}

describe('sheetSubsystemRoles', () => {
  it('uses the position in the loop: between a controller and a plant is an actuator', () => {
    const { blocks, wires } = loop({ c: 'Controller', a: 'Unit', p: 'Plant', s: 'Sensor' })
    const roles = sheetSubsystemRoles(blocks, wires)
    expect(roles.get('a')!.suggestion.role).toBe('actuator')
    expect(roles.get('a')!.suggestion.reasons.join(' ')).toMatch(/after a controller and before a plant/)
  })

  it('takes the user value over the suggestion', () => {
    const { blocks, wires } = loop(undefined, { s: { subsystemFunction: 'compensator' }, p: { subsystemFunction: 'other' } })
    const roles = sheetSubsystemRoles(blocks, wires)
    expect(roles.get('s')).toMatchObject({ user: 'compensator', effective: 'compensator' })
    expect(roles.get('s')!.suggestion.role).toBe('sensor')
    expect(roles.get('p')!.effective).toBe('other')
  })

  it('ignores a suggestion under the threshold', () => {
    const { blocks, wires } = loop({ c: 'Controller', a: 'Unit', p: 'Plant', s: 'Sensor' })
    expect(effectiveSheetRoles(blocks, wires, { threshold: 0.999 }).has('a')).toBe(false)
  })
})

describe('role-driven signal-flow order', () => {
  it('puts the loop in forward order and makes the sensor wire the feedback wire', () => {
    const { blocks, wires } = loop()
    const roles = effectiveSheetRoles(blocks, wires)
    expect(Object.fromEntries(roles)).toEqual({ s: 'sensor', p: 'plant', a: 'actuator', c: 'controller' })
    const flow = signalFlowAnalysis(blocks, wires, roles)
    const at = (id: string) => flow.order.indexOf(id)
    expect(at('c')).toBeLessThan(at('a'))
    expect(at('a')).toBeLessThan(at('p'))
    expect(at('p')).toBeLessThan(at('s'))
    expect([...flow.feedbackWires]).toEqual(['w_sc'])
    expect([...flow.returnPath]).toEqual(['s'])

    // Without roles, the breadth-first order closes the loop elsewhere
    const plain = signalFlowAnalysis(blocks, wires)
    expect([...plain.feedbackWires]).not.toEqual(['w_sc'])
    expect(plain.returnPath.size).toBe(0)
  })

  it('lays out the loop left to right in forward order with ELK', async () => {
    const { blocks, wires } = loop()
    // Without the mirrored return row (Phase 3): the sensor is right of the plant
    const { sheets, returnPath } = await tuneModelLayout([sheetOf(blocks, wires)], 'main', { ...ELK, mirrorReturnPath: false })
    const x = (id: string) => sheets[0].blocks.find(b => b.id === id)!.position.x
    expect(x('c')).toBeLessThan(x('a'))
    expect(x('a')).toBeLessThan(x('p'))
    expect(x('p')).toBeLessThan(x('s'))
    expect(returnPath).toEqual({ main: ['s'] })
  })

  it('puts the sensor of the loop on a mirrored row below the forward path with ELK', async () => {
    const { blocks, wires } = loop()
    const { sheets, returnPath } = await tuneModelLayout([sheetOf(blocks, wires)], 'main', ELK)
    const at = (id: string) => sheets[0].blocks.find(b => b.id === id)!
    expect(at('c').position.x).toBeLessThan(at('a').position.x)
    expect(at('a').position.x).toBeLessThan(at('p').position.x)
    // Below the forward blocks, between the controller and the plant
    for (const id of ['c', 'a', 'p']) expect(at('s').position.y).toBeGreaterThan(at(id).position.y + 64)
    expect(at('s').position.x).toBeGreaterThan(at('c').position.x)
    expect(at('s').position.x).toBeLessThan(at('p').position.x + 80)
    expect(at('s').parameters?.flipped).toBe(true)
    for (const id of ['c', 'a', 'p']) expect(at(id).parameters?.flipped).toBeUndefined()
    expect(returnPath).toEqual({ main: ['s'] })
  })

  it('puts a summing junction on the controller side and plain blocks after the plant on the return path', () => {
    const blocks = [
      blk('gain', 'scale'), sub('p', [], {}, 1, 1), blk('sum', 'sum', { signs: '+-' }), blk('ref', 'input_port'),
      sub('c', [], {}, 1, 1), sub('a', [], {}, 1, 1),
    ]
    blocks.find(b => b.id === 'p')!.name = 'Plant'
    blocks.find(b => b.id === 'c')!.name = 'Controller'
    blocks.find(b => b.id === 'a')!.name = 'Motor'
    const wires = [
      wire('w1', 'ref', 'sum'), wire('w2', 'sum', 'c'), wire('w3', 'c', 'a'), wire('w4', 'a', 'p'),
      wire('w5', 'p', 'gain'), wire('w6', 'gain', 'sum', 0, 1),
    ]
    const flow = signalFlowAnalysis(blocks, wires, effectiveSheetRoles(blocks, wires))
    expect(flow.order.filter(id => id !== 'ref')).toEqual(['sum', 'c', 'a', 'p', 'gain'])
    expect([...flow.feedbackWires]).toEqual(['w6'])
    expect([...flow.returnPath]).toEqual(['gain'])
  })

  it('does not change a sheet without functions, or with the option off', async () => {
    const { blocks, wires } = loop({ c: 'U1', a: 'U2', p: 'U3', s: 'U4' })
    expect(effectiveSheetRoles(blocks, wires).size).toBe(0)
    expect(signalFlowOrder(blocks, wires, new Map())).toEqual(signalFlowOrder(blocks, wires))

    const named = loop()
    const off = await tuneModelLayout([sheetOf(named.blocks, named.wires)], 'main', { ...ELK, useSubsystemFunctions: false })
    const plain = await computeElkLayout(named.blocks, named.wires)
    for (const m of plain.moves) {
      expect(off.sheets[0].blocks.find(b => b.id === m.id)!.position).toEqual(m.position)
    }
    expect(off.returnPath).toEqual({})
  })
})

describe('minimum subsystem height (ELK clean-up)', () => {
  const crowded = () => sub('box', [], { width: 120, height: 64 }, 1, 6) // natural height 6 x 20 + 20 = 140
  const tall = () => sub('tall', [], { width: 120, height: 300 }, 1, 2)

  it('grows a subsystem below its natural height and never shrinks one', () => {
    expect(minimumHeightResizes([crowded(), tall(), sub('free', [], {}, 1, 6)])).toEqual([{ id: 'box', width: 120, height: 140 }])
  })

  it('writes the growth as a resize and counts it, with the ELK engine only', async () => {
    const blocks = [crowded(), tall(), blk('k', 'scale')]
    const wires = [wire('w1', 'box', 'k', 3, 0)]
    const elk = await tuneModelLayout([sheetOf(blocks, wires)], 'main', ELK)
    expect(elk.sheets[0].blocks.find(b => b.id === 'box')!.parameters).toMatchObject({ width: 120, height: 140 })
    expect(elk.sheets[0].blocks.find(b => b.id === 'tall')!.parameters).toMatchObject({ height: 300 })
    expect(elk.summary.blocksResized).toBe(1)

    const classic = await tuneModelLayout([sheetOf(blocks, wires)], 'main', { ...ELK, engine: 'classic' })
    expect(classic.sheets[0].blocks.find(b => b.id === 'box')!.parameters!.height).toBe(64)
    expect(classic.summary.blocksResized).toBe(0)
  })
})

describe('port-name clearance', () => {
  // A subsystem that shows long port names, between blocks at different rows, so that wires turn
  const named = () => blk('sys', 'subsystem', {
    inputPorts: ['a_very_long_input_name', 'second_input_signal'],
    outputPorts: ['a_very_long_output_name', 'second_output_signal'],
    showPortNames: true,
    sheets: [],
  }, 'Sys')
  const blocks = () => [blk('s1', 'scale'), blk('s2', 'scale'), named(), blk('t1', 'scale'), blk('t2', 'scale'), blk('t3', 'scale')]
  const wires = [
    wire('i1', 's1', 'sys', 0, 0), wire('i2', 's2', 'sys', 0, 1),
    wire('o1', 'sys', 't1', 0, 0), wire('o2', 'sys', 't2', 1, 0), wire('o3', 'sys', 't3', 1, 0),
  ]

  it('makes the node wider by the names on both sides', () => {
    const on = buildElkGraph(blocks(), wires).nodes.get('sys')!
    const off = buildElkGraph(blocks(), wires, {}, 'flow', { portNameClearance: false }).nodes.get('sys')!
    expect(on.west!.width).toBeGreaterThan(portLabelWidth(named(), 'west', 0))
    expect(on.east!.width).toBeGreaterThan(portLabelWidth(named(), 'east', 0))
    expect(off.west).toBeUndefined()
    expect(on.width).toBeGreaterThan(off.width)
  })

  it('puts the first bend of each wire after the widest name', async () => {
    const { sheets } = await tuneModelLayout([sheetOf(blocks(), wires)], 'main', ELK)
    const placed = new Map(sheets[0].blocks.map(b => [b.id, b]))
    const sys = placed.get('sys')!
    const g = blockWireGeometry(sys)
    const east = Math.max(...[0, 1].map(i => portLabelWidth(sys, 'east', i)))
    const west = Math.max(...[0, 1].map(i => portLabelWidth(sys, 'west', i)))
    let turned = 0
    for (const w of sheets[0].connections) {
      const a = placed.get(w.sourceBlockId)!, b = placed.get(w.targetBlockId)!
      const pts = wirePolyline(blockWireGeometry(a).sourceEnd(w.sourcePortIndex), blockWireGeometry(b).targetEnd(w.targetPortIndex), w.routing)
      if (Math.abs(pts[0].y - pts[pts.length - 1].y) < 1 && pts.length <= 4) continue
      turned++
      if (a.id === 'sys') expect(pts[1].x).toBeGreaterThanOrEqual(g.rect.x + g.rect.w + PORT_LABEL_MARGIN + east)
      if (b.id === 'sys') expect(pts[pts.length - 2].x).toBeLessThanOrEqual(g.rect.x - PORT_LABEL_MARGIN - west)
    }
    expect(turned).toBeGreaterThan(0)
  })
})

describe('subsystemFunction parameter', () => {
  it('passes the parameter validator, and an unknown value fails', () => {
    const ok = validateBlockParameters('subsystem', { inputPorts: ['a'], outputPorts: ['b'], subsystemFunction: 'plant' })
    expect(ok.valid).toBe(true)
    expect(ok.sanitizedParameters!.subsystemFunction).toBe('plant')
    const cleared = validateBlockParameters('subsystem', { inputPorts: ['a'], outputPorts: ['b'], subsystemFunction: null })
    expect(cleared.valid).toBe(true)
    expect(cleared.sanitizedParameters!.subsystemFunction).toBeUndefined()
    expect(validateBlockParameters('subsystem', { inputPorts: ['a'], outputPorts: ['b'], subsystemFunction: 'pump' }).valid).toBe(false)
  })
})

describe('FPV vehicle', () => {
  // The shipped file has the mirrored layout (Sensors flipped). Without the
  // mirror, the layout keeps the stored flags, so start from unflipped blocks.
  const raw = JSON.parse(
    fs.readFileSync(path.join(__dirname, '..', 'reference-models', 'fpv-vehicle.json'), 'utf8'),
    (key, value) => (key === 'flipped' ? undefined : value),
  )
  const sheets: Sheet[] = (raw.data ?? raw).sheets
  const main = sheets[0]

  it('suggests the functions of the Main subsystems', () => {
    const roles = sheetSubsystemRoles(main.blocks, main.connections, { lookup: modelBlockLookup(sheets) })
    const byName = Object.fromEntries(main.blocks.filter(b => roles.has(b.id)).map(b => [b.name, roles.get(b.id)!.effective]))
    expect(byName).toEqual({
      FlightController: 'controller',
      Motor_RR: 'actuator', Motor_FR: 'actuator', Motor_RL: 'actuator', Motor_FL: 'actuator',
      Battery: 'plant',
      Frame: 'plant',
      Sensors: 'sensor',
    })
  })

  it('lays out Main as controller, motors, frame, sensors from left to right without the mirror', async () => {
    const { sheets: out, returnPath } = await tuneModelLayout(sheets, main.id, { ...ELK, scope: 'sheet', mirrorReturnPath: false })
    const x = (name: string) => out[0].blocks.find(b => b.name === name)!.position.x
    for (const m of ['Motor_RR', 'Motor_FR', 'Motor_RL', 'Motor_FL']) {
      expect(x('FlightController')).toBeLessThan(x(m))
      expect(x(m)).toBeLessThan(x('Frame'))
    }
    expect(x('MotorCmdSplit')).toBeLessThan(x('Motor_RR'))
    expect(x('Frame')).toBeLessThan(x('Sensors'))
    expect(out[0].blocks.some(b => b.parameters?.flipped)).toBe(false)
    const names = (returnPath![main.id] ?? []).map(id => main.blocks.find(b => b.id === id)!.name)
    expect(names).toEqual(['Sensors'])
    // The FlightController block grows to its natural height: 22 outputs at 20 px
    expect(out[0].blocks.find(b => b.name === 'FlightController')!.parameters!.height).toBe(460)
  })
})
