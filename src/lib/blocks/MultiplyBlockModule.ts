// lib/blocks/MultiplyBlockModule.ts

import { BlockData } from '@/components/BlockNode'
import { BlockState, SimulationState } from '@/lib/simulationTypes'
import { IBlockModule, BlockModuleUtils } from './BlockModule'

export class MultiplyBlockModule implements IBlockModule {
  generateComputation(block: BlockData, inputs: string[], inputTypes?: string[]): string {
    const outputName = `model->signals.${BlockModuleUtils.sanitizeIdentifier(block.name)}`

    if (inputs.length === 0) {
      return `    ${outputName} = 0.0; // No inputs\n`
    }

    // Prefer a dimensional input as the element-wise shape (scalar×vector → vector)
    const outputType =
      (inputTypes || []).find(t => t && t.includes('[')) ||
      (inputTypes && inputTypes.length > 0 ? inputTypes[0] : 'double')
    const typeInfo = BlockModuleUtils.parseType(outputType)

    // Simulink Product Inputs string: '*' multiply, '/' divide (e.g. "*/", "**/", "/*").
    // Leading '/' means start from the reciprocal of that input.
    const opsRaw = String(block.parameters?.ops ?? '')
    const ops =
      opsRaw.replace(/[^*/]/g, '') || '*'.repeat(inputs.length)
    const hasDivide = ops.includes('/')

    if (!hasDivide) {
      return BlockModuleUtils.generateElementWiseOperation(
        outputName,
        inputs,
        '*',
        typeInfo,
        inputTypes
      )
    }

    const access = (inp: string, typ: string | undefined, idx: string) => {
      if (typ && typ.includes('[')) return `${inp}${idx}`
      return `(${inp})`
    }

    const term = (k: number, idx: string) => {
      const a = access(inputs[k], inputTypes?.[k], idx)
      const op = ops[k] || '*'
      if (k === 0) return op === '/' ? `(1.0/${a})` : a
      return ` ${op} ${a}`
    }

    if (typeInfo.isMatrix && typeInfo.rows && typeInfo.cols) {
      let code = `    // Matrix element-wise product/divide (ops=${ops})\n`
      code += `    for (int i = 0; i < ${typeInfo.rows}; i++) {\n`
      code += `        for (int j = 0; j < ${typeInfo.cols}; j++) {\n`
      code += `            ${outputName}[i][j] = `
      for (let k = 0; k < inputs.length; k++) code += term(k, '[i][j]')
      code += `;\n        }\n    }\n`
      return code
    }

    if (typeInfo.isArray && typeInfo.arraySize) {
      let code = `    // Vector element-wise product/divide (ops=${ops})\n`
      code += `    for (int i = 0; i < ${typeInfo.arraySize}; i++) {\n`
      code += `        ${outputName}[i] = `
      for (let k = 0; k < inputs.length; k++) code += term(k, '[i]')
      code += `;\n    }\n`
      return code
    }

    let computation = `${outputName} = `
    for (let k = 0; k < inputs.length; k++) computation += term(k, '')
    return `    // Product/divide (ops=${ops})\n    ${computation};\n`
  }

  getOutputType(block: BlockData, inputTypes: string[]): string {
    // Prefer dimensional type so scalar×vector → vector
    const dim = inputTypes.find(t => t && t.includes('['))
    if (dim) return dim
    if (inputTypes.length === 0) return 'double'
    return inputTypes[0]
  }

  generateStructMember(block: BlockData, outputType: string): string | null {
    // Multiply blocks always need signal storage
    return BlockModuleUtils.generateStructMember(block.name, outputType)
  }

  requiresState(block: BlockData): boolean {
    // Multiply blocks don't need state variables
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
    // Prefer numInputs (mdl2obliq / Sum-style); fall back to legacy keys
    return (
      block.parameters?.numInputs ||
      block.parameters?.inputCount ||
      block.parameters?.inputs ||
      2
    )
  }

  getOutputPortCount(block: BlockData): number {
    // Multiply blocks always have exactly 1 output
    return 1
  }
}