// lib/simulationTypes.ts
// Shared type definitions for simulation, code generation, and model storage.
// These types are used throughout the codebase and have been extracted from
// simulationEngine.ts to enable removal of the JS-based simulation engine
// while preserving the type system.

import { BlockData } from '@/components/BlockNode'
import { WireData } from '@/components/Wire'
import { ParsedType } from '@/lib/typeValidator'
import { SignalValue } from '@/lib/modelSchema'

/**
 * Represents a sheet (canvas/page) in a model.
 * A model can contain multiple sheets for organizing block diagrams.
 */
export interface Sheet {
  id: string
  name: string
  blocks: BlockData[]
  connections: WireData[]
  extents: {
    width: number
    height: number
  }
}

/**
 * Configuration for simulation execution.
 */
export interface SimulationConfig {
  timeStep: number
  duration: number
  integrationMethod?: 'euler' | 'rk4'
}

/**
 * Complete state of a running simulation.
 * Used by the JS-based simulation engine; also referenced by block modules.
 */
export interface SimulationState {
  time: number
  timeStep: number
  duration: number
  blockStates: Map<string, BlockState>
  signalValues: Map<string, SignalValue>
  sheetLabelValues: Map<string, SignalValue>
  isRunning: boolean
  subsystemEnableStates: Map<string, boolean> // subsystemId -> enabled state
  subsystemEnableSignals: Map<string, boolean> // subsystemId -> enable signal value
  parentSubsystemMap: Map<string, string | null> // blockId -> parent subsystem ID (null for root)
  parameters: Map<string, any> // parameter name -> value
}

/**
 * State of an individual block during simulation.
 * Stores outputs, internal state, and type information.
 */
export interface BlockState {
  blockId: string
  blockType: string
  outputs: (SignalValue)[]
  internalState?: any
  outputTypes?: ParsedType[]
  frozenOutputs?: (SignalValue)[]
  lastEnabledTime?: number
  blockData?: BlockData
}

/**
 * Results from a completed simulation run.
 * Contains time series data for signal displays and loggers.
 */
export interface SimulationResults {
  timePoints: number[]
  signalData: Map<string, (number | number[] | boolean | boolean[] | number[][])[]>
  finalTime: number
}
