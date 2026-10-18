/**
 * Native compile+run: three shared Blade instances with gains 1/2/5, U=2.
 * Per-blade: y1=2, y2=4, y3=10; parent sum Y=16.
 */

import * as fs from 'fs'
import * as path from 'path'
import { Sheet } from '@/lib/simulationTypes'
import {
  cleanupNativeDir,
  compileAndRunNative,
  parseResultLine
} from '../support/nativeCgen'

const FIXTURE = path.join(
  __dirname,
  '../fixtures/subsystem_references_three_blades.json'
)

jest.setTimeout(60000)

describe('subsystem references native (core)', () => {
  let outDir: string | undefined

  afterAll(() => cleanupNativeDir(outDir))

  test('shared module: y1=2, y2=4, y3=10, Y=16', () => {
    const model = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'))
    const result = compileAndRunNative({
      modelName: 'three_blades',
      sheets: model.sheets as Sheet[],
      parameters: model.parameters || [],
      smokeMainBody: `
  three_blades_step(&model);
  printf("y1=%.17g\\n", model.outputs.y1);
  printf("y2=%.17g\\n", model.outputs.y2);
  printf("y3=%.17g\\n", model.outputs.y3);
  printf("Y=%.17g\\n", model.outputs.Y);
  if (fabs(model.outputs.y1 - 2.0) > 1e-9) return 1;
  if (fabs(model.outputs.y2 - 4.0) > 1e-9) return 2;
  if (fabs(model.outputs.y3 - 10.0) > 1e-9) return 3;
  if (fabs(model.outputs.Y - 16.0) > 1e-9) return 4;
  return 0;
`
    })
    outDir = result.outDir

    expect(parseResultLine(result.stdout, 'y1')).toBeCloseTo(2, 9)
    expect(parseResultLine(result.stdout, 'y2')).toBeCloseTo(4, 9)
    expect(parseResultLine(result.stdout, 'y3')).toBeCloseTo(10, 9)
    expect(parseResultLine(result.stdout, 'Y')).toBeCloseTo(16, 9)

    expect(result.subsystemFiles).toHaveLength(1)
    expect(result.subsystemFiles[0]!.source).toMatch(
      /#define PARAM_gain \(model->params\.gain\)/
    )
  })
})
