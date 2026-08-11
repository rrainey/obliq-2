// lib/blocks/RateLimiterBlockModule.ts
//
// Rate limiter (scalar v1): limits the rate of change of the output.
//
// max_delta = risingSlewLimit * dt     // risingSlewLimit > 0
// min_delta = fallingSlewLimit * dt    // fallingSlewLimit < 0
// delta = clamp(u - last, min_delta, max_delta)
// y = last + delta
// last = y
//
// Uses model->dt (fixed-step simulation).

import { BlockData } from '@/components/BlockNode'
import { IBlockModule, BlockModuleUtils } from './BlockModule'

export class RateLimiterBlockModule implements IBlockModule {
  generateComputation(block: BlockData, inputs: string[], inputTypes?: string[]): string {
    const outputName = `model->signals.${BlockModuleUtils.sanitizeIdentifier(block.name)}`
    const name = BlockModuleUtils.sanitizeIdentifier(block.name)
    const risingSlewLimit = Number(block.parameters?.risingSlewLimit ?? 1)
    const fallingSlewLimit = Number(block.parameters?.fallingSlewLimit ?? -1)

    let code = `    // Rate Limiter block: ${block.name}\n`
    code += `    // rising=${risingSlewLimit}/s, falling=${fallingSlewLimit}/s\n`

    if (inputs.length === 0) {
      code += `    ${outputName} = model->states.${name}_last_output;\n`
      return code
    }

    const u = inputs[0]

    code += `    {\n`
    code += `        double ${name}_max_delta = (${risingSlewLimit}) * model->dt;\n`
    code += `        double ${name}_min_delta = (${fallingSlewLimit}) * model->dt;\n`
    code += `        double ${name}_delta = (${u}) - model->states.${name}_last_output;\n`
    code += `        if (${name}_delta > ${name}_max_delta) ${name}_delta = ${name}_max_delta;\n`
    code += `        if (${name}_delta < ${name}_min_delta) ${name}_delta = ${name}_min_delta;\n`
    code += `        ${outputName} = model->states.${name}_last_output + ${name}_delta;\n`
    code += `        model->states.${name}_last_output = ${outputName};\n`
    code += `    }\n`

    return code
  }

  getOutputType(block: BlockData, inputTypes: string[]): string {
    return 'double'
  }

  generateStructMember(block: BlockData, outputType: string): string | null {
    return BlockModuleUtils.generateStructMember(block.name, 'double')
  }

  requiresState(block: BlockData): boolean {
    return true
  }

  generateStateStructMembers(block: BlockData, outputType: string): string[] {
    const name = BlockModuleUtils.sanitizeIdentifier(block.name)
    return [`    double ${name}_last_output;`]
  }

  generateInitialization(block: BlockData, outputType?: string): string {
    const name = BlockModuleUtils.sanitizeIdentifier(block.name)
    const initialOutput = Number(block.parameters?.initialOutput ?? 0)
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

  getOutputPortLabels(block: BlockData): string[] | undefined {
    return ['out']
  }

  isDirectFeedthrough(block: BlockData): boolean {
    return true
  }
}
