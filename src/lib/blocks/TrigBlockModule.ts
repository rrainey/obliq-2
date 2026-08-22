// lib/blocks/TrigBlockModule.ts

import { BlockData } from '@/components/BlockNode'
import { BlockState, SimulationState } from '@/lib/simulationTypes'
import { IBlockModule, BlockModuleUtils } from './BlockModule'

export class TrigBlockModule implements IBlockModule {
  generateComputation(
    block: BlockData,
    inputs: string[],
    inputTypes?: string[]
  ): string {
    const outputName = `model->signals.${BlockModuleUtils.sanitizeIdentifier(block.name)}`
    const func = block.parameters?.function || 'sin'
    const inType = inputTypes?.[0] || 'double'
    const typeInfo = BlockModuleUtils.parseType(inType)
    const vecSize =
      typeInfo.isArray && typeInfo.arraySize
        ? typeInfo.arraySize
        : typeInfo.isMatrix && typeInfo.rows && typeInfo.cols === 1
          ? typeInfo.rows
          : 0

    let code = `    // Trig block: ${block.name} (${func})\n`

    if (func === 'atan2') {
      if (inputs.length < 2) {
        code += `    ${outputName} = 0.0; // Error: atan2 requires 2 inputs\n`
      } else {
        code += `    ${outputName} = atan2(${inputs[0]}, ${inputs[1]});\n`
      }
    } else if (func === 'sincos') {
      const base = BlockModuleUtils.sanitizeIdentifier(block.name)
      const outSin = `model->signals.${base}_sin`
      const outCos = `model->signals.${base}_cos`
      if (inputs.length === 0) {
        if (vecSize > 0) {
          for (let i = 0; i < vecSize; i++) {
            code += `    ${outSin}[${i}] = 0.0;\n`
            code += `    ${outCos}[${i}] = 1.0;\n`
          }
        } else {
          code += `    ${outSin} = 0.0; // No input\n`
          code += `    ${outCos} = 1.0; // No input\n`
        }
      } else if (vecSize > 0) {
        // aerolib SinCos vectorized: element-wise sin/cos
        for (let i = 0; i < vecSize; i++) {
          code += `    ${outSin}[${i}] = sin(${inputs[0]}[${i}]);\n`
          code += `    ${outCos}[${i}] = cos(${inputs[0]}[${i}]);\n`
        }
      } else {
        code += `    ${outSin} = sin(${inputs[0]});\n`
        code += `    ${outCos} = cos(${inputs[0]});\n`
      }
    } else {
      if (inputs.length === 0) {
        code += `    ${outputName} = 0.0; // No input\n`
      } else if (vecSize > 0) {
        for (let i = 0; i < vecSize; i++) {
          const fn =
            func === 'cos' ? 'cos' : func === 'atan' ? 'atan' : 'sin'
          code += `    ${outputName}[${i}] = ${fn}(${inputs[0]}[${i}]);\n`
        }
      } else {
        switch (func) {
          case 'sin':
            code += `    ${outputName} = sin(${inputs[0]});\n`
            break
          case 'cos':
            code += `    ${outputName} = cos(${inputs[0]});\n`
            break
          case 'asin':
            code += `    ${outputName} = asin(${inputs[0]});\n`
            break
          case 'acos':
            code += `    ${outputName} = acos(${inputs[0]});\n`
            break
          case 'atan':
            code += `    ${outputName} = atan(${inputs[0]});\n`
            break
          case 'tan':
            code += `    ${outputName} = tan(${inputs[0]});\n`
            break
          default:
            code += `    ${outputName} = 0.0; // Unknown function: ${func}\n`
        }
      }
    }

    return code
  }

  getOutputType(block: BlockData, inputTypes: string[]): string {
    // Preserve vector shape for vectorized aerolib SinCos / element-wise trig
    if (inputTypes[0] && inputTypes[0].includes('[')) {
      return inputTypes[0]
    }
    return 'double'
  }

  generateStructMember(block: BlockData, outputType: string): string | null {
    const func = block.parameters?.function || 'sin'
    const typeInfo = BlockModuleUtils.parseType(outputType || 'double')
    const size =
      typeInfo.isArray && typeInfo.arraySize
        ? typeInfo.arraySize
        : typeInfo.isMatrix && typeInfo.rows && typeInfo.cols === 1
          ? typeInfo.rows
          : 0

    if (func === 'sincos') {
      const base = BlockModuleUtils.sanitizeIdentifier(block.name)
      if (size > 0) {
        return `    double ${base}_sin[${size}];\n    double ${base}_cos[${size}];`
      }
      return `    double ${base}_sin;\n    double ${base}_cos;`
    }
    return BlockModuleUtils.generateStructMember(block.name, outputType)
  }

  requiresState(block: BlockData): boolean {
    return false
  }

  generateStateStructMembers(block: BlockData, outputType: string): string[] {
    return []
  }

  generateInitialization(block: BlockData): string {
    return ''
  }

  getInputPortCount(block: BlockData): number {
    const func = block.parameters?.function || 'sin'
    return func === 'atan2' ? 2 : 1
  }

  getOutputPortCount(block: BlockData): number {
    const func = block.parameters?.function || 'sin'
    return func === 'sincos' ? 2 : 1
  }

  getInputPortLabels(block: BlockData): string[] | undefined {
    const func = block.parameters?.function || 'sin'
    if (func === 'atan2') {
      return ['y', 'x']
    }
    return ['input1']
  }

  getOutputPortLabels(block: BlockData): string[] | undefined {
    const func = block.parameters?.function || 'sin'
    if (func === 'sincos') {
      return ['sin', 'cos']
    }
    return ['output 1']
  }
}
