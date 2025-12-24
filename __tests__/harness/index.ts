/**
 * Test Harness Utilities
 *
 * Provides a framework for testing C code generation by:
 * 1. Creating test models from simplified definitions
 * 2. Generating C code and compiling to WASM via Docker/Emscripten
 * 3. Running simulations and collecting time-series results
 * 4. Asserting output values at specific times
 *
 * Usage:
 * ```typescript
 * import { createHarness } from '@/__tests__/harness'
 *
 * describe('My Block Tests', () => {
 *   const harness = createHarness()
 *
 *   afterEach(async () => {
 *     await harness.cleanup()
 *   })
 *
 *   it('should compute correctly', async () => {
 *     const model = harness.createTestModel({
 *       blocks: [{ type: 'source', name: 'Src', parameters: { value: 42 } }],
 *       outputs: ['Src']
 *     })
 *
 *     const compiled = await harness.generateAndCompile(model)
 *     const results = await harness.runSimulation(compiled, { duration: 1.0 })
 *
 *     harness.assertFinalOutput(results, 'out_0', 42.0)
 *   })
 * })
 * ```
 */

export {
  BlockTestHarness,
  createHarness,
  type TestBlock,
  type TestConnection,
  type TestModelDef,
  type CompiledModel,
  type SimulationResult,
  type SimulationConfig
} from './BlockTestHarness'
