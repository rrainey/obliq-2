// lib/blocks/Lookup2DBlockModule.ts

import { BlockData } from '@/components/BlockNode'
import { IBlockModule, BlockModuleUtils } from './BlockModule'

export class Lookup2DBlockModule implements IBlockModule {
  generateComputation(block: BlockData, inputs: string[]): string {
    const outputName = `model->signals.${BlockModuleUtils.sanitizeIdentifier(block.name)}`
    const input1Values = block.parameters?.input1Values || [0, 1]
    const input2Values = block.parameters?.input2Values || [0, 1]
    const outputTable = block.parameters?.outputTable || [[0, 0], [0, 1]]
    const extrapolation = block.parameters?.extrapolation || 'clamp'
    
    let code = `    // 2D Lookup block: ${block.name}\n`
    
    if (inputs.length < 2) {
      code += `    ${outputName} = 0.0; // Insufficient inputs\n`
      return code
    }
    
    const input1Expr = inputs[0]
    const input2Expr = inputs[1]
    
    // Generate lookup tables as static arrays
    code += `    static const double ${outputName}_x[] = {`
    code += input1Values.map((v: number) => v.toString()).join(', ')
    code += `};\n`
    
    code += `    static const double ${outputName}_y[] = {`
    code += input2Values.map((v: number) => v.toString()).join(', ')
    code += `};\n`
    
    // Generate 2D output table
    code += `    static const double ${outputName}_z[${input1Values.length}][${input2Values.length}] = {\n`
    for (let i = 0; i < outputTable.length; i++) {
      code += `        {`
      code += outputTable[i].map((v: number) => v.toString()).join(', ')
      code += `}`
      if (i < outputTable.length - 1) code += ','
      code += '\n'
    }
    code += `    };\n`
    
    code += `    const int ${outputName}_nx = ${input1Values.length};\n`
    code += `    const int ${outputName}_ny = ${input2Values.length};\n`
    code += `    double ${outputName}_u = ${input1Expr};\n`
    code += `    double ${outputName}_v = ${input2Expr};\n`
    code += `    \n`
    
    // Generate bilinear interpolation code
    code += `    // 2D bilinear interpolation\n`
    code += `    double result = 0.0;\n`
    code += `    \n`
    
    // Find indices and interpolation factors for first dimension
    code += `    // Find x index and factor\n`
    code += `    int ix = 0;\n`
    code += `    double fx = 0.0;\n`
    
    if (extrapolation === 'clamp') {
      code += `    if (${outputName}_u <= ${outputName}_x[0]) {\n`
      code += `        ix = 0;\n`
      code += `        fx = 0.0;\n`
      code += `    } else if (${outputName}_u >= ${outputName}_x[${outputName}_nx - 1]) {\n`
      code += `        ix = ${outputName}_nx - 2;\n`
      code += `        fx = 1.0;\n`
      code += `    } else {\n`
    } else {
      code += `    if (${outputName}_u < ${outputName}_x[0]) {\n`
      code += `        ix = 0;\n`
      code += `        fx = (${outputName}_u - ${outputName}_x[0]) / (${outputName}_x[1] - ${outputName}_x[0]);\n`
      code += `    } else if (${outputName}_u > ${outputName}_x[${outputName}_nx - 1]) {\n`
      code += `        ix = ${outputName}_nx - 2;\n`
      code += `        fx = (${outputName}_u - ${outputName}_x[${outputName}_nx - 2]) / `
      code += `(${outputName}_x[${outputName}_nx - 1] - ${outputName}_x[${outputName}_nx - 2]);\n`
      code += `    } else {\n`
    }
    
    code += `        for (int i = 0; i < ${outputName}_nx - 1; i++) {\n`
    code += `            if (${outputName}_u >= ${outputName}_x[i] && ${outputName}_u <= ${outputName}_x[i + 1]) {\n`
    code += `                ix = i;\n`
    code += `                fx = (${outputName}_u - ${outputName}_x[i]) / (${outputName}_x[i + 1] - ${outputName}_x[i]);\n`
    code += `                break;\n`
    code += `            }\n`
    code += `        }\n`
    code += `    }\n`
    code += `    \n`
    
    // Find indices and interpolation factors for second dimension
    code += `    // Find y index and factor\n`
    code += `    int iy = 0;\n`
    code += `    double fy = 0.0;\n`
    
    if (extrapolation === 'clamp') {
      code += `    if (${outputName}_v <= ${outputName}_y[0]) {\n`
      code += `        iy = 0;\n`
      code += `        fy = 0.0;\n`
      code += `    } else if (${outputName}_v >= ${outputName}_y[${outputName}_ny - 1]) {\n`
      code += `        iy = ${outputName}_ny - 2;\n`
      code += `        fy = 1.0;\n`
      code += `    } else {\n`
    } else {
      code += `    if (${outputName}_v < ${outputName}_y[0]) {\n`
      code += `        iy = 0;\n`
      code += `        fy = (${outputName}_v - ${outputName}_y[0]) / (${outputName}_y[1] - ${outputName}_y[0]);\n`
      code += `    } else if (${outputName}_v > ${outputName}_y[${outputName}_ny - 1]) {\n`
      code += `        iy = ${outputName}_ny - 2;\n`
      code += `        fy = (${outputName}_v - ${outputName}_y[${outputName}_ny - 2]) / `
      code += `(${outputName}_y[${outputName}_ny - 1] - ${outputName}_y[${outputName}_ny - 2]);\n`
      code += `    } else {\n`
    }
    
    code += `        for (int i = 0; i < ${outputName}_ny - 1; i++) {\n`
    code += `            if (${outputName}_v >= ${outputName}_y[i] && ${outputName}_v <= ${outputName}_y[i + 1]) {\n`
    code += `                iy = i;\n`
    code += `                fy = (${outputName}_v - ${outputName}_y[i]) / (${outputName}_y[i + 1] - ${outputName}_y[i]);\n`
    code += `                break;\n`
    code += `            }\n`
    code += `        }\n`
    code += `    }\n`
    code += `    \n`
    
    // Perform bilinear interpolation
    code += `    // Bilinear interpolation\n`
    code += `    double z00 = ${outputName}_z[ix][iy];\n`
    code += `    double z10 = (ix + 1 < ${outputName}_nx) ? ${outputName}_z[ix + 1][iy] : z00;\n`
    code += `    double z01 = (iy + 1 < ${outputName}_ny) ? ${outputName}_z[ix][iy + 1] : z00;\n`
    code += `    double z11 = (ix + 1 < ${outputName}_nx && iy + 1 < ${outputName}_ny) ? ${outputName}_z[ix + 1][iy + 1] : z00;\n`
    code += `    \n`
    code += `    double z0 = z00 * (1.0 - fx) + z10 * fx;\n`
    code += `    double z1 = z01 * (1.0 - fx) + z11 * fx;\n`
    code += `    ${outputName} = z0 * (1.0 - fy) + z1 * fy;\n`
    
    return code
  }

  getOutputType(block: BlockData, inputTypes: string[]): string {
    // Output type matches input types for 2D lookup
    // Assumes both inputs have the same type
    if (inputTypes.length === 0) {
      return 'double' // Default type
    }
    return inputTypes[0]
  }

  generateStructMember(block: BlockData, outputType: string): string | null {
    // Lookup blocks always need signal storage
    return BlockModuleUtils.generateStructMember(block.name, outputType)
  }

  requiresState(block: BlockData): boolean {
    // Lookup blocks don't need state
    return false
  }

  generateStateStructMembers(block: BlockData, outputType: string): string[] {
    // No state needed for lookup blocks
    return []
  }

  // No initialization needed for lookup blocks
}