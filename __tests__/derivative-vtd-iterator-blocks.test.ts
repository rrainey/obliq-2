/**
 * Derivative, Variable Transport Delay, For Iterator Subsystem and Iteration
 * Index: the registry, the parameter validation of the Model Builder API, the
 * model schema, the MCP list, the canvas and model validation, and the
 * generated C (compiled with gcc and run when gcc and cmake are present).
 *
 * The numeric checks use values that come from the mathematics of the test
 * signal, not from the formula in the block module:
 * - the backward difference of u = t^2 is 2t - dt, and the integral of the
 *   derivative of u gives u again;
 * - a delay of d on the ramp u = t gives t - d, and linear interpolation is
 *   exact on a ramp;
 * - a body y = u * i, run for i = 1..3, gives 6u as a sum and 3u at the last pass.
 */

import { execSync } from 'child_process'
import { BlockTypes, blockTypeRegistry, isValidBlockType } from '@/lib/blockTypeRegistry'
import { BlockModuleFactory } from '@/lib/blocks/BlockModuleFactory'
import { PortCountAdapter } from '@/lib/validation/PortCountAdapter'
import { createBlock, syncSubsystemPortsFromSheets } from '@/lib/blockFactory'
import { validateBlockParameters } from '@/lib/blockParameterValidator'
import { validateModelDataWithErrors } from '@/lib/modelSchema'
import { findSheetRecursively } from '@/lib/api-support/sheet-search'
import { validateModelTypeCompatibilityMultiSheet, validateBlockOperation } from '@/lib/typeCompatibilityValidator'
import { validateMultiSheetTypeCompatibility } from '@/lib/multiSheetTypeValidator'
import { CodeGenerator } from '@/lib/codegen/CodeGenerator'
import { blockTypeSchemas, listBlockTypesTool } from '../mcp-server/src/tools/block-types'
import { cleanupNativeDir, compileAndRunNative, parseResultLine } from './support/nativeCgen'

jest.setTimeout(180000)

const b = (id: string, type: string, name: string, parameters: Record<string, unknown> = {}) =>
  ({ id, type, name, position: { x: 0, y: 0 }, parameters }) as any
const w = (id: string, s: string, sp: number, t: string, tp: number) =>
  ({ id, sourceBlockId: s, sourcePortIndex: sp, targetBlockId: t, targetPortIndex: tp }) as any
const sheet = (blocks: any[], connections: any[], id = 'main', name = 'Main') =>
  ({ id, name, blocks, connections, extents: { width: 800, height: 400 } }) as any

const hasToolchain = (() => {
  try {
    execSync('gcc --version && cmake --version', { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
})()
const nativeTest = hasToolchain ? test : test.skip

const dirs: string[] = []
afterAll(() => dirs.forEach(cleanupNativeDir))
function runNative(modelName: string, sheets: any[], body: string, integrationAlgorithm: 'rk4' | 'euler' = 'rk4') {
  const r = compileAndRunNative({ modelName, sheets, dt: 0.01, integrationAlgorithm, smokeMainBody: body })
  dirs.push(r.outDir)
  return r
}

const TYPES = ['derivative', 'variable_transport_delay', 'for_iterator_subsystem', 'iteration_index'] as const

// --- Registry, factory, ports, MCP -----------------------------------------

describe('registry, factory, ports and MCP list', () => {
  const expected: Record<string, { category: string; inputs: string[]; outputs: string[] }> = {
    derivative: { category: 'Dynamic', inputs: ['u'], outputs: ['du_dt'] },
    variable_transport_delay: { category: 'Dynamic', inputs: ['u', 'delay_sec'], outputs: ['y'] },
    iteration_index: { category: 'Sources', inputs: [], outputs: ['i'] },
    for_iterator_subsystem: { category: 'Hierarchical', inputs: [], outputs: [] },
  }

  test.each(TYPES)('%s: registry entry, MCP entry and module agree', (type) => {
    expect(isValidBlockType(type)).toBe(true)
    expect(BlockModuleFactory.isSupported(type)).toBe(true)
    const def = blockTypeRegistry[type]
    const info = blockTypeSchemas.find(i => i.type === type)!
    expect(info).toBeDefined()
    expect(def.category).toBe(expected[type].category)
    expect(info.category).toBe(def.category)
    expect(def.inputs.map(p => p.name)).toEqual(expected[type].inputs)
    expect(def.outputs.map(p => p.name)).toEqual(expected[type].outputs)
    expect(info.inputs).toEqual(expected[type].inputs)
    expect(info.outputs).toEqual(expected[type].outputs)
    // Each registry default parameter is described in the MCP entry
    for (const key of Object.keys(def.defaultParameters)) {
      if (['sheetId', 'sheetName', 'parameters'].includes(key)) continue
      expect({ type, key, inMcp: key in info.parameters }).toEqual({ type, key, inMcp: true })
    }
  })

  test('MCP list_block_types gives the four in their categories', async () => {
    const res: any = await listBlockTypesTool.handler({})
    expect(res.success).toBe(true)
    const all = Object.values(res.blockTypes).flat().map((i: any) => i.type)
    for (const t of TYPES) expect(all).toContain(t)
  })

  test('port counts and labels', () => {
    const d = createBlock('derivative')
    const v = createBlock('variable_transport_delay')
    const i = createBlock('iteration_index')
    expect(PortCountAdapter.getPortCounts(d)).toEqual({ inputCount: 1, outputCount: 1 })
    expect(PortCountAdapter.getPortCounts(v)).toEqual({ inputCount: 2, outputCount: 1 })
    expect(PortCountAdapter.getInputPortLabels(v)).toEqual(['u', 'delay_sec'])
    expect(PortCountAdapter.getPortCounts(i)).toEqual({ inputCount: 0, outputCount: 1 })
    expect(PortCountAdapter.getOutputPortLabels(i)).toEqual(['i'])
    expect(d.inputs).toEqual(['u'])
    expect(d.outputs).toEqual(['du_dt'])
    expect(v.inputs).toEqual(['u', 'delay_sec'])
    expect(i.outputs).toEqual(['i'])
  })

  test('createBlock gives the defaults of the registry', () => {
    expect(createBlock('derivative').parameters).toMatchObject({ initialCondition: 0 })
    expect(createBlock('variable_transport_delay').parameters).toMatchObject({ maximumDelay: 1, maximumPoints: 1024, initialInput: 0 })
  })

  test('createBlock gives a For Iterator a body sheet with one input and one output port', () => {
    const fi = createBlock('for_iterator_subsystem', { id: 'fi1', name: 'Loop' })
    expect(fi.parameters).toMatchObject({
      iterationLimit: 5, indexBase: 1, resetStates: 'held', accumulateOutputs: false, codeGenStrategy: 'segregated_atomic',
    })
    expect(fi.parameters.sheets).toHaveLength(1)
    const body = fi.parameters.sheets[0]
    expect(body.blocks.map((x: any) => x.type).sort()).toEqual(['input_port', 'output_port'])
    expect(fi.inputs).toEqual(['Input1'])
    expect(fi.outputs).toEqual(['Output1'])
    expect(PortCountAdapter.getPortCounts(fi)).toEqual({ inputCount: 1, outputCount: 1 })
    // The API finds the body sheet, and a new port in it updates the block ports
    const top = [sheet([fi], [])]
    const found = findSheetRecursively(top, body.id)
    expect(found?.parentBlock?.id).toBe('fi1')
    body.blocks.push(createBlock('output_port', { id: 'o2', name: 'z', parameters: { portName: 'z' } }))
    syncSubsystemPortsFromSheets(fi)
    expect(fi.outputs).toEqual(['Output1', 'z'])
  })
})

// --- Parameter validation (Model Builder API / MCP add_block) --------------

describe('parameter validation of the Model Builder API', () => {
  const v = (type: string, p: Record<string, unknown>) => validateBlockParameters(type as any, p)

  test('accepts the defaults that createBlock gives', () => {
    for (const t of TYPES) {
      const r = v(t, createBlock(t).parameters)
      expect({ t, errors: r.errors }).toEqual({ t, errors: [] })
      expect(r.valid).toBe(true)
    }
  })

  test('derivative: initialCondition', () => {
    expect(v('derivative', { initialCondition: -2.5 }).sanitizedParameters).toMatchObject({ initialCondition: -2.5 })
    expect(v('derivative', {}).sanitizedParameters).toMatchObject({ initialCondition: 0 })
    expect(v('derivative', { initialCondition: 'abc' }).valid).toBe(false)
    expect(v('derivative', { initialCondition: Infinity }).valid).toBe(false)
    expect(v('derivative', { initialCondition: true }).valid).toBe(false)
  })

  test('variable_transport_delay: maximumDelay, maximumPoints, initialInput', () => {
    expect(v('variable_transport_delay', { maximumDelay: 0.2, maximumPoints: 64, initialInput: 3 }).sanitizedParameters)
      .toMatchObject({ maximumDelay: 0.2, maximumPoints: 64, initialInput: 3 })
    expect(v('variable_transport_delay', { maximumDelay: 0 }).valid).toBe(false)
    expect(v('variable_transport_delay', { maximumDelay: -1 }).valid).toBe(false)
    expect(v('variable_transport_delay', { maximumPoints: 1 }).valid).toBe(false)
    expect(v('variable_transport_delay', { maximumPoints: 10.5 }).valid).toBe(false)
    expect(v('variable_transport_delay', { maximumPoints: 2000000 }).valid).toBe(false)
    expect(v('variable_transport_delay', { initialInput: 'x' }).valid).toBe(false)
  })

  test('for_iterator_subsystem: its own parameters and the subsystem parameters', () => {
    const ok = v('for_iterator_subsystem', {
      iterationLimit: 3, indexBase: 0, resetStates: 'reset', accumulateOutputs: true,
      inputPorts: ['u'], outputPorts: ['y'], codeGenStrategy: 'segregated',
    })
    expect(ok.errors).toEqual([])
    expect(ok.sanitizedParameters).toMatchObject({
      iterationLimit: 3, indexBase: 0, resetStates: 'reset', accumulateOutputs: true, codeGenStrategy: 'segregated',
    })
    expect(v('for_iterator_subsystem', {}).sanitizedParameters).toMatchObject({ codeGenStrategy: 'segregated_atomic', iterationLimit: 5 })
    for (const bad of [
      { iterationLimit: 0 }, { iterationLimit: 2.5 }, { iterationLimit: 'many' },
      { indexBase: 2 }, { resetStates: 'never' }, { accumulateOutputs: 1 },
      { codeGenStrategy: 'flatten' }, { inputPorts: 'u' },
    ]) {
      expect({ bad, valid: v('for_iterator_subsystem', bad).valid }).toEqual({ bad, valid: false })
    }
    // A plain subsystem still accepts 'flatten'
    expect(v('subsystem', { codeGenStrategy: 'flatten' }).valid).toBe(true)
  })

  test('iteration_index: no parameters with an effect; indexBase must be 0 or 1', () => {
    expect(v('iteration_index', {}).valid).toBe(true)
    expect(v('iteration_index', { indexBase: 0 }).valid).toBe(true)
    expect(v('iteration_index', { indexBase: 5 }).valid).toBe(false)
  })
})

// --- Model schema -----------------------------------------------------------

describe('model schema', () => {
  test('accepts a model with the four types (For Iterator with a body sheet)', () => {
    const body = sheet([
      b('in', 'input_port', 'u', { portName: 'u' }),
      b('idx', 'iteration_index', 'Idx'),
      b('out', 'output_port', 'y', { portName: 'y' }),
    ], [w('w1', 'idx', 0, 'out', 0)], 'body', 'Body')
    const result = validateModelDataWithErrors({
      version: '1.0',
      metadata: { created: '2026-01-01T00:00:00.000Z', description: 'four' },
      sheets: [{
        ...sheet([
          b('d', 'derivative', 'D', { initialCondition: 0 }),
          b('v', 'variable_transport_delay', 'VTD', { maximumDelay: 1, maximumPoints: 128, initialInput: 0 }),
          b('fi', 'for_iterator_subsystem', 'Loop', {
            inputPorts: ['u'], outputPorts: ['y'], iterationLimit: 3, indexBase: 1,
            resetStates: 'held', accumulateOutputs: true, sheets: [body],
          }),
        ], []),
      }],
      globalSettings: { simulationTimeStep: 0.01, simulationDuration: 1 },
    })
    expect(result.errors).toEqual([])
  })
})

// --- Canvas and model validation ---------------------------------------------

describe('validation of placement and shapes', () => {
  test('Iteration Index outside a For Iterator body is an error; inside, no error', () => {
    const outside = [sheet([b('i', 'iteration_index', 'Idx'), b('y', 'output_port', 'Y', { portName: 'Y' })], [w('a', 'i', 0, 'y', 0)])]
    const msg = /must be in the body of a For Iterator Subsystem/
    expect(validateModelTypeCompatibilityMultiSheet(outside).errors.some(e => e.blockId === 'i' && msg.test(e.message))).toBe(true)
    expect(validateMultiSheetTypeCompatibility(outside).errors.some(e => e.blockId === 'i' && msg.test(e.message))).toBe(true)

    const body = sheet([b('i', 'iteration_index', 'Idx'), b('o', 'output_port', 'o', { portName: 'o' })], [w('a', 'i', 0, 'o', 0)], 'body', 'Body')
    const inside = [sheet([b('fi', 'for_iterator_subsystem', 'Loop', { inputPorts: [], outputPorts: ['o'], sheets: [body] })], [])]
    expect(validateModelTypeCompatibilityMultiSheet(inside).errors.filter(e => e.blockId === 'i')).toEqual([])
    expect(validateMultiSheetTypeCompatibility(inside).errors.filter(e => e.blockId === 'i')).toEqual([])
    // The same body sheet also given as a top-level sheet (as some callers do)
    expect(validateMultiSheetTypeCompatibility([...inside, body]).errors.filter(e => e.blockId === 'i')).toEqual([])

    // In a plain subsystem (not a For Iterator body): error
    const plain = [sheet([b('s', 'subsystem', 'Sub', { inputPorts: [], outputPorts: ['o'], sheets: [body] })], [])]
    expect(validateMultiSheetTypeCompatibility(plain).errors.some(e => e.blockId === 'i')).toBe(true)
  })

  test('Variable Transport Delay: a vector input is an error', () => {
    const vtd = b('v', 'variable_transport_delay', 'VTD')
    expect(validateBlockOperation(vtd, ['double[3]', 'double'])?.message).toMatch(/must be a scalar/)
    expect(validateBlockOperation(vtd, ['double', 'double[2]'])?.message).toMatch(/delay_sec must be a scalar/)
    expect(validateBlockOperation(vtd, ['double', 'double'])).toBeNull()
    const sheets = [sheet([
      b('u', 'source', 'U', { signalType: 'constant', value: [1, 2, 3], dataType: 'double[3]' }),
      b('d', 'source', 'D', { signalType: 'constant', value: 0.1, dataType: 'double' }),
      vtd, b('y', 'output_port', 'Y', { portName: 'Y' }),
    ], [w('a', 'u', 0, 'v', 0), w('c', 'd', 0, 'v', 1), w('e', 'v', 0, 'y', 0)])]
    expect(validateMultiSheetTypeCompatibility(sheets).errors.some(e => e.blockId === 'v' && /must be a scalar/.test(e.message))).toBe(true)
  })
})

// --- Generated C --------------------------------------------------------------

describe('generated C', () => {
  test('Iteration Index outside a body and a vector delay give a C #error with the block name', () => {
    const outside = [sheet([b('i', 'iteration_index', 'Idx'), b('y', 'output_port', 'Y', { portName: 'Y' })], [w('a', 'i', 0, 'y', 0)])]
    expect(new CodeGenerator({ modelName: 'idx_out' }).generate(outside).source)
      .toMatch(/#error "Iteration Index block 'Idx' is not in the body of a For Iterator Subsystem"/)
    const vec = [sheet([
      b('u', 'source', 'U', { signalType: 'constant', value: [1, 2, 3], dataType: 'double[3]' }),
      b('d', 'source', 'Dl', { signalType: 'constant', value: 0.1, dataType: 'double' }),
      b('v', 'variable_transport_delay', 'VTD'), b('y', 'output_port', 'Y', { portName: 'Y' }),
    ], [w('a', 'u', 0, 'v', 0), w('c', 'd', 0, 'v', 1), w('e', 'v', 0, 'y', 0)])]
    expect(new CodeGenerator({ modelName: 'vtd_vec' }).generate(vec).source)
      .toMatch(/#error "Variable Transport Delay 'VTD': input u must be a scalar, not double\[3\]"/)
  })

  test('a NaN or negative delay is set to 0 in the C', () => {
    const src = new CodeGenerator({ modelName: 'vtd_nan' }).generate([sheet([
      b('u', 'source', 'U', { signalType: 'constant', value: 1 }),
      b('d', 'source', 'Dl', { signalType: 'constant', value: 0.1 }),
      b('v', 'variable_transport_delay', 'VTD'), b('y', 'output_port', 'Y', { portName: 'Y' }),
    ], [w('a', 'u', 0, 'v', 0), w('c', 'd', 0, 'v', 1), w('e', 'v', 0, 'y', 0)])]).source || ''
    expect(src).toContain('if (!(__d > 0.0)) __d = 0.0;')
  })

  // u = Ramp^2, Ramp = integral of 1, so u = t^2. D = derivative of u. I = integral of D.
  const derivativeModel = (ic = 0) => [sheet([
    b('one', 'source', 'One', { signalType: 'constant', value: 1 }),
    b('r', 'integrator', 'Ramp', { initialCondition: 0 }),
    b('sq', 'square', 'Sq'),
    b('d', 'derivative', 'D', { initialCondition: ic }),
    b('i2', 'integrator', 'IntD', { initialCondition: 0 }),
    b('yu', 'output_port', 'U', { portName: 'U' }),
    b('yd', 'output_port', 'Dout', { portName: 'Dout' }),
    b('yi', 'output_port', 'I', { portName: 'I' }),
  ], [
    w('a', 'one', 0, 'r', 0), w('b', 'r', 0, 'sq', 0), w('c', 'sq', 0, 'd', 0), w('e', 'd', 0, 'i2', 0),
    w('f', 'sq', 0, 'yu', 0), w('g', 'd', 0, 'yd', 0), w('h', 'i2', 0, 'yi', 0),
  ])]

  nativeTest.each(['rk4', 'euler'] as const)('derivative of t^2 is the backward difference 2t - dt; its integral gives t^2 back (%s)', (alg) => {
    const r = runNative(`deriv_${alg}`, derivativeModel(), `
  for (int k = 0; k < 100; ++k) {
    double t = model.time;
    deriv_${alg}_step(&model);
    if (k == 50) printf("t50=%.17g\\nD50=%.17g\\n", t, model.outputs.Dout);
  }
  printf("U=%.17g\\nI=%.17g\\n", model.outputs.U, model.outputs.I);
  return 0;`, alg)
    const t50 = parseResultLine(r.stdout, 't50')
    expect(t50).toBeCloseTo(0.5, 12)
    // The outputs of the step at time t: D = (t^2 - (t - dt)^2) / dt = 2t - dt
    expect(parseResultLine(r.stdout, 'D50')).toBeCloseTo(2 * 0.5 - 0.01, 9)
    // The integral of the derivative: the backward difference lags by dt/2,
    // which gives an error of about dt * u'/2 = 0.01 at t = 1. Before the fix
    // of the RK4 stages, rk4 gave I = 0.66 for U = 0.98.
    const U = parseResultLine(r.stdout, 'U')
    const I = parseResultLine(r.stdout, 'I')
    expect(Math.abs(I - U)).toBeLessThan(0.025)
  })

  // init() sets the top-level states to zero; the block initial values are
  // applied by seed_from_inputs(), which also runs the algebra and latches u.
  nativeTest('derivative: first step u / dt after init() only, 0 after seed_from_inputs()', () => {
    const sheets = [sheet([
      b('c', 'source', 'C', { signalType: 'constant', value: 5 }),
      b('d', 'derivative', 'D', { initialCondition: 2 }),
      b('y', 'output_port', 'Y', { portName: 'Y' }),
    ], [w('a', 'c', 0, 'd', 0), w('b2', 'd', 0, 'y', 0)])]
    const r = runNative('deriv_first', sheets, `
  deriv_first_step(&model); printf("Y0=%.17g\\n", model.outputs.Y);
  deriv_first_step(&model); printf("Y1=%.17g\\n", model.outputs.Y);
  deriv_first_t model2; deriv_first_init(&model2, 0.01); deriv_first_seed_from_inputs(&model2);
  deriv_first_step(&model2); printf("S0=%.17g\\n", model2.outputs.Y);
  return 0;`)
    expect(parseResultLine(r.stdout, 'Y0')).toBeCloseTo(5 / 0.01, 6)
    expect(parseResultLine(r.stdout, 'Y1')).toBeCloseTo(0, 9)
    expect(parseResultLine(r.stdout, 'S0')).toBeCloseTo(0, 9)
  })

  nativeTest('variable transport delay on the ramp u = t gives t - d', () => {
    const delayModel = (d: number, points: number, name: string) => [
      b(`dl_${name}`, 'source', `Dl_${name}`, { signalType: 'constant', value: d }),
      b(`v_${name}`, 'variable_transport_delay', `V_${name}`, { maximumDelay: 1, maximumPoints: points, initialInput: 7 }),
      b(`y_${name}`, 'output_port', `Y_${name}`, { portName: `Y_${name}` }),
    ]
    const wires = (name: string) => [
      w(`wu_${name}`, 'r', 0, `v_${name}`, 0), w(`wd_${name}`, `dl_${name}`, 0, `v_${name}`, 1), w(`wy_${name}`, `v_${name}`, 0, `y_${name}`, 0),
    ]
    const cases: Array<[string, number, number]> = [
      ['d0', 0, 256], ['d50', 0.05, 256], ['d25', 0.025, 256], ['neg', -0.3, 256], ['big', 0.05, 4], ['over', 5, 256],
    ]
    const sheets = [sheet([
      b('one', 'source', 'One', { signalType: 'constant', value: 1 }),
      b('r', 'integrator', 'Ramp', { initialCondition: 0 }),
      ...cases.flatMap(([n, d, p]) => delayModel(d, p, n)),
    ], [w('a', 'one', 0, 'r', 0), ...cases.flatMap(([n]) => wires(n))])]
    const prints = cases.map(([n]) => `printf("${n}_k%d=%.17g\\n", k, model.outputs.Y_${n});`).join(' ')
    const r = runNative('vtd_ramp', sheets, `
  vtd_ramp_seed_from_inputs(&model);
  for (int k = 0; k < 150; ++k) { vtd_ramp_step(&model); if (k == 2 || k == 120) { ${prints} } }
  return 0;`)
    const t = 1.2 // the outputs of step k = 120 are for t = 1.2
    expect(parseResultLine(r.stdout, 'd0_k120')).toBeCloseTo(t, 9)
    expect(parseResultLine(r.stdout, 'd50_k120')).toBeCloseTo(t - 0.05, 9)
    expect(parseResultLine(r.stdout, 'd25_k120')).toBeCloseTo(t - 0.025, 9)
    expect(parseResultLine(r.stdout, 'neg_k120')).toBeCloseTo(t, 9)
    // maximumPoints = 4 limits the delay to 4 * dt = 0.04 s
    expect(parseResultLine(r.stdout, 'big_k120')).toBeCloseTo(t - 0.04, 9)
    // maximumDelay = 1 s limits a delay of 5 s
    expect(parseResultLine(r.stdout, 'over_k120')).toBeCloseTo(t - 1, 9)
    // Before the history covers the delay (t = 0.02 < 0.05), the output is initialInput
    expect(parseResultLine(r.stdout, 'd50_k2')).toBeCloseTo(7, 9)
    expect(parseResultLine(r.stdout, 'd0_k2')).toBeCloseTo(0.02, 9)
  })

  const iteratorModel = (opts: { acc: boolean; vec: boolean; strategy?: string; base?: 0 | 1 }) => {
    const t = opts.vec ? 'double[2]' : 'double'
    const body = sheet([
      b('in_u', 'input_port', 'u', { portName: 'u', dataType: t }),
      b('idx', 'iteration_index', 'Idx'),
      b('m', 'multiply', 'Mul', { inputCount: 2 }),
      b('out_y', 'output_port', 'y', { portName: 'y', dataType: t }),
    ], [w('w1', 'in_u', 0, 'm', 0), w('w2', 'idx', 0, 'm', 1), w('w3', 'm', 0, 'out_y', 0)], 'body', 'Loop')
    return [sheet([
      b('u', 'source', 'U', { signalType: 'constant', value: opts.vec ? [2, 3] : 2, dataType: t }),
      b('fi', 'for_iterator_subsystem', 'Loop', {
        inputPorts: ['u'], outputPorts: ['y'], iterationLimit: 3, indexBase: opts.base ?? 1, resetStates: 'held',
        accumulateOutputs: opts.acc, sheets: [body], ...(opts.strategy ? { codeGenStrategy: opts.strategy } : {}),
      }),
      b('Y', 'output_port', 'Y', { portName: 'Y', dataType: t }),
    ], [w('c1', 'u', 0, 'fi', 0), w('c2', 'fi', 0, 'Y', 0)])]
  }

  nativeTest('For Iterator: a vector output is summed over the passes (accumulateOutputs)', () => {
    const r = runNative('fi_vacc', iteratorModel({ acc: true, vec: true }),
      `fi_vacc_step(&model); printf("Y0=%.17g\\nY1=%.17g\\n", model.outputs.Y[0], model.outputs.Y[1]); return 0;`)
    // (1 + 2 + 3) * [2, 3]
    expect(parseResultLine(r.stdout, 'Y0')).toBeCloseTo(12, 9)
    expect(parseResultLine(r.stdout, 'Y1')).toBeCloseTo(18, 9)
  })

  nativeTest('For Iterator: a vector output is the last pass without accumulateOutputs (zero-based index)', () => {
    const r = runNative('fi_vlast', iteratorModel({ acc: false, vec: true, base: 0 }),
      `fi_vlast_step(&model); printf("Y0=%.17g\\nY1=%.17g\\n", model.outputs.Y[0], model.outputs.Y[1]); return 0;`)
    // last index = 2
    expect(parseResultLine(r.stdout, 'Y0')).toBeCloseTo(4, 9)
    expect(parseResultLine(r.stdout, 'Y1')).toBeCloseTo(6, 9)
  })

  nativeTest('two For Iterators with accumulated outputs of the same name compile', () => {
    const a = iteratorModel({ acc: true, vec: true })[0]
    const fi2 = { ...a.blocks[1], id: 'fi2', name: 'Loop2' }
    const b2 = { ...a.blocks[2], id: 'Y2', name: 'Y2', parameters: { portName: 'Y2', dataType: 'double[2]' } }
    a.blocks.push(fi2, b2)
    a.connections.push(w('c3', 'u', 0, 'fi2', 0), w('c4', 'fi2', 0, 'Y2', 0))
    const r = runNative('fi_two', [a],
      `fi_two_step(&model); printf("A=%.17g\\nB=%.17g\\n", model.outputs.Y[1], model.outputs.Y2[1]); return 0;`)
    expect(parseResultLine(r.stdout, 'A')).toBeCloseTo(18, 9)
    expect(parseResultLine(r.stdout, 'B')).toBeCloseTo(18, 9)
  })

  nativeTest('For Iterator: codeGenStrategy flatten (from an old model) still runs the body in a loop', () => {
    const r = runNative('fi_flat', iteratorModel({ acc: true, vec: false, strategy: 'flatten' }),
      `fi_flat_step(&model); printf("Y=%.17g\\n", model.outputs.Y); return 0;`)
    expect(parseResultLine(r.stdout, 'Y')).toBeCloseTo(12, 9)
  })
})
