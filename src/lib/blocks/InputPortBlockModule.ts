// lib/blocks/InputPortBlockModule.ts

import { BlockData } from '@/components/BlockNode'
import { BlockState, SimulationState } from '@/lib/simulationEngine'
import { IBlockModule, BlockModuleUtils } from './BlockModule'

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
    // Input ports have their type defined in parameters
    const dataType = block.parameters?.dataType
    if (dataType && typeof dataType === 'string') {
      return dataType
    }
    return 'double' // Default
  }

  generateStructMember(block: BlockData, outputType: string): string | null {
    // Input port blocks always need signal storage
    return BlockModuleUtils.generateStructMember(block.name, outputType)
  }

  requiresState(block: BlockData): boolean {
    // Input ports don't have state
    return false
  }

  generateStateStructMembers(block: BlockData, outputType: string): string[] {
    // No state needed
    return []
  }

  executeSimulation(
    blockState: BlockState,
    inputs: (number | number[] | boolean | boolean[] | number[][])[],
    simulationState: SimulationState
  ): void {
    /*
    console.log(`InputPort ${blockState.blockId} before execution:`, {
      outputs: blockState.outputs,
      portName: blockState.blockData?.parameters?.portName
    });
    */
    
    // Check if the output has already been set (e.g., by setTestInputs)
    // If so, we should use that value instead of the default
    if (blockState.outputs.length > 0 && blockState.outputs[0] !== undefined) {
      // Value already set, likely by test inputs - keep it
      //console.log(`InputPort ${blockState.blockId} keeping existing value:`, blockState.outputs[0]);
      return
    }
    
    // Otherwise, use the default value
    const portName = blockState.blockData?.parameters?.portName || 'Input'
    const dataType = blockState.blockData?.parameters?.dataType || 'double'
    const defaultValue = blockState.blockData?.parameters?.defaultValue || 0
    
    // For the modular block system, we output the default value
    // The simulation engine or adapter will override this with test inputs if needed
    if (dataType.includes('[')) {
      // For array types, create array filled with default
      const parsed = BlockModuleUtils.parseType(dataType)
      if (parsed.isMatrix && parsed.rows && parsed.cols) {
        // Create matrix
        const matrix: number[][] = []
        for (let i = 0; i < parsed.rows; i++) {
          matrix[i] = new Array(parsed.cols).fill(defaultValue)
        }
        blockState.outputs[0] = matrix
      } else if (parsed.isArray && parsed.arraySize) {
        // Create vector
        blockState.outputs[0] = new Array(parsed.arraySize).fill(defaultValue)
      } else {
        blockState.outputs[0] = defaultValue
      }
    } else {
      blockState.outputs[0] = defaultValue
    }
    
    // Update internal state for tracking
    if (!blockState.internalState) {
      blockState.internalState = {}
    }
    blockState.internalState.portName = portName
    blockState.internalState.dataType = dataType
    blockState.internalState.defaultValue = defaultValue
    blockState.internalState.isConnectedToParent = false
  }

  getInputPortCount(block: BlockData): number {
    // Input ports have 0 inputs (they're sources in the graph)
    return 0
  }

  getOutputPortCount(block: BlockData): number {
    // Input ports have exactly 1 output
    return 1
  }
}