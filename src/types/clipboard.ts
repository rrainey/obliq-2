/**
 * Feature 5: Block Cut/Copy and Paste - Clipboard Data Types
 *
 * Defines the data format for clipboard operations, supporting:
 * - Copying blocks and wires within a model
 * - Pasting to same sheet, different sheets, or across browser tabs
 * - Dependency tracking for parameters and subsystems
 */

import { BlockData } from '@/components/BlockNode'
import { WireData } from '@/components/Wire'
import { ModelParameter } from '@/lib/modelSchema'
import { Sheet } from '@/components/SheetTabs'

/**
 * Clipboard data format for block copy/paste operations
 */
export interface ClipboardData {
  /** Format version for compatibility checking */
  version: '1.0'

  /** Source model ID (for cross-model paste detection) */
  sourceModelId?: string

  /** Source sheet ID (for same-sheet paste detection) */
  sourceSheetId?: string

  /** Timestamp when copy was performed */
  timestamp: number

  /** Copied blocks (deep cloned with original IDs) */
  blocks: BlockData[]

  /** Wires between copied blocks only */
  wires: WireData[]

  /** Dependencies required by copied blocks */
  dependencies: ClipboardDependencies
}

/**
 * Dependencies that copied blocks may require
 */
export interface ClipboardDependencies {
  /** Parameters referenced by Source blocks (useParameter) or Evaluate expressions */
  parameters: ModelParameter[]

  /** Subsystem sheets (if any copied block is a subsystem) */
  subsystemSheets?: Sheet[]
}

/**
 * Result of checking dependencies before paste
 */
export interface DependencyCheckResult {
  /** Parameters referenced in clipboard but missing from target model */
  missingParameters: ModelParameter[]

  /** Subsystem sheet names that are missing */
  missingSubsystems: string[]

  /** Whether all dependencies are satisfied */
  allSatisfied: boolean
}

/**
 * Options for paste operation
 */
export interface PasteOptions {
  /** Position to paste at (canvas coordinates) */
  position?: { x: number; y: number }

  /** Offset from original positions (default: 20, 20) */
  offset?: { x: number; y: number }

  /** Whether to auto-import missing parameters */
  importMissingParameters?: boolean

  /** Whether to auto-import missing subsystem sheets */
  importMissingSubsystems?: boolean
}

/**
 * Result of a paste operation
 */
export interface PasteResult {
  /** Whether paste was successful */
  success: boolean

  /** IDs of newly pasted blocks */
  pastedBlockIds: string[]

  /** IDs of newly pasted wires */
  pastedWireIds: string[]

  /** Parameters that were imported */
  importedParameters?: ModelParameter[]

  /** Subsystem sheets that were imported */
  importedSubsystems?: Sheet[]

  /** Error message if paste failed */
  error?: string

  /** Dependency issues that need resolution */
  dependencyIssues?: DependencyCheckResult
}

/**
 * ID mapping from original to new IDs during paste
 */
export interface IdMapping {
  blocks: Map<string, string>  // oldBlockId -> newBlockId
  wires: Map<string, string>   // oldWireId -> newWireId
}

/**
 * localStorage key for cross-tab clipboard
 */
export const CLIPBOARD_STORAGE_KEY = 'obliq-clipboard'

/**
 * Validates clipboard data format
 */
export function isValidClipboardData(data: unknown): data is ClipboardData {
  if (!data || typeof data !== 'object') return false

  const clipboard = data as Partial<ClipboardData>

  return (
    clipboard.version === '1.0' &&
    typeof clipboard.timestamp === 'number' &&
    Array.isArray(clipboard.blocks) &&
    Array.isArray(clipboard.wires) &&
    clipboard.dependencies !== undefined &&
    Array.isArray(clipboard.dependencies.parameters)
  )
}

/**
 * Serializes clipboard data for localStorage
 */
export function serializeClipboard(data: ClipboardData): string {
  return JSON.stringify(data)
}

/**
 * Deserializes clipboard data from localStorage
 */
export function deserializeClipboard(json: string): ClipboardData | null {
  try {
    const data = JSON.parse(json)
    if (isValidClipboardData(data)) {
      return data
    }
    console.warn('Invalid clipboard data format')
    return null
  } catch (error) {
    console.error('Failed to parse clipboard data:', error)
    return null
  }
}
