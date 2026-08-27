// lib/codegen/AlgebraicEvaluator.ts

import { FlattenedModel, FlattenedBlock, withFlattenedSampleParams } from './ModelFlattener'
import { CCodeBuilder } from './CCodeBuilder'
import { BlockModuleFactory } from '../blocks/BlockModuleFactory'
import { SubsystemInfo } from './SubsystemInfo'
import { CodeGenContext } from '../blocks/BlockModule'
import { getSignalMemberName } from './signalMemberName'
import { EnableEvaluator } from './EnableEvaluator'
import {
  needsIgmTerminalChiLatch,
  generateIgmTerminalChiLatchStatics,
  wrapIgmTerminalChiLatch
} from './igmTerminalChiLatch'

/**
 * Generates the algebraic evaluation function for a flattened model.
 * This function computes all block outputs without changing states.
 */
export interface AlgebraicEvaluatorOptions {
  /** Emit runtime-safe divide/mod (OBLIQ_DEBUG_MATH) */
  debugMath?: boolean
}

export class AlgebraicEvaluator {
  private model: FlattenedModel
  private modelName: string
  private typeMap: Map<string, string>
  private debugMath: boolean
  private enableEvaluator: EnableEvaluator
  private hasEnableSubsystems: boolean
  private hasSampleScopes: boolean
  /** Blocks that drive subsystem enable pins — must not be algebra-gated. */
  private enableSourceBlockIds: Set<string>
  
  constructor(
    model: FlattenedModel,
    typeMap: Map<string, string>,
    options: AlgebraicEvaluatorOptions = {}
  ) {
    this.model = model
    this.modelName = CCodeBuilder.sanitizeIdentifier(model.metadata.modelName)
    this.typeMap = typeMap
    this.debugMath = !!options.debugMath
    this.enableEvaluator = new EnableEvaluator(model)
    this.hasEnableSubsystems = model.subsystemEnableInfo.some(info => info.hasEnableInput)
    this.hasSampleScopes = model.blocks.some(
      b => typeof b.sampleScope === 'number' && b.sampleScope > 0
    )
    this.enableSourceBlockIds = new Set()
    for (const info of model.subsystemEnableInfo) {
      if (info.hasEnableInput && info.enableWire?.sourceBlockId) {
        this.enableSourceBlockIds.add(info.enableWire.sourceBlockId)
      }
    }
  }
  
  /**
   * Generate the complete algebraic evaluation function
   */
  generate(): string {
    let code = CCodeBuilder.generateCommentBlock([
      'Evaluate algebraic relationships (pure function, no state changes)',
      'Computes all block outputs based on current inputs and states',
      this.hasEnableSubsystems
        ? 'Blocks inside a disabled enabled-subsystem are skipped (signals hold last values)'
        : ''
    ].filter(Boolean))
    
    code += CCodeBuilder.generateFunctionHeader(
      'void',
      `${this.modelName}_evaluate_algebraic`,
      [`${this.modelName}_t* model`]  // Changed to just take model pointer
    )
    
    // Copy inputs to local references for easier access
    code += this.generateInputCopy()
    
    // Compute execution order
    const executionOrder = this.calculateExecutionOrder()

    // Static state for IGM terminal Chi-angle latch (Add12/Add14) if present
    if (needsIgmTerminalChiLatch(executionOrder)) {
      code = generateIgmTerminalChiLatchStatics() + code
    }
    
    // Generate block computations in order
    code += this.generateBlockComputations(executionOrder)
    
    // Copy signals to outputs for output ports
    code += this.generateOutputCopy()
    
    code += '}\n'
    return code
  }

  /**
   * Generate code to copy inputs for easier access
   */
  private generateInputCopy(): string {
    let code = '    /* Copy inputs for easier access */\n'
    
    // For each input port, create a local reference
    const inputPorts = this.model.blocks.filter(b => b.block.type === 'input_port')
    
    for (const port of inputPorts) {
      const portName = port.block.parameters?.portName || port.block.name
      const safeName = CCodeBuilder.sanitizeIdentifier(portName)
      const signalName = CCodeBuilder.sanitizeIdentifier(port.block.name)
      
      // Check if it's an array type
      const dataType = port.block.parameters?.dataType || 'double'
      if (dataType.includes('[')) {
        code += `    memcpy(&model->signals.${signalName}, &model->inputs.${safeName}, sizeof(model->inputs.${safeName}));\n`
      } else {
        code += `    model->signals.${signalName} = model->inputs.${safeName};\n`
      }
    }
    
    code += '\n'
    return code
  }
  
  /**
   * Calculate execution order using topological sort with proper algebraic loop detection
   */
  private calculateExecutionOrder(): FlattenedBlock[] {
    const sorted: FlattenedBlock[] = []
    const visited = new Set<string>()
    const visiting = new Set<string>()

    // Build adjacency list considering direct feedthrough
    const dependencies = new Map<string, string[]>()

    for (const block of this.model.blocks) {
      dependencies.set(block.originalId, [])
    }

    // Only add dependencies for algebraic connections (direct feedthrough)
    for (const connection of this.model.connections) {
      const targetBlock = this.model.blocks.find(b => b.originalId === connection.targetBlockId)
      const sourceBlock = this.model.blocks.find(b => b.originalId === connection.sourceBlockId)

      if (!targetBlock || !sourceBlock) continue

      // Break Module↔enable cycles: if source is under an enable scope whose
      // predicate reads this segregated module, the connection is a plant
      // feedback sample, not algebraic (else topo forces enable_bool before
      // the module and S_IVB ICs latch stale Body_to_ECI / Stage_Sep).
      // Crossing-port producers (S_IVB_Xe / Ve) are still refreshed just before
      // the segregated input memcpy — see generatePreSegregatedInputRefresh.
      if (
        targetBlock.isSegregated &&
        this.isModuleEnableCycleSource(targetBlock, sourceBlock)
      ) {
        continue
      }

      // Integrators with showInitPort load live x(0) on first enable
      // (IcNeedsLoading). Even though integrators have no DF on the derivative
      // path, IC load must run *after* the x(0) driver (e.g. Body_to_ECI_Sum
      // after Stage_Sep updates post-sep CG).
      if (
        targetBlock.block.type === 'integrator' &&
        targetBlock.block.parameters?.showInitPort &&
        connection.targetPortIndex === 1
      ) {
        const deps = dependencies.get(connection.targetBlockId)
        if (deps && !deps.includes(connection.sourceBlockId)) {
          deps.push(connection.sourceBlockId)
        }
        continue
      }

      // Check if the target block has direct feedthrough
      if (this.hasDirectFeedthrough(targetBlock)) {
        const deps = dependencies.get(connection.targetBlockId)
        if (deps && !deps.includes(connection.sourceBlockId)) {
          deps.push(connection.sourceBlockId)
        }
      }
      // If no direct feedthrough, the connection doesn't create an algebraic dependency
    }

    // Enable-wire sources (If / epsilon_prime / Compare) must evaluate before
    // blocks they gate so same-step enable refresh can arm ActionPort DSM
    // writes in the same major hit (RTW rtAction semantics).
    //
    // Do NOT pull SwitchCase case_* early: those selectors must run *after*
    // mode DSM writes in the same pass so live-DSM case conditions see the
    // updated nIGMMode (otherwise mode→2 lags an extra major cycle).
    for (const info of this.model.subsystemEnableInfo) {
      const srcId = info.enableWire?.sourceBlockId
      if (!srcId || !info.hasEnableInput) continue
      const srcBlock = this.model.blocks.find(b => b.originalId === srcId)
      if (srcBlock && this.isSwitchCaseCaseEvaluate(srcBlock)) continue
      for (const controlledId of info.controlledBlockIds || []) {
        const deps = dependencies.get(controlledId)
        if (deps && !deps.includes(srcId) && dependencies.has(srcId)) {
          deps.push(srcId)
        }
      }
    }

    // Topological sort with cycle detection
    const visit = (blockId: string, path: string[] = []) => {
      if (visited.has(blockId)) return

      if (visiting.has(blockId)) {
        // This is an algebraic loop
        const block = this.model.blocks.find(b => b.originalId === blockId)
        console.warn(`Algebraic loop detected involving block ${block?.block.name || blockId}`)
        console.warn(`Loop path: ${[...path, blockId].join(' -> ')}`)
        return
      }

      visiting.add(blockId)

      const deps = dependencies.get(blockId) || []
      for (const dep of deps) {
        visit(dep, [...path, blockId])
      }

      visiting.delete(blockId)
      visited.add(blockId)

      const block = this.model.blocks.find(b => b.originalId === blockId)
      if (block) {
        sorted.push(block)
      }
    }

    // Visit all blocks
    for (const block of this.model.blocks) {
      visit(block.originalId)
    }

    return sorted
  }

  /**
   * Check if a block has direct feedthrough
   */
  private hasDirectFeedthrough(block: FlattenedBlock): boolean {
    // Special handling for known block types
    if (block.block.type === 'transfer_function') {
      // Transfer functions without direct feedthrough can break algebraic loops
      try {
        const module1 = BlockModuleFactory.getBlockModule(block.block.type)
        if (module1.isDirectFeedthrough) {
          return module1.isDirectFeedthrough(block.block) ?? true
        }
      } catch {
        // If module not found, assume direct feedthrough
      }
    }
    
    // Check if block module implements isDirectFeedthrough
    if (BlockModuleFactory.isSupported(block.block.type)) {
      try {
        const module1 = BlockModuleFactory.getBlockModule(block.block.type)
        if (module1.isDirectFeedthrough) {
          return module1.isDirectFeedthrough(block.block) ?? true
        }
      } catch {
        // If error, assume direct feedthrough for safety
      }
    }
    
    // Default: assume direct feedthrough (conservative approach)
    return true
  }
  
  /**
   * Generate block computation code
   */
  private generateBlockComputations(executionOrder: FlattenedBlock[]): string {
    let code = '    /* Compute block outputs in dependency order */\n'
    
    for (const block of executionOrder) {
      // Skip input ports - they're already handled
      if (block.block.type === 'input_port') {
        continue
      }

      // Skip output ports - they're handled in generateOutputCopy
      if (block.block.type === 'output_port') {
        continue
      }
      
      // Handle segregated subsystems specially - they call external functions
      if (block.isSegregated) {
        code += this.generateSegregatedSubsystemCall(block)
        continue
      }

      // Skip blocks that don't generate code
      if (!BlockModuleFactory.isSupported(block.block.type)) {
        continue
      }

      // Get the block's inputs and their types
      // FIXED: Pass 'model' instead of 'signals' and 'states'
      const inputs = this.getBlockInputExpressions(block, 'model', 'model')
      const inputTypes = this.getBlockInputTypes(block)
      
      // Generate computation
      try {
        const generator = BlockModuleFactory.getBlockModule(block.block.type)
        
        // Update the block's output type based on input types
        const outputType = generator.getOutputType(block.block, inputTypes)
        
        // Store the output type for this block
        this.typeMap.set(block.originalId, outputType)
        
        // Add block comment
        code += `\n    /* ${block.flattenedName}`
        if (block.subsystemPath.length > 0) {
          code += ` (from ${block.subsystemPath.join(' > ')})`
        }
        code += ' */\n'

        // Flattened name + inherited sampleScope → parameters.sampleTimeSec
        // (shared with Header/Init so unit_delay next_sample_time stays consistent).
        const blockWithFlattenedName = withFlattenedSampleParams(block)

        // Create context with model parameter names for expression validation
        const context: CodeGenContext = {
          parameterNames: this.model.parameters.map(p => p.name),
          debugMath: this.debugMath
        }

        // Emit computation; wrap in enable-gate when inside a disabled-capable subsystem
        let computation = ''
        if (block.block.type === 'transfer_function') {
          const modifiedInputs = this.getTransferFunctionInputs(block, inputs)
          computation = generator.generateComputation(blockWithFlattenedName, modifiedInputs, inputTypes, context)
        } else if (block.block.type === 'integrator') {
          // Data ports (left): [0]=derivative, [1]=x(0) if showInitPort
          // Control reset (-2) is appended after data ports for rising-edge reset logic
          // Pass enableExpr so IcNeedsLoading only fires while the scope is enabled
          // (integrators are not wrapped in the algebra enable gate — they always publish).
          const integratorInputs = this.getIntegratorInputExpressions(block)
          const integratorInputTypes = this.getIntegratorInputTypes(block)
          const integratorContext: CodeGenContext = {
            ...context,
            enableExpr: this.enableEvaluator.generateBlockEnableCheck(block.originalId)
          }
          computation = generator.generateComputation(
            blockWithFlattenedName,
            integratorInputs,
            integratorInputTypes,
            integratorContext
          )
        } else if (block.block.type === 'unit_delay') {
          // Output phase only; state update deferred so producers (Sum) are current.
          computation = generator.generateComputation(
            blockWithFlattenedName,
            inputs,
            inputTypes,
            context
          )
        } else {
          computation = generator.generateComputation(blockWithFlattenedName, inputs, inputTypes, context)
        }

        // IGM terminal (Add8<=15): after first terminal major, latch Add12/Add14
        // so atan(vigained) cannot slew Chi as vigained collapses (Chi dive).
        const chiLatch = wrapIgmTerminalChiLatch(block, computation)
        if (chiLatch) computation = chiLatch

        code += this.wrapWithExecutionGates(block, computation)

        // Same-step ActionPort / SwitchCase enable: RTW runs action bodies in the
        // same major hit the If/case condition becomes true. Obliq normally defers
        // enable_states to end-of-step ("for next step"), which adds +1 major cycle
        // of lag on mode DSM writes (mode→3/4, Chi freeze, etc.). When this block
        // is an enable-wire source, refresh dependent enables now so later algebra
        // in this same evaluate_algebraic pass sees the live enable.
        if (this.enableSourceBlockIds.has(block.originalId)) {
          code += this.generateSameStepEnableRefresh(block)
        }

      } catch (error) {
        code += `    /* Error generating code for ${block.block.type}: ${error} */\n`
      }
    }

    // Phase 2: unit_delay / Memory state = u after all algebraic outputs are current
    code += this.generateDeferredStateUpdates(executionOrder)

    // Add sample storage for data collection blocks
    code += this.generateDataCollectionStorage(executionOrder)

    code += '\n'
    return code
  }

  /**
   * Emit deferred unit_delay state updates (state = u) after producers have run.
   * Enable-gates updates so disabled subsystems freeze delay lines (RTW).
   */
  private generateDeferredStateUpdates(executionOrder: FlattenedBlock[]): string {
    let code = ''
    let header = false

    for (const block of executionOrder) {
      if (block.block.type === 'input_port' || block.block.type === 'output_port') {
        continue
      }
      if (block.isSegregated || !BlockModuleFactory.isSupported(block.block.type)) {
        continue
      }

      try {
        const generator = BlockModuleFactory.getBlockModule(block.block.type)
        if (!generator.generateDeferredStateUpdate) {
          continue
        }

        const inputs = this.getBlockInputExpressions(block, 'model', 'model')
        const inputTypes = this.getBlockInputTypes(block)
        const blockWithFlattenedName = withFlattenedSampleParams(block)
        const context: CodeGenContext = {
          parameterNames: this.model.parameters.map(p => p.name),
          debugMath: this.debugMath,
          enableExpr: this.enableEvaluator.generateBlockEnableCheck(block.originalId)
        }

        const update = generator.generateDeferredStateUpdate(
          blockWithFlattenedName,
          inputs,
          inputTypes,
          context
        )
        if (!update || !update.trim()) {
          continue
        }

        if (!header) {
          code += '\n    /* Deferred discrete state updates (unit_delay / Memory) */\n'
          header = true
        }
        code += `\n    /* ${block.flattenedName} state update */\n`
        code += update
      } catch {
        continue
      }
    }

    return code
  }

  /**
   * Gate algebraic updates by enable scope and/or MDL SampleTime.
   *
   * Enable: skip while disabled so signals hold last values
   * (matches RK4/derivative gating).
   *
   * Sample: skip off discrete hits so DSM writes / guidance algebra
   * match RTW rtmIsSampleHit (e.g. IGM 1.6 s on a 0.005 s plant).
   *
   * Exceptions (must run every step while present):
   * - integrators / unit_delay: publish frozen state→signal
   * - enable-wire sources (SwitchCase case_*): keep nested action
   *   enables current for end-of-step enable resolve
   */
  private wrapWithExecutionGates(block: FlattenedBlock, computation: string): string {
    if (!computation.trim()) {
      return computation
    }
    const t = block.block.type
    if (t === 'integrator' || t === 'unit_delay') {
      return computation
    }
    if (this.enableSourceBlockIds.has(block.originalId)) {
      return computation
    }

    const conditions: string[] = []

    if (this.hasEnableSubsystems) {
      const enableExpr = this.enableEvaluator.generateBlockEnableCheck(block.originalId)
      if (enableExpr !== '1') {
        conditions.push(enableExpr)
      }
    }

    if (this.hasSampleScopes) {
      const sampleExpr = this.generateSampleHitCheck(block)
      if (sampleExpr !== '1') {
        conditions.push(sampleExpr)
      }
    }

    if (conditions.length === 0) {
      return computation
    }

    const cond =
      conditions.length === 1 ? conditions[0]! : conditions.join(' && ')
    let code = `    if (${cond}) {\n`
    code += CCodeBuilder.indent(computation, 2)
    if (!code.endsWith('\n')) code += '\n'
    code += '    }\n'
    return code
  }

  /**
   * RTW-style sample hit: tick % round(period/dt) == 0.
   * sample_tick is steps since t=0 (0 on first algebra).
   */
  private generateSampleHitCheck(block: FlattenedBlock): string {
    const period = block.sampleScope
    if (typeof period !== 'number' || !(period > 0)) {
      return '1'
    }
    // Integer steps per period from live dt (Saturn dt=0.005 → 1.6→320, 0.04→8, 0.8→160)
    return `(model->sample_tick % (unsigned long long)llround((${period}) / model->dt) == 0ULL)`
  }
  
  /**
   * Generate sample storage for data collection blocks
   */
  private generateDataCollectionStorage(executionOrder: FlattenedBlock[]): string {
    let code = ''
    let hasDataCollection = false

    for (const block of executionOrder) {
      try {
        const generator = BlockModuleFactory.getBlockModule(block.block.type)

        // Check if this block employs data collection
        if (generator.employsDataCollection && generator.employsDataCollection(block.block)) {
          if (!hasDataCollection) {
            code += '\n    /* Store samples for data collection */\n'
            hasDataCollection = true
          }

          // Get the input expression for this block
          const inputs = this.getBlockInputExpressions(block, 'model', 'model')
          if (inputs.length > 0) {
            const inputExpression = inputs[0]
            const inputType = this.getBlockInputTypes(block)[0] || 'double'

            const blockWithFlattenedName = withFlattenedSampleParams(block)

            // Generate sample storage code
            if (generator.generateSampleStorage) {
              const storageCode = generator.generateSampleStorage(blockWithFlattenedName, inputExpression, inputType)
              if (storageCode && storageCode.trim()) {
                code += storageCode
              }
            }
          }
        }
      } catch (error) {
        // Block type not supported for data collection
        continue
      }
    }

    return code
  }

  /**
   * Get input expressions for a block
   */
  private getBlockInputExpressions(
    block: FlattenedBlock,
    signalsVar: string = 'model',  // Changed default
    statesVar: string = 'model'     // Changed default
  ): string[] {
    // Port-indexed (same shape as getBlockInputTypes) so mux/product ports
    // align when there are gaps or duplicate wires.
    const connections = this.model.connections
      .filter(c => c.targetBlockId === block.originalId && c.targetPortIndex >= 0)
      .sort((a, b) => a.targetPortIndex - b.targetPortIndex)

    let maxPort = -1
    for (const c of connections) {
      if (c.targetPortIndex > maxPort) maxPort = c.targetPortIndex
    }
    const inputs: string[] = Array.from({ length: maxPort + 1 }, () => '0.0')

    // SwitchCase case_* (enable sources) must see live DSM values. Data Store
    // Reads that feed the selector are often evaluated earlier in the same
    // algebra pass (before mode DSWs), so using the Read *signal* adds an
    // extra ActionPort enable lag. Read model->data_stores.* directly instead.
    const preferLiveDsm = this.enableSourceBlockIds.has(block.originalId)

    for (const connection of connections) {
      const sourceBlock = this.model.blocks.find(
        b => b.originalId === connection.sourceBlockId
      )
      if (!sourceBlock) continue
      let expr = this.generateSignalExpression(
        sourceBlock,
        connection.sourcePortIndex,
        signalsVar
      )
      if (preferLiveDsm && sourceBlock.block.type === 'data_store_read') {
        const store =
          sourceBlock.block.parameters?.storeName ||
          sourceBlock.block.parameters?.dataStoreName ||
          'store'
        const safeStore = CCodeBuilder.sanitizeIdentifier(String(store))
        expr = `model->data_stores.${safeStore}`
      }
      const port = connection.targetPortIndex
      // Prefer first non-default; dimensional sources win on duplicates
      if (inputs[port] === '0.0') {
        inputs[port] = expr
      }
    }

    return inputs
  }

  /** Synthetic SwitchCase case_N evaluate blocks from mdl2obliq emitObliq. */
  private isSwitchCaseCaseEvaluate(block: FlattenedBlock): boolean {
    const n = block.flattenedName || block.block.name || ''
    return /Switch_Case_case_-?\d+$/i.test(n) || /_case_-?\d+$/i.test(block.block.name || '')
  }

  /**
   * Same-step ActionPort enable when the action writes mode / Chi / terminal
   * steering DSMs (RTW rtAction). Detected by **store names**, not Saturn
   * block-name allowlists (avoids HSL-named codegen forks).
   * Intentionally excludes First Phase Set nIGMMode=1 and nHSLActive-only
   * actions (HSL arm is model-level with mode→4 — applyHslModelLevel).
   */
  private shouldSameStepRefreshTarget(info: {
    subsystemName: string
    controlledBlockIds?: string[]
  }): boolean {
    const n = info.subsystemName || ''
    // Keep explicit Chi / terminal names as backup if DSW ids not yet linked
    if (/IGM_Chi_Steering/i.test(n) || /Set_Terminal_Steering/i.test(n)) {
      return true
    }
    if (/Set_nIGMMode_to_3/i.test(n)) return true

    for (const id of info.controlledBlockIds || []) {
      const block = this.model.blocks.find(b => b.originalId === id)
      if (!block || block.block.type !== 'data_store_write') continue
      const store = String(
        block.block.parameters?.storeName ||
          block.block.parameters?.logicalStoreName ||
          ''
      )
      // mode→3/4 (incl. ActionPort still named Set_HSL_Mode that writes nIGMMode)
      if (/nIGMMode$/i.test(store) || store === 'nIGMMode') {
        // Exclude First Phase "set to 1" by requiring parent path not First_Phase
        // when store write constant is 1 — hard without reading source.
        // Exclude writes whose flattened path includes First_Phase / Set_nIGMMode_to_1
        const path = block.flattenedName || ''
        if (/First_Phase|Set_nIGMMode_to_1|_to_1_/i.test(path)) continue
        if (/nIGMMode/i.test(store)) return true
      }
      if (/Chi_[YZ]_deg$/i.test(store) || /nTerminalSteeringMode$/i.test(store)) {
        return true
      }
    }
    return false
  }

  /**
   * After an enable-wire source (If / epsilon_prime) updates, refresh
   * enable_states for allowlisted ActionPorts so DSM writes run same-step.
   */
  private generateSameStepEnableRefresh(sourceBlock: FlattenedBlock): string {
    // SwitchCase case_* only update end-of-step enables (live DSM is enough).
    if (this.isSwitchCaseCaseEvaluate(sourceBlock)) return ''

    const dependents = this.model.subsystemEnableInfo.filter(
      info =>
        info.hasEnableInput &&
        info.enableWire?.sourceBlockId === sourceBlock.originalId &&
        info.enableEdge !== 'rising' &&
        this.shouldSameStepRefreshTarget(info)
    )
    if (dependents.length === 0) return ''

    const sourceExpr = this.generateSignalExpression(sourceBlock, 0, 'model')
    const boolExpr = CCodeBuilder.generateBooleanExpression(sourceExpr)

    let code = `    /* Same-step enable refresh (RTW ActionPort / SwitchCase) from ${sourceBlock.flattenedName} */\n`
    for (const info of dependents) {
      const safeSys = CCodeBuilder.sanitizeIdentifier(info.subsystemName)
      if (info.parentSubsystemId) {
        const parent = this.model.subsystemEnableInfo.find(
          s => s.subsystemId === info.parentSubsystemId
        )
        if (parent?.hasEnableInput) {
          const safeParent = CCodeBuilder.sanitizeIdentifier(parent.subsystemName)
          code += `    if (!model->enable_states.${safeParent}_enabled) {\n`
          code += `        model->enable_states.${safeSys}_enabled = 0;\n`
          code += `    } else {\n`
          code += `        model->enable_states.${safeSys}_enabled = ${boolExpr};\n`
          code += `    }\n`
          continue
        }
      }
      code += `    model->enable_states.${safeSys}_enabled = ${boolExpr};\n`
    }
    return code
  }
  
  /**
   * Special handling for transfer function inputs to include state reference
   */
  private getTransferFunctionInputs(block: FlattenedBlock, inputs: string[]): string[] {
    // Transfer functions need access to their states - use flattened name for uniqueness
    const safeName = CCodeBuilder.sanitizeIdentifier(block.flattenedName)
    return [...inputs, `model->states.${safeName}_states`]  // Changed to use model->
  }
  
  /**
   * Generate expression to access a signal value
   */
  private generateSignalExpression(
    block: FlattenedBlock,
    portIndex: number,
    signalsVar: string = 'model'  // Changed default
  ): string {
    // Handle segregated subsystems - access outputs directly from subsystem struct
    if (block.isSegregated) {
      const subInfo = this.model.segregatedSubsystems?.find(
        s => s.subsystemId === block.originalId
      )
      if (subInfo) {
        // Find the output port by index
        const outputPort = subInfo.outputPorts.find(p => p.index === portIndex)
        if (outputPort) {
          return `model->${subInfo.sanitizedName}.outputs.${outputPort.sanitizedName}`
        }
        // Fallback: if port not found by index, use first output (single output case)
        if (subInfo.outputPorts.length > 0 && portIndex === 0) {
          const port = subInfo.outputPorts[0]
          return `model->${subInfo.sanitizedName}.outputs.${port.sanitizedName}`
        }
      }
    }

    // Multi-output blocks: append port label/suffix (atmosphere, orientation euler, etc.)
    const memberName = getSignalMemberName(
      block.flattenedName,
      block.block.type,
      portIndex,
      block.block
    )

    // Updated to append ->signals. when signalsVar is 'model'
    if (signalsVar === 'model') {
      return `${signalsVar}->signals.${memberName}`
    } else {
      // For backward compatibility with other uses
      return `${signalsVar}.${memberName}`
    }
  }

  /**
   * Generate code to copy signals to outputs
   */
  private generateOutputCopy(): string {
    const outputPorts = this.model.blocks.filter(b => b.block.type === 'output_port')

    if (outputPorts.length === 0) {
      return ''
    }

    let code = '    /* Copy signals to outputs */\n'

    for (const port of outputPorts) {
      const portName = port.block.parameters?.portName || port.block.name
      const safePortName = CCodeBuilder.sanitizeIdentifier(portName)

      // Find the wire connected to this output port
      const inputWire = this.model.connections.find(c =>
        c.targetBlockId === port.originalId && c.targetPortIndex === 0
      )

      if (inputWire) {
        const sourceBlock = this.model.blocks.find(b =>
          b.originalId === inputWire.sourceBlockId
        )

        if (sourceBlock) {
          const sourceExpr = this.generateSignalExpression(sourceBlock, inputWire.sourcePortIndex)

          // Segregated multi-out: type follows sourcePortIndex, not port-0
          const outputType = this.getBlockOutputType(
            sourceBlock,
            inputWire.sourcePortIndex
          )

          if (outputType.includes('[')) {
            // Array copy
            code += `    memcpy(&model->outputs.${safePortName}, &${sourceExpr}, sizeof(model->outputs.${safePortName}));\n`
          } else {
            // Scalar copy
            code += `    model->outputs.${safePortName} = ${sourceExpr};\n`
          }
        }
      }
    }

    code += '\n'
    return code
  }

  /**
   * Get input types for a block
   */
  private getBlockInputTypes(block: FlattenedBlock): string[] {
    // Data ports only; prefer dimensional type when multiple wires hit one port
    const connections = this.model.connections
      .filter(c => c.targetBlockId === block.originalId && c.targetPortIndex >= 0)
      .sort((a, b) => a.targetPortIndex - b.targetPortIndex)

    let maxPort = -1
    for (const c of connections) {
      if (c.targetPortIndex > maxPort) maxPort = c.targetPortIndex
    }
    const types: string[] = Array.from({ length: maxPort + 1 }, () => 'double')

    for (const connection of connections) {
      let sourceType = this.typeMap.get(connection.sourceBlockId) || 'double'
      // Segregated multi-out: type depends on sourcePortIndex, not block-level map
      const sourceBlock = this.model.blocks.find(
        b => b.originalId === connection.sourceBlockId
      )
      if (sourceBlock?.isSegregated) {
        const subInfo = this.model.segregatedSubsystems?.find(
          s => s.subsystemId === sourceBlock.originalId
        )
        const outPort = subInfo?.outputPorts.find(
          p => p.index === connection.sourcePortIndex
        )
        if (outPort?.dataType) {
          sourceType = outPort.dataType
        }
      }
      const port = connection.targetPortIndex
      const prev = types[port]
      if (
        prev === 'double' ||
        (!prev.includes('[') && sourceType.includes('['))
      ) {
        types[port] = sourceType
      }
    }

    return types
  }

  /**
   * Build integrator codegen inputs:
   *   [0] derivative (port 0)
   *   [1] x(0) when showInitPort (port 1)
   *   [last] reset control when showResetInput (port -2)
   */
  private getIntegratorInputExpressions(block: FlattenedBlock): string[] {
    const showInitPort = !!block.block.parameters?.showInitPort
    const showResetInput = !!block.block.parameters?.showResetInput
    const inputs: string[] = []

    // Port 0: derivative
    inputs.push(this.getInputExpressionForPort(block, 0) || '0.0')

    // Port 1: x(0) external IC
    if (showInitPort) {
      inputs.push(this.getInputExpressionForPort(block, 1) || '0.0')
    }

    // Control port -2: reset (rising edge)
    if (showResetInput) {
      inputs.push(this.getInputExpressionForPort(block, -2) || '0')
    }

    return inputs
  }

  /**
   * Input types for integrator data ports only (derivative, optional x(0)).
   * Reset is control and not used for type propagation.
   */
  private getIntegratorInputTypes(block: FlattenedBlock): string[] {
    const showInitPort = !!block.block.parameters?.showInitPort
    const types: string[] = []

    const derivConn = this.model.connections.find(
      c => c.targetBlockId === block.originalId && c.targetPortIndex === 0
    )
    types.push(derivConn ? (this.typeMap.get(derivConn.sourceBlockId) || 'double') : 'double')

    if (showInitPort) {
      const initConn = this.model.connections.find(
        c => c.targetBlockId === block.originalId && c.targetPortIndex === 1
      )
      types.push(initConn ? (this.typeMap.get(initConn.sourceBlockId) || 'double') : 'double')
    }

    return types
  }
  
  /**
   * Get output type for a block (optional portIndex for segregated multi-out).
   */
  private getBlockOutputType(block: FlattenedBlock, portIndex: number = 0): string {
    if (block.isSegregated) {
      const subInfo = this.model.segregatedSubsystems?.find(
        s => s.subsystemId === block.originalId
      )
      const port = subInfo?.outputPorts.find(p => p.index === portIndex)
      if (port?.dataType) return port.dataType
    }
    return this.typeMap.get(block.originalId) || 'double'
  }

  /**
   * Generate code to call a segregated subsystem's compute_outputs function
   */
  private generateSegregatedSubsystemCall(block: FlattenedBlock): string {
    // Find the SubsystemInfo for this block
    const subInfo = this.model.segregatedSubsystems?.find(
      s => s.subsystemId === block.originalId
    )

    if (!subInfo) {
      return `    /* Error: Segregated subsystem info not found for ${block.block.name} */\n`
    }

    const safeName = subInfo.sanitizedName
    let code = `\n    /* Segregated subsystem: ${block.block.name} */\n`

    // Sync timebase so unit_delay / sample_time / clock inside the module see parent values
    code += `    model->${safeName}.time = model->time;\n`
    code += `    model->${safeName}.dt = model->dt;\n`
    code += `    model->${safeName}.sample_tick = model->sample_tick;\n`

    // Sync shared data stores parent → module (intersection of names)
    const parentStoreNames = new Set((this.model.dataStores || []).map(s => s.name))
    const sharedStores = (subInfo.flattenedModel.dataStores || []).filter(s =>
      parentStoreNames.has(s.name)
    )
    for (const store of sharedStores) {
      const sn = CCodeBuilder.sanitizeIdentifier(store.name)
      if ((store.dataType || '').includes('[')) {
        code += `    memcpy(&model->${safeName}.data_stores.${sn}, &model->data_stores.${sn}, sizeof(model->${safeName}.data_stores.${sn}));\n`
      } else {
        code += `    model->${safeName}.data_stores.${sn} = model->data_stores.${sn};\n`
      }
    }

    // Plant producers under Module↔enable cycle scopes are ordered *after* this
    // call (cycle break). Publish integrator/unit_delay state and recompute DF
    // transforms (e.g. S_IVB Xe / Ve) so crossing ports see the current step.
    code += this.generatePreSegregatedInputRefresh(block)

    // Copy inputs to subsystem input struct
    for (const port of subInfo.inputPorts) {
      const inputExpr = this.getInputExpressionForPort(block, port.index)
      if (inputExpr) {
        if (port.dataType.includes('[')) {
          code += `    memcpy(&model->${safeName}.inputs.${port.sanitizedName}, &${inputExpr}, sizeof(model->${safeName}.inputs.${port.sanitizedName}));\n`
        } else {
          code += `    model->${safeName}.inputs.${port.sanitizedName} = ${inputExpr};\n`
        }
      }
    }

    // Set enable state if subsystem has enable input
    if (subInfo.hasEnableInput) {
      const enableExpr = this.getEnableExpression(block)
      code += `    model->${safeName}.enabled = (${enableExpr}) > 0.5 ? 1 : 0;\n`
      code += `    if (model->${safeName}.enabled) {\n`
      code += `        ${safeName}_compute_outputs(&model->${safeName});\n`
      code += `    }\n`
    } else {
      code += `    ${safeName}_compute_outputs(&model->${safeName});\n`
    }

    // Sync shared data stores module → parent (writes from inside must be visible)
    for (const store of sharedStores) {
      const sn = CCodeBuilder.sanitizeIdentifier(store.name)
      if ((store.dataType || '').includes('[')) {
        code += `    memcpy(&model->data_stores.${sn}, &model->${safeName}.data_stores.${sn}, sizeof(model->data_stores.${sn}));\n`
      } else {
        code += `    model->data_stores.${sn} = model->${safeName}.data_stores.${sn};\n`
      }
    }

    // Note: Subsystem outputs are accessed directly via model->SubsystemName.outputs.PortName
    // by downstream blocks (see generateSignalExpression), so no copy is needed here

    // Topo may have evaluated enable predicates (e.g. S_IVB_Stage_enable_bool)
    // *before* this call due to Module↔enable algebraic cycles, reading stale
    // outputs. Refresh those predicates from live outs so end-of-step
    // evaluate_enable_states matches flatten (Stage_Sep→enable same major hit).
    code += this.generatePostSegregatedEnablePredicateRefresh(block)

    return code
  }

  /**
   * True when source sits under an enable scope whose predicate is fed by
   * this segregated module (Module↔enable algebraic cycle).
   */
  private isModuleEnableCycleSource(
    segregatedBlock: FlattenedBlock,
    sourceBlock: FlattenedBlock
  ): boolean {
    if (!sourceBlock.enableScope) return false
    const scopeInfo = this.model.subsystemEnableInfo.find(
      s => s.subsystemId === sourceBlock.enableScope
    )
    const enableSrcId = scopeInfo?.enableWire?.sourceBlockId
    if (!enableSrcId) return false
    return this.model.connections.some(
      c =>
        c.sourceBlockId === segregatedBlock.originalId &&
        c.targetBlockId === enableSrcId
    )
  }

  /**
   * Before copying segregated inputs, refresh plant signals that the topo
   * cycle-break deferred past this call. Integrators / unit_delay publish
   * frozen state only (no IcNeedsLoading — that stays in normal order after
   * Body_to_ECI). DF producers in the cone are fully recomputed.
   */
  private generatePreSegregatedInputRefresh(
    segregatedBlock: FlattenedBlock
  ): string {
    const roots: FlattenedBlock[] = []
    for (const c of this.model.connections) {
      if (c.targetBlockId !== segregatedBlock.originalId) continue
      if (c.targetPortIndex < 0) continue
      const source = this.model.blocks.find(b => b.originalId === c.sourceBlockId)
      if (!source) continue
      if (!this.isModuleEnableCycleSource(segregatedBlock, source)) continue
      roots.push(source)
    }
    if (roots.length === 0) return ''

    // Collect producer cone (ancestors first) among cycle-broken plant blocks.
    // Stop at non-DF blocks (integrator / unit_delay): only publish frozen
    // state — do NOT walk derivative/IC inputs or the whole plant is pulled in.
    const ordered: FlattenedBlock[] = []
    const visiting = new Set<string>()
    const visited = new Set<string>()
    const visit = (block: FlattenedBlock) => {
      if (visited.has(block.originalId)) return
      if (visiting.has(block.originalId)) return
      visiting.add(block.originalId)
      const t = block.block.type
      if (t !== 'integrator' && t !== 'unit_delay') {
        for (const c of this.model.connections) {
          if (c.targetBlockId !== block.originalId) continue
          const pred = this.model.blocks.find(b => b.originalId === c.sourceBlockId)
          if (!pred) continue
          if (pred.originalId === segregatedBlock.originalId) continue
          if (!this.isModuleEnableCycleSource(segregatedBlock, pred)) continue
          visit(pred)
        }
      }
      visiting.delete(block.originalId)
      visited.add(block.originalId)
      ordered.push(block)
    }
    for (const root of roots) visit(root)
    if (ordered.length === 0) return ''

    let code = `\n    /* Pre-segregated input refresh: ${segregatedBlock.block.name} crossing ports */\n`
    code += '    {\n'
    for (const block of ordered) {
      const t = block.block.type
      if (t === 'integrator' || t === 'unit_delay') {
        const publish = this.generateFrozenStatePublish(block)
        if (publish.trim()) {
          code += CCodeBuilder.indent(
            `/* ${block.flattenedName} state→signal (no IC) */\n${publish}`,
            2
          )
          if (!code.endsWith('\n')) code += '\n'
        }
        continue
      }
      if (!BlockModuleFactory.isSupported(t)) continue
      if (!this.hasDirectFeedthrough(block)) continue
      try {
        const generator = BlockModuleFactory.getBlockModule(t)
        const inputs = this.getBlockInputExpressions(block, 'model', 'model')
        const inputTypes = this.getBlockInputTypes(block)
        const named = withFlattenedSampleParams(block)
        const outputType = generator.getOutputType(named, inputTypes)
        this.typeMap.set(block.originalId, outputType)
        const context: CodeGenContext = {
          parameterNames: this.model.parameters.map(p => p.name),
          debugMath: this.debugMath
        }
        const computation = generator.generateComputation(
          named,
          inputs,
          inputTypes,
          context
        )
        if (!computation.trim()) continue
        code += CCodeBuilder.indent(
          this.wrapWithExecutionGates(block, computation),
          2
        )
        if (!code.endsWith('\n')) code += '\n'
      } catch {
        continue
      }
    }
    code += '    }\n'
    return code
  }

  /**
   * Emit signals = states for integrator / unit_delay without IcNeedsLoading.
   */
  private generateFrozenStatePublish(block: FlattenedBlock): string {
    const named = withFlattenedSampleParams(block)
    const signalName = CCodeBuilder.sanitizeIdentifier(named.name)
    const stateName = CCodeBuilder.sanitizeIdentifier(named.name)
    let outputType = this.typeMap.get(block.originalId)
    if (!outputType) {
      try {
        const mod = BlockModuleFactory.getBlockModule(block.block.type)
        const inputTypes =
          block.block.type === 'integrator'
            ? this.getIntegratorInputTypes(block)
            : this.getBlockInputTypes(block)
        outputType = mod.getOutputType(named, inputTypes)
        this.typeMap.set(block.originalId, outputType)
      } catch {
        outputType = 'double'
      }
    }

    // Local parse to avoid importing BlockModuleUtils solely for this helper.
    const matrixMatch = outputType.match(/^double\[(\d+)\]\[(\d+)\]$/)
    const arrayMatch = outputType.match(/^double\[(\d+)\]$/)
    const stateField =
      block.block.type === 'unit_delay' ? `${stateName}_state` : `${stateName}_states`

    let code = ''
    if (matrixMatch) {
      const rows = matrixMatch[1]
      const cols = matrixMatch[2]
      code += `    for (int i = 0; i < ${rows}; i++) {\n`
      code += `        for (int j = 0; j < ${cols}; j++) {\n`
      code += `            model->signals.${signalName}[i][j] = model->states.${stateField}[i][j];\n`
      code += `        }\n`
      code += `    }\n`
    } else if (arrayMatch) {
      const n = arrayMatch[1]
      code += `    for (int i = 0; i < ${n}; i++) {\n`
      code += `        model->signals.${signalName}[i] = model->states.${stateField}[i];\n`
      code += `    }\n`
    } else if (block.block.type === 'unit_delay') {
      code += `    model->signals.${signalName} = model->states.${stateField};\n`
    } else {
      code += `    model->signals.${signalName} = model->states.${stateField}[0];\n`
    }
    return code
  }

  /**
   * Re-emit enable-wire source blocks (evaluate/condition) that read this
   * segregated module's outputs, so enable_bool sees live Stage_Sep / etc.
   */
  private generatePostSegregatedEnablePredicateRefresh(
    segregatedBlock: FlattenedBlock
  ): string {
    const consumerIds = new Set<string>()
    for (const c of this.model.connections) {
      if (c.sourceBlockId !== segregatedBlock.originalId) continue
      consumerIds.add(c.targetBlockId)
    }
    if (consumerIds.size === 0) return ''

    let code = ''
    for (const id of consumerIds) {
      if (!this.enableSourceBlockIds.has(id)) continue
      const consumer = this.model.blocks.find(b => b.originalId === id)
      if (!consumer) continue
      if (
        consumer.block.type !== 'evaluate' &&
        consumer.block.type !== 'condition'
      ) {
        continue
      }
      if (!BlockModuleFactory.isSupported(consumer.block.type)) continue

      try {
        const generator = BlockModuleFactory.getBlockModule(consumer.block.type)
        const inputs = this.getBlockInputExpressions(consumer, 'model', 'model')
        const inputTypes = this.getBlockInputTypes(consumer)
        const named = withFlattenedSampleParams(consumer)
        const context: CodeGenContext = {
          parameterNames: this.model.parameters.map(p => p.name),
          debugMath: this.debugMath
        }
        const computation = generator.generateComputation(
          named,
          inputs,
          inputTypes,
          context
        )
        if (!computation.trim()) continue
        // Brace-scope so _eval_* temporaries from the earlier emit don't collide.
        code += `\n    /* Post-segregated refresh: ${consumer.flattenedName} (live ${segregatedBlock.block.name} outs) */\n`
        code += '    {\n'
        code += CCodeBuilder.indent(computation, 2)
        if (!code.endsWith('\n')) code += '\n'
        code += '    }\n'
      } catch {
        continue
      }
    }
    return code
  }

  /**
   * Get the input expression for a specific port of a block
   */
  private getInputExpressionForPort(block: FlattenedBlock, portIndex: number): string | null {
    const connection = this.model.connections.find(c =>
      c.targetBlockId === block.originalId && c.targetPortIndex === portIndex
    )

    if (connection) {
      const sourceBlock = this.model.blocks.find(b =>
        b.originalId === connection.sourceBlockId
      )
      if (sourceBlock) {
        return this.generateSignalExpression(sourceBlock, connection.sourcePortIndex)
      }
    }

    return null
  }

  /**
   * Get the enable expression for a subsystem block
   */
  private getEnableExpression(block: FlattenedBlock): string {
    // Find the connection to the enable port (port index -1)
    const connection = this.model.connections.find(c =>
      c.targetBlockId === block.originalId && c.targetPortIndex === -1
    )

    if (connection) {
      const sourceBlock = this.model.blocks.find(b =>
        b.originalId === connection.sourceBlockId
      )
      if (sourceBlock) {
        return this.generateSignalExpression(sourceBlock, connection.sourcePortIndex)
      }
    }

    return '1' // Default to enabled if no enable wire
  }
}