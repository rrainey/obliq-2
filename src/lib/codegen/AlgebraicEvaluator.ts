// lib/codegen/AlgebraicEvaluator.ts

import { FlattenedModel, FlattenedBlock } from './ModelFlattener'
import { CCodeBuilder } from './CCodeBuilder'
import { BlockModuleFactory } from '../blocks/BlockModuleFactory'

/**
 * Generates the algebraic evaluation function for a flattened model.
 * This function computes all block outputs without changing states.
 */
export class AlgebraicEvaluator {
  private model: FlattenedModel
  private modelName: string
  private typeMap: Map<string, string>
  
  constructor(model: FlattenedModel, typeMap: Map<string, string>) {
    this.model = model
    this.modelName = CCodeBuilder.sanitizeIdentifier(model.metadata.modelName)
    this.typeMap = typeMap
  }
  
  /**
   * Generate the complete algebraic evaluation function
   */
  generate(): string {
    let code = CCodeBuilder.generateCommentBlock([
      'Evaluate algebraic relationships (pure function, no state changes)',
      'Computes all block outputs based on current inputs and states'
    ])
    
    code += CCodeBuilder.generateFunctionHeader(
      'void',
      `${this.modelName}_evaluate_algebraic`,
      [
        `const ${this.modelName}_inputs_t* inputs`,
        `const ${this.modelName}_states_t* states`,
        `${this.modelName}_signals_t* signals`,
        `${this.modelName}_outputs_t* outputs`,
        `const enable_states_t* enable_states`
      ]
    )
    
    // Copy inputs to local references for easier access
    code += this.generateInputCopy()
    
    // Compute execution order
    const executionOrder = this.calculateExecutionOrder()
    
    // Generate block computations in order
    code += this.generateBlockComputations(executionOrder)
    
    // Copy signals to outputs for output ports
    code += this.generateOutputCopy()
    
    code += '}\n'
    return code
  }
  
  /**
   * Generate code to copy inputs for easier access
   */
  private generateInputCopy(): string {
    let code = '    /* Copy inputs for easier access */\n'
    
    // For each input port, create a local reference
    const inputPorts = this.model.blocks.filter(b => b.block.type === 'input_port')
    
    for (const port of inputPorts) {
      const portName = port.block.parameters?.portName || port.block.name
      const safeName = CCodeBuilder.sanitizeIdentifier(portName)
      const signalName = CCodeBuilder.sanitizeIdentifier(port.block.name)
      
      // Check if it's an array type
      const dataType = port.block.parameters?.dataType || 'double'
      if (dataType.includes('[')) {
        code += `    memcpy(&signals->${signalName}, &inputs->${safeName}, sizeof(inputs->${safeName}));\n`
      } else {
        code += `    signals->${signalName} = inputs->${safeName};\n`
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
      // Skip input ports - they're already handled
      if (block.block.type === 'input_port') {
        continue
      }
      
      // Skip blocks that don't generate code
      if (!BlockModuleFactory.isSupported(block.block.type)) {
        continue
      }
      
      // Get the block's inputs and their types
      const inputs = this.getBlockInputExpressions(block, 'signals', 'states')
      const inputTypes = this.getBlockInputTypes(block)
      
      // Generate computation
      try {
        const generator = BlockModuleFactory.getBlockModule(block.block.type)
        
        // Update the block's output type based on input types
        const outputType = generator.getOutputType(block.block, inputTypes)
        
        // Store the output type for this block
        this.typeMap.set(block.originalId, outputType)
        
        // Add block comment
        code += `\n    /* ${block.flattenedName}`
        if (block.subsystemPath.length > 0) {
          code += ` (from ${block.subsystemPath.join(' > ')})`
        }
        code += ' */\n'
        
        // For transfer functions, we need special handling to use states
        if (block.block.type === 'transfer_function') {
          const modifiedInputs = this.getTransferFunctionInputs(block, inputs)
          code += generator.generateComputation(block.block, modifiedInputs, inputTypes)
        } else {
          code += generator.generateComputation(block.block, inputs, inputTypes)
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
  private getBlockInputExpressions(
    block: FlattenedBlock,
    signalsVar: string = 'signals',
    statesVar: string = 'states'
  ): string[] {
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
        const expr = this.generateSignalExpression(sourceBlock, connection.sourcePortIndex, signalsVar)
        inputs.push(expr)
      }
    }
    
    return inputs
  }
  
  /**
   * Special handling for transfer function inputs to include state reference
   */
  private getTransferFunctionInputs(block: FlattenedBlock, inputs: string[]): string[] {
    // Transfer functions need access to their states
    // We'll pass the state reference as a special parameter
    const safeName = CCodeBuilder.sanitizeIdentifier(block.block.name)
    return [...inputs, `states->${safeName}_states`]
  }
  
  /**
   * Generate expression to access a signal value
   */
  private generateSignalExpression(
    block: FlattenedBlock,
    portIndex: number,
    signalsVar: string = 'signals'
  ): string {
    const safeName = CCodeBuilder.sanitizeIdentifier(block.block.name)
    return `${signalsVar}->${safeName}`
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
            code += `    memcpy(&outputs->${safePortName}, &${sourceExpr}, sizeof(outputs->${safePortName}));\n`
          } else {
            // Scalar copy
            code += `    outputs->${safePortName} = ${sourceExpr};\n`
          }
        }
      }
    }
    
    code += '\n'
    return code
  }
  
  /**
   * Get input types for a block
   */
  private getBlockInputTypes(block: FlattenedBlock): string[] {
    const types: string[] = []
    
    // Find all connections to this block, sorted by target port index
    const connections = this.model.connections
      .filter(c => c.targetBlockId === block.originalId)
      .sort((a, b) => a.targetPortIndex - b.targetPortIndex)
    
    for (const connection of connections) {
      const sourceType = this.typeMap.get(connection.sourceBlockId) || 'double'
      types.push(sourceType)
    }
    
    return types
  }
  
  /**
   * Get output type for a block
   */
  private getBlockOutputType(block: FlattenedBlock): string {
    return this.typeMap.get(block.originalId) || 'double'
  }
}