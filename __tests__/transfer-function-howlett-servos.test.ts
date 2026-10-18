/**
 * Verify controllable-canonical TF→SS for Howlett UH-60 primary / SAS servos
 * (Fig 5.1.6 dens from CR-166309 / UH60.mdl).
 *
 * Primary: 1 / (0.00114 s² + 0.0473 s + 1)
 * SAS:     1 / (0.00032 s² + 0.025 s + 1)
 */

import { TransferFunctionBlockModule } from '@/lib/blocks/TransferFunctionBlockModule'
import { BlockData } from '@/components/BlockNode'
import { BlockState } from '@/lib/simulationTypes'

function tf(name: string, num: number[], den: number[]): BlockData {
  return {
    id: name,
    name,
    type: 'transfer_function',
    position: { x: 0, y: 0 },
    parameters: { numerator: num, denominator: den }
  }
}

/** Analytic DC gain num(0)/den(0) for polynomials high-order-first. */
function dcGain(num: number[], den: number[]): number {
  return (num[num.length - 1] || 0) / (den[den.length - 1] || 1)
}

describe('Howlett UH-60 servo TFs (companion form)', () => {
  const mod = new TransferFunctionBlockModule()

  const primaryDen = [0.00114, 0.0473, 1]
  const sasDen = [0.00032, 0.025, 1]
  const num = [1]

  test('Primary Servo coeffs match plant codegen (1/an, a1/an)', () => {
    const an = primaryDen[0]
    expect(1 / an).toBeCloseTo(877.1929824561404, 8)
    expect(primaryDen[1] / an).toBeCloseTo(41.49122807017544, 8)
    const b = tf('Primary_B1S_Servo', num, primaryDen)
    const out = mod.generateComputation(b, ['model->signals.U'], ['double'])
    const deriv = mod.generateStateDerivative(
      b,
      'model->signals.U',
      'current_states',
      'double'
    )
    expect(out).toMatch(/\(877\.19298/)
    expect(out).toContain('_states[0]')
    expect(deriv).toMatch(/_states\[0\] = current_states->.*_states\[1\]/)
    expect(deriv).toMatch(/model->signals\.U - \(877\.19298/)
    expect(deriv).toMatch(/\(41\.491228/)
  })

  test('SAS Actuator coeffs match plant codegen', () => {
    const an = sasDen[0]
    expect(1 / an).toBeCloseTo(3125, 6)
    expect(sasDen[1] / an).toBeCloseTo(78.125, 8)
    const b = tf('SAS_Actuator', num, sasDen)
    const out = mod.generateComputation(b, ['model->signals.U'], ['double'])
    const deriv = mod.generateStateDerivative(
      b,
      'model->signals.U',
      'current_states',
      'double'
    )
    expect(out).toMatch(/\(3125/)
    expect(deriv).toMatch(/\(3125/)
    expect(deriv).toMatch(/\(78\.125\)/)
  })

  test('DC gain of both Howlett dens is unity', () => {
    expect(dcGain(num, primaryDen)).toBeCloseTo(1, 12)
    expect(dcGain(num, sasDen)).toBeCloseTo(1, 12)
  })

  test('RK-style derivatives: Primary at rest u=1 → x1′ = 1', () => {
    const blockState = {
      internalState: {
        numerator: num,
        denominator: primaryDen,
        states: [0, 0]
      }
    } as unknown as BlockState
    const d = mod.computeDerivatives!(blockState, [1], 0)!
    expect(d[0]).toBeCloseTo(0, 12) // x0' = x1
    expect(d[1]).toBeCloseTo(1, 12) // x1' = u - ...
  })

  test('steady state: Primary x0 → an·u, y → u', () => {
    const an = primaryDen[0]
    const u = 2.5
    // At SS: x1=0, 0 = u - (1/an)x0 - (a1/an)*0 ⇒ x0 = an*u
    const x0 = an * u
    const blockState = {
      internalState: {
        numerator: num,
        denominator: primaryDen,
        states: [x0, 0]
      }
    } as unknown as BlockState
    const d = mod.computeDerivatives!(blockState, [u], 0)!
    expect(d[0]).toBeCloseTo(0, 10)
    expect(d[1]).toBeCloseTo(0, 10)
    // y = (1/an)*x0 = u
    const y = (1 / an) * x0
    expect(y).toBeCloseTo(u, 12)
  })
})
