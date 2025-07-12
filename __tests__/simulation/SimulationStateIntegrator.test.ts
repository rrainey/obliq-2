// __tests__/simulation/SimulationStateIntegrator.test.ts

import { SimulationStateIntegrator, IntegrationMethod } from '@/lib/simulation/SimulationStateIntegrator'
import { BlockState, SimulationState, Sheet } from '@/lib/simulationEngine'
import { SignalValue } from '@/lib/modelSchema'

describe('SimulationStateIntegrator', () => {
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
  
  const mockBlockStates = new Map<string, BlockState>()
  
  test('can instantiate with default RK4 method', () => {
    const integrator = new SimulationStateIntegrator()
    expect(integrator).toBeDefined()
    expect(integrator.getMethod()).toBe('rk4')
  })
  
  test('can instantiate with Euler method', () => {
    const integrator = new SimulationStateIntegrator('euler')
    expect(integrator).toBeDefined()
    expect(integrator.getMethod()).toBe('euler')
  })
  
  test('integrate method can be called', () => {
    const integrator = new SimulationStateIntegrator()
    
    // Should not throw
    expect(() => {
      integrator.integrate({
        blockStates: mockBlockStates,
        simulationState: mockSimulationState,
        sheet: mockSheet,
        timeStep: 0.01
      })
    }).not.toThrow()
  })
  
  test('can change integration method', () => {
    const integrator = new SimulationStateIntegrator('euler')
    expect(integrator.getMethod()).toBe('euler')
    
    integrator.setMethod('rk4')
    expect(integrator.getMethod()).toBe('rk4')
  })
  
  test('integrates with Euler method when set', () => {
    const integrator = new SimulationStateIntegrator('euler')
    
    // Spy on private method (in real tests, would check actual integration results)
    const eulerSpy = jest.spyOn(integrator as any, 'integrateEuler')
    
    integrator.integrate({
      blockStates: mockBlockStates,
      simulationState: mockSimulationState,
      sheet: mockSheet,
      timeStep: 0.01
    })
    
    expect(eulerSpy).toHaveBeenCalled()
  })
  
  test('integrates with RK4 method when set', () => {
    const integrator = new SimulationStateIntegrator('rk4')
    
    // Spy on private method
    const rk4Spy = jest.spyOn(integrator as any, 'integrateRK4')
    
    integrator.integrate({
      blockStates: mockBlockStates,
      simulationState: mockSimulationState,
      sheet: mockSheet,
      timeStep: 0.01
    })
    
    expect(rk4Spy).toHaveBeenCalled()
  })
})
