/**
 * Continuous Laplace transfer_function block — codegen + scalar derivatives.
 * (Discrete z-domain coverage lives in discrete-transform-block.test.ts.)
 */

import { TransferFunctionBlockModule } from '@/lib/blocks/TransferFunctionBlockModule'
import { BlockData } from '@/components/BlockNode'
import { BlockState } from '@/lib/simulationTypes'

function tfBlock(
  name: string,
  numerator: number[],
  denominator: number[]
): BlockData {
  return {
    id: 'tf1',
    name,
    type: 'transfer_function',
    position: { x: 0, y: 0 },
    parameters: { numerator, denominator }
  }
}

describe('Transfer Function Block (continuous)', () => {
  const mod = new TransferFunctionBlockModule()

  describe('requiresState / state struct', () => {
    test('pure gain needs no state', () => {
      const b = tfBlock('Gain', [2], [1])
      expect(mod.requiresState(b)).toBe(false)
      expect(mod.generateStateStructMembers(b, 'double')).toEqual([])
    })

    test('first-order allocates one state', () => {
      const b = tfBlock('FO', [1], [1, 1])
      expect(mod.requiresState(b)).toBe(true)
      expect(mod.generateStateStructMembers(b, 'double')).toEqual([
        '    double FO_states[1];'
      ])
    })

    test('3rd-order actuator den allocates three states', () => {
      const b = tfBlock('A_Actuator', [1], [0.00001942, 0.0007963, 0.05576, 1])
      expect(mod.requiresState(b)).toBe(true)
      expect(mod.generateStateStructMembers(b, 'double')).toEqual([
        '    double A_Actuator_states[3];'
      ])
    })
  })

  describe('Code generation', () => {
    test('dynamic TF output reads states[0]', () => {
      const b = tfBlock('FO', [1], [0.1584, 1])
      const code = mod.generateComputation(b, ['model->signals.U'], ['double'])
      expect(code).toContain('Transfer function block: FO')
      expect(code).toContain('model->signals.FO = model->states.FO_states[0]')
    })

    test('state derivative embeds normalized pole coeffs (1st order)', () => {
      // H(s) = 1 / (0.1584 s + 1)  →  x' = (u - x) / 0.1584
      const b = tfBlock('Fcn3', [1], [0.1584, 1])
      const code = mod.generateStateDerivative(
        b,
        'model->signals.U',
        'current_states',
        'double'
      )
      expect(code).toContain('State derivatives for Fcn3')
      expect(code).toContain('state_derivatives->Fcn3_states[0]')
      // (1/0.1584)*u - (1/0.1584)*x
      expect(code).toMatch(/6\.31/)
    })

    test('empty parameters fall back to 1/(s+1) — documents codegen default', () => {
      const b: BlockData = {
        id: 'tf_empty',
        name: 'EmptyTF',
        type: 'transfer_function',
        position: { x: 0, y: 0 },
        parameters: {}
      }
      expect(mod.requiresState(b)).toBe(true)
      const deriv = mod.generateStateDerivative(
        b,
        'model->signals.U',
        'current_states',
        'double'
      )
      // Default den [1,1], num [1] → x' = 1*u - 1*x
      expect(deriv).toContain('(1) * model->signals.U')
      expect(deriv).toContain('(1) * current_states->EmptyTF_states[0]')
    })
  })

  describe('computeDerivatives (scalar)', () => {
    test('first-order 1/(s+1) at rest with u=1 → xdot=1', () => {
      const blockState = {
        internalState: {
          numerator: [1],
          denominator: [1, 1],
          states: [0]
        }
      } as unknown as BlockState
      const d = mod.computeDerivatives!(blockState, [1], 0)
      expect(d).toEqual([1])
    })

    test('first-order 1/(τs+1) matches (u-x)/τ', () => {
      const tau = 0.1584
      const x = 0.5
      const u = 1
      const blockState = {
        internalState: {
          numerator: [1],
          denominator: [tau, 1],
          states: [x]
        }
      } as unknown as BlockState
      const d = mod.computeDerivatives!(blockState, [u], 0)
      expect(d![0]).toBeCloseTo((u - x) / tau, 10)
    })

    test('second-order companion form x0′=x1', () => {
      const blockState = {
        internalState: {
          numerator: [1],
          denominator: [1, 2, 1],
          states: [0.1, 0.3]
        }
      } as unknown as BlockState
      const d = mod.computeDerivatives!(blockState, [0], 0)
      expect(d![0]).toBeCloseTo(0.3, 12)
      // x1' = (0 - 1*x0 - 2*x1) / 1
      expect(d![1]).toBeCloseTo(-0.1 - 2 * 0.3, 12)
    })
  })
})
