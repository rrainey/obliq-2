// lib/blocks/InputPortBlockModule.ts

import { BlockData } from '@/components/BlockNode'
import { IBlockModule, BlockModuleUtils } from './BlockModule'

export class InputPortBlockModule implements IBlockModule {
  generateComputation(block: BlockData, inputs: string[]): string {
    const blockName = BlockModuleUtils.sanitizeIdentifier(block.name)
    const portName = block.parameters?.portName || block.name
    const safePortName = BlockModuleUtils.sanitizeIdentifier(portName)
    const dataType = block.parameters?.dataType || 'double'
    const typeInfo = BlockModuleUtils.parseType(dataType)
    
    let code = `    // Input port: ${block.name}\n`
    code += `    // Copy input port value to signals for internal use\n`
    
    if (typeInfo.isMatrix && typeInfo.rows && typeInfo.cols) {
      // Matrix copy using memcpy
      code += `    memcpy(model->signals.${blockName}, model->inputs.${safePortName}, `
      code += `sizeof(model->signals.${blockName}));\n`
    } else if (typeInfo.isArray && typeInfo.arraySize) {
      // Array copy using memcpy
      code += `    memcpy(model->signals.${blockName}, model->inputs.${safePortName}, `
      code += `sizeof(model->signals.${blockName}));\n`
    } else {
      // Scalar copy
      code += `    model->signals.${blockName} = model->inputs.${safePortName};\n`
    }
    
    return code
  }

  getOutputType(block: BlockData, inputTypes: string[]): string {
    // Input port type is defined by its dataType parameter
    return block.parameters?.dataType || 'double'
  }

  generateStructMember(block: BlockData, outputType: string): string | null {
    // Input ports always need signal storage
    return BlockModuleUtils.generateStructMember(block.name, outputType)
  }

  requiresState(block: BlockData): boolean {
    // Input ports don't need state
    return false
  }

  generateStateStructMembers(block: BlockData, outputType: string): string[] {
    // No state needed for input ports
    return []
  }

  generateInitialization(block: BlockData): string {
    // Generate initialization for the input value
    const portName = block.parameters?.portName || block.name
    const safePortName = BlockModuleUtils.sanitizeIdentifier(portName)
    const dataType = block.parameters?.dataType || 'double'
    const defaultValue = block.parameters?.defaultValue || 0
    const typeInfo = BlockModuleUtils.parseType(dataType)
    
    let code = ''
    
    if (typeInfo.isMatrix && typeInfo.rows && typeInfo.cols) {
      // Initialize matrix with nested loops
      code += `    // Initialize input port: ${portName}\n`
      code += `    for (int i = 0; i < ${typeInfo.rows}; i++) {\n`
      code += `        for (int j = 0; j < ${typeInfo.cols}; j++) {\n`
      code += `            model->inputs.${safePortName}[i][j] = ${defaultValue};\n`
      code += `        }\n`
      code += `    }\n`
    } else if (typeInfo.isArray && typeInfo.arraySize) {
      // Initialize array
      code += `    // Initialize input port: ${portName}\n`
      code += `    for (int i = 0; i < ${typeInfo.arraySize}; i++) {\n`
      code += `        model->inputs.${safePortName}[i] = ${defaultValue};\n`
      code += `    }\n`
    } else {
      // Initialize scalar
      code += `    // Initialize input port: ${portName}\n`
      code += `    model->inputs.${safePortName} = ${defaultValue};\n`
    }
    
    return code
  }
}