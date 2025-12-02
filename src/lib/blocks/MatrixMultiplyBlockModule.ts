// lib/blocks/MatrixMultiplyBlockModule.ts

import { BlockData } from '@/components/BlockNode'
import { BlockState, SimulationState } from '@/lib/simulationEngine'
import { IBlockModule, BlockModuleUtils } from './BlockModule'

export class MatrixMultiplyBlockModule implements IBlockModule {
  generateComputation(block: BlockData, inputs: string[], inputTypes?: string[]): string {
    const outputName = `model->signals.${BlockModuleUtils.sanitizeIdentifier(block.name)}`

    if (inputs.length < 2) {
      return `    ${outputName} = 0.0; // Insufficient inputs\n`
    }

    const input1 = inputs[0]
    const input2 = inputs[1]

    // Get type information for both inputs
    const type1 = inputTypes && inputTypes[0] ? BlockModuleUtils.parseType(inputTypes[0]) : { baseType: 'double', isArray: false, isMatrix: false }
    const type2 = inputTypes && inputTypes[1] ? BlockModuleUtils.parseType(inputTypes[1]) : { baseType: 'double', isArray: false, isMatrix: false }

    let code = `    // Matrix multiply block: ${block.name}\n`

    // Case 1: Scalar × Scalar
    if (!type1.isArray && !type1.isMatrix && !type2.isArray && !type2.isMatrix) {
      code += `    ${outputName} = ${input1} * ${input2};\n`
      return code
    }

    // Case 2: Scalar × Vector
    if (!type1.isArray && !type1.isMatrix && type2.isArray && !type2.isMatrix) {
      const size = type2.arraySize!
      code += `    for (int i = 0; i < ${size}; i++) {\n`
      code += `        ${outputName}[i] = ${input1} * ${input2}[i];\n`
      code += `    }\n`
      return code
    }

    // Case 3: Vector × Scalar
    if (type1.isArray && !type1.isMatrix && !type2.isArray && !type2.isMatrix) {
      const size = type1.arraySize!
      code += `    for (int i = 0; i < ${size}; i++) {\n`
      code += `        ${outputName}[i] = ${input1}[i] * ${input2};\n`
      code += `    }\n`
      return code
    }

    // Case 4: Scalar × Matrix
    if (!type1.isArray && !type1.isMatrix && type2.isMatrix) {
      const rows = type2.rows!
      const cols = type2.cols!
      code += `    for (int i = 0; i < ${rows}; i++) {\n`
      code += `        for (int j = 0; j < ${cols}; j++) {\n`
      code += `            ${outputName}[i][j] = ${input1} * ${input2}[i][j];\n`
      code += `        }\n`
      code += `    }\n`
      return code
    }

    // Case 5: Matrix × Scalar
    if (type1.isMatrix && !type2.isArray && !type2.isMatrix) {
      const rows = type1.rows!
      const cols = type1.cols!
      code += `    for (int i = 0; i < ${rows}; i++) {\n`
      code += `        for (int j = 0; j < ${cols}; j++) {\n`
      code += `            ${outputName}[i][j] = ${input1}[i][j] * ${input2};\n`
      code += `        }\n`
      code += `    }\n`
      return code
    }

    // Case 6: Vector × Vector (element-wise if same size)
    if (type1.isArray && !type1.isMatrix && type2.isArray && !type2.isMatrix) {
      if (type1.arraySize === type2.arraySize) {
        const size = type1.arraySize!
        code += `    // Element-wise vector multiplication\n`
        code += `    for (int i = 0; i < ${size}; i++) {\n`
        code += `        ${outputName}[i] = ${input1}[i] * ${input2}[i];\n`
        code += `    }\n`
      } else {
        code += `    // ERROR: Vector dimensions incompatible\n`
        code += `    ${outputName} = 0.0;\n`
      }
      return code
    }

    // Case 7: Matrix × Vector
    if (type1.isMatrix && type2.isArray && !type2.isMatrix) {
      const rows = type1.rows!
      const cols = type1.cols!
      if (cols === type2.arraySize) {
        code += `    // Matrix-vector multiplication: [${rows}x${cols}] × [${cols}] = [${rows}]\n`
        code += `    for (int i = 0; i < ${rows}; i++) {\n`
        code += `        ${outputName}[i] = 0.0;\n`
        code += `        for (int k = 0; k < ${cols}; k++) {\n`
        code += `            ${outputName}[i] += ${input1}[i][k] * ${input2}[k];\n`
        code += `        }\n`
        code += `    }\n`
      } else {
        code += `    // ERROR: Matrix columns (${cols}) must equal vector size (${type2.arraySize})\n`
        code += `    for (int i = 0; i < ${rows}; i++) { ${outputName}[i] = 0.0; }\n`
      }
      return code
    }

    // Case 8: Vector × Matrix
    if (type1.isArray && !type1.isMatrix && type2.isMatrix) {
      const vecSize = type1.arraySize!
      const rows = type2.rows!
      const cols = type2.cols!
      if (vecSize === rows) {
        code += `    // Vector-matrix multiplication: [${vecSize}] × [${rows}x${cols}] = [${cols}]\n`
        code += `    for (int j = 0; j < ${cols}; j++) {\n`
        code += `        ${outputName}[j] = 0.0;\n`
        code += `        for (int i = 0; i < ${vecSize}; i++) {\n`
        code += `            ${outputName}[j] += ${input1}[i] * ${input2}[i][j];\n`
        code += `        }\n`
        code += `    }\n`
      } else {
        code += `    // ERROR: Vector size (${vecSize}) must equal matrix rows (${rows})\n`
        code += `    for (int j = 0; j < ${cols}; j++) { ${outputName}[j] = 0.0; }\n`
      }
      return code
    }

    // Case 9: Matrix × Matrix
    if (type1.isMatrix && type2.isMatrix) {
      const rows1 = type1.rows!
      const cols1 = type1.cols!
      const rows2 = type2.rows!
      const cols2 = type2.cols!

      if (cols1 === rows2) {
        code += `    // Matrix multiplication: [${rows1}x${cols1}] × [${rows2}x${cols2}] = [${rows1}x${cols2}]\n`
        code += `    for (int i = 0; i < ${rows1}; i++) {\n`
        code += `        for (int j = 0; j < ${cols2}; j++) {\n`
        code += `            ${outputName}[i][j] = 0.0;\n`
        code += `            for (int k = 0; k < ${cols1}; k++) {\n`
        code += `                ${outputName}[i][j] += ${input1}[i][k] * ${input2}[k][j];\n`
        code += `            }\n`
        code += `        }\n`
        code += `    }\n`
      } else {
        code += `    // ERROR: Matrix dimensions incompatible: ${cols1} != ${rows2}\n`
        code += `    for (int i = 0; i < ${rows1}; i++) {\n`
        code += `        for (int j = 0; j < ${cols2}; j++) {\n`
        code += `            ${outputName}[i][j] = 0.0;\n`
        code += `        }\n`
        code += `    }\n`
      }
      return code
    }

    // Fallback: scalar multiplication
    code += `    ${outputName} = ${input1} * ${input2};\n`
    return code
  }

  getOutputType(block: BlockData, inputTypes: string[]): string {
    if (inputTypes.length < 2) {
      return 'double' // Default
    }
    
    const type1 = BlockModuleUtils.parseType(inputTypes[0])
    const type2 = BlockModuleUtils.parseType(inputTypes[1])
    
    // Scalar × Scalar = Scalar
    if (!type1.isArray && !type1.isMatrix && !type2.isArray && !type2.isMatrix) {
      return inputTypes[0]
    }
    
    // Scalar × Vector = Vector
    if (!type1.isArray && !type1.isMatrix && type2.isArray) {
      return inputTypes[1]
    }
    if (type1.isArray && !type2.isArray && !type2.isMatrix) {
      return inputTypes[0]
    }
    
    // Scalar × Matrix = Matrix
    if (!type1.isArray && !type1.isMatrix && type2.isMatrix) {
      return inputTypes[1]
    }
    if (type1.isMatrix && !type2.isArray && !type2.isMatrix) {
      return inputTypes[0]
    }
    
    // Vector × Vector - element-wise if same size
    if (type1.isArray && type2.isArray) {
      if (type1.arraySize === type2.arraySize) {
        return inputTypes[0]
      }
      return 'double' // Incompatible
    }
    
    // Matrix × Vector
    if (type1.isMatrix && type2.isArray) {
      // Result is a vector with rows from matrix
      if (type1.cols === type2.arraySize) {
        return `${type1.baseType}[${type1.rows}]`
      }
      return 'double' // Incompatible
    }
    
    // Vector × Matrix
    if (type1.isArray && type2.isMatrix) {
      // Result is a vector with cols from matrix
      if (type1.arraySize === type2.rows) {
        return `${type2.baseType}[${type2.cols}]`
      }
      return 'double' // Incompatible
    }
    
    // Matrix × Matrix
    if (type1.isMatrix && type2.isMatrix) {
      // Result has rows from first, cols from second
      if (type1.cols === type2.rows) {
        return `${type1.baseType}[${type1.rows}][${type2.cols}]`
      }
      return 'double' // Incompatible
    }
    
    return 'double' // Default
  }

  generateStructMember(block: BlockData, outputType: string): string | null {
    // Matrix multiply blocks always need signal storage
    return BlockModuleUtils.generateStructMember(block.name, outputType)
  }

  requiresState(block: BlockData): boolean {
    // Matrix multiply blocks don't need state variables
    return false
  }

  generateStateStructMembers(block: BlockData, outputType: string): string[] {
    // No state needed
    return []
  }

  generateInitialization(block: BlockData): string {
    // No initialization needed
    return ''
  }

  executeSimulation(
    blockState: BlockState,
    inputs: (number | number[] | boolean | boolean[] | number[][])[],
    simulationState: SimulationState
  ): void {
    const input1 = inputs[0]
    const input2 = inputs[1]
    
    // Handle missing inputs
    if (input1 === undefined || input2 === undefined) {
      blockState.outputs[0] = 0
      return
    }
    
    // Check if inputs are boolean arrays (not supported)
    if ((Array.isArray(input1) && typeof input1[0] === 'boolean') ||
        (Array.isArray(input2) && typeof input2[0] === 'boolean')) {
      console.error(`Matrix multiply block ${blockState.blockId} does not support boolean inputs`)
      blockState.outputs[0] = 0
      return
    }
    
    // Determine the type of multiplication based on inputs
    const isInput1Scalar = typeof input1 === 'number'
    const isInput2Scalar = typeof input2 === 'number'
    const isInput1Vector = Array.isArray(input1) && !Array.isArray(input1[0])
    const isInput2Vector = Array.isArray(input2) && !Array.isArray(input2[0])
    const isInput1Matrix = Array.isArray(input1) && Array.isArray(input1[0])
    const isInput2Matrix = Array.isArray(input2) && Array.isArray(input2[0])
    
    // Case 1: Scalar × Scalar
    if (isInput1Scalar && isInput2Scalar) {
      blockState.outputs[0] = input1 * input2
      return
    }
    
    // Case 2: Scalar × Vector
    if (isInput1Scalar && isInput2Vector) {
      blockState.outputs[0] = (input2 as number[]).map(val => input1 * val)
      return
    }
    
    // Case 3: Vector × Scalar
    if (isInput1Vector && isInput2Scalar) {
      blockState.outputs[0] = (input1 as number[]).map(val => val * input2)
      return
    }
    
    // Case 4: Scalar × Matrix
    if (isInput1Scalar && isInput2Matrix) {
      const matrix = input2 as unknown as number[][]
      blockState.outputs[0] = matrix.map(row => 
        row.map(val => input1 * val)
      )
      return
    }
    
    // Case 5: Matrix × Scalar
    if (isInput1Matrix && isInput2Scalar) {
      const matrix = input1 as unknown as number[][]
      blockState.outputs[0] = matrix.map(row => 
        row.map(val => val * input2)
      )
      return
    }
    
    // Case 6: Vector × Vector (dot product if same length, outer product otherwise)
    if (isInput1Vector && isInput2Vector) {
      const vec1 = input1 as number[]
      const vec2 = input2 as number[]
      
      // For now, treat as element-wise multiplication if same length
      if (vec1.length === vec2.length) {
        // Element-wise multiplication
        blockState.outputs[0] = vec1.map((val, i) => val * vec2[i])
      } else {
        console.error(`Matrix multiply block ${blockState.blockId}: Vector dimensions incompatible for multiplication`)
        blockState.outputs[0] = 0
      }
      return
    }
    
    // Case 7: Matrix × Vector
    if (isInput1Matrix && isInput2Vector) {
      const matrix = input1 as unknown as number[][]
      const vector = input2 as number[]
      
      // Check dimension compatibility: matrix columns must equal vector length
      if (matrix[0].length !== vector.length) {
        console.error(`Matrix multiply block ${blockState.blockId}: Dimension mismatch - matrix has ${matrix[0].length} columns but vector has ${vector.length} elements`)
        blockState.outputs[0] = 0
        return
      }
      
      // Perform matrix-vector multiplication
      const result = matrix.map(row => 
        row.reduce((sum, val, i) => sum + val * vector[i], 0)
      )
      blockState.outputs[0] = result
      return
    }
    
    // Case 8: Vector × Matrix
    if (isInput1Vector && isInput2Matrix) {
      const vector = input1 as number[]
      const matrix = input2 as unknown as number[][]
      
      // Check dimension compatibility: vector length must equal matrix rows
      if (vector.length !== matrix.length) {
        console.error(`Matrix multiply block ${blockState.blockId}: Dimension mismatch - vector has ${vector.length} elements but matrix has ${matrix.length} rows`)
        blockState.outputs[0] = 0
        return
      }
      
      // Perform vector-matrix multiplication (row vector × matrix)
      const cols = matrix[0].length
      const result = new Array(cols).fill(0)
      
      for (let j = 0; j < cols; j++) {
        for (let i = 0; i < vector.length; i++) {
          result[j] += vector[i] * matrix[i][j]
        }
      }
      
      blockState.outputs[0] = result
      return
    }
    
    // Case 9: Matrix × Matrix
    if (isInput1Matrix && isInput2Matrix) {
      const mat1 = input1 as unknown as number[][]
      const mat2 = input2 as unknown as number[][]
      
      // Validate dimensions
      const rows1 = mat1.length
      const cols1 = mat1[0]?.length || 0
      const rows2 = mat2.length
      const cols2 = mat2[0]?.length || 0
      
      // Check dimension compatibility
      if (cols1 !== rows2) {
        console.error(`Matrix multiply block ${blockState.blockId}: Dimension mismatch - first matrix has ${cols1} columns but second matrix has ${rows2} rows`)
        blockState.outputs[0] = 0
        return
      }
      
      // Perform matrix multiplication
      const result: number[][] = []
      
      for (let i = 0; i < rows1; i++) {
        result[i] = []
        for (let j = 0; j < cols2; j++) {
          let sum = 0
          for (let k = 0; k < cols1; k++) {
            sum += mat1[i][k] * mat2[k][j]
          }
          result[i][j] = sum
        }
      }
      
      blockState.outputs[0] = result
      return
    }
    
    // Fallback for unexpected input types
    console.error(`Matrix multiply block ${blockState.blockId}: Unsupported input types`)
    blockState.outputs[0] = 0
  }

  getInputPortCount(block: BlockData): number {
    // Matrix multiply blocks have exactly 2 inputs
    return 2
  }

  getOutputPortCount(block: BlockData): number {
    // Matrix multiply blocks have exactly 1 output
    return 1
  }

  // No custom port labels needed
 
}