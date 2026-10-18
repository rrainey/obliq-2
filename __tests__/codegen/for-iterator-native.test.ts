/**
 * Native compile+run proofs for for_iterator_subsystem semantics.
 *
 * accumulate: Y = sum_{i=1..5} (u*i) = 15u → 30 for u=2
 * last-iter:  Y = u*5 → 10 for u=2
 */

import * as fs from 'fs'
import * as path from 'path'
import { Sheet } from '@/lib/simulationTypes'
import {
  cleanupNativeDir,
  compileAndRunNative,
  parseResultLine
} from '../support/nativeCgen'

const FIXTURES = path.join(__dirname, '../fixtures')

jest.setTimeout(60000)

describe('for_iterator_subsystem native (core)', () => {
  const dirs: string[] = []

  afterAll(() => {
    for (const d of dirs) cleanupNativeDir(d)
  })

  test('accumulateOutputs=true → Y = 15*u (u=2 → 30)', () => {
    const model = JSON.parse(
      fs.readFileSync(path.join(FIXTURES, 'for_iterator_accumulate.json'), 'utf8')
    )
    const result = compileAndRunNative({
      modelName: 'fi_acc',
      sheets: model.sheets as Sheet[],
      parameters: model.parameters || [],
      smokeMainBody: `
  fi_acc_step(&model);
  printf("Y=%.17g\\n", model.outputs.Y);
  if (fabs(model.outputs.Y - 30.0) > 1e-9) {
    fprintf(stderr, "expected Y=30 got %.17g\\n", model.outputs.Y);
    return 1;
  }
  return 0;
`
    })
    dirs.push(result.outDir)
    expect(parseResultLine(result.stdout, 'Y')).toBeCloseTo(30, 9)
    expect(result.source).toMatch(/__fi_acc_y/)
    expect(result.subsystemFiles).toHaveLength(1)
  })

  test('accumulateOutputs=false → Y = last iter u*5 (u=2 → 10)', () => {
    const model = JSON.parse(
      fs.readFileSync(path.join(FIXTURES, 'for_iterator_last_iter.json'), 'utf8')
    )
    const result = compileAndRunNative({
      modelName: 'fi_last',
      sheets: model.sheets as Sheet[],
      parameters: model.parameters || [],
      smokeMainBody: `
  fi_last_step(&model);
  printf("Y=%.17g\\n", model.outputs.Y);
  if (fabs(model.outputs.Y - 10.0) > 1e-9) {
    fprintf(stderr, "expected Y=10 got %.17g\\n", model.outputs.Y);
    return 1;
  }
  return 0;
`
    })
    dirs.push(result.outDir)
    expect(parseResultLine(result.stdout, 'Y')).toBeCloseTo(10, 9)
    expect(result.source).not.toMatch(/__fi_acc_/)
  })
})
