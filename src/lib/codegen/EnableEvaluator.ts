// lib/codegen/EnableEvaluator.ts

import { FlattenedModel, SubsystemEnableInfo } from './ModelFlattener'
import { CCodeBuilder } from './CCodeBuilder'

/**
 * Generates the enable state evaluation function
 */
export class EnableEvaluator {
  private model: FlattenedModel
  private modelName: string
  
  constructor(model: FlattenedModel) {
    this.model = model
    this.modelName = CCodeBuilder.sanitizeIdentifier(model.metadata.modelName)
  }
  
  /**
   * Generate the enable evaluation function
   */
  generate(): string {
    // Skip if no subsystems have enable inputs
    if (!this.model.subsystemEnableInfo.some(info => info.hasEnableInput)) {
      return ''
    }
    
    // Build enable info with source expressions
    const enableInfoWithExpressions = this.buildEnableInfoWithExpressions()
    
    return CCodeBuilder.generateEnableEvaluation(
      enableInfoWithExpressions,
      this.model.metadata.modelName
    )
  }
  
  /**
   * Build enable info with source expressions for each subsystem
   */
  private buildEnableInfoWithExpressions(): Array<{
    subsystemId: string
    subsystemName: string
    hasEnableInput: boolean
    parentSubsystemId: string | null
    enableWireSourceExpr?: string
  }> {
    return this.model.subsystemEnableInfo.map(info => {
      const result = {
        subsystemId: info.subsystemId,
        subsystemName: info.subsystemName,
        hasEnableInput: info.hasEnableInput,
        parentSubsystemId: info.parentSubsystemId,
        enableWireSourceExpr: undefined as string | undefined
      }
      
      if (info.hasEnableInput && info.enableWire) {
        // Find the source expression for the enable wire
        const sourceBlock = this.model.blocks.find(b => 
          b.originalId === info.enableWire!.sourceBlockId
        )
        
        if (sourceBlock) {
          result.enableWireSourceExpr = this.generateSourceExpression(
            sourceBlock,
            info.enableWire.sourcePortIndex
          )
        }
      }
      
      return result
    })
  }
  
  /**
   * Generate the expression to read the enable signal value
   */
  private generateSourceExpression(
    sourceBlock: typeof this.model.blocks[0],
    portIndex: number
  ): string {
    const safeName = CCodeBuilder.sanitizeIdentifier(sourceBlock.block.name)
    
    // Determine where the signal value comes from
    switch (sourceBlock.block.type) {
      case 'input_port':
        // Read from model inputs
        return `model->inputs.${safeName}`
        
      case 'source':
        // Read from model signals (constant or generated)
        return `model->signals.${safeName}`
        
      default:
        // Read from model signals for any other block type
        return `model->signals.${safeName}`
    }
  }
  
  /**
   * Generate a macro to check if a block is enabled based on its scope
   */
  generateEnableCheckMacro(): string {
    if (!this.model.subsystemEnableInfo.some(info => info.hasEnableInput)) {
      return ''
    }
    
    let macro = CCodeBuilder.generateCommentBlock([
      'Macro to check if a block is enabled based on its subsystem scope',
      'Returns 1 if enabled, 0 if disabled'
    ])
    
    macro += '#define IS_BLOCK_ENABLED(block_enable_scope) \\\n'
    macro += '    ((block_enable_scope) == NULL ? 1 : \\\n'
    
    // Generate checks for each subsystem with enable
    const subsystemsWithEnable = this.model.subsystemEnableInfo.filter(info => info.hasEnableInput)
    
    for (let i = 0; i < subsystemsWithEnable.length; i++) {
      const info = subsystemsWithEnable[i]
      const safeName = CCodeBuilder.sanitizeIdentifier(info.subsystemName)
      const isLast = i === subsystemsWithEnable.length - 1
      
      macro += `     strcmp((block_enable_scope), "${info.subsystemId}") == 0 ? model->enable_states.${safeName}_enabled : \\\n`
    }
    
    // Default case
    macro += '     1)\n\n'
    
    return macro
  }
  
  /**
   * Generate inline enable checks for specific blocks
   */
  generateBlockEnableCheck(blockId: string): string {
    const enableScope = this.model.enableScopes.get(blockId)
    
    if (!enableScope) {
      return '1' // No enable scope means always enabled
    }
    
    // Find the subsystem info for this scope
    const subsystemInfo = this.model.subsystemEnableInfo.find(info => 
      info.subsystemId === enableScope
    )
    
    if (!subsystemInfo || !subsystemInfo.hasEnableInput) {
      return '1' // Subsystem doesn't have enable input
    }
    
    const safeName = CCodeBuilder.sanitizeIdentifier(subsystemInfo.subsystemName)
    return `model->enable_states.${safeName}_enabled`
  }
  
  /**
   * Get all blocks controlled by a specific subsystem
   */
  getBlocksInEnableScope(subsystemId: string): string[] {
    const blocks: string[] = []
    
    for (const [blockId, scope] of this.model.enableScopes) {
      if (scope === subsystemId) {
        blocks.push(blockId)
      }
    }
    
    return blocks
  }
  
  /**
   * Generate comment explaining enable hierarchy
   */
  generateEnableHierarchyComment(): string {
    const lines: string[] = [
      'Enable Hierarchy:',
      ''
    ]
    
    // Build hierarchy tree
    const rootSubsystems = this.model.subsystemEnableInfo.filter(info => !info.parentSubsystemId)
    
    const addSubsystemToTree = (info: SubsystemEnableInfo, indent: number) => {
      const prefix = '  '.repeat(indent)
      const enableStr = info.hasEnableInput ? ' [HAS ENABLE]' : ''
      lines.push(`${prefix}- ${info.subsystemName}${enableStr}`)
      
      // Add children
      const children = this.model.subsystemEnableInfo.filter(child => 
        child.parentSubsystemId === info.subsystemId
      )
      
      for (const child of children) {
        addSubsystemToTree(child, indent + 1)
      }
    }
    
    for (const root of rootSubsystems) {
      addSubsystemToTree(root, 0)
    }
    
    if (lines.length === 2) {
      lines.push('(No subsystems with enable inputs)')
    }
    
    return CCodeBuilder.generateCommentBlock(lines)
  }
}