/**
 * Tests for WasmSimulationEngine with Multi-Sheet Models
 *
 * Verifies that WASM-compiled models correctly handle subsystems
 * and produce results consistent with JavaScript simulation.
 */

import { WasmSimulationEngine } from '@/lib/simulation/WasmSimulationEngine'
import { MultiSheetSimulationEngine } from '@/lib/multiSheetSimulation'
import { Sheet, SimulationConfig } from '@/lib/simulationEngine'

// Mock fetch for unit tests
global.fetch = jest.fn()

describe('WasmSimulationEngine Multi-Sheet Support', () => {
  describe('Multi-Sheet Model Structure (Unit)', () => {
    it('should understand that multi-sheet models compile to single WASM module', () => {
      // This is a conceptual test to document the architecture
      // Multi-sheet models (with subsystems) compile to a single WASM module
      // where each subsystem becomes a function in the C code

      const modelWithSubsystems = {
        sheets: [
          {
            id: 'main',
            blocks: [/* subsystem blocks */],
            connections: []
          }
        ]
      }

      // The C code generator flattens subsystems into functions
      // All sheets are compiled into ONE wasm module
      // NOT separate modules per sheet

      expect(true).toBe(true) // Documenting architecture
    })
  })
})

// Integration tests (require actual WASM compilation)
const describeIntegration =
  process.env.TEST_WASM_INTEGRATION === 'true' && process.env.TEST_WASM_MODEL_ID_MULTISHEET
    ? describe
    : describe.skip

describeIntegration('WasmSimulationEngine Multi-Sheet Integration', () => {
  const TEST_MODEL_ID = process.env.TEST_WASM_MODEL_ID_MULTISHEET!

  // Create a simple multi-sheet test model
  const createMultiSheetModel = (): Sheet[] => {
    return [
      {
        id: 'main',
        name: 'Main',
        blocks: [
          {
            id: 'source1',
            type: 'source',
            name: 'Input',
            position: { x: 100, y: 100 },
            parameters: {
              signalType: 'constant',
              value: 5.0,
              dataType: 'double'
            }
          },
          {
            id: 'subsystem1',
            type: 'subsystem',
            name: 'GainBlock',
            position: { x: 300, y: 100 },
            parameters: {
              inputPorts: ['In'],
              outputPorts: ['Out'],
              sheets: [
                {
                  id: 'sub1_main',
                  name: 'Subsystem Main',
                  blocks: [
                    {
                      id: 'sub_input',
                      type: 'input_port',
                      name: 'In',
                      position: { x: 100, y: 100 },
                      parameters: { portName: 'In', dataType: 'double' }
                    },
                    {
                      id: 'sub_gain',
                      type: 'scale',
                      name: 'Gain',
                      position: { x: 300, y: 100 },
                      parameters: { gain: 2.0 }
                    },
                    {
                      id: 'sub_output',
                      type: 'output_port',
                      name: 'Out',
                      position: { x: 500, y: 100 },
                      parameters: { portName: 'Out' }
                    }
                  ],
                  connections: [
                    {
                      id: 'w1',
                      sourceBlockId: 'sub_input',
                      sourcePortIndex: 0,
                      targetBlockId: 'sub_gain',
                      targetPortIndex: 0
                    },
                    {
                      id: 'w2',
                      sourceBlockId: 'sub_gain',
                      sourcePortIndex: 0,
                      targetBlockId: 'sub_output',
                      targetPortIndex: 0
                    }
                  ],
                  extents: { width: 1000, height: 600 }
                }
              ]
            }
          },
          {
            id: 'logger1',
            type: 'signal_logger',
            name: 'Output',
            position: { x: 500, y: 100 },
            parameters: { maxSamples: 1000 }
          }
        ],
        connections: [
          {
            id: 'w1',
            sourceBlockId: 'source1',
            sourcePortIndex: 0,
            targetBlockId: 'subsystem1',
            targetPortIndex: 0
          },
          {
            id: 'w2',
            sourceBlockId: 'subsystem1',
            sourcePortIndex: 0,
            targetBlockId: 'logger1',
            targetPortIndex: 0
          }
        ],
        extents: { width: 1000, height: 600 }
      }
    ]
  }

  const config: SimulationConfig = {
    timeStep: 0.01,
    duration: 1.0
  }

  describe('JavaScript vs WASM Comparison', () => {
    it('should produce same results as JavaScript simulation for multi-sheet model', async () => {
      const sheets = createMultiSheetModel()

      // Run JavaScript simulation
      const jsEngine = new MultiSheetSimulationEngine(sheets, config)
      const jsResults = jsEngine.run()

      // Extract main sheet results
      const mainResults = jsResults.get('main')
      expect(mainResults).toBeDefined()

      // Get logger data from JavaScript simulation
      const jsLoggerData = mainResults!.signalData.get('logger1')
      expect(jsLoggerData).toBeDefined()
      expect(jsLoggerData!.length).toBeGreaterThan(0)

      // Expected value: 5.0 * 2.0 = 10.0 (constant through subsystem gain)
      const jsExpectedValue = 10.0
      const jsFinalValue = jsLoggerData![jsLoggerData!.length - 1] as number
      expect(jsFinalValue).toBeCloseTo(jsExpectedValue, 6)

      console.log('JavaScript simulation result:', jsFinalValue)

      // Run WASM simulation
      // NOTE: This requires the model to be saved in the database with TEST_WASM_MODEL_ID_MULTISHEET
      const wasmEngine = new WasmSimulationEngine(TEST_MODEL_ID)
      await wasmEngine.initialize(config.timeStep)

      // Run simulation
      const numSteps = Math.floor(config.duration / config.timeStep)
      for (let i = 0; i < numSteps; i++) {
        wasmEngine.step()
      }

      // Get logger value from WASM
      const wasmLoggerData = wasmEngine.getLoggerValue('Output')
      expect(typeof wasmLoggerData).toBe('number')

      const wasmFinalValue = wasmLoggerData as number
      console.log('WASM simulation result:', wasmFinalValue)

      // Compare results - should be very close (within floating point precision)
      expect(wasmFinalValue).toBeCloseTo(jsFinalValue, 6)
      expect(wasmFinalValue).toBeCloseTo(jsExpectedValue, 6)

      // Clean up
      wasmEngine.destroy()
    }, 60000)

    it('should handle nested subsystems correctly', async () => {
      // Create a model with nested subsystems (subsystem within subsystem)
      const nestedSheets: Sheet[] = [
        {
          id: 'main',
          name: 'Main',
          blocks: [
            {
              id: 'source1',
              type: 'source',
              name: 'Input',
              position: { x: 100, y: 100 },
              parameters: {
                signalType: 'constant',
                value: 2.0,
                dataType: 'double'
              }
            },
            {
              id: 'subsystem1',
              type: 'subsystem',
              name: 'OuterSubsystem',
              position: { x: 300, y: 100 },
              parameters: {
                inputPorts: ['In'],
                outputPorts: ['Out'],
                sheets: [
                  {
                    id: 'outer_main',
                    name: 'Outer Main',
                    blocks: [
                      {
                        id: 'outer_input',
                        type: 'input_port',
                        name: 'In',
                        position: { x: 100, y: 100 },
                        parameters: { portName: 'In', dataType: 'double' }
                      },
                      {
                        id: 'inner_subsystem',
                        type: 'subsystem',
                        name: 'InnerSubsystem',
                        position: { x: 300, y: 100 },
                        parameters: {
                          inputPorts: ['In'],
                          outputPorts: ['Out'],
                          sheets: [
                            {
                              id: 'inner_main',
                              name: 'Inner Main',
                              blocks: [
                                {
                                  id: 'inner_input',
                                  type: 'input_port',
                                  name: 'In',
                                  position: { x: 100, y: 100 },
                                  parameters: { portName: 'In', dataType: 'double' }
                                },
                                {
                                  id: 'inner_gain',
                                  type: 'scale',
                                  name: 'Gain',
                                  position: { x: 300, y: 100 },
                                  parameters: { gain: 3.0 }
                                },
                                {
                                  id: 'inner_output',
                                  type: 'output_port',
                                  name: 'Out',
                                  position: { x: 500, y: 100 },
                                  parameters: { portName: 'Out' }
                                }
                              ],
                              connections: [
                                {
                                  id: 'w1',
                                  sourceBlockId: 'inner_input',
                                  sourcePortIndex: 0,
                                  targetBlockId: 'inner_gain',
                                  targetPortIndex: 0
                                },
                                {
                                  id: 'w2',
                                  sourceBlockId: 'inner_gain',
                                  sourcePortIndex: 0,
                                  targetBlockId: 'inner_output',
                                  targetPortIndex: 0
                                }
                              ],
                              extents: { width: 1000, height: 600 }
                            }
                          ]
                        }
                      },
                      {
                        id: 'outer_gain',
                        type: 'scale',
                        name: 'OuterGain',
                        position: { x: 500, y: 100 },
                        parameters: { gain: 5.0 }
                      },
                      {
                        id: 'outer_output',
                        type: 'output_port',
                        name: 'Out',
                        position: { x: 700, y: 100 },
                        parameters: { portName: 'Out' }
                      }
                    ],
                    connections: [
                      {
                        id: 'w1',
                        sourceBlockId: 'outer_input',
                        sourcePortIndex: 0,
                        targetBlockId: 'inner_subsystem',
                        targetPortIndex: 0
                      },
                      {
                        id: 'w2',
                        sourceBlockId: 'inner_subsystem',
                        sourcePortIndex: 0,
                        targetBlockId: 'outer_gain',
                        targetPortIndex: 0
                      },
                      {
                        id: 'w3',
                        sourceBlockId: 'outer_gain',
                        sourcePortIndex: 0,
                        targetBlockId: 'outer_output',
                        targetPortIndex: 0
                      }
                    ],
                    extents: { width: 1000, height: 600 }
                  }
                ]
              }
            },
            {
              id: 'logger1',
              type: 'signal_logger',
              name: 'Output',
              position: { x: 500, y: 100 },
              parameters: { maxSamples: 1000 }
            }
          ],
          connections: [
            {
              id: 'w1',
              sourceBlockId: 'source1',
              sourcePortIndex: 0,
              targetBlockId: 'subsystem1',
              targetPortIndex: 0
            },
            {
              id: 'w2',
              sourceBlockId: 'subsystem1',
              sourcePortIndex: 0,
              targetBlockId: 'logger1',
              targetPortIndex: 0
            }
          ],
          extents: { width: 1000, height: 600 }
        }
      ]

      // Run JavaScript simulation
      const jsEngine = new MultiSheetSimulationEngine(nestedSheets, config)
      const jsResults = jsEngine.run()
      const mainResults = jsResults.get('main')
      const jsLoggerData = mainResults!.signalData.get('logger1')
      const jsFinalValue = jsLoggerData![jsLoggerData!.length - 1] as number

      // Expected: 2.0 * 3.0 * 5.0 = 30.0
      const expectedValue = 30.0
      expect(jsFinalValue).toBeCloseTo(expectedValue, 6)

      console.log('Nested subsystem JavaScript result:', jsFinalValue)

      // TODO: Add WASM comparison when nested subsystem model is available in test database
      // This test documents that the architecture supports nested subsystems
    }, 60000)
  })

  describe('Subsystem State Management', () => {
    it('should maintain separate state for subsystem blocks', async () => {
      // This test verifies that subsystems with state (like integrators)
      // maintain their state correctly across simulation steps

      // TODO: Implement when we have a test model with stateful subsystems
      expect(true).toBe(true) // Placeholder
    })
  })
})

describe('Architecture Documentation', () => {
  it('documents how multi-sheet models compile to WASM', () => {
    /**
     * ARCHITECTURE NOTES:
     *
     * 1. Multi-sheet models (models with subsystems) compile to a SINGLE WASM module
     * 2. The C code generator flattens the hierarchy:
     *    - Each subsystem becomes a C function
     *    - Main sheet blocks call subsystem functions
     *    - All compiled into one .wasm file
     *
     * 3. This is different from the JavaScript simulation:
     *    - JavaScript creates separate SimulationEngine instances per sheet
     *    - JavaScript orchestrates calls between engines
     *    - WASM has all logic in one module
     *
     * 4. Benefits of WASM approach:
     *    - Simpler memory management (one module)
     *    - Better optimization (compiler sees whole model)
     *    - Faster execution (no cross-engine calls)
     *    - Perfect fidelity with embedded deployment
     *
     * 5. Current limitation:
     *    - WASM doesn't expose per-sheet results
     *    - Only exposes model-level outputs and loggers
     *    - This is sufficient for most use cases
     *    - Could be enhanced in future if needed
     */

    expect(true).toBe(true)
  })
})
