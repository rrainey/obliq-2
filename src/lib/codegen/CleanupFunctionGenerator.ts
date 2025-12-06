// lib/codegen/CleanupFunctionGenerator.ts

import { FlattenedModel } from './ModelFlattener'
import { CCodeBuilder } from './CCodeBuilder'
import { BlockModuleFactory } from '../blocks/BlockModuleFactory'

/**
 * Generates the cleanup function for freeing data collection buffers
 */
export class CleanupFunctionGenerator {
  private model: FlattenedModel
  private modelName: string

  constructor(model: FlattenedModel) {
    this.model = model
    this.modelName = CCodeBuilder.sanitizeIdentifier(model.metadata.modelName)
  }

  /**
   * Generate the complete cleanup function
   */
  generate(): string {
    // Check if we have any data collection blocks
    const hasDataCollBlocks = this.hasDataCollectionBlocks()
    console.log(`[CleanupFunctionGenerator] Model: ${this.modelName}, hasDataCollectionBlocks: ${hasDataCollBlocks}`)
    if (!hasDataCollBlocks) {
      console.log('[CleanupFunctionGenerator] No data collection blocks - skipping cleanup function generation')
      return ''
    }

    console.log('[CleanupFunctionGenerator] Generating cleanup function')
    let code = CCodeBuilder.generateCommentBlock([
      'Free allocated memory for data collection',
      'Call this when the model is no longer needed to prevent memory leaks'
    ])

    code += CCodeBuilder.generateFunctionHeader(
      'void',
      `${this.modelName}_cleanup`,
      [`${this.modelName}_t* model`]
    )

    code += this.generateDataCollectionCleanup()

    code += '}\n'
    return code
  }

  /**
   * Generate cleanup code for data collection buffers
   */
  private generateDataCollectionCleanup(): string {
    let code = '    /* Free data collection buffers */\n'

    for (const block of this.model.blocks) {
      try {
        const generator = BlockModuleFactory.getBlockModule(block.block.type)

        // Check if this block employs data collection
        if (generator.employsDataCollection && generator.employsDataCollection(block.block)) {
          // Generate cleanup code
          if (generator.generateDataCollectionCleanup) {
            const cleanupCode = generator.generateDataCollectionCleanup(block.block)
            if (cleanupCode && cleanupCode.trim()) {
              code += cleanupCode
            }
          }
        }
      } catch (error) {
        // Block type not supported for data collection
        continue
      }
    }

    code += '\n'
    return code
  }

  /**
   * Check if the model has any data collection blocks
   */
  private hasDataCollectionBlocks(): boolean {
    console.log(`[CleanupFunctionGenerator] Checking ${this.model.blocks.length} blocks for data collection`)
    const result = this.model.blocks.some(block => {
      try {
        console.log(`[CleanupFunctionGenerator] Checking block type: ${block.block.type}, name: ${block.block.name}`)
        const generator = BlockModuleFactory.getBlockModule(block.block.type)
        const employs = generator.employsDataCollection && generator.employsDataCollection(block.block)
        console.log(`[CleanupFunctionGenerator] Block ${block.block.name} employs data collection: ${employs}`)
        return employs
      } catch (error) {
        console.log(`[CleanupFunctionGenerator] Error checking block ${block.block.name}: ${error}`)
        return false
      }
    })
    console.log(`[CleanupFunctionGenerator] Final result: ${result}`)
    return result
  }
}
