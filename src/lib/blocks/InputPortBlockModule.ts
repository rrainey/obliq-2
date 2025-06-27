// lib/blocks/InputPortBlockModule.ts

import { BlockData } from '@/components/BlockNode'
import { BlockState, SimulationState } from '@/lib/simulationEngine'
import { IBlockModule, BlockModuleUtils } from './BlockModule'
import { parseType, ParsedType } from '@/lib/typeValidator'

export class InputPortBlockModule implements IBlockModule {
  generateComputation(block: BlockData, inputs: string[]): string {
    const outputName = `model->signals.${BlockModuleUtils.sanitizeIdentifier(block.name)}`
    const portName = block.parameters?.portName || 'Input'
    const safeName = BlockModuleUtils.sanitizeIdentifier(portName)
    const dataType = block.parameters?.dataType || 'double'
    
    // Parse the data type to check if it's an array or matrix
    const typeInfo = BlockModuleUtils.parseType(dataType)
    
    let code = `    // Input port: ${portName}\n`
    
    if (typeInfo.isMatrix && typeInfo.rows && typeInfo.cols) {
      // Copy matrix from inputs
      code += `    for (int i = 0; i < ${typeInfo.rows}; i++) {\n`
      code += `        for (int j = 0; j < ${typeInfo.cols}; j++) {\n`
      code += `            ${outputName}[i][j] = model->inputs.${safeName}[i][j];\n`
      code += `        }\n`
      code += `    }\n`
    } else if (typeInfo.isArray && typeInfo.arraySize) {
      // Copy array from inputs
      code += `    for (int i = 0; i < ${typeInfo.arraySize}; i++) {\n`
      code += `        ${outputName}[i] = model->inputs.${safeName}[i];\n`
      code += `    }\n`
    } else {
      // Copy scalar from inputs
      code += `    ${outputName} = model->inputs.${safeName};\n`
    }
    
    return code
  }

  getOutputType(block: BlockData, inputTypes: string[]): string {
    // Input port output type is defined by its dataType parameter
    return block.parameters?.dataType || 'double'
  }

  generateStructMember(block: BlockData, outputType: string): string | null {
    // Input port blocks always need signal storage
    return BlockModuleUtils.generateStructMember(block.name, outputType)
  }

  requiresState(block: BlockData): boolean {
    // Input port blocks don't need state variables
    return false
  }

  generateStateStructMembers(block: BlockData, outputType: string): string[] {
    // No state needed
    return []
  }

  generateInitialization(block: BlockData): string {
    // No initialization needed - values come from external inputs
    return ''
  }

  executeSimulation(
    blockState: BlockState,
    inputs: (number | number[] | boolean | boolean[] | number[][])[],
    simulationState: SimulationState
  ): void {
    // Input ports represent external inputs from parent subsystem/model
    const defaultValue = blockState.internalState?.defaultValue || 0
    const portName = blockState.internalState?.portName || `Input_${blockState.blockId}`
    const dataType = blockState.internalState?.dataType || 'double'
    
    // Parse the data type to check if it's a vector or matrix
    let parsedType: ParsedType | null = null
    try {
      parsedType = parseType(dataType)
    } catch {
      parsedType = { baseType: 'double', isArray: false }
    }
    
    // Check if there's an external input value provided
    // In the context of the modular system, we need to access the simulation engine's
    // external input provider through the simulation state
    const externalValue = (simulationState as any).getExternalInput?.(portName) ?? defaultValue
    
    // For matrix types, ensure we have an array
    if (parsedType.isMatrix && parsedType.rows && parsedType.cols) {
      if (Array.isArray(externalValue) && Array.isArray(externalValue[0])) {
        blockState.outputs[0] = externalValue
      } else {
        // Create matrix filled with the default value
        const matrix: number[][] = []
        for (let i = 0; i < parsedType.rows; i++) {
          matrix[i] = new Array(parsedType.cols).fill(
            typeof externalValue === 'number' ? externalValue : defaultValue
          )
        }
        blockState.outputs[0] = matrix
      }
    } else if (parsedType.isArray && parsedType.arraySize) {
      // For vector types, ensure we have an array
      if (Array.isArray(externalValue)) {
        blockState.outputs[0] = externalValue
      } else {
        // Create array filled with the scalar value
        blockState.outputs[0] = new Array(parsedType.arraySize).fill(externalValue)
      }
    } else {
      blockState.outputs[0] = externalValue
    }
    
    // Update internal state for tracking
    blockState.internalState = {
      ...blockState.internalState,
      portName,
      dataType,
      defaultValue,
      isConnectedToParent: false // Would be true in subsystem context
    }
  }

  getInputPortCount(block: BlockData): number {
    // Input port blocks have no input ports (they are sources)
    return 0
  }

  getOutputPortCount(block: BlockData): number {
    // Input port blocks always have exactly 1 output
    return 1
  }

}