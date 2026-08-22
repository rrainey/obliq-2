/**
 * SMC Gain3 Δ — RTW `<S427>/Gain3`: (accel_quant − Memory) * 0.625
 */

import { IGM_SMC_DV_SOURCE, IGM_SMC_GAIN3 } from '../examples/saturn-ib/as205Igm'
import { smcGain3Delta } from '../examples/saturn-ib/igmSmcyObliq'

describe('smcGain3Delta', () => {
  test('matches RTW scale 0.625', () => {
    expect(IGM_SMC_GAIN3).toBe(0.625)
    expect(smcGain3Delta(10, 6)).toBeCloseTo(2.5, 12)
    expect(smcGain3Delta(6, 10)).toBeCloseTo(-2.5, 12)
    expect(smcGain3Delta(1, 1)).toBe(0)
  })

  test('default ΔV source is as_zoh (A_m), ready behind SMC enable flag', () => {
    expect(IGM_SMC_DV_SOURCE).toBe('as_zoh')
  })
})
