/**
 * Assert blocks in the simulation WASM build: the generator defines
 * OBLIQ_ASSERTS, the wrapper exports results and the stop request through the
 * shared export list, and the JS reader turns them into AssertResult objects.
 *
 * Compiles with the obliq-emscripten Docker image (as the compile routes do);
 * skipped when the image is not available.
 */
import { execSync } from 'child_process'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { WasmCodeGenerator } from '@/lib/wasm/codegen/WasmCodeGenerator'
import { emccExportedFunctionsArg } from '@/lib/wasm/wasmExports'
import {
  findStoppingAssert,
  readWasmAssertResults,
  simulationStepCount,
  summarizeAsserts,
  wasmStopRequested,
} from '@/lib/simulation/assertResults'
import { Sheet } from '@/lib/simulationTypes'
import { BlockData } from '@/components/BlockNode'
import { WireData } from '@/components/Wire'

jest.setTimeout(240000)

const IMAGE = 'obliq-emscripten:latest'

function hasImage(): boolean {
  try {
    execSync(`docker image inspect ${IMAGE}`, { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

const b = (id: string, type: string, name: string, parameters: Record<string, unknown> = {}): BlockData => ({
  id,
  type,
  name,
  position: { x: 0, y: 0 },
  parameters,
})
const w = (id: string, s: string, t: string, targetPortIndex = 0): WireData => ({
  id,
  sourceBlockId: s,
  sourcePortIndex: 0,
  targetBlockId: t,
  targetPortIndex,
})

/** Generates, compiles and loads a model's simulation module. */
async function buildModule(modelName: string, sheets: Sheet[], dir: string): Promise<any> {
  const gen = new WasmCodeGenerator({ modelName })
  const result = gen.generateWasm(sheets, [])
  fs.writeFileSync(path.join(dir, `${modelName}.h`), result.header)
  fs.writeFileSync(path.join(dir, `${modelName}.c`), result.source)
  fs.writeFileSync(path.join(dir, `${modelName}_wasm.c`), result.wasmWrapper)
  const uid = `${process.getuid?.() ?? 0}:${process.getgid?.() ?? 0}`
  execSync(
    `docker run --rm --user ${uid} -v "${dir}:/workspace" ${IMAGE} ` +
      `emcc /workspace/${modelName}.c /workspace/${modelName}_wasm.c ` +
      `-I/workspace -o /workspace/${modelName}.js ` +
      `-s WASM=1 ` +
      emccExportedFunctionsArg() +
      `-s "EXPORTED_RUNTIME_METHODS=[\\"ccall\\",\\"cwrap\\",\\"UTF8ToString\\"]" ` +
      `-s MODULARIZE=1 -s "EXPORT_NAME=createModule" -s ALLOW_MEMORY_GROWTH=1 -O2 -lm`,
    { stdio: 'pipe' }
  )
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const createModule = require(path.join(dir, `${modelName}.js`))
  return createModule()
}

const ramp = b('r', 'source', 'Ramp', { signalType: 'ramp', slope: 1, startValue: 0 })
const sheet = (blocks: BlockData[], connections: WireData[]): Sheet[] => [
  { id: 'main', name: 'Main', blocks, connections, extents: { width: 1000, height: 800 } },
]

const describeIfDocker = hasImage() ? describe : describe.skip

describeIfDocker('Assert blocks in the WASM simulation build', () => {
  let dir: string
  beforeAll(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'obliq-assert-wasm-'))
  })
  afterAll(() => {
    if (!process.env.KEEP_NATIVE) fs.rmSync(dir, { recursive: true, force: true })
  })

  test('the generator defines OBLIQ_ASSERTS for simulation builds', () => {
    const result = new WasmCodeGenerator({ modelName: 'm' }).generateWasm(sheet([ramp], []), [])
    expect(result.header).toMatch(/#define OBLIQ_ASSERTS 1/)
    expect(result.wasmWrapper).toMatch(/int wasm_get_assert_count\(void\)/)
    expect(result.wasmWrapper).toMatch(/int wasm_stop_requested\(void\)/)
  })

  test('results are read through the wrapper, and a stop-on-failure Assert ends the run', async () => {
    const sheets = sheet(
      [
        ramp,
        b('pass', 'assert', 'StaysPositive', { mode: 'bounds', lower: 0, upper: null }),
        b('late', 'assert', 'AfterTheEnd', { mode: 'bounds', lower: 0, upper: 1, checkFrom: 100 }),
        b('fail', 'assert', 'Overshoot', { mode: 'bounds', lower: -1, upper: 0.505 }),
        b('stop', 'assert', 'Limit', { mode: 'bounds', lower: -1, upper: 0.995, onFailure: 'stop' }),
      ],
      [w('w1', 'r', 'pass'), w('w2', 'r', 'late'), w('w3', 'r', 'fail'), w('w4', 'r', 'stop')]
    )
    const mod = await buildModule('assert_wasm', sheets, dir)

    const dt = 0.01
    const numSteps = simulationStepCount(3, dt)
    expect(numSteps).toBe(300)
    mod._wasm_init(dt)
    let stepsRun = 0
    for (let i = 0; i < numSteps; i++) {
      mod._wasm_step(dt)
      stepsRun++
      if (wasmStopRequested(mod)) break
    }
    expect(stepsRun).toBe(101)

    const results = readWasmAssertResults(mod)
    const byName = new Map(results.map(r => [r.name, r]))
    expect(byName.get('StaysPositive')).toMatchObject({ blockId: 'pass', status: 'passed', checks: 101, failures: 0, firstFailTime: null })
    expect(byName.get('AfterTheEnd')).toMatchObject({ status: 'not_checked', checks: 0 })
    const over = byName.get('Overshoot')!
    expect(over.status).toBe('failed')
    expect(over.firstFailTime).toBeCloseTo(0.51, 9)
    expect(over.firstFailIndex).toBeNull()
    expect(byName.get('Limit')).toMatchObject({ status: 'failed', stopsOnFailure: true, failures: 1 })

    expect(findStoppingAssert(results)).toMatchObject({ blockId: 'stop', name: 'Limit' })
    expect(findStoppingAssert(results)!.time).toBeCloseTo(1, 9)
    expect(summarizeAsserts(results)).toEqual({ passed: 1, failed: 2, notChecked: 1 })
  })

  test('a model without Asserts reports none and never requests a stop', async () => {
    const mod = await buildModule('no_assert_wasm', sheet([ramp, b('o', 'output_port', 'Out', { portName: 'Out' })], [w('w', 'r', 'o')]), dir)
    mod._wasm_init(0.01)
    for (let i = 0; i < 10; i++) mod._wasm_step(0.01)
    expect(wasmStopRequested(mod)).toBe(false)
    expect(readWasmAssertResults(mod)).toEqual([])
  })
})

describe('simulationStepCount', () => {
  test('rounds so durations that are multiples of the step are not cut short', () => {
    expect(Math.floor(0.3 / 0.1)).toBe(2) // 2.9999999999999996
    expect(simulationStepCount(0.3, 0.1)).toBe(3)
    expect(simulationStepCount(10, 0.1)).toBe(100)
    expect(simulationStepCount(1, 0.001)).toBe(1000)
    expect(simulationStepCount(0, 0.01)).toBe(0)
    expect(simulationStepCount(1, 0)).toBe(0)
  })

  test('readers tolerate modules built before Asserts', () => {
    expect(readWasmAssertResults({})).toEqual([])
    expect(wasmStopRequested({})).toBe(false)
  })
})
