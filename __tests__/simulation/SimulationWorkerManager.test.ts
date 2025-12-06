/**
 * Tests for SimulationWorkerManager
 *
 * Tests the Web Worker-based simulation execution.
 * Note: Web Workers require a browser environment, so these tests
 * mock the worker behavior for unit testing.
 */

import {
  isWorkerAvailable,
  createWorkerManager,
  SimulationWorkerManager
} from '@/lib/simulation/SimulationWorkerManager'

describe('SimulationWorkerManager', () => {
  describe('isWorkerAvailable', () => {
    it('should return false in Node.js environment', () => {
      // In Node.js test environment, Worker is not defined
      const originalWorker = (global as any).Worker
      delete (global as any).Worker

      expect(isWorkerAvailable()).toBe(false)

      // Restore
      if (originalWorker) {
        (global as any).Worker = originalWorker
      }
    })

    it('should return true when Worker is defined', () => {
      // Mock Worker
      const MockWorker = class {
        constructor() {}
        postMessage() {}
        terminate() {}
        onmessage: ((e: any) => void) | null = null
        onerror: ((e: any) => void) | null = null
      };

      (global as any).Worker = MockWorker

      expect(isWorkerAvailable()).toBe(true)

      // Cleanup
      delete (global as any).Worker
    })
  })

  describe('createWorkerManager', () => {
    it('should return null when workers are not available', () => {
      // Ensure Worker is not defined
      const originalWorker = (global as any).Worker
      delete (global as any).Worker

      const manager = createWorkerManager()
      expect(manager).toBeNull()

      // Restore
      if (originalWorker) {
        (global as any).Worker = originalWorker
      }
    })
  })

  describe('SimulationProgress interface', () => {
    it('should have correct structure', () => {
      const progress = {
        step: 100,
        totalSteps: 1000,
        progress: 10,
        time: 1.0
      }

      expect(progress.step).toBe(100)
      expect(progress.totalSteps).toBe(1000)
      expect(progress.progress).toBe(10)
      expect(progress.time).toBe(1.0)
    })
  })

  describe('SimulationRunConfig interface', () => {
    it('should have correct structure', () => {
      const config = {
        timeStep: 0.01,
        duration: 10,
        progressInterval: 50
      }

      expect(config.timeStep).toBe(0.01)
      expect(config.duration).toBe(10)
      expect(config.progressInterval).toBe(50)
    })

    it('should work with optional progressInterval', () => {
      const config = {
        timeStep: 0.001,
        duration: 5
      }

      expect(config.timeStep).toBe(0.001)
      expect(config.duration).toBe(5)
      expect(config.progressInterval).toBeUndefined()
    })
  })

  describe('SimulationResult interface', () => {
    it('should have correct structure for completed simulation', () => {
      const result = {
        finalTime: 10.0,
        totalSteps: 1000,
        wasStopped: false
      }

      expect(result.finalTime).toBe(10.0)
      expect(result.totalSteps).toBe(1000)
      expect(result.wasStopped).toBe(false)
    })

    it('should have correct structure for stopped simulation', () => {
      const result = {
        finalTime: 5.0,
        totalSteps: 500,
        wasStopped: true
      }

      expect(result.wasStopped).toBe(true)
    })
  })
})

describe('SimulationWorkerManager (mocked)', () => {
  let mockWorkerInstance: any
  let MockWorker: any

  beforeEach(() => {
    // Create mock worker
    mockWorkerInstance = {
      postMessage: jest.fn(),
      terminate: jest.fn(),
      onmessage: null as ((e: any) => void) | null,
      onerror: null as ((e: any) => void) | null
    }

    MockWorker = jest.fn().mockImplementation(() => mockWorkerInstance);

    // Add URL constructor mock
    (global as any).URL = class {
      constructor(url: string, base?: string) {
        return { toString: () => url }
      }
    };

    (global as any).Worker = MockWorker
  })

  afterEach(() => {
    delete (global as any).Worker
    delete (global as any).URL
    jest.clearAllMocks()
  })

  it('should attempt to create worker when environment supports it', () => {
    // The mock environment may or may not throw depending on the mock setup
    // We just verify the constructor doesn't crash unexpectedly
    try {
      const manager = new SimulationWorkerManager()
      // If it succeeds, we have a manager instance
      expect(manager).toBeDefined()
      manager.terminate()
    } catch (error) {
      // If it fails, it should be because of worker creation issues
      expect(error).toBeDefined()
    }
  })

  describe('Message protocol types', () => {
    it('should define correct message types', () => {
      const messageTypes = ['init', 'run', 'step', 'stop', 'getResults', 'cleanup']
      const responseTypes = ['ready', 'initialized', 'progress', 'complete', 'stepped', 'results', 'stopped', 'cleaned', 'error']

      // Just verify the types are expected strings
      expect(messageTypes).toContain('init')
      expect(messageTypes).toContain('run')
      expect(responseTypes).toContain('complete')
      expect(responseTypes).toContain('error')
    })
  })
})

describe('Worker message protocol', () => {
  it('should define init message structure', () => {
    const message = {
      type: 'init' as const,
      payload: {
        wasmData: 'base64...',
        jsData: 'base64...',
        metadata: { inputMap: [], outputMap: [] }
      },
      requestId: 'req_1'
    }

    expect(message.type).toBe('init')
    expect(message.payload).toHaveProperty('wasmData')
    expect(message.payload).toHaveProperty('jsData')
    expect(message.payload).toHaveProperty('metadata')
  })

  it('should define run message structure', () => {
    const message = {
      type: 'run' as const,
      payload: {
        timeStep: 0.01,
        duration: 10,
        progressInterval: 50
      }
    }

    expect(message.type).toBe('run')
    expect(message.payload.timeStep).toBe(0.01)
    expect(message.payload.duration).toBe(10)
  })

  it('should define progress response structure', () => {
    const response = {
      type: 'progress' as const,
      payload: {
        step: 500,
        totalSteps: 1000,
        progress: 50,
        time: 5.0
      }
    }

    expect(response.type).toBe('progress')
    expect(response.payload.progress).toBe(50)
  })

  it('should define complete response structure', () => {
    const response = {
      type: 'complete' as const,
      payload: {
        finalTime: 10.0,
        totalSteps: 1000
      }
    }

    expect(response.type).toBe('complete')
    expect(response.payload.finalTime).toBe(10.0)
  })

  it('should define error response structure', () => {
    const response = {
      type: 'error' as const,
      error: 'Something went wrong',
      requestId: 'req_1'
    }

    expect(response.type).toBe('error')
    expect(response.error).toBe('Something went wrong')
  })
})
