// lib/codegen/AlgebraicTypes.ts

/**
 * Type definitions for the algebraic evaluation layer of code generation.
 * These types define the interfaces between the algebraic computation layer
 * and the integration orchestration layer.
 */

import { FlattenedModel } from './ModelFlattener'

/**
 * Inputs to the algebraic evaluation function.
 * These are the values that can be read but not modified during evaluation.
 */
export interface AlgebraicInputs {
  /** Model input signals */
  inputs: string // e.g., "inputs" or "&model->inputs"
  
  /** Current state values */
  states: string // e.g., "states" or "&model->states"
  
  /** Enable states for subsystems (if applicable) */
  enableStates?: string // e.g., "enable_states" or "&model->enable_states"
  
  /** Current simulation time */
  time: string // e.g., "t" or "model->time"
}

/**
 * Outputs from the algebraic evaluation function.
 * These are the values that are computed and written during evaluation.
 */
export interface AlgebraicOutputs {
  /** Internal signal values */
  signals: string // e.g., "signals" or "&model->signals"
  
  /** Model output values */
  outputs: string // e.g., "outputs" or "&model->outputs"
}

/**
 * Configuration options for algebraic code generation
 */
export interface AlgebraicGeneratorOptions {
  /** Whether to include debug comments */
  includeComments?: boolean
  
  /** Whether to generate inline functions */
  generateInline?: boolean
  
  /** Whether to include timing instrumentation */
  includeTiming?: boolean
}

/**
 * Interface for the algebraic evaluator code generator
 */
export interface IAlgebraicEvaluator {
  /**
   * Generate the C code for algebraic evaluation
   * @returns Generated C code for the algebraic evaluation function
   */
  generate(): string
  
  /**
   * Get the function name for the algebraic evaluator
   * @returns Function name (e.g., "model_evaluate_algebraic")
   */
  getFunctionName(): string
  
  /**
   * Get the required includes for the algebraic evaluation
   * @returns Array of include statements
   */
  getRequiredIncludes(): string[]
}

/**
 * Result of algebraic code generation
 */
export interface AlgebraicGenerationResult {
  /** The generated C code */
  code: string
  
  /** Function name that was generated */
  functionName: string
  
  /** Any warnings generated during code generation */
  warnings: string[]
  
  /** Statistics about the generated code */
  stats: {
    blocksProcessed: number
    executionOrder: string[] // Block IDs in execution order
  }
}

/**
 * Type map entry for block output types during algebraic evaluation
 */
export interface AlgebraicTypeInfo {
  /** Block ID */
  blockId: string
  
  /** C type of the block output (e.g., "double", "double[3]", "bool") */
  outputType: string
  
  /** Whether this block's output depends on states */
  dependsOnStates: boolean
  
  /** Whether this block's output is purely algebraic */
  isPurelyAlgebraic: boolean
}