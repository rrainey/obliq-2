/**
 * @jest-environment node
 *
 * Server-side behavior of SimulationEngineFactory (no `window`).
 */

import { isWasmAvailable } from '@/lib/simulation/SimulationEngineFactory'

describe('SimulationEngineFactory (server-side)', () => {
  it('reports WASM as unavailable without a window', () => {
    expect(typeof window).toBe('undefined')
    expect(isWasmAvailable()).toBe(false)
  })
})
