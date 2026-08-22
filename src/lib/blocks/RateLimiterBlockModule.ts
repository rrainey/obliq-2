// lib/blocks/RateLimiterBlockModule.ts
//
// Rate limiter: limits the rate of change of the output.
// Supports scalar and vector inputs (element-wise).

import { BlockData } from '@/components/BlockNode'
import { IBlockModule, BlockModuleUtils } from './BlockModule'

export class RateLimiterBlockModule implements IBlockModule {
  generateComputation(
    block: BlockData,
    inputs: string[],
    inputTypes?: string[]
  ): string {
    const outputName = `model->signals.${BlockModuleUtils.sanitizeIdentifier(block.name)}`
    const name = BlockModuleUtils.sanitizeIdentifier(block.name)
    const risingSlewLimit = Number(block.parameters?.risingSlewLimit ?? 1)
    const fallingSlewLimit = Number(block.parameters?.fallingSlewLimit ?? -1)
    const inType = inputTypes?.[0] || 'double'
    const typeInfo = BlockModuleUtils.parseType(inType)
    const size =
      (typeInfo.isArray && typeInfo.arraySize) ||
      (typeInfo.isMatrix && typeInfo.rows && typeInfo.cols === 1
        ? typeInfo.rows
        : 0)

    let code = `    // Rate Limiter block: ${block.name}\n`
    code += `    // rising=${risingSlewLimit}/s, falling=${fallingSlewLimit}/s\n`

    if (inputs.length === 0) {
      if (size > 0) {
        code += `    for (int i = 0; i < ${size}; i++) {\n`
        code += `        ${outputName}[i] = model->states.${name}_last_output[i];\n`
        code += `    }\n`
      } else {
        code += `    ${outputName} = model->states.${name}_last_output;\n`
      }
      return code
    }

    const u = inputs[0]

    if (size > 0) {
      const col = !!(typeInfo.isMatrix && typeInfo.cols === 1)
      code += `    {\n`
      code += `        double ${name}_max_delta = (${risingSlewLimit}) * model->dt;\n`
      code += `        double ${name}_min_delta = (${fallingSlewLimit}) * model->dt;\n`
      code += `        for (int i = 0; i < ${size}; i++) {\n`
      const uAcc = col ? `${u}[i][0]` : `${u}[i]`
      code += `            double ${name}_delta = (${uAcc}) - model->states.${name}_last_output[i];\n`
      code += `            if (${name}_delta > ${name}_max_delta) ${name}_delta = ${name}_max_delta;\n`
      code += `            if (${name}_delta < ${name}_min_delta) ${name}_delta = ${name}_min_delta;\n`
      code += `            ${outputName}[i] = model->states.${name}_last_output[i] + ${name}_delta;\n`
      code += `            model->states.${name}_last_output[i] = ${outputName}[i];\n`
      code += `        }\n`
      code += `    }\n`
    } else {
      code += `    {\n`
      code += `        double ${name}_max_delta = (${risingSlewLimit}) * model->dt;\n`
      code += `        double ${name}_min_delta = (${fallingSlewLimit}) * model->dt;\n`
      code += `        double ${name}_delta = (${u}) - model->states.${name}_last_output;\n`
      code += `        if (${name}_delta > ${name}_max_delta) ${name}_delta = ${name}_max_delta;\n`
      code += `        if (${name}_delta < ${name}_min_delta) ${name}_delta = ${name}_min_delta;\n`
      code += `        ${outputName} = model->states.${name}_last_output + ${name}_delta;\n`
      code += `        model->states.${name}_last_output = ${outputName};\n`
      code += `    }\n`
    }

    return code
  }

  getOutputType(block: BlockData, inputTypes: string[]): string {
    if (inputTypes[0] && inputTypes[0].includes('[')) {
      // Prefer flat vector over column for limiter state simplicity
      const t = BlockModuleUtils.parseType(inputTypes[0])
      if (t.isMatrix && t.cols === 1 && t.rows) return `double[${t.rows}]`
      if (t.isArray && t.arraySize) return inputTypes[0]
    }
    return 'double'
  }

  generateStructMember(block: BlockData, outputType: string): string | null {
    return BlockModuleUtils.generateStructMember(
      block.name,
      outputType || 'double'
    )
  }

  requiresState(block: BlockData): boolean {
    return true
  }

  generateStateStructMembers(block: BlockData, outputType: string): string[] {
    const name = BlockModuleUtils.sanitizeIdentifier(block.name)
    const t = BlockModuleUtils.parseType(outputType || 'double')
    if (t.isArray && t.arraySize) {
      return [`    double ${name}_last_output[${t.arraySize}];`]
    }
    return [`    double ${name}_last_output;`]
  }

  generateInitialization(block: BlockData, outputType?: string): string {
    const name = BlockModuleUtils.sanitizeIdentifier(block.name)
    const initialOutput = Number(block.parameters?.initialOutput ?? 0)
    const t = BlockModuleUtils.parseType(outputType || 'double')
    if (t.isArray && t.arraySize) {
      let code = ''
      for (let i = 0; i < t.arraySize; i++) {
        code += `    model->states.${name}_last_output[${i}] = ${initialOutput};\n`
      }
      return code
    }
    return `    model->states.${name}_last_output = ${initialOutput};\n`
  }

  getInputPortCount(block: BlockData): number {
    return 1
  }

  getOutputPortCount(block: BlockData): number {
    return 1
  }

  getInputPortLabels(block: BlockData): string[] | undefined {
    return ['in']
  }
}
