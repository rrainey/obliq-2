/**
 * Element-wise square (x^2) block + Sum of Elements vector collapse.
 */

import { SquareBlockModule } from '../src/lib/blocks/SquareBlockModule'
import { SumBlockModule } from '../src/lib/blocks/SumBlockModule'
import { mapBlock } from '../src/lib/mdl2obliq/mapper'
import type { MdlBlock } from '../src/lib/mdl2obliq/types'
import { BlockModuleFactory } from '../src/lib/blocks/BlockModuleFactory'
import { propagateSignalTypes } from '../src/lib/signalTypePropagation'
import type { BlockData, WireData } from '../src/components/BlockNode'
import { validateMultiSheetTypeCompatibility } from '../src/lib/multiSheetTypeValidator'

function createBlock(
  id: string,
  type: string,
  parameters: Record<string, unknown> = {}
): BlockData {
  return {
    id,
    type,
    name: id,
    position: { x: 0, y: 0 },
    parameters
  } as BlockData
}

function createWire(
  id: string,
  sourceBlockId: string,
  targetBlockId: string,
  sourcePortIndex = 0,
  targetPortIndex = 0
): WireData {
  return { id, sourceBlockId, sourcePortIndex, targetBlockId, targetPortIndex } as WireData
}

describe('SquareBlockModule', () => {
  const mod = new SquareBlockModule()

  test('preserves vector type', () => {
    expect(mod.getOutputType(createBlock('sq', 'square'), ['double[3]'])).toBe('double[3]')
  })

  test('emits element-wise square for double[3]', () => {
    const code = mod.generateComputation(
      createBlock('Math_Function', 'square'),
      ['model->signals.Ve'],
      ['double[3]']
    )
    expect(code).toContain('Vector element-wise square')
    expect(code).toContain('for (int i = 0; i < 3; i++)')
    expect(code).toContain(
      'model->signals.Math_Function[i] = (model->signals.Ve[i]) * (model->signals.Ve[i])'
    )
    expect(code).not.toContain('vector→scalar head')
  })

  test('factory resolves square module', () => {
    expect(BlockModuleFactory.getBlockModule('square')).toBeInstanceOf(SquareBlockModule)
  })
})

describe('mdl2obliq Math Operator square', () => {
  test('maps to square block, not evaluate in(0)*in(0)', () => {
    const d = mapBlock({
      name: 'Math_Function',
      blockType: 'Math',
      params: { Operator: 'square' },
      ports: []
    } as MdlBlock)
    expect(d.type).toBe('square')
    expect(d.parameters).toEqual({})
  })
})

describe('Sum of Elements + square chain', () => {
  test('square(double[3]) → sum(numInputs=1) → double', () => {
    const blocks: BlockData[] = [
      createBlock('src', 'source', { dataType: 'double[3]' }),
      createBlock('sq', 'square', {}),
      createBlock('sum1', 'sum', { signs: '+', numInputs: 1 })
    ]
    const wires: WireData[] = [
      createWire('w1', 'src', 'sq'),
      createWire('w2', 'sq', 'sum1')
    ]
    const result = propagateSignalTypes(blocks, wires)
    expect(result.errors).toHaveLength(0)
    expect(result.blockOutputTypes.get('sq:0')).toBe('double[3]')
    expect(result.blockOutputTypes.get('sum1:0')).toBe('double')
  })

  test('SumBlockModule collapses vector to scalar sum', () => {
    const sum = new SumBlockModule()
    const code = sum.generateComputation(
      createBlock('Sum_of_Elements', 'sum', { signs: '+', numInputs: 1 }),
      ['model->signals.Math_Function'],
      ['double[3]']
    )
    expect(code).toContain('Sum of Elements (vector[3] → scalar)')
    expect(code).toContain('model->signals.Sum_of_Elements = 0.0')
    expect(code).toContain('model->signals.Sum_of_Elements += model->signals.Math_Function[i]')
    expect(code).not.toMatch(/Sum_of_Elements = model->signals.Math_Function;/)
  })

  test('no spurious 1-of-2 warning for Sum of Elements', () => {
    const sheets = [
      {
        id: 'main',
        name: 'Main',
        blocks: [
          createBlock('src', 'source', { dataType: 'double[3]' }),
          createBlock('Sum_of_Elements', 'sum', { signs: '+', numInputs: 1 })
        ],
        connections: [createWire('w1', 'src', 'Sum_of_Elements')]
      }
    ]
    const { warnings } = validateMultiSheetTypeCompatibility(sheets as any)
    const sumWarn = warnings.filter(w =>
      w.message.includes('Sum_of_Elements') && w.message.includes('required inputs')
    )
    expect(sumWarn).toHaveLength(0)
  })
})
