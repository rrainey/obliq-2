// lib/blocks/ScaleBlockModule.ts

import { BlockData } from '@/components/BlockNode'
import { BlockState, SimulationState } from '@/lib/simulationTypes'
import { IBlockModule, BlockModuleUtils } from './BlockModule'

export class ScaleBlockModule implements IBlockModule {
  generateComputation(block: BlockData, inputs: string[], inputTypes?: string[]): string {
    const outputName = `model->signals.${BlockModuleUtils.sanitizeIdentifier(block.name)}`
    // Prefer model-parameter gain (mdl Gain "V_ex1_mps") over a baked numeric.
    // useParameter + parameterName → PARAM_<name>; a non-numeric string gain is
    // treated as a parameter name. Use ?? so an explicit gain of 0 is honored.
    const useParameter = block.parameters?.useParameter
    const parameterName = block.parameters?.parameterName
    const rawGain = block.parameters?.gain
    let gainExpr: string
    let gainComment: string
    if (useParameter && parameterName) {
      gainExpr = `PARAM_${BlockModuleUtils.sanitizeIdentifier(String(parameterName))}`
      gainComment = `${parameterName} → ${gainExpr}`
    } else if (typeof rawGain === 'string' && rawGain.trim() !== '' && !Number.isFinite(Number(rawGain))) {
      const trimmed = rawGain.trim()
      // mdl-style "1/V_ex3_mps" → (1.0/PARAM_V_ex3_mps)
      const recip = trimmed.match(/^1\s*\/\s*([A-Za-z_][A-Za-z0-9_]*)$/)
      if (recip) {
        const paramIdent = `PARAM_${BlockModuleUtils.sanitizeIdentifier(recip[1])}`
        gainExpr = `(1.0/${paramIdent})`
        gainComment = `${trimmed} → ${gainExpr}`
      } else {
        gainExpr = `PARAM_${BlockModuleUtils.sanitizeIdentifier(trimmed)}`
        gainComment = `${trimmed} → ${gainExpr}`
      }
    } else {
      gainExpr = String(rawGain ?? 1)
      gainComment = gainExpr
    }

    if (inputs.length === 0) {
      return `    ${outputName} = 0.0; // No input\n`
    }

    const input = inputs[0]

    // Get the input type to determine if we need loops
    const inputType = inputTypes && inputTypes.length > 0 ? inputTypes[0] : 'double'
    const typeInfo = BlockModuleUtils.parseType(inputType)

    let code = `    // Scale block: ${block.name} (gain = ${gainComment})\n`

    if (typeInfo.isMatrix && typeInfo.rows && typeInfo.cols) {
      // Matrix scaling
      code += `    for (int i = 0; i < ${typeInfo.rows}; i++) {\n`
      code += `        for (int j = 0; j < ${typeInfo.cols}; j++) {\n`
      code += `            ${outputName}[i][j] = ${input}[i][j] * ${gainExpr};\n`
      code += `        }\n`
      code += `    }\n`
    } else if (typeInfo.isArray && typeInfo.arraySize) {
      // Vector scaling
      code += `    for (int i = 0; i < ${typeInfo.arraySize}; i++) {\n`
      code += `        ${outputName}[i] = ${input}[i] * ${gainExpr};\n`
      code += `    }\n`
    } else {
      // Scalar scaling
      code += `    ${outputName} = ${input} * ${gainExpr};\n`
    }

    return code
  }

  getOutputType(block: BlockData, inputTypes: string[]): string {
    // Scale block output type matches the input type
    if (inputTypes.length === 0) {
      return 'double' // Default type
    }
    return inputTypes[0]
  }

  generateStructMember(block: BlockData, outputType: string): string | null {
    // Scale blocks always need signal storage
    return BlockModuleUtils.generateStructMember(block.name, outputType)
  }

  requiresState(block: BlockData): boolean {
    // Scale blocks don't need state variables
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
    // Scale blocks have exactly 1 input
    return 1
  }

  getOutputPortCount(block: BlockData): number {
    // Scale blocks have exactly 1 output
    return 1
  }
}