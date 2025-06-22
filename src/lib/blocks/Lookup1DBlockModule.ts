// lib/blocks/Lookup1DBlockModule.ts

import { BlockData } from '@/components/BlockNode'
import { IBlockModule, BlockModuleUtils } from './BlockModule'

export class Lookup1DBlockModule implements IBlockModule {
  generateComputation(block: BlockData, inputs: string[]): string {
    const outputName = `model->signals.${BlockModuleUtils.sanitizeIdentifier(block.name)}`
    const inputValues = block.parameters?.inputValues || [0, 1]
    const outputValues = block.parameters?.outputValues || [0, 1]
    const extrapolation = block.parameters?.extrapolation || 'clamp'
    
    let code = `    // 1D Lookup block: ${block.name}\n`
    
    if (inputs.length === 0) {
      code += `    ${outputName} = 0.0; // No input\n`
      return code
    }
    
    const inputExpr = inputs[0]
    
    // Generate lookup table as static arrays
    code += `    static const double ${outputName}_x[] = {`
    code += inputValues.map((v: number) => v.toString()).join(', ')
    code += `};\n`
    
    code += `    static const double ${outputName}_y[] = {`
    code += outputValues.map((v: number) => v.toString()).join(', ')
    code += `};\n`
    
    code += `    const int ${outputName}_n = ${inputValues.length};\n`
    code += `    double ${outputName}_input = ${inputExpr};\n`
    code += `    \n`
    
    // Generate interpolation code
    code += `    // Linear interpolation\n`
    code += `    if (${outputName}_input <= ${outputName}_x[0]) {\n`
    
    if (extrapolation === 'clamp') {
      code += `        ${outputName} = ${outputName}_y[0];\n`
    } else {
      // Linear extrapolation
      code += `        // Extrapolate\n`
      code += `        if (${outputName}_n >= 2) {\n`
      code += `            double slope = (${outputName}_y[1] - ${outputName}_y[0]) / (${outputName}_x[1] - ${outputName}_x[0]);\n`
      code += `            ${outputName} = ${outputName}_y[0] + slope * (${outputName}_input - ${outputName}_x[0]);\n`
      code += `        } else {\n`
      code += `            ${outputName} = ${outputName}_y[0];\n`
      code += `        }\n`
    }
    
    code += `    } else if (${outputName}_input >= ${outputName}_x[${outputName}_n - 1]) {\n`
    
    if (extrapolation === 'clamp') {
      code += `        ${outputName} = ${outputName}_y[${outputName}_n - 1];\n`
    } else {
      // Linear extrapolation
      code += `        // Extrapolate\n`
      code += `        if (${outputName}_n >= 2) {\n`
      code += `            double slope = (${outputName}_y[${outputName}_n - 1] - ${outputName}_y[${outputName}_n - 2]) / `
      code += `(${outputName}_x[${outputName}_n - 1] - ${outputName}_x[${outputName}_n - 2]);\n`
      code += `            ${outputName} = ${outputName}_y[${outputName}_n - 1] + slope * (${outputName}_input - ${outputName}_x[${outputName}_n - 1]);\n`
      code += `        } else {\n`
      code += `            ${outputName} = ${outputName}_y[${outputName}_n - 1];\n`
      code += `        }\n`
    }
    
    code += `    } else {\n`
    code += `        // Find interpolation interval\n`
    code += `        int i;\n`
    code += `        for (i = 0; i < ${outputName}_n - 1; i++) {\n`
    code += `            if (${outputName}_input >= ${outputName}_x[i] && ${outputName}_input <= ${outputName}_x[i + 1]) {\n`
    code += `                double t = (${outputName}_input - ${outputName}_x[i]) / (${outputName}_x[i + 1] - ${outputName}_x[i]);\n`
    code += `                ${outputName} = ${outputName}_y[i] + t * (${outputName}_y[i + 1] - ${outputName}_y[i]);\n`
    code += `                break;\n`
    code += `            }\n`
    code += `        }\n`
    code += `    }\n`
    
    return code
  }

  getOutputType(block: BlockData, inputTypes: string[]): string {
    // Output type matches input type for 1D lookup
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