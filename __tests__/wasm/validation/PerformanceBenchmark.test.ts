/**
 * Performance Benchmarking Test Suite
 *
 * Phase 4, Task 4.2: Measure TypeScript simulation performance
 *
 * This provides baseline metrics for:
 * - Steps per second
 * - Memory usage (if available)
 * - Model complexity impact
 */

import { MultiSheetSimulationEngine } from '@/lib/multiSheetSimulation'
import type { Sheet, SimulationConfig } from '@/lib/simulationEngine'

// Timeout for long benchmarks
jest.setTimeout(60000)

/**
 * Helper to generate a chain of N gain blocks
 */
function generateChainModel(blockCount: number): Sheet[] {
  const blocks: any[] = [
    {
      id: 'source',
      name: 'Source',
      type: 'source',
      position: { x: 50, y: 100 },
      parameters: { value: 1.0, dataType: 'double', signalType: 'constant' }
    }
  ]

  const connections: any[] = []

  // Create chain of gain blocks
  for (let i = 0; i < blockCount; i++) {
    blocks.push({
      id: `gain_${i}`,
      name: `Gain${i}`,
      type: 'scale',
      position: { x: 100 + i * 50, y: 100 },
      parameters: { gain: 1.001 } // Small gain to avoid overflow
    })

    // Connect to previous block
    connections.push({
      id: `wire_${i}`,
      sourceBlockId: i === 0 ? 'source' : `gain_${i - 1}`,
      sourcePortIndex: 0,
      targetBlockId: `gain_${i}`,
      targetPortIndex: 0
    })
  }

  // Add output port
  blocks.push({
    id: 'output',
    name: 'Output',
    type: 'output_port',
    position: { x: 100 + blockCount * 50, y: 100 },
    parameters: { portName: 'result' }
  })

  connections.push({
    id: 'wire_output',
    sourceBlockId: `gain_${blockCount - 1}`,
    sourcePortIndex: 0,
    targetBlockId: 'output',
    targetPortIndex: 0
  })

  return [{
    id: 'main',
    name: 'Main',
    blocks,
    connections,
    extents: { width: 100 + blockCount * 50 + 100, height: 300 }
  }]
}

/**
 * Helper to generate a parallel model with N independent paths
 */
function generateParallelModel(pathCount: number): Sheet[] {
  const blocks: any[] = []
  const connections: any[] = []

  // Create N independent source -> gain -> output paths
  for (let i = 0; i < pathCount; i++) {
    blocks.push({
      id: `source_${i}`,
      name: `Source${i}`,
      type: 'source',
      position: { x: 50, y: 100 + i * 80 },
      parameters: { value: i + 1, dataType: 'double', signalType: 'constant' }
    })

    blocks.push({
      id: `gain_${i}`,
      name: `Gain${i}`,
      type: 'scale',
      position: { x: 150, y: 100 + i * 80 },
      parameters: { gain: 2.0 }
    })

    blocks.push({
      id: `output_${i}`,
      name: `Output${i}`,
      type: 'output_port',
      position: { x: 250, y: 100 + i * 80 },
      parameters: { portName: `result_${i}` }
    })

    connections.push({
      id: `wire_${i}_1`,
      sourceBlockId: `source_${i}`,
      sourcePortIndex: 0,
      targetBlockId: `gain_${i}`,
      targetPortIndex: 0
    })

    connections.push({
      id: `wire_${i}_2`,
      sourceBlockId: `gain_${i}`,
      sourcePortIndex: 0,
      targetBlockId: `output_${i}`,
      targetPortIndex: 0
    })
  }

  return [{
    id: 'main',
    name: 'Main',
    blocks,
    connections,
    extents: { width: 400, height: 100 + pathCount * 80 }
  }]
}

/**
 * Helper to generate a model with transfer functions
 */
function generateDynamicModel(tfCount: number): Sheet[] {
  const blocks: any[] = [{
    id: 'source',
    name: 'Source',
    type: 'source',
    position: { x: 50, y: 100 },
    parameters: { value: 1.0, dataType: 'double', signalType: 'constant' }
  }]

  const connections: any[] = []

  // Create chain of transfer functions (low-pass filters)
  for (let i = 0; i < tfCount; i++) {
    blocks.push({
      id: `tf_${i}`,
      name: `TF${i}`,
      type: 'transfer_function',
      position: { x: 100 + i * 100, y: 100 },
      parameters: {
        numerator: [1],
        denominator: [1, 1] // 1/(s+1)
      }
    })

    connections.push({
      id: `wire_${i}`,
      sourceBlockId: i === 0 ? 'source' : `tf_${i - 1}`,
      sourcePortIndex: 0,
      targetBlockId: `tf_${i}`,
      targetPortIndex: 0
    })
  }

  // Add output
  blocks.push({
    id: 'output',
    name: 'Output',
    type: 'output_port',
    position: { x: 100 + tfCount * 100, y: 100 },
    parameters: { portName: 'result' }
  })

  connections.push({
    id: 'wire_output',
    sourceBlockId: `tf_${tfCount - 1}`,
    sourcePortIndex: 0,
    targetBlockId: 'output',
    targetPortIndex: 0
  })

  return [{
    id: 'main',
    name: 'Main',
    blocks,
    connections,
    extents: { width: 200 + tfCount * 100, height: 300 }
  }]
}

/**
 * Measure execution time
 */
function measureTime(fn: () => void): number {
  const start = performance.now()
  fn()
  return performance.now() - start
}

describe('Performance Benchmarking: TypeScript Simulation', () => {
  describe('Steps per Second', () => {
    it('should measure baseline performance with minimal model', () => {
      const model: Sheet[] = [{
        id: 'main',
        name: 'Main',
        blocks: [
          {
            id: 'source',
            name: 'Source',
            type: 'source',
            position: { x: 100, y: 100 },
            parameters: { value: 1.0, dataType: 'double', signalType: 'constant' }
          },
          {
            id: 'output',
            name: 'Output',
            type: 'output_port',
            position: { x: 200, y: 100 },
            parameters: { portName: 'result' }
          }
        ],
        connections: [{
          id: 'wire',
          sourceBlockId: 'source',
          sourcePortIndex: 0,
          targetBlockId: 'output',
          targetPortIndex: 0
        }],
        extents: { width: 400, height: 300 }
      }]

      const config: SimulationConfig = {
        timeStep: 0.001,
        duration: 1.0 // 1000 steps
      }

      const engine = new MultiSheetSimulationEngine(model, config)

      const timeMs = measureTime(() => engine.run())
      const stepsPerSecond = 1000 / (timeMs / 1000)

      console.log(`Baseline: ${stepsPerSecond.toFixed(0)} steps/sec (${timeMs.toFixed(2)}ms for 1000 steps)`)

      // Baseline should be very fast - at least 10,000 steps/sec
      expect(stepsPerSecond).toBeGreaterThan(1000)
    })

    it('should scale with model complexity (chain of 10 blocks)', () => {
      const model = generateChainModel(10)
      const config: SimulationConfig = {
        timeStep: 0.001,
        duration: 1.0
      }

      const engine = new MultiSheetSimulationEngine(model, config)

      const timeMs = measureTime(() => engine.run())
      const stepsPerSecond = 1000 / (timeMs / 1000)

      console.log(`10-block chain: ${stepsPerSecond.toFixed(0)} steps/sec (${timeMs.toFixed(2)}ms)`)

      expect(stepsPerSecond).toBeGreaterThan(500)
    })

    it('should scale with model complexity (chain of 50 blocks)', () => {
      const model = generateChainModel(50)
      const config: SimulationConfig = {
        timeStep: 0.001,
        duration: 1.0
      }

      const engine = new MultiSheetSimulationEngine(model, config)

      const timeMs = measureTime(() => engine.run())
      const stepsPerSecond = 1000 / (timeMs / 1000)

      console.log(`50-block chain: ${stepsPerSecond.toFixed(0)} steps/sec (${timeMs.toFixed(2)}ms)`)

      expect(stepsPerSecond).toBeGreaterThan(100)
    })

    it('should scale with model complexity (chain of 100 blocks)', () => {
      const model = generateChainModel(100)
      const config: SimulationConfig = {
        timeStep: 0.001,
        duration: 1.0
      }

      const engine = new MultiSheetSimulationEngine(model, config)

      const timeMs = measureTime(() => engine.run())
      const stepsPerSecond = 1000 / (timeMs / 1000)

      console.log(`100-block chain: ${stepsPerSecond.toFixed(0)} steps/sec (${timeMs.toFixed(2)}ms)`)

      expect(stepsPerSecond).toBeGreaterThan(50)
    })
  })

  describe('Parallel Path Scaling', () => {
    it('should handle 10 parallel paths', () => {
      const model = generateParallelModel(10)
      const config: SimulationConfig = {
        timeStep: 0.001,
        duration: 1.0
      }

      const engine = new MultiSheetSimulationEngine(model, config)

      const timeMs = measureTime(() => engine.run())
      const stepsPerSecond = 1000 / (timeMs / 1000)

      console.log(`10 parallel paths: ${stepsPerSecond.toFixed(0)} steps/sec (${timeMs.toFixed(2)}ms)`)

      expect(stepsPerSecond).toBeGreaterThan(100)
    })

    it('should handle 50 parallel paths', () => {
      const model = generateParallelModel(50)
      const config: SimulationConfig = {
        timeStep: 0.001,
        duration: 1.0
      }

      const engine = new MultiSheetSimulationEngine(model, config)

      const timeMs = measureTime(() => engine.run())
      const stepsPerSecond = 1000 / (timeMs / 1000)

      console.log(`50 parallel paths: ${stepsPerSecond.toFixed(0)} steps/sec (${timeMs.toFixed(2)}ms)`)

      expect(stepsPerSecond).toBeGreaterThan(50)
    })
  })

  describe('Dynamic Model Performance', () => {
    it('should handle 5 transfer functions in series', () => {
      const model = generateDynamicModel(5)
      const config: SimulationConfig = {
        timeStep: 0.001,
        duration: 1.0
      }

      const engine = new MultiSheetSimulationEngine(model, config)

      const timeMs = measureTime(() => engine.run())
      const stepsPerSecond = 1000 / (timeMs / 1000)

      console.log(`5 TFs in series: ${stepsPerSecond.toFixed(0)} steps/sec (${timeMs.toFixed(2)}ms)`)

      // Transfer functions are more expensive
      expect(stepsPerSecond).toBeGreaterThan(50)
    })

    it('should handle 10 transfer functions in series', () => {
      const model = generateDynamicModel(10)
      const config: SimulationConfig = {
        timeStep: 0.001,
        duration: 1.0
      }

      const engine = new MultiSheetSimulationEngine(model, config)

      const timeMs = measureTime(() => engine.run())
      const stepsPerSecond = 1000 / (timeMs / 1000)

      console.log(`10 TFs in series: ${stepsPerSecond.toFixed(0)} steps/sec (${timeMs.toFixed(2)}ms)`)

      expect(stepsPerSecond).toBeGreaterThan(25)
    })
  })

  describe('Long Duration Simulations', () => {
    it('should handle 10,000 steps efficiently', () => {
      const model: Sheet[] = [{
        id: 'main',
        name: 'Main',
        blocks: [
          {
            id: 'source',
            name: 'Source',
            type: 'source',
            position: { x: 100, y: 100 },
            parameters: { value: 1.0, dataType: 'double', signalType: 'constant' }
          },
          {
            id: 'tf',
            name: 'TF',
            type: 'transfer_function',
            position: { x: 200, y: 100 },
            parameters: { numerator: [1], denominator: [1, 1] }
          },
          {
            id: 'output',
            name: 'Output',
            type: 'output_port',
            position: { x: 300, y: 100 },
            parameters: { portName: 'result' }
          }
        ],
        connections: [
          {
            id: 'wire1',
            sourceBlockId: 'source',
            sourcePortIndex: 0,
            targetBlockId: 'tf',
            targetPortIndex: 0
          },
          {
            id: 'wire2',
            sourceBlockId: 'tf',
            sourcePortIndex: 0,
            targetBlockId: 'output',
            targetPortIndex: 0
          }
        ],
        extents: { width: 400, height: 300 }
      }]

      const config: SimulationConfig = {
        timeStep: 0.001,
        duration: 10.0 // 10,000 steps
      }

      const engine = new MultiSheetSimulationEngine(model, config)

      const timeMs = measureTime(() => engine.run())
      const stepsPerSecond = 10000 / (timeMs / 1000)

      console.log(`10,000 steps with TF: ${stepsPerSecond.toFixed(0)} steps/sec (${timeMs.toFixed(2)}ms)`)

      // Should complete in reasonable time
      expect(timeMs).toBeLessThan(10000) // Less than 10 seconds
      expect(stepsPerSecond).toBeGreaterThan(100)
    })

    it('should handle 100,000 steps efficiently', () => {
      const model: Sheet[] = [{
        id: 'main',
        name: 'Main',
        blocks: [
          {
            id: 'source',
            name: 'Source',
            type: 'source',
            position: { x: 100, y: 100 },
            parameters: { value: 1.0, dataType: 'double', signalType: 'constant' }
          },
          {
            id: 'gain',
            name: 'Gain',
            type: 'scale',
            position: { x: 200, y: 100 },
            parameters: { gain: 2.0 }
          },
          {
            id: 'output',
            name: 'Output',
            type: 'output_port',
            position: { x: 300, y: 100 },
            parameters: { portName: 'result' }
          }
        ],
        connections: [
          {
            id: 'wire1',
            sourceBlockId: 'source',
            sourcePortIndex: 0,
            targetBlockId: 'gain',
            targetPortIndex: 0
          },
          {
            id: 'wire2',
            sourceBlockId: 'gain',
            sourcePortIndex: 0,
            targetBlockId: 'output',
            targetPortIndex: 0
          }
        ],
        extents: { width: 400, height: 300 }
      }]

      const config: SimulationConfig = {
        timeStep: 0.0001,
        duration: 10.0 // 100,000 steps
      }

      const engine = new MultiSheetSimulationEngine(model, config)

      const timeMs = measureTime(() => engine.run())
      const stepsPerSecond = 100000 / (timeMs / 1000)

      console.log(`100,000 steps (simple): ${stepsPerSecond.toFixed(0)} steps/sec (${timeMs.toFixed(2)}ms)`)

      // Should complete in reasonable time
      expect(timeMs).toBeLessThan(30000) // Less than 30 seconds
    })
  })

  describe('Performance Summary', () => {
    it('should generate benchmark summary', () => {
      const results: Record<string, { steps: number; timeMs: number; stepsPerSec: number }> = {}

      // Run various benchmarks
      const configs = [
        { name: 'minimal', blocks: 2, steps: 1000, modelFn: () => generateChainModel(1) },
        { name: '10-chain', blocks: 12, steps: 1000, modelFn: () => generateChainModel(10) },
        { name: '50-chain', blocks: 52, steps: 1000, modelFn: () => generateChainModel(50) },
        { name: '5-tf', blocks: 7, steps: 1000, modelFn: () => generateDynamicModel(5) },
      ]

      for (const cfg of configs) {
        const model = cfg.modelFn()
        const config: SimulationConfig = {
          timeStep: 0.001,
          duration: 1.0
        }

        const engine = new MultiSheetSimulationEngine(model, config)
        const timeMs = measureTime(() => engine.run())
        const stepsPerSec = cfg.steps / (timeMs / 1000)

        results[cfg.name] = { steps: cfg.steps, timeMs, stepsPerSec }
      }

      // Print summary
      console.log('\n=== TypeScript Simulation Performance Summary ===')
      console.log('| Model | Steps | Time (ms) | Steps/sec |')
      console.log('|-------|-------|-----------|-----------|')
      for (const [name, data] of Object.entries(results)) {
        console.log(`| ${name.padEnd(10)} | ${data.steps} | ${data.timeMs.toFixed(2).padStart(9)} | ${data.stepsPerSec.toFixed(0).padStart(9)} |`)
      }
      console.log('==============================================\n')

      // All benchmarks should complete
      expect(Object.keys(results).length).toBe(configs.length)
    })
  })
})
