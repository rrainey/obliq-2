// lib/blocks/BlockModule.ts

import { BlockData } from '@/components/BlockNode'

/**
 * Interface for block-specific code generation modules.
 * Each block type implements this interface to provide its specific
 * C code generation logic.
 */
export interface IBlockModule {
  /**
   * Generate the C code computation for this block.
   * @param block - The block data containing parameters and configuration
   * @param inputs - Array of C expressions for input values (e.g., "model->signals.Input1")
   * @returns C code that computes the block's output(s)
   */
  generateComputation(block: BlockData, inputs: string[]): string

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
}

/**
 * Common utility functions for block code generators
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
   */
  static parseType(typeString: string): {
    baseType: string
    isArray: boolean
    arraySize?: number
    isMatrix: boolean
    rows?: number
    cols?: number
  } {
    // Match matrix type: "type[rows][cols]"
    const matrixMatch = typeString.match(/^(\w+)\[(\d+)\]\[(\d+)\]$/)
    if (matrixMatch) {
      return {
        baseType: matrixMatch[1],
        isArray: false,
        isMatrix: true,
        rows: parseInt(matrixMatch[2]),
        cols: parseInt(matrixMatch[3])
      }
    }

    // Match array type: "type[size]"
    const arrayMatch = typeString.match(/^(\w+)\[(\d+)\]$/)
    if (arrayMatch) {
      return {
        baseType: arrayMatch[1],
        isArray: true,
        arraySize: parseInt(arrayMatch[2]),
        isMatrix: false
      }
    }

    // Scalar type
    return {
      baseType: typeString,
      isArray: false,
      isMatrix: false
    }
  }

  /**
   * Generate a C struct member declaration from type info
   */
  static generateStructMember(name: string, typeString: string): string {
    const safeName = this.sanitizeIdentifier(name)
    const parsed = this.parseType(typeString)
    
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