/**
 * obliq:test: the native runner, argument resolution against a model store,
 * the text/JUnit reports and the CLI's exit codes.
 */
import { spawnSync } from 'child_process'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import {
  ModelTestReport,
  exitCodeFor,
  formatJUnitReport,
  formatTextReport,
  modelHasAsserts,
  parseRunOutput,
  runModelTests,
} from '@/lib/testing/modelTestRunner'
import { resolveTestTargets } from '@/lib/testing/resolveTestTargets'
import { openStorage } from '@/lib/server/storage'

jest.setTimeout(180000)

const b = (id: string, type: string, name: string, parameters: Record<string, unknown> = {}) => ({
  id,
  type,
  name,
  position: { x: 0, y: 0 },
  parameters,
})
const w = (id: string, s: string, t: string) => ({ id, sourceBlockId: s, sourcePortIndex: 0, targetBlockId: t, targetPortIndex: 0 })

/** Ramp r = t fed to the given Asserts; 3 s at 0.01 s unless overridden. */
function rampModel(asserts: ReturnType<typeof b>[], globalSettings: Record<string, unknown> = {}) {
  return {
    version: '2.1',
    sheets: [
      {
        id: 'main',
        name: 'Main',
        extents: { width: 800, height: 600 },
        blocks: [b('r', 'source', 'Ramp', { signalType: 'ramp', slope: 1 }), ...asserts],
        connections: asserts.map((a, i) => w(`w${i}`, 'r', a.id)),
      },
    ],
    parameters: [],
    globalSettings: { simulationTimeStep: 0.01, simulationDuration: 3, integrationAlgorithm: 'rk4', ...globalSettings },
  }
}

const passing = () => rampModel([b('a', 'assert', 'Positive', { lower: 0, upper: null })])
const failing = () =>
  rampModel([
    b('a', 'assert', 'Positive', { lower: 0, upper: null }),
    b('c', 'assert', 'Small', { lower: -1, upper: 1.505 }),
  ])

describe('runModelTests', () => {
  test('a passing model', () => {
    const r = runModelTests({ name: 'Pass', data: passing() })
    expect(r).toMatchObject({ status: 'passed', steps: 300, stepsRun: 300, timeStep: 0.01, duration: 3, integrationAlgorithm: 'rk4' })
    expect(r.asserts).toHaveLength(1)
    expect(r.asserts[0]).toMatchObject({ blockId: 'a', name: 'Positive', status: 'passed', checks: 300 })
  })

  test('a failing model, with the model’s own settings (Euler, 2 s)', () => {
    const data = failing()
    data.globalSettings = { simulationTimeStep: 0.01, simulationDuration: 2, integrationAlgorithm: 'euler' }
    const r = runModelTests({ name: 'Fail', data })
    expect(r).toMatchObject({ status: 'failed', steps: 200, stepsRun: 200, integrationAlgorithm: 'euler' })
    const small = r.asserts.find(a => a.name === 'Small')!
    expect(small).toMatchObject({ status: 'failed', failures: 49 }) // t = 1.51 … 1.99
    expect(small.firstFailTime).toBeCloseTo(1.51, 9)
  })

  test('a stop-on-failure Assert ends the run', () => {
    const r = runModelTests({
      name: 'Stop',
      data: rampModel([b('s', 'assert', 'Limit', { lower: -1, upper: 0.995, onFailure: 'stop' })]),
    })
    expect(r).toMatchObject({ status: 'failed', stepsRun: 101, stoppedBy: { blockId: 's', name: 'Limit' } })
  })

  test('a not-checked Assert fails the model', () => {
    const r = runModelTests({ name: 'Late', data: rampModel([b('l', 'assert', 'Late', { checkFrom: 100 })]) })
    expect(r.status).toBe('failed')
    expect(r.asserts[0]!.status).toBe('not_checked')
  })

  test('a model without Asserts has no tests and is not built', () => {
    const r = runModelTests({ name: 'None', data: rampModel([]) })
    expect(r.status).toBe('no_tests')
  })

  test('a build failure is an error with the reason', () => {
    const r = runModelTests({ name: 'Pass', data: passing() }, { cc: 'definitely-not-a-compiler' })
    expect(r.status).toBe('error')
    expect(r.error).toMatch(/C build failed \(definitely-not-a-compiler\)/)
  })

  test('--keep leaves the generated project in place', () => {
    const r = runModelTests({ name: 'Pass', data: passing() }, { keep: true })
    const note = r.warnings.find(x => x.startsWith('Generated project kept in '))!
    const dir = note.replace('Generated project kept in ', '')
    expect(fs.existsSync(path.join(dir, 'test_main.c'))).toBe(true)
    fs.rmSync(dir, { recursive: true, force: true })
  })
})

describe('helpers and reports', () => {
  test('modelHasAsserts looks inside subsystems', () => {
    const sub = b('s', 'subsystem', 'S', { sheets: [{ id: 'x', blocks: [b('a', 'assert', 'A')], connections: [] }] })
    expect(modelHasAsserts([{ blocks: [sub] }])).toBe(true)
    expect(modelHasAsserts([{ blocks: [b('r', 'source', 'R')] }])).toBe(false)
  })

  test('parseRunOutput', () => {
    const out = 'STEPS\t5\nASSERT\tid1\tA\tSub_A\t2\t5\t2\t0.03\t1.5\t-1\t0.5\t1\nnoise\n'
    expect(parseRunOutput(out)).toEqual({
      stepsRun: 5,
      asserts: [
        {
          blockId: 'id1',
          name: 'A',
          qualifiedName: 'Sub_A',
          status: 'failed',
          checks: 5,
          failures: 2,
          firstFailTime: 0.03,
          firstFailValue: 1.5,
          firstFailIndex: null,
          worstViolation: 0.5,
          stopsOnFailure: true,
        },
      ],
    })
  })

  const reports = (): ModelTestReport[] => [
    runModelTests({ name: 'Pass', data: passing() }),
    runModelTests({ name: 'A <&> "B"', data: failing() }),
    runModelTests({ name: 'None', data: rampModel([]) }),
  ]

  test('exit codes', () => {
    const [pass, fail, none] = reports()
    expect(exitCodeFor([pass!])).toBe(0)
    expect(exitCodeFor([pass!, fail!])).toBe(1)
    expect(exitCodeFor([pass!, none!])).toBe(1)
    expect(exitCodeFor([pass!, { ...fail!, status: 'error' }])).toBe(2)
    expect(exitCodeFor([])).toBe(0)
  })

  test('text and JUnit reports', () => {
    const rs = reports()
    const text = formatTextReport(rs)
    expect(text).toMatch(/^PASS {4}Pass: 1 passed, 0 failed/m)
    expect(text).toMatch(/^FAIL {4}A <&> "B": 1 passed, 1 failed/m)
    expect(text).toMatch(/✕ Small: first failed at t = 1\.51 s/)
    expect(text).toMatch(/NO TESTS None/)
    expect(text).toMatch(/1 of 3 models passed$/)

    const xml = formatJUnitReport(rs)
    expect(xml).toMatch(/<testsuites name="obliq" tests="4" failures="1" errors="1">/)
    expect(xml).toMatch(/<testsuite name="A &lt;&amp;&gt; &quot;B&quot;" tests="2" failures="1"/)
    expect(xml).toMatch(/<testcase classname="Pass" name="Positive" time="0"><\/testcase>/)
    expect(xml).toMatch(/<failure message="first failed at t = 1.51 s/)
    expect(xml).toMatch(/<error message="The model has no Assert blocks">/)
  })
})

describe('resolveTestTargets and the CLI', () => {
  let home: string
  let dir: string
  const ids: Record<string, string> = {}

  beforeAll(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'obliq-test-cli-'))
    home = path.join(dir, 'home')
    const storage = openStorage(home, { referenceModelsDir: null })
    ids.pass = storage.models.create({ name: 'Pass Model', data: passing() as any }).id
    ids.fail = storage.models.create({ name: 'Fail Model', data: failing() as any }).id
    ids.plain = storage.models.create({ name: 'Plain', data: rampModel([]) as any }).id
    ids.twin1 = storage.models.create({ name: 'Twin', data: passing() as any }).id
    ids.twin2 = storage.models.create({ name: 'Twin', data: passing() as any }).id
    storage.db.close()
    fs.writeFileSync(path.join(dir, 'file-model.json'), JSON.stringify({ name: 'From File', data: passing() }))
  })
  afterAll(() => fs.rmSync(dir, { recursive: true, force: true }))

  test('by id, by name (any case) and by file; ambiguous and unknown names are errors', () => {
    const r = resolveTestTargets([ids.pass!, 'fail model', path.join(dir, 'file-model.json'), 'Twin', 'Nope'], { home })
    expect(r.targets.map(t => t.name)).toEqual(['Pass Model', 'Fail Model', 'From File'])
    expect(r.targets[0]!.id).toBe(ids.pass)
    expect(r.targets[2]!.file).toBe(path.join(dir, 'file-model.json'))
    expect(r.errors.map(e => e.arg)).toEqual(['Twin', 'Nope'])
    expect(r.errors[0]!.message).toMatch(/2 models have this name; use an id/)
  })

  test('--all adds every stored model with Asserts, once', () => {
    const r = resolveTestTargets(['Pass Model'], { home, all: true })
    expect(r.targets.map(t => t.name).sort()).toEqual(['Fail Model', 'Pass Model', 'Twin', 'Twin'])
    expect(r.errors).toEqual([])
  })

  test('a missing store is an error, not created', () => {
    const missing = path.join(dir, 'no-store')
    const r = resolveTestTargets(['Anything'], { home: missing })
    expect(r.errors[0]!.message).toMatch(/No model store at/)
    expect(fs.existsSync(missing)).toBe(false)
  })

  const cli = (...args: string[]) =>
    spawnSync('npx', ['tsx', 'scripts/obliq-test.ts', ...args], {
      cwd: path.resolve(__dirname, '..'),
      env: { ...process.env, OBLIQ_HOME: home },
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })

  test('CLI exit codes and JUnit output', () => {
    expect(cli('Pass Model').status).toBe(0)

    const junit = path.join(dir, 'junit.xml')
    const failed = cli('Pass Model', 'Fail Model', '--junit', junit)
    expect(failed.status).toBe(1)
    expect(failed.stdout).toMatch(/^FAIL {4}Fail Model/m)
    expect(fs.readFileSync(junit, 'utf8')).toMatch(/<testsuites name="obliq" tests="3" failures="1" errors="0">/)

    expect(cli('Plain').status).toBe(1) // named, but has no Asserts
    expect(cli('Nope').status).toBe(2)
    expect(cli().status).toBe(2) // usage

    const json = cli('Pass Model', '--json')
    expect(json.status).toBe(0)
    expect(JSON.parse(json.stdout)).toMatchObject({ exitCode: 0, models: [{ name: 'Pass Model', status: 'passed' }] })
  })
})
