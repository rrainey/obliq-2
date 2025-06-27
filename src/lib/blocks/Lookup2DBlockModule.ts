// lib/blocks/Lookup2DBlockModule.ts

import { BlockData } from '@/components/BlockNode'
import { BlockState, SimulationState } from '@/lib/simulationEngine'
import { IBlockModule, BlockModuleUtils } from './BlockModule'

export class Lookup2DBlockModule implements IBlockModule {
  generateComputation(block: BlockData, inputs: string[]): string {
    const outputName = `model->signals.${BlockModuleUtils.sanitizeIdentifier(block.name)}`
    const blockName = BlockModuleUtils.sanitizeIdentifier(block.name)
    
    if (inputs.length < 2) {
      return `    ${outputName} = 0.0; // Insufficient inputs\n`
    }
    
    const input1Expr = inputs[0]
    const input2Expr = inputs[1]
    const input1Values = block.parameters?.input1Values || [0, 1]
    const input2Values = block.parameters?.input2Values || [0, 1]
    const outputTable = block.parameters?.outputTable || [[0, 0], [0, 1]]
    const extrapolation = block.parameters?.extrapolation || 'clamp'
    
    const rows = input1Values.length
    const cols = input2Values.length
    
    let code = `    // 2D Lookup block: ${block.name}\n`
    code += `    {\n`
    code += `        double input1 = ${input1Expr};\n`
    code += `        double input2 = ${input2Expr};\n`
    code += `        double output = 0.0;\n`
    code += `        \n`
    
    // Generate lookup table data
    code += `        // Lookup table dimensions\n`
    code += `        const int ${blockName}_rows = ${rows};\n`
    code += `        const int ${blockName}_cols = ${cols};\n`
    code += `        \n`
    code += `        // Input breakpoints\n`
    code += `        const double ${blockName}_input1[${rows}] = {`
    code += input1Values.join(', ')
    code += `};\n`
    code += `        const double ${blockName}_input2[${cols}] = {`
    code += input2Values.join(', ')
    code += `};\n`
    code += `        \n`
    code += `        // Output table\n`
    code += `        const double ${blockName}_table[${rows}][${cols}] = {\n`
    for (let i = 0; i < rows; i++) {
      code += `            {`
      const row = outputTable[i] || []
      const rowValues = []
      for (let j = 0; j < cols; j++) {
        rowValues.push(row[j] || 0)
      }
      code += rowValues.join(', ')
      code += `}`
      if (i < rows - 1) code += ','
      code += '\n'
    }
    code += `        };\n`
    code += `        \n`
    
    // Generate interpolation code
    code += `        // Find indices and interpolation factors\n`
    code += `        int i0 = 0, i1 = 0;\n`
    code += `        int j0 = 0, j1 = 0;\n`
    code += `        double t1 = 0.0, t2 = 0.0;\n`
    code += `        \n`
    
    // Find input1 indices
    code += `        // Find row indices for input1\n`
    code += `        if (input1 <= ${blockName}_input1[0]) {\n`
    code += `            i0 = i1 = 0;\n`
    code += `            t1 = 0.0;\n`
    if (extrapolation === 'extrapolate') {
      code += `            if (${rows} > 1 && ${blockName}_input1[1] != ${blockName}_input1[0]) {\n`
      code += `                t1 = (input1 - ${blockName}_input1[0]) / (${blockName}_input1[1] - ${blockName}_input1[0]);\n`
      code += `                i1 = 1;\n`
      code += `            }\n`
    }
    code += `        } else if (input1 >= ${blockName}_input1[${rows - 1}]) {\n`
    code += `            i0 = i1 = ${rows - 1};\n`
    code += `            t1 = 0.0;\n`
    if (extrapolation === 'extrapolate') {
      code += `            if (${rows} > 1 && ${blockName}_input1[${rows - 1}] != ${blockName}_input1[${rows - 2}]) {\n`
      code += `                i0 = ${rows - 2};\n`
      code += `                t1 = (input1 - ${blockName}_input1[${rows - 2}]) / (${blockName}_input1[${rows - 1}] - ${blockName}_input1[${rows - 2}]);\n`
      code += `            }\n`
    }
    code += `        } else {\n`
    code += `            for (int i = 0; i < ${rows - 1}; i++) {\n`
    code += `                if (input1 >= ${blockName}_input1[i] && input1 <= ${blockName}_input1[i + 1]) {\n`
    code += `                    i0 = i;\n`
    code += `                    i1 = i + 1;\n`
    code += `                    if (${blockName}_input1[i1] != ${blockName}_input1[i0]) {\n`
    code += `                        t1 = (input1 - ${blockName}_input1[i0]) / (${blockName}_input1[i1] - ${blockName}_input1[i0]);\n`
    code += `                    }\n`
    code += `                    break;\n`
    code += `                }\n`
    code += `            }\n`
    code += `        }\n`
    code += `        \n`
    
    // Find input2 indices
    code += `        // Find column indices for input2\n`
    code += `        if (input2 <= ${blockName}_input2[0]) {\n`
    code += `            j0 = j1 = 0;\n`
    code += `            t2 = 0.0;\n`
    if (extrapolation === 'extrapolate') {
      code += `            if (${cols} > 1 && ${blockName}_input2[1] != ${blockName}_input2[0]) {\n`
      code += `                t2 = (input2 - ${blockName}_input2[0]) / (${blockName}_input2[1] - ${blockName}_input2[0]);\n`
      code += `                j1 = 1;\n`
      code += `            }\n`
    }
    code += `        } else if (input2 >= ${blockName}_input2[${cols - 1}]) {\n`
    code += `            j0 = j1 = ${cols - 1};\n`
    code += `            t2 = 0.0;\n`
    if (extrapolation === 'extrapolate') {
      code += `            if (${cols} > 1 && ${blockName}_input2[${cols - 1}] != ${blockName}_input2[${cols - 2}]) {\n`
      code += `                j0 = ${cols - 2};\n`
      code += `                t2 = (input2 - ${blockName}_input2[${cols - 2}]) / (${blockName}_input2[${cols - 1}] - ${blockName}_input2[${cols - 2}]);\n`
      code += `            }\n`
    }
    code += `        } else {\n`
    code += `            for (int j = 0; j < ${cols - 1}; j++) {\n`
    code += `                if (input2 >= ${blockName}_input2[j] && input2 <= ${blockName}_input2[j + 1]) {\n`
    code += `                    j0 = j;\n`
    code += `                    j1 = j + 1;\n`
    code += `                    if (${blockName}_input2[j1] != ${blockName}_input2[j0]) {\n`
    code += `                        t2 = (input2 - ${blockName}_input2[j0]) / (${blockName}_input2[j1] - ${blockName}_input2[j0]);\n`
    code += `                    }\n`
    code += `                    break;\n`
    code += `                }\n`
    code += `            }\n`
    code += `        }\n`
    code += `        \n`
    
    // Bilinear interpolation
    code += `        // Bilinear interpolation\n`
    code += `        double v00 = ${blockName}_table[i0][j0];\n`
    code += `        double v01 = ${blockName}_table[i0][j1];\n`
    code += `        double v10 = ${blockName}_table[i1][j0];\n`
    code += `        double v11 = ${blockName}_table[i1][j1];\n`
    code += `        \n`
    code += `        double v0 = v00 + t2 * (v01 - v00);\n`
    code += `        double v1 = v10 + t2 * (v11 - v10);\n`
    code += `        output = v0 + t1 * (v1 - v0);\n`
    code += `        \n`
    code += `        ${outputName} = output;\n`
    code += `    }\n`
    
    return code
  }

  getOutputType(block: BlockData, inputTypes: string[]): string {
    // Output type matches the first input type for 2D lookup
    if (inputTypes.length === 0) {
      return 'double' // Default type
    }
    // 2D lookup only accepts scalar inputs
    const baseType = BlockModuleUtils.parseType(inputTypes[0]).baseType
    return baseType // Return scalar type
  }

  generateStructMember(block: BlockData, outputType: string): string | null {
    // Lookup blocks always need signal storage
    return BlockModuleUtils.generateStructMember(block.name, outputType)
  }

  requiresState(block: BlockData): boolean {
    // Lookup blocks don't need state variables
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
    
    // Lookup blocks only accept scalar inputs
    if (Array.isArray(input1) || Array.isArray(input2)) {
      console.error(`Lookup2D block ${blockState.blockId} received vector input but expects scalar inputs`)
      blockState.outputs[0] = 0
      return
    }
    
    const scalarInput1 = typeof input1 === 'number' ? input1 : 0
    const scalarInput2 = typeof input2 === 'number' ? input2 : 0
    const { input1Values, input2Values, outputTable, extrapolation } = blockState.internalState
    
    // Validate that we have data
    if (!input1Values || !input2Values || !outputTable || 
        input1Values.length === 0 || input2Values.length === 0 || outputTable.length === 0) {
      blockState.outputs[0] = 0
      return
    }
    
    // Ensure table dimensions match input arrays
    const rows = input1Values.length
    const cols = input2Values.length
    
    if (outputTable.length !== rows) {
      blockState.outputs[0] = 0
      return
    }
    
    // Single point case
    if (rows === 1 && cols === 1) {
      blockState.outputs[0] = outputTable[0][0] || 0
      return
    }
    
    // Find input1 (row) indices
    let i0 = 0, i1 = 0, t1 = 0
    if (scalarInput1 <= input1Values[0]) {
      i0 = i1 = 0
      t1 = 0
    } else if (scalarInput1 >= input1Values[rows - 1]) {
      i0 = i1 = rows - 1
      t1 = 0
    } else {
      for (let i = 0; i < rows - 1; i++) {
        if (scalarInput1 >= input1Values[i] && scalarInput1 <= input1Values[i + 1]) {
          i0 = i
          i1 = i + 1
          t1 = (input1Values[i + 1] - input1Values[i]) !== 0 ? 
               (scalarInput1 - input1Values[i]) / (input1Values[i + 1] - input1Values[i]) : 0
          break
        }
      }
    }
    
    // Find input2 (column) indices
    let j0 = 0, j1 = 0, t2 = 0
    if (scalarInput2 <= input2Values[0]) {
      j0 = j1 = 0
      t2 = 0
    } else if (scalarInput2 >= input2Values[cols - 1]) {
      j0 = j1 = cols - 1
      t2 = 0
    } else {
      for (let j = 0; j < cols - 1; j++) {
        if (scalarInput2 >= input2Values[j] && scalarInput2 <= input2Values[j + 1]) {
          j0 = j
          j1 = j + 1
          t2 = (input2Values[j + 1] - input2Values[j]) !== 0 ? 
               (scalarInput2 - input2Values[j]) / (input2Values[j + 1] - input2Values[j]) : 0
          break
        }
      }
    }
    
    // Get the four corner values for bilinear interpolation
    const v00 = (outputTable[i0] && outputTable[i0][j0] !== undefined) ? outputTable[i0][j0] : 0
    const v01 = (outputTable[i0] && outputTable[i0][j1] !== undefined) ? outputTable[i0][j1] : 0
    const v10 = (outputTable[i1] && outputTable[i1][j0] !== undefined) ? outputTable[i1][j0] : 0
    const v11 = (outputTable[i1] && outputTable[i1][j1] !== undefined) ? outputTable[i1][j1] : 0
    
    // Bilinear interpolation
    const v0 = v00 + t2 * (v01 - v00)  // Interpolate along input2 axis at i0
    const v1 = v10 + t2 * (v11 - v10)  // Interpolate along input2 axis at i1
    const result = v0 + t1 * (v1 - v0) // Interpolate along input1 axis
    
    // Handle extrapolation if needed
    if (extrapolation === 'clamp') {
      // Clamping is already handled by the index finding logic above
      blockState.outputs[0] = result
    } else {
      // For extrapolation, we could extend the gradients, but for now use the result
      blockState.outputs[0] = result
    }
  }

  getInputPortCount(block: BlockData): number {
    // 2D lookup blocks have exactly 2 inputs
    return 2
  }

  getOutputPortCount(block: BlockData): number {
    // 2D lookup blocks have exactly 1 output
    return 1
  }

  // No custom port labels needed
  
}