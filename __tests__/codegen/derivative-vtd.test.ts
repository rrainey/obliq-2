/**
 * Core codegen smoke for derivative + variable_transport_delay.
 */

import { CodeGenerator } from '@/lib/codegen/CodeGenerator'
import { Sheet } from '@/lib/simulationTypes'
import { BlockData } from '@/components/BlockNode'
import { WireData } from '@/components/Wire'
import {
  cleanupNativeDir,
  compileAndRunNative,
  parseResultLine
} from '../support/nativeCgen'

function sheet(
  blocks: BlockData[],
  connections: WireData[]
): Sheet[] {
  return [
    {
      id: 'main',
      name: 'Main',
      blocks,
      connections,
      extents: { width: 800, height: 400 }
    }
  ]
}

function b(
  id: string,
  type: string,
  name: string,
  parameters: Record<string, unknown> = {}
): BlockData {
  return { id, type, name, position: { x: 0, y: 0 }, parameters }
}

function w(
  id: string,
  sourceBlockId: string,
  sourcePortIndex: number,
  targetBlockId: string,
  targetPortIndex: number
): WireData {
  return { id, sourceBlockId, sourcePortIndex, targetBlockId, targetPortIndex }
}

jest.setTimeout(60000)

describe('derivative + variable_transport_delay', () => {
  const dirs: string[] = []
  afterAll(() => {
    for (const d of dirs) cleanupNativeDir(d)
  })

  test('codegen emits finite-difference and ring buffer', () => {
    const sheets = sheet(
      [
        b('u', 'source', 'U', {
          signalType: 'constant',
          value: 1,
          dataType: 'double'
        }),
        b('d', 'derivative', 'Deriv', { initialCondition: 0 }),
        b('y', 'output_port', 'Y', { portName: 'Y', dataType: 'double' })
      ],
      [w('c1', 'u', 0, 'd', 0), w('c2', 'd', 0, 'y', 0)]
    )
    const src =
      new CodeGenerator({ modelName: 'deriv_smoke' }).generate(sheets).source ||
      ''
    expect(src).toMatch(/_prev/)
    expect(src).toMatch(/model->dt/)
  })

  test('native: ramp u=t → derivative ≈ 1 after first step', () => {
    // Use clock-like: integrator of constant 1 → ramp; derivative of ramp → ~1
    const sheets = sheet(
      [
        b('one', 'source', 'One', {
          signalType: 'constant',
          value: 1,
          dataType: 'double'
        }),
        b('int', 'integrator', 'Ramp', {
          initialCondition: 0,
          externalReset: false
        }),
        b('der', 'derivative', 'Deriv', { initialCondition: 0 }),
        b('y', 'output_port', 'Y', { portName: 'Y', dataType: 'double' })
      ],
      [
        w('c1', 'one', 0, 'int', 0),
        w('c2', 'int', 0, 'der', 0),
        w('c3', 'der', 0, 'y', 0)
      ]
    )
    const result = compileAndRunNative({
      modelName: 'deriv_ramp',
      sheets,
      dt: 0.01,
      smokeMainBody: `
  /* warm-up a few steps so prev latch settles */
  for (int i = 0; i < 5; ++i) deriv_ramp_step(&model);
  printf("Y=%.17g\\n", model.outputs.Y);
  if (!(model.outputs.Y > 0.5 && model.outputs.Y < 1.5)) {
    fprintf(stderr, "expected ~1 got %.17g\\n", model.outputs.Y);
    return 1;
  }
  return 0;
`
    })
    dirs.push(result.outDir)
    expect(parseResultLine(result.stdout, 'Y')).toBeGreaterThan(0.5)
    expect(parseResultLine(result.stdout, 'Y')).toBeLessThan(1.5)
  })

  test('native: VTD holds delayed constant and tracks step after lag', () => {
    const sheets = sheet(
      [
        b('u', 'source', 'U', {
          signalType: 'step',
          stepValue: 10,
          stepTime: 0.1,
          dataType: 'double'
        }),
        b('delay', 'source', 'DelaySec', {
          signalType: 'constant',
          value: 0.05,
          dataType: 'double'
        }),
        b('vtd', 'variable_transport_delay', 'VTD', {
          maximumDelay: 1,
          maximumPoints: 256,
          initialInput: 0
        }),
        b('y', 'output_port', 'Y', { portName: 'Y', dataType: 'double' })
      ],
      [
        w('c1', 'u', 0, 'vtd', 0),
        w('c2', 'delay', 0, 'vtd', 1),
        w('c3', 'vtd', 0, 'y', 0)
      ]
    )
    const result = compileAndRunNative({
      modelName: 'vtd_smoke',
      sheets,
      dt: 0.01,
      smokeMainBody: `
  double y_at_012 = 0, y_at_020 = 0;
  for (int i = 0; i < 20; ++i) {
    vtd_smoke_step(&model);
    if (i == 11) y_at_012 = model.outputs.Y; /* time advanced to 0.12 */
    if (i == 19) y_at_020 = model.outputs.Y; /* time advanced to 0.20 */
  }
  printf("Y_at_012=%.17g\\n", y_at_012);
  printf("Y_at_020=%.17g\\n", y_at_020);
  /* step at t>=0.1, delay 0.05 → output rises near t=0.15 */
  if (fabs(y_at_012) > 1e-6) return 1;
  if (fabs(y_at_020 - 10.0) > 1e-6) return 2;
  return 0;
`
    })
    dirs.push(result.outDir)
    expect(parseResultLine(result.stdout, 'Y_at_012')).toBeCloseTo(0, 6)
    expect(parseResultLine(result.stdout, 'Y_at_020')).toBeCloseTo(10, 6)
  })
})
