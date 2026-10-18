// lib/blocks/Lookup1DBlockModule.ts

import { BlockData } from '@/components/BlockNode'
import { IBlockModule, BlockModuleUtils } from './BlockModule'

/**
 * Resolve 1D lookup axis/table source: model parameter name or inline array.
 * Param path uses HeaderGenerator macros NAME / NAME_SIZE.
 */
function resolve1DAxis(
  blockName: string,
  role: 'inputs' | 'outputs',
  inline: number[] | undefined,
  paramName: string | undefined
): { decl: string; arr: string; sizeExpr: string } {
  if (paramName) {
    const p = BlockModuleUtils.sanitizeIdentifier(paramName)
    return {
      decl: `        // ${role} from model parameter ${p}\n`,
      arr: p,
      sizeExpr: `${p}_SIZE`
    }
  }
  const values = inline && inline.length ? inline : [0, 1]
  const local = `${blockName}_${role}`
  return {
    decl:
      `        const double ${local}[${values.length}] = {` +
      values.join(', ') +
      `};\n`,
    arr: local,
    sizeExpr: String(values.length)
  }
}

export class Lookup1DBlockModule implements IBlockModule {
  generateComputation(block: BlockData, inputs: string[]): string {
    const outputName = `model->signals.${BlockModuleUtils.sanitizeIdentifier(block.name)}`
    const blockName = BlockModuleUtils.sanitizeIdentifier(block.name)

    if (inputs.length === 0) {
      return `    ${outputName} = 0.0; // No input\n`
    }

    const inputExpr = inputs[0]
    const extrapolation = block.parameters?.extrapolation || 'clamp'
    const inAxis = resolve1DAxis(
      blockName,
      'inputs',
      block.parameters?.inputValues,
      block.parameters?.inputValuesParam
    )
    const outAxis = resolve1DAxis(
      blockName,
      'outputs',
      block.parameters?.outputValues,
      block.parameters?.outputValuesParam
    )

    let code = `    // 1D Lookup block: ${block.name}\n`
    code += `    {\n`
    code += `        double input = ${inputExpr};\n`
    code += `        double output = 0.0;\n`
    code += `        \n`
    code += `        // Lookup table data\n`
    code += inAxis.decl
    code += outAxis.decl
    // Size = min of the two axes (matches prior inline Math.min behavior)
    if (inAxis.sizeExpr === outAxis.sizeExpr && /^\d+$/.test(inAxis.sizeExpr)) {
      code += `        const int ${blockName}_size = ${inAxis.sizeExpr};\n`
    } else {
      code += `        const int ${blockName}_size = (${inAxis.sizeExpr}) < (${outAxis.sizeExpr}) ? (${inAxis.sizeExpr}) : (${outAxis.sizeExpr});\n`
    }
    code += `        \n`

    const inp = inAxis.arr
    const outp = outAxis.arr
    const sz = `${blockName}_size`

    // Handle edge cases
    code += `        if (${sz} <= 0) {\n`
    code += `            output = 0.0;\n`
    code += `        } else if (input <= ${inp}[0]) {\n`
    if (extrapolation === 'clamp') {
      code += `            output = ${outp}[0];\n`
    } else {
      code += `            // Extrapolate\n`
      code += `            if (${sz} >= 2) {\n`
      code += `                double slope = (${outp}[1] - ${outp}[0]) / `
      code += `(${inp}[1] - ${inp}[0]);\n`
      code += `                output = ${outp}[0] + slope * (input - ${inp}[0]);\n`
      code += `            } else {\n`
      code += `                output = ${outp}[0];\n`
      code += `            }\n`
    }
    code += `        } else if (input >= ${inp}[${sz} - 1]) {\n`
    if (extrapolation === 'clamp') {
      code += `            output = ${outp}[${sz} - 1];\n`
    } else {
      code += `            // Extrapolate\n`
      code += `            if (${sz} >= 2) {\n`
      code += `                double slope = (${outp}[${sz} - 1] - ${outp}[${sz} - 2]) / `
      code += `(${inp}[${sz} - 1] - ${inp}[${sz} - 2]);\n`
      code += `                output = ${outp}[${sz} - 1] + slope * (input - ${inp}[${sz} - 1]);\n`
      code += `            } else {\n`
      code += `                output = ${outp}[${sz} - 1];\n`
      code += `            }\n`
    }
    code += `        } else {\n`
    code += `            // Linear interpolation\n`
    code += `            for (int i = 0; i < ${sz} - 1; i++) {\n`
    code += `                if (input >= ${inp}[i] && input <= ${inp}[i + 1]) {\n`
    code += `                    double t = (input - ${inp}[i]) / `
    code += `(${inp}[i + 1] - ${inp}[i]);\n`
    code += `                    output = ${outp}[i] + t * (${outp}[i + 1] - ${outp}[i]);\n`
    code += `                    break;\n`
    code += `                }\n`
    code += `            }\n`
    code += `        }\n`
    code += `        \n`
    code += `        ${outputName} = output;\n`
    code += `    }\n`

    return code
  }

  getOutputType(block: BlockData, inputTypes: string[]): string {
    if (inputTypes.length === 0) {
      return 'double'
    }
    const baseType = BlockModuleUtils.parseType(inputTypes[0]).baseType
    return baseType
  }

  generateStructMember(block: BlockData, outputType: string): string | null {
    return BlockModuleUtils.generateStructMember(block.name, outputType)
  }

  requiresState(_block: BlockData): boolean {
    return false
  }

  generateStateStructMembers(_block: BlockData, _outputType: string): string[] {
    return []
  }

  generateInitialization(_block: BlockData): string {
    return ''
  }

  getInputPortCount(_block: BlockData): number {
    return 1
  }

  getOutputPortCount(_block: BlockData): number {
    return 1
  }
}
