/**
 * WASM Execution Integration Test
 *
 * Tests the complete flow of compiling a model to WASM and executing it
 * using the new WasmSimulationEngine.loadCompiledModule() flow.
 */

import { WasmSimulationEngine } from '@/lib/simulation/WasmSimulationEngine'
import { convertWasmToUIFormat, WasmDataCollector } from '@/lib/simulation/WasmResultConverter'
import type { Sheet } from '@/components/SheetTabs'

// Skip by default - requires Supabase connection
describe.skip('WASM Execution Integration', () => {
  it('should execute a simple WASM simulation end-to-end', async () => {
    // This test verifies the complete flow:
    // 1. Compile model to WASM (via API)
    // 2. Load compiled WASM module
    // 3. Initialize and run simulation
    // 4. Collect logger data
    // 5. Convert to UI format

    // For now, this is a placeholder that documents the expected flow
    // Real implementation requires a valid model ID and Supabase connection

    const modelId = 'test-model-id'
    const engine = new WasmSimulationEngine(modelId)

    // In the real UI flow:
    // 1. User clicks "Run Simulation" with WASM enabled
    // 2. CompilationProgress component compiles model via SSE
    // 3. onComplete callback stores wasmData, jsData, metadata
    // 4. handleRunSimulation calls loadCompiledModule() with stored data
    // 5. initialize() is called to set timestep
    // 6. Simulation runs with step() in a loop
    // 7. WasmDataCollector collects logger values each step
    // 8. convertWasmToUIFormat() converts results to UI format

    expect(engine).toBeDefined()
  })

  it('should collect logger data during simulation', () => {
    // Test the WasmDataCollector
    const collector = new WasmDataCollector()

    // Simulate collecting data over 5 time steps
    for (let i = 0; i < 5; i++) {
      const time = i * 0.01
      const loggerValues = {
        Temperature: 20 + i,
        Pressure: 100 + i * 0.5
      }
      collector.collect(time, loggerValues)
    }

    const history = collector.getHistory()
    const timePoints = collector.getTimePoints()

    expect(timePoints).toHaveLength(5)
    expect(timePoints).toEqual([0, 0.01, 0.02, 0.03, 0.04])

    expect(history.has('Temperature')).toBe(true)
    expect(history.has('Pressure')).toBe(true)

    expect(history.get('Temperature')).toEqual([20, 21, 22, 23, 24])
    expect(history.get('Pressure')).toEqual([100, 100.5, 101, 101.5, 102])
  })

  it('should convert WASM results to UI format', () => {
    // Create a simple test sheet with a signal logger
    const sheets: Sheet[] = [
      {
        id: 'sheet-1',
        name: 'Main',
        blocks: [
          {
            id: 'block-1',
            name: 'Constant',
            type: 'constant',
            x: 100,
            y: 100,
            parameters: { value: 5.0 }
          },
          {
            id: 'logger-1',
            name: 'TempLogger',
            type: 'signal_logger',
            x: 200,
            y: 100,
            parameters: {}
          }
        ],
        connections: [
          {
            id: 'conn-1',
            sourceBlockId: 'block-1',
            targetBlockId: 'logger-1',
            sourcePort: 0,
            targetPort: 0
          }
        ]
      }
    ]

    const loggerNames = ['logger_TempLogger']
    const loggerValues = { TempLogger: 5.0 }

    // Create historical data
    const history = new Map<string, number[]>()
    history.set('TempLogger', [5.0, 5.0, 5.0, 5.0, 5.0])

    const timePoints = [0, 0.01, 0.02, 0.03, 0.04]

    const results = convertWasmToUIFormat(
      loggerNames,
      loggerValues,
      sheets,
      0.01,
      0.04,
      timePoints,
      history
    )

    // Should have results for sheet-1
    expect(results.has('sheet-1')).toBe(true)

    const sheetResults = results.get('sheet-1')!
    expect(sheetResults.timePoints).toEqual(timePoints)
    expect(sheetResults.finalTime).toBe(0.04)

    // Should have data for the logger block
    expect(sheetResults.signalData.has('logger-1')).toBe(true)
    expect(sheetResults.signalData.get('logger-1')).toEqual([5.0, 5.0, 5.0, 5.0, 5.0])
  })

  it('should handle multiple sheets with loggers', () => {
    const sheets: Sheet[] = [
      {
        id: 'sheet-1',
        name: 'Main',
        blocks: [
          {
            id: 'logger-1',
            name: 'Logger1',
            type: 'signal_logger',
            x: 100,
            y: 100,
            parameters: {}
          }
        ],
        connections: []
      },
      {
        id: 'sheet-2',
        name: 'Subsystem',
        blocks: [
          {
            id: 'logger-2',
            name: 'Logger2',
            type: 'signal_logger',
            x: 100,
            y: 100,
            parameters: {}
          }
        ],
        connections: []
      }
    ]

    const loggerNames = ['logger_Logger1', 'logger_Logger2']
    const loggerValues = { Logger1: 1.0, Logger2: 2.0 }

    const history = new Map<string, number[]>()
    history.set('Logger1', [1.0, 1.0])
    history.set('Logger2', [2.0, 2.0])

    const timePoints = [0, 0.01]

    const results = convertWasmToUIFormat(
      loggerNames,
      loggerValues,
      sheets,
      0.01,
      0.01,
      timePoints,
      history
    )

    // Should have results for both sheets
    expect(results.has('sheet-1')).toBe(true)
    expect(results.has('sheet-2')).toBe(true)

    // Verify sheet-1 data
    const sheet1Results = results.get('sheet-1')!
    expect(sheet1Results.signalData.has('logger-1')).toBe(true)
    expect(sheet1Results.signalData.get('logger-1')).toEqual([1.0, 1.0])

    // Verify sheet-2 data
    const sheet2Results = results.get('sheet-2')!
    expect(sheet2Results.signalData.has('logger-2')).toBe(true)
    expect(sheet2Results.signalData.get('logger-2')).toEqual([2.0, 2.0])
  })
})
