// lib/multiSheetTypeValidator.ts

import { BlockData } from '@/components/BlockNode'
import { WireData } from '@/components/Wire'
import { propagateSignalTypesMultiSheet, validateSignalTypes } from './signalTypePropagation'

export interface MultiSheetValidationResult {
  errors: Array<{
    sheetId?: string
    blockId?: string
    wireId?: string
    message: string
  }>
  warnings: Array<{
    sheetId?: string
    blockId?: string
    wireId?: string
    message: string
  }>
}

export interface SheetData {
  id: string
  blocks: BlockData[]
  connections: WireData[]
}

/**
 * Validates type compatibility across multiple sheets
 */
export function validateMultiSheetTypeCompatibility(sheets: SheetData[]): MultiSheetValidationResult {
  const errors: MultiSheetValidationResult['errors'] = []
  const warnings: MultiSheetValidationResult['warnings'] = []
  
  // Run multi-sheet type propagation
  const sheetsForPropagation = sheets.map(sheet => ({
    blocks: sheet.blocks,
    connections: sheet.connections
  }))
  
  const propagationResult = propagateSignalTypesMultiSheet(sheetsForPropagation)
  
  // Convert propagation errors to validation errors
  for (const error of propagationResult.errors) {
    // Find which sheet this error belongs to
    let sheetId: string | undefined
    if (error.blockId) {
      const sheet = sheets.find(s => s.blocks.some(b => b.id === error.blockId))
      sheetId = sheet?.id
    } else if (error.wireId) {
      const sheet = sheets.find(s => s.connections.some(w => w.id === error.wireId))
      sheetId = sheet?.id
    }
    
    if (error.severity === 'error') {
      errors.push({
        sheetId,
        blockId: error.blockId,
        wireId: error.wireId,
        message: error.message
      })
    } else {
      warnings.push({
        sheetId,
        blockId: error.blockId,
        wireId: error.wireId,
        message: error.message
      })
    }
  }
  
  // Additional validation from validateSignalTypes
  const additionalErrors = validateSignalTypes(propagationResult)
  for (const error of additionalErrors) {
    let sheetId: string | undefined
    if (error.blockId) {
      const sheet = sheets.find(s => s.blocks.some(b => b.id === error.blockId))
      sheetId = sheet?.id
    } else if (error.wireId) {
      const sheet = sheets.find(s => s.connections.some(w => w.id === error.wireId))
      sheetId = sheet?.id
    }
    
    if (error.severity === 'error') {
      errors.push({
        sheetId,
        blockId: error.blockId,
        wireId: error.wireId,
        message: error.message
      })
    } else {
      warnings.push({
        sheetId,
        blockId: error.blockId,
        wireId: error.wireId,
        message: error.message
      })
    }
  }
  
  // Check for unconnected required inputs (per sheet)
  for (const sheet of sheets) {
    for (const block of sheet.blocks) {
      // Skip certain block types that don't require inputs
      if (['source', 'input_port', 'sheet_label_source'].includes(block.type)) {
        continue
      }
      
      // Check if block has required inputs (respects sum/multiply configured arity —
      // e.g. Sum of Elements with numInputs/signs length 1 and a non-scalar feed).
      const requiredInputs = getRequiredInputCount(block)
      const connectedInputs = sheet.connections.filter(w => w.targetBlockId === block.id).length
      
      if (connectedInputs < requiredInputs) {
        warnings.push({
          sheetId: sheet.id,
          blockId: block.id,
          message: `Block "${block.name}" has ${connectedInputs} of ${requiredInputs} required inputs connected`
        })
      }
    }
  }
  
  return { errors, warnings }
}

function configuredArithmeticArity(block: { parameters?: Record<string, unknown> }): number {
  const signs = block.parameters?.signs
  if (typeof signs === 'string' && signs.length > 0) return signs.length
  const n = block.parameters?.numInputs ?? block.parameters?.inputCount
  if (typeof n === 'number' && n >= 1) return n
  return 2
}

function getRequiredInputCount(block: { type: string; parameters?: Record<string, unknown> }): number {
  switch (block.type) {
    case 'sum':
    case 'multiply':
      // Sum of Elements (signs '+' / numInputs 1) legitimately has one input when
      // that input is a vector/matrix; do not require a second port.
      return configuredArithmeticArity(block)
    case 'lookup_2d':
      return 2
    case 'scale':
    case 'transfer_function':
    case 'signal_display':
    case 'signal_logger':
    case 'output_port':
    case 'lookup_1d':
    case 'sheet_label_sink':
    case 'square':
      return 1
    case 'subsystem':
      return 1 // Default, but depends on configuration
    default:
      return 0
  }
}