/**
 * Model references: expansion (ports, ids, sheet labels, parameters,
 * sharing, errors), native C of an expanded model, and the store-backed
 * loader (latest vs pinned version) through obliq:test.
 */
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import {
  ModelLoader,
  ModelReferenceError,
  ReferencedModel,
  expandModelReferences,
  hasModelReferences,
  modelInterface,
} from '@/lib/modelReferences'
import { CodeGenerator } from '@/lib/codegen/CodeGenerator'
import { openStorage } from '@/lib/server/storage'
import { storageModelLoader } from '@/lib/server/modelReferenceLoader'
import { resolveTestTargets } from '@/lib/testing/resolveTestTargets'
import { runModelTests } from '@/lib/testing/modelTestRunner'
import { cleanupNativeDir, compileAndRunNative } from './support/nativeCgen'

jest.setTimeout(180000)

const b = (id: string, type: string, name: string, parameters: Record<string, unknown> = {}) => ({
  id,
  type,
  name,
  position: { x: 0, y: 0 },
  parameters,
})
const w = (id: string, s: string, t: string, tp = 0, sp = 0) => ({
  id,
  sourceBlockId: s,
  sourcePortIndex: sp,
  targetBlockId: t,
  targetPortIndex: tp,
})
const sheet = (id: string, blocks: any[], connections: any[]) => ({ id, name: id, blocks, connections, extents: { width: 800, height: 600 } })
const param = (name: string, value: number) => ({ name, dataType: 'double', defaultValue: value, signalType: 'double', value })

/**
 * "Plant": y = ∫ K·u dt, y2 = K2·y (through a sheet label to a second sheet),
 * and sq = 3·u, sq2 = 3·u through a segregated subsystem and a reference to it.
 */
function plantModel(K = 2) {
  const sq = b('main__Sq', 'subsystem', 'Sq', {
    inputPorts: ['a'],
    outputPorts: ['b'],
    codeGenStrategy: 'segregated_atomic',
    sheets: [sheet('sq', [b('sq_in', 'input_port', 'a', { portName: 'a' }), b('sq_g', 'scale', 'Three', { gain: 3 }), b('sq_out', 'output_port', 'b', { portName: 'b' })],
      [w('s1', 'sq_in', 'sq_g'), w('s2', 'sq_g', 'sq_out')])],
  })
  const sqRef = b('main__Sq2', 'subsystem', 'Sq2', {
    inputPorts: ['a'],
    outputPorts: ['b'],
    isReference: true,
    referencedSubsystemId: 'main__Sq',
    codeGenStrategy: 'segregated_atomic',
    sheets: [],
  })
  return {
    sheets: [
      sheet('main', [
        b('main__u', 'input_port', 'u', { portName: 'u' }),
        b('main__gain', 'scale', 'Gain', { gain: 'K' }),
        b('main__int', 'integrator', 'Int', { initialCondition: 0 }),
        b('main__y', 'output_port', 'y', { portName: 'y' }),
        b('main__tag', 'sheet_label_sink', 'TagX', { signalName: 'x' }),
        sq,
        sqRef,
        b('main__sq', 'output_port', 'sq', { portName: 'sq' }),
        b('main__sq2', 'output_port', 'sq2', { portName: 'sq2' }),
      ], [
        w('m1', 'main__u', 'main__gain'),
        w('m2', 'main__gain', 'main__int'),
        w('m3', 'main__int', 'main__y'),
        w('m4', 'main__int', 'main__tag'),
        w('m5', 'main__u', 'main__Sq'),
        w('m6', 'main__u', 'main__Sq2'),
        w('m7', 'main__Sq', 'main__sq'),
        w('m8', 'main__Sq2', 'main__sq2'),
      ]),
      sheet('aux', [
        b('aux__from', 'sheet_label_source', 'FromX', { signalName: 'x' }),
        b('aux__twice', 'evaluate', 'Scaled', { numInputs: 1, expression: 'K2 * in(0)' }),
        b('aux__y2', 'output_port', 'y2', { portName: 'y2' }),
      ], [w('a1', 'aux__from', 'aux__twice'), w('a2', 'aux__twice', 'aux__y2')]),
    ],
    parameters: [param('K', K), param('K2', 3)],
    globalSettings: { simulationTimeStep: 0.01, simulationDuration: 1, integrationAlgorithm: 'rk4' },
  }
}

const ref = (id: string, name: string, modelId: string, extra: Record<string, unknown> = {}) =>
  b(id, 'subsystem', name, { modelRef: { modelId, version: null }, sheets: [], ...extra })

/** Test model: P1 driven by 1, P2 by 2; its own sheet label "x" carries 100. */
function harnessModel(modelId = 'plant') {
  return {
    sheets: [
      sheet('main', [
        b('one', 'source', 'One', { signalType: 'constant', value: 1 }),
        b('two', 'source', 'Two', { signalType: 'constant', value: 2 }),
        ref('P1', 'P1', modelId),
        ref('P2', 'P2', modelId),
        b('o_y1', 'output_port', 'y1', { portName: 'y1' }),
        b('o_y21', 'output_port', 'y21', { portName: 'y21' }),
        b('o_y2', 'output_port', 'y2', { portName: 'y2' }),
        b('o_sq', 'output_port', 'sq', { portName: 'sq' }),
        b('o_sq2', 'output_port', 'sq2', { portName: 'sq2' }),
        b('hundred', 'source', 'Hundred', { signalType: 'constant', value: 100 }),
        b('tag', 'sheet_label_sink', 'MyTag', { signalName: 'x' }),
        b('from', 'sheet_label_source', 'MyFrom', { signalName: 'x' }),
        b('o_x', 'output_port', 'xx', { portName: 'xx' }),
      ], [
        w('h1', 'one', 'P1'),
        w('h2', 'two', 'P2'),
        w('h3', 'P1', 'o_y1', 0, 0),
        w('h4', 'P1', 'o_y21', 0, 3), // y2 is the model's 4th output (main: y, sq, sq2; aux: y2)
        w('h5', 'P2', 'o_y2', 0, 0),
        w('h6', 'P1', 'o_sq', 0, 1),
        w('h7', 'P1', 'o_sq2', 0, 2),
        w('h8', 'hundred', 'tag'),
        w('h9', 'from', 'o_x'),
      ]),
    ],
    parameters: [],
  }
}

function loaderFor(models: Record<string, { name: string; data: any }>): ModelLoader {
  return ({ modelId, version }): ReferencedModel => {
    const m = models[modelId]
    if (!m) throw new ModelReferenceError(`the referenced model (${modelId}) does not exist`)
    return { id: modelId, name: m.name, version, hash: JSON.stringify(m.data).length.toString(), data: m.data }
  }
}

describe('expandModelReferences', () => {
  const loader = loaderFor({ plant: { name: 'Plant', data: plantModel() } })

  test('the interface is the top-level ports in sheet then block order', () => {
    expect(modelInterface(plantModel())).toEqual({ inputs: ['u'], outputs: ['y', 'sq', 'sq2', 'y2'] })
  })

  test('a reference becomes a flattened subsystem holding a namespaced copy of the model', () => {
    const input = harnessModel()
    const { data, dependencies } = expandModelReferences(input, loader, { rootName: 'Harness' })
    expect(hasModelReferences(input.sheets)).toBe(true)
    expect(hasModelReferences(data.sheets)).toBe(false)
    expect(input.sheets[0]!.blocks.find((x: any) => x.id === 'P1')!.parameters.sheets).toEqual([]) // input untouched
    expect(dependencies).toEqual([{ modelId: 'plant', name: 'Plant', version: null, hash: expect.any(String) }])

    const p1 = data.sheets[0].blocks.find((x: any) => x.id === 'P1')
    expect(p1.parameters).toMatchObject({
      codeGenStrategy: 'flatten',
      inputPorts: ['u'],
      outputPorts: ['y', 'sq', 'sq2', 'y2'],
      expandedModelRef: { modelId: 'plant', version: null, name: 'Plant' },
    })
    expect(p1.parameters.modelRef).toBeUndefined()
    const inner = p1.parameters.sheets
    expect(inner.map((s: any) => s.id)).toEqual(['P1~main', 'P1~aux'])
    expect(inner[0].blocks.find((x: any) => x.name === 'TagX').parameters.signalName).toBe('P1~x')
    expect(inner[0].blocks.find((x: any) => x.name === 'Sq2').parameters.referencedSubsystemId).toBe('P1~main__Sq')
    expect(inner[0].connections[0]).toMatchObject({ id: 'P1~m1', sourceBlockId: 'P1~main__u', targetBlockId: 'P1~main__gain' })
    expect(data.parameters.map((p: any) => p.name)).toEqual(['K', 'K2'])
  })

  test('the expanded model runs natively: per-instance inputs, parameters, labels and inner subsystems', () => {
    const { data } = expandModelReferences(harnessModel(), loader)
    const run = compileAndRunNative({
      modelName: 'mref_harness',
      sheets: data.sheets as any,
      parameters: data.parameters as any,
      dt: 0.01,
      smokeMainBody: `
  mref_harness_seed_from_inputs(&model);
  for (int i = 0; i < 100; i++) mref_harness_step(&model);
  printf("%.9f %.9f %.9f %.9f %.9f %.9f\\n", model.outputs.y1, model.outputs.y21, model.outputs.y2,
    model.outputs.sq, model.outputs.sq2, model.outputs.xx);
  return 0;
`,
    })
    try {
      const [y1, y21, y2, sq, sq2, xx] = run.stdout.trim().split(' ').map(Number)
      // Outputs are published before integrating, so after 100 steps y = K·u·0.99
      expect(y1).toBeCloseTo(2 * 1 * 0.99, 6)
      expect(y21).toBeCloseTo(3 * y1!, 6)
      expect(y2).toBeCloseTo(2 * 2 * 0.99, 6)
      expect(sq).toBeCloseTo(3, 9)
      expect(sq2).toBeCloseTo(3, 9)
      expect(xx).toBe(100) // the harness's own label "x" is not the model's
    } finally {
      cleanupNativeDir(run.outDir)
    }
  })

  test('wires follow port names when the interface is reordered; a removed port is an error', () => {
    const h = harnessModel()
    const p1 = h.sheets[0]!.blocks.find((x: any) => x.id === 'P1')!
    // Cached when the interface was [y2, y, sq, sq2]: port 0 meant y2, port 3 sq2
    Object.assign(p1.parameters, { inputPorts: ['u'], outputPorts: ['y2', 'y', 'sq', 'sq2'] })
    const { data } = expandModelReferences(h, loader)
    const index = (id: string) => data.sheets[0].connections.find((c: any) => c.id === id).sourcePortIndex
    expect(index('h3')).toBe(3) // y2
    expect(index('h4')).toBe(2) // sq2
    expect(index('h6')).toBe(0) // y

    Object.assign(p1.parameters, { outputPorts: ['gone', 'y', 'sq', 'sq2'] })
    expect(() => expandModelReferences(h, loader)).toThrow(/output port "gone", which model "Plant" no longer has/)
  })

  test('errors: missing model, cycles, depth, parameter clashes, data stores', () => {
    expect(() => expandModelReferences(harnessModel('nope'), loader)).toThrow(/Model reference "P1": the referenced model \(nope\) does not exist/)

    const a = { sheets: [sheet('main', [ref('toB', 'ToB', 'B')], [])] }
    const bb = { sheets: [sheet('main', [ref('toA', 'ToA', 'A')], [])] }
    const cyc = loaderFor({ A: { name: 'A', data: a }, B: { name: 'B', data: bb } })
    expect(() => expandModelReferences(a, cyc, { rootName: 'A' })).toThrow(/cycle: B → A → B|cycle: A → B → A/)

    const chain: Record<string, { name: string; data: any }> = {}
    for (let i = 0; i < 12; i++) chain[`m${i}`] = { name: `M${i}`, data: { sheets: [sheet('main', [ref(`r${i}`, `R${i}`, `m${i + 1}`)], [])] } }
    chain['m12'] = { name: 'Leaf', data: { sheets: [sheet('main', [], [])] } }
    expect(() => expandModelReferences(chain['m0']!.data, loaderFor(chain))).toThrow(/nested more than 8 deep/)

    const clash = { ...harnessModel(), parameters: [param('K', 5)] }
    expect(() => expandModelReferences(clash, loader, { rootName: 'Harness' })).toThrow(
      /parameter "K" in model "Plant" differs from "K" in "Harness"/
    )
    const same = { ...harnessModel(), parameters: [param('K', 2)] }
    expect(expandModelReferences(same, loader).data.parameters).toHaveLength(2)

    const withStores = loaderFor({ plant: { name: 'Plant', data: { ...plantModel(), dataStores: [{ name: 'S' }] } } })
    expect(() => expandModelReferences(harnessModel(), withStores)).toThrow(/declares data stores/)
  })

  test('code generation refuses an unexpanded model', () => {
    expect(() => new CodeGenerator({ modelName: 'm' }).generate(harnessModel().sheets as any)).toThrow(/must be expanded/)
  })
})

describe('store-backed references', () => {
  let dir: string
  let home: string
  let plantId: string
  let harnessId: string

  beforeAll(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'obliq-mref-'))
    home = path.join(dir, 'home')
    const storage = openStorage(home, { referenceModelsDir: null })
    plantId = storage.models.create({ name: 'Plant', data: plantModel(2) as any }).id // version 1: K = 2
    storage.models.saveSnapshot(plantId, plantModel(4) as any) // version 2: K = 4
    const harness = harnessModel(plantId)
    // Assert P1's y after 1 s: K·0.99 for latest (K = 4)
    harness.sheets[0]!.blocks.push(b('chk', 'assert', 'LatestK', { mode: 'bounds', lower: 3.95, upper: 3.97, checkFrom: 0.995 }))
    harness.sheets[0]!.connections.push(w('hc', 'P1', 'chk'))
    ;(harness as any).globalSettings = { simulationTimeStep: 0.01, simulationDuration: 1 }
    harnessId = storage.models.create({ name: 'Harness', data: harness as any }).id
    storage.db.close()
  })
  afterAll(() => fs.rmSync(dir, { recursive: true, force: true }))

  test('latest reads the current file; a pinned reference reads that version', () => {
    const storage = openStorage(home, { referenceModelsDir: null })
    try {
      const load = storageModelLoader(storage)
      const latest = load({ modelId: plantId, version: null })
      const v1 = load({ modelId: plantId, version: 1 })
      expect(latest.data.parameters![0].value).toBe(4)
      expect(v1.data.parameters![0].value).toBe(2)
      expect(latest.hash).not.toBe(v1.hash)
      expect(() => load({ modelId: plantId, version: 9 })).toThrow(/model "Plant" has no version 9/)
    } finally {
      storage.db.close()
    }
  })

  test('obliq:test expands references from the store', () => {
    const { targets, errors } = resolveTestTargets(['Harness'], { home })
    expect(errors).toEqual([])
    expect(hasModelReferences(targets[0]!.data.sheets)).toBe(false)
    const r = runModelTests(targets[0]!)
    expect(r.status).toBe('passed')
    expect(r.asserts[0]).toMatchObject({ name: 'LatestK', status: 'passed' })
  })
})
