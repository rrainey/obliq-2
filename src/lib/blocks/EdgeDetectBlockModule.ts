// lib/blocks/EdgeDetectBlockModule.ts
//
// Edge detector: outputs a one-step pulse (1.0) when the input crosses threshold.
//
// Parameters:
//   edge: 'rising' | 'falling' | 'either'  (default 'rising')
//   threshold: number  (default 0.5) — for numeric inputs, u >= threshold is "high"
//
// State: prev_high (bool)
// Output: double 1.0 for one step on detected edge, else 0.0

import { BlockData } from '@/components/BlockNode'
import { IBlockModule, BlockModuleUtils } from './BlockModule'

export type EdgeDetectMode = 'rising' | 'falling' | 'either'

export class EdgeDetectBlockModule implements IBlockModule {
  generateComputation(block: BlockData, inputs: string[], inputTypes?: string[]): string {
    const outputName = `model->signals.${BlockModuleUtils.sanitizeIdentifier(block.name)}`
    const name = BlockModuleUtils.sanitizeIdentifier(block.name)
    const edge: EdgeDetectMode = block.parameters?.edge || 'rising'
    const threshold = Number(block.parameters?.threshold ?? 0.5)

    let code = `    // Edge Detect block: ${block.name} (${edge}, thr=${threshold})\n`

    if (inputs.length === 0) {
      code += `    ${outputName} = 0.0;\n`
      return code
    }

    const u = inputs[0]

    // Treat numeric/bool: high when u >= threshold (bool true becomes 1.0)
    code += `    {\n`
    code += `        bool ${name}_high = ((double)(${u})) >= ${threshold};\n`
    code += `        bool ${name}_pulse = false;\n`

    if (edge === 'rising' || edge === 'either') {
      code += `        if (${name}_high && !model->states.${name}_prev_high) ${name}_pulse = true;\n`
    }
    if (edge === 'falling' || edge === 'either') {
      code += `        if (!${name}_high && model->states.${name}_prev_high) ${name}_pulse = true;\n`
    }

    code += `        ${outputName} = ${name}_pulse ? 1.0 : 0.0;\n`
    code += `        model->states.${name}_prev_high = ${name}_high;\n`
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
    return [`    bool ${name}_prev_high;`]
  }

  generateInitialization(block: BlockData, outputType?: string): string {
    const name = BlockModuleUtils.sanitizeIdentifier(block.name)
    // Start low so first rising edge from unconnected/false works
    return `    model->states.${name}_prev_high = false;\n`
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
    return ['pulse']
  }

  isDirectFeedthrough(block: BlockData): boolean {
    // Pulse depends on current input and previous state
    return true
  }
}
