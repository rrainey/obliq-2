// __tests__/mux-demux-block.test.ts
// Mux / Demux signal naming and matrix-shaped assignment.
//
// Extracted from the retired Saturn-IB 6-DoF codegen-naming suite; these
// assertions are about the blocks themselves and carry no Saturn dependency.

import { MuxBlockModule } from '@/lib/blocks/MuxBlockModule'
import { getSignalMemberName } from '@/lib/codegen/signalMemberName'

describe('Demux Block', () => {
  describe('Signal member naming', () => {
    test('multi-output members are named name_N, not name_rowR_colC', () => {
      expect(
        getSignalMemberName('demux_q_raw', 'demux', 0, {
          id: 'd',
          name: 'demux_q_raw',
          type: 'demux',
          position: { x: 0, y: 0 },
          parameters: { outputCount: 4, inputDimensions: [4, 1] },
        } as any)
      ).toBe('demux_q_raw_0')
    })

    test('vector input members use a flat index', () => {
      expect(
        getSignalMemberName('demux_omega', 'demux', 1, {
          id: 'd2',
          name: 'demux_omega',
          type: 'demux',
          position: { x: 0, y: 0 },
          parameters: { outputCount: 3, inputDimensions: [3] },
        } as any)
      ).toBe('demux_omega_1')
    })
  })
})

describe('Mux Block', () => {
  describe('Code Generation - Matrix', () => {
    test('double[4][1] output assigns with two-dimensional indices', () => {
      const module = new MuxBlockModule()
      const block = {
        id: 'm',
        name: 'q_hat',
        type: 'mux',
        position: { x: 0, y: 0 },
        parameters: {
          rows: 4,
          cols: 1,
          baseType: 'double',
          outputType: 'double[4][1]',
          outputShape: 'matrix',
        },
      } as any

      const code = module.generateComputation(block, ['a', 'b', 'c', 'd'])

      expect(code).toContain('q_hat[0][0] = a')
      expect(code).toContain('q_hat[3][0] = d')
      // A column matrix must not collapse to single-subscript assignment.
      expect(code).not.toMatch(/q_hat\[0\] = /)
    })
  })
})
