// lib/codegen/CCodeBuilder.ts

/**
 * Utility class for building C code structures and expressions
 */
export class CCodeBuilder {
  /**
   * Sanitize a name to be a valid C identifier
   */
  static sanitizeIdentifier(name: string): string {
    // Replace non-alphanumeric characters with underscores
    let sanitized = name.replace(/[^a-zA-Z0-9_ ]/g, '_')
    
    // Ensure it doesn't start with a number
    if (/^\d/.test(sanitized)) {
      sanitized = '_' + sanitized
    }
    
    // Ensure it's not empty
    if (!sanitized) {
      sanitized = 'signal'
    }
    
    // Ensure it's not a C keyword
    const cKeywords = [
      'auto', 'break', 'case', 'char', 'const', 'continue', 'default', 'do',
      'double', 'else', 'enum', 'extern', 'float', 'for', 'goto', 'if',
      'int', 'long', 'register', 'return', 'short', 'signed', 'sizeof', 'static',
      'struct', 'switch', 'typedef', 'union', 'unsigned', 'void', 'volatile', 'while',
      'bool', 'true', 'false', '_Bool', '_Complex', '_Imaginary'
    ]
    
    if (cKeywords.includes(sanitized)) {
      sanitized = sanitized + '_'
    }
    
    return sanitized
  }
  
  /**
   * Generate array declaration with optional initialization
   */
  static generateArrayDeclaration(
    type: string,
    name: string,
    dimensions: number[],
    initialValue?: string
  ): string {
    const safeName = this.sanitizeIdentifier(name)
    let declaration = `${type} ${safeName}`
    
    // Add dimensions
    for (const dim of dimensions) {
      declaration += `[${dim}]`
    }
    
    // Add initialization if provided
    if (initialValue !== undefined) {
      declaration += ` = ${initialValue}`
    }
    
    return declaration
  }
  
  /**
   * Generate struct member declaration
   */
  static generateStructMember(
    type: string,
    name: string,
    dimensions?: number[],
    comment?: string
  ): string {
    const safeName = this.sanitizeIdentifier(name)
    let member = `    ${type} ${safeName}`
    
    if (dimensions) {
      for (const dim of dimensions) {
        member += `[${dim}]`
      }
    }
    
    member += ';'
    
    if (comment) {
      member += ` /* ${comment} */`
    }
    
    return member
  }
  
  /**
   * Generate boolean expression for enable signal evaluation
   */
  static generateBooleanExpression(expression: string, defaultValue: boolean = true): string {
    if (!expression || expression.trim() === '') {
      return defaultValue ? '1' : '0'
    }
    
    // Ensure the expression evaluates to 0 or 1
    return `((${expression}) ? 1 : 0)`
  }
  
  /**
   * Generate struct definition
   */
  static generateStruct(
    name: string,
    members: string[],
    comment?: string
  ): string {
    let code = ''
    
    if (comment) {
      code += `/* ${comment} */\n`
    }
    
    code += `typedef struct {\n`
    code += members.join('\n') + '\n'
    code += `} ${this.sanitizeIdentifier(name)}_t;\n`
    
    return code
  }
  
  /**
   * Generate function prototype
   */
  static generateFunctionPrototype(
    returnType: string,
    name: string,
    parameters: string[],
    comment?: string
  ): string {
    const safeName = this.sanitizeIdentifier(name)
    let prototype = ''
    
    if (comment) {
      prototype += `/* ${comment} */\n`
    }
    
    prototype += `${returnType} ${safeName}(`
    
    if (parameters.length === 0) {
      prototype += 'void'
    } else {
      prototype += parameters.join(', ')
    }
    
    prototype += ');'
    
    return prototype
  }
  
  /**
   * Generate function definition header
   */
  static generateFunctionHeader(
    returnType: string,
    name: string,
    parameters: string[],
    comment?: string
  ): string {
    const safeName = this.sanitizeIdentifier(name)
    let header = ''
    
    if (comment) {
      header += `/* ${comment} */\n`
    }
    
    header += `${returnType} ${safeName}(`
    
    if (parameters.length === 0) {
      header += 'void'
    } else {
      header += parameters.join(', ')
    }
    
    header += ') {\n'
    
    return header
  }
  
  /**
   * Generate include guard
   */
  static generateIncludeGuard(filename: string): {
    start: string,
    end: string
  } {
    const guard = filename.toUpperCase().replace(/[^A-Z0-9]/g, '_') + '_H'
    
    return {
      start: `#ifndef ${guard}\n#define ${guard}\n`,
      end: `\n#endif /* ${guard} */\n`
    }
  }
  
  /**
   * Generate comment block
   */
  static generateCommentBlock(lines: string[], style: 'single' | 'multi' = 'multi'): string {
    if (lines.length === 0) return ''
    
    if (style === 'single') {
      return lines.map(line => `// ${line}`).join('\n')
    } else {
      let comment = '/*\n'
      comment += lines.map(line => ` * ${line}`).join('\n')
      comment += '\n */\n'
      return comment
    }
  }
  
  /**
   * Generate macro definition
   */
  static generateMacro(name: string, value: string, comment?: string): string {
    const safeName = this.sanitizeIdentifier(name).toUpperCase()
    let macro = `#define ${safeName} ${value}`
    
    if (comment) {
      macro += ` /* ${comment} */`
    }
    
    return macro
  }
  
  /**
   * Indent code block
   */
  static indent(code: string, level: number = 1): string {
    const spaces = '    '.repeat(level)
    return code.split('\n').map(line => 
      line.trim() ? spaces + line : line
    ).join('\n')
  }
  
  /**
   * Generate conditional block
   */
  static generateConditional(
    condition: string,
    trueBlock: string,
    falseBlock?: string
  ): string {
    let code = `if (${condition}) {\n`
    code += this.indent(trueBlock)
    code += '\n}'
    
    if (falseBlock) {
      code += ' else {\n'
      code += this.indent(falseBlock)
      code += '\n}'
    }
    
    return code
  }
  
  /**
   * Generate for loop
   */
  static generateForLoop(
    variable: string,
    start: string,
    condition: string,
    increment: string,
    body: string
  ): string {
    let code = `for (${variable} = ${start}; ${condition}; ${increment}) {\n`
    code += this.indent(body)
    code += '\n}'
    
    return code
  }
  
  /**
   * Generate array initialization
   */
  static generateArrayInitializer(values: (string | number)[], wrap: boolean = true): string {
    const stringValues = values.map(v => v.toString())
    
    if (!wrap || stringValues.length <= 10) {
      return `{${stringValues.join(', ')}}`
    }
    
    // Wrap long arrays
    let result = '{\n'
    for (let i = 0; i < stringValues.length; i += 10) {
      result += '    ' + stringValues.slice(i, i + 10).join(', ')
      if (i + 10 < stringValues.length) {
        result += ','
      }
      result += '\n'
    }
    result += '}'
    
    return result
  }
  
  /**
   * Generate enable state struct for subsystems
   */
  static generateEnableStateStruct(subsystemEnableInfo: Array<{
    subsystemId: string,
    subsystemName: string,
    hasEnableInput: boolean
  }>): string {
    const members: string[] = []
    
    // Add enable state for each subsystem that has enable input
    for (const info of subsystemEnableInfo) {
      if (info.hasEnableInput) {
        const safeName = this.sanitizeIdentifier(info.subsystemName)
        members.push(this.generateStructMember(
          'int',
          `${safeName}_enabled`,
          undefined,
          `Enable state for ${info.subsystemName}`
        ))
      }
    }
    
    // If no subsystems have enable inputs, add a dummy member
    if (members.length === 0) {
      members.push(this.generateStructMember(
        'int',
        'dummy',
        undefined,
        'Placeholder - no subsystems with enable inputs'
      ))
    }
    
    return this.generateStruct(
      'enable_states',
      members,
      'Enable states for all subsystems'
    )
  }
  
  /**
   * Generate macro for checking if a subsystem is enabled
   */
  static generateEnableCheckMacro(modelName: string): string {
    const safeName = this.sanitizeIdentifier(modelName)
    return this.generateMacro(
      `IS_SUBSYSTEM_ENABLED`,
      `(subsystem_id, model) \\
    ((subsystem_id) == NULL ? 1 : \\
     (model)->enable_states.subsystem_id##_enabled)`,
      'Check if a subsystem is enabled'
    )
  }
  
  /**
   * Generate enable state initialization
   */
  static generateEnableStateInit(subsystemEnableInfo: Array<{
    subsystemId: string,
    subsystemName: string,
    hasEnableInput: boolean,
    parentSubsystemId: string | null
  }>): string {
    let code = '    /* Initialize enable states */\n'
    
    for (const info of subsystemEnableInfo) {
      if (info.hasEnableInput) {
        const safeName = this.sanitizeIdentifier(info.subsystemName)
        // Initialize to enabled by default
        code += `    model->enable_states.${safeName}_enabled = 1;\n`
      }
    }
    
    return code
  }
  
  /**
   * Generate enable state evaluation code
   */
  static generateEnableEvaluation(
    subsystemEnableInfo: Array<{
      subsystemId: string,
      subsystemName: string,
      hasEnableInput: boolean,
      parentSubsystemId: string | null,
      enableWireSourceExpr?: string
    }>,
    modelName: string
  ): string {
    const safeName = this.sanitizeIdentifier(modelName)
    let code = this.generateCommentBlock([
      'Evaluate enable states for all subsystems',
      'Called at the end of each time step',
      '',
      'Enable inheritance rules:',
      '1. If parent is disabled, children are disabled',
      '2. If parent is enabled, children check their own enable',
      '3. Root level is always enabled',
      '',
      'When disabled:',
      '- State integration is skipped',
      '- Outputs use last computed values',
      '- States remain frozen'
    ])
    
    code += this.generateFunctionHeader(
      'void',
      `${safeName}_evaluate_enable_states`,
      [`${safeName}_t* model`],
      'Update enable states based on enable inputs and parent states'
    )
    
    // Sort subsystems by hierarchy level (parents before children)
    const sortedSubsystems = [...subsystemEnableInfo].sort((a, b) => {
      // Count hierarchy depth
      const depthA = this.getHierarchyDepth(a.subsystemId, subsystemEnableInfo)
      const depthB = this.getHierarchyDepth(b.subsystemId, subsystemEnableInfo)
      return depthA - depthB
    })
    
    for (const info of sortedSubsystems) {
      if (!info.hasEnableInput) continue
      
      const safeSysName = this.sanitizeIdentifier(info.subsystemName)
      
      // Check parent enable state first
      if (info.parentSubsystemId) {
        const parentInfo = subsystemEnableInfo.find(s => s.subsystemId === info.parentSubsystemId)
        if (parentInfo?.hasEnableInput) {
          const safeParentName = this.sanitizeIdentifier(parentInfo.subsystemName)
          code += `\n    /* ${info.subsystemName} inherits from parent ${parentInfo.subsystemName} */\n`
          code += `    if (!model->enable_states.${safeParentName}_enabled) {\n`
          code += `        model->enable_states.${safeSysName}_enabled = 0;\n`
          code += `    } else {\n`
          
          // Evaluate own enable signal if parent is enabled
          if (info.enableWireSourceExpr) {
            code += `        /* Evaluate enable signal */\n`
            code += `        model->enable_states.${safeSysName}_enabled = ${this.generateBooleanExpression(info.enableWireSourceExpr)};\n`
          } else {
            code += `        /* No enable wire connected - default to enabled */\n`
            code += `        model->enable_states.${safeSysName}_enabled = 1;\n`
          }
          
          code += `    }\n`
        } else {
          // Parent doesn't have enable input, just evaluate own signal
          if (info.enableWireSourceExpr) {
            code += `\n    /* Evaluate enable signal for ${info.subsystemName} */\n`
            code += `    model->enable_states.${safeSysName}_enabled = ${this.generateBooleanExpression(info.enableWireSourceExpr)};\n`
          }
        }
      } else {
        // Root-level subsystem
        if (info.enableWireSourceExpr) {
          code += `\n    /* Evaluate enable signal for ${info.subsystemName} */\n`
          code += `    model->enable_states.${safeSysName}_enabled = ${this.generateBooleanExpression(info.enableWireSourceExpr)};\n`
        }
      }
    }
    
    code += '}\n'
    return code
  }
  
  /**
   * Helper to get hierarchy depth of a subsystem
   */
  private static getHierarchyDepth(
    subsystemId: string,
    subsystemEnableInfo: Array<{ subsystemId: string, parentSubsystemId: string | null }>
  ): number {
    let depth = 0
    let currentId: string | null = subsystemId
    
    while (currentId) {
      const info = subsystemEnableInfo.find(s => s.subsystemId === currentId)
      if (!info || !info.parentSubsystemId) break
      currentId = info.parentSubsystemId
      depth++
    }
    
    return depth
  }
}