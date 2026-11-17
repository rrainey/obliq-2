/**
 * GitHub issues #7 and #8: a unit_delay / Memory state update that happens
 * during the per-stage algebra of RK4 lets intermediate stages see the new
 * state. A parent integrator whose derivative uses the delayed signal then
 * integrates the wrong value at stages k2..k4.
 *
 * These tests cover the two cases, so we know how wide the problem is:
 *   1. The unit_delay is at the TOP level of the model.
 *   2. The unit_delay is inside a segregated subsystem.
 *
 * In each case, a Clock u(t) = t feeds the delay. The correct Simulink
 * delayed signal at step N is y = (N - 1) * dt, constant across the four
 * stages of the step. A top-level integrator of y gives a state at the
 * start of the last step of 0.28 for 10 steps at dt = 0.1 (the integrator's
 * output signal is the RK4-restored value, which is the state at the start
 * of the current step). The buggy code advances the unit_delay state at
 * k1, so stages k2..k4 read the new state and the integrator state lands
 * at about 0.347, about 24 % too high.
 */

import { Sheet } from '@/lib/simulationTypes'
import { BlockData } from '@/components/BlockNode'
import { WireData } from '@/components/Wire'
import { cleanupNativeDir, compileAndRunNative } from '../support/nativeCgen'

jest.setTimeout(120000)

const b = (id: string, type: string, name: string, parameters: Record<string, unknown> = {}): BlockData => ({
  id, type, name, position: { x: 0, y: 0 }, parameters,
})
const w = (id: string, s: string, sp: number, t: string, tp: number): WireData => ({
  id, sourceBlockId: s, sourcePortIndex: sp, targetBlockId: t, targetPortIndex: tp,
})

/** Clock → unit_delay → integrator, all at the top level. */
function topLevelModel(): Sheet[] {
  return [{
    id: 'main', name: 'Main', extents: { width: 800, height: 600 },
    blocks: [
      b('t', 'clock', 'T'),
      b('d1', 'unit_delay', 'D1', { initialValue: 0 }),
      b('int', 'integrator', 'IntY', { initialValue: 0 }),
      b('oi', 'output_port', 'IntY', { portName: 'IntY', dataType: 'double' }),
    ],
    connections: [
      w('w0', 't', 0, 'd1', 0),
      w('w1', 'd1', 0, 'int', 0),
      w('w2', 'int', 0, 'oi', 0),
    ],
  }]
}

/** Body of a segregated subsystem: input U → unit_delay → output Y. */
function delayBody(): Sheet {
  return {
    id: 'sub', name: 'Delay', extents: { width: 800, height: 600 },
    blocks: [
      b('in', 'input_port', 'U', { portName: 'U', dataType: 'double' }),
      b('d1', 'unit_delay', 'D1', { initialValue: 0 }),
      b('out', 'output_port', 'Y', { portName: 'Y', dataType: 'double' }),
    ],
    connections: [
      w('wa', 'in', 0, 'd1', 0),
      w('wb', 'd1', 0, 'out', 0),
    ],
  }
}

/** Clock → segregated(unit_delay) → top-level integrator. */
function subsystemModel(): Sheet[] {
  return [{
    id: 'main', name: 'Main', extents: { width: 800, height: 600 },
    blocks: [
      b('t', 'clock', 'T'),
      b('sub', 'subsystem', 'Chain', {
        codeGenStrategy: 'segregated',
        inputPorts: ['U'],
        outputPorts: ['Y'],
        sheets: [delayBody()],
      }),
      b('int', 'integrator', 'IntY', { initialValue: 0 }),
      b('oi', 'output_port', 'IntY', { portName: 'IntY', dataType: 'double' }),
    ],
    connections: [
      w('w0', 't', 0, 'sub', 0),
      w('w1', 'sub', 0, 'int', 0),
      w('w2', 'int', 0, 'oi', 0),
    ],
  }]
}

function run(name: string, sheets: Sheet[]): number {
  const dt = 0.1
  const nSteps = 10
  const r = compileAndRunNative({
    modelName: name,
    sheets,
    integrationAlgorithm: 'rk4',
    dt,
    smokeMainBody: `
  ${name}_seed_from_inputs(&model);
  for (int i = 0; i < ${nSteps}; ++i) ${name}_step(&model);
  printf("IntY=%.17g\\n", model.outputs.IntY);
  return 0;
`,
  })
  return Number(r.stdout.trim().split('=')[1])
}

describe('unit_delay state timing under parent RK4', () => {
  const dirs: string[] = []
  afterAll(() => dirs.forEach(cleanupNativeDir))

  it('a top-level unit_delay holds its output constant across the four stages', () => {
    const name = 'top_ud_rk4'
    const r = compileAndRunNative({
      modelName: name,
      sheets: topLevelModel(),
      integrationAlgorithm: 'rk4',
      dt: 0.1,
      smokeMainBody: `
  ${name}_seed_from_inputs(&model);
  for (int i = 0; i < 10; ++i) ${name}_step(&model);
  printf("IntY=%.17g\\n", model.outputs.IntY);
  return 0;
`,
    })
    dirs.push(r.outDir)
    expect(Number(r.stdout.trim().split('=')[1])).toBeCloseTo(0.28, 8)
  })

  it('a unit_delay inside a segregated subsystem also holds its output constant', () => {
    const name = 'seg_ud_rk4'
    const r = compileAndRunNative({
      modelName: name,
      sheets: subsystemModel(),
      integrationAlgorithm: 'rk4',
      dt: 0.1,
      smokeMainBody: `
  ${name}_seed_from_inputs(&model);
  for (int i = 0; i < 10; ++i) ${name}_step(&model);
  printf("IntY=%.17g\\n", model.outputs.IntY);
  return 0;
`,
    })
    dirs.push(r.outDir)
    expect(Number(r.stdout.trim().split('=')[1])).toBeCloseTo(0.28, 8)
  })
})
