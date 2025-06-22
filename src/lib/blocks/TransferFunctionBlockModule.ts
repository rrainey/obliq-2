// lib/blocks/TransferFunctionBlockModule.ts

import { BlockData } from '@/components/BlockNode'
import { IBlockModule, BlockModuleUtils } from './BlockModule'

export class TransferFunctionBlockModule implements IBlockModule {
  generateComputation(block: BlockData, inputs: string[]): string {
    const outputName = `model->signals.${BlockModuleUtils.sanitizeIdentifier(block.name)}`
    const tfName = BlockModuleUtils.sanitizeIdentifier(block.name)
    const denominator = block.parameters?.denominator || [1, 1]
    const stateOrder = Math.max(0, denominator.length - 1)
    
    let code = `    // Transfer function block: ${block.name}\n`
    
    if (inputs.length === 0) {
      code += `    ${outputName} = 0.0; // No input\n`
      return code
    }
    
    if (stateOrder === 0) {
      // Pure gain (no dynamics)
      const numerator = block.parameters?.numerator || [1]
      const gain = (numerator[0] || 0) / (denominator[0] || 1)
      const inputExpr = inputs[0]
      
      // Get type info for proper handling
      const outputType = this.getOutputType(block, [])
      const typeInfo = BlockModuleUtils.parseType(outputType)
      
      if (typeInfo.isMatrix && typeInfo.rows && typeInfo.cols) {
        code += `    // Matrix element-wise gain\n`
        code += `    for (int i = 0; i < ${typeInfo.rows}; i++) {\n`
        code += `        for (int j = 0; j < ${typeInfo.cols}; j++) {\n`
        code += `            ${outputName}[i][j] = ${inputExpr}[i][j] * ${gain};\n`
        code += `        }\n`
        code += `    }\n`
      } else if (typeInfo.isArray && typeInfo.arraySize) {
        code += `    // Vector element-wise gain\n`
        code += `    for (int i = 0; i < ${typeInfo.arraySize}; i++) {\n`
        code += `        ${outputName}[i] = ${inputExpr}[i] * ${gain};\n`
        code += `    }\n`
      } else {
        code += `    ${outputName} = ${inputExpr} * ${gain};\n`
      }
    } else {
      // Dynamic system - output equals first state
      const outputType = this.getOutputType(block, [])
      const typeInfo = BlockModuleUtils.parseType(outputType)
      
      if (typeInfo.isMatrix && typeInfo.rows && typeInfo.cols) {
        code += `    // Matrix transfer function output\n`
        code += `    for (int i = 0; i < ${typeInfo.rows}; i++) {\n`
        code += `        for (int j = 0; j < ${typeInfo.cols}; j++) {\n`
        code += `            ${outputName}[i][j] = model->states.${tfName}_states[i][j][0];\n`
        code += `        }\n`
        code += `    }\n`
      } else if (typeInfo.isArray && typeInfo.arraySize) {
        code += `    // Vector transfer function output\n`
        code += `    for (int i = 0; i < ${typeInfo.arraySize}; i++) {\n`
        code += `        ${outputName}[i] = model->states.${tfName}_states[i][0];\n`
        code += `    }\n`
      } else {
        code += `    // Scalar transfer function output\n`
        code += `    ${outputName} = model->states.${tfName}_states[0];\n`
      }
    }
    
    return code
  }

  getOutputType(block: BlockData, inputTypes: string[]): string {
    // Transfer function output type matches input type
    if (inputTypes.length === 0) {
      return 'double' // Default type
    }
    return inputTypes[0]
  }

  generateStructMember(block: BlockData, outputType: string): string | null {
    // Transfer function blocks always need signal storage
    return BlockModuleUtils.generateStructMember(block.name, outputType)
  }

  requiresState(block: BlockData): boolean {
    // Transfer functions need state if denominator order > 0
    const denominator = block.parameters?.denominator || [1, 1]
    return denominator.length > 1
  }

  generateStateStructMembers(block: BlockData, outputType: string): string[] {
    const denominator = block.parameters?.denominator || [1, 1]
    const stateOrder = Math.max(0, denominator.length - 1)
    
    if (stateOrder === 0) {
      return [] // No states needed
    }
    
    const tfName = BlockModuleUtils.sanitizeIdentifier(block.name)
    const typeInfo = BlockModuleUtils.parseType(outputType)
    const members: string[] = []
    
    if (typeInfo.isMatrix && typeInfo.rows && typeInfo.cols) {
      // Matrix transfer function - need 3D array of states
      members.push(`    double ${tfName}_states[${typeInfo.rows}][${typeInfo.cols}][${stateOrder}];`)
    } else if (typeInfo.isArray && typeInfo.arraySize) {
      // Vector transfer function - need 2D array of states
      members.push(`    double ${tfName}_states[${typeInfo.arraySize}][${stateOrder}];`)
    } else {
      // Scalar transfer function
      members.push(`    double ${tfName}_states[${stateOrder}];`)
    }
    
    return members
  }

  generateInitialization(block: BlockData): string {
    const denominator = block.parameters?.denominator || [1, 1]
    const stateOrder = Math.max(0, denominator.length - 1)
    
    if (stateOrder === 0) {
      return '' // No initialization needed
    }
    
    const tfName = BlockModuleUtils.sanitizeIdentifier(block.name)
    
    // Initialize transfer function states to zero
    return `    memset(model->states.${tfName}_states, 0, sizeof(model->states.${tfName}_states));\n`
  }

  /**
   * Generate state derivative computation for RK4 integration
   */
  generateStateDerivative(
    block: BlockData, 
    inputExpr: string,
    stateAccessor: string = 'current_states',
    outputType: string
  ): string {
    const tfName = BlockModuleUtils.sanitizeIdentifier(block.name)
    const numerator = block.parameters?.numerator || [1]
    const denominator = block.parameters?.denominator || [1, 1]
    const stateOrder = Math.max(0, denominator.length - 1)
    const typeInfo = BlockModuleUtils.parseType(outputType)
    
    let code = `    // Transfer function: ${block.name}\n`
    
    if (stateOrder === 0) {
      return '' // No derivatives for zero-order systems
    }
    
    if (stateOrder === 1) {
      // First-order: dy/dt = (b0*u - a0*y) / a1
      const a1 = denominator[0]
      const a0 = denominator[1]
      const b0 = numerator[numerator.length - 1] || 0
      
      if (typeInfo.isArray && typeInfo.arraySize) {
        code += `    for (int i = 0; i < ${typeInfo.arraySize}; i++) {\n`
        code += `        double u = ${inputExpr}[i];\n`
        code += `        double y = ${stateAccessor}->${tfName}_states[i][0];\n`
        code += `        state_derivatives->${tfName}_states[i][0] = (${b0} * u - ${a0} * y) / ${a1};\n`
        code += `    }\n`
      } else {
        code += `    {\n`
        code += `        double u = ${inputExpr};\n`
        code += `        double y = ${stateAccessor}->${tfName}_states[0];\n`
        code += `        state_derivatives->${tfName}_states[0] = (${b0} * u - ${a0} * y) / ${a1};\n`
        code += `    }\n`
      }
    } else if (stateOrder === 2) {
      // Second-order system in controllable canonical form
      const a2 = denominator[0]
      const a1 = denominator[1]
      const a0 = denominator[2]
      const b0 = numerator[numerator.length - 1] || 0
      
      if (typeInfo.isArray && typeInfo.arraySize) {
        code += `    for (int i = 0; i < ${typeInfo.arraySize}; i++) {\n`
        code += `        double u = ${inputExpr}[i];\n`
        code += `        double x1 = ${stateAccessor}->${tfName}_states[i][0];\n`
        code += `        double x2 = ${stateAccessor}->${tfName}_states[i][1];\n`
        code += `        state_derivatives->${tfName}_states[i][0] = x2;\n`
        code += `        state_derivatives->${tfName}_states[i][1] = (${b0} * u - ${a0} * x1 - ${a1} * x2) / ${a2};\n`
        code += `    }\n`
      } else {
        code += `    {\n`
        code += `        double u = ${inputExpr};\n`
        code += `        double x1 = ${stateAccessor}->${tfName}_states[0];\n`
        code += `        double x2 = ${stateAccessor}->${tfName}_states[1];\n`
        code += `        state_derivatives->${tfName}_states[0] = x2;\n`
        code += `        state_derivatives->${tfName}_states[1] = (${b0} * u - ${a0} * x1 - ${a1} * x2) / ${a2};\n`
        code += `    }\n`
      }
    }
    
    return code
  }
}