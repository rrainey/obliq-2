// lib/blocks/EvaluateBlockModule.ts - Updated version

import { BlockData } from '@/components/BlockNode'
import { BlockState, SimulationState } from '@/lib/simulationEngine'
import { IBlockModule, BlockModuleUtils } from './BlockModule'
import { C99ExpressionParser } from '@/lib/c99ExpressionParser'
import { C99ExpressionValidator } from '@/lib/c99ExpressionValidator'
import { C99ExpressionEvaluator } from '@/lib/c99ExpressionEvaluator'
import { c99ExpressionToCode } from '@/lib/c99ExpressionCodeGen'

export class EvaluateBlockModule implements IBlockModule {
  generateComputation(block: BlockData, inputs: string[]): string {
    const outputName = `model->signals.${BlockModuleUtils.sanitizeIdentifier(block.name)}`
    const expression = block.parameters?.expression || '0'
    const numInputs = block.parameters?.numInputs || 1
    
    let code = `    // Evaluate block: ${block.name}\n`
    code += `    // Expression: ${expression}\n`
    
    // Validate we have the right number of inputs
    if (inputs.length !== numInputs) {
      code += `    // Error: Expected ${numInputs} inputs, got ${inputs.length}\n`
      code += `    ${outputName} = 0.0;\n`
      return code
    }
    
    // Create sanitized input variables
    const sanitizedInputs: string[] = []
    const inputDeclarations: string[] = []
    
    // Generate temporary variables with sanitized names
    for (let i = 0; i < inputs.length; i++) {
      const tempVarName = `_eval_in${i}`
      sanitizedInputs.push(tempVarName)
      // QUIRK: Had to manually replace spaces with '_' in inputs[i]
      const sanitized_rhs = inputs[i].replace(/\s+/g, '_')
      inputDeclarations.push(`    double ${tempVarName} = ${sanitized_rhs};`)
    }
    
    try {
      // Parse the expression
      const parser = new C99ExpressionParser(expression)
      const ast = parser.parse()
      
      // Validate it
      const validator = new C99ExpressionValidator(numInputs)
      const validation = validator.validate(ast)
      
      if (!validation.valid) {
        code += `    // Error: ${validation.errors.join('; ')}\n`
        code += `    ${outputName} = 0.0;\n`
        return code
      }
      
      // Add input variable declarations
      if (inputDeclarations.length > 0) {
        code += `    // Input variables\n`
        code += inputDeclarations.join('\n') + '\n'
      }
      
      // Generate C code from the AST using sanitized input names
      const { code: exprCode, needsMath } = c99ExpressionToCode(ast, sanitizedInputs)
      
      if (needsMath) {
        code += `    // Note: This expression requires #include <math.h>\n`
      }
      
      code += `    ${outputName} = ${exprCode};\n`
      
    } catch (error) {
      code += `    // Error parsing expression: ${error}\n`
      code += `    ${outputName} = 0.0;\n`
    }
    
    return code
  }

  getOutputType(block: BlockData, inputTypes: string[]): string {
    // Evaluate block always outputs double
    return 'double'
  }

  generateStructMember(block: BlockData, outputType: string): string | null {
    return BlockModuleUtils.generateStructMember(block.name, outputType)
  }

  requiresState(block: BlockData): boolean {
    return false
  }

  generateStateStructMembers(block: BlockData, outputType: string): string[] {
    return []
  }

  // Add new method to check if math.h is needed
  requiresMathHeader(block: BlockData): boolean {
    const expression = block.parameters?.expression || '0'
    const numInputs = block.parameters?.numInputs || 1
    
    try {
      const parser = new C99ExpressionParser(expression)
      const ast = parser.parse()
      const validator = new C99ExpressionValidator(numInputs)
      const validation = validator.validate(ast)
      
      return validation.valid && validation.usesMathFunctions
    } catch {
      return false
    }
  }

  executeSimulation(
    blockState: BlockState,
    inputs: (number | number[] | boolean | boolean[] | number[][])[],
    simulationState: SimulationState
  ): void {
    const expression = blockState.internalState?.expression || '0'
    const numInputs = blockState.internalState?.numInputs || 1
    
    // Convert inputs to numbers
    const numericInputs: number[] = []
    for (let i = 0; i < numInputs; i++) {
      const input = inputs[i]
      if (typeof input === 'number') {
        numericInputs.push(input)
      } else if (typeof input === 'boolean') {
        numericInputs.push(input ? 1 : 0)
      } else {
        console.warn(`Evaluate block requires scalar inputs, got ${typeof input}`)
        numericInputs.push(0)
      }
    }
    
    try {
      // Parse and evaluate the expression
      const parser = new C99ExpressionParser(expression)
      const ast = parser.parse()
      
      // Validate
      const validator = new C99ExpressionValidator(numInputs)
      const validation = validator.validate(ast)
      
      if (!validation.valid) {
        console.warn(`Expression validation failed: ${validation.errors.join('; ')}`)
        blockState.outputs[0] = 0
        return
      }
      
      // Evaluate
      const evaluator = new C99ExpressionEvaluator(numericInputs)
      const result = evaluator.evaluate(ast)
      
      blockState.outputs[0] = result
      
    } catch (error) {
      console.warn(`Expression evaluation error: ${error}`)
      blockState.outputs[0] = 0
    }
  }

  getInputPortCount(block: BlockData): number {
    return block.parameters?.numInputs || 1
  }

  getOutputPortCount(block: BlockData): number {
    return 1
  }

  getInputPortLabels(block: BlockData): string[] | undefined {
    const count = this.getInputPortCount(block)
    const labels: string[] = []
    for (let i = 0; i < count; i++) {
      labels.push(`in${i}`)
    }
    return labels
  }
}