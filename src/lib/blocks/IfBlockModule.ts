// lib/blocks/IfBlockModule.ts

import { BlockData } from '@/components/BlockNode'
import { BlockState, SimulationState } from '@/lib/simulationTypes'
import { IBlockModule, BlockModuleUtils } from './BlockModule'
import { SignalValue } from '@/lib/modelSchema'

export class IfBlockModule implements IBlockModule {
  generateComputation(block: BlockData, inputs: string[], inputTypes?: string[]): string {
    const outputName = `model->signals.${BlockModuleUtils.sanitizeIdentifier(block.name)}`
    
    let code = `    // If block: ${block.name}\n`
    
    if (inputs.length < 3) {
      code += `    // Error: If block requires 3 inputs (input1, control, input2)\n`
      return code
    }
    
    const input1 = inputs[0]
    const control = inputs[1]
    const input2 = inputs[2]

    // Simulink Switch Criteria (mdl2obliq sets switchCriteria / switchThreshold)
    const switchCriteria = String(
      (block.parameters as Record<string, unknown> | undefined)?.switchCriteria ?? ''
    ).trim()
    const switchThreshold = Number(
      (block.parameters as Record<string, unknown> | undefined)?.switchThreshold ?? 0
    )
    const thrLit = Number.isFinite(switchThreshold) ? String(switchThreshold) : '0'
    let controlTest = control
    if (switchCriteria === 'u2 >= Threshold') {
      controlTest = `((${control}) >= (${thrLit}))`
    } else if (switchCriteria === 'u2 > Threshold') {
      controlTest = `((${control}) > (${thrLit}))`
    }
    // else: u2 ~= 0 / unset → C truthy (nonzero), matching historical Obliq if
    
    // Prefer a dimensional data-path type (ports 0 or 2); control is often bool/scalar
    const types = inputTypes || []
    const dataType =
      (types[0] && types[0].includes('[') && types[0]) ||
      (types[2] && types[2].includes('[') && types[2]) ||
      types[0] ||
      types[2] ||
      'double'
    const outputType = dataType
    const typeInfo = BlockModuleUtils.parseType(outputType)
    
    code += `    // If control is true/nonzero, output = input2, else output = input1\n`
    if (switchCriteria) {
      code += `    // Switch criteria: ${switchCriteria} (threshold=${thrLit})\n`
    }
    
    if (typeInfo.isMatrix && typeInfo.rows && typeInfo.cols) {
      const matAcc = (expr: string, typ: string) => {
        if (!expr || expr === '0.0' || /^[-+]?[0-9]/.test(expr)) return '0.0'
        if (typ.includes('[')) return `${expr}[i][j]`
        return `(${expr})`
      }
      const t0 = types[0] || ''
      const t2 = types[2] || ''
      code += `    if (${controlTest}) {\n`
      code += `        for (int i = 0; i < ${typeInfo.rows}; i++) {\n`
      code += `            for (int j = 0; j < ${typeInfo.cols}; j++) {\n`
      code += `                ${outputName}[i][j] = ${matAcc(input2, t2)};\n`
      code += `            }\n`
      code += `        }\n`
      code += `    } else {\n`
      code += `        for (int i = 0; i < ${typeInfo.rows}; i++) {\n`
      code += `            for (int j = 0; j < ${typeInfo.cols}; j++) {\n`
      code += `                ${outputName}[i][j] = ${matAcc(input1, t0)};\n`
      code += `            }\n`
      code += `        }\n`
      code += `    }\n`
    } else if (typeInfo.isArray && typeInfo.arraySize) {
      // Vector conditional copy (broadcast scalar arms like Ground / 0.0)
      const t0 = types[0] || ''
      const t2 = types[2] || ''
      const acc = (expr: string, typ: string) => {
        if (!expr || expr === '0.0' || /^[-+]?[0-9]/.test(expr)) return '(0.0)'
        if (typ.includes('[')) return `${expr}[i]`
        return `(${expr})`
      }
      code += `    if (${controlTest}) {\n`
      code += `        // Copy input2 to output\n`
      code += `        for (int i = 0; i < ${typeInfo.arraySize}; i++) {\n`
      code += `            ${outputName}[i] = ${acc(input2, t2)};\n`
      code += `        }\n`
      code += `    } else {\n`
      code += `        // Copy input1 to output\n`
      code += `        for (int i = 0; i < ${typeInfo.arraySize}; i++) {\n`
      code += `            ${outputName}[i] = ${acc(input1, t0)};\n`
      code += `        }\n`
      code += `    }\n`
    } else {
      // Scalar conditional assignment
      code += `    ${outputName} = ${controlTest} ? ${input2} : ${input1};\n`
    }
    
    return code
  }

  getOutputType(block: BlockData, inputTypes: string[]): string {
    // Prefer dimensional data path (false/true inputs); control is often scalar
    const a = inputTypes[0]
    const b = inputTypes[2]
    if (a && a.includes('[')) return a
    if (b && b.includes('[')) return b
    if (a) return a
    if (b) return b
    return 'double'
  }

  generateStructMember(block: BlockData, outputType: string): string | null {
    return BlockModuleUtils.generateStructMember(block.name, outputType)
  }

  requiresState(block: BlockData): boolean {
    return false
  }

  generateStateStructMembers(block: BlockData, outputType: string): string[] {
    return []
  }

  getInputPortCount(block: BlockData): number {
    return 3
  }

  getOutputPortCount(block: BlockData): number {
    return 1
  }

  getInputPortLabels(block: BlockData): string[] | undefined {
    return ['input1', 'control', 'input2']
  }
}