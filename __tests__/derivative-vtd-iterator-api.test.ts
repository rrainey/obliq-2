/**
 * @jest-environment node
 *
 * Model Builder API, end to end: build a model with a For Iterator Subsystem
 * (body: y = u * i), a Derivative and a Variable Transport Delay with the
 * addBlock / addConnection / updateBlockParameters handlers (the MCP
 * add_block, add_connection and update_block_parameters tools call them).
 * Then generate C from the stored model, compile it and run it.
 */
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { execSync } from 'child_process'
import { openStorage, type Storage } from '@/lib/server/storage'
import { handleAddBlock, handleUpdateBlockParameters } from '@/app/api/model-builder/handlers/block'
import { handleAddConnection } from '@/app/api/model-builder/handlers/connection'
import { validateModelTypeCompatibilityMultiSheet } from '@/lib/typeCompatibilityValidator'
import { cleanupNativeDir, compileAndRunNative, parseResultLine } from './support/nativeCgen'

jest.setTimeout(180000)

const hasToolchain = (() => {
  try {
    execSync('gcc --version && cmake --version', { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
})()
const nativeTest = hasToolchain ? test : test.skip

let dir: string
let storage: Storage
let modelId: string
const outDirs: string[] = []

const ctx = (body: any) => ({ storage, body, searchParams: new URLSearchParams(), userId: 'u', token: '', startTime: 0 }) as any
const call = async (fn: (c: any) => Promise<any>, body: any) => {
  const res = await fn(ctx(body))
  return { status: res.status, json: await res.json() }
}
const data = () => storage.models.readCurrent(modelId).data as any
const addBlock = (sheetId: string, blockType: string, name: string, parameters?: Record<string, unknown>) =>
  call(handleAddBlock, { modelId, sheetId, blockType, name, parameters, position: { x: 0, y: 0 } })
const connect = (sheetId: string, s: string, sp: number, t: string, tp: number) =>
  call(handleAddConnection, { modelId, sheetId, sourceBlockId: s, sourcePortIndex: sp, targetBlockId: t, targetPortIndex: tp })

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'obliq-fi-api-'))
  storage = openStorage(path.join(dir, 'home'), { referenceModelsDir: null })
  modelId = storage.models.create({
    name: 'FI API',
    data: { sheets: [{ id: 'main', name: 'Main', blocks: [], connections: [], extents: { width: 800, height: 600 } }] } as any,
  }).id
})
afterAll(() => {
  outDirs.forEach(cleanupNativeDir)
  storage.db.close()
  fs.rmSync(dir, { recursive: true, force: true })
})

describe('Model Builder API: For Iterator Subsystem, Derivative, Variable Transport Delay', () => {
  let fiId: string
  let bodyId: string
  let inId: string
  let outId: string

  test('addBlock rejects bad parameters', async () => {
    for (const [type, params] of [
      ['for_iterator_subsystem', { iterationLimit: 0 }],
      ['for_iterator_subsystem', { codeGenStrategy: 'flatten' }],
      ['variable_transport_delay', { maximumPoints: 1 }],
      ['derivative', { initialCondition: 'x' }],
      ['iteration_index', { indexBase: 3 }],
    ] as const) {
      const r = await addBlock('main', type, 'Bad', params)
      expect({ type, status: r.status }).toEqual({ type, status: 400 })
    }
    expect(data().sheets[0].blocks).toEqual([])
  })

  test('addBlock creates a For Iterator with a body sheet, and gives the body sheet ID', async () => {
    const r = await addBlock('main', 'for_iterator_subsystem', 'Loop', { iterationLimit: 3, accumulateOutputs: true })
    expect(r.status).toBe(201)
    fiId = r.json.data.block.id
    expect(r.json.data.block.parameters).toMatchObject({
      iterationLimit: 3, indexBase: 1, resetStates: 'held', accumulateOutputs: true, codeGenStrategy: 'segregated_atomic',
    })
    expect(r.json.data.block.ports).toEqual({ inputs: ['Input1'], outputs: ['Output1'] })
    expect(r.json.data.subsystemSheet).toBeDefined()
    bodyId = r.json.data.subsystemSheet.id
    inId = r.json.data.subsystemSheet.inputPort.id
    outId = r.json.data.subsystemSheet.outputPort.id
    expect(data().sheets[0].blocks[0].parameters.sheets[0].id).toBe(bodyId)
  })

  test('addBlock and addConnection work in the body sheet', async () => {
    const idx = await addBlock(bodyId, 'iteration_index', 'Idx')
    expect(idx.status).toBe(201)
    expect(idx.json.data.block.ports).toEqual({ inputs: [], outputs: ['i'] })
    const mul = await addBlock(bodyId, 'multiply', 'Mul', { numInputs: 2 })
    expect(mul.status).toBe(201)
    const mulId = mul.json.data.block.id
    expect((await connect(bodyId, inId, 0, mulId, 0)).status).toBe(201)
    expect((await connect(bodyId, idx.json.data.block.id, 0, mulId, 1)).status).toBe(201)
    expect((await connect(bodyId, mulId, 0, outId, 0)).status).toBe(201)
  })

  test('updateBlockParameters on the For Iterator keeps the body', async () => {
    const r = await call(handleUpdateBlockParameters, { modelId, blockId: fiId, parameters: { indexBase: 1, resetStates: 'held' } })
    expect(r.status).toBe(200)
    const fi = data().sheets[0].blocks.find((x: any) => x.id === fiId)
    expect(fi.parameters.iterationLimit).toBe(3)
    expect(fi.parameters.accumulateOutputs).toBe(true)
    expect(fi.parameters.sheets[0].blocks).toHaveLength(4)
    const bad = await call(handleUpdateBlockParameters, { modelId, blockId: fiId, parameters: { resetStates: 'sometimes' } })
    expect(bad.status).toBe(400)
  })

  test('the parent sheet: source -> For Iterator -> output, and a derivative and a delay', async () => {
    const one = await addBlock('main', 'source', 'One', { signalType: 'constant', value: 1 })
    const ramp = await addBlock('main', 'integrator', 'Ramp', { initialValue: 0 })
    const u = await addBlock('main', 'source', 'U', { signalType: 'constant', value: 2 })
    const Y = await addBlock('main', 'output_port', 'Y', { portName: 'Y' })
    const der = await addBlock('main', 'derivative', 'D', { initialCondition: 0 })
    const Yd = await addBlock('main', 'output_port', 'Yd', { portName: 'Yd' })
    const dl = await addBlock('main', 'source', 'Dl', { signalType: 'constant', value: 0.05 })
    const vtd = await addBlock('main', 'variable_transport_delay', 'VTD', { maximumDelay: 0.5, maximumPoints: 100, initialInput: 0 })
    const Yv = await addBlock('main', 'output_port', 'Yv', { portName: 'Yv' })
    for (const r of [one, ramp, u, Y, der, Yd, dl, vtd, Yv]) expect(r.status).toBe(201)
    expect(der.json.data.block.ports).toEqual({ inputs: ['u'], outputs: ['du_dt'] })
    expect(vtd.json.data.block.ports).toEqual({ inputs: ['u', 'delay_sec'], outputs: ['y'] })
    expect(vtd.json.data.block.parameters).toEqual({ maximumDelay: 0.5, maximumPoints: 100, initialInput: 0 })
    const id = (r: any) => r.json.data.block.id
    const wires: Array<[any, number, any, number]> = [
      [u, 0, { json: { data: { block: { id: fiId } } } }, 0],
      [{ json: { data: { block: { id: fiId } } } }, 0, Y, 0],
      [one, 0, ramp, 0], [ramp, 0, der, 0], [der, 0, Yd, 0],
      [ramp, 0, vtd, 0], [dl, 0, vtd, 1], [vtd, 0, Yv, 0],
    ]
    for (const [s, sp, t, tp] of wires) {
      const r = await connect('main', id(s), sp, id(t), tp)
      expect({ s: id(s), t: id(t), status: r.status }).toEqual({ s: id(s), t: id(t), status: 201 })
    }
    // The delay input of the Variable Transport Delay is port 1 (delay_sec)
    expect((await connect('main', id(dl), 0, id(vtd), 1)).status).toBe(400) // already connected
    expect(validateModelTypeCompatibilityMultiSheet(data().sheets).errors).toEqual([])
  })

  nativeTest('the stored model generates C that compiles and gives the expected values', () => {
    const r = compileAndRunNative({
      modelName: 'fi_api',
      sheets: data().sheets,
      dt: 0.01,
      smokeMainBody: `
  fi_api_seed_from_inputs(&model);
  for (int k = 0; k < 50; ++k) fi_api_step(&model);
  printf("Y=%.17g\\nYd=%.17g\\nYv=%.17g\\nt=%.17g\\n", model.outputs.Y, model.outputs.Yd, model.outputs.Yv, model.time);
  return 0;`,
    })
    outDirs.push(r.outDir)
    expect(r.subsystemFiles).toHaveLength(1)
    // (1 + 2 + 3) * 2
    expect(parseResultLine(r.stdout, 'Y')).toBeCloseTo(12, 9)
    // The derivative of the ramp t is 1
    expect(parseResultLine(r.stdout, 'Yd')).toBeCloseTo(1, 9)
    // The outputs of the last step are for t = 0.49: the delay gives 0.49 - 0.05
    expect(parseResultLine(r.stdout, 'Yv')).toBeCloseTo(0.44, 9)
  })
})
