// lib/codegen/ModelFlattener.ts

import { BlockData } from '@/components/BlockNode'
import { WireData } from '@/components/Wire'
import { Sheet } from '@/lib/simulationTypes'
import { CCodeBuilder } from '@/lib/codegen/CCodeBuilder'
import { ModelParameter } from '@/lib/modelSchema'
import { DataStoreDeclaration, collectDataStores } from '@/lib/dataStoreUtils'
import { SubsystemInfo, SubsystemPort } from './SubsystemInfo'
import { TypePropagator } from './TypePropagator'
import {
  SheetLabelRef,
  collectSheetLabels,
  computeCrossingTags,
  promoteCrossingPortsOnSubsystem,
  inferTagDataTypes
} from './crossingTagPorts'
/**
 * A flattened block includes the original block data plus hierarchy information
 */
export interface FlattenedBlock {
  /** Original block data */
  block: BlockData

  /** Unique flattened name (e.g., "Subsystem1_Controller_Sum1") */
  flattenedName: string

  /** Path of subsystem IDs to reach this block (empty for root level) */
  subsystemPath: string[]

  /** ID of the subsystem that controls this block's enable state (null for root) */
  enableScope: string | null

  /**
   * Discrete sample period in seconds (MDL SampleTime / SystemSampleTime).
   * null = every fundamental step (continuous / inherited-none).
   */
  sampleScope: number | null

  /** Original sheet ID where this block resides */
  originalSheetId: string

  /** Original block ID (preserved for connection mapping) */
  originalId: string

  /**
   * Whether this block represents a segregated subsystem.
   * If true, the subsystem's internals are NOT flattened; instead,
   * separate code will be generated and this block becomes a function call.
   */
  isSegregated?: boolean
}

/**
 * Block view for codegen: flattened name + inherited sampleScope merged into
 * parameters.sampleTimeSec so discrete modules (unit_delay, rate_limiter, …)
 * see the same Ts in header, init, and algebraic step generation.
 */
export function withFlattenedSampleParams(block: FlattenedBlock): BlockData {
  const sampleScope = block.sampleScope
  return {
    ...block.block,
    name: block.flattenedName,
    parameters: {
      ...(block.block.parameters || {}),
      ...(typeof sampleScope === 'number' && sampleScope > 0
        ? { sampleTimeSec: sampleScope }
        : {})
    }
  }
}

/**
 * A flattened connection with remapped block IDs
 */
export interface FlattenedConnection {
  /** Unique ID for this connection */
  id: string
  
  /** Source block ID (remapped if through subsystem ports) */
  sourceBlockId: string
  
  /** Source port index */
  sourcePortIndex: number
  
  /** Target block ID (remapped if through subsystem ports) */
  targetBlockId: string
  
  /** Target port index */
  targetPortIndex: number
  
  /** Original wire ID for reference */
  originalWireId: string
  
  /** Connection type for debugging */
  connectionType: 'direct' | 'subsystem_input' | 'subsystem_output' | 'sheet_label'
}

/**
 * Complete flattened model ready for code generation
 */
export interface FlattenedModel {
  /** All blocks from all sheets, flattened */
  blocks: FlattenedBlock[]

  /** All connections with remapped IDs */
  connections: FlattenedConnection[]

  /** Map from original block ID to flattened block */
  blockMap: Map<string, FlattenedBlock>

  /** Map from original block ID to enable scope */
  enableScopes: Map<string, string | null>

  /** Information about subsystems with enable inputs */
  subsystemEnableInfo: SubsystemEnableInfo[]

  /**
   * Segregated subsystems that generate their own C modules.
   * These subsystems were NOT flattened; their blocks remain inside
   * their own flattenedModel for separate code generation.
   */
  segregatedSubsystems: SubsystemInfo[]

  /** Global model parameters (Feature 3) */
  parameters: ModelParameter[]

  /** Model-scoped data stores (shared named signals) */
  dataStores?: DataStoreDeclaration[]

  /** Model metadata */
  metadata: {
    modelName: string
    totalBlocks: number
    totalConnections: number
    subsystemCount: number
    maxNestingDepth: number
  }
}

/**
 * Information about a subsystem's enable signal
 */
export interface SubsystemEnableInfo {
  /** Subsystem block ID */
  subsystemId: string
  
  /** Flattened name of the subsystem */
  subsystemName: string
  
  /** Whether this subsystem has an enable input */
  hasEnableInput: boolean

  /**
   * 'rising' = Simulink TriggerPort (fire one step on 0→1).
   * 'level' (default) = EnablePort (active while nonzero).
   */
  enableEdge?: 'rising' | 'level'
  
  /** Wire that connects to the enable input (if any) */
  enableWire?: FlattenedConnection
  
  /** Parent subsystem ID (null for root level) */
  parentSubsystemId: string | null
  
  /** IDs of all blocks controlled by this subsystem's enable */
  controlledBlockIds: string[]
}

/**
 * Port mapping for subsystem boundary crossing
 */
export interface SubsystemPortMapping {
  /** Subsystem block ID */
  subsystemId: string
  
  /** Map from input port index to internal input port block ID */
  inputPorts: Map<number, string>
  
  /** Map from output port index to internal output port block ID */
  outputPorts: Map<number, string>
  
  /** Enable port info if subsystem has enable input */
  enablePort?: {
    /** Internal wire or block providing enable signal */
    internalEnableBlockId?: string
  }

  /** Whether this subsystem is segregated (keeps blocks separate for code gen) */
  isSegregated?: boolean
}

/**
 * Sheet label connection info for resolving cross-sheet connections
 */
export interface SheetLabelConnection {
  /** Signal name */
  signalName: string
  
  /** Scope (subsystem ID or 'root') */
  scope: string
  
  /** Sink block info */
  sink?: {
    blockId: string
    inputWireId: string
  }
  
  /** Source block IDs (can be multiple) */
  sourceBlockIds: string[]
}

/**
 * Options for model flattening
 */
export interface ModelFlattenerOptions {
  /** Whether to preserve original block names in comments */
  preserveOriginalNames?: boolean
  
  /** Whether to generate enable tracking code */
  generateEnableTracking?: boolean
  
  /** Prefix for flattened names */
  namePrefix?: string
  
  /** Separator for hierarchical names */
  nameSeparator?: string
}

/**
 * Result of flattening operation with diagnostics
 */
export interface FlatteningResult {
  /** The flattened model */
  model: FlattenedModel
  
  /** Any warnings generated during flattening */
  warnings: string[]
  
  /** Diagnostic information */
  diagnostics: {
    blocksFlattened: number
    connectionsRemapped: number
    subsystemsProcessed: number
    sheetLabelsResolved: number
    enableScopesCreated: number
  }
}

/**
 * Model flattener class implementation begins
 */
export class ModelFlattener {
  private options: Required<ModelFlattenerOptions>
  private warnings: string[] = []
  private blockMap = new Map<string, FlattenedBlock>()
  private enableScopes = new Map<string, string | null>()
  private subsystemEnableInfo: SubsystemEnableInfo[] = []
  private segregatedSubsystems: SubsystemInfo[] = []
  /** All Goto/From refs in the model (collected once per flatten). */
  private allSheetLabels: SheetLabelRef[] = []
  /** Host/model-level parameters (for PARAM_* emission inside segregated modules). */
  private modelParameters: ModelParameter[] = []
  /**
   * Export tag name → segregated subsystem output (for parent From resolution
   * when the Goto lives inside an opaque segregated module).
   */
  private segregatedExportBySignal = new Map<
    string,
    { subsystemId: string; portIndex: number }
  >()

  constructor(options: ModelFlattenerOptions = {}) {
    this.options = {
      preserveOriginalNames: options.preserveOriginalNames ?? true,
      generateEnableTracking: options.generateEnableTracking ?? true,
      namePrefix: options.namePrefix ?? '',
      nameSeparator: options.nameSeparator ?? '_'
    }
  }
  
  /**
   * Build enable scopes for all blocks based on subsystem hierarchy
   */
  buildEnableScopes(
    sheets: Sheet[],
    subsystemId: string | null = null,
    parentEnableScope: string | null = null,
    subsystemPath: string[] = []
  ): void {
    for (const sheet of sheets) {
      for (const block of sheet.blocks) {
        if (block.type === 'subsystem') {
          // Check if this subsystem has enable input
          const hasEnableInput = block.parameters?.showEnableInput === true
          const currentEnableScope = hasEnableInput ? block.id : parentEnableScope

          // Create subsystem enable info with correct flattened name
          const enableInfo: SubsystemEnableInfo = {
            subsystemId: block.id,
            subsystemName: this.generateFlattenedName(block.name, subsystemPath),
            hasEnableInput,
            enableEdge:
              block.parameters?.enableEdge === 'rising' ? 'rising' : 'level',
            parentSubsystemId: subsystemId,
            controlledBlockIds: []
          }

          this.subsystemEnableInfo.push(enableInfo)

          // Nested enables inside a segregated/atomic module belong to that
          // module's own flatten — do not register them on the parent.
          const childStrategy =
            (block.parameters?.codeGenStrategy as string) || 'flatten'
          const childIsSegregated =
            childStrategy === 'segregated' ||
            childStrategy === 'segregated_atomic' ||
            childStrategy === 'native'

          if (block.parameters?.sheets && !childIsSegregated) {
            this.buildEnableScopes(
              block.parameters.sheets as Sheet[],
              block.id,
              currentEnableScope,
              [...subsystemPath, block.name]
            )
          }
        } else {
          // Regular block inherits enable scope
          this.enableScopes.set(block.id, parentEnableScope)
        }
      }
    }
  }
  
  /**
   * Find the wire that connects to a subsystem's enable port
   */
  private findEnableWire(
    subsystemId: string,
    connections: WireData[],
    sheet: Sheet
  ): WireData | undefined {
    // Enable port is a special port, not counted in regular input indices
    // We need to find a wire that targets the subsystem with a special enable port index
    // For now, we'll use a convention that enable port has index -1 or a special marker
    
    return connections.find(wire => 
      wire.targetBlockId === subsystemId && 
      wire.targetPortIndex === -1 // Special index for enable port
    )
  }
  
  /**
   * Resolve discrete sample period for a block given parent subsystem period.
   * Explicit parameters.sampleTimeSec wins; else inherit parent; else null (every step).
   *
   * HSL 0.04 s must be set as an explicit sampleTimeSec on the Obliq model
   * (see mdl2obliq applyHslModelLevel) — not inferred from subsystem name.
   */
  private resolveSampleScope(
    block: BlockData,
    parentSampleScope: number | null
  ): number | null {
    const raw = block.parameters?.sampleTimeSec
    if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) {
      return raw
    }
    return parentSampleScope
  }

  /**
   * Generate a flattened name from block name and subsystem path
   */
  private generateFlattenedName(blockName: string, subsystemPath: string[]): string {
    const parts: string[] = []
    
    if (this.options.namePrefix) {
      parts.push(this.options.namePrefix)
    }
    
    parts.push(...subsystemPath)
    parts.push(CCodeBuilder.sanitizeIdentifier(blockName))
    
    return parts.join(this.options.nameSeparator)
  }
  
  /**
   * Add a warning message
   */
  private addWarning(message: string): void {
    this.warnings.push(message)
  }

  /**
   * Analyze a segregated subsystem and create its SubsystemInfo.
   * This flattens the subsystem's internal structure (respecting nested strategies)
   * but keeps it separate from the parent model.
   */
  private analyzeSegregatedSubsystem(
    block: BlockData,
    subsystemSheets: Sheet[],
    parentPath: string[],
    parentEnableScope: string | null,
    /** Scoped id used in the parent flattened model (must match FlattenedBlock.originalId). */
    scopedSubsystemId?: string
  ): SubsystemInfo {
    // Extract subsystem-level parameters (if any)
    const subsystemParameters: ModelParameter[] = block.parameters?.parameters || []

    // Create a sub-flattener for the subsystem's internal structure
    // Pass subsystem's parameters (not parent model parameters) for this scope
    const subFlattener = new ModelFlattener(this.options)
    const subResult = subFlattener.flattenModel(subsystemSheets, block.name, subsystemParameters)

    // Collect warnings from sub-flattening
    this.warnings.push(...subResult.warnings.map(w => `[${block.name}] ${w}`))

    // Extract input port information
    const inputPorts: SubsystemPort[] = this.extractSubsystemPorts(
      subResult.model,
      'input_port',
      block.parameters?.inputPorts as string[] || []
    )

    // Extract output port information
    const outputPorts: SubsystemPort[] = this.extractSubsystemPorts(
      subResult.model,
      'output_port',
      block.parameters?.outputPorts as string[] || []
    )

    // Check for stateful blocks (integrator, transfer_function)
    const statefulBlocks = subResult.model.blocks.filter(b =>
      b.block.type === 'transfer_function' || b.block.type === 'integrator'
    )
    const hasState = statefulBlocks.length > 0
    const stateCount = this.countStateVariables(statefulBlocks)

    // Check for integrators with reset ports
    const hasResetInput = subResult.model.blocks.some(b =>
      b.block.type === 'integrator' && b.block.parameters?.showResetInput === true
    )

    // Propagate types through the subsystem's internal model
    const typePropagator = new TypePropagator(subResult.model)
    const typeMap = typePropagator.propagate()

    // Update port types based on type propagation (input + output)
    for (const port of [...inputPorts, ...outputPorts]) {
      const portBlock = subResult.model.blocks.find(b =>
        (b.block.type === 'input_port' || b.block.type === 'output_port') &&
        (b.block.parameters?.portName === port.name || b.block.name === port.name)
      )
      if (portBlock) {
        const propagatedType = typeMap.get(portBlock.originalId)
        if (propagatedType && propagatedType !== 'double') {
          port.dataType = propagatedType
        } else if (portBlock.block.parameters?.dataType) {
          port.dataType = portBlock.block.parameters.dataType as string
        }
      }
    }

    // Host model parameters are visible to Source blocks via PARAM_* macros;
    // subsystem-local parameters override on name collision.
    const hostParams = this.modelParameters || []
    const mergedParams = [
      ...hostParams,
      ...subsystemParameters.filter(
        sp => !hostParams.some(hp => hp.name === sp.name)
      )
    ]

    return {
      // Must match FlattenedBlock.originalId so parent call-site lookup succeeds
      subsystemId: scopedSubsystemId || block.id,
      subsystemName: block.name,
      sanitizedName: CCodeBuilder.sanitizeIdentifier(block.name),
      sheets: subsystemSheets,
      flattenedModel: subResult.model,
      inputPorts,
      outputPorts,
      hasEnableInput: block.parameters?.showEnableInput ?? false,
      hasResetInput,
      hasState,
      stateCount,
      typeMap,
      parameters: mergedParams,
      parentPath,
      enableScope: parentEnableScope,
      // Nested Action/Enable scopes live in the module, not the parent
      subsystemEnableInfo: subResult.model.subsystemEnableInfo || []
    }
  }

  /**
   * Extract port information from a flattened subsystem model
   */
  private extractSubsystemPorts(
    model: FlattenedModel,
    portType: 'input_port' | 'output_port',
    portNames: string[]
  ): SubsystemPort[] {
    const ports: SubsystemPort[] = []

    for (let index = 0; index < portNames.length; index++) {
      const portName = portNames[index]

      // Find the port block in the flattened model (portName or block name)
      const portBlock = model.blocks.find(
        b =>
          b.block.type === portType &&
          (b.block.parameters?.portName === portName || b.block.name === portName)
      )

      const dataType = portBlock?.block.parameters?.dataType || 'double'

      ports.push({
        name: portName,
        sanitizedName: CCodeBuilder.sanitizeIdentifier(portName),
        dataType,
        index
      })
    }

    return ports
  }

  /**
   * Count the total number of state variables in a set of stateful blocks
   */
  private countStateVariables(statefulBlocks: FlattenedBlock[]): number {
    let count = 0

    for (const block of statefulBlocks) {
      if (block.block.type === 'integrator') {
        // Integrator has 1 state per element
        const dataType = block.block.parameters?.dataType || 'double'
        count += this.countElementsFromType(dataType)
      } else if (block.block.type === 'transfer_function') {
        // Transfer function has (denominator.length - 1) states per element
        const denominator = block.block.parameters?.denominator || [1, 1]
        const stateOrder = Math.max(0, denominator.length - 1)
        const dataType = block.block.parameters?.dataType || 'double'
        count += stateOrder * this.countElementsFromType(dataType)
      }
    }

    return count
  }

  /**
   * Count the number of elements in a data type (1 for scalar, N for vector, N*M for matrix)
   */
  private countElementsFromType(dataType: string): number {
    const matrixMatch = dataType.match(/\[(\d+)\]\[(\d+)\]/)
    if (matrixMatch) {
      return parseInt(matrixMatch[1]) * parseInt(matrixMatch[2])
    }

    const vectorMatch = dataType.match(/\[(\d+)\]/)
    if (vectorMatch) {
      return parseInt(vectorMatch[1])
    }

    return 1 // scalar
  }

  /**
   * Flatten all subsystems recursively.
   *
   * @param idPrefix - Prefix applied to block/wire IDs so nested subsystem
   *   contents never collide with parent-sheet IDs (e.g. both having source_1).
   *   Root calls use ''; each flattened child uses `${parentPrefix}${subId}__`.
   */
  flattenSubsystems(
    sheets: Sheet[],
    subsystemPath: string[] = [],
    parentEnableScope: string | null = null,
    parentSheetId: string = 'root',
    idPrefix: string = '',
    parentSampleScope: number | null = null
  ): {
    blocks: FlattenedBlock[],
    connections: WireData[],
    portMappings: Map<string, SubsystemPortMapping>
  } {
    const flattenedBlocks: FlattenedBlock[] = []
    const allConnections: WireData[] = []
    const portMappings = new Map<string, SubsystemPortMapping>()
    
    for (const sheet of sheets) {
      // Process blocks in this sheet
      for (const block of sheet.blocks) {
        const scopedBlockId = idPrefix + block.id

        if (block.type === 'subsystem') {
          // Handle subsystem block
          const hasEnableInput = block.parameters?.showEnableInput === true
          const currentEnableScope = hasEnableInput
            ? scopedBlockId
            : parentEnableScope
          const currentSampleScope = this.resolveSampleScope(
            block,
            parentSampleScope
          )

          // Check code generation strategy
          const codeGenStrategy = block.parameters?.codeGenStrategy || 'flatten'

          // Create port mapping for this subsystem (key = how parents address it)
          const portMapping: SubsystemPortMapping = {
            subsystemId: scopedBlockId,
            inputPorts: new Map(),
            outputPorts: new Map()
          }

          // Process subsystem's internal sheets
          if (block.parameters?.sheets) {
            let subsystemSheets = block.parameters.sheets as Sheet[]
            const newPath = [...subsystemPath, block.name]
            const childPrefix = `${scopedBlockId}__`

            // Declared port name lists (may be extended by crossing-tag promotion)
            let declaredInputs: string[] = [...(block.parameters.inputPorts as string[] || [])]
            let declaredOutputs: string[] = [...(block.parameters.outputPorts as string[] || [])]

            // Crossing exports for this subsystem (Goto inside / From outside)
            let crossingExports: string[] = []

            // For segregated*: auto-promote crossing Goto/From tags to ports and
            // rewrite sheets so internal Froms/Gotos bind to those ports.
            if (codeGenStrategy === 'segregated' || codeGenStrategy === 'segregated_atomic') {
              const crossing = computeCrossingTags(this.allSheetLabels, newPath)
              crossingExports = crossing.exports
              // Prefer structural inference (Goto driver types) over bare label params
              const typeHints = inferTagDataTypes(sheets)
              for (const lab of this.allSheetLabels) {
                if (lab.dataType && !typeHints.has(lab.signalName)) {
                  typeHints.set(lab.signalName, lab.dataType)
                }
              }
              if (crossing.imports.length > 0 || crossing.exports.length > 0) {
                const promoted = promoteCrossingPortsOnSubsystem(
                  declaredInputs,
                  declaredOutputs,
                  subsystemSheets,
                  crossing,
                  typeHints
                )
                declaredInputs = promoted.inputPorts
                declaredOutputs = promoted.outputPorts
                subsystemSheets = promoted.sheets
                if (promoted.addedInputs.length || promoted.addedOutputs.length) {
                  this.addWarning(
                    `[${block.name}] Auto-promoted crossing tags → ports` +
                      (promoted.addedInputs.length
                        ? ` in=[${promoted.addedInputs.join(',')}]`
                        : '') +
                      (promoted.addedOutputs.length
                        ? ` out=[${promoted.addedOutputs.join(',')}]`
                        : '')
                  )
                }
              }
            }

            // Find input/output port blocks inside subsystem (needed for both strategies)
            for (const subSheet of subsystemSheets) {
              for (const subBlock of subSheet.blocks) {
                if (subBlock.type === 'input_port') {
                  const portName = subBlock.parameters?.portName
                  // Match portName or uniquified block.name against inputPorts list
                  let portIndex = declaredInputs.indexOf(portName)
                  if (portIndex < 0) {
                    portIndex = declaredInputs.indexOf(subBlock.name)
                  }
                  if (portIndex >= 0) {
                    portMapping.inputPorts.set(
                      portIndex,
                      childPrefix + subBlock.id
                    )
                  }
                } else if (subBlock.type === 'output_port') {
                  const portName = subBlock.parameters?.portName
                  let portIndex = declaredOutputs.indexOf(portName)
                  if (portIndex < 0) {
                    portIndex = declaredOutputs.indexOf(subBlock.name)
                  }
                  if (portIndex >= 0) {
                    portMapping.outputPorts.set(
                      portIndex,
                      childPrefix + subBlock.id
                    )
                  }
                }
              }
            }

            if (codeGenStrategy === 'segregated' || codeGenStrategy === 'segregated_atomic') {
              // Mark as segregated so connection processing skips internal wire lookup
              portMapping.isSegregated = true

              // Block view with promoted port lists (do not mutate caller's JSON)
              const segregatedBlock: BlockData = {
                ...block,
                id: scopedBlockId,
                parameters: {
                  ...block.parameters,
                  inputPorts: declaredInputs,
                  outputPorts: declaredOutputs,
                  sheets: subsystemSheets,
                  showPortNames: true
                }
              }

              // SEGREGATED: Don't flatten - collect for separate code generation
              const subsystemInfo = this.analyzeSegregatedSubsystem(
                segregatedBlock,
                subsystemSheets,
                newPath,
                currentEnableScope,
                scopedBlockId
              )
              this.segregatedSubsystems.push(subsystemInfo)

              // Register crossing exports so parent From(tag) → module.outputs.tag
              for (const exportName of crossingExports) {
                const port = subsystemInfo.outputPorts.find(p => p.name === exportName)
                if (port && !this.segregatedExportBySignal.has(exportName)) {
                  this.segregatedExportBySignal.set(exportName, {
                    subsystemId: scopedBlockId,
                    portIndex: port.index
                  })
                }
              }

              // Add the subsystem as a placeholder block (not flattened)
              const flattenedBlock: FlattenedBlock = {
                block: segregatedBlock,
                flattenedName: this.generateFlattenedName(block.name, subsystemPath),
                subsystemPath: [...subsystemPath],
                enableScope: parentEnableScope,
                sampleScope: currentSampleScope,
                originalSheetId: sheet.id,
                originalId: scopedBlockId,
                isSegregated: true
              }
              flattenedBlocks.push(flattenedBlock)
              this.blockMap.set(scopedBlockId, flattenedBlock)
              this.enableScopes.set(scopedBlockId, parentEnableScope)

            } else {
              // FLATTEN: Recursively flatten subsystem contents with unique ID prefix
              const subsystemResult = this.flattenSubsystems(
                subsystemSheets,
                newPath,
                currentEnableScope,
                sheet.id,
                childPrefix,
                currentSampleScope
              )

              flattenedBlocks.push(...subsystemResult.blocks)
              allConnections.push(...subsystemResult.connections)

              // Merge port mappings (already uniquely keyed via childPrefix)
              subsystemResult.portMappings.forEach((mapping, id) => {
                portMappings.set(id, mapping)
              })
            }
          }

          portMappings.set(scopedBlockId, portMapping)

          // Update subsystem enable info with controlled blocks + unique IDs
          const enableInfo = this.subsystemEnableInfo.find(
            info =>
              info.subsystemId === block.id || info.subsystemId === scopedBlockId
          )
          if (enableInfo && hasEnableInput) {
            const priorId = enableInfo.subsystemId
            enableInfo.subsystemId = scopedBlockId
            enableInfo.controlledBlockIds = flattenedBlocks
              .filter(
                fb => this.enableScopes.get(fb.originalId) === scopedBlockId
              )
              .map(fb => fb.originalId)
            // Remap children that pointed at the pre-prefix subsystem id
            for (const info of this.subsystemEnableInfo) {
              if (
                info.parentSubsystemId === priorId ||
                info.parentSubsystemId === block.id
              ) {
                info.parentSubsystemId = scopedBlockId
              }
            }
          }

        } else if (
          parentSheetId === 'root' ||
          (block.type !== 'input_port' && block.type !== 'output_port')
        ) {
          // Regular block (skip subsystem IO ports — replaced by connections).
          // Root-level IO ports are included (model boundary).
          const flattenedName = this.generateFlattenedName(
            block.name,
            subsystemPath
          )

          const flattenedBlock: FlattenedBlock = {
            block: { ...block, id: scopedBlockId },
            flattenedName,
            subsystemPath: [...subsystemPath],
            enableScope: parentEnableScope,
            sampleScope: this.resolveSampleScope(block, parentSampleScope),
            originalSheetId: sheet.id,
            originalId: scopedBlockId
          }

          flattenedBlocks.push(flattenedBlock)
          this.blockMap.set(scopedBlockId, flattenedBlock)
          this.enableScopes.set(scopedBlockId, parentEnableScope)
        }
      }

      
      // Collect connections from this sheet; prefix IDs when nested
      if (idPrefix) {
        for (const c of sheet.connections) {
          allConnections.push({
            ...c,
            id: idPrefix + c.id,
            sourceBlockId: idPrefix + c.sourceBlockId,
            targetBlockId: idPrefix + c.targetBlockId
          })
        }
      } else {
        allConnections.push(...sheet.connections)
      }
    }

    
    return { blocks: flattenedBlocks, connections: allConnections, portMappings }
  }
  
  /**
   * Get all sheets recursively including those in subsystems
   */
  private getAllSheets(sheets: Sheet[]): Sheet[] {
    const allSheets: Sheet[] = []
    
    const collectSheets = (currentSheets: Sheet[]) => {
      for (const sheet of currentSheets) {
        allSheets.push(sheet)
        
        for (const block of sheet.blocks) {
          if (block.type === 'subsystem' && block.parameters?.sheets) {
            collectSheets(block.parameters.sheets as Sheet[])
          }
        }
      }
    }
    
    collectSheets(sheets)
    return allSheets
  }
  
  /**
   * Find the subsystem path for a given block
   */
  private findBlockPath(blockId: string, sheets: Sheet[], currentPath: string[] = []): string[] | null {
    for (const sheet of sheets) {
      // Check if block is in this sheet
      if (sheet.blocks.some(b => b.id === blockId)) {
        return currentPath
      }
      
      // Check subsystems
      for (const block of sheet.blocks) {
        if (block.type === 'subsystem' && block.parameters?.sheets) {
          const nestedSheets = block.parameters.sheets as Sheet[] | undefined
          if (nestedSheets && Array.isArray(nestedSheets)) {
            const path = this.findBlockPath(
              blockId,
              nestedSheets,
              [...currentPath, block.name]
            )
            if (path) return path
          }
        }
      }
    }
    
    return null
  }
  
  /**
   * Walk through flattened-away subsystem output ports until a real leaf block.
   * Fixes depth≥2 nests where one remap stopped at a child subsystem id.
   *
   * Also handles Inport→Outport passthrough: when the block feeding an
   * outport is an inport, continue from the external wire into that inport
   * (e.g. S-IB Attitude Rate Error bypasses filters with In1→Out1).
   */
  private resolveSourceThroughSubsystems(
    sourceBlockId: string,
    sourcePortIndex: number,
    connections: WireData[],
    portMappings: Map<string, SubsystemPortMapping>,
    flattenedBlocks: FlattenedBlock[],
    processedWires: Set<string>,
    inputPortOwner: Map<string, { subsystemId: string; portIndex: number }>,
    depth = 0
  ): { sourceBlockId: string; sourcePortIndex: number } | null {
    if (depth > 64) {
      this.addWarning(
        `Subsystem source resolve exceeded depth for ${sourceBlockId}:${sourcePortIndex}`
      )
      return null
    }

    if (flattenedBlocks.some(b => b.originalId === sourceBlockId)) {
      return { sourceBlockId, sourcePortIndex }
    }

    // Inport feeding an Outport (passthrough): jump to the external driver
    const inOwner = inputPortOwner.get(sourceBlockId)
    if (inOwner) {
      const externalIn = connections.find(
        w =>
          w.targetBlockId === inOwner.subsystemId &&
          w.targetPortIndex === inOwner.portIndex
      )
      if (!externalIn) {
        this.addWarning(
          `Input port passthrough ${sourceBlockId} (subsystem ${inOwner.subsystemId}:${inOwner.portIndex}) has no external driver`
        )
        return null
      }
      processedWires.add(externalIn.id)
      return this.resolveSourceThroughSubsystems(
        externalIn.sourceBlockId,
        externalIn.sourcePortIndex,
        connections,
        portMappings,
        flattenedBlocks,
        processedWires,
        inputPortOwner,
        depth + 1
      )
    }

    const mapping = portMappings.get(sourceBlockId)
    if (!mapping) return null
    if (mapping.isSegregated) {
      // Opaque segregated block is a valid endpoint
      return { sourceBlockId, sourcePortIndex }
    }

    const internalOutputPortId = mapping.outputPorts.get(sourcePortIndex)
    if (!internalOutputPortId) return null

    const internalWire = connections.find(
      w =>
        w.targetBlockId === internalOutputPortId && w.targetPortIndex === 0
    )
    if (!internalWire) {
      this.addWarning(
        `Output port ${internalOutputPortId} has no internal connection`
      )
      return null
    }
    processedWires.add(internalWire.id)
    return this.resolveSourceThroughSubsystems(
      internalWire.sourceBlockId,
      internalWire.sourcePortIndex,
      connections,
      portMappings,
      flattenedBlocks,
      processedWires,
      inputPortOwner,
      depth + 1
    )
  }

  /**
   * Walk through flattened-away subsystem input ports to all leaf targets.
   * When an input fans into another nested subsystem, resolve recursively.
   */
  private resolveTargetThroughSubsystems(
    targetBlockId: string,
    targetPortIndex: number,
    connections: WireData[],
    portMappings: Map<string, SubsystemPortMapping>,
    flattenedBlocks: FlattenedBlock[],
    portBlockIds: Set<string>,
    processedWires: Set<string>,
    wireIdPrefix: string,
    depth = 0
  ): Array<{
    targetBlockId: string
    targetPortIndex: number
    connectionId: string
  }> {
    if (depth > 64) {
      this.addWarning(
        `Subsystem target resolve exceeded depth for ${targetBlockId}:${targetPortIndex}`
      )
      return []
    }

    if (flattenedBlocks.some(b => b.originalId === targetBlockId)) {
      return [
        {
          targetBlockId,
          targetPortIndex,
          connectionId: wireIdPrefix
        }
      ]
    }

    const mapping = portMappings.get(targetBlockId)
    if (!mapping) return []
    if (mapping.isSegregated) {
      return [
        {
          targetBlockId,
          targetPortIndex,
          connectionId: wireIdPrefix
        }
      ]
    }

    if (targetPortIndex === -1) {
      return [
        {
          targetBlockId,
          targetPortIndex: -1,
          connectionId: `${wireIdPrefix}_enable`
        }
      ]
    }

    const internalInputPortId = mapping.inputPorts.get(targetPortIndex)
    if (!internalInputPortId) return []

    const internalWires = connections.filter(
      w =>
        w.sourceBlockId === internalInputPortId &&
        !portBlockIds.has(w.targetBlockId)
    )

    const leaves: Array<{
      targetBlockId: string
      targetPortIndex: number
      connectionId: string
    }> = []

    for (const internalWire of internalWires) {
      processedWires.add(internalWire.id)
      const nested = this.resolveTargetThroughSubsystems(
        internalWire.targetBlockId,
        internalWire.targetPortIndex,
        connections,
        portMappings,
        flattenedBlocks,
        portBlockIds,
        processedWires,
        `${wireIdPrefix}_${internalWire.id}`,
        depth + 1
      )
      leaves.push(...nested)
    }
    return leaves
  }

  /**
   * Remove subsystem ports and replace with direct connections
   */
  removeSubsystemPorts(
    connections: WireData[],
    portMappings: Map<string, SubsystemPortMapping>,
    flattenedBlocks: FlattenedBlock[]
  ): FlattenedConnection[] {
    const flattenedConnections: FlattenedConnection[] = []
    const processedWires = new Set<string>()

    // Create a map of block IDs to their subsystem container (if any)
    const blockToSubsystem = new Map<string, string>()
    for (const [subsystemId, mapping] of portMappings) {
      mapping.inputPorts.forEach(blockId =>
        blockToSubsystem.set(blockId, subsystemId)
      )
      mapping.outputPorts.forEach(blockId =>
        blockToSubsystem.set(blockId, subsystemId)
      )
    }

    // Create a set of all port block IDs that will be removed
    const portBlockIds = new Set<string>()
    // input_port block id → owning subsystem + port index (for In→Out passthrough)
    const inputPortOwner = new Map<
      string,
      { subsystemId: string; portIndex: number }
    >()
    for (const [subsystemId, mapping] of portMappings) {
      mapping.inputPorts.forEach((id, portIndex) => {
        portBlockIds.add(id)
        inputPortOwner.set(id, { subsystemId, portIndex })
      })
      mapping.outputPorts.forEach(id => portBlockIds.add(id))
    }

    const realBlockIds = new Set(flattenedBlocks.map(b => b.originalId))

    for (const wire of connections) {
      // Skip if already processed
      if (processedWires.has(wire.id)) continue
      processedWires.add(wire.id)

      let sourceBlockId = wire.sourceBlockId
      let sourcePortIndex = wire.sourcePortIndex
      const targetBlockId = wire.targetBlockId
      const targetPortIndex = wire.targetPortIndex
      let connectionType: FlattenedConnection['connectionType'] = 'direct'

      // Skip connections from/to port blocks entirely - they'll be replaced
      if (
        portBlockIds.has(sourceBlockId) ||
        (portBlockIds.has(targetBlockId) && targetPortIndex !== -1)
      ) {
        continue
      }

      // Resolve source through any chain of flattened subsystems
      if (sourceBlockId && portMappings.has(sourceBlockId)) {
        const mapping = portMappings.get(sourceBlockId)!
        if (mapping.isSegregated) {
          connectionType = 'subsystem_output'
        } else {
          const resolved = this.resolveSourceThroughSubsystems(
            sourceBlockId,
            sourcePortIndex,
            connections,
            portMappings,
            flattenedBlocks,
            processedWires,
            inputPortOwner
          )
          if (!resolved) continue
          sourceBlockId = resolved.sourceBlockId
          sourcePortIndex = resolved.sourcePortIndex
          connectionType = 'subsystem_output'
        }
      }

      // Skip dangling refs from output_port blocks
      const sourceSubsystemId = blockToSubsystem.get(sourceBlockId)
      if (sourceSubsystemId) {
        const sourceBlock = flattenedBlocks.find(
          b => b.originalId === sourceBlockId
        )
        if (sourceBlock?.block.type === 'output_port') {
          continue
        }
      }

      // Resolve target through any chain of flattened subsystems
      if (targetBlockId && portMappings.has(targetBlockId)) {
        const mapping = portMappings.get(targetBlockId)!

        if (mapping.isSegregated) {
          const flatConnection: FlattenedConnection = {
            id: wire.id,
            sourceBlockId,
            sourcePortIndex,
            targetBlockId,
            targetPortIndex,
            originalWireId: wire.id,
            connectionType: 'subsystem_input'
          }
          flattenedConnections.push(flatConnection)
          continue
        }

        if (targetPortIndex === -1) {
          const flatConnection: FlattenedConnection = {
            id: `${wire.id}_enable`,
            sourceBlockId,
            sourcePortIndex,
            targetBlockId,
            targetPortIndex: -1,
            originalWireId: wire.id,
            connectionType: 'direct'
          }
          flattenedConnections.push(flatConnection)

          const enableInfo = this.subsystemEnableInfo.find(
            info => info.subsystemId === targetBlockId
          )
          if (enableInfo) {
            enableInfo.enableWire = flatConnection
          }
          continue
        }

        const leaves = this.resolveTargetThroughSubsystems(
          targetBlockId,
          targetPortIndex,
          connections,
          portMappings,
          flattenedBlocks,
          portBlockIds,
          processedWires,
          wire.id
        )

        for (const leaf of leaves) {
          if (
            !realBlockIds.has(leaf.targetBlockId) &&
            !portMappings.get(leaf.targetBlockId)?.isSegregated
          ) {
            this.addWarning(
              `Connection ${leaf.connectionId} references non-existent target block ${leaf.targetBlockId}`
            )
            continue
          }
          flattenedConnections.push({
            id: leaf.connectionId,
            sourceBlockId,
            sourcePortIndex,
            targetBlockId: leaf.targetBlockId,
            targetPortIndex: leaf.targetPortIndex,
            originalWireId: wire.id,
            connectionType: 'subsystem_input'
          })
        }
        continue
      }

      // Regular connection between non-port blocks
      const sourceExists =
        realBlockIds.has(sourceBlockId) ||
        portMappings.get(sourceBlockId)?.isSegregated === true
      const targetExists =
        realBlockIds.has(targetBlockId) ||
        portMappings.get(targetBlockId)?.isSegregated === true

      if (sourceExists && targetExists) {
        flattenedConnections.push({
          id: wire.id,
          sourceBlockId,
          sourcePortIndex,
          targetBlockId,
          targetPortIndex,
          originalWireId: wire.id,
          connectionType
        })
      } else {
        if (!sourceExists) {
          this.addWarning(
            `Connection ${wire.id} references non-existent source block ${sourceBlockId}`
          )
        }
        if (!targetExists) {
          this.addWarning(
            `Connection ${wire.id} references non-existent target block ${targetBlockId}`
          )
        }
      }
    }

    return flattenedConnections
  }
  
  /**
   * For segregated import ports that came from outside Gotos: copy the Goto's
   * driver onto the subsystem input when no explicit wire exists yet.
   *
   * Self-feedback (Goto ultimately driven by this same segregated subsystem's
   * output) is NOT wired as a parent input — that would latch last-step
   * outputs and delay internal consumers by ≥1 major frame vs flatten.
   * Instead, relink the module's promoted input_port consumers to the local
   * driver of that output (live Stage_Sep_3 → From(bStageSep), etc.).
   */
  private wireSegregatedTagImports(
    connections: FlattenedConnection[],
    flattenedBlocks: FlattenedBlock[]
  ): FlattenedConnection[] {
    if (this.segregatedSubsystems.length === 0) {
      return connections
    }

    const result = [...connections]

    for (const sub of this.segregatedSubsystems) {
      // Iterate a copy — relink may remove input ports
      for (const port of [...sub.inputPorts]) {
        const already = result.some(
          c =>
            c.targetBlockId === sub.subsystemId &&
            c.targetPortIndex === port.index
        )
        if (already) continue

        // Outside Goto with this tag (inside Gotos are not in flattenedBlocks).
        // Promoted bridge ports may be named `${tag}__tag` when an explicit
        // input_port already claimed `tag` (see ensureImportBridge).
        const tagName = port.name.endsWith('__tag')
          ? port.name.slice(0, -'__tag'.length)
          : port.name
        const gotoBlock = flattenedBlocks.find(
          b =>
            b.block.type === 'sheet_label_sink' &&
            (b.block.parameters?.signalName as string) === tagName
        )
        if (!gotoBlock) continue

        const feed = connections.find(
          c =>
            c.targetBlockId === gotoBlock.originalId && c.targetPortIndex === 0
        )
        if (!feed) continue

        // Self-feedback: outside Goto is driven by this module's own output
        if (feed.sourceBlockId === sub.subsystemId) {
          const ok = this.relinkSelfFeedbackImport(sub, port, feed.sourcePortIndex)
          if (ok) {
            this.addWarning(
              `[${sub.name}] Self-feedback import '${port.name}' relinked to local ` +
                `driver of output port ${feed.sourcePortIndex} (avoid one-step latch)`
            )
            continue
          }
          this.addWarning(
            `[${sub.name}] Self-feedback import '${port.name}' detected but relink ` +
              `failed; leaving parent wire (may delay vs flatten)`
          )
        }

        result.push({
          id: `seg_import_${sub.sanitizedName}_${port.sanitizedName}`,
          sourceBlockId: feed.sourceBlockId,
          sourcePortIndex: feed.sourcePortIndex,
          targetBlockId: sub.subsystemId,
          targetPortIndex: port.index,
          originalWireId: feed.originalWireId,
          connectionType: 'sheet_label'
        })
      }
    }

    return result
  }

  /**
   * Replace a promoted import port inside a segregated module with the local
   * block that drives the corresponding output (self-feedback collapse).
   * Returns true if the module was rewritten.
   */
  private relinkSelfFeedbackImport(
    sub: SubsystemInfo,
    importPort: SubsystemPort,
    outputPortIndex: number
  ): boolean {
    const fm = sub.flattenedModel
    if (!fm) return false

    const outPort = sub.outputPorts.find(p => p.index === outputPortIndex)
    if (!outPort) return false

    // Driver of the output port inside the module
    const outPortBlock = fm.blocks.find(
      b =>
        b.block.type === 'output_port' &&
        ((b.block.parameters?.portName as string) === outPort.name ||
          b.block.name === outPort.name ||
          b.flattenedName === outPort.name ||
          b.flattenedName?.endsWith('_' + outPort.name))
    )
    // Prefer matching by port list order / name on any output_port
    const outPortBlocks = fm.blocks.filter(b => b.block.type === 'output_port')
    let outBlock = outPortBlock
    if (!outBlock) {
      outBlock = outPortBlocks.find(
        b =>
          (b.block.parameters?.portName as string) === outPort.name ||
          b.block.name === outPort.name
      )
    }
    if (!outBlock) return false

    const driveConn = fm.connections.find(
      c => c.targetBlockId === outBlock!.originalId && c.targetPortIndex === 0
    )
    if (!driveConn) return false
    const localDriverId = driveConn.sourceBlockId
    const localDriverPort = driveConn.sourcePortIndex

    // Promoted input_port for this import tag
    const inPortBlock = fm.blocks.find(
      b =>
        b.block.type === 'input_port' &&
        ((b.block.parameters?.portName as string) === importPort.name ||
          b.block.name === importPort.name)
    )
    if (!inPortBlock) return false
    const inPortId = inPortBlock.originalId

    // Rewire consumers of the input_port to the local driver
    for (const c of fm.connections) {
      if (c.sourceBlockId === inPortId) {
        c.sourceBlockId = localDriverId
        c.sourcePortIndex = localDriverPort
      }
    }
    // Drop wires into the input_port and the port block itself
    fm.connections = fm.connections.filter(
      c => c.targetBlockId !== inPortId && c.sourceBlockId !== inPortId
    )
    fm.blocks = fm.blocks.filter(b => b.originalId !== inPortId)

    // Remove from SubsystemInfo port list; keep remaining indices stable so
    // already-recorded parent import wires stay valid.
    sub.inputPorts = sub.inputPorts.filter(p => p.name !== importPort.name)

    return true
  }

  /**
   * Resolve sheet label connections within scopes
   * @returns Object with resolved connections and count of labels resolved
   */
  resolveSheetLabels(
    connections: FlattenedConnection[],
    flattenedBlocks: FlattenedBlock[]
  ): { connections: FlattenedConnection[], resolvedCount: number } {
    const resolvedConnections: FlattenedConnection[] = []
    const sheetLabelSinks = new Map<string, SheetLabelConnection>()
    const sheetLabelSources: FlattenedBlock[] = []
    
    // First pass: Identify all sheet label blocks and their scopes
    for (const block of flattenedBlocks) {
      if (block.block.type === 'sheet_label_sink') {
        const signalName = block.block.parameters?.signalName as string
        if (!signalName) {
          this.addWarning(`Sheet label sink ${block.originalId} has no signal name`)
          continue
        }
        
        // Determine scope - use the block's subsystem path to create scope key
        const scope = block.subsystemPath.length > 0 
          ? block.subsystemPath.join('/')
          : 'root'
        
        const key = `${scope}:${signalName}`
        
        if (sheetLabelSinks.has(key)) {
          this.addWarning(`Duplicate sheet label sink '${signalName}' in scope '${scope}'`)
        }
        
        sheetLabelSinks.set(key, {
          signalName,
          scope,
          sink: {
            blockId: block.originalId,
            inputWireId: '' // Will be filled when we find the input wire
          },
          sourceBlockIds: []
        })
      } else if (block.block.type === 'sheet_label_source') {
        sheetLabelSources.push(block)
      }
    }
    
    // Second pass: Process connections to find inputs to sinks
    for (const connection of connections) {
      const targetBlock = flattenedBlocks.find(b => b.originalId === connection.targetBlockId)
      
      if (targetBlock?.block.type === 'sheet_label_sink') {
        const signalName = targetBlock.block.parameters?.signalName as string
        const scope = targetBlock.subsystemPath.length > 0 
          ? targetBlock.subsystemPath.join('/')
          : 'root'
        const key = `${scope}:${signalName}`
        
        const labelInfo = sheetLabelSinks.get(key)
        if (labelInfo && labelInfo.sink) {
          labelInfo.sink.inputWireId = connection.id
        }
      }
    }
    
    // Third pass: Process all connections
    const processedConnections = new Set<string>()
    
    for (const connection of connections) {
      // Skip if already processed
      if (processedConnections.has(connection.id)) continue
      
      const sourceBlock = flattenedBlocks.find(b => b.originalId === connection.sourceBlockId)
      const targetBlock = flattenedBlocks.find(b => b.originalId === connection.targetBlockId)
      
      // Skip connections to/from sheet label blocks - we'll replace these
      if (sourceBlock?.block.type === 'sheet_label_source' || 
          targetBlock?.block.type === 'sheet_label_sink') {
        processedConnections.add(connection.id)
        continue
      }
      
      // Keep all other connections
      resolvedConnections.push(connection)
    }
    
    // Helper: find Goto sink for a From (scope walk → global fallback)
    const findSinkForSource = (
      sourceBlock: FlattenedBlock,
      signalName: string
    ): SheetLabelConnection | undefined => {
      let labelInfo: SheetLabelConnection | undefined
      let searchScope =
        sourceBlock.subsystemPath.length > 0
          ? sourceBlock.subsystemPath.join('/')
          : 'root'

      const pathParts = [...sourceBlock.subsystemPath]
      while (true) {
        const key = `${searchScope}:${signalName}`
        labelInfo = sheetLabelSinks.get(key)
        if (labelInfo && labelInfo.sink) {
          break
        }

        if (pathParts.length === 0) {
          break
        }
        pathParts.pop()
        searchScope = pathParts.length > 0 ? pathParts.join('/') : 'root'
      }

      // Global fallback: first sink anywhere with this signal name
      // (Simulink TagVisibility=global Gotos may live in a sibling/child subsystem).
      if (!labelInfo || !labelInfo.sink) {
        for (const [, info] of sheetLabelSinks) {
          if (info.signalName === signalName && info.sink) {
            labelInfo = info
            break
          }
        }
      }
      return labelInfo
    }

    // Fourth pass: direct resolve each From → (block, port) that feeds its Goto
    const directResolve = new Map<
      string,
      { blockId: string; port: number; sinkSignal: string }
    >()
    for (const sourceBlock of sheetLabelSources) {
      const signalName = sourceBlock.block.parameters?.signalName as string
      if (!signalName) {
        this.addWarning(`Sheet label source ${sourceBlock.originalId} has no signal name`)
        continue
      }

      // Prefer an opaque segregated export when the Goto lives inside that module
      const segregatedExport = this.segregatedExportBySignal.get(signalName)
      if (segregatedExport) {
        // Only use when From is outside that subsystem (Goto is hidden inside)
        const labelInfo = findSinkForSource(sourceBlock, signalName)
        if (!labelInfo || !labelInfo.sink) {
          directResolve.set(sourceBlock.originalId, {
            blockId: segregatedExport.subsystemId,
            port: segregatedExport.portIndex,
            sinkSignal: signalName
          })
          continue
        }
      }

      const labelInfo = findSinkForSource(sourceBlock, signalName)
      if (!labelInfo || !labelInfo.sink) {
        const scope =
          sourceBlock.subsystemPath.length > 0
            ? sourceBlock.subsystemPath.join('/')
            : 'root'
        this.addWarning(
          `Sheet label source '${signalName}' has no matching sink in scope '${scope}' or parent scopes`
        )
        continue
      }

      const sinkInputConnection = connections.find(
        c =>
          c.targetBlockId === labelInfo.sink!.blockId && c.targetPortIndex === 0
      )
      if (!sinkInputConnection) {
        this.addWarning(`Sheet label sink '${signalName}' has no input connection`)
        continue
      }

      directResolve.set(sourceBlock.originalId, {
        blockId: sinkInputConnection.sourceBlockId,
        port: sinkInputConnection.sourcePortIndex,
        sinkSignal: signalName
      })
      labelInfo.sourceBlockIds.push(sourceBlock.originalId)
    }

    // Fifth pass: chase through From→Goto→From chains (e.g. S-IB Xe outport
    // is From(local Goto) while root Goto(Xe_m) is fed by that subsystem port,
    // which remaps to the inner From — without transitive resolve the outer
    // From keeps a dangling sheet_label_source id → algebra sees 0.0).
    const sourceById = new Map(
      sheetLabelSources.map(b => [b.originalId, b] as const)
    )
    const ultimateResolve = (
      sourceId: string,
      seen: Set<string> = new Set()
    ): { blockId: string; port: number } | null => {
      const d = directResolve.get(sourceId)
      if (!d) return null
      if (seen.has(d.blockId)) {
        this.addWarning(
          `Sheet label cycle detected while resolving '${d.sinkSignal}'`
        )
        return null
      }
      seen.add(d.blockId)
      if (sourceById.has(d.blockId)) {
        return ultimateResolve(d.blockId, seen)
      }
      return { blockId: d.blockId, port: d.port }
    }

    for (const sourceBlock of sheetLabelSources) {
      const ultimate = ultimateResolve(sourceBlock.originalId)
      if (!ultimate) continue

      const sourceConnections = connections.filter(
        c => c.sourceBlockId === sourceBlock.originalId
      )
      const direct = directResolve.get(sourceBlock.originalId)!

      for (const sourceConn of sourceConnections) {
        resolvedConnections.push({
          id: `sheet_label_${direct.sinkSignal}_${sourceBlock.originalId}_to_${sourceConn.id}`,
          sourceBlockId: ultimate.blockId,
          sourcePortIndex: ultimate.port,
          targetBlockId: sourceConn.targetBlockId,
          targetPortIndex: sourceConn.targetPortIndex,
          originalWireId: sourceConn.originalWireId,
          connectionType: 'sheet_label'
        })
      }
    }
    
    // Count sheet label resolution statistics
    const resolvedCount = sheetLabelSources.filter(source => {
      const signalName = source.block.parameters?.signalName as string
      const scope = source.subsystemPath.length > 0
        ? source.subsystemPath.join('/')
        : 'root'
      const key = `${scope}:${signalName}`
      return sheetLabelSinks.has(key)
    }).length

    if (resolvedCount > 0) {
      console.log(`Resolved ${resolvedCount} sheet label connections`)
    }

    return { connections: resolvedConnections, resolvedCount }
  }
  
  /**
   * Main method to flatten a complete model
   */
  flattenModel(
    sheets: Sheet[],
    modelName: string = 'model',
    parameters: ModelParameter[] = [],
    explicitDataStores: DataStoreDeclaration[] = []
  ): FlatteningResult {
    // Validate input
    if (!sheets || !Array.isArray(sheets)) {
      throw new Error('Invalid sheets parameter: expected array of sheets')
    }
    
    // Reset state for new flattening operation
    this.warnings = []
    this.blockMap.clear()
    this.enableScopes.clear()
    this.subsystemEnableInfo = []
    this.segregatedSubsystems = []
    this.allSheetLabels = collectSheetLabels(sheets)
    this.segregatedExportBySignal.clear()
    this.modelParameters = parameters || []
    
    const diagnostics = {
      blocksFlattened: 0,
      connectionsRemapped: 0,
      subsystemsProcessed: 0,
      sheetLabelsResolved: 0,
      enableScopesCreated: 0
    }
    
    // Step 1: Build enable scopes for all blocks
    if (this.options.generateEnableTracking) {
      this.buildEnableScopes(sheets)
      diagnostics.enableScopesCreated = this.subsystemEnableInfo.length
    }
    
    // Step 2: Flatten all subsystems recursively
    const { blocks, connections, portMappings } = this.flattenSubsystems(sheets)
    diagnostics.blocksFlattened = blocks.length
    diagnostics.subsystemsProcessed = portMappings.size
    
    // Step 3: Remove subsystem ports and remap connections
    const flattenedConnections = this.removeSubsystemPorts(connections, portMappings, blocks)
    diagnostics.connectionsRemapped = flattenedConnections.length

    // Step 3b: Wire outside Goto drivers into segregated import ports
    // (Gotos still present on flattenedBlocks until labels are stripped)
    const withImportWires = this.wireSegregatedTagImports(
      flattenedConnections,
      blocks
    )
    
    // Step 4: Resolve sheet label connections
    const sheetLabelResult = this.resolveSheetLabels(withImportWires, blocks)
    const resolvedConnections = sheetLabelResult.connections
    diagnostics.sheetLabelsResolved = sheetLabelResult.resolvedCount
    
    // Step 5: Filter out sheet label blocks from final block list
    const finalBlocks = blocks.filter(b => 
      b.block.type !== 'sheet_label_sink' && 
      b.block.type !== 'sheet_label_source'
    )
    
    // Step 6: Calculate model metadata
    const maxNestingDepth = finalBlocks.reduce((max, block) => 
      Math.max(max, block.subsystemPath.length), 0
    )
    
    // Step 7: Collect model-scoped data stores from declarations + blocks
    // Include all blocks (before filtering labels) so write/read inside sheets are found
    const dataStores = collectDataStores(blocks, explicitDataStores)

    // Step 8: Create the flattened model
    const flattenedModel: FlattenedModel = {
      blocks: finalBlocks,
      connections: resolvedConnections,
      blockMap: this.blockMap,
      enableScopes: this.enableScopes,
      subsystemEnableInfo: this.subsystemEnableInfo,
      segregatedSubsystems: this.segregatedSubsystems,
      parameters, // Feature 3: Include model parameters
      dataStores,
      metadata: {
        modelName,
        totalBlocks: finalBlocks.length,
        totalConnections: resolvedConnections.length,
        subsystemCount: diagnostics.subsystemsProcessed,
        maxNestingDepth
      }
    }

    let list = modelName + " Flattened Model Summary:\n"
    for (const block of finalBlocks) {
      list += `Flattened block: ${block.flattenedName} (${block.originalId})` + "\n"
    }

    for (const connection of resolvedConnections) {
       list += `Connection: ${connection.id} from ${connection.sourceBlockId} to ${connection.targetBlockId}` + "\n"
    }

    for (const y of this.enableScopes) {
       list += `Enable Scope: Block ${y[0]} has enable scope ${y[1]}` + "\n"
    }   

    for (const x of this.subsystemEnableInfo) {
       list += `Subsystem Enable Info: ${x.subsystemName} (ID: ${x.subsystemId}), Has Enable Input: ${x.hasEnableInput}, Controlled Blocks: ${x.controlledBlockIds.join(', ')}` + "\n"
    }

    for (const seg of this.segregatedSubsystems) {
       list += `Segregated Subsystem: ${seg.subsystemName} (ID: ${seg.subsystemId}), Inputs: ${seg.inputPorts.length}, Outputs: ${seg.outputPorts.length}, HasState: ${seg.hasState}` + "\n"
    }
    console.log(list)
    
    // Step 8: Validate the flattened model
    this.validateFlattenedModel(flattenedModel)
    
    return {
      model: flattenedModel,
      warnings: [...this.warnings],
      diagnostics
    }
  }
  
  /**
   * Validate the flattened model for consistency
   */
  private validateFlattenedModel(model: FlattenedModel): void {
    // Check that all connections reference existing blocks
    const blockIds = new Set(model.blocks.map(b => b.originalId))
    
    for (const connection of model.connections) {
      if (!blockIds.has(connection.sourceBlockId)) {
        this.addWarning(`Connection ${connection.id} references non-existent source block ${connection.sourceBlockId}`)
      }
      if (!blockIds.has(connection.targetBlockId)) {
        this.addWarning(`Connection ${connection.id} references non-existent target block ${connection.targetBlockId}`)
      }
    }
    
    // Check enable wire validity
    for (const enableInfo of model.subsystemEnableInfo) {
      if (enableInfo.hasEnableInput && !enableInfo.enableWire) {
        this.addWarning(`Subsystem ${enableInfo.subsystemName} has enable input but no enable wire connected`)
      }
    }
    
    // Check for orphaned blocks (no connections)
    const connectedBlocks = new Set<string>()
    for (const connection of model.connections) {
      connectedBlocks.add(connection.sourceBlockId)
      connectedBlocks.add(connection.targetBlockId)
    }
    
    for (const block of model.blocks) {
      // Skip source blocks and input ports as they may not have incoming connections
      if (block.block.type === 'source' || block.block.type === 'input_port') {
        continue
      }

      // Skip output ports and signal displays/loggers as they may not have outgoing connections
      if (block.block.type === 'output_port' ||
          block.block.type === 'signal_display' ||
          block.block.type === 'signal_logger') {
        continue
      }

      // Skip segregated subsystems - they are validated separately in their own context
      if (block.isSegregated) {
        continue
      }

      if (!connectedBlocks.has(block.originalId)) {
        this.addWarning(`Block ${block.flattenedName} (${block.block.type}) has no connections`)
      }
    }
  }
}