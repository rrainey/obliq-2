// lib/codeGeneration.ts
import { BlockData } from '@/components/Block'
import { WireData } from '@/components/Wire'

export interface Sheet {
  id: string
  name: string
  blocks: BlockData[]
  connections: WireData[]
  extents: {
    width: number
    height: number
  }
}

export interface CodeGenerationResult {
  files: {
    name: string
    content: string
  }[]
  success: boolean
  errors: string[]
}

export class CodeGenerator {
  private blocks: BlockData[]
  private wires: WireData[]
  private sheets: Sheet[]
  private modelName: string
  private errors: string[] = []

  constructor(blocks: BlockData[], wires: WireData[], sheets: Sheet[], modelName: string) {
    this.blocks = blocks
    this.wires = wires
    this.sheets = sheets
    this.modelName = this.sanitizeIdentifier(modelName)
  }

  public generateCode(): CodeGenerationResult {
    this.errors = []
    
    try {
      // Validate the model first
      if (!this.validateModel()) {
        return {
          files: [],
          success: false,
          errors: this.errors
        }
      }

      // Generate the files
      const files = [
        {
          name: `${this.modelName}.h`,
          content: this.generateHeaderFile()
        },
        {
          name: `${this.modelName}.c`,
          content: this.generateSourceFile()
        },
        {
          name: 'library.properties',
          content: this.generateLibraryProperties()
        }
      ]

      return {
        files,
        success: true,
        errors: []
      }

    } catch (error) {
      this.errors.push(`Code generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
      return {
        files: [],
        success: false,
        errors: this.errors
      }
    }
  }

  private validateModel(): boolean {
    // Check for unconnected required inputs
    for (const block of this.blocks) {
      const requiredInputs = this.getRequiredInputCount(block.type)
      const connectedInputs = this.wires.filter(wire => wire.targetBlockId === block.id).length
      
      if (connectedInputs < requiredInputs) {
        this.errors.push(`Block ${block.name} (${block.type}) has unconnected required inputs`)
      }
    }

    // Check for algebraic loops (simplified check)
    if (this.hasAlgebraicLoops()) {
      this.errors.push('Model contains algebraic loops - not supported in generated code')
    }

    return this.errors.length === 0
  }

  private hasAlgebraicLoops(): boolean {
    // Simplified algebraic loop detection using DFS
    const visited = new Set<string>()
    const visiting = new Set<string>()

    const hasLoop = (blockId: string): boolean => {
      if (visiting.has(blockId)) return true
      if (visited.has(blockId)) return false

      visiting.add(blockId)
      
      const dependentWires = this.wires.filter(wire => wire.sourceBlockId === blockId)
      for (const wire of dependentWires) {
        if (hasLoop(wire.targetBlockId)) return true
      }

      visiting.delete(blockId)
      visited.add(blockId)
      return false
    }

    for (const block of this.blocks) {
      if (!visited.has(block.id) && hasLoop(block.id)) {
        return true
      }
    }

    return false
  }

  private getRequiredInputCount(blockType: string): number {
    switch (blockType) {
      case 'sum':
      case 'multiply':
        return 1 // At least one input required
      case 'scale':
      case 'transfer_function':
      case 'lookup_1d':
      case 'signal_display':
      case 'signal_logger':
      case 'output_port':
        return 1
      case 'lookup_2d':
        return 2
      case 'input_port':
      case 'source':
        return 0
      default:
        return 0
    }
  }

  private generateLibraryProperties(): string {
    return `name=${this.modelName}
version=1.0.0
author=Visual Model Generator
maintainer=Visual Model Generator
sentence=Generated from visual block diagram model
paragraph=This library was automatically generated from a visual modeling tool
category=Control
url=
architectures=*
includes=${this.modelName}.h`
  }

  private requiresState(blockType: string): boolean {
    return ['transfer_function'].includes(blockType)
  }

  private generateStateDeclaration(block: BlockData): string {
    switch (block.type) {
      case 'transfer_function':
        const denominator = block.parameters?.denominator || [1, 1]
        const stateOrder = Math.max(0, denominator.length - 1)
        return `    double ${this.sanitizeIdentifier(block.name)}_states[${stateOrder}];`
      default:
        return `    double ${this.sanitizeIdentifier(block.name)}_state;`
    }
  }

  private generateInitCode(block: BlockData): string {
    const blockName = this.sanitizeIdentifier(block.name)
    
    switch (block.type) {
      case 'transfer_function':
        return `    // Initialize ${block.name} transfer function states to zero (done by memset)`
      default:
        return `    // Initialize ${block.name} state`
    }
  }

  private generateSignalDeclarations(): string {
    const signals = new Set<string>()
    
    // Add signals for each block output
    for (const block of this.blocks) {
      if (this.getOutputCount(block.type) > 0) {
        signals.add(`double ${this.sanitizeIdentifier(block.name)}_out = 0.0;`)
      }
    }
    
    return Array.from(signals).map(s => `    ${s}`).join('\n')
  }

  private generateExecutionCode(): string {
    // Get execution order (topological sort)
    const executionOrder = this.getExecutionOrder()
    
    return executionOrder.map(blockId => {
      const block = this.blocks.find(b => b.id === blockId)
      if (!block) return ''
      
      return this.generateBlockCode(block)
    }).filter(code => code.length > 0).join('\n\n')
  }

  private generateBlockCode(block: BlockData): string {
    const blockName = this.sanitizeIdentifier(block.name)
    const inputs = this.getBlockInputs(block.id)
    
    switch (block.type) {
      case 'sum':
        const sumInputs = inputs.map(input => input.signal).join(' + ')
        return `    // Sum block: ${block.name}
    ${blockName}_out = ${sumInputs || '0.0'};`

      case 'multiply':
        const multiplyInputs = inputs.map(input => input.signal).join(' * ')
        return `    // Multiply block: ${block.name}
    ${blockName}_out = ${multiplyInputs || '1.0'};`

      case 'scale':
        const gain = block.parameters?.gain || 1
        const scaleInput = inputs[0]?.signal || '0.0'
        return `    // Scale block: ${block.name}
    ${blockName}_out = ${gain} * (${scaleInput});`

      case 'transfer_function':
        return this.generateTransferFunctionCode(block, inputs)

      case 'input_port':
        const portName = this.sanitizeIdentifier(block.parameters?.portName || block.name)
        return `    // Input port: ${block.name}
    ${blockName}_out = instance->inputs.${portName};`

      case 'source':
        const value = block.parameters?.value || 0
        return `    // Source block: ${block.name}
    ${blockName}_out = ${value};`

      case 'lookup_1d':
        return this.generateLookup1DCode(block, inputs)

      case 'output_port':
        const outputPortName = this.sanitizeIdentifier(block.parameters?.portName || block.name)
        const outputInput = inputs[0]?.signal || '0.0'
        return `    // Output port: ${block.name}
    instance->outputs.${outputPortName} = ${outputInput};`

      case 'signal_display':
      case 'signal_logger':
        // These blocks don't generate code in the final implementation
        return `    // ${block.type}: ${block.name} (display/logging - not implemented in generated code)`

      default:
        return `    // Unsupported block type: ${block.type}`
    }
  }

  private generateTransferFunctionCode(block: BlockData, inputs: { signal: string }[]): string {
  const blockName = this.sanitizeIdentifier(block.name)
  const input = inputs[0]?.signal || '0.0'
  const numerator = block.parameters?.numerator || [1]
  const denominator = block.parameters?.denominator || [1, 1]
  
  if (denominator.length === 1) {
    // Pure gain
    const gain = numerator[0] / denominator[0]
    return `    // Transfer function: ${block.name} (pure gain)
    ${blockName}_out = ${gain} * (${input});`
  } else if (denominator.length === 2) {
    // First order system: H(s) = b0 / (a1*s + a0)
    // With descending order: denominator = [a1, a0]
    const a1 = denominator[0] // s coefficient
    const a0 = denominator[1] // constant term
    const b0 = numerator[numerator.length - 1] || 0
    
    return `    // Transfer function: ${block.name} (first order)
    {
        double a0 = ${a0};
        double a1 = ${a1};
        double b0 = ${b0};
        double h = instance->timeStep;
        double input = ${input};
        double prev_state = instance->states.${blockName}_states[0];
        
        // First-order discrete approximation
        // dy/dt = (b0*u - a0*y) / a1
        instance->states.${blockName}_states[0] = prev_state + h * (b0 * input - a0 * prev_state) / a1;
        ${blockName}_out = instance->states.${blockName}_states[0];
    }`
  } else {
    // Higher order - simplified implementation
    return `    // Transfer function: ${block.name} (higher order - simplified)
    ${blockName}_out = ${input}; // TODO: Implement higher-order transfer functions`
  }
}

  private generateLookup1DCode(block: BlockData, inputs: { signal: string }[]): string {
    const blockName = this.sanitizeIdentifier(block.name)
    const input = inputs[0]?.signal || '0.0'
    const inputValues = block.parameters?.inputValues || [0, 1]
    const outputValues = block.parameters?.outputValues || [0, 1]
    
    // Generate lookup table as static arrays
    const inputArray = `{${inputValues.join(', ')}}`
    const outputArray = `{${outputValues.join(', ')}}`
    const tableSize = Math.min(inputValues.length, outputValues.length)
    
    return `    // 1D Lookup table: ${block.name}
    {
        static const double input_table[] = ${inputArray};
        static const double output_table[] = ${outputArray};
        static const int table_size = ${tableSize};
        double input_val = ${input};
        
        // Linear interpolation
        if (input_val <= input_table[0]) {
            ${blockName}_out = output_table[0];
        } else if (input_val >= input_table[table_size-1]) {
            ${blockName}_out = output_table[table_size-1];
        } else {
            // Find interpolation interval
            for (int i = 0; i < table_size-1; i++) {
                if (input_val >= input_table[i] && input_val <= input_table[i+1]) {
                    double t = (input_val - input_table[i]) / (input_table[i+1] - input_table[i]);
                    ${blockName}_out = output_table[i] + t * (output_table[i+1] - output_table[i]);
                    break;
                }
            }
        }
    }`
  }

  private getBlockInputs(blockId: string): { signal: string, portIndex: number }[] {
    const inputWires = this.wires.filter(wire => wire.targetBlockId === blockId)
    inputWires.sort((a, b) => a.targetPortIndex - b.targetPortIndex)
    
    return inputWires.map(wire => {
      const sourceBlock = this.blocks.find(b => b.id === wire.sourceBlockId)
      const sourceName = sourceBlock ? this.sanitizeIdentifier(sourceBlock.name) : 'unknown'
      return {
        signal: `${sourceName}_out`,
        portIndex: wire.targetPortIndex
      }
    })
  }

  private getExecutionOrder(): string[] {
    // Topological sort to determine execution order
    const visited = new Set<string>()
    const visiting = new Set<string>()
    const order: string[] = []

    const visit = (blockId: string) => {
      if (visiting.has(blockId)) return // Cycle detection
      if (visited.has(blockId)) return

      visiting.add(blockId)

      // Visit dependencies first
      const inputWires = this.wires.filter(wire => wire.targetBlockId === blockId)
      for (const wire of inputWires) {
        visit(wire.sourceBlockId)
      }

      visiting.delete(blockId)
      visited.add(blockId)
      order.push(blockId)
    }

    // Start with source blocks
    const sourceBlocks = this.blocks.filter(b => ['input_port', 'source'].includes(b.type))
    for (const block of sourceBlocks) {
      visit(block.id)
    }

    // Visit remaining blocks
    for (const block of this.blocks) {
      if (!visited.has(block.id)) {
        visit(block.id)
      }
    }

    return order
  }

  private getOutputCount(blockType: string): number {
    switch (blockType) {
      case 'sum':
      case 'multiply':
      case 'scale':
      case 'transfer_function':
      case 'input_port':
      case 'source':
      case 'lookup_1d':
      case 'lookup_2d':
        return 1
      case 'output_port':
      case 'signal_display':
      case 'signal_logger':
        return 0
      default:
        return 0
    }
  }

  private generateOutputCode(): string {
    // Output ports are handled in their block code generation
    return '    // Output updates handled in block execution'
  }

  private sanitizeIdentifier(name: string): string {
    // Convert to valid C identifier
    return name
      .replace(/[^a-zA-Z0-9_]/g, '_')
      .replace(/^[0-9]/, '_$&')
      .replace(/_{2,}/g, '_')
      .replace(/^_+|_+$/g, '')
      || 'unnamed'
  }


  // lib/codeGeneration.ts - Add derivatives function generation

private generateHeaderFile(): string {
  const structName = `${this.modelName}_t`
  const inputPorts = this.blocks.filter(b => b.type === 'input_port')
  const outputPorts = this.blocks.filter(b => b.type === 'output_port')
  const stateBlocks = this.blocks.filter(b => this.requiresState(b.type))

  return `#ifndef ${this.modelName.toUpperCase()}_H
#define ${this.modelName.toUpperCase()}_H

#ifdef __cplusplus
extern "C" {
#endif

// Generated from visual model: ${this.modelName}
// This file contains the interface for the model

// Input structure
typedef struct {
${inputPorts.map(block => `    double ${this.sanitizeIdentifier(block.parameters?.portName || block.name)};`).join('\n')}
} ${this.modelName}_inputs_t;

// Output structure  
typedef struct {
${outputPorts.map(block => `    double ${this.sanitizeIdentifier(block.parameters?.portName || block.name)};`).join('\n')}
} ${this.modelName}_outputs_t;

// State structure
typedef struct {
${stateBlocks.map(block => this.generateStateDeclaration(block)).join('\n')}
} ${this.modelName}_states_t;

// Main instance structure
typedef struct {
    ${this.modelName}_inputs_t inputs;
    ${this.modelName}_outputs_t outputs;
    ${this.modelName}_states_t states;
    double timeStep;
} ${structName};

// Function declarations
void ${this.modelName}_init(${structName}* instance, double timeStep);
void ${this.modelName}_step(${structName}* instance);
void ${this.modelName}_derivatives(
    double t,
    const ${this.modelName}_inputs_t* inputs,
    const ${this.modelName}_states_t* current_states,
    ${this.modelName}_states_t* state_derivatives
);
void ${this.modelName}_terminate(${structName}* instance);

#ifdef __cplusplus
}
#endif

#endif // ${this.modelName.toUpperCase()}_H`
}

private generateSourceFile(): string {
  const structName = `${this.modelName}_t`
  
  return `#include "${this.modelName}.h"
#include <math.h>
#include <string.h>

// Generated from visual model: ${this.modelName}

void ${this.modelName}_init(${structName}* instance, double timeStep) {
    if (!instance) return;
    
    // Initialize inputs and outputs to zero
    memset(&instance->inputs, 0, sizeof(instance->inputs));
    memset(&instance->outputs, 0, sizeof(instance->outputs));
    memset(&instance->states, 0, sizeof(instance->states));
    
    instance->timeStep = timeStep;
    
    // Initialize block states
${this.blocks.filter(b => this.requiresState(b.type)).map(block => this.generateInitCode(block)).join('\n')}
}

void ${this.modelName}_derivatives(
    double t,
    const ${this.modelName}_inputs_t* inputs,
    const ${this.modelName}_states_t* current_states,
    ${this.modelName}_states_t* state_derivatives
) {
    if (!inputs || !current_states || !state_derivatives) return;
    
    // Clear derivatives
    memset(state_derivatives, 0, sizeof(${this.modelName}_states_t));
    
    // Local variables for intermediate signals
${this.generateSignalDeclarations()}
    
    // Compute block outputs using current states
${this.generateDerivativeComputationCode()}
}

void ${this.modelName}_step(${structName}* instance) {
    if (!instance) return;
    
    double h = instance->timeStep;
    static double current_time = 0.0;
    
    // Runge-Kutta 4th order integration
    ${this.modelName}_states_t k1, k2, k3, k4;
    ${this.modelName}_states_t temp_states;
    
    // k1 = h * f(t, y)
    ${this.modelName}_derivatives(current_time, &instance->inputs, &instance->states, &k1);
    ${this.generateRK4Scaling('k1', 'h')}
    
    // k2 = h * f(t + h/2, y + k1/2)
    ${this.generateRK4TempStates('temp_states', 'instance->states', 'k1', 0.5)}
    ${this.modelName}_derivatives(current_time + h/2, &instance->inputs, &temp_states, &k2);
    ${this.generateRK4Scaling('k2', 'h')}
    
    // k3 = h * f(t + h/2, y + k2/2)
    ${this.generateRK4TempStates('temp_states', 'instance->states', 'k2', 0.5)}
    ${this.modelName}_derivatives(current_time + h/2, &instance->inputs, &temp_states, &k3);
    ${this.generateRK4Scaling('k3', 'h')}
    
    // k4 = h * f(t + h, y + k3)
    ${this.generateRK4TempStates('temp_states', 'instance->states', 'k3', 1.0)}
    ${this.modelName}_derivatives(current_time + h, &instance->inputs, &temp_states, &k4);
    ${this.generateRK4Scaling('k4', 'h')}
    
    // y_new = y + (k1 + 2*k2 + 2*k3 + k4) / 6
    ${this.generateRK4Update('instance->states', 'k1', 'k2', 'k3', 'k4')}
    
    // Update time
    current_time += h;
    
    // Update outputs based on new states
${this.generateOutputUpdateCode()}
}

void ${this.modelName}_terminate(${structName}* instance) {
    if (!instance) return;
    // Cleanup code (if needed)
}`
}

private generateDerivativeComputationCode(): string {
  // This generates code that computes derivatives for each state
  const transferFunctionBlocks = this.blocks.filter(b => b.type === 'transfer_function')
  
  let code = ''
  
  // First, compute all non-state block outputs
  const executionOrder = this.getExecutionOrder()
  for (const blockId of executionOrder) {
    const block = this.blocks.find(b => b.id === blockId)
    if (!block || block.type === 'transfer_function') continue
    
    code += this.generateBlockCode(block) + '\n'
  }
  
  // Then compute transfer function derivatives
  for (const block of transferFunctionBlocks) {
    code += this.generateTransferFunctionDerivative(block) + '\n'
  }
  
  return code
}

private generateTransferFunctionDerivative(block: BlockData): string {
  const blockName = this.sanitizeIdentifier(block.name)
  const inputs = this.getBlockInputs(block.id)
  const input = inputs[0]?.signal || '0.0'
  const numerator = block.parameters?.numerator || [1]
  const denominator = block.parameters?.denominator || [1, 1]
  
  if (denominator.length <= 1) {
    // No state, no derivative
    return `    // ${block.name} has no state (pure gain)`
  }
  
  if (denominator.length === 2) {
    // First order: a1*dy/dt + a0*y = b0*u
    // dy/dt = (b0*u - a0*y) / a1
    const a1 = denominator[0] // s coefficient (highest order)
    const a0 = denominator[1] // constant term
    const b0 = numerator[numerator.length - 1] || 0
    
    return `    // ${block.name} derivative (first order)
    {
        double u = ${input};
        double y = current_states->${blockName}_states[0];
        state_derivatives->${blockName}_states[0] = (${b0} * u - ${a0} * y) / ${a1};
    }`
  }
  
  // Higher order - would need state-space representation
  return `    // ${block.name} derivative (higher order - TODO)`
}

private generateRK4Scaling(kVar: string, h: string): string {
  const stateBlocks = this.blocks.filter(b => this.requiresState(b.type))
  let code = ''
  
  for (const block of stateBlocks) {
    const blockName = this.sanitizeIdentifier(block.name)
    if (block.type === 'transfer_function') {
      const denominator = block.parameters?.denominator || []
      const stateCount = Math.max(0, denominator.length - 1)
      for (let i = 0; i < stateCount; i++) {
        code += `    ${kVar}.${blockName}_states[${i}] *= ${h};\n`
      }
    }
  }
  
  return code
}

private generateRK4TempStates(tempVar: string, baseStates: string, kVar: string, factor: number): string {
  const stateBlocks = this.blocks.filter(b => this.requiresState(b.type))
  let code = ''
  
  for (const block of stateBlocks) {
    const blockName = this.sanitizeIdentifier(block.name)
    if (block.type === 'transfer_function') {
      const denominator = block.parameters?.denominator || []
      const stateCount = Math.max(0, denominator.length - 1)
      for (let i = 0; i < stateCount; i++) {
        code += `    ${tempVar}.${blockName}_states[${i}] = ${baseStates}.${blockName}_states[${i}] + ${factor} * ${kVar}.${blockName}_states[${i}];\n`
      }
    }
  }
  
  return code
}

private generateRK4Update(statesVar: string, k1: string, k2: string, k3: string, k4: string): string {
  const stateBlocks = this.blocks.filter(b => this.requiresState(b.type))
  let code = ''
  
  for (const block of stateBlocks) {
    const blockName = this.sanitizeIdentifier(block.name)
    if (block.type === 'transfer_function') {
      const denominator = block.parameters?.denominator || []
      const stateCount = Math.max(0, denominator.length - 1)
      for (let i = 0; i < stateCount; i++) {
        code += `    ${statesVar}.${blockName}_states[${i}] += (${k1}.${blockName}_states[${i}] + 2*${k2}.${blockName}_states[${i}] + 2*${k3}.${blockName}_states[${i}] + ${k4}.${blockName}_states[${i}]) / 6.0;\n`
      }
    }
  }
  
  return code
}

private generateOutputUpdateCode(): string {
  // Update output ports based on current signals
  const outputPorts = this.blocks.filter(b => b.type === 'output_port')
  let code = '    // Compute all block outputs with updated states\n'
  
  // Execute all blocks to compute final outputs
  const executionOrder = this.getExecutionOrder()
  for (const blockId of executionOrder) {
    const block = this.blocks.find(b => b.id === blockId)
    if (!block) continue
    
    code += this.generateBlockCode(block) + '\n'
  }
  
  return code
}
}