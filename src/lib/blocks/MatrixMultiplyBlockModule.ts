// lib/blocks/MatrixMultiplyBlockModule.ts
//
// Matrix multiplication with vector/column-matrix equivalence:
// - Column matrix [N][1] is treated as vector [N]
// - Output is normalized: [N][1] becomes [N]

import { BlockData } from '@/components/BlockNode'
import { IBlockModule, BlockModuleUtils } from './BlockModule'

// Extended type info that tracks if original was column matrix
interface ExtendedTypeInfo {
  baseType: string
  isScalar: boolean
  isVector: boolean      // true for [N] or [N][1]
  isRowMatrix: boolean   // true for [1][N]
  isMatrix: boolean      // true for [M][N] where M>1 and N>1
  size?: number          // for vectors
  rows?: number          // for matrices
  cols?: number          // for matrices
  isColumnMatrix: boolean // original was [N][1]
  accessPattern: string  // '[i]' or '[i][0]' or '[i][j]' etc.
}

export class MatrixMultiplyBlockModule implements IBlockModule {
  /**
   * Parse type and normalize column matrices to vectors
   */
  private parseExtendedType(typeString: string): ExtendedTypeInfo {
    const parsed = BlockModuleUtils.parseType(typeString)

    // Column matrix [N][1] -> treat as vector
    if (parsed.isMatrix && parsed.cols === 1 && parsed.rows) {
      return {
        baseType: parsed.baseType,
        isScalar: false,
        isVector: true,
        isRowMatrix: false,
        isMatrix: false,
        size: parsed.rows,
        isColumnMatrix: true,
        accessPattern: '[i][0]'
      }
    }

    // Row matrix [1][N]
    if (parsed.isMatrix && parsed.rows === 1 && parsed.cols) {
      return {
        baseType: parsed.baseType,
        isScalar: false,
        isVector: false,
        isRowMatrix: true,
        isMatrix: false,
        size: parsed.cols,
        rows: 1,
        cols: parsed.cols,
        isColumnMatrix: false,
        accessPattern: '[0][j]'
      }
    }

    // Regular matrix [M][N]
    if (parsed.isMatrix && parsed.rows && parsed.cols) {
      return {
        baseType: parsed.baseType,
        isScalar: false,
        isVector: false,
        isRowMatrix: false,
        isMatrix: true,
        rows: parsed.rows,
        cols: parsed.cols,
        isColumnMatrix: false,
        accessPattern: '[i][j]'
      }
    }

    // Vector [N]
    if (parsed.isArray && parsed.arraySize) {
      return {
        baseType: parsed.baseType,
        isScalar: false,
        isVector: true,
        isRowMatrix: false,
        isMatrix: false,
        size: parsed.arraySize,
        isColumnMatrix: false,
        accessPattern: '[i]'
      }
    }

    // Scalar
    return {
      baseType: parsed.baseType,
      isScalar: true,
      isVector: false,
      isRowMatrix: false,
      isMatrix: false,
      isColumnMatrix: false,
      accessPattern: ''
    }
  }

  generateComputation(block: BlockData, inputs: string[], inputTypes?: string[]): string {
    const outputName = `model->signals.${BlockModuleUtils.sanitizeIdentifier(block.name)}`

    if (inputs.length < 2) {
      return `    ${outputName} = 0.0; // Insufficient inputs\n`
    }

    const input1 = inputs[0]
    const input2 = inputs[1]

    // Get extended type information (normalizes column matrices to vectors)
    const type1 = this.parseExtendedType(inputTypes?.[0] || 'double')
    const type2 = this.parseExtendedType(inputTypes?.[1] || 'double')

    let code = `    // Matrix multiply block: ${block.name}\n`

    // Helper to generate element access
    const access1 = (idx: string) => type1.isColumnMatrix ? `${input1}[${idx}][0]` : `${input1}[${idx}]`
    const access2 = (idx: string) => type2.isColumnMatrix ? `${input2}[${idx}][0]` : `${input2}[${idx}]`

    // Case 1: Scalar × Scalar
    if (type1.isScalar && type2.isScalar) {
      code += `    ${outputName} = ${input1} * ${input2};\n`
      return code
    }

    // Case 2: Scalar × Vector (including column matrix)
    if (type1.isScalar && type2.isVector) {
      const size = type2.size!
      code += `    // Scalar × vector\n`
      code += `    for (int i = 0; i < ${size}; i++) {\n`
      code += `        ${outputName}[i] = ${input1} * ${access2('i')};\n`
      code += `    }\n`
      return code
    }

    // Case 3: Vector × Scalar
    if (type1.isVector && type2.isScalar) {
      const size = type1.size!
      code += `    // Vector × scalar\n`
      code += `    for (int i = 0; i < ${size}; i++) {\n`
      code += `        ${outputName}[i] = ${access1('i')} * ${input2};\n`
      code += `    }\n`
      return code
    }

    // Case 4: Scalar × Row Matrix
    if (type1.isScalar && type2.isRowMatrix) {
      const cols = type2.cols!
      code += `    // Scalar × row matrix -> row matrix\n`
      code += `    for (int j = 0; j < ${cols}; j++) {\n`
      code += `        ${outputName}[0][j] = ${input1} * ${input2}[0][j];\n`
      code += `    }\n`
      return code
    }

    // Case 5: Row Matrix × Scalar
    if (type1.isRowMatrix && type2.isScalar) {
      const cols = type1.cols!
      code += `    // Row matrix × scalar -> row matrix\n`
      code += `    for (int j = 0; j < ${cols}; j++) {\n`
      code += `        ${outputName}[0][j] = ${input1}[0][j] * ${input2};\n`
      code += `    }\n`
      return code
    }

    // Case 6: Scalar × Matrix
    if (type1.isScalar && type2.isMatrix) {
      const rows = type2.rows!
      const cols = type2.cols!
      code += `    // Scalar × matrix\n`
      code += `    for (int i = 0; i < ${rows}; i++) {\n`
      code += `        for (int j = 0; j < ${cols}; j++) {\n`
      code += `            ${outputName}[i][j] = ${input1} * ${input2}[i][j];\n`
      code += `        }\n`
      code += `    }\n`
      return code
    }

    // Case 7: Matrix × Scalar
    if (type1.isMatrix && type2.isScalar) {
      const rows = type1.rows!
      const cols = type1.cols!
      code += `    // Matrix × scalar\n`
      code += `    for (int i = 0; i < ${rows}; i++) {\n`
      code += `        for (int j = 0; j < ${cols}; j++) {\n`
      code += `            ${outputName}[i][j] = ${input1}[i][j] * ${input2};\n`
      code += `        }\n`
      code += `    }\n`
      return code
    }

    // Case 8: Vector × Vector (element-wise)
    if (type1.isVector && type2.isVector) {
      if (type1.size === type2.size) {
        const size = type1.size!
        code += `    // Element-wise vector multiplication\n`
        code += `    for (int i = 0; i < ${size}; i++) {\n`
        code += `        ${outputName}[i] = ${access1('i')} * ${access2('i')};\n`
        code += `    }\n`
      } else {
        code += `    // ERROR: Vector dimensions incompatible (${type1.size} vs ${type2.size})\n`
        code += `    ${outputName} = 0.0;\n`
      }
      return code
    }

    // Case 9: Vector × Row Matrix (outer product)
    if (type1.isVector && type2.isRowMatrix) {
      const vecSize = type1.size!
      const cols = type2.cols!
      code += `    // Outer product: [${vecSize}] × [1][${cols}] = [${vecSize}][${cols}]\n`
      code += `    for (int i = 0; i < ${vecSize}; i++) {\n`
      code += `        for (int j = 0; j < ${cols}; j++) {\n`
      code += `            ${outputName}[i][j] = ${access1('i')} * ${input2}[0][j];\n`
      code += `        }\n`
      code += `    }\n`
      return code
    }

    // Case 10: Row Matrix × Vector (dot product -> scalar)
    if (type1.isRowMatrix && type2.isVector) {
      const cols = type1.cols!
      if (cols === type2.size) {
        code += `    // Row × column (dot product): [1][${cols}] × [${cols}] = scalar\n`
        code += `    ${outputName} = 0.0;\n`
        code += `    for (int i = 0; i < ${cols}; i++) {\n`
        code += `        ${outputName} += ${input1}[0][i] * ${access2('i')};\n`
        code += `    }\n`
      } else {
        code += `    // ERROR: Dimensions incompatible for dot product\n`
        code += `    ${outputName} = 0.0;\n`
      }
      return code
    }

    // Case 11: Matrix × Vector
    if (type1.isMatrix && type2.isVector) {
      const rows = type1.rows!
      const cols = type1.cols!
      if (cols === type2.size) {
        code += `    // Matrix-vector multiplication: [${rows}x${cols}] × [${cols}] = [${rows}]\n`
        code += `    for (int i = 0; i < ${rows}; i++) {\n`
        code += `        ${outputName}[i] = 0.0;\n`
        code += `        for (int k = 0; k < ${cols}; k++) {\n`
        code += `            ${outputName}[i] += ${input1}[i][k] * ${access2('k')};\n`
        code += `        }\n`
        code += `    }\n`
      } else {
        code += `    // ERROR: Matrix columns (${cols}) must equal vector size (${type2.size})\n`
        code += `    for (int i = 0; i < ${rows}; i++) { ${outputName}[i] = 0.0; }\n`
      }
      return code
    }

    // Case 12: Matrix × Row Matrix
    if (type1.isMatrix && type2.isRowMatrix) {
      const rows1 = type1.rows!
      const cols1 = type1.cols!
      const cols2 = type2.cols!
      if (cols1 === 1) {
        code += `    // Matrix × row: [${rows1}x1] × [1x${cols2}] = [${rows1}x${cols2}]\n`
        code += `    for (int i = 0; i < ${rows1}; i++) {\n`
        code += `        for (int j = 0; j < ${cols2}; j++) {\n`
        code += `            ${outputName}[i][j] = ${input1}[i][0] * ${input2}[0][j];\n`
        code += `        }\n`
        code += `    }\n`
      } else {
        code += `    // ERROR: Matrix columns (${cols1}) must equal 1 for row matrix multiply\n`
        code += `    for (int i = 0; i < ${rows1}; i++) {\n`
        code += `        for (int j = 0; j < ${cols2}; j++) { ${outputName}[i][j] = 0.0; }\n`
        code += `    }\n`
      }
      return code
    }

    // Case 13: Row Matrix × Matrix
    if (type1.isRowMatrix && type2.isMatrix) {
      const cols1 = type1.cols!
      const rows2 = type2.rows!
      const cols2 = type2.cols!
      if (cols1 === rows2) {
        code += `    // Row-matrix multiplication: [1x${cols1}] × [${rows2}x${cols2}] = [1x${cols2}]\n`
        code += `    for (int j = 0; j < ${cols2}; j++) {\n`
        code += `        ${outputName}[0][j] = 0.0;\n`
        code += `        for (int k = 0; k < ${cols1}; k++) {\n`
        code += `            ${outputName}[0][j] += ${input1}[0][k] * ${input2}[k][j];\n`
        code += `        }\n`
        code += `    }\n`
      } else {
        code += `    // ERROR: Row cols (${cols1}) must equal matrix rows (${rows2})\n`
        code += `    for (int j = 0; j < ${cols2}; j++) { ${outputName}[0][j] = 0.0; }\n`
      }
      return code
    }

    // Case 14: Matrix × Matrix
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

    const type1 = this.parseExtendedType(inputTypes[0])
    const type2 = this.parseExtendedType(inputTypes[1])

    // Helper to normalize output (column matrix -> vector)
    const normalizeOutput = (baseType: string, rows: number, cols: number): string => {
      if (cols === 1) {
        return `${baseType}[${rows}]` // Normalize [N][1] to [N]
      }
      return `${baseType}[${rows}][${cols}]`
    }

    // Scalar × Scalar = Scalar
    if (type1.isScalar && type2.isScalar) {
      return type1.baseType
    }

    // Scalar × Vector = Vector
    if (type1.isScalar && type2.isVector) {
      return `${type2.baseType}[${type2.size}]`
    }
    if (type1.isVector && type2.isScalar) {
      return `${type1.baseType}[${type1.size}]`
    }

    // Scalar × Row Matrix = Row Matrix
    if (type1.isScalar && type2.isRowMatrix) {
      return `${type2.baseType}[1][${type2.cols}]`
    }
    if (type1.isRowMatrix && type2.isScalar) {
      return `${type1.baseType}[1][${type1.cols}]`
    }

    // Scalar × Matrix = Matrix
    if (type1.isScalar && type2.isMatrix) {
      return `${type2.baseType}[${type2.rows}][${type2.cols}]`
    }
    if (type1.isMatrix && type2.isScalar) {
      return `${type1.baseType}[${type1.rows}][${type1.cols}]`
    }

    // Vector × Vector (element-wise) = Vector
    if (type1.isVector && type2.isVector) {
      if (type1.size === type2.size) {
        return `${type1.baseType}[${type1.size}]`
      }
      return 'double' // Incompatible
    }

    // Vector × Row Matrix (outer product) = Matrix
    if (type1.isVector && type2.isRowMatrix) {
      return `${type1.baseType}[${type1.size}][${type2.cols}]`
    }

    // Row Matrix × Vector (dot product) = Scalar
    if (type1.isRowMatrix && type2.isVector) {
      if (type1.cols === type2.size) {
        return type1.baseType
      }
      return 'double' // Incompatible
    }

    // Matrix × Vector = Vector (normalized from [N][1])
    if (type1.isMatrix && type2.isVector) {
      if (type1.cols === type2.size) {
        return `${type1.baseType}[${type1.rows}]`
      }
      return 'double' // Incompatible
    }

    // Matrix × Row Matrix
    if (type1.isMatrix && type2.isRowMatrix) {
      if (type1.cols === 1) {
        return `${type1.baseType}[${type1.rows}][${type2.cols}]`
      }
      return 'double' // Incompatible
    }

    // Row Matrix × Matrix = Row Matrix
    if (type1.isRowMatrix && type2.isMatrix) {
      if (type1.cols === type2.rows) {
        return `${type1.baseType}[1][${type2.cols}]`
      }
      return 'double' // Incompatible
    }

    // Matrix × Matrix
    if (type1.isMatrix && type2.isMatrix) {
      if (type1.cols === type2.rows) {
        return normalizeOutput(type1.baseType, type1.rows!, type2.cols!)
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