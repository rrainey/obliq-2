// lib/blocks/MatrixMultiplyBlockModule.ts

import { BlockData } from '@/components/BlockNode'
import { IBlockModule, BlockModuleUtils } from './BlockModule'

export class MatrixMultiplyBlockModule implements IBlockModule {
  generateComputation(block: BlockData, inputs: string[]): string {
    const outputName = `model->signals.${BlockModuleUtils.sanitizeIdentifier(block.name)}`
    
    let code = `    // Matrix multiply block: ${block.name}\n`
    
    if (inputs.length < 2) {
      code += `    ${outputName} = 0.0; // Insufficient inputs\n`
      return code
    }
    
    const input1Expr = inputs[0]
    const input2Expr = inputs[1]
    
    // Without type information passed in, we generate generic code
    // In the full implementation, we'd use inputTypes to determine dimensions
    code += `    // Matrix multiplication\n`
    code += `    // Note: Actual implementation depends on input types\n`
    code += `    ${outputName} = ${input1Expr} * ${input2Expr}; // Placeholder for type-specific multiplication\n`
    
    return code
  }
  
  generateComputationWithTypes(block: BlockData, inputs: string[], inputTypes: string[]): string {
    const outputName = `model->signals.${BlockModuleUtils.sanitizeIdentifier(block.name)}`
    
    let code = `    // Matrix multiply block: ${block.name}\n`
    
    if (inputs.length < 2 || inputTypes.length < 2) {
      code += `    ${outputName} = 0.0; // Insufficient inputs\n`
      return code
    }
    
    const input1Expr = inputs[0]
    const input2Expr = inputs[1]
    
    // Parse types to determine operation
    const type1 = BlockModuleUtils.parseType(inputTypes[0])
    const type2 = BlockModuleUtils.parseType(inputTypes[1])
    
    // Determine multiplication type
    const isScalar1 = !type1.isArray && !type1.isMatrix
    const isScalar2 = !type2.isArray && !type2.isMatrix
    const isVector1 = type1.isArray && !type1.isMatrix
    const isVector2 = type2.isArray && !type2.isMatrix
    const isMatrix1 = type1.isMatrix
    const isMatrix2 = type2.isMatrix
    
    if (isScalar1 && isScalar2) {
      // Scalar × Scalar
      code += `    ${outputName} = ${input1Expr} * ${input2Expr};\n`
    } else if (isScalar1 && isVector2 && type2.arraySize) {
      // Scalar × Vector
      code += `    for (int i = 0; i < ${type2.arraySize}; i++) {\n`
      code += `        ${outputName}[i] = ${input1Expr} * ${input2Expr}[i];\n`
      code += `    }\n`
    } else if (isVector1 && isScalar2 && type1.arraySize) {
      // Vector × Scalar
      code += `    for (int i = 0; i < ${type1.arraySize}; i++) {\n`
      code += `        ${outputName}[i] = ${input1Expr}[i] * ${input2Expr};\n`
      code += `    }\n`
    } else if (isScalar1 && isMatrix2 && type2.rows && type2.cols) {
      // Scalar × Matrix
      code += `    for (int i = 0; i < ${type2.rows}; i++) {\n`
      code += `        for (int j = 0; j < ${type2.cols}; j++) {\n`
      code += `            ${outputName}[i][j] = ${input1Expr} * ${input2Expr}[i][j];\n`
      code += `        }\n`
      code += `    }\n`
    } else if (isMatrix1 && isScalar2 && type1.rows && type1.cols) {
      // Matrix × Scalar
      code += `    for (int i = 0; i < ${type1.rows}; i++) {\n`
      code += `        for (int j = 0; j < ${type1.cols}; j++) {\n`
      code += `            ${outputName}[i][j] = ${input1Expr}[i][j] * ${input2Expr};\n`
      code += `        }\n`
      code += `    }\n`
    } else if (isMatrix1 && isVector2 && type1.rows && type1.cols && type2.arraySize) {
      // Matrix × Vector (matrix-vector multiplication)
      code += `    // Matrix-vector multiplication\n`
      code += `    for (int i = 0; i < ${type1.rows}; i++) {\n`
      code += `        ${outputName}[i] = 0.0;\n`
      code += `        for (int j = 0; j < ${type1.cols}; j++) {\n`
      code += `            ${outputName}[i] += ${input1Expr}[i][j] * ${input2Expr}[j];\n`
      code += `        }\n`
      code += `    }\n`
    } else if (isVector1 && isMatrix2 && type1.arraySize && type2.rows && type2.cols) {
      // Vector × Matrix (row vector × matrix)
      code += `    // Vector-matrix multiplication\n`
      code += `    for (int j = 0; j < ${type2.cols}; j++) {\n`
      code += `        ${outputName}[j] = 0.0;\n`
      code += `        for (int i = 0; i < ${type1.arraySize}; i++) {\n`
      code += `            ${outputName}[j] += ${input1Expr}[i] * ${input2Expr}[i][j];\n`
      code += `        }\n`
      code += `    }\n`
    } else if (isMatrix1 && isMatrix2 && type1.rows && type1.cols && type2.rows && type2.cols) {
      // Matrix × Matrix
      code += `    // Matrix-matrix multiplication\n`
      code += `    for (int i = 0; i < ${type1.rows}; i++) {\n`
      code += `        for (int j = 0; j < ${type2.cols}; j++) {\n`
      code += `            ${outputName}[i][j] = 0.0;\n`
      code += `            for (int k = 0; k < ${type1.cols}; k++) {\n`
      code += `                ${outputName}[i][j] += ${input1Expr}[i][k] * ${input2Expr}[k][j];\n`
      code += `            }\n`
      code += `        }\n`
      code += `    }\n`
    } else if (isVector1 && isVector2 && type1.arraySize && type2.arraySize) {
      // Vector × Vector (element-wise)
      code += `    // Vector element-wise multiplication\n`
      code += `    for (int i = 0; i < ${type1.arraySize}; i++) {\n`
      code += `        ${outputName}[i] = ${input1Expr}[i] * ${input2Expr}[i];\n`
      code += `    }\n`
    } else {
      // Unsupported combination
      code += `    // Unsupported matrix multiply combination\n`
      code += `    ${outputName} = 0.0;\n`
    }
    
    return code
  }

  getOutputType(block: BlockData, inputTypes: string[]): string {
    if (inputTypes.length < 2) {
      return 'double' // Default
    }
    
    const type1 = BlockModuleUtils.parseType(inputTypes[0])
    const type2 = BlockModuleUtils.parseType(inputTypes[1])
    
    // Determine output dimensions based on multiplication rules
    const isScalar1 = !type1.isArray && !type1.isMatrix
    const isScalar2 = !type2.isArray && !type2.isMatrix
    const isVector1 = type1.isArray && !type1.isMatrix
    const isVector2 = type2.isArray && !type2.isMatrix
    const isMatrix1 = type1.isMatrix
    const isMatrix2 = type2.isMatrix
    
    if (isScalar1 && isScalar2) {
      return 'double'
    } else if (isScalar1 && isVector2) {
      return inputTypes[1] // Vector output
    } else if (isVector1 && isScalar2) {
      return inputTypes[0] // Vector output
    } else if (isScalar1 && isMatrix2) {
      return inputTypes[1] // Matrix output
    } else if (isMatrix1 && isScalar2) {
      return inputTypes[0] // Matrix output
    } else if (isMatrix1 && isVector2 && type1.cols === type2.arraySize) {
      // Matrix × Vector = Vector
      return `double[${type1.rows}]`
    } else if (isVector1 && isMatrix2 && type1.arraySize === type2.rows) {
      // Vector × Matrix = Vector
      return `double[${type2.cols}]`
    } else if (isMatrix1 && isMatrix2 && type1.cols === type2.rows) {
      // Matrix × Matrix = Matrix
      return `double[${type1.rows}][${type2.cols}]`
    } else if (isVector1 && isVector2 && type1.arraySize === type2.arraySize) {
      // Element-wise vector multiplication
      return inputTypes[0]
    }
    
    return 'double' // Fallback for incompatible types
  }

  generateStructMember(block: BlockData, outputType: string): string | null {
    // Matrix multiply blocks always need signal storage
    return BlockModuleUtils.generateStructMember(block.name, outputType)
  }

  requiresState(block: BlockData): boolean {
    // Matrix multiply blocks don't need state
    return false
  }

  generateStateStructMembers(block: BlockData, outputType: string): string[] {
    // No state needed
    return []
  }

  // No initialization needed
}