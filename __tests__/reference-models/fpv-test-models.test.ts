/**
 * The FPV validation suite in test-models/fpv/ (docs/fpv-hud-gnss-test-plan.md):
 * the committed files match the builder, every test model passes all of its
 * Asserts under the same resolution `npm run obliq:test` uses, and the T00
 * helper checks are not vacuous.
 */
import * as fs from 'fs'
import * as path from 'path'
import { TEST_FPV_MODELS, buildFpvHelpersTestModel } from '../../scripts/build-fpv-reference-model'
import { runModelTests } from '@/lib/testing/modelTestRunner'
import { resolveTestTargets } from '@/lib/testing/resolveTestTargets'

jest.setTimeout(600000)

const DIR = path.join(__dirname, '..', '..', 'test-models', 'fpv')

describe('FPV validation suite (test-models/fpv)', () => {
  test('the committed files are what the builder writes', () => {
    const expected = TEST_FPV_MODELS()
    const onDisk = fs.readdirSync(DIR).filter(f => f.endsWith('.json')).sort()
    expect(onDisk).toEqual(expected.map(([file]) => file).sort())
    for (const [file, model] of expected) {
      expect(fs.readFileSync(path.join(DIR, file), 'utf8')).toBe(JSON.stringify(model, null, 2) + '\n')
    }
  })

  test('every test model passes all of its Asserts, resolving the vehicle from the folder', () => {
    const files = fs.readdirSync(DIR).filter(f => /^t\d\d-.*\.json$/.test(f)).sort()
    expect(files.length).toBeGreaterThan(0)
    const { targets, errors } = resolveTestTargets(files.map(f => path.join(DIR, f)))
    expect(errors).toEqual([])
    expect(targets).toHaveLength(files.length)
    for (const target of targets) {
      const r = runModelTests(target)
      const failed = r.asserts.filter(a => a.status !== 'passed').map(a => `${a.name}: ${a.status} at ${a.firstFailTime} (${a.firstFailValue})`)
      expect({ model: target.name, status: r.status, failed }).toEqual({ model: target.name, status: 'passed', failed: [] })
      expect(r.asserts.length).toBeGreaterThan(0)
      expect(r.warnings).toEqual([])
    }
  })

  test('T00: each helper reports its known value (impossible limits expose it)', () => {
    const model = buildFpvHelpersTestModel()
    const sheet = ((model.data as any).sheets as any[])[0]
    for (const b of sheet.blocks.filter((b: any) => b.type === 'assert')) {
      Object.assign(b.parameters, { lower: 1e9, upper: null, onFailure: 'record' })
    }
    const r = runModelTests({ name: 't00_probe', data: model.data as any })
    const value = (name: string) => r.asserts.find(a => a.name === name)!.firstFailValue!
    expect(value('LatchOffBefore')).toBe(0)
    expect(value('LatchOnAfter')).toBe(1)
    expect(value('FirstTimeUnsetBefore')).toBe(-1)
    expect(value('FirstTimeRecorded')).toBeCloseTo(2.0, 3)
    expect(value('RunningMax')).toBeCloseTo(1, 3)
    expect(value('RunningMin')).toBeCloseTo(-1, 3)
    expect(value('HeldAt3s')).toBeCloseTo(3, 3)
    expect(value('SineMeanSquare')).toBeCloseTo(0.5, 3)
    expect(Math.abs(value('NoiseMeanSquare') - 1)).toBeLessThan(0.05)
    expect(value('CorrHalfPeriod')).toBeCloseTo(-1, 2)
    expect(Math.abs(value('CorrQuarterPeriod'))).toBeLessThan(0.05)
    expect(value('PhaseNotYetVisited')).toBe(0)
    expect(value('PhaseVisited')).toBe(1)
  })
})
