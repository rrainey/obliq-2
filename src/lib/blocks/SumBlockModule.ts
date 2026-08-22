// lib/blocks/SumBlockModule.ts

import { BlockData } from '@/components/BlockNode'
import { BlockState, SimulationState } from '@/lib/simulationTypes'
import { IBlockModule, BlockModuleUtils } from './BlockModule'
import { parseType, ParsedType } from '@/lib/typeValidator'

/** Configured input arity: signs length, else numInputs / inputCount, else 2. */
function configuredInputCount(block: BlockData): number {
  if (typeof block.parameters?.signs === 'string' && block.parameters.signs.length > 0) {
    return block.parameters.signs.length
  }
  const n = block.parameters?.numInputs ?? block.parameters?.inputCount
  if (typeof n === 'number' && n >= 1) return n
  return 2
}

/**
 * Simulink "Sum of Elements": configured for exactly one input. A vector/matrix
 * collapses to the scalar sum of all elements (output type = base scalar).
 */
function isSumOfElements(block: BlockData): boolean {
  return configuredInputCount(block) === 1
}

export class SumBlockModule implements IBlockModule {
  generateComputation(block: BlockData, inputs: string[], inputTypes?: string[]): string {
    const outputName = `model->signals.${BlockModuleUtils.sanitizeIdentifier(block.name)}`
    
    if (inputs.length === 0) {
      return `    ${outputName} = 0.0; // No inputs\n`
    }
    
    // Get signs from parameters
    const signs = block.parameters?.signs || '+'.repeat(inputs.length)

    const access = (inp: string, typ: string | undefined, idx: string) => {
      const p = BlockModuleUtils.parseType(typ || 'double')
      if (p.isMatrix && p.rows && p.cols === 1) return `${inp}${idx}[0]`
      if (p.isMatrix && p.rows && p.cols) return `${inp}${idx}`
      if (p.isArray && p.arraySize) return `${inp}${idx}`
      // If typed scalar but signal name looks like a mux/vector, still index
      if (/_Mux\d*$|_Mux\d+_/.test(inp) || /Mux\d*$/.test(inp)) {
        return `${inp}${idx}`
      }
      return `(${inp})`
    }

    // --- Sum of Elements: one vector/matrix → scalar ---
    if (isSumOfElements(block) && inputs.length === 1) {
      const inType = inputTypes?.[0] || 'double'
      let inParsed: ParsedType
      try {
        inParsed = parseType(inType)
      } catch {
        inParsed = { baseType: 'double', isArray: false, isMatrix: false }
      }
      const sign = signs[0] || '+'
      const term = (idx: string) => {
        const a = access(inputs[0], inType, idx)
        return sign === '-' ? `-(${a})` : a
      }

      if (inParsed.isMatrix && inParsed.rows && inParsed.cols) {
        let code = `    // Sum of Elements (${inParsed.rows}×${inParsed.cols} → scalar)\n`
        code += `    ${outputName} = 0.0;\n`
        code += `    for (int i = 0; i < ${inParsed.rows}; i++) {\n`
        code += `        for (int j = 0; j < ${inParsed.cols}; j++) {\n`
        code += `            ${outputName} += ${term('[i][j]')};\n`
        code += `        }\n    }\n`
        return code
      }
      if (inParsed.isArray && inParsed.arraySize) {
        let code = `    // Sum of Elements (vector[${inParsed.arraySize}] → scalar)\n`
        code += `    ${outputName} = 0.0;\n`
        code += `    for (int i = 0; i < ${inParsed.arraySize}; i++) {\n`
        code += `        ${outputName} += ${term('[i]')};\n`
        code += `    }\n`
        return code
      }
      // Scalar single input: passthrough with sign
      return `    ${outputName} = ${sign === '-' ? `-(${inputs[0]})` : inputs[0]};\n`
    }

    // Prefer dimensional input as shape (scalar±vector → vector)
    const outputType =
      (inputTypes || []).find(t => t && t.includes('[')) ||
      (inputTypes && inputTypes.length > 0
        ? this.getOutputType(block, inputTypes)
        : 'double')

    let parsedType: ParsedType
    try {
      parsedType = parseType(outputType)
    } catch (error) {
      console.warn(`Invalid output type for sum block ${block.name}: ${outputType}`)
      parsedType = { baseType: 'double', isArray: false, isMatrix: false }
    }

    if (parsedType.isMatrix && parsedType.rows && parsedType.cols) {
      let code = `    // Matrix addition with signs (${parsedType.rows}×${parsedType.cols})\n`
      code += `    for (int i = 0; i < ${parsedType.rows}; i++) {\n`
      code += `        for (int j = 0; j < ${parsedType.cols}; j++) {\n`
      code += `            ${outputName}[i][j] = `

      for (let k = 0; k < inputs.length; k++) {
        const sign = signs[k] || '+'
        if (k > 0) code += ` ${sign} `
        else if (sign === '-') code += `-`
        code += access(inputs[k], inputTypes?.[k], '[i][j]')
      }

      code += `;\n        }\n    }\n`
      return code
    } else if (parsedType.isArray && parsedType.arraySize) {
      let code = `    // Vector addition with signs (size ${parsedType.arraySize})\n`
      code += `    for (int i = 0; i < ${parsedType.arraySize}; i++) {\n`
      code += `        ${outputName}[i] = `

      for (let k = 0; k < inputs.length; k++) {
        const sign = signs[k] || '+'
        if (k > 0) code += ` ${sign} `
        else if (sign === '-') code += `-`
        code += access(inputs[k], inputTypes?.[k], '[i]')
      }

      code += `;\n    }\n`
      return code
    } else {
      // Scalar addition with signs
      let computation = `${outputName} = `
      
      for (let i = 0; i < inputs.length; i++) {
        const sign = signs[i] || '+'
        if (i > 0) computation += ` ${sign} `
        else if (sign === '-') computation += `-`
        computation += inputs[i]
      }
      
      return `    ${computation};\n`
    }
  }

  getOutputType(block: BlockData, inputTypes: string[]): string {
    const known = inputTypes.filter(t => !!t && t.length > 0)
    if (known.length === 0) return 'double'

    // Sum of Elements: vector/matrix → scalar base type
    if (isSumOfElements(block) && known.length === 1) {
      try {
        const p = parseType(known[0])
        if (p.isArray || p.isMatrix) return p.baseType
      } catch {
        /* fall through */
      }
      return known[0]
    }

    // Multi-input: same-shaped vectors/matrices stay that shape (element-wise)
    const dim = known.find(t => t.includes('['))
    if (dim) return dim
    return known[0]
  }

  generateStructMember(block: BlockData, outputType: string): string | null {
    // Sum blocks always need signal storage
    return BlockModuleUtils.generateStructMember(block.name, outputType)
  }

  requiresState(block: BlockData): boolean {
    // Sum blocks don't need state variables
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
    // Port count based on signs length or numInputs
    if (block.parameters?.signs) {
      return block.parameters.signs.length
    }
    return block.parameters?.numInputs || block.parameters?.inputCount || 2
  }

  getOutputPortCount(block: BlockData): number {
    // Sum blocks always have exactly 1 output
    return 1
  }
}