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

    // MultiPortSwitch pattern: nested (in(0)==k ? in(j) : …) selecting whole inputs.
    // When data ports are vectors, emit element-wise copy instead of scalar temps.
    const isMultiportExpr =
      /in\(0\)==\(\d+\)\s*\?\s*in\(\d+\)/.test(expression) &&
      !/in\(\d+\)\[/.test(expression) &&
      !/in\(\d+\)\(/.test(expression)
    const vectorData = (inputTypes || [])
      .slice(1)
      .map(t => BlockModuleUtils.parseType(t || 'double'))
    // Prefer declared outputType width (e.g. Demux-driven MultiPortSwitch)
    // so we do not write past a narrower output buffer than data-port size.
    const declaredOut = BlockModuleUtils.parseType(
      String(block.parameters?.outputType || block.parameters?.dataType || 'double')
    )
    const declaredSize =
      (declaredOut.isArray && declaredOut.arraySize) ||
      (declaredOut.isMatrix && declaredOut.rows && declaredOut.cols === 1
        ? declaredOut.rows
        : 0) ||
      0
    const inputVecSize =
      vectorData.find(p => p.isArray && p.arraySize)?.arraySize ||
      vectorData.find(p => p.isMatrix && p.rows && p.cols === 1)?.rows ||
      0
    const vecSize = declaredSize || inputVecSize
    const stripOuter = (s: string): string => {
      let t = s.trim()
      while (t.startsWith('(') && t.endsWith(')')) {
        let depth = 0
        let wrapsAll = true
        for (let i = 0; i < t.length; i++) {
          if (t[i] === '(') depth++
          else if (t[i] === ')') {
            depth--
            if (depth === 0 && i < t.length - 1) {
              wrapsAll = false
              break
            }
          }
        }
        if (!wrapsAll || depth !== 0) break
        t = t.slice(1, -1).trim()
      }
      return t
    }
    if (
      isMultiportExpr &&
      vecSize > 0 &&
      vectorData.every(
        p =>
          (p.isArray && (p.arraySize || 0) >= vecSize) ||
          (p.isMatrix && (p.rows || 0) >= vecSize && p.cols === 1) ||
          p.isScalar
      )
    ) {
      // Parse all (idx, port) arms from nested ternary (extra parens ok)
      const arms: Array<{ idx: number; port: number }> = []
      let rest = stripOuter(expression)
      while (true) {
        rest = stripOuter(rest)
        const m = rest.match(
          /^\(in\(0\)==\((\d+)\)\?in\((\d+)\):(.*)\)$/
        )
        if (!m) break
        arms.push({ idx: Number(m[1]), port: Number(m[2]) })
        rest = m[3]
        const bare = stripOuter(rest)
        if (/^in\(\d+\)$/.test(bare)) {
          arms.push({ idx: -1, port: Number(bare.match(/in\((\d+)\)/)![1]) })
          break
        }
      }
      // Fallback: harvest arms with a global scan if nested-parens parse failed
      if (arms.length === 0) {
        for (const m of expression.matchAll(
          /in\(0\)==\((\d+)\)\s*\?\s*in\((\d+)\)/g
        )) {
          arms.push({ idx: Number(m[1]), port: Number(m[2]) })
        }
        const ports = [
          ...expression.matchAll(/\bin\((\d+)\)(?!\s*[\[(])/g)
        ].map(x => Number(x[1]))
        const defPort = ports.length ? Math.max(...ports) : numInputs - 1
        if (!arms.some(a => a.port === defPort && a.idx < 0)) {
          arms.push({ idx: -1, port: defPort })
        }
      }
      const indexExpr = (inputs[0] || '0').replace(/\s+/g, '_')
      code += `    // Evaluate multiport switch (vector size ${vecSize})\n`
      code += `    {\n`
      code += `        int _mp_idx = (int)(${indexExpr});\n`
      for (let a = 0; a < arms.length; a++) {
        const { idx, port } = arms[a]
        const src = (inputs[port] || '0').replace(/\s+/g, '_')
        const kw = a === 0 ? 'if' : idx < 0 ? 'else' : 'else if'
        // bare `else` — do not emit `else (1)` (invalid C)
        if (kw === 'else') {
          code += `        else {\n`
        } else {
          code += `        ${kw} (_mp_idx == ${idx}) {\n`
        }
        const p = BlockModuleUtils.parseType(
          (inputTypes || [])[port] || 'double'
        )
        const col = !!(p.isMatrix && p.cols === 1)
        for (let i = 0; i < vecSize; i++) {
          const rhs = p.isScalar
            ? src
            : col
              ? `${src}[${i}][0]`
              : `${src}[${i}]`
          code += `            ${outputName}[${i}] = ${rhs};\n`
        }
        code += `        }\n`
      }
      code += `    }\n`
      return code
    }

    // MATLAB Fcn vector indexing: in(0)[k] (0-based) — C99 subset has no subscripts,
    // so lower directly onto the input signal expressions.
    // For scalar inputs, u(1)/in(0)[0] is just the scalar (MATLAB quirk).
    if (/in\(\d+\)\[/.test(expression) || /in\(\d+\)\(/.test(expression)) {
      const isScalarIn = (i: number) => {
        const t = (inputTypes || [])[i] || 'double'
        return !t.includes('[')
      }
      let cExpr = expression
      cExpr = cExpr.replace(/\bin\((\d+)\)\((\d+)\)/g, (_, inp, idx) => {
        const i = Number(inp)
        const j = Number(idx) - 1
        const base = (inputs[i] || '0.0').replace(/\s+/g, '_')
        if (isScalarIn(i)) return j === 0 ? base : '0.0'
        return `${base}[${j}]`
      })
      cExpr = cExpr.replace(/\bin\((\d+)\)\[(\d+)\]/g, (_, inp, idx) => {
        const i = Number(inp)
        const j = Number(idx)
        const base = (inputs[i] || '0.0').replace(/\s+/g, '_')
        if (isScalarIn(i)) return j === 0 ? base : '0.0'
        const t = (inputTypes || [])[i] || 'double'
        // Flat index into double[3][3] (column-major, matching Create 3x3 / MES Mux2)
        const m = t.match(/double\[(\d+)\]\[(\d+)\]/)
        if (m) {
          const rows = Number(m[1])
          const cols = Number(m[2])
          if (rows * cols > 1) {
            const r = j % rows
            const c = Math.floor(j / rows)
            if (c < cols) return `${base}[${r}][${c}]`
          }
        }
        return `${base}[${idx}]`
      })
      code += `    ${outputName} = ${cExpr};\n`
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
      const t = (inputTypes || [])[i] || 'double'
      if (t.includes('[')) {
        // Vector/matrix input: bind as pointer to first element for scalar math
        // (magnitude etc. should use in(0)[k] path; this avoids double* assign errors)
        inputDeclarations.push(
          `    double ${tempVarName} = ${sanitized_rhs}[0]; // vector→scalar head`
        )
      } else {
        inputDeclarations.push(`    double ${tempVarName} = ${sanitized_rhs};`)
      }
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
      const { code: exprCode, needsMath } = c99ExpressionToCode(ast, sanitizedInputs, {
        debugMath: !!context?.debugMath,
        blockName: block.name || 'evaluate'
      })
      
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
    // Explicit outputType (e.g. RelationalOperator → bool)
    const declared = block.parameters?.outputType || block.parameters?.dataType
    if (typeof declared === 'string' && declared.trim()) {
      return declared.trim()
    }
    // MultiPortSwitch-style: output matches first vector data port
    const expr = block.parameters?.expression || ''
    if (/in\(0\)==\(/.test(expr)) {
      for (let i = 1; i < inputTypes.length; i++) {
        const t = inputTypes[i]
        if (t && t.includes('[')) return t.includes('][') ? t : t
      }
    }
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