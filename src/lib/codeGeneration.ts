// lib/codeGeneration.ts - DEPRECATED
// This file is maintained for backward compatibility only
// Please use lib/codeGenerationNew.ts instead

import { Sheet } from '@/lib/simulationEngine'
import { ModelCodeGenerator } from './codeGenerationNew'

/**
 * @deprecated Use ModelCodeGenerator from lib/codeGenerationNew.ts instead
 * This function is maintained only for backward compatibility
 */
export function generateCCode(
  sheets: Sheet[],
  modelName: string = 'model'
): {
  header: string
  source: string
} {
  console.warn(
    'generateCCode is deprecated. Please use ModelCodeGenerator from lib/codeGenerationNew.ts instead.'
  )
  
  const generator = new ModelCodeGenerator({ modelName })
  const result = generator.generateCode(sheets, modelName)
  
  return {
    header: result.header,
    source: result.source
  }
}

/**
 * @deprecated This is a stub for the old implementation
 * The new system handles all block types through the modular architecture
 */
export function generateBlockCode(block: any, inputs: string[]): string {
  console.warn(
    'generateBlockCode is deprecated. Block-specific code generation is now handled by the modular system.'
  )
  
  // This would normally throw an error, but for migration purposes,
  // we'll return a comment
  return `/* Legacy block code generation not supported - please use new system */`
}

/**
 * Export notice for developers
 */
export const DEPRECATION_NOTICE = `
This module (lib/codeGeneration.ts) is deprecated as of the code generation refactoring.
Please migrate to the new modular system in lib/codeGenerationNew.ts.

Key changes:
1. Code generation is now modular with separate generators per block type
2. Multi-sheet models are flattened before code generation
3. Subsystem enable functionality is fully supported
4. Better error handling and warnings

Migration guide available in docs/migration-guide.md
`