// __tests__/simulation/SimulationAlgebraicEvaluator.test.ts

import { SimulationAlgebraicEvaluator } from '@lib/simulation/SimulationAlgebraicEvaluator'
import { BlockState, SimulationState, Sheet } from '@/lib/simulationEngine'
import { BlockData } from '@/components/BlockNode'
import { SignalValue } from '@/lib/modelSchema'

describe('SimulationAlgebraicEvaluator', () => {
  const mockSheet: Sheet = {
     id: 'sheet1',
    name: 'Main',
    blocks: [],
    connections: [],
     extents: {
      width: 0,
      height: 0
    }
  }
  
  const mockSimulationState: SimulationState = {
    time: 0,
    timeStep: 0.01,
    isRunning: false,
    blockStates: new Map<string, BlockState>(),
    signalValues: new Map<string, SignalValue>(),
    sheetLabelValues: new Map<string, SignalValue>(),
    duration: 10.0,
    subsystemEnableStates: new Map<string, boolean>(), // subsystemId -> enabled state
    subsystemEnableSignals: new Map<string, boolean>(), // subsystemId -> enable signal value
    parentSubsystemMap: new Map<string, string | null>() // blockId -> parent subsystem ID (null for root)
  }
  
  test('can instantiate class', () => {
    const evaluator = new SimulationAlgebraicEvaluator()
    expect(evaluator).toBeDefined()
  })
  
  test('evaluate method returns block outputs and execution order', () => {
    const evaluator = new SimulationAlgebraicEvaluator()
    const blockStates = new Map<string, BlockState>()
    
    const result = evaluator.evaluate({
      blockStates,
      simulationState: mockSimulationState,
      sheet: mockSheet
    })
    
    expect(result).toBeDefined()
    expect(result.blockOutputs).toBeDefined()
    expect(result.executionOrder).toBeDefined()
    expect(result.blockOutputs instanceof Map).toBe(true)
    expect(Array.isArray(result.executionOrder)).toBe(true)
  })
  
  test('calculates correct execution order for simple chain', () => {
    const block1: BlockData = {
      id: 'block1',
      type: 'source',
      name: 'Source1',
      position: { x: 0, y: 0 }
    }
    
    const block2: BlockData = {
      id: 'block2',
      type: 'sum',
      name: 'Sum1',
      position: { x: 100, y: 0 }
    }
    
    const sheet: Sheet = {
      id: 'sheet1',
      name: 'Main',
      blocks: [block1, block2],
      connections: [{
        id: 'wire1',
        sourceBlockId: 'block1',
        sourcePortIndex: 0,
        targetBlockId: 'block2',
        targetPortIndex: 0
      }]
    }
    
    const blockStates = new Map<string, BlockState>([
      ['block1', {
        blockId: 'block1',
        inputs: [],
        outputs: [5],
        internalState: {}
      }],
      ['block2', {
        blockId: 'block2',
        inputs: [],
        outputs: [0],
        internalState: {}
      }]
    ])
    
    const evaluator = new SimulationAlgebraicEvaluator()
    const result = evaluator.evaluate({
      blockStates,
      simulationState: mockSimulationState,
      sheet
    })
    
    // Source should come before sum in execution order
    expect(result.executionOrder).toEqual(['block1', 'block2'])
  })
  
  test('detects algebraic loops', () => {
    // Create a circular dependency
    const sheet: Sheet = {
      id: 'sheet1',
      name: 'Main',
      blocks: [
        { id: 'block1', type: 'sum', name: 'Sum1', position: { x: 0, y: 0 } },
        { id: 'block2', type: 'sum', name: 'Sum2', position: { x: 100, y: 0 } }
      ],
      connections: [
        {
          id: 'wire1',
          sourceBlockId: 'block1',
          sourcePortIndex: 0,
          targetBlockId: 'block2',
          targetPortIndex: 0
        },
        {
          id: 'wire2',
          sourceBlockId: 'block2',
          sourcePortIndex: 0,
          targetBlockId: 'block1',
          targetPortIndex: 0
        }
      ]
    }
    
    const blockStates = new Map<string, BlockState>()
    const evaluator = new SimulationAlgebraicEvaluator()
    
    // Should warn about algebraic loop but still return a result
    const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation()
    
    const result = evaluator.evaluate({
      blockStates,
      simulationState: mockSimulationState,
      sheet
    })
    
    expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('Algebraic loop detected'))
    expect(result.executionOrder).toBeDefined()
    
    consoleWarnSpy.mockRestore()
  })
  
  test('caches execution order for performance', () => {
    const evaluator = new SimulationAlgebraicEvaluator()
    const blockStates = new Map<string, BlockState>()
    
    // First evaluation
    const result1 = evaluator.evaluate({
      blockStates,
      simulationState: mockSimulationState,
      sheet: mockSheet
    })
    
    // Second evaluation with same sheet
    const result2 = evaluator.evaluate({
      blockStates,
      simulationState: mockSimulationState,
      sheet: mockSheet
    })
    
    // Should return same execution order array reference (cached)
    expect(result1.executionOrder).toBe(result2.executionOrder)
  })
  
  test('clearCache clears execution order cache', () => {
    const evaluator = new SimulationAlgebraicEvaluator()
    const blockStates = new Map<string, BlockState>()
    
    // First evaluation
    const result1 = evaluator.evaluate({
      blockStates,
      simulationState: mockSimulationState,
      sheet: mockSheet
    })
    
    // Clear cache
    evaluator.clearCache()
    
    // Second evaluation should recalculate
    const result2 = evaluator.evaluate({
      blockStates,
      simulationState: mockSimulationState,
      sheet: mockSheet
    })
    
    // Should be different array instances
    expect(result1.executionOrder).not.toBe(result2.executionOrder)
    expect(result1.executionOrder).toEqual(result2.executionOrder) // But same content
  })
})