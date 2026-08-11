// lib/blocks/RelayBlockModule.ts
//
// Relay with hysteresis (scalar v1).
//
// if is_on:
//   if u <= offThreshold: is_on = false
// else:
//   if u >= onThreshold: is_on = true
// y = is_on ? onOutput : offOutput
//
// Constraint: onThreshold >= offThreshold

import { BlockData } from '@/components/BlockNode'
import { IBlockModule, BlockModuleUtils } from './BlockModule'

export class RelayBlockModule implements IBlockModule {
  generateComputation(block: BlockData, inputs: string[], inputTypes?: string[]): string {
    const outputName = `model->signals.${BlockModuleUtils.sanitizeIdentifier(block.name)}`
    const name = BlockModuleUtils.sanitizeIdentifier(block.name)
    const onThreshold = Number(block.parameters?.onThreshold ?? 0)
    const offThreshold = Number(block.parameters?.offThreshold ?? 0)
    const onOutput = Number(block.parameters?.onOutput ?? 1)
    const offOutput = Number(block.parameters?.offOutput ?? 0)

    let code = `    // Relay block: ${block.name}\n`
    code += `    // onThreshold=${onThreshold}, offThreshold=${offThreshold}\n`

    if (inputs.length === 0) {
      code += `    ${outputName} = ${offOutput};\n`
      return code
    }

    const u = inputs[0]

    // Update hysteresis state
    code += `    if (model->states.${name}_is_on) {\n`
    code += `        if ((${u}) <= ${offThreshold}) {\n`
    code += `            model->states.${name}_is_on = false;\n`
    code += `        }\n`
    code += `    } else {\n`
    code += `        if ((${u}) >= ${onThreshold}) {\n`
    code += `            model->states.${name}_is_on = true;\n`
    code += `        }\n`
    code += `    }\n`

    // Output based on state
    code += `    ${outputName} = model->states.${name}_is_on ? ${onOutput} : ${offOutput};\n`

    return code
  }

  getOutputType(block: BlockData, inputTypes: string[]): string {
    // Scalar double output (v1)
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
    return [`    bool ${name}_is_on;`]
  }

  generateInitialization(block: BlockData, outputType?: string): string {
    const name = BlockModuleUtils.sanitizeIdentifier(block.name)
    const initialOn = !!block.parameters?.initialOn
    return `    model->states.${name}_is_on = ${initialOn ? 'true' : 'false'};\n`
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
    // Output depends on current input and state — algebraic loops possible;
    // prefer unit_delay in feedback of rate modulators.
    return true
  }
}
