/**
 * @jest-environment node
 *
 * Model Builder API: addModelReference and setModelReference.
 */
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { openStorage, type Storage } from '@/lib/server/storage'
import { handleAddModelReference, handleSetModelReference } from '@/app/api/model-builder/handlers/block/model-reference'
import { plantModel, sheet, b } from './support/modelRefFixtures'

let dir: string
let storage: Storage
let plantId: string
let otherId: string
let hostId: string

const ctx = (body: any) => ({ storage, body, searchParams: new URLSearchParams(), userId: 'u', token: '', startTime: 0 }) as any
const call = async (fn: (c: any) => Promise<any>, body: any) => {
  const res = await fn(ctx(body))
  return { status: res.status, json: await res.json() }
}
const host = () => storage.models.readCurrent(hostId).data as any

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'obliq-mref-api-'))
  storage = openStorage(path.join(dir, 'home'), { referenceModelsDir: null })
  plantId = storage.models.create({ name: 'Plant', data: plantModel() as any }).id
  // A model with ports y and y2 only, in a different order
  otherId = storage.models.create({
    name: 'Other',
    data: {
      sheets: [sheet('main', [
        b('i', 'input_port', 'u', { portName: 'u' }),
        b('o2', 'output_port', 'y2', { portName: 'y2' }),
        b('o1', 'output_port', 'y', { portName: 'y' }),
      ], [])],
    } as any,
  }).id
  hostId = storage.models.create({
    name: 'Host',
    data: { sheets: [sheet('main', [b('one', 'source', 'One', { value: 1 }), b('out', 'output_port', 'Out', { portName: 'Out' })], [])] } as any,
  }).id
})
afterAll(() => {
  storage.db.close()
  fs.rmSync(dir, { recursive: true, force: true })
})

describe('Model Builder: model references', () => {
  let blockId: string

  test('addModelReference creates the block with the model’s ports', async () => {
    const r = await call(handleAddModelReference, { modelId: hostId, sheetId: 'main', referencedModelId: plantId })
    expect(r.status).toBe(201)
    expect(r.json.data.ports).toEqual({ inputs: ['u'], outputs: ['y', 'sq', 'sq2', 'y2'] })
    expect(r.json.data.block).toMatchObject({
      type: 'subsystem',
      name: 'Plant',
      parameters: { modelRef: { modelId: plantId, version: null, name: 'Plant' }, sheets: [], outputPorts: ['y', 'sq', 'sq2', 'y2'] },
    })
    blockId = r.json.data.block.id
    // A second one gets a unique name
    const r2 = await call(handleAddModelReference, { modelId: hostId, sheetId: 'main', referencedModelId: plantId, version: 1 })
    expect(r2.json.data.block.name).toBe('Plant2')
    expect(r2.json.data.block.parameters.modelRef.version).toBe(1)
  })

  test('errors: self reference, unknown model, bad version', async () => {
    expect((await call(handleAddModelReference, { modelId: hostId, sheetId: 'main', referencedModelId: hostId })).status).toBe(400)
    const unknown = await call(handleAddModelReference, { modelId: hostId, sheetId: 'main', referencedModelId: 'nope' })
    expect(unknown.status).toBe(404)
    expect(unknown.json.error).toMatch(/does not exist/)
    expect((await call(handleAddModelReference, { modelId: hostId, sheetId: 'main', referencedModelId: plantId, version: 7 })).status).toBe(404)
    expect((await call(handleAddModelReference, { modelId: hostId, sheetId: 'main', referencedModelId: plantId, version: -1 })).status).toBe(400)
  })

  test('setModelReference retargets by port name, refusing to drop wires unless asked', async () => {
    // Wire Plant's y (port 0) and sq (port 1)
    const data = host()
    data.sheets[0].connections.push(
      { id: 'wy', sourceBlockId: blockId, sourcePortIndex: 0, targetBlockId: 'out', targetPortIndex: 0 },
      { id: 'wsq', sourceBlockId: blockId, sourcePortIndex: 1, targetBlockId: 'out', targetPortIndex: 0 }
    )
    storage.models.writeInPlace(hostId, data, {})

    const refused = await call(handleSetModelReference, { modelId: hostId, blockId, referencedModelId: otherId })
    expect(refused.status).toBe(409)
    expect(refused.json.error).toMatch(/does not have: sq/)

    const ok = await call(handleSetModelReference, { modelId: hostId, blockId, referencedModelId: otherId, dropMissingWires: true })
    expect(ok.status).toBe(200)
    expect(ok.json.data).toMatchObject({ removedWires: 1, ports: { inputs: ['u'], outputs: ['y2', 'y'] } })
    const after = host().sheets[0].connections
    expect(after.find((c: any) => c.id === 'wy').sourcePortIndex).toBe(1) // y moved to index 1
    expect(after.some((c: any) => c.id === 'wsq')).toBe(false)

    // Version only: pin Other at v1
    const pin = await call(handleSetModelReference, { modelId: hostId, blockId, version: 1 })
    expect(pin.json.data.block.parameters.modelRef).toMatchObject({ modelId: otherId, version: 1 })
  })

  test('setModelReference rejects a block that is not a model reference', async () => {
    const r = await call(handleSetModelReference, { modelId: hostId, blockId: 'one', referencedModelId: plantId })
    expect(r.status).toBe(400)
  })
})
