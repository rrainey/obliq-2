// lib/blocks/SourceBlockModule.ts

import { BlockData } from '@/components/BlockNode'
import { IBlockModule, BlockModuleUtils } from './BlockModule'
import { toC99Initializer } from '@/lib/c99InitializerValidator'

// Signal types that only support scalar output
const SCALAR_ONLY_SIGNAL_TYPES = ['step', 'ramp', 'sine']

export class SourceBlockModule implements IBlockModule {
  generateComputation(block: BlockData, inputs: string[]): string {
    const outputName = `model->signals.${BlockModuleUtils.sanitizeIdentifier(block.name)}`
    const signalType = block.parameters?.signalType || 'constant'
    const dataType = block.parameters?.dataType || 'double'

    // Use typeValidator for parsing - no regex
    const typeInfo = BlockModuleUtils.parseType(dataType)

    let code = `    // Source block: ${block.name} (${signalType})\n`

    // Validate scalar-only signal types
    if (SCALAR_ONLY_SIGNAL_TYPES.includes(signalType)) {
      if (typeInfo.isArray || typeInfo.isMatrix) {
        code += `    // ERROR: ${signalType} signal type only supports scalar data types\n`
        code += `    // Current dataType "${dataType}" is not supported for ${signalType}\n`
        code += `    ${outputName} = 0.0; // Fallback due to unsupported type\n`
        return code
      }
    }

    if (signalType === 'constant') {
      // Check if this constant uses a parameter reference
      const useParameter = block.parameters?.useParameter
      const parameterName = block.parameters?.parameterName

      if (useParameter && parameterName) {
        // HeaderGenerator always defines PARAM_<name> (aliases bare #define when
        // there is no signal name collision; uses PARAM_ only when there is).
        const paramIdent = `PARAM_${BlockModuleUtils.sanitizeIdentifier(String(parameterName))}`
        code += `    // Using parameter: ${parameterName} → ${paramIdent}\n`

        if (typeInfo.isMatrix && typeInfo.rows && typeInfo.cols) {
          // Matrix parameter - copy element by element
          for (let i = 0; i < typeInfo.rows; i++) {
            for (let j = 0; j < typeInfo.cols; j++) {
              code += `    ${outputName}[${i}][${j}] = ${paramIdent}[${i}][${j}];\n`
            }
          }
        } else if (typeInfo.isArray && typeInfo.arraySize) {
          // Vector parameter - copy element by element
          for (let i = 0; i < typeInfo.arraySize; i++) {
            code += `    ${outputName}[${i}] = ${paramIdent}[${i}];\n`
          }
        } else {
          // Scalar parameter
          code += `    ${outputName} = ${paramIdent};\n`
        }
      } else {
        // Pure literal constant - already initialized in _init(), no need to reassign every step
        // This is an optimization: constant values don't change during simulation
        code += `    // (constant value initialized in _init)\n`
      }
    } else if (signalType === 'step') {
      // Step signal: 0 before stepTime, stepValue after stepTime
      const stepTime = block.parameters?.stepTime ?? 1.0
      const stepValue = block.parameters?.stepValue ?? 1.0
      // Use toC99Initializer for proper literal formatting
      const c99StepTime = toC99Initializer(stepTime, 'double')
      const c99StepValue = toC99Initializer(stepValue, 'double')
      code += `    ${outputName} = (model->time >= ${c99StepTime}) ? ${c99StepValue} : 0.0;\n`
    } else if (signalType === 'ramp') {
      // Ramp signal: startValue + slope * time
      const startValue = block.parameters?.startValue ?? 0.0
      const slope = block.parameters?.slope ?? 1.0
      const c99StartValue = toC99Initializer(startValue, 'double')
      const c99Slope = toC99Initializer(slope, 'double')
      code += `    ${outputName} = ${c99StartValue} + ${c99Slope} * model->time;\n`
    } else if (signalType === 'sine') {
      // Sine signal: amplitude * sin(2 * PI * frequency * time)
      const frequency = block.parameters?.frequency ?? 1.0
      const amplitude = block.parameters?.amplitude ?? 1.0
      // Pre-compute omega (2 * PI * frequency) for efficiency
      const omega = 2.0 * Math.PI * frequency
      const c99Amplitude = toC99Initializer(amplitude, 'double')
      const c99Omega = toC99Initializer(omega, 'double')
      code += `    ${outputName} = ${c99Amplitude} * sin(${c99Omega} * model->time);\n`
    } else if (signalType === 'sample_time') {
      // Simulink Sample Time Math "Ts Only": weightValue * simulation step (seconds)
      const weight = Number(block.parameters?.weightValue ?? 1)
      const w = Number.isFinite(weight) ? weight : 1
      const c99W = toC99Initializer(w, 'double')
      code += `    ${outputName} = ${c99W} * model->dt;\n`
    } else {
      // Other signal generators not yet implemented
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
    // sample_time is stateless (reads model->dt each step), like a live constant
    return signalType !== 'constant' && signalType !== 'sample_time'
  }

  generateStateStructMembers(block: BlockData, outputType: string): string[] {
    const signalType = block.parameters?.signalType || 'constant'
    if (signalType === 'constant' || signalType === 'sample_time') {
      return []
    }
    
    // For signal generators, we might need to track phase or other state
    const blockName = BlockModuleUtils.sanitizeIdentifier(block.name)
    return [`    double ${blockName}_phase;`]
  }

  generateInitialization(block: BlockData): string {
    const signalType = block.parameters?.signalType || 'constant'
    if (signalType === 'constant' || signalType === 'sample_time') {
      return ''
    }
    
    const blockName = BlockModuleUtils.sanitizeIdentifier(block.name)
    return `    model->states.${blockName}_phase = 0.0;\n`
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