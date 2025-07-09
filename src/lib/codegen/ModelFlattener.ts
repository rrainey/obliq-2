// lib/codegen/ModelFlattener.ts

import { BlockData } from '@/components/BlockNode'
import { WireData } from '@/components/Wire'
import { Sheet } from '@/lib/simulationEngine'
import { CCodeBuilder } from '@/lib/codegen/CCodeBuilder'
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
  
  /** Original sheet ID where this block resides */
  originalSheetId: string
  
  /** Original block ID (preserved for connection mapping) */
  originalId: string
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
    parentEnableScope: string | null = null
  ): void {
    for (const sheet of sheets) {
      for (const block of sheet.blocks) {
        if (block.type === 'subsystem') {
          // Check if this subsystem has enable input
          const hasEnableInput = block.parameters?.showEnableInput === true
          const currentEnableScope = hasEnableInput ? block.id : parentEnableScope
          
          // Create subsystem enable info
          const enableInfo: SubsystemEnableInfo = {
            subsystemId: block.id,
            subsystemName: this.generateFlattenedName(block.name, []),
            hasEnableInput,
            parentSubsystemId: subsystemId,
            controlledBlockIds: []
          }
          
          this.subsystemEnableInfo.push(enableInfo)
          
          // Process nested sheets
          if (block.parameters?.sheets) {
            this.buildEnableScopes(
              block.parameters.sheets as Sheet[],
              block.id,
              currentEnableScope
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
   * Flatten all subsystems recursively
   */
  flattenSubsystems(
    sheets: Sheet[],
    subsystemPath: string[] = [],
    parentEnableScope: string | null = null,
    parentSheetId: string = 'root'
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
        if (block.type === 'subsystem') {
          // Handle subsystem block
          const hasEnableInput = block.parameters?.showEnableInput === true
          const currentEnableScope = hasEnableInput ? block.id : parentEnableScope
          
          // Create port mapping for this subsystem
          const portMapping: SubsystemPortMapping = {
            subsystemId: block.id,
            inputPorts: new Map(),
            outputPorts: new Map()
          }
          
          // Process subsystem's internal sheets
          if (block.parameters?.sheets) {
            const subsystemSheets = block.parameters.sheets as Sheet[]
            const newPath = [...subsystemPath, block.name]
            
            // Find input/output port blocks inside subsystem
            for (const subSheet of subsystemSheets) {
              for (const subBlock of subSheet.blocks) {
                if (subBlock.type === 'input_port') {
                  const portName = subBlock.parameters?.portName
                  const portIndex = block.parameters.inputPorts?.indexOf(portName) ?? -1
                  if (portIndex >= 0) {
                    portMapping.inputPorts.set(portIndex, subBlock.id)
                  }
                } else if (subBlock.type === 'output_port') {
                  const portName = subBlock.parameters?.portName
                  const portIndex = block.parameters.outputPorts?.indexOf(portName) ?? -1
                  if (portIndex >= 0) {
                    portMapping.outputPorts.set(portIndex, subBlock.id)
                  }
                }
              }
            }
            
            // Recursively flatten subsystem contents
            const subsystemResult = this.flattenSubsystems(
              subsystemSheets,
              newPath,
              currentEnableScope,
              sheet.id
            )
            
            flattenedBlocks.push(...subsystemResult.blocks)
            allConnections.push(...subsystemResult.connections)
            
            // Merge port mappings
            subsystemResult.portMappings.forEach((mapping, id) => {
              portMappings.set(id, mapping)
            })
          }
          
          portMappings.set(block.id, portMapping)
          
          // Update subsystem enable info with controlled blocks
          const enableInfo = this.subsystemEnableInfo.find(info => info.subsystemId === block.id)
          if (enableInfo && hasEnableInput) {
            // Find all blocks in this enable scope
            enableInfo.controlledBlockIds = flattenedBlocks
              .filter(fb => this.enableScopes.get(fb.originalId) === block.id)
              .map(fb => fb.originalId)
          }
          
        } else if (parentSheetId === 'root' || (block.type !== 'input_port' && block.type !== 'output_port')) {
          // Regular block (skip input/output ports as they'll be replaced by connections)
          const flattenedName = this.generateFlattenedName(block.name, subsystemPath)
          
          const flattenedBlock: FlattenedBlock = {
            block: { ...block },
            flattenedName,
            subsystemPath: [...subsystemPath],
            enableScope: parentEnableScope,
            originalSheetId: sheet.id,
            originalId: block.id
          }
          
          flattenedBlocks.push(flattenedBlock)
          this.blockMap.set(block.id, flattenedBlock)
          this.enableScopes.set(block.id, parentEnableScope)
        }
      }
      
      // Collect connections from this sheet
      allConnections.push(...sheet.connections)
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
      mapping.inputPorts.forEach(blockId => blockToSubsystem.set(blockId, subsystemId))
      mapping.outputPorts.forEach(blockId => blockToSubsystem.set(blockId, subsystemId))
    }
    
    // Create a set of all port block IDs that will be removed
    const portBlockIds = new Set<string>()
    for (const mapping of portMappings.values()) {
      mapping.inputPorts.forEach(id => portBlockIds.add(id))
      mapping.outputPorts.forEach(id => portBlockIds.add(id))
    }
    
    for (const wire of connections) {
      // Skip if already processed
      if (processedWires.has(wire.id)) continue;
      processedWires.add(wire.id)
      
      let sourceBlockId = wire.sourceBlockId
      let sourcePortIndex = wire.sourcePortIndex
      let targetBlockId = wire.targetBlockId
      let targetPortIndex = wire.targetPortIndex
      let connectionType: FlattenedConnection['connectionType'] = 'direct'
      
      // Skip connections from/to port blocks entirely - they'll be replaced
      if (portBlockIds.has(sourceBlockId) || (portBlockIds.has(targetBlockId) && targetPortIndex !== -1)) {
        continue
      }

      // Check if source is a subsystem block with output ports
      if (sourceBlockId && portMappings.has(sourceBlockId)) {
        const mapping = portMappings.get(sourceBlockId)!
        const internalOutputPortId = mapping.outputPorts.get(sourcePortIndex)
        
        if (internalOutputPortId) {
          // Find the wire that connects TO this output port inside the subsystem
          const internalWire = connections.find(w => 
            w.targetBlockId === internalOutputPortId && 
            w.targetPortIndex === 0 // Output ports have single input at index 0
          )
          
          if (internalWire) {
            // Update source to point to the internal block
            sourceBlockId = internalWire.sourceBlockId
            sourcePortIndex = internalWire.sourcePortIndex
            connectionType = 'subsystem_output'
            processedWires.add(internalWire.id)
            // Important: Do NOT continue here - we want to create the remapped connection below
          } else {
            this.addWarning(`Output port ${internalOutputPortId} has no internal connection`)
            continue
          }
        }
      }
      
      // Check if source is a subsystem output port block
      const sourceSubsystemId = blockToSubsystem.get(sourceBlockId)
      if (sourceSubsystemId) {
        const sourceBlock = flattenedBlocks.find(b => b.originalId === sourceBlockId)
        if (sourceBlock?.block.type === 'output_port') {
          // Skip - we don't want connections from output port blocks
          continue
        }
      }
      
      /*
      // Check if source is a subsystem output port
      const sourceSubsystemId = blockToSubsystem.get(sourceBlockId)
      if (sourceSubsystemId) {
        const sourceBlock = flattenedBlocks.find(b => b.originalId === sourceBlockId)
        if (sourceBlock?.block.type === 'output_port') {
          // Find the wire that connects TO this output port inside the subsystem
          const internalWire = connections.find(w => 
            w.targetBlockId === sourceBlockId && 
            w.targetPortIndex === 0 // Output ports have single input at index 0
          )
          
          if (internalWire) {
            sourceBlockId = internalWire.sourceBlockId
            sourcePortIndex = internalWire.sourcePortIndex
            connectionType = 'subsystem_output'
            processedWires.add(internalWire.id)
          } else {
            this.addWarning(`Output port ${sourceBlockId} has no internal connection`)
            continue
          }
        }
      }
      */
      
      // Check if target is a subsystem input
      if (targetBlockId && portMappings.has(targetBlockId)) {
        const mapping = portMappings.get(targetBlockId)!
        const internalInputPortId = mapping.inputPorts.get(targetPortIndex)
        
        if (internalInputPortId) {
          // Find wires from this input port to internal blocks
          const internalWires = connections.filter(w => 
            w.sourceBlockId === internalInputPortId && !portBlockIds.has(w.targetBlockId)
          )
          
          // Create a connection for each internal wire
          for (const internalWire of internalWires) {
            const flatConnection: FlattenedConnection = {
              id: `${wire.id}_${internalWire.id}`,
              sourceBlockId,
              sourcePortIndex,
              targetBlockId: internalWire.targetBlockId,
              targetPortIndex: internalWire.targetPortIndex,
              originalWireId: wire.id,
              connectionType: 'subsystem_input'
            }
            flattenedConnections.push(flatConnection)
            processedWires.add(internalWire.id)
          }
          continue
        } else if (targetPortIndex === -1) {
          // Special case: Enable port connection
          const flatConnection: FlattenedConnection = {
            id: `${wire.id}_enable`,
            sourceBlockId,
            sourcePortIndex,
            targetBlockId,
            targetPortIndex: -1, // Preserve special enable port index
            originalWireId: wire.id,
            connectionType: 'direct'
          }
          flattenedConnections.push(flatConnection)
          
          // Track enable wire for subsystem
          const enableInfo = this.subsystemEnableInfo.find(info => 
            info.subsystemId === targetBlockId
          )
          if (enableInfo) {
            enableInfo.enableWire = flatConnection
          }
          continue
        }
      }
      
      // Regular connection between non-port blocks
      const sourceExists = flattenedBlocks.some(b => b.originalId === sourceBlockId) || 
                          portMappings.has(sourceBlockId) // Source could be a subsystem
      const targetExists = flattenedBlocks.some(b => b.originalId === targetBlockId) || 
                          portMappings.has(targetBlockId) // Target could be a subsystem
      
      if (sourceExists && targetExists) {
        const flatConnection: FlattenedConnection = {
          id: wire.id,
          sourceBlockId,
          sourcePortIndex,
          targetBlockId,
          targetPortIndex,
          originalWireId: wire.id,
          connectionType
        }
        flattenedConnections.push(flatConnection)
      }
    }
    
    return flattenedConnections
  }
  
  /**
   * Resolve sheet label connections within scopes
   */
  resolveSheetLabels(
    connections: FlattenedConnection[],
    flattenedBlocks: FlattenedBlock[]
  ): FlattenedConnection[] {
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
    
    // Fourth pass: Create new connections from sources to their sinks
    for (const sourceBlock of sheetLabelSources) {
      const signalName = sourceBlock.block.parameters?.signalName as string
      if (!signalName) {
        this.addWarning(`Sheet label source ${sourceBlock.originalId} has no signal name`)
        continue
      }
      
      const scope = sourceBlock.subsystemPath.length > 0 
        ? sourceBlock.subsystemPath.join('/')
        : 'root'
      const key = `${scope}:${signalName}`
      
      const labelInfo = sheetLabelSinks.get(key)
      if (!labelInfo || !labelInfo.sink) {
        this.addWarning(`Sheet label source '${signalName}' has no matching sink in scope '${scope}'`)
        continue
      }
      
      // Find the connection that feeds the sink
      const sinkInputConnection = connections.find(c => 
        c.targetBlockId === labelInfo.sink!.blockId && 
        c.targetPortIndex === 0
      )
      
      if (!sinkInputConnection) {
        this.addWarning(`Sheet label sink '${signalName}' has no input connection`)
        continue
      }
      
      // Find all connections from this source
      const sourceConnections = connections.filter(c => 
        c.sourceBlockId === sourceBlock.originalId
      )
      
      // Create direct connections from the sink's source to all the source's targets
      for (const sourceConn of sourceConnections) {
        const newConnection: FlattenedConnection = {
          id: `sheet_label_${sinkInputConnection.id}_to_${sourceConn.id}`,
          sourceBlockId: sinkInputConnection.sourceBlockId,
          sourcePortIndex: sinkInputConnection.sourcePortIndex,
          targetBlockId: sourceConn.targetBlockId,
          targetPortIndex: sourceConn.targetPortIndex,
          originalWireId: sourceConn.originalWireId,
          connectionType: 'sheet_label'
        }
        
        resolvedConnections.push(newConnection)
        
        // Track this resolution
        labelInfo.sourceBlockIds.push(sourceBlock.originalId)
      }
    }
    
    // Log sheet label resolution statistics
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
    
    return resolvedConnections
  }
  
  /**
   * Main method to flatten a complete model
   */
  flattenModel(sheets: Sheet[], modelName: string = 'model'): FlatteningResult {
    // Validate input
    if (!sheets || !Array.isArray(sheets)) {
      throw new Error('Invalid sheets parameter: expected array of sheets')
    }
    
    // Reset state for new flattening operation
    this.warnings = []
    this.blockMap.clear()
    this.enableScopes.clear()
    this.subsystemEnableInfo = []
    
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
    
    // Step 4: Resolve sheet label connections
    const resolvedConnections = this.resolveSheetLabels(flattenedConnections, blocks)
    diagnostics.sheetLabelsResolved = resolvedConnections.length - flattenedConnections.length
    
    // Step 5: Filter out sheet label blocks from final block list
    const finalBlocks = blocks.filter(b => 
      b.block.type !== 'sheet_label_sink' && 
      b.block.type !== 'sheet_label_source'
    )
    
    // Step 6: Calculate model metadata
    const maxNestingDepth = finalBlocks.reduce((max, block) => 
      Math.max(max, block.subsystemPath.length), 0
    )
    
    // Step 7: Create the flattened model
    const flattenedModel: FlattenedModel = {
      blocks: finalBlocks,
      connections: resolvedConnections,
      blockMap: this.blockMap,
      enableScopes: this.enableScopes,
      subsystemEnableInfo: this.subsystemEnableInfo,
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
      
      if (!connectedBlocks.has(block.originalId)) {
        this.addWarning(`Block ${block.flattenedName} (${block.block.type}) has no connections`)
      }
    }
  }
}