/**
 * Assert block: module unit checks plus native C runs of each mode, the check
 * window, stop-on-failure, multi-rate checking, and the RK4/Euler step count
 * (minor stages must not count as checks).
 */
import { AssertBlockModule } from '@/lib/blocks/AssertBlockModule'
import { BlockModuleFactory } from '@/lib/blocks/BlockModuleFactory'
import { CodeGenerator } from '@/lib/codegen/CodeGenerator'
import { Sheet } from '@/lib/simulationTypes'
import { BlockData } from '@/components/BlockNode'
import { WireData } from '@/components/Wire'
import { cleanupNativeDir, compileAndRunNative } from '../support/nativeCgen'

jest.setTimeout(120000)

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

const sheet = (blocks: BlockData[], connections: WireData[]): Sheet[] => [
  { id: 'main', name: 'Main', blocks, connections, extents: { width: 1000, height: 800 } },
]

interface AssertRow {
  name: string
  status: 'not_checked' | 'passed' | 'failed'
  checks: number
  failures: number
  firstFailTime: number
  firstFailValue: number
  firstFailIndex: number
  worst: number
  stops: number
}

/** Runs `steps` steps (stopping early on request) and reads the results table. */
function runAsserts(modelName: string, sheets: Sheet[], steps: number, integrationAlgorithm: 'rk4' | 'euler' = 'rk4') {
  const result = compileAndRunNative({
    modelName,
    sheets,
    dt: 0.01,
    integrationAlgorithm,
    asserts: true,
    smokeMainBody: `
  ${modelName}_seed_from_inputs(&model);
  int steps = 0;
  while (steps < ${steps} && !${modelName}_stop_requested(&model)) {
    ${modelName}_step(&model);
    steps++;
  }
  printf("STEPS %d\\n", steps);
  for (int i = 0; i < ${modelName}_assert_count(); i++) {
    obliq_assert_result_t r;
    if (${modelName}_assert_result(&model, i, &r) != 0) return 1;
    printf("A %s %d %lu %lu %.17g %.17g %d %.17g %d\\n", r.name, (int)r.status, r.checks, r.failures,
      r.first_fail_time, r.first_fail_value, r.first_fail_index, r.worst_violation, r.stops_on_failure);
  }
  obliq_assert_result_t bad;
  printf("BAD %d\\n", ${modelName}_assert_result(&model, ${modelName}_assert_count(), &bad));
  return 0;
`,
  })
  const lines = result.stdout.trim().split('\n')
  const stepsRun = Number(lines.find(l => l.startsWith('STEPS '))!.split(' ')[1])
  const badIndex = Number(lines.find(l => l.startsWith('BAD '))!.split(' ')[1])
  const statuses = ['not_checked', 'passed', 'failed'] as const
  const rows = new Map<string, AssertRow>()
  for (const l of lines.filter(l => l.startsWith('A '))) {
    const [, name, st, checks, failures, fft, ffv, ffi, worst, stops] = l.split(' ')
    rows.set(name!, {
      name: name!,
      status: statuses[Number(st)]!,
      checks: Number(checks),
      failures: Number(failures),
      firstFailTime: Number(fft),
      firstFailValue: Number(ffv),
      firstFailIndex: Number(ffi),
      worst: Number(worst),
      stops: Number(stops),
    })
  }
  return { ...result, stepsRun, badIndex, rows }
}

describe('AssertBlockModule', () => {
  const m = new AssertBlockModule()

  test('is a registered sink with one input, two in near mode', () => {
    expect(BlockModuleFactory.isSupported('assert')).toBe(true)
    expect(BlockModuleFactory.getSupportedBlockTypes()).toContain('assert')
    expect(m.getInputPortCount(b('a', 'assert', 'A'))).toBe(1)
    expect(m.getInputPortCount(b('a', 'assert', 'A', { mode: 'true' }))).toBe(1)
    expect(m.getInputPortCount(b('a', 'assert', 'A', { mode: 'near' }))).toBe(2)
    expect(m.getInputPortLabels(b('a', 'assert', 'A', { mode: 'near' }))).toEqual(['u', 'expected'])
    expect(m.getOutputPortCount(b('a', 'assert', 'A'))).toBe(0)
    expect(m.getOutputType(b('a', 'assert', 'A'), ['double'])).toBe('void')
  })

  test('all check code is inside #ifdef OBLIQ_ASSERTS', () => {
    const code = m.generateComputation(b('a', 'assert', 'A'), ['model->signals.x'], ['double'])
    const lines = code.trim().split('\n')
    expect(lines[0]).toBe('#ifdef OBLIQ_ASSERTS')
    expect(lines[lines.length - 1]).toMatch(/^#endif/)
  })
})

describe('Assert native codegen', () => {
  // Ramp r = t, dt = 0.01, 300 steps: checks happen at t = 0 … 2.99.
  const ramp = b('r', 'source', 'Ramp', { signalType: 'ramp', slope: 1, startValue: 0 })
  const one = b('c1', 'source', 'One', { signalType: 'constant', value: 1 })
  const integ = b('i', 'integrator', 'Int', { initialCondition: 0 })
  const vec = b('v', 'source', 'Vec', { signalType: 'constant', value: [0, 0.5, 5], dataType: 'double[3]' })
  const step = b('s', 'source', 'Step', { signalType: 'step', stepTime: 1, stepValue: 1 })
  const asserts = [
    b('a1', 'assert', 'Bounded', { mode: 'bounds', lower: -1, upper: 1.505 }),
    b('a2', 'assert', 'LowerOnly', { mode: 'bounds', lower: 0, upper: '' }),
    b('a3', 'assert', 'Window', { mode: 'bounds', lower: -1, upper: 1, checkFrom: 0, checkUntil: 0.5 }),
    b('a4', 'assert', 'Late', { mode: 'bounds', lower: -1, upper: 1, checkFrom: 10 }),
    b('a5', 'assert', 'Near', { mode: 'near', absTol: 1e-9, relTol: 0 }),
    b('a6', 'assert', 'IsTrue', { mode: 'true' }),
    b('a7', 'assert', 'VecBounds', { mode: 'bounds', lower: -1, upper: 1 }),
    b('a8', 'assert', 'NearRel', { mode: 'near', absTol: 0, relTol: 0.1 }),
  ]
  const wires = [
    w('w1', 'r', 'a1'),
    w('w2', 'r', 'a2'),
    w('w3', 'r', 'a3'),
    w('w4', 'r', 'a4'),
    w('w5a', 'r', 'a5', 0),
    w('w5b', 'i', 'a5', 1),
    w('wi', 'c1', 'i'),
    w('w6', 's', 'a6'),
    w('w7', 'v', 'a7'),
    w('w8a', 'r', 'a8', 0),
    w('w8b', 'one2', 'a8', 1),
  ]
  const one2 = b('one2', 'source', 'Two', { signalType: 'constant', value: 2 })
  const sheets = sheet([ramp, one, integ, vec, step, one2, ...asserts], wires)

  for (const algo of ['rk4', 'euler'] as const) {
    describe(algo, () => {
      let run: ReturnType<typeof runAsserts>
      beforeAll(() => {
        run = runAsserts(`assert_${algo}`, sheets, 300, algo)
      })
      afterAll(() => cleanupNativeDir(run?.outDir))

      const row = (name: string) => run.rows.get(name)!

      test('reports every Assert, and -1 for a bad index', () => {
        expect(run.stepsRun).toBe(300)
        expect([...run.rows.keys()].sort()).toEqual(asserts.map(a => a.name).sort())
        expect(run.badIndex).toBe(-1)
      })

      test('each step is checked exactly once (RK4 minor stages and init re-evaluation do not count)', () => {
        expect(row('LowerOnly')).toMatchObject({ status: 'passed', checks: 300, failures: 0, firstFailTime: -1 })
      })

      test('bounds: first failure, count and worst violation', () => {
        const r = row('Bounded')
        expect(r.status).toBe('failed')
        expect(r.firstFailTime).toBeCloseTo(1.51, 9)
        expect(r.firstFailValue).toBeCloseTo(1.51, 9)
        expect(r.failures).toBe(149) // t = 1.51 … 2.99
        expect(r.worst).toBeCloseTo(2.99 - 1.505, 9)
        expect(r.firstFailIndex).toBe(-1) // scalar: no element index
        expect(r.stops).toBe(0)
      })

      test('check window limits the checked steps; a window after the run is not checked', () => {
        expect(row('Window')).toMatchObject({ status: 'passed', checks: 51, failures: 0 })
        expect(row('Late')).toMatchObject({ status: 'not_checked', checks: 0 })
      })

      test('near: integrator of 1 tracks the ramp within 1e-9', () => {
        expect(row('Near')).toMatchObject({ status: 'passed', checks: 300 })
      })

      test('near with relative tolerance: |t − 2| <= 0.2', () => {
        const r = row('NearRel')
        expect(r.status).toBe('failed')
        expect(r.firstFailTime).toBe(0)
        // Passing steps: t = 1.80 … 2.20 (41 steps); the edges sit within rounding of the tolerance
        expect(Math.abs(r.failures - (300 - 41))).toBeLessThanOrEqual(2)
        expect(r.worst).toBeCloseTo(2 - 0.2, 9)
      })

      test('true: fails while the step is 0', () => {
        const r = row('IsTrue')
        expect(r).toMatchObject({ status: 'failed', failures: 100, firstFailTime: 0, firstFailValue: 0 })
      })

      test('vectors: the first failing element is reported', () => {
        const r = row('VecBounds')
        expect(r).toMatchObject({ status: 'failed', failures: 300, firstFailIndex: 2, firstFailValue: 5 })
        expect(r.worst).toBeCloseTo(4, 12)
      })
    })
  }

  test('stop on failure ends the run at the failing step', () => {
    const stopSheets = sheet(
      [ramp, b('a', 'assert', 'Stopper', { mode: 'bounds', lower: -1, upper: 0.995, onFailure: 'stop' })],
      [w('w', 'r', 'a')]
    )
    const run = runAsserts('assert_stop', stopSheets, 300)
    try {
      // The check at t = 1.00 (step 101) fails; the loop sees the request before step 102
      expect(run.stepsRun).toBe(101)
      expect(run.rows.get('Stopper')).toMatchObject({ status: 'failed', failures: 1, stops: 1 })
      expect(run.rows.get('Stopper')!.firstFailTime).toBeCloseTo(1, 9)
    } finally {
      cleanupNativeDir(run.outDir)
    }
  })

  test('an Assert in a subsystem with a sample time checks only on its sample hits', () => {
    const sub = b('sub', 'subsystem', 'Slow', {
      inputPorts: ['u'],
      outputPorts: [],
      sampleTimeSec: 0.1,
      sheets: [
        {
          id: 'slow',
          name: 'Slow',
          extents: { width: 400, height: 300 },
          blocks: [
            b('in', 'input_port', 'u', { portName: 'u', dataType: 'double' }),
            b('sa', 'assert', 'SlowCheck', { mode: 'bounds', lower: 0, upper: '' }),
          ],
          connections: [w('sw', 'in', 'sa')],
        },
      ],
    })
    const run = runAsserts('assert_rate', sheet([ramp, sub], [w('w', 'r', 'sub')]), 300)
    try {
      expect(run.rows.get('SlowCheck')).toMatchObject({ status: 'passed', checks: 30 })
    } finally {
      cleanupNativeDir(run.outDir)
    }
  })

  test('exported code (OBLIQ_ASSERTS undefined) builds and runs without the checks', () => {
    const run = compileAndRunNative({
      modelName: 'assert_export',
      sheets: sheet([ramp, b('a', 'assert', 'Bounded', { lower: -1, upper: 0.5, onFailure: 'stop' })], [w('w', 'r', 'a')]),
      smokeMainBody: `
  for (int i = 0; i < 100; i++) assert_export_step(&model);
#ifdef OBLIQ_ASSERTS
  printf("DEFINED\\n");
#else
  printf("UNDEFINED\\n");
#endif
  return 0;
`,
    })
    try {
      expect(run.stdout.trim()).toBe('UNDEFINED')
      expect(run.header).not.toMatch(/#define OBLIQ_ASSERTS/)
      expect(run.source).toMatch(/#ifdef OBLIQ_ASSERTS/)
    } finally {
      cleanupNativeDir(run.outDir)
    }
  })

  test('a model without Assert blocks reports a count of 0', () => {
    const run = runAsserts('assert_none', sheet([ramp, b('o', 'output_port', 'Out', { portName: 'Out' })], [w('w', 'r', 'o')]), 10)
    try {
      expect(run.rows.size).toBe(0)
      expect(run.stepsRun).toBe(10)
      expect(run.badIndex).toBe(-1)
    } finally {
      cleanupNativeDir(run.outDir)
    }
  })

  test('an Assert inside a segregated subsystem is reported as not checked', () => {
    const sub = b('sub', 'subsystem', 'Seg', {
      inputPorts: ['u'],
      outputPorts: [],
      codeGenStrategy: 'segregated_atomic',
      sheets: [
        {
          id: 'seg',
          name: 'Seg',
          extents: { width: 400, height: 300 },
          blocks: [
            b('in', 'input_port', 'u', { portName: 'u', dataType: 'double' }),
            b('sa', 'assert', 'Inner', { mode: 'bounds', lower: 0, upper: 1 }),
          ],
          connections: [w('sw', 'in', 'sa')],
        },
      ],
    })
    const result = new CodeGenerator({ modelName: 'seg', asserts: true }).generate(sheet([ramp, sub], [w('w', 'r', 'sub')]))
    expect(result.warnings.some(m => /Assert "Inner".*segregated subsystem "Seg".*not checked/.test(m))).toBe(true)
    expect(result.source).toMatch(/int seg_assert_count\(void\) \{\n    return 0;/)
  })
})
