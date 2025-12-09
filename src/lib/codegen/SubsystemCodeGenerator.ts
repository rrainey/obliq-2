// lib/codegen/SubsystemCodeGenerator.ts

import { SubsystemInfo, SubsystemPort } from './SubsystemInfo'
import { FlattenedBlock } from './ModelFlattener'
import { CCodeBuilder } from './CCodeBuilder'
import { TypePropagator } from './TypePropagator'
import { BlockModuleFactory } from '../blocks/BlockModuleFactory'

/**
 * Result of subsystem code generation
 */
export interface SubsystemCodeResult {
  /** Generated header file content (subsystem_name.h) */
  header: string

  /** Generated source file content (subsystem_name.c) */
  source: string

  /** Sanitized subsystem name used in code */
  subsystemName: string

  /** Any warnings generated during code generation */
  warnings: string[]
}

/**
 * Generates independent C code modules for segregated subsystems.
 *
 * Each segregated subsystem gets its own .h and .c files with:
 * - Input/output/signal/state structs
 * - Main subsystem struct containing all of the above
 * - init() function
 * - compute_outputs() function (algebraic evaluation)
 * - compute_derivatives() function (for RK4 integration)
 * - Optional reset_states() function (if integrators with reset exist)
 */
export class SubsystemCodeGenerator {
  private info: SubsystemInfo
  private typeMap: Map<string, string>
  private warnings: string[] = []

  constructor(info: SubsystemInfo) {
    this.info = info

    // Propagate types through the subsystem's internal model
    const typePropagator = new TypePropagator(info.flattenedModel)
    this.typeMap = typePropagator.propagate()
  }

  /**
   * Generate complete C code for the subsystem
   */
  generate(): SubsystemCodeResult {
    const header = this.generateHeader()
    const source = this.generateSource()

    return {
      header,
      source,
      subsystemName: this.info.sanitizedName,
      warnings: [...this.warnings]
    }
  }

  /**
   * Generate the header file (.h)
   */
  private generateHeader(): string {
    const name = this.info.sanitizedName
    const guard = CCodeBuilder.generateIncludeGuard(name)
    let header = guard.start

    // Standard includes
    header += '#include <stdint.h>\n'
    header += '#include <stdbool.h>\n'
    header += '#include <math.h>\n\n'

    // C++ compatibility
    header += '#ifdef __cplusplus\n'
    header += 'extern "C" {\n'
    header += '#endif\n\n'

    // Type definitions
    header += this.generateInputsStruct()
    header += '\n'
    header += this.generateOutputsStruct()
    header += '\n'
    header += this.generateSignalsStruct()
    header += '\n'
    header += this.generateStatesStruct()
    header += '\n'
    header += this.generateSubsystemStruct()
    header += '\n'

    // Function prototypes
    header += this.generateFunctionPrototypes()

    // Close C++ compatibility
    header += '\n#ifdef __cplusplus\n'
    header += '}\n'
    header += '#endif\n'

    header += guard.end
    return header
  }

  /**
   * Generate the source file (.c)
   */
  private generateSource(): string {
    const name = this.info.sanitizedName
    let source = ''

    // File header comment
    source += CCodeBuilder.generateCommentBlock([
      `${this.info.subsystemName} - Segregated Subsystem`,
      `Generated C code for subsystem module`,
      `Generated on: ${new Date().toISOString()}`
    ])
    source += '\n'

    // Includes
    source += `#include "${name}.h"\n`
    source += '#include <string.h>\n\n'

    // Init function
    source += this.generateInitFunction()
    source += '\n'

    // Compute outputs function
    source += this.generateComputeOutputsFunction()
    source += '\n'

    // Compute derivatives function (if stateful)
    if (this.info.hasState) {
      source += this.generateComputeDerivativesFunction()
      source += '\n'
    }

    // Reset states function (if integrators with reset)
    if (this.info.hasResetInput) {
      source += this.generateResetStatesFunction()
      source += '\n'
    }

    return source
  }

  // ============================================================
  // Header Generation Helpers
  // ============================================================

  private generateInputsStruct(): string {
    const name = this.info.sanitizedName
    const members: string[] = []

    for (const port of this.info.inputPorts) {
      members.push(this.generatePortMember(port, 'Input port'))
    }

    if (members.length === 0) {
      members.push(CCodeBuilder.generateStructMember('int', 'dummy', undefined, 'No input ports'))
    }

    return CCodeBuilder.generateStruct(`${name}_inputs`, members, 'Subsystem input signals')
  }

  private generateOutputsStruct(): string {
    const name = this.info.sanitizedName
    const members: string[] = []

    for (const port of this.info.outputPorts) {
      members.push(this.generatePortMember(port, 'Output port'))
    }

    if (members.length === 0) {
      members.push(CCodeBuilder.generateStructMember('int', 'dummy', undefined, 'No output ports'))
    }

    return CCodeBuilder.generateStruct(`${name}_outputs`, members, 'Subsystem output signals')
  }

  private generateSignalsStruct(): string {
    const name = this.info.sanitizedName
    const members: string[] = []

    // Add signals for each block that produces output
    for (const block of this.info.flattenedModel.blocks) {
      // Skip port blocks
      if (block.block.type === 'input_port' || block.block.type === 'output_port') {
        continue
      }

      // Skip display/logger blocks
      if (block.block.type === 'signal_display' || block.block.type === 'signal_logger') {
        continue
      }

      try {
        const generator = BlockModuleFactory.getBlockModule(block.block.type)
        const outputType = this.getBlockOutputType(block)
        const member = generator.generateStructMember(block.block, outputType)
        if (member) {
          members.push(member)
        }
      } catch {
        // Block type not supported
        continue
      }
    }

    if (members.length === 0) {
      members.push(CCodeBuilder.generateStructMember('int', 'dummy', undefined, 'No internal signals'))
    }

    return CCodeBuilder.generateStruct(`${name}_signals`, members, 'Internal signal values')
  }

  private generateStatesStruct(): string {
    const name = this.info.sanitizedName
    const members: string[] = []

    // Add state variables for each stateful block
    for (const block of this.info.flattenedModel.blocks) {
      try {
        const generator = BlockModuleFactory.getBlockModule(block.block.type)
        if (generator.requiresState(block.block)) {
          const outputType = this.getBlockOutputType(block)
          const stateMembers = generator.generateStateStructMembers(block.block, outputType)
          members.push(...stateMembers)
        }
      } catch {
        continue
      }
    }

    if (members.length === 0) {
      members.push(CCodeBuilder.generateStructMember('int', 'dummy', undefined, 'No state variables'))
    }

    return CCodeBuilder.generateStruct(`${name}_states`, members, 'State variables')
  }

  private generateSubsystemStruct(): string {
    const name = this.info.sanitizedName
    const members: string[] = []

    members.push(`    ${name}_inputs_t inputs;`)
    members.push(`    ${name}_outputs_t outputs;`)
    members.push(`    ${name}_signals_t signals;`)
    members.push(`    ${name}_states_t states;`)
    members.push(`    int enabled; /* Enable state: 1=enabled, 0=disabled */`)

    return CCodeBuilder.generateStruct(name, members, `Main subsystem structure for ${this.info.subsystemName}`)
  }

  private generateFunctionPrototypes(): string {
    const name = this.info.sanitizedName
    let prototypes = CCodeBuilder.generateCommentBlock(['Function prototypes'])

    // Init
    prototypes += CCodeBuilder.generateFunctionPrototype(
      'void',
      `${name}_init`,
      [`${name}_t* model`],
      'Initialize subsystem to default state'
    ) + '\n'

    // Compute outputs
    prototypes += CCodeBuilder.generateFunctionPrototype(
      'void',
      `${name}_compute_outputs`,
      [`${name}_t* model`],
      'Compute outputs from inputs and states (algebraic evaluation)'
    ) + '\n'

    // Compute derivatives (if stateful)
    if (this.info.hasState) {
      prototypes += CCodeBuilder.generateFunctionPrototype(
        'void',
        `${name}_compute_derivatives`,
        [`const ${name}_t* model`, `${name}_states_t* derivatives`],
        'Compute state derivatives for integration'
      ) + '\n'
    }

    // Reset states (if has reset)
    if (this.info.hasResetInput) {
      prototypes += CCodeBuilder.generateFunctionPrototype(
        'void',
        `${name}_reset_states`,
        [`${name}_t* model`],
        'Reset integrator states to initial conditions'
      ) + '\n'
    }

    return prototypes
  }

  // ============================================================
  // Source Generation Helpers
  // ============================================================

  private generateInitFunction(): string {
    const name = this.info.sanitizedName

    let code = CCodeBuilder.generateCommentBlock(['Initialize subsystem to default state'])
    code += `void ${name}_init(${name}_t* model) {\n`

    // Zero all structures
    code += '    memset(&model->inputs, 0, sizeof(model->inputs));\n'
    code += '    memset(&model->outputs, 0, sizeof(model->outputs));\n'
    code += '    memset(&model->signals, 0, sizeof(model->signals));\n'
    code += '    memset(&model->states, 0, sizeof(model->states));\n'
    code += '    model->enabled = 1;\n'
    code += '\n'

    // Block-specific initialization
    code += '    /* Block-specific initialization */\n'
    for (const block of this.info.flattenedModel.blocks) {
      const initCode = this.generateBlockInit(block)
      if (initCode) {
        code += initCode
      }
    }

    code += '}\n'
    return code
  }

  private generateBlockInit(block: FlattenedBlock): string {
    try {
      const generator = BlockModuleFactory.getBlockModule(block.block.type)
      if (generator.generateInitialization) {
        // Block modules generate code using 'model->' which matches our parameter name
        const outputType = this.getBlockOutputType(block)
        return generator.generateInitialization(block.block, outputType)
      }
    } catch {
      // Block type not supported
    }
    return ''
  }

  private generateComputeOutputsFunction(): string {
    const name = this.info.sanitizedName

    let code = CCodeBuilder.generateCommentBlock([
      'Compute outputs from inputs and states',
      'This is the algebraic evaluation - no state changes',
      'Input ports are accessed directly via model->inputs.PortName'
    ])
    code += `void ${name}_compute_outputs(${name}_t* model) {\n`

    // Compute blocks in topological order
    // Note: Input port values are accessed directly via model->inputs (not copied to signals)
    code += '    /* Compute block outputs in dependency order */\n'
    const executionOrder = this.calculateExecutionOrder()

    for (const block of executionOrder) {
      // Skip port blocks
      if (block.block.type === 'input_port' || block.block.type === 'output_port') {
        continue
      }

      // Skip blocks that don't generate code
      if (!BlockModuleFactory.isSupported(block.block.type)) {
        continue
      }

      const blockCode = this.generateBlockComputation(block)
      if (blockCode) {
        code += blockCode
      }
    }

    // Copy signals to outputs
    code += '\n    /* Copy signals to outputs */\n'
    for (const port of this.info.outputPorts) {
      const safeName = port.sanitizedName
      // Find the source of this output port
      const outputExpr = this.getOutputPortSourceExpression(port)
      if (outputExpr) {
        if (port.dataType.includes('[')) {
          code += `    memcpy(&model->outputs.${safeName}, &${outputExpr}, sizeof(model->outputs.${safeName}));\n`
        } else {
          code += `    model->outputs.${safeName} = ${outputExpr};\n`
        }
      }
    }

    code += '}\n'
    return code
  }

  private generateBlockComputation(block: FlattenedBlock): string {
    try {
      const generator = BlockModuleFactory.getBlockModule(block.block.type)
      const inputs = this.getBlockInputExpressions(block)
      const inputTypes = this.getBlockInputTypes(block)

      let code = `\n    /* ${block.block.name} */\n`

      // Handle transfer functions specially (need state access)
      if (block.block.type === 'transfer_function') {
        const safeName = CCodeBuilder.sanitizeIdentifier(block.block.name)
        const modifiedInputs = [...inputs, `model->states.${safeName}_states`]
        code += generator.generateComputation(block.block, modifiedInputs, inputTypes)
      } else {
        code += generator.generateComputation(block.block, inputs, inputTypes)
      }

      return code
    } catch (error) {
      return `    /* Error generating code for ${block.block.type}: ${error} */\n`
    }
  }

  private generateComputeDerivativesFunction(): string {
    const name = this.info.sanitizedName

    let code = CCodeBuilder.generateCommentBlock([
      'Compute state derivatives for integration',
      'Called by parent during RK4 stages'
    ])
    code += `void ${name}_compute_derivatives(const ${name}_t* model, ${name}_states_t* derivatives) {\n`
    code += '    memset(derivatives, 0, sizeof(*derivatives));\n\n'

    // Generate derivative computation for each stateful block
    for (const block of this.info.flattenedModel.blocks) {
      try {
        const generator = BlockModuleFactory.getBlockModule(block.block.type) as any
        if (generator.requiresState(block.block) && generator.generateStateDerivative) {
          const inputExpr = this.getBlockDerivativeInput(block)
          const outputType = this.getBlockOutputType(block)

          code += `    /* ${block.block.name} */\n`
          // Use 'model->states' - block modules generate code expecting 'model->' prefix
          const derivCode = generator.generateStateDerivative(
            block.block,
            inputExpr,
            'model->states',
            outputType
          )
          // Replace 'state_derivatives' with 'derivatives' in the generated code
          code += derivCode.replace(/state_derivatives/g, 'derivatives')
        }
      } catch {
        continue
      }
    }

    code += '}\n'
    return code
  }

  private generateResetStatesFunction(): string {
    const name = this.info.sanitizedName

    let code = CCodeBuilder.generateCommentBlock([
      'Reset integrator states to initial conditions',
      'Called when reset signal is triggered'
    ])
    code += `void ${name}_reset_states(${name}_t* model) {\n`

    // Reset each integrator
    for (const block of this.info.flattenedModel.blocks) {
      if (block.block.type === 'integrator') {
        const safeName = CCodeBuilder.sanitizeIdentifier(block.block.name)
        const initialCondition = block.block.parameters?.initialCondition ?? 0

        code += `    /* Reset ${block.block.name} */\n`
        code += `    model->states.${safeName}_states[0] = ${initialCondition};\n`
      }
    }

    code += '}\n'
    return code
  }

  // ============================================================
  // Utility Methods
  // ============================================================

  private generatePortMember(port: SubsystemPort, comment: string): string {
    const typeMatch = port.dataType.match(/^(\w+)(\[[\d\[\]]+\])?$/)
    if (typeMatch) {
      const baseType = typeMatch[1]
      const dimensions = typeMatch[2]

      if (dimensions) {
        const dims = dimensions.match(/\d+/g)?.map(d => parseInt(d)) || []
        return CCodeBuilder.generateStructMember(baseType, port.sanitizedName, dims, `${comment}: ${port.name}`)
      }
    }
    return CCodeBuilder.generateStructMember('double', port.sanitizedName, undefined, `${comment}: ${port.name}`)
  }

  private getBlockOutputType(block: FlattenedBlock): string {
    const mappedType = this.typeMap.get(block.originalId)
    if (mappedType) return mappedType

    const dataType = block.block.parameters?.dataType
    if (dataType) return dataType

    return 'double'
  }

  private getBlockInputExpressions(block: FlattenedBlock): string[] {
    const inputs: string[] = []

    const connections = this.info.flattenedModel.connections
      .filter(c => c.targetBlockId === block.originalId && c.targetPortIndex >= 0)
      .sort((a, b) => a.targetPortIndex - b.targetPortIndex)

    for (const connection of connections) {
      const sourceBlock = this.info.flattenedModel.blocks.find(b =>
        b.originalId === connection.sourceBlockId
      )

      if (sourceBlock) {
        // Input ports are accessed via model->inputs, not model->signals
        if (sourceBlock.block.type === 'input_port') {
          const portName = sourceBlock.block.parameters?.portName || sourceBlock.block.name
          const inputPort = this.info.inputPorts.find(p => p.name === portName)
          if (inputPort) {
            inputs.push(`model->inputs.${inputPort.sanitizedName}`)
          } else {
            // Fallback: use sanitized port name
            const safeName = CCodeBuilder.sanitizeIdentifier(portName)
            inputs.push(`model->inputs.${safeName}`)
          }
        } else {
          const safeName = CCodeBuilder.sanitizeIdentifier(sourceBlock.block.name)
          inputs.push(`model->signals.${safeName}`)
        }
      }
    }

    return inputs
  }

  private getBlockInputTypes(block: FlattenedBlock): string[] {
    const types: string[] = []

    const connections = this.info.flattenedModel.connections
      .filter(c => c.targetBlockId === block.originalId && c.targetPortIndex >= 0)
      .sort((a, b) => a.targetPortIndex - b.targetPortIndex)

    for (const connection of connections) {
      const sourceType = this.typeMap.get(connection.sourceBlockId) || 'double'
      types.push(sourceType)
    }

    return types
  }

  private getBlockDerivativeInput(block: FlattenedBlock): string {
    // Find the connection to this block's first input
    const connection = this.info.flattenedModel.connections.find(c =>
      c.targetBlockId === block.originalId && c.targetPortIndex === 0
    )

    if (connection) {
      const sourceBlock = this.info.flattenedModel.blocks.find(b =>
        b.originalId === connection.sourceBlockId
      )
      if (sourceBlock) {
        // Input ports are accessed via model->inputs, not model->signals
        if (sourceBlock.block.type === 'input_port') {
          const portName = sourceBlock.block.parameters?.portName || sourceBlock.block.name
          const inputPort = this.info.inputPorts.find(p => p.name === portName)
          if (inputPort) {
            return `model->inputs.${inputPort.sanitizedName}`
          }
          // Fallback: use sanitized port name
          const safeName = CCodeBuilder.sanitizeIdentifier(portName)
          return `model->inputs.${safeName}`
        }
        const safeName = CCodeBuilder.sanitizeIdentifier(sourceBlock.block.name)
        return `model->signals.${safeName}`
      }
    }

    return '0.0'
  }

  private getOutputPortSourceExpression(port: SubsystemPort): string | null {
    // Find the output_port block
    const portBlock = this.info.flattenedModel.blocks.find(b =>
      b.block.type === 'output_port' && b.block.parameters?.portName === port.name
    )

    if (!portBlock) return null

    // Find the connection to this output port
    const connection = this.info.flattenedModel.connections.find(c =>
      c.targetBlockId === portBlock.originalId && c.targetPortIndex === 0
    )

    if (connection) {
      const sourceBlock = this.info.flattenedModel.blocks.find(b =>
        b.originalId === connection.sourceBlockId
      )
      if (sourceBlock) {
        const safeName = CCodeBuilder.sanitizeIdentifier(sourceBlock.block.name)
        return `model->signals.${safeName}`
      }
    }

    return null
  }

  private calculateExecutionOrder(): FlattenedBlock[] {
    const sorted: FlattenedBlock[] = []
    const visited = new Set<string>()
    const visiting = new Set<string>()

    // Build dependency map
    const dependencies = new Map<string, string[]>()
    for (const block of this.info.flattenedModel.blocks) {
      dependencies.set(block.originalId, [])
    }

    for (const connection of this.info.flattenedModel.connections) {
      const targetBlock = this.info.flattenedModel.blocks.find(b =>
        b.originalId === connection.targetBlockId
      )
      if (targetBlock && this.hasDirectFeedthrough(targetBlock)) {
        const deps = dependencies.get(connection.targetBlockId)
        if (deps && !deps.includes(connection.sourceBlockId)) {
          deps.push(connection.sourceBlockId)
        }
      }
    }

    // Topological sort
    const visit = (blockId: string) => {
      if (visited.has(blockId)) return
      if (visiting.has(blockId)) {
        this.warnings.push(`Algebraic loop detected in subsystem ${this.info.subsystemName}`)
        return
      }

      visiting.add(blockId)
      const deps = dependencies.get(blockId) || []
      for (const dep of deps) {
        visit(dep)
      }
      visiting.delete(blockId)
      visited.add(blockId)

      const block = this.info.flattenedModel.blocks.find(b => b.originalId === blockId)
      if (block) {
        sorted.push(block)
      }
    }

    for (const block of this.info.flattenedModel.blocks) {
      visit(block.originalId)
    }

    return sorted
  }

  private hasDirectFeedthrough(block: FlattenedBlock): boolean {
    if (BlockModuleFactory.isSupported(block.block.type)) {
      try {
        const module = BlockModuleFactory.getBlockModule(block.block.type)
        if (module.isDirectFeedthrough) {
          return module.isDirectFeedthrough(block.block) ?? true
        }
      } catch {
        // Default to true
      }
    }
    return true
  }
}
