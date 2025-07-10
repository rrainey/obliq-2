// lib/blocks/BlockModule.ts

import { BlockData } from '@/components/BlockNode'
import { BlockState, SimulationState } from '@/lib/simulationEngine'
import { parseType, normalizeType, isValidType } from '@/lib/typeValidator'

/**
 * Interface for block-specific code generation and simulation modules.
 * Each block type implements this interface to provide its specific
 * behavior for code generation, simulation execution, and port management.
 */
export interface IBlockModule {
  /**
   * Generate the C code computation for this block.
   * @param block - The block data containing parameters and configuration
   * @param inputs - Array of C expressions for input values (e.g., "model->signals.Input1")
   * @param inputTypes - Optional array of C type strings for inputs (e.g., "double", "double[3]")
   * @returns C code that computes the block's output(s)
   */
  generateComputation(block: BlockData, inputs: string[], inputTypes?: string[]): string

  /**
   * Determine the output type(s) of this block based on input types.
   * @param block - The block data containing parameters
   * @param inputTypes - Array of C type strings for inputs (e.g., "double", "double[3]", "double[2][3]")
   * @returns C type string for the output (e.g., "double", "double[3]", "bool")
   */
  getOutputType(block: BlockData, inputTypes: string[]): string

  /**
   * Generate C struct member declaration for this block's output signal.
   * @param block - The block data
   * @param outputType - The C type string for the output
   * @returns C struct member declaration or null if no signal storage needed
   */
  generateStructMember(block: BlockData, outputType: string): string | null

  /**
   * Check if this block requires state variables (e.g., for integration).
   * @param block - The block data
   * @returns true if the block needs state variables
   */
  requiresState(block: BlockData): boolean

  /**
   * Generate C struct member declarations for state variables.
   * @param block - The block data
   * @param outputType - The output type (may affect state dimensions for vectors/matrices)
   * @returns Array of C struct member declarations for states
   */
  generateStateStructMembers(block: BlockData, outputType: string): string[]

  /**
   * Generate initialization code for this block (optional).
   * @param block - The block data
   * @returns C code for initialization or undefined if not needed
   */
  generateInitialization?(block: BlockData): string

  /**
   * Execute the simulation logic for this block.
   * Updates the blockState outputs based on inputs and internal logic.
   * @param blockState - The current state of the block including outputs and internal state
   * @param inputs - Array of input values (numbers, arrays, or matrices)
   * @param simulationState - The global simulation state for accessing time, signals, etc.
   */
  executeSimulation(
    blockState: BlockState,
    inputs: (number | number[] | boolean | boolean[] | number[][])[],
    simulationState: SimulationState
  ): void

  /**
   * Get the number of input ports for this block.
   * @param block - The block data containing parameters
   * @returns Number of input ports (may be dynamic based on parameters)
   */
  getInputPortCount(block: BlockData): number

  /**
   * Get the number of output ports for this block.
   * @param block - The block data containing parameters
   * @returns Number of output ports
   */
  getOutputPortCount(block: BlockData): number

  /**
   * Get custom labels for input ports (optional).
   * @param block - The block data containing parameters
   * @returns Array of port labels or undefined to use default numbering
   */
  getInputPortLabels?(block: BlockData): string[] | undefined

/**
   * Get custom labels for output ports (optional).
   * @param block - The block data containing parameters
   * @returns Array of port labels or undefined to use default numbering
   */
  getOutputPortLabels?(block: BlockData): string[] | undefined

/**
   * Is this a direct feedthrough block? (optional; assumed to be 'true' if the 
   * function is undefined for a given Block).
   * This indicates that the block's output can be computed directly from its inputs
   * without needing to store state or perform integration.
   * This can be called during block execution order analysis to help identify algebraic
   * loops in a model.
   * @param block - The block data containing parameters
   * @returns Array of port labels or undefined to use default numbering
   */
  isDirectFeedthrough?(block: BlockData): boolean | undefined
}

/**
 * Common utility functions for block code generators and simulations
 */
export class BlockModuleUtils {
  /**
   * Sanitize a name to be a valid C identifier
   */
  static sanitizeIdentifier(name: string): string {
    // Replace non-alphanumeric characters with underscores
    let safe = name.replace(/[^a-zA-Z0-9_]/g, '_')
    
    // Ensure it doesn't start with a number
    if (/^\d/.test(safe)) {
      safe = '_' + safe
    }
    
    // Ensure it's not empty
    if (!safe) {
      safe = 'signal'
    }
    
    return safe
  }

  /**
   * Parse a C type string to extract base type and dimensions
   * Now uses the typeValidator for consistent parsing
   */
  static parseType(typeString: string): {
    baseType: string
    isArray: boolean
    arraySize?: number
    isMatrix: boolean
    rows?: number
    cols?: number
  } {
    try {
      const parsed = parseType(typeString)
      return {
        baseType: parsed.baseType,
        isArray: parsed.isArray,
        arraySize: parsed.arraySize,
        isMatrix: parsed.isMatrix || false,
        rows: parsed.rows,
        cols: parsed.cols
      }
    } catch (error) {
      console.warn(`Failed to parse type "${typeString}":`, error)
      // Return default scalar double type
      return {
        baseType: 'double',
        isArray: false,
        isMatrix: false
      }
    }
  }

  /**
   * Generate a C struct member declaration from type info
   */
  static generateStructMember(name: string, typeString: string): string {
    const safeName = this.sanitizeIdentifier(name)
    
    // Validate and normalize the type
    let normalizedType: string
    try {
      normalizedType = normalizeType(typeString)
    } catch {
      console.warn(`Invalid type for struct member ${name}: ${typeString}`)
      normalizedType = 'double'
    }
    
    const parsed = this.parseType(normalizedType)
    
    if (parsed.isMatrix && parsed.rows && parsed.cols) {
      return `    ${parsed.baseType} ${safeName}[${parsed.rows}][${parsed.cols}];`
    } else if (parsed.isArray && parsed.arraySize) {
      return `    ${parsed.baseType} ${safeName}[${parsed.arraySize}];`
    } else {
      return `    ${parsed.baseType} ${safeName};`
    }
  }

  /**
   * Generate element-wise operation code for scalars, vectors, or matrices
   */
  static generateElementWiseOperation(
    outputName: string,
    inputs: string[],
    operation: string,
    typeInfo: ReturnType<typeof BlockModuleUtils.parseType>
  ): string {
    let code = ''
    
    if (typeInfo.isMatrix && typeInfo.rows && typeInfo.cols) {
      // Matrix operation
      code += `    // Matrix element-wise ${operation}\n`
      code += `    for (int i = 0; i < ${typeInfo.rows}; i++) {\n`
      code += `        for (int j = 0; j < ${typeInfo.cols}; j++) {\n`
      code += `            ${outputName}[i][j] = `
      
      for (let k = 0; k < inputs.length; k++) {
        if (k > 0) code += ` ${operation} `
        code += `${inputs[k]}[i][j]`
      }
      
      code += `;\n        }\n    }\n`
    } else if (typeInfo.isArray && typeInfo.arraySize) {
      // Vector operation
      code += `    // Vector element-wise ${operation}\n`
      code += `    for (int i = 0; i < ${typeInfo.arraySize}; i++) {\n`
      code += `        ${outputName}[i] = `
      
      for (let i = 0; i < inputs.length; i++) {
        if (i > 0) code += ` ${operation} `
        code += `${inputs[i]}[i]`
      }
      
      code += `;\n    }\n`
    } else {
      // Scalar operation
      code += `    ${outputName} = `
      
      for (let i = 0; i < inputs.length; i++) {
        if (i > 0) code += ` ${operation} `
        code += inputs[i]
      }
      
      code += `;\n`
    }
    
    return code
  }
}