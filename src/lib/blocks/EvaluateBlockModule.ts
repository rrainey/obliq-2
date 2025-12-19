// lib/blocks/EvaluateBlockModule.ts - Updated version

import { BlockData } from '@/components/BlockNode'
import { BlockState, SimulationState } from '@/lib/simulationTypes'
import { IBlockModule, BlockModuleUtils, CodeGenContext } from './BlockModule'
import { C99ExpressionParser } from '@/lib/c99ExpressionParser'
import { C99ExpressionValidator } from '@/lib/c99ExpressionValidator'
import { C99ExpressionEvaluator } from '@/lib/c99ExpressionEvaluator'
import { c99ExpressionToCode } from '@/lib/c99ExpressionCodeGen'

export class EvaluateBlockModule implements IBlockModule {
  generateComputation(block: BlockData, inputs: string[], inputTypes?: string[], context?: CodeGenContext): string {
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

    // Generate temporary variables with sanitized names - include block name to avoid collisions
    const blockSuffix = BlockModuleUtils.sanitizeIdentifier(block.name)
    for (let i = 0; i < inputs.length; i++) {
      const tempVarName = `_eval_${blockSuffix}_in${i}`
      sanitizedInputs.push(tempVarName)
      // QUIRK: Had to manually replace spaces with '_' in inputs[i]
      const sanitized_rhs = inputs[i].replace(/\s+/g, '_')
      inputDeclarations.push(`    double ${tempVarName} = ${sanitized_rhs};`)
    }
    
    try {
      // Parse the expression
      const parser = new C99ExpressionParser(expression)
      const ast = parser.parse()

      // Validate it - pass parameter names so they're recognized as valid identifiers
      const parameterNames = context?.parameterNames || []
      const validator = new C99ExpressionValidator(numInputs, parameterNames)
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