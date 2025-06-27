// lib/blocks/SourceBlockModule.ts

import { BlockData } from '@/components/BlockNode'
import { BlockState, SimulationState } from '@/lib/simulationEngine'
import { IBlockModule, BlockModuleUtils } from './BlockModule'
import { parseType, ParsedType } from '@/lib/typeValidator'

export class SourceBlockModule implements IBlockModule {
  generateComputation(block: BlockData, inputs: string[]): string {
    const outputName = `model->signals.${BlockModuleUtils.sanitizeIdentifier(block.name)}`
    const signalType = block.parameters?.signalType || 'constant'
    const dataType = block.parameters?.dataType || 'double'
    const typeInfo = BlockModuleUtils.parseType(dataType)
    
    let code = `    // Source block: ${block.name} (${signalType})\n`
    
    if (signalType === 'constant') {
      // For constants, use the value directly
      const value = block.parameters?.value
      
      if (typeInfo.isMatrix && Array.isArray(value) && Array.isArray(value[0])) {
        // Matrix constant
        code += `    // Matrix constant\n`
        for (let i = 0; i < value.length; i++) {
          for (let j = 0; j < value[i].length; j++) {
            code += `    ${outputName}[${i}][${j}] = ${value[i][j]};\n`
          }
        }
      } else if (typeInfo.isArray && Array.isArray(value)) {
        // Vector constant
        code += `    // Vector constant\n`
        for (let i = 0; i < value.length; i++) {
          code += `    ${outputName}[${i}] = ${value[i]};\n`
        }
      } else {
        // Scalar constant
        const constantValue = value !== undefined ? value : 0
        code += `    ${outputName} = ${constantValue};\n`
      }
    } else {
      // For signal generators, we need to implement the signal generation
      // This is a simplified version - real implementation would need time tracking
      code += `    // Signal generator type: ${signalType}\n`
      code += `    // TODO: Implement ${signalType} signal generation\n`
      code += `    ${outputName} = 0.0; // Placeholder\n`
    }
    
    return code
  }

  getOutputType(block: BlockData, inputTypes: string[]): string {
    // Source block output type is defined by its dataType parameter
    return block.parameters?.dataType || 'double'
  }

  generateStructMember(block: BlockData, outputType: string): string | null {
    // Source blocks always need signal storage
    return BlockModuleUtils.generateStructMember(block.name, outputType)
  }

  requiresState(block: BlockData): boolean {
    // Source blocks might need state for signal generation
    const signalType = block.parameters?.signalType || 'constant'
    return signalType !== 'constant'
  }

  generateStateStructMembers(block: BlockData, outputType: string): string[] {
    const signalType = block.parameters?.signalType || 'constant'
    if (signalType === 'constant') {
      return []
    }
    
    // For signal generators, we might need to track phase or other state
    const blockName = BlockModuleUtils.sanitizeIdentifier(block.name)
    return [`    double ${blockName}_phase;`]
  }

  generateInitialization(block: BlockData): string {
    const signalType = block.parameters?.signalType || 'constant'
    if (signalType === 'constant') {
      return ''
    }
    
    const blockName = BlockModuleUtils.sanitizeIdentifier(block.name)
    return `    model->states.${blockName}_phase = 0.0;\n`
  }

  executeSimulation(
    blockState: BlockState,
    inputs: (number | number[] | boolean | boolean[] | number[][])[],
    simulationState: SimulationState
  ): void {
    // Source blocks are signal generators
    const { signalType, dataType } = blockState.internalState
    
    // Parse the data type to check if it's a vector or matrix
    let parsedType: ParsedType | null = null
    try {
      parsedType = parseType(dataType || 'double')
    } catch {
      parsedType = { baseType: 'double', isArray: false }
    }
    
    // For constant signal type with vectors or matrices, use the value directly
    if (signalType === 'constant') {
    
        if (Array.isArray(blockState.internalState.value)) {
            // Output the vector
            blockState.outputs[0] = [...blockState.internalState.value]
            return
        } else {
            // Output scalar value
            blockState.outputs[0] = blockState.internalState.value
            return
        }
      }    

    console.log(`ERROR: Should not reach here for constant array signal!`)
    
    // Generate the signal value (for scalars or non-constant vectors)
    let scalarValue = 0
    const constantValue = blockState.internalState.constantValue || 0
    const time = simulationState.time
    
    switch (signalType) {
      case 'constant':
        scalarValue = constantValue
        break
        
      case 'step':
        const stepTime = blockState.internalState.stepTime || 1.0
        const stepValue = blockState.internalState.stepValue || constantValue
        scalarValue = time >= stepTime ? stepValue : 0
        break
        
      case 'ramp':
        const rampSlope = blockState.internalState.slope || 1.0
        const rampStart = blockState.internalState.startTime || 0
        scalarValue = time >= rampStart ? 
          rampSlope * (time - rampStart) : 0
        break
        
      case 'sine':
        const frequency = blockState.internalState.frequency || 1.0
        const amplitude = blockState.internalState.amplitude || 1.0
        const phase = blockState.internalState.phase || 0
        const offset = blockState.internalState.offset || 0
        scalarValue = offset + amplitude * Math.sin(2 * Math.PI * frequency * time + phase)
        break
        
      case 'square':
        const squareFreq = blockState.internalState.frequency || 1.0
        const squareAmplitude = blockState.internalState.amplitude || 1.0
        const period = 1.0 / squareFreq
        const squarePhase = (time % period) / period
        scalarValue = squarePhase < 0.5 ? squareAmplitude : -squareAmplitude
        break
        
      case 'triangle':
        const triFreq = blockState.internalState.frequency || 1.0
        const triAmplitude = blockState.internalState.amplitude || 1.0
        const triPeriod = 1.0 / triFreq
        const triPhase = (time % triPeriod) / triPeriod
        if (triPhase < 0.5) {
          scalarValue = triAmplitude * (4 * triPhase - 1)
        } else {
          scalarValue = triAmplitude * (3 - 4 * triPhase)
        }
        break
        
      case 'noise':
        const noiseAmplitude = blockState.internalState.amplitude || 0.1
        const noiseMean = blockState.internalState.mean || 0
        // Simple uniform noise
        scalarValue = noiseMean + noiseAmplitude * (Math.random() - 0.5) * 2
        break
        
      case 'chirp':
        const f0 = blockState.internalState.f0 || 0.1 // Start frequency
        const f1 = blockState.internalState.f1 || 10  // End frequency
        const duration = blockState.internalState.duration || 10
        const chirpAmplitude = blockState.internalState.amplitude || 1.0
        const t = Math.min(time, duration)
        const freq = f0 + (f1 - f0) * t / duration
        scalarValue = chirpAmplitude * Math.sin(2 * Math.PI * freq * t)
        break
        
      default:
        scalarValue = constantValue
    }
    
    // Apply to vector or matrix if needed (for non-constant signal types)
    if (parsedType.isMatrix && parsedType.rows && parsedType.cols) {
      // For matrix output, create a matrix filled with the signal value
      const matrix: number[][] = []
      for (let i = 0; i < parsedType.rows; i++) {
        matrix[i] = new Array(parsedType.cols).fill(scalarValue)
      }
      blockState.outputs[0] = matrix
    } else if (parsedType.isArray && parsedType.arraySize) {
      // For vector output, apply the same signal to all elements
      blockState.outputs[0] = new Array(parsedType.arraySize).fill(scalarValue)
    } else {
      blockState.outputs[0] = scalarValue
    }
  }

  getInputPortCount(block: BlockData): number {
    // Source blocks have no input ports (they are sources)
    return 0
  }

  getOutputPortCount(block: BlockData): number {
    // Source blocks always have exactly 1 output
    return 1
  }

}