// lib/codegen/SubsystemInfo.ts

import { Sheet } from '@/lib/simulationTypes'
import { ModelParameter } from '@/lib/modelSchema'
import { FlattenedModel, SubsystemEnableInfo } from './ModelFlattener'

/**
 * Port information for a subsystem's input or output
 */
export interface SubsystemPort {
  /** Original port name from the port block */
  name: string

  /** C-safe identifier for code generation */
  sanitizedName: string

  /** Data type: 'double', 'double[3]', 'double[3][3]', etc. */
  dataType: string

  /** Port index (0-based) matching the subsystem block's port order */
  index: number
}

/**
 * Complete information about a segregated subsystem for code generation.
 *
 * This structure captures everything needed to generate an independent
 * C module for a subsystem that uses the 'segregated' code generation strategy.
 *
 * Naming convention: We use "Subsystem" (not "SegregatedSubsystem") in C
 * typedefs and structure names since only segregated subsystems generate
 * these structures—flattened subsystems are inlined into the parent.
 */
export interface SubsystemInfo {
  // === Identity ===

  /** Unique block ID of the subsystem block */
  subsystemId: string

  /** Original block name (display name) */
  subsystemName: string

  /** C-safe identifier derived from subsystemName */
  sanitizedName: string

  // === Structure ===

  /** Original sheets from the subsystem (before internal flattening) */
  sheets: Sheet[]

  /**
   * Pre-flattened internal model of the subsystem.
   * This model has already processed any nested subsystems according to
   * their own codeGenStrategy (flatten or segregated).
   */
  flattenedModel: FlattenedModel

  // === Port Mappings ===

  /** Input port definitions in order */
  inputPorts: SubsystemPort[]

  /** Output port definitions in order */
  outputPorts: SubsystemPort[]

  // === Special Ports ===

  /** Whether the subsystem has an enable input (port index -1) */
  hasEnableInput: boolean

  /**
   * Whether any integrator inside has a reset port.
   * If true, a reset function should be generated.
   */
  hasResetInput?: boolean

  // === State Info ===

  /** Whether the subsystem contains stateful blocks (integrator, transfer_function) */
  hasState: boolean

  /** Total count of state variables within the subsystem */
  stateCount: number

  /** Type map for blocks within the subsystem (block originalId -> output type) */
  typeMap?: Map<string, string>

  // === Subsystem Parameters ===

  /** Subsystem-level parameters (for segregated subsystems) */
  parameters?: ModelParameter[]

  // === Parent Context ===

  /**
   * Path of subsystem names from root to this subsystem.
   * Empty array for top-level segregated subsystems.
   * Example: ['OuterSub', 'InnerSub'] for a nested subsystem.
   */
  parentPath: string[]

  /**
   * ID of the subsystem that controls this one's enable state.
   * Null if at root level or parent has no enable.
   */
  enableScope: string | null

  /**
   * Nested Action/Enable scopes *inside* this segregated module.
   * Copied from the module's internal flatten; parent must not own these.
   */
  subsystemEnableInfo?: SubsystemEnableInfo[]
}

/**
 * Result of analyzing a segregated subsystem
 */
export interface SubsystemAnalysisResult {
  /** The analyzed subsystem info */
  info: SubsystemInfo

  /** Any warnings generated during analysis */
  warnings: string[]
}
