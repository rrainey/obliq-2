/**
 * Tests for WasmSimulationEngine Memory Management
 *
 * Covers:
 * - Memory allocation/deallocation
 * - Buffer copying (JS ↔ WASM)
 * - Memory usage tracking
 * - Leak detection
 * - Memory limits
 */

import { WasmSimulationEngine } from '@/lib/simulation/WasmSimulationEngine'

// Mock fetch for unit tests
global.fetch = jest.fn()

describe('WasmSimulationEngine Memory Management', () => {
  describe('Memory Allocation', () => {
    it('should throw error when allocating before initialization', () => {
      const engine = new WasmSimulationEngine('test-model-id')

      expect(() => engine.malloc(100)).toThrow('not initialized')
    })

    it('should throw error when freeing before initialization', () => {
      const engine = new WasmSimulationEngine('test-model-id')

      expect(() => engine.free(12345)).toThrow('not initialized')
    })
  })

  describe('Memory Statistics', () => {
    it('should return zero stats for uninitialized engine', () => {
      const engine = new WasmSimulationEngine('test-model-id')
      const stats = engine.getMemoryStats()

      expect(stats.activeAllocations).toBe(0)
      expect(stats.totalAllocated).toBe(0)
      expect(stats.peakMemory).toBe(0)
      expect(stats.totalAllocationsCount).toBe(0)
      expect(stats.totalDeallocationsCount).toBe(0)
      expect(stats.potentialLeaks).toBe(0)
    })

    it('should provide immutable stats snapshot', () => {
      const engine = new WasmSimulationEngine('test-model-id')
      const stats = engine.getMemoryStats()

      // Try to modify
      ;(stats as any).activeAllocations = 999

      // Should not affect next call
      const stats2 = engine.getMemoryStats()
      expect(stats2.activeAllocations).toBe(0)
    })
  })

  describe('Leak Detection', () => {
    it('should warn when leak detection is disabled', () => {
      const engine = new WasmSimulationEngine('test-model-id', {
        enableLeakDetection: false
      })

      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation()

      const leaks = engine.checkForLeaks()

      expect(leaks).toBe(0)
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Leak detection disabled')
      )

      consoleSpy.mockRestore()
    })

    it('should create engine with leak detection enabled', () => {
      const engine = new WasmSimulationEngine('test-model-id', {
        enableLeakDetection: true
      })

      expect(engine).toBeInstanceOf(WasmSimulationEngine)
    })

    it('should create engine with custom memory limit', () => {
      const engine = new WasmSimulationEngine('test-model-id', {
        memoryLimit: 1024 * 1024 // 1 MB
      })

      expect(engine).toBeInstanceOf(WasmSimulationEngine)
    })
  })

  describe('Buffer Operations', () => {
    it('should throw error when writing buffers before initialization', () => {
      const engine = new WasmSimulationEngine('test-model-id')
      const data = new Float32Array([1, 2, 3])

      expect(() => engine.writeFloat32Array(data)).toThrow('not initialized')
    })

    it('should throw error when reading buffers before initialization', () => {
      const engine = new WasmSimulationEngine('test-model-id')

      expect(() => engine.readFloat32Array(0, 10)).toThrow('not initialized')
    })
  })

  describe('Cleanup', () => {
    it('should reset memory stats on destroy', () => {
      const engine = new WasmSimulationEngine('test-model-id')

      engine.destroy()

      const stats = engine.getMemoryStats()
      expect(stats.activeAllocations).toBe(0)
      expect(stats.totalAllocated).toBe(0)
      expect(stats.peakMemory).toBe(0)
    })
  })
})

// Integration tests (require actual WASM compilation)
const describeIntegration =
  process.env.TEST_WASM_INTEGRATION === 'true' && process.env.TEST_WASM_MODEL_ID
    ? describe
    : describe.skip

describeIntegration('WasmSimulationEngine Memory Management Integration', () => {
  const TEST_MODEL_ID = process.env.TEST_WASM_MODEL_ID!
  let engine: WasmSimulationEngine

  beforeEach(() => {
    engine = new WasmSimulationEngine(TEST_MODEL_ID, {
      enableLeakDetection: true,
      memoryLimit: 10 * 1024 * 1024 // 10 MB
    })
  })

  afterEach(() => {
    engine.destroy()
  })

  describe('malloc/free', () => {
    beforeEach(async () => {
      await engine.initialize(0.01)
    })

    it('should allocate and free memory', () => {
      const ptr = engine.malloc(1024)
      expect(ptr).toBeGreaterThan(0)

      const stats1 = engine.getMemoryStats()
      expect(stats1.activeAllocations).toBe(1)
      expect(stats1.totalAllocated).toBe(1024)
      expect(stats1.totalAllocationsCount).toBe(1)

      engine.free(ptr)

      const stats2 = engine.getMemoryStats()
      expect(stats2.activeAllocations).toBe(0)
      expect(stats2.totalAllocated).toBe(0)
      expect(stats2.totalDeallocationsCount).toBe(1)
    })

    it('should track multiple allocations', () => {
      const ptr1 = engine.malloc(512)
      const ptr2 = engine.malloc(256)
      const ptr3 = engine.malloc(128)

      const stats = engine.getMemoryStats()
      expect(stats.activeAllocations).toBe(3)
      expect(stats.totalAllocated).toBe(512 + 256 + 128)
      expect(stats.totalAllocationsCount).toBe(3)

      engine.free(ptr2)

      const stats2 = engine.getMemoryStats()
      expect(stats2.activeAllocations).toBe(2)
      expect(stats2.totalAllocated).toBe(512 + 128)

      engine.free(ptr1)
      engine.free(ptr3)

      const stats3 = engine.getMemoryStats()
      expect(stats3.activeAllocations).toBe(0)
      expect(stats3.totalAllocated).toBe(0)
    })

    it('should track peak memory usage', () => {
      const ptr1 = engine.malloc(1024)
      const ptr2 = engine.malloc(2048)

      const stats1 = engine.getMemoryStats()
      expect(stats1.peakMemory).toBe(1024 + 2048)

      engine.free(ptr2)

      const stats2 = engine.getMemoryStats()
      expect(stats2.totalAllocated).toBe(1024)
      expect(stats2.peakMemory).toBe(1024 + 2048) // Peak should not decrease

      engine.free(ptr1)
    })

    it('should enforce memory limit', () => {
      const engine2 = new WasmSimulationEngine(TEST_MODEL_ID, {
        memoryLimit: 1000 // Very small limit
      })

      engine2.initialize(0.01).then(() => {
        expect(() => engine2.malloc(2000)).toThrow('Memory limit exceeded')
        engine2.destroy()
      })
    })

    it('should handle freeing null pointer gracefully', () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation()

      engine.free(0)

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Attempting to free null pointer')
      )

      consoleSpy.mockRestore()
    })

    it('should warn when freeing untracked pointer', () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation()

      engine.free(99999) // Random pointer not allocated by us

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Attempting to free untracked pointer')
      )

      consoleSpy.mockRestore()
    })
  })

  describe('Float32Array Buffer Operations', () => {
    beforeEach(async () => {
      await engine.initialize(0.01)
    })

    it('should write and read Float32Array', () => {
      const data = new Float32Array([1.5, 2.5, 3.5, 4.5])

      const ptr = engine.writeFloat32Array(data)
      expect(ptr).toBeGreaterThan(0)

      const readData = engine.readFloat32Array(ptr, data.length)
      expect(readData.length).toBe(data.length)
      expect(Array.from(readData)).toEqual(Array.from(data))

      engine.free(ptr)
    })

    it('should handle large Float32Arrays', () => {
      const size = 10000
      const data = new Float32Array(size)
      for (let i = 0; i < size; i++) {
        data[i] = Math.random() * 100
      }

      const ptr = engine.writeFloat32Array(data)
      const readData = engine.readFloat32Array(ptr, size)

      expect(readData.length).toBe(size)
      for (let i = 0; i < size; i++) {
        expect(readData[i]).toBeCloseTo(data[i], 5)
      }

      engine.free(ptr)
    })
  })

  describe('Float64Array Buffer Operations', () => {
    beforeEach(async () => {
      await engine.initialize(0.01)
    })

    it('should write and read Float64Array', () => {
      const data = new Float64Array([1.123456789, 2.987654321, 3.555555555])

      const ptr = engine.writeFloat64Array(data)
      expect(ptr).toBeGreaterThan(0)

      const readData = engine.readFloat64Array(ptr, data.length)
      expect(readData.length).toBe(data.length)
      expect(Array.from(readData)).toEqual(Array.from(data))

      engine.free(ptr)
    })
  })

  describe('Uint8Array Buffer Operations', () => {
    beforeEach(async () => {
      await engine.initialize(0.01)
    })

    it('should write and read Uint8Array', () => {
      const data = new Uint8Array([0, 1, 2, 255, 128, 64])

      const ptr = engine.writeUint8Array(data)
      expect(ptr).toBeGreaterThan(0)

      const readData = engine.readUint8Array(ptr, data.length)
      expect(readData.length).toBe(data.length)
      expect(Array.from(readData)).toEqual(Array.from(data))

      engine.free(ptr)
    })
  })

  describe('Leak Detection', () => {
    beforeEach(async () => {
      await engine.initialize(0.01)
    })

    it('should detect memory leaks', () => {
      // Allocate but don't free
      engine.malloc(512)
      engine.malloc(256)

      const leaks = engine.checkForLeaks(false) // Don't log
      expect(leaks).toBe(2)

      const stats = engine.getMemoryStats()
      expect(stats.potentialLeaks).toBe(2)
    })

    it('should log leak details when enabled', () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation()

      engine.malloc(512)

      engine.checkForLeaks(true)

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Detected 1 potential memory leak')
      )

      consoleSpy.mockRestore()
    })

    it('should not count freed allocations as leaks', () => {
      const ptr1 = engine.malloc(512)
      const ptr2 = engine.malloc(256)

      engine.free(ptr1)
      engine.free(ptr2)

      const leaks = engine.checkForLeaks()
      expect(leaks).toBe(0)
    })
  })

  describe('freeAll', () => {
    beforeEach(async () => {
      await engine.initialize(0.01)
    })

    it('should free all tracked allocations', () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation()

      engine.malloc(512)
      engine.malloc(256)
      engine.malloc(128)

      const stats1 = engine.getMemoryStats()
      expect(stats1.activeAllocations).toBe(3)

      engine.freeAll()

      const stats2 = engine.getMemoryStats()
      expect(stats2.activeAllocations).toBe(0)
      expect(stats2.totalAllocated).toBe(0)

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Freeing 3 tracked allocation')
      )

      consoleSpy.mockRestore()
    })

    it('should handle freeAll with no allocations', () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation()

      engine.freeAll()

      expect(consoleSpy).not.toHaveBeenCalled()

      consoleSpy.mockRestore()
    })
  })

  describe('destroy with leak detection', () => {
    it('should report leaks on destroy when leak detection enabled', async () => {
      await engine.initialize(0.01)

      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation()

      // Create leaks
      engine.malloc(512)
      engine.malloc(256)

      engine.destroy()

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Detected 2 potential memory leak')
      )

      consoleSpy.mockRestore()
    })

    it('should clean up allocations on destroy', async () => {
      await engine.initialize(0.01)

      engine.malloc(512)
      engine.malloc(256)

      const stats1 = engine.getMemoryStats()
      expect(stats1.activeAllocations).toBe(2)

      engine.destroy()

      const stats2 = engine.getMemoryStats()
      expect(stats2.activeAllocations).toBe(0)
      expect(stats2.totalAllocated).toBe(0)
      expect(stats2.peakMemory).toBe(0)
    })
  })

  describe('Stress Test: 1000 Simulations', () => {
    it(
      'should not leak memory after 1000 simulation lifecycles',
      async () => {
        const iterations = 1000
        const results: number[] = []

        for (let i = 0; i < iterations; i++) {
          const testEngine = new WasmSimulationEngine(TEST_MODEL_ID, {
            enableLeakDetection: true
          })

          await testEngine.initialize(0.01)

          // Run a few steps
          for (let j = 0; j < 10; j++) {
            testEngine.step()
          }

          // Check for leaks
          const leaks = testEngine.checkForLeaks(false)
          results.push(leaks)

          testEngine.destroy()

          // Log progress every 100 iterations
          if ((i + 1) % 100 === 0) {
            console.log(`Completed ${i + 1}/${iterations} simulations`)
          }
        }

        // All iterations should have 0 leaks
        const totalLeaks = results.reduce((sum, leaks) => sum + leaks, 0)
        expect(totalLeaks).toBe(0)

        console.log(
          `✅ Completed ${iterations} simulations with ${totalLeaks} total memory leaks`
        )
      },
      300000
    ) // 5 minute timeout
  })
})
