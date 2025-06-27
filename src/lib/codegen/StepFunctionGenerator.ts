// lib/codegen/StepFunctionGenerator.ts

import { FlattenedModel, FlattenedBlock } from './ModelFlattener'
import { CCodeBuilder } from './CCodeBuilder'
import { BlockModuleFactory } from '../blocks/BlockModuleFactory'
import { EnableEvaluator } from './EnableEvaluator'

/**
 * Generates the step function for model execution
 */
export class StepFunctionGenerator {
  private model: FlattenedModel
  private modelName: string
  private enableEvaluator: EnableEvaluator
  
  constructor(model: FlattenedModel) {
    this.model = model
    this.modelName = CCodeBuilder.sanitizeIdentifier(model.metadata.modelName)
    this.enableEvaluator = new EnableEvaluator(model)
  }
  
  /**
   * Generate the complete step function
   */
  generate(): string {
    let code = CCodeBuilder.generateCommentBlock([
      'Execute one simulation step',
      'Updates all block outputs based on current inputs and states'
    ])
    
    code += CCodeBuilder.generateFunctionHeader(
      'void',
      `${this.modelName}_step`,
      [`${this.modelName}_t* model`]
    )
    
    // Copy inputs to signals for input ports
    code += this.generateInputCopy()
    
    // Compute execution order
    const executionOrder = this.calculateExecutionOrder()
    
    // Generate block computations in order
    code += this.generateBlockComputations(executionOrder)
    
    // Copy signals to outputs for output ports
    code += this.generateOutputCopy()
    
    // Update states (RK4 integration for dynamic blocks)
    if (this.hasStatefulBlocks()) {
      code += this.generateStateUpdate()
    }
    
    // Evaluate enable states at end of step
    if (this.model.subsystemEnableInfo.some(info => info.hasEnableInput)) {
      code += '\n    /* Evaluate enable states for next step */\n'
      code += `    ${this.modelName}_evaluate_enable_states(model);\n`
    }
    
    // Update time
    code += '\n    /* Update simulation time */\n'
    code += '    model->time += model->dt;\n'
    
    code += '}\n'
    return code
  }
  
  /**
   * Generate code to copy inputs to signals
   */
  private generateInputCopy(): string {
    const inputPorts = this.model.blocks.filter(b => b.block.type === 'input_port')
    
    if (inputPorts.length === 0) {
      return ''
    }
    
    let code = '    /* Copy inputs to signals */\n'
    
    for (const port of inputPorts) {
      const portName = port.block.parameters?.portName || port.block.name
      const dataType = port.block.parameters?.dataType || 'double'
      const safeName = CCodeBuilder.sanitizeIdentifier(port.block.name)
      const safePortName = CCodeBuilder.sanitizeIdentifier(portName)
      
      // Check if it's an array type
      if (dataType.includes('[')) {
        // Array copy
        const sizeofExpr = `sizeof(model->inputs.${safePortName})`
        code += `    memcpy(&model->signals.${safeName}, &model->inputs.${safePortName}, ${sizeofExpr});\n`
      } else {
        // Scalar copy
        code += `    model->signals.${safeName} = model->inputs.${safePortName};\n`
      }
    }
    
    code += '\n'
    return code
  }
  
  /**
   * Calculate execution order using topological sort
   */
  private calculateExecutionOrder(): FlattenedBlock[] {
    const sorted: FlattenedBlock[] = []
    const visited = new Set<string>()
    const visiting = new Set<string>()
    
    // Build adjacency list
    const dependencies = new Map<string, string[]>()
    
    for (const block of this.model.blocks) {
      dependencies.set(block.originalId, [])
    }
    
    for (const connection of this.model.connections) {
      const deps = dependencies.get(connection.targetBlockId)
      if (deps && !deps.includes(connection.sourceBlockId)) {
        deps.push(connection.sourceBlockId)
      }
    }
    
    // Topological sort with cycle detection
    const visit = (blockId: string) => {
      if (visited.has(blockId)) return
      
      if (visiting.has(blockId)) {
        console.warn(`Cycle detected involving block ${blockId}`)
        return
      }
      
      visiting.add(blockId)
      
      const deps = dependencies.get(blockId) || []
      for (const dep of deps) {
        visit(dep)
      }
      
      visiting.delete(blockId)
      visited.add(blockId)
      
      const block = this.model.blocks.find(b => b.originalId === blockId)
      if (block) {
        sorted.push(block)
      }
    }
    
    // Visit all blocks
    for (const block of this.model.blocks) {
      visit(block.originalId)
    }
    
    return sorted
  }
  
  /**
   * Generate block computation code
   */
  private generateBlockComputations(executionOrder: FlattenedBlock[]): string {
    let code = '    /* Compute block outputs in dependency order */\n'
    
    for (const block of executionOrder) {
      // Skip input/output ports
      if (block.block.type === 'input_port' || block.block.type === 'output_port') {
        continue
      }
      
      // Skip blocks that don't generate code
      if (!BlockModuleFactory.isSupported(block.block.type)) {
        continue
      }
      
      // Get the block's inputs
      const inputs = this.getBlockInputExpressions(block)
      
      // Generate computation
      try {
        const generator = BlockModuleFactory.getBlockModule(block.block.type)
        
        // Add block comment
        code += `\n    /* ${block.flattenedName}`
        if (block.subsystemPath.length > 0) {
          code += ` (from ${block.subsystemPath.join(' > ')})`
        }
        code += ' */\n'
        
        // Check if block is in an enable scope
        const enableCheck = this.enableEvaluator.generateBlockEnableCheck(block.originalId)
        const needsEnableCheck = enableCheck !== '1' && 
          generator.requiresState && 
          generator.requiresState(block.block)
        
        if (needsEnableCheck) {
          // Wrap computation in enable check for stateful blocks
          code += `    /* State update only if subsystem is enabled */\n`
          code += `    if (${enableCheck}) {\n`
          const computation = generator.generateComputation(block.block, inputs)
          code += CCodeBuilder.indent(computation)
          code += '\n    } else {\n'
          code += `        /* Subsystem disabled - output uses frozen state value */\n`
          code += '    }\n'
        } else {
          // No enable check needed
          code += generator.generateComputation(block.block, inputs)
        }
        
      } catch (error) {
        code += `    /* Error generating code for ${block.block.type}: ${error} */\n`
      }
    }
    
    code += '\n'
    return code
  }
  
  /**
   * Get input expressions for a block
   */
  private getBlockInputExpressions(block: FlattenedBlock): string[] {
    const inputs: string[] = []
    
    // Find all connections to this block, sorted by target port index
    const connections = this.model.connections
      .filter(c => c.targetBlockId === block.originalId)
      .sort((a, b) => a.targetPortIndex - b.targetPortIndex)
    
    for (const connection of connections) {
      const sourceBlock = this.model.blocks.find(b => 
        b.originalId === connection.sourceBlockId
      )
      
      if (sourceBlock) {
        const expr = this.generateSignalExpression(sourceBlock, connection.sourcePortIndex)
        inputs.push(expr)
      }
    }
    
    return inputs
  }
  
  /**
   * Generate expression to access a signal value
   */
  private generateSignalExpression(
    block: FlattenedBlock,
    portIndex: number
  ): string {
    const safeName = CCodeBuilder.sanitizeIdentifier(block.block.name)
    
    switch (block.block.type) {
      case 'input_port':
        // Already in signals from input copy
        return `model->signals.${safeName}`
        
      case 'source':
      default:
        // Regular signal
        return `model->signals.${safeName}`
    }
  }
  
  /**
   * Generate code to copy signals to outputs
   */
  private generateOutputCopy(): string {
    const outputPorts = this.model.blocks.filter(b => b.block.type === 'output_port')
    
    if (outputPorts.length === 0) {
      return ''
    }
    
    let code = '    /* Copy signals to outputs */\n'
    
    for (const port of outputPorts) {
      const portName = port.block.parameters?.portName || port.block.name
      const safePortName = CCodeBuilder.sanitizeIdentifier(portName)
      
      // Find the wire connected to this output port
      const inputWire = this.model.connections.find(c => 
        c.targetBlockId === port.originalId && c.targetPortIndex === 0
      )
      
      if (inputWire) {
        const sourceBlock = this.model.blocks.find(b => 
          b.originalId === inputWire.sourceBlockId
        )
        
        if (sourceBlock) {
          const sourceExpr = this.generateSignalExpression(sourceBlock, inputWire.sourcePortIndex)
          
          // Determine if it's an array type
          const outputType = this.getBlockOutputType(sourceBlock)
          
          if (outputType.includes('[')) {
            // Array copy
            code += `    memcpy(&model->outputs.${safePortName}, &${sourceExpr}, sizeof(model->outputs.${safePortName}));\n`
          } else {
            // Scalar copy
            code += `    model->outputs.${safePortName} = ${sourceExpr};\n`
          }
        }
      }
    }
    
    code += '\n'
    return code
  }
  
  /**
   * Generate state update code (placeholder for RK4)
   */
  private generateStateUpdate(): string {
    // This will be implemented in the RK4Generator
    return `\n    /* State integration will be added by RK4Generator */\n`
  }
  
  /**
   * Check if model has stateful blocks
   */
  private hasStatefulBlocks(): boolean {
    return this.model.blocks.some(block => {
      try {
        const generator = BlockModuleFactory.getBlockModule(block.block.type)
        return generator.requiresState(block.block)
      } catch {
        return false
      }
    })
  }
  
  /**
   * Get output type for a block (simplified for now)
   */
  private getBlockOutputType(block: FlattenedBlock): string {
    // This will be enhanced with proper type propagation
    const dataType = block.block.parameters?.dataType
    if (dataType) return dataType
    
    return 'double'
  }
}