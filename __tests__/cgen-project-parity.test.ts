/**
 * @jest-environment node
 *
 * The editor's C code download and the command line deliver the same project.
 * Runs the real route and scripts/obliq-cgen.ts on the same models, then builds
 * and runs what they produce.
 */
import { execFileSync } from 'child_process'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import JSZip from 'jszip'
import { NextRequest } from 'next/server'
import { getStorage, resetStorage } from '@/lib/server/storage'
import { SESSION_COOKIE, sessionCookieValue } from '@/lib/server/session'
import { POST } from '@/app/api/generate-code/route'

jest.setTimeout(300000)

const ROOT = path.resolve(__dirname, '..')
const b = (id: string, type: string, name: string, parameters: Record<string, unknown> = {}) => ({ id, type, name, position: { x: 0, y: 0 }, parameters })
const wire = (id: string, s: string, t: string) => ({ id, sourceBlockId: s, sourcePortIndex: 0, targetBlockId: t, targetPortIndex: 0 })
const settings = { simulationTimeStep: 0.01, simulationDuration: 1, integrationAlgorithm: 'rk4' }

const constantModel = {
  sheets: [{ id: 'main', name: 'Main', extents: { width: 1000, height: 1000 },
    blocks: [b('s', 'source', 'S', { signalType: 'constant', value: 1, dataType: 'double' }), b('o', 'output_port', 'O', { portName: 'y' })],
    connections: [wire('a', 's', 'o')] }],
  parameters: [], globalSettings: settings,
}
const storeModel = {
  ...constantModel,
  dataStores: [{ name: 'trim', dataType: 'double', initialValue: '5.0' }],
  sheets: [{ ...constantModel.sheets[0]!,
    blocks: [b('r', 'data_store_read', 'R', { storeName: 'trim', dataType: 'double' }), b('o', 'output_port', 'O', { portName: 'y' })],
    connections: [wire('a', 'r', 'o')] }],
}

let home: string
let work: string
const originalLog = console.log

beforeAll(() => {
  console.log = () => {}
  jest.spyOn(console, 'warn').mockImplementation(() => {})
  home = fs.mkdtempSync(path.join(os.tmpdir(), 'obliq-parity-home-'))
  work = fs.mkdtempSync(path.join(os.tmpdir(), 'obliq-parity-'))
  process.env.OBLIQ_HOME = home
  resetStorage()
})

afterAll(() => {
  console.log = originalLog
  jest.restoreAllMocks()
  resetStorage()
  delete process.env.OBLIQ_HOME
  fs.rmSync(home, { recursive: true, force: true })
  fs.rmSync(work, { recursive: true, force: true })
})

async function download(modelId: string): Promise<Record<string, string>> {
  const request = new NextRequest('http://localhost:3000/api/generate-code', {
    method: 'POST',
    headers: { cookie: `${SESSION_COOKIE}=${sessionCookieValue()}`, 'content-type': 'application/json' },
    body: JSON.stringify({ modelId }),
  })
  const response = await POST(request, {} as never)
  expect(response.status).toBe(200)
  const zip = await JSZip.loadAsync(Buffer.from(await response.arrayBuffer()))
  const files: Record<string, string> = {}
  for (const name of Object.keys(zip.files)) files[name] = await zip.files[name]!.async('string')
  return files
}

function commandLine(modelFile: string, tag: string): Record<string, string> {
  const out = path.join(work, `cli-${tag}`)
  execFileSync('npx', ['tsx', 'scripts/obliq-cgen.ts', modelFile, '--out', out], { cwd: ROOT, stdio: 'ignore', env: { ...process.env, OBLIQ_HOME: home } })
  return Object.fromEntries(fs.readdirSync(out).map(f => [f, fs.readFileSync(path.join(out, f), 'utf8')]))
}

/** Removes only what must differ: timestamps, the saved version and where the model came from. */
function comparable(files: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(files).map(([name, text]) => {
    if (name === 'cgen-manifest.json') {
      const { generatedAt, sourceJson, modelVersion, ...rest } = JSON.parse(text)
      return [name, JSON.stringify(rest)]
    }
    return [name, text
      .replace(/Generated on: .*/g, 'Generated on:')
      .replace(/^version=.*$/m, 'version=')
      .replace(/^(# .*generated C library) \(version \d+\)$/m, '$1')]
  }))
}

function writeProject(files: Record<string, string>, tag: string): string {
  const dir = path.join(work, tag)
  fs.mkdirSync(dir, { recursive: true })
  for (const [name, text] of Object.entries(files)) fs.writeFileSync(path.join(dir, name), text)
  return dir
}

/** Builds with the project's own CMakeLists.txt and runs its smoke test. */
function cmakeSmoke(dir: string, modelName: string): string {
  const build = path.join(dir, 'build')
  execFileSync('cmake', ['-S', dir, '-B', build], { stdio: 'pipe' })
  execFileSync('cmake', ['--build', build], { stdio: 'pipe' })
  return execFileSync(path.join(build, `${modelName}_smoke`)).toString()
}

const stored = (name: string, data: unknown) => getStorage().models.create({ name, data: data as never }).id
const modelFile = (name: string, data: unknown) => {
  const file = path.join(work, `${name.replace(/\W/g, '_')}.json`)
  fs.writeFileSync(file, JSON.stringify({ name, data }))
  return file
}

describe('automations API generateCode', () => {
  test('passes parameters and data stores, and lists safe file names and segregated modules', async () => {
    const read = (f: string) => JSON.parse(fs.readFileSync(path.join(ROOT, 'reference-models', f), 'utf8'))
    const vehicle = read('fpv-vehicle.json')
    const id = stored('Automation Model', vehicle.data)
    const { ApiTokenService } = await import('@/lib/apiTokenService')
    const token = ApiTokenService.generateToken()
    getStorage().tokens.create({ name: 'parity', tokenHash: ApiTokenService.hashToken(token), expiresAt: null })
    const { POST: automate } = await import('@/app/api/automations/route')
    const response = await automate(new NextRequest('http://localhost:3000/api/automations', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'generateCode', modelId: id }),
    }))
    const body = await response.json()
    expect(body.success).toBe(true)
    expect(body.data.filesGenerated).toEqual(expect.arrayContaining(['Automation_Model.c', 'Automation_Model.h', 'Motor_RR.c', 'Motor_RR.h']))
    expect(body.data.filesGenerated.join(' ')).not.toContain('undefined')
    expect(body.data.summary.headerFile).toBe('Automation_Model.h')
  })
})

describe('C project download and command line', () => {
  test.each([
    ['a name with a space', 'Plain Model', constantModel, 'Plain_Model'],
    ['a name C does not allow', '2nd-stage.v1', constantModel, '_2nd_stage_v1'],
    ['a declared data store', 'Store Model', storeModel, 'Store_Model'],
  ])('%s: the same files, and the project builds', async (_label, name, data, modelName) => {
    const zip = await download(stored(name, data))
    const cli = commandLine(modelFile(name, data), modelName)
    expect(Object.keys(zip).sort()).toEqual(Object.keys(cli).sort())
    expect(Object.keys(zip).sort()).toEqual(
      ['CMakeLists.txt', 'README.md', 'cgen-manifest.json', 'library.properties', `${modelName}.c`, `${modelName}.h`, 'smoke_main.c'].sort()
    )
    expect(comparable(zip)).toEqual(comparable(cli))
    expect(cmakeSmoke(writeProject(zip, `zip-${modelName}`), modelName)).toContain('smoke ok')
  })

  test('a model with a segregated subsystem and a model reference: the same files, and every listed file exists', async () => {
    const read = (f: string) => JSON.parse(fs.readFileSync(path.join(ROOT, 'reference-models', f), 'utf8'))
    const vehicle = read('fpv-vehicle.json'), acro = read('fpv-acro-rate-step.json')
    stored(vehicle.name, vehicle.data)
    const zip = await download(stored(acro.name, acro.data))
    const cli = commandLine('reference-models/fpv-acro-rate-step.json', 'acro')
    expect(Object.keys(zip).sort()).toEqual(Object.keys(cli).sort())
    expect(Object.keys(zip)).toEqual(expect.arrayContaining(['Motor_RR.c', 'Motor_RR.h']))
    expect(comparable(zip)).toEqual(comparable(cli))
    for (const f of JSON.parse(zip['cgen-manifest.json']!).files) expect(zip[f]).toBeDefined()
    expect(JSON.parse(zip['cgen-manifest.json']!).modelVersion).toBe(1)
  })

  test('a data store keeps its declared initial value in the download', async () => {
    const zip = await download(stored('Store Value', storeModel))
    const dir = writeProject(zip, 'zip-store-value')
    fs.writeFileSync(path.join(dir, 'host.c'), `#include <stdio.h>
#include "Store_Value.h"
int main(void) { static Store_Value_t m; Store_Value_init(&m, 0.01); Store_Value_seed_from_inputs(&m); Store_Value_step(&m); printf("%g", m.outputs.y); return 0; }
`)
    execFileSync('gcc', ['-std=c11', '-w', 'Store_Value.c', 'host.c', '-lm', '-o', 'host'], { cwd: dir, stdio: 'pipe' })
    expect(execFileSync(path.join(dir, 'host')).toString()).toBe('5')
  })

  test("the README's C example compiles and runs, and uses valid names", async () => {
    const zip = await download(stored('Readme Model', constantModel))
    const readme = zip['README.md']!
    expect(readme).not.toContain('Readme Model.h')
    expect(readme).toContain('Readme_Model_seed_from_inputs')
    const dir = writeProject(zip, 'zip-readme')
    fs.writeFileSync(path.join(dir, 'example.c'), readme.match(/```c\n([\s\S]*?)```/)![1]!)
    execFileSync('gcc', ['-std=c11', '-w', 'Readme_Model.c', 'example.c', '-lm', '-o', 'example'], { cwd: dir, stdio: 'pipe' })
    execFileSync(path.join(dir, 'example'))
  })

  test('smoke_main.c defines no main() outside the CMake build, as PlatformIO compiles every source', async () => {
    const zip = await download(stored('Library Model', constantModel))
    const dir = writeProject(zip, 'zip-library')
    fs.writeFileSync(path.join(dir, 'app.c'), 'int main(void) { return 0; }\n')
    const sources = fs.readdirSync(dir).filter(f => f.endsWith('.c'))
    expect(sources).toContain('smoke_main.c')
    execFileSync('gcc', ['-std=c11', '-w', ...sources, '-lm', '-o', 'app'], { cwd: dir, stdio: 'pipe' })
  })
})
