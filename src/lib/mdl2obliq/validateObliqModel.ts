/**
 * Run the same validation the Obliq UI "Validate Model" button uses,
 * against an emitted mdl2obliq model.
 */

import { BlockData } from '@/components/BlockNode'
import { WireData } from '@/components/Wire'
import {
  validateModelTypeCompatibilityMultiSheet,
  formatTypeError,
  TypeCompatibilityError
} from '@/lib/typeCompatibilityValidator'

export interface ObliqModelValidationResult {
  valid: boolean
  errors: TypeCompatibilityError[]
  warnings: TypeCompatibilityError[]
  /** Human-readable report (UI modal style) */
  report: string
}

export function validateEmittedObliqModel(model: {
  sheets?: Array<{
    blocks?: BlockData[]
    connections?: WireData[]
  }>
}): ObliqModelValidationResult {
  const sheets = (model.sheets || []).map(s => ({
    blocks: s.blocks || [],
    connections: s.connections || []
  }))

  const result = validateModelTypeCompatibilityMultiSheet(sheets)

  const header = `Model Validation Results\n${'='.repeat(25)}\nErrors: ${result.errors.length}, Warnings: ${result.warnings.length}\n\n`
  const errLines = result.errors.map(e => `[ERROR] ${formatTypeError(e)}`)
  const warnLines = result.warnings.map(e => `[WARNING] ${e.message}`)

  return {
    valid: result.valid,
    errors: result.errors,
    warnings: result.warnings,
    report: header + [...errLines, ...warnLines].join('\n')
  }
}
