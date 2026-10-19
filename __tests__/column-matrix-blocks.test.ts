// Column matrices (e.g. a double[4][1] quaternion) through Sum and Magnitude.

import { SumBlockModule } from '@/lib/blocks/SumBlockModule'
import { MagnitudeBlockModule } from '@/lib/blocks/MagnitudeBlockModule'
import { BlockData } from '@/components/BlockNode'

const block = (type: string, name: string, parameters: Record<string, unknown> = {}): BlockData => ({
  id: name, type, name, position: { x: 0, y: 0 }, parameters,
})

describe('column matrices', () => {
  test('Sum of two [4][1] matrices indexes [i][j] only', () => {
    const code = new SumBlockModule().generateComputation(
      block('sum', 'E', { signs: '+-', numInputs: 2 }),
      ['model->signals.A', 'model->signals.B'],
      ['double[4][1]', 'double[4][1]']
    )
    expect(code).toContain('model->signals.E[i][j] = model->signals.A[i][j] - model->signals.B[i][j]')
  })

  test('Sum of a vector and a column matrix still reads the column as a vector', () => {
    const code = new SumBlockModule().generateComputation(
      block('sum', 'E', { signs: '++', numInputs: 2 }),
      ['model->signals.A', 'model->signals.B'],
      ['double[4]', 'double[4][1]']
    )
    expect(code).toContain('model->signals.A[i] + model->signals.B[i][0]')
  })

  test('Magnitude uses the connected vector length', () => {
    const code = new MagnitudeBlockModule().generateComputation(block('mag', 'M'), ['model->signals.V'], ['double[6]'])
    expect(code).toContain('i < 6')
  })

  test('Magnitude of a column matrix reads [i][0]', () => {
    const code = new MagnitudeBlockModule().generateComputation(block('mag', 'M'), ['model->signals.q'], ['double[4][1]'])
    expect(code).toContain('i < 4')
    expect(code).toContain('model->signals.q[i][0] * model->signals.q[i][0]')
  })
})
