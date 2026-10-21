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
import { findModelDependents, storageModelLoader } from '@/lib/server/modelReferenceLoader'
import { resolveTestTargets } from '@/lib/testing/resolveTestTargets'
import { runModelTests } from '@/lib/testing/modelTestRunner'
import { cleanupNativeDir, compileAndRunNative } from './support/nativeCgen'
import { b, harnessModel, param, plantModel, ref, sheet, w } from './support/modelRefFixtures'

jest.setTimeout(180000)

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

  test('a reference whose id is unknown falls back to the one model with its recorded name', () => {
    const storage = openStorage(home, { referenceModelsDir: null })
    try {
      const load = storageModelLoader(storage)
      expect(load({ modelId: 'imported-elsewhere', version: null, name: 'Plant' }).id).toBe(plantId)
      expect(() => load({ modelId: 'imported-elsewhere', version: null, name: 'Nope' })).toThrow(
        /the referenced model "Nope" \(imported-elsewhere\) does not exist/
      )
      // Ambiguous names do not resolve
      const twin = storage.models.create({ name: 'Plant', data: plantModel(9) as any }).id
      expect(() => load({ modelId: 'imported-elsewhere', version: null, name: 'Plant' })).toThrow(/does not exist/)
      storage.models.delete(twin)
    } finally {
      storage.db.close()
    }
  })

  test('dependents: models whose current file references a model', () => {
    const storage = openStorage(home, { referenceModelsDir: null })
    try {
      expect(findModelDependents(storage, plantId)).toEqual([{ id: harnessId, name: 'Harness', versions: [null] }])
      expect(findModelDependents(storage, harnessId)).toEqual([])
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
