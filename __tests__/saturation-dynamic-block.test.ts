/**
 * Saturation Dynamic: element-wise clamp(u, lo, up) for vectors.
 */

import { SaturationDynamicBlockModule } from '../src/lib/blocks/SaturationDynamicBlockModule'
import type { BlockData } from '../src/components/BlockNode'

describe('SaturationDynamicBlockModule', () => {
  const mod = new SaturationDynamicBlockModule()
  const block = {
    id: 'sat1',
    type: 'saturation_dynamic',
    name: 'Saturation_Dynamic',
    parameters: { numInputs: 3 }
  } as unknown as BlockData

  test('output type follows u when vector', () => {
    expect(
      mod.getOutputType(block, ['double[3]', 'double[3]', 'double[3]'])
    ).toBe('double[3]')
    expect(mod.getOutputType(block, ['double', 'double[3]', 'double'])).toBe(
      'double[3]'
    )
  })

  test('generates element-wise clamp loop for double[3]', () => {
    const code = mod.generateComputation(
      block,
      ['model->signals.up', 'model->signals.u', 'model->signals.lo'],
      ['double[3]', 'double[3]', 'double[3]']
    )
    expect(code).toMatch(/for \(int i = 0; i < 3; i\+\+\)/)
    expect(code).toMatch(/fmax\(_lo, fmin\(_up, _u\)\)/)
    expect(code).not.toMatch(/vector→scalar head/)
  })

  test('scalar clamp when all scalar', () => {
    const code = mod.generateComputation(
      block,
      ['model->signals.up', 'model->signals.u', 'model->signals.lo'],
      ['double', 'double', 'double']
    )
    expect(code).toMatch(
      /Saturation_Dynamic = fmax\(model->signals\.lo, fmin\(model->signals\.up, model->signals\.u\)\)/
    )
    expect(code).not.toMatch(/for \(int i/)
  })
})
