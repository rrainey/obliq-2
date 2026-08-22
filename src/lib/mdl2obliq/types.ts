/**
 * Intermediate representation for Simulink R2006b-era `.mdl` text models.
 * Used by the mdl2obliq translator (Phase 0+).
 */

export interface MdlPosition {
  x: number
  y: number
  x2?: number
  y2?: number
}

export interface MdlBlock {
  /** Raw BlockType (SubSystem, Sum, Reference, …) */
  blockType: string
  /** Display name (newlines normalized to `\n`) */
  name: string
  /** Flat parameter map (string values as stored) */
  params: Record<string, string>
  /** Nested System for SubSystem / Model */
  system?: MdlSystem
  /** SourceType when BlockType=Reference */
  sourceType?: string
  /** SourceBlock library path when Reference */
  sourceBlock?: string
  position?: MdlPosition
}

export interface MdlLine {
  srcBlock: string
  srcPort: number
  dstBlock: string
  /**
   * 1-based Simulink data port index. Unused when `dstSpecial` is set
   * (trigger/enable lines are not data ports).
   */
  dstPort: number
  /**
   * Non-numeric DstPort from MDL: `"trigger"` / `"enable"` on
   * Triggered/Enabled subsystems. Obliq maps these to enable pin (−1).
   */
  dstSpecial?: 'trigger' | 'enable'
  /** Raw params for diagnostics */
  params: Record<string, string>
}

export interface MdlSystem {
  name: string
  blocks: MdlBlock[]
  lines: MdlLine[]
  params: Record<string, string>
}

export interface MdlModel {
  /** File path if known */
  path?: string
  name: string
  /** Root System (usually wraps one top SubSystem) */
  root: MdlSystem
  /** Model-level params */
  params: Record<string, string>
}

/** Mapping status for coverage reports */
export type MapStatus =
  | 'MAPPED'
  | 'EXPAND'
  | 'NEED_BLOCK'
  | 'PASSTHROUGH'
  | 'IGNORE'
  | 'UNMAPPED'

export interface CoverageRow {
  kind: 'BlockType' | 'SourceType'
  key: string
  count: number
  status: MapStatus
  obliqType?: string
  notes?: string
}
