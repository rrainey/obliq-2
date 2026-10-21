// lib/codegen/SubsystemCodeGenerator.ts

import {
  SubsystemInfo,
  SubsystemPort,
  subsystemModuleTypeName
} from './SubsystemInfo'
import { FlattenedBlock, FlattenedModel, SubsystemEnableInfo } from './ModelFlattener'
import { CCodeBuilder } from './CCodeBuilder'
import { TypePropagator } from './TypePropagator'
import { BlockModuleFactory } from '../blocks/BlockModuleFactory'
import { CodeGenContext } from '../blocks/BlockModule'
import { BlockData } from '@/components/BlockNode'
import { ModelParameter } from '@/lib/modelSchema'
import { parseType, isValidType } from '@/lib/typeValidator'
import {
  DataStoreDeclaration,
  dataStoreMemberDecl,
  normalizeDataStoreType
} from '@/lib/dataStoreUtils'
import { getSignalMemberName } from './signalMemberName'
import { EnableEvaluator } from './EnableEvaluator'
import {
  needsIgmTerminalChiLatch,
  generateIgmTerminalChiLatchStatics,
  wrapIgmTerminalChiLatch
} from './igmTerminalChiLatch'

/**
 * Result of subsystem code generation
 */
export interface SubsystemCodeResult {
  /** Generated header file content (subsystem_name.h) */
  header: string

  /** Generated source file content (subsystem_name.c) */
  source: string

  /** Sanitized subsystem name used in code */
  subsystemName: string

  /** Any warnings generated during code generation */
  warnings: string[]
}

/**
 * Generates independent C code modules for segregated subsystems.
 *
 * Each segregated subsystem gets its own .h and .c files with:
 * - Input/output/signal/state structs
 * - Main subsystem struct containing all of the above
 * - init() function
 * - compute_outputs() function (algebraic evaluation)
 * - compute_derivatives() function (for RK4 integration)
 * - Optional reset_states() function (if integrators with reset exist)
 */
export class SubsystemCodeGenerator {
  private info: SubsystemInfo
  private typeMap: Map<string, string>
  private warnings: string[] = []
  /** Data stores referenced inside this subsystem (local copy on Name_t). */
  private dataStores: DataStoreDeclaration[] = []
  /** Nested Action/Enable scopes owned by this module. */
  private enableInfos: SubsystemEnableInfo[] = []
  private enableEvaluator: EnableEvaluator | null = null
  private enableSourceBlockIds = new Set<string>()

  constructor(info: SubsystemInfo) {
    this.info = info

    // Propagate types through the subsystem's internal model
    const typePropagator = new TypePropagator(info.flattenedModel)
    this.typeMap = typePropagator.propagate()
    this.dataStores = (info.flattenedModel.dataStores || []).map(s => ({
      ...s,
      dataType: normalizeDataStoreType(s.dataType)
    }))

    this.enableInfos =
      info.subsystemEnableInfo ||
      info.flattenedModel.subsystemEnableInfo ||
      []
    if (this.enableInfos.some(e => e.hasEnableInput)) {
      // EnableEvaluator expects a FlattenedModel with metadata.modelName
      const enableModel: FlattenedModel = {
        ...info.flattenedModel,
        subsystemEnableInfo: this.enableInfos,
        metadata: {
          ...info.flattenedModel.metadata,
          modelName: subsystemModuleTypeName(info)
        }
      }
      this.enableEvaluator = new EnableEvaluator(enableModel)
      for (const e of this.enableInfos) {
        if (e.hasEnableInput && e.enableWire) {
          this.enableSourceBlockIds.add(e.enableWire.sourceBlockId)
        }
      }
    }
  }

  private hasNestedEnables(): boolean {
    return this.enableInfos.some(e => e.hasEnableInput)
  }

  /** Shared C module type / file stem (not the parent instance field). */
  private typeName(): string {
    return subsystemModuleTypeName(this.info)
  }

  private useInstanceParams(): boolean {
    return !!this.info.sharedModule
  }

  /**
   * Unique C identifier for signals/states inside this module.
   * Nested flatten leaves many blocks named "Demux"/"Add" — must use flattenedName.
   */
  private signalName(block: FlattenedBlock): string {
    return CCodeBuilder.sanitizeIdentifier(block.flattenedName || block.block.name)
  }

  /**
   * BlockData with name rewritten to the unique signalName for codegen helpers,
   * and inherited sampleScope merged into parameters.sampleTimeSec (same as
   * withFlattenedSampleParams in AlgebraicEvaluator) so discrete modules
   * (rate_limiter, unit_delay, …) see Ts = sample period, not model->dt.
   */
  private asNamedBlock(block: FlattenedBlock): BlockData {
    const sampleScope = block.sampleScope
    return {
      ...block.block,
      name: this.signalName(block),
      parameters: {
        ...(block.block.parameters || {}),
        ...(typeof sampleScope === 'number' && sampleScope > 0
          ? { sampleTimeSec: sampleScope }
          : {})
      }
    }
  }

  /**
   * Generate complete C code for the subsystem
   */
  generate(): SubsystemCodeResult {
    const header = this.generateHeader()
    const source = this.generateSource()

    return {
      header,
      source,
      subsystemName: this.typeName(),
      warnings: [...this.warnings]
    }
  }

  /**
   * Generate the header file (.h)
   */
  private generateHeader(): string {
    const name = this.typeName()
    const guard = CCodeBuilder.generateIncludeGuard(name)
    let header = guard.start

    // Standard includes
    header += '#include <stdint.h>\n'
    header += '#include <stdbool.h>\n'
    header += '#include <math.h>\n\n'
    header += '#ifndef M_PI\n#define M_PI 3.14159265358979323846\n#endif\n\n'

    // Subsystem parameters as #define statements
    header += this.generateParameters()

    // C++ compatibility
    header += '#ifdef __cplusplus\n'
    header += 'extern "C" {\n'
    header += '#endif\n\n'

    // Type definitions
    header += this.generateInputsStruct()
    header += '\n'
    header += this.generateOutputsStruct()
    header += '\n'
    header += this.generateSignalsStruct()
    header += '\n'
    header += this.generateStatesStruct()
    header += '\n'
    header += this.generateDataStoresStruct()
    header += '\n'
    if (this.hasNestedEnables()) {
      header += this.generateEnableStatesStruct()
      header += '\n'
    }
    header += this.generateSubsystemStruct()
    header += '\n'

    // Function prototypes
    header += this.generateFunctionPrototypes()

    // Close C++ compatibility
    header += '\n#ifdef __cplusplus\n'
    header += '}\n'
    header += '#endif\n'

    header += guard.end
    return header
  }

  /**
   * Generate the source file (.c)
   */
  private generateSource(): string {
    const name = this.typeName()
    let source = ''

    // File header comment
    source += CCodeBuilder.generateCommentBlock([
      `${this.info.subsystemName} - Segregated Subsystem`,
      `Generated C code for subsystem module`,
      `Generated on: ${new Date().toISOString()}`
    ])
    source += '\n'

    // Includes
    source += `#include "${name}.h"\n`
    source += '#include <string.h>\n\n'

    // Init function
    source += this.generateInitFunction()
    source += '\n'

    // Compute outputs function
    source += this.generateComputeOutputsFunction()
    source += '\n'

    // Nested enable evaluation (Action/Enable ports inside the module)
    if (this.hasNestedEnables() && this.enableEvaluator) {
      source += this.enableEvaluator.generate()
      source += '\n'
    }

    // Compute derivatives function (if stateful)
    if (this.info.hasState) {
      source += this.generateComputeDerivativesFunction()
      source += '\n'
    }

    // Reset states function (if integrators with reset)
    if (this.info.hasResetInput) {
      source += this.generateResetStatesFunction()
      source += '\n'
    }

    // UH60 P3: Memory major-step hold (parent calls after RK4)
    if (this.hasMemoryDelayBlocks()) {
      source += this.generateUpdateMemoryStatesFunction()
      source += '\n'
    }

    return source
  }

  // ============================================================
  // Header Generation Helpers
  // ============================================================

  /** Names of per-instance (subsystem-local) parameters when sharedModule. */
  private instanceParamNameSet(): Set<string> {
    return new Set((this.info.instanceParameters || []).map(p => p.name))
  }

  /**
   * Generate subsystem parameter definitions.
   * Shared modules: instance params → `Name_params_t` struct; host params stay #define.
   * Standalone: all params as #define / static const (legacy).
   */
  private generateParameters(): string {
    const params = this.info.parameters
    if (!params || params.length === 0) {
      if (!this.useInstanceParams()) return ''
      if (!(this.info.instanceParameters || []).length) return this.emptyParamsStruct()
    }

    const reserved = new Set<string>()
    for (const p of [...this.info.inputPorts, ...this.info.outputPorts]) {
      reserved.add(p.sanitizedName)
    }
    for (const block of this.info.flattenedModel.blocks) {
      reserved.add(this.signalName(block))
    }

    const instanceNames = this.useInstanceParams()
      ? this.instanceParamNameSet()
      : new Set<string>()

    let code = CCodeBuilder.generateCommentBlock([
      this.useInstanceParams()
        ? 'Host #defines + per-instance params struct (shared module)'
        : 'Subsystem / host model parameters',
      'Source blocks reference PARAM_<name>'
    ])

    // Instance params struct (shared module ABI)
    if (this.useInstanceParams() && instanceNames.size > 0) {
      const name = this.typeName()
      const members: string[] = []
      for (const param of this.info.instanceParameters || []) {
        const typeStr = String(param.dataType || param.signalType || 'double')
        if (!isValidType(typeStr)) continue
        const parsed = parseType(typeStr)
        const safe = CCodeBuilder.sanitizeIdentifier(param.name)
        if (parsed.isMatrix && parsed.rows && parsed.cols) {
          members.push(
            `    ${parsed.baseType} ${safe}[${parsed.rows}][${parsed.cols}];`
          )
        } else if (parsed.isArray && parsed.arraySize) {
          members.push(`    ${parsed.baseType} ${safe}[${parsed.arraySize}];`)
        } else {
          members.push(`    ${parsed.baseType} ${safe};`)
        }
      }
      if (members.length > 0) {
        code += CCodeBuilder.generateStruct(
          `${name}_params`,
          members,
          'Per-instance parameter values (set by parent at init)'
        )
        code += '\n'
      } else {
        code += this.emptyParamsStruct()
      }
    } else if (this.useInstanceParams()) {
      code += this.emptyParamsStruct()
    }

    for (const param of params || []) {
      const { name, signalType, value } = param
      if (instanceNames.has(name)) {
        // Instance field — no compile-time #define in the header
        continue
      }

      if (!signalType || !isValidType(signalType)) {
        code += `// Warning: Invalid signal type for parameter ${name}: ${signalType}\n`
        continue
      }

      const parsedType = parseType(signalType)
      const baseType = parsedType.baseType
      const safeName = CCodeBuilder.sanitizeIdentifier(name)

      if (parsedType.isMatrix && parsedType.rows && parsedType.cols) {
        // Host tables: declare extern (defined once in parent .c) to avoid ODR
        // clashes when parent also materializes the same lookup parameters.
        code += `#define ${safeName}_ROWS ${parsedType.rows}\n`
        code += `#define ${safeName}_COLS ${parsedType.cols}\n`
        code += `extern const ${baseType} ${safeName}[${safeName}_ROWS][${safeName}_COLS];\n`
        code += `#define PARAM_${safeName} ${safeName}\n\n`
      } else if (parsedType.isArray && parsedType.arraySize) {
        code += `#define ${safeName}_SIZE ${parsedType.arraySize}\n`
        code += `extern const ${baseType} ${safeName}[${safeName}_SIZE];\n`
        code += `#define PARAM_${safeName} ${safeName}\n\n`
      } else {
        const literal = this.formatScalarLiteral(value as number, baseType)
        code += `#define PARAM_${safeName} ${literal}\n`
      }
    }

    code += '\n'
    return code
  }

  /**
   * A shared module's init always takes a `Name_params_t*` (the parent passes
   * NULL when there are no instance parameters), so the type must exist.
   */
  private emptyParamsStruct(): string {
    return (
      CCodeBuilder.generateStruct(
        `${this.typeName()}_params`,
        ['    int unused; /* No per-instance parameters */'],
        'Per-instance parameter values (none for this module)'
      ) + '\n'
    )
  }

  /** File-scope macros mapping PARAM_* → model->params.* inside .c functions. */
  private generateInstanceParamMacros(indent: string = '    '): string {
    if (!this.useInstanceParams()) return ''
    const names = this.info.instanceParameters || []
    if (names.length === 0) return ''
    let code = `${indent}/* Instance PARAM_* → model->params */\n`
    for (const p of names) {
      const safe = CCodeBuilder.sanitizeIdentifier(p.name)
      code += `${indent}#define PARAM_${safe} (model->params.${safe})\n`
    }
    return code
  }

  private generateInstanceParamUndefs(indent: string = '    '): string {
    if (!this.useInstanceParams()) return ''
    const names = this.info.instanceParameters || []
    if (names.length === 0) return ''
    let code = ''
    for (const p of names) {
      const safe = CCodeBuilder.sanitizeIdentifier(p.name)
      code += `${indent}#undef PARAM_${safe}\n`
    }
    return code
  }

  /**
   * Format a scalar literal with appropriate suffix
   */
  private formatScalarLiteral(value: number, baseType: string): string {
    switch (baseType) {
      case 'float':
        return `${value}f`
      case 'double':
        return `${value}`
      case 'long':
        return `${value}L`
      case 'bool':
        return value ? '1' : '0'
      default:
        return `${value}`
    }
  }

  /**
   * Format a vector literal
   */
  private formatVectorLiteral(values: number[], baseType: string): string {
    const formattedValues = values.map(v => this.formatScalarLiteral(v, baseType))
    return `{${formattedValues.join(', ')}}`
  }

  /**
   * Format a matrix literal (2D array)
   */
  private formatMatrixLiteral(matrix: number[][], baseType: string): string {
    const rows = matrix.map(row => {
      const formattedRow = row.map(v => this.formatScalarLiteral(v, baseType))
      return `{${formattedRow.join(', ')}}`
    })
    return `{${rows.join(', ')}}`
  }

  private generateInputsStruct(): string {
    const name = this.typeName()
    const members: string[] = []

    for (const port of this.info.inputPorts) {
      members.push(this.generatePortMember(port, 'Input port'))
    }

    if (members.length === 0) {
      members.push(CCodeBuilder.generateStructMember('int', 'dummy', undefined, 'No input ports'))
    }

    return CCodeBuilder.generateStruct(`${name}_inputs`, members, 'Subsystem input signals')
  }

  private generateOutputsStruct(): string {
    const name = this.typeName()
    const members: string[] = []

    for (const port of this.info.outputPorts) {
      members.push(this.generatePortMember(port, 'Output port'))
    }

    if (members.length === 0) {
      members.push(CCodeBuilder.generateStructMember('int', 'dummy', undefined, 'No output ports'))
    }

    return CCodeBuilder.generateStruct(`${name}_outputs`, members, 'Subsystem output signals')
  }

  private generateSignalsStruct(): string {
    const name = this.typeName()
    const members: string[] = []

    // Add signals for each block that produces output
    for (const block of this.info.flattenedModel.blocks) {
      // Skip port blocks
      if (block.block.type === 'input_port' || block.block.type === 'output_port') {
        continue
      }

      // Skip display/logger blocks
      if (block.block.type === 'signal_display' || block.block.type === 'signal_logger') {
        continue
      }

      try {
        const generator = BlockModuleFactory.getBlockModule(block.block.type)
        const outputType = this.getBlockOutputType(block)
        // Use unique flattenedName so nested Demux/Add/etc. do not collide
        const member = generator.generateStructMember(this.asNamedBlock(block), outputType)
        if (member) {
          members.push(member)
        }
      } catch {
        // Block type not supported
        continue
      }
    }

    if (members.length === 0) {
      members.push(CCodeBuilder.generateStructMember('int', 'dummy', undefined, 'No internal signals'))
    }

    return CCodeBuilder.generateStruct(`${name}_signals`, members, 'Internal signal values')
  }

  private generateStatesStruct(): string {
    const name = this.typeName()
    const members: string[] = []

    // Add state variables for each stateful block
    for (const block of this.info.flattenedModel.blocks) {
      try {
        const generator = BlockModuleFactory.getBlockModule(block.block.type)
        const named = this.asNamedBlock(block)
        if (generator.requiresState(named)) {
          const outputType = this.getBlockOutputType(block)
          const stateMembers = generator.generateStateStructMembers(named, outputType)
          members.push(...stateMembers)
        }
      } catch {
        continue
      }
    }

    if (members.length === 0) {
      members.push(CCodeBuilder.generateStructMember('int', 'dummy', undefined, 'No state variables'))
    }

    return CCodeBuilder.generateStruct(`${name}_states`, members, 'State variables')
  }

  private generateDataStoresStruct(): string {
    const name = this.typeName()
    const members: string[] = []

    for (const store of this.dataStores) {
      members.push(dataStoreMemberDecl(store) + ` /* data store: ${store.name} */`)
    }

    if (members.length === 0) {
      members.push(CCodeBuilder.generateStructMember('int', 'dummy', undefined, 'No data stores'))
    }

    return CCodeBuilder.generateStruct(
      `${name}_data_stores`,
      members,
      'Subsystem-local data stores (synced with parent when shared)'
    )
  }

  private generateEnableStatesStruct(): string {
    const name = this.typeName()
    const members: string[] = []
    for (const info of this.enableInfos) {
      if (!info.hasEnableInput) continue
      const safe = CCodeBuilder.sanitizeIdentifier(info.subsystemName)
      members.push(
        CCodeBuilder.generateStructMember(
          'int',
          `${safe}_enabled`,
          undefined,
          `Enable state for ${info.subsystemName}`
        )
      )
      if (info.enableEdge === 'rising') {
        members.push(
          CCodeBuilder.generateStructMember(
            'int',
            `${safe}_trig_prev`,
            undefined,
            `Previous trigger for rising-edge ${info.subsystemName}`
          )
        )
      }
    }
    if (members.length === 0) {
      members.push(
        CCodeBuilder.generateStructMember('int', 'dummy', undefined, 'No nested enables')
      )
    }
    return CCodeBuilder.generateStruct(
      `${name}_enable_states`,
      members,
      'Nested Action/Enable scopes inside this segregated module'
    )
  }

  private generateSubsystemStruct(): string {
    const name = this.typeName()
    const members: string[] = []

    if (this.useInstanceParams() && (this.info.instanceParameters || []).length > 0) {
      members.push(`    ${name}_params_t params; /* Per-instance parameter values */`)
    }
    members.push(`    ${name}_inputs_t inputs;`)
    members.push(`    ${name}_outputs_t outputs;`)
    members.push(`    ${name}_signals_t signals;`)
    members.push(`    ${name}_states_t states;`)
    members.push(`    ${name}_data_stores_t data_stores;`)
    if (this.hasNestedEnables()) {
      members.push(`    ${name}_enable_states_t enable_states;`)
    }
    members.push(`    double time; /* Simulation time (synced from parent) */`)
    members.push(`    double dt; /* Time step (synced from parent) */`)
    members.push(
      `    unsigned long long sample_tick; /* Synced from parent (multi-rate hits) */`
    )
    members.push(`    int enabled; /* Enable state: 1=enabled, 0=disabled */`)
    if (this.info.forIterator) {
      members.push(
        `    int iteration_index; /* Set by parent each for-iterator pass */`
      )
    }

    return CCodeBuilder.generateStruct(name, members, `Main subsystem structure for ${this.info.subsystemName}`)
  }

  private generateFunctionPrototypes(): string {
    const name = this.typeName()
    let prototypes = CCodeBuilder.generateCommentBlock(['Function prototypes'])

    // Init — shared modules take optional params pointer
    const initParams = this.useInstanceParams()
      ? [`${name}_t* model`, `const ${name}_params_t* params`]
      : [`${name}_t* model`]
    prototypes += CCodeBuilder.generateFunctionPrototype(
      'void',
      `${name}_init`,
      initParams,
      this.useInstanceParams()
        ? 'Initialize subsystem; copy per-instance params when non-NULL'
        : 'Initialize subsystem to default state'
    ) + '\n'

    // Compute outputs
    prototypes += CCodeBuilder.generateFunctionPrototype(
      'void',
      `${name}_compute_outputs`,
      [`${name}_t* model`],
      'Compute outputs from inputs and states (algebraic evaluation)'
    ) + '\n'

    // Compute derivatives (if stateful)
    if (this.info.hasState) {
      prototypes += CCodeBuilder.generateFunctionPrototype(
        'void',
        `${name}_compute_derivatives`,
        [`const ${name}_t* model`, `const ${name}_states_t* current_states`, `${name}_states_t* derivatives`],
        'Compute state derivatives for integration'
      ) + '\n'
    }

    // Reset states (if has reset)
    if (this.info.hasResetInput) {
      prototypes += CCodeBuilder.generateFunctionPrototype(
        'void',
        `${name}_reset_states`,
        [`${name}_t* model`],
        'Reset integrator states to initial conditions'
      ) + '\n'
    }

    if (this.hasMemoryDelayBlocks()) {
      prototypes += CCodeBuilder.generateFunctionPrototype(
        'void',
        `${name}_update_memory_states`,
        [`${name}_t* model`],
        'UH60 P3: Memory major-step hold — latch after parent RK4'
      ) + '\n'
    }

    if (this.hasNestedEnables()) {
      prototypes += CCodeBuilder.generateFunctionPrototype(
        'void',
        `${name}_evaluate_enable_states`,
        [`${name}_t* model`],
        'Update nested Action/Enable scopes inside this module'
      ) + '\n'
    }

    return prototypes
  }

  // ============================================================
  // Source Generation Helpers
  // ============================================================

  private generateInitFunction(): string {
    const name = this.typeName()
    const withParams = this.useInstanceParams()

    let code = CCodeBuilder.generateCommentBlock([
      withParams
        ? 'Initialize subsystem; copy per-instance params when non-NULL'
        : 'Initialize subsystem to default state'
    ])
    if (withParams) {
      code += `void ${name}_init(${name}_t* model, const ${name}_params_t* params) {\n`
    } else {
      code += `void ${name}_init(${name}_t* model) {\n`
    }

    // Zero all structures
    if (withParams && (this.info.instanceParameters || []).length > 0) {
      code += '    memset(&model->params, 0, sizeof(model->params));\n'
      code += '    if (params) {\n'
      code += '        model->params = *params;\n'
      code += '    }\n'
    }
    code += '    memset(&model->inputs, 0, sizeof(model->inputs));\n'
    code += '    memset(&model->outputs, 0, sizeof(model->outputs));\n'
    code += '    memset(&model->signals, 0, sizeof(model->signals));\n'
    code += '    memset(&model->states, 0, sizeof(model->states));\n'
    code += '    memset(&model->data_stores, 0, sizeof(model->data_stores));\n'
    if (this.hasNestedEnables()) {
      code += '    memset(&model->enable_states, 0, sizeof(model->enable_states));\n'
    }
    code += '    model->time = 0.0;\n'
    code += '    model->dt = 0.0;\n'
    code += '    model->sample_tick = 0ULL;\n'
    code += '    model->enabled = 1;\n'
    code += '\n'

    // Constant sources (SourceBlockModule.generateInitialization is a no-op for constants)
    code += this.generateConstantSourceInit()

    // Block-specific initialization (unit_delay ICs, etc.)
    code += '    /* Block-specific initialization */\n'
    for (const block of this.info.flattenedModel.blocks) {
      const initCode = this.generateBlockInit(block)
      if (initCode) {
        code += initCode
      }
    }

    if (this.hasNestedEnables()) {
      code += `\n    ${this.typeName()}_evaluate_enable_states(model);\n`
    }

    code += '}\n'
    return code
  }

  /**
   * Mirror InitFunctionGenerator.generateConstantInit for module-local constants
   * (T_S*, chi_rate_limit, timer Constants, …).
   */
  private generateConstantSourceInit(): string {
    let code = ''
    let hasConstants = false
    for (const block of this.info.flattenedModel.blocks) {
      if (block.block.type !== 'source') continue
      const sourceType =
        (block.block.parameters?.sourceType as string) ||
        (block.block.parameters?.signalType as string) ||
        'constant'
      if (sourceType !== 'constant') continue
      // useParameter sources are assigned each step in compute_outputs
      if (block.block.parameters?.useParameter) continue

      const value = block.block.parameters?.value ?? 0.0
      const dataType = this.getBlockOutputType(block)
      const signalName = `model->signals.${this.signalName(block)}`

      if (!hasConstants) {
        code += '    /* Initialize constant sources */\n'
        hasConstants = true
      }

      if (dataType.includes('[')) {
        const vals = Array.isArray(value) ? value : [value]
        if (Array.isArray(vals[0])) {
          const mat = vals as number[][]
          for (let i = 0; i < mat.length; i++) {
            for (let j = 0; j < (mat[i]?.length || 0); j++) {
              code += `    ${signalName}[${i}][${j}] = ${mat[i]![j]};\n`
            }
          }
        } else {
          for (let i = 0; i < vals.length; i++) {
            code += `    ${signalName}[${i}] = ${vals[i]};\n`
          }
        }
        code += `    /* ${block.flattenedName || block.block.name} (${dataType}) */\n`
      } else {
        code += `    ${signalName} = ${value}; /* ${block.flattenedName || block.block.name} */\n`
      }
    }
    if (hasConstants) code += '\n'
    return code
  }

  private generateBlockInit(block: FlattenedBlock): string {
    try {
      const generator = BlockModuleFactory.getBlockModule(block.block.type)
      if (generator.generateInitialization) {
        // Block modules generate code using 'model->' which matches our parameter name
        const outputType = this.getBlockOutputType(block)
        return generator.generateInitialization(this.asNamedBlock(block), outputType)
      }
    } catch {
      // Block type not supported
    }
    return ''
  }

  private generateComputeOutputsFunction(): string {
    const name = this.typeName()
    const executionOrder = this.calculateExecutionOrder()

    // File-scope statics must sit outside the function (same as parent flatten).
    let code = needsIgmTerminalChiLatch(executionOrder)
      ? generateIgmTerminalChiLatchStatics()
      : ''

    code += CCodeBuilder.generateCommentBlock([
      'Compute outputs from inputs and states',
      'This is the algebraic evaluation - no state changes',
      'Input ports are accessed directly via model->inputs.PortName',
      'Nested Action/Enable scopes gate algebra via enable_states (prev-step)'
    ])
    code += `void ${name}_compute_outputs(${name}_t* model) {\n`
    code += '    if (!model->enabled) {\n'
    code += '        return; /* Module-level enable: freeze outs */\n'
    code += '    }\n\n'
    code += this.generateInstanceParamMacros()

    // Compute blocks in topological order
    // Note: Input port values are accessed directly via model->inputs (not copied to signals)
    code += '    /* Compute block outputs in dependency order */\n'

    for (const block of executionOrder) {
      // Skip port blocks
      if (block.block.type === 'input_port' || block.block.type === 'output_port') {
        continue
      }

      // Skip blocks that don't generate code. Assert blocks are not checked
      // inside segregated modules yet (CodeGenerator warns about them).
      if (!BlockModuleFactory.isSupported(block.block.type) || block.block.type === 'assert') {
        continue
      }

      const blockCode = this.generateBlockComputation(block)
      if (blockCode) {
        code += this.wrapWithExecutionGates(block, blockCode)
        // Same-step ActionPort enable refresh (If / epsilon_prime → nested enables)
        if (this.enableSourceBlockIds.has(block.originalId)) {
          code += this.generateSameStepEnableRefresh(block)
        }
      }
    }

    // Discrete unit_delay only; Memory (delayMode:memory) latches in
    // update_memory_states after parent RK4 (UH60 P3).
    code += this.generateDeferredStateUpdates(executionOrder, 'unit_delay')

    // Copy signals to outputs
    code += '\n    /* Copy signals to outputs */\n'
    for (const port of this.info.outputPorts) {
      const safeName = port.sanitizedName
      // Find the source of this output port
      const outputExpr = this.getOutputPortSourceExpression(port)
      if (outputExpr) {
        if (port.dataType.includes('[')) {
          code += `    memcpy(&model->outputs.${safeName}, &${outputExpr}, sizeof(model->outputs.${safeName}));\n`
        } else {
          code += `    model->outputs.${safeName} = ${outputExpr};\n`
        }
      }
    }

    // End-of-step enable update (matches parent step timing relative to module algebra)
    if (this.hasNestedEnables()) {
      code += `\n    ${name}_evaluate_enable_states(model);\n`
    }

    code += this.generateInstanceParamUndefs()
    code += '}\n'
    return code
  }

  /**
   * Gate algebra by nested enable_states and/or MDL SampleTime (sample_tick).
   * Integrators / unit_delay / enable-wire sources always run (same as parent).
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
    if (this.hasNestedEnables() && this.enableEvaluator) {
      const enableExpr = this.enableEvaluator.generateBlockEnableCheck(block.originalId)
      if (enableExpr !== '1') {
        conditions.push(enableExpr)
      }
    }
    const sampleExpr = this.generateSampleHitCheck(block)
    if (sampleExpr !== '1') {
      conditions.push(sampleExpr)
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

  private generateSampleHitCheck(block: FlattenedBlock): string {
    const period = block.sampleScope
    if (period == null || !(period > 0)) {
      return '1'
    }
    return `(model->sample_tick % (unsigned long long)llround((${period}) / model->dt) == 0ULL)`
  }

  private generateDeferredStateUpdates(
    executionOrder: FlattenedBlock[],
    mode: 'unit_delay' | 'memory' | 'all' = 'all'
  ): string {
    let code = ''
    let header = false
    const subsystemParams = this.info.parameters || []

    for (const block of executionOrder) {
      if (
        block.block.type === 'input_port' ||
        block.block.type === 'output_port' ||
        !BlockModuleFactory.isSupported(block.block.type)
      ) {
        continue
      }
      if (block.block.type === 'unit_delay') {
        const isMemory = block.block.parameters?.delayMode === 'memory'
        if (mode === 'unit_delay' && isMemory) continue
        if (mode === 'memory' && !isMemory) continue
      } else if (mode === 'memory') {
        continue
      }
      try {
        const generator = BlockModuleFactory.getBlockModule(block.block.type)
        if (!generator.generateDeferredStateUpdate) continue

        const inputs = this.getBlockInputExpressions(block)
        const inputTypes = this.getBlockInputTypes(block)
        const named = this.asNamedBlock(block)
        const context: CodeGenContext = {
          parameterNames: subsystemParams.map(p => p.name),
          enableExpr: this.enableEvaluator
            ? this.enableEvaluator.generateBlockEnableCheck(block.originalId)
            : '1'
        }
        const update = generator.generateDeferredStateUpdate(
          named,
          inputs,
          inputTypes,
          context
        )
        if (!update || !update.trim()) continue

        if (!header) {
          const label =
            mode === 'memory'
              ? 'Memory major-step hold updates (post-integration)'
              : mode === 'unit_delay'
                ? 'Deferred discrete state updates (unit_delay)'
                : 'Deferred discrete state updates (unit_delay / Memory)'
          code += `\n    /* ${label} */\n`
          header = true
        }
        code += `\n    /* ${block.flattenedName || block.block.name} state update */\n`
        code += update
      } catch {
        continue
      }
    }
    return code
  }

  /** UH60 P3: Memory latch after parent RK4 (called from parent update_memory_states). */
  private generateUpdateMemoryStatesFunction(): string {
    const name = this.typeName()
    const executionOrder = this.calculateExecutionOrder()
    const body = this.generateDeferredStateUpdates(executionOrder, 'memory')
    let code = CCodeBuilder.generateCommentBlock([
      'UH60 P3: Memory major-step hold — latch after parent RK4/Euler'
    ])
    code += `void ${name}_update_memory_states(${name}_t* model) {\n`
    if (!body.trim()) {
      code += '    (void)model;\n'
    } else {
      code += body
    }
    code += '}\n'
    return code
  }

  private hasMemoryDelayBlocks(): boolean {
    return this.info.flattenedModel.blocks.some(
      b =>
        b.block.type === 'unit_delay' &&
        b.block.parameters?.delayMode === 'memory'
    )
  }

  private generateBlockComputation(block: FlattenedBlock): string {
    try {
      const generator = BlockModuleFactory.getBlockModule(block.block.type)
      const named = this.asNamedBlock(block)
      const inputs = this.getBlockInputExpressions(block)
      const inputTypes = this.getBlockInputTypes(block)

      let code = `\n    /* ${block.flattenedName || block.block.name} */\n`

      // Create context with subsystem parameter names for expression validation
      // Use subsystem-level parameters (this.info.parameters) which scope to this subsystem
      const subsystemParams = this.info.parameters || []
      const context: CodeGenContext = {
        parameterNames: subsystemParams.map(p => p.name)
      }

      // Handle transfer functions specially (need state access)
      if (block.block.type === 'transfer_function') {
        const safeName = this.signalName(block)
        const modifiedInputs = [...inputs, `model->states.${safeName}_states`]
        code += generator.generateComputation(named, modifiedInputs, inputTypes, context)
      } else if (block.block.type === 'integrator') {
        const integratorInputs = this.getIntegratorInputExpressions(block)
        const integratorContext: CodeGenContext = {
          ...context,
          enableExpr: this.enableEvaluator
            ? this.enableEvaluator.generateBlockEnableCheck(block.originalId)
            : '1'
        }
        code += generator.generateComputation(
          named,
          integratorInputs,
          inputTypes,
          integratorContext
        )
      } else {
        code += generator.generateComputation(named, inputs, inputTypes, context)
      }

      // Terminal Chi latch (Add12/Add14) — same as parent AlgebraicEvaluator
      const chiLatch = wrapIgmTerminalChiLatch(block, code)
      if (chiLatch) {
        // Preserve leading comment; replace assignment body with latched form.
        const commentMatch = code.match(/^(\s*\/\*[\s\S]*?\*\/\s*)/)
        const prefix = commentMatch ? commentMatch[1]! : `\n    /* ${block.flattenedName || block.block.name} */\n`
        code = prefix + chiLatch
      }

      return code
    } catch (error) {
      return `    /* Error generating code for ${block.block.type}: ${error} */\n`
    }
  }

  private generateComputeDerivativesFunction(): string {
    const name = this.typeName()

    let code = CCodeBuilder.generateCommentBlock([
      'Compute state derivatives for integration',
      'Called by parent during RK4 stages'
    ])
    // current_states is the RK4 stage state (the parent's stage struct for this
    // instance); model->states holds the major-step state. Block derivative
    // terms must read the stage state or RK4 degrades to Euler for them.
    code += `void ${name}_compute_derivatives(const ${name}_t* model, const ${name}_states_t* current_states, ${name}_states_t* derivatives) {\n`
    code += '    memset(derivatives, 0, sizeof(*derivatives));\n\n'

    // Generate derivative computation for each stateful block
    for (const block of this.info.flattenedModel.blocks) {
      try {
        const generator = BlockModuleFactory.getBlockModule(block.block.type) as any
        const named = this.asNamedBlock(block)
        if (generator.requiresState(named) && generator.generateStateDerivative) {
          const inputExpr = this.getBlockDerivativeInput(block)
          const outputType = this.getBlockOutputType(block)

          code += `    /* ${block.flattenedName || block.block.name} */\n`
          const derivCode = generator.generateStateDerivative(
            named,
            inputExpr,
            'current_states',
            outputType
          )
          // Replace 'state_derivatives' with 'derivatives' in the generated code
          code += derivCode.replace(/state_derivatives/g, 'derivatives')
        }
      } catch {
        continue
      }
    }

    code += '}\n'
    return code
  }

  private generateResetStatesFunction(): string {
    const name = this.typeName()

    let code = CCodeBuilder.generateCommentBlock([
      'Reset integrator states to initial conditions',
      'Called when reset signal is triggered'
    ])
    code += `void ${name}_reset_states(${name}_t* model) {\n`

    // Reset integrators and unit delays / Memory (For Iterator ResetStates=reset)
    for (const block of this.info.flattenedModel.blocks) {
      if (block.block.type === 'integrator') {
        const safeName = this.signalName(block)
        const initialCondition = block.block.parameters?.initialCondition ?? 0

        code += `    /* Reset ${block.flattenedName || block.block.name} */\n`
        code += `    model->states.${safeName}_states[0] = ${initialCondition};\n`
      } else if (block.block.type === 'unit_delay') {
        const safeName = this.signalName(block)
        const x0 =
          block.block.parameters?.initialValue ??
          block.block.parameters?.initialCondition ??
          0
        const mode = block.block.parameters?.delayMode === 'memory' ? 'Memory' : 'unit_delay'
        code += `    /* Reset ${block.flattenedName || block.block.name} (${mode}) */\n`
        if (typeof x0 === 'number') {
          code += `    model->states.${safeName}_state = ${x0};\n`
        } else if (Array.isArray(x0) && !Array.isArray(x0[0])) {
          for (let i = 0; i < x0.length; i++) {
            code += `    model->states.${safeName}_state[${i}] = ${Number(x0[i]) || 0};\n`
          }
        } else {
          code += `    model->states.${safeName}_state = 0;\n`
        }
      }
    }

    code += '}\n'
    return code
  }

  // ============================================================
  // Utility Methods
  // ============================================================

  private generatePortMember(port: SubsystemPort, comment: string): string {
    if (isValidType(port.dataType)) {
      const parsedType = parseType(port.dataType)
      const baseType = parsedType.baseType

      if (parsedType.isMatrix && parsedType.rows && parsedType.cols) {
        return CCodeBuilder.generateStructMember(baseType, port.sanitizedName, [parsedType.rows, parsedType.cols], `${comment}: ${port.name}`)
      } else if (parsedType.isArray && parsedType.arraySize) {
        return CCodeBuilder.generateStructMember(baseType, port.sanitizedName, [parsedType.arraySize], `${comment}: ${port.name}`)
      } else {
        return CCodeBuilder.generateStructMember(baseType, port.sanitizedName, undefined, `${comment}: ${port.name}`)
      }
    }
    return CCodeBuilder.generateStructMember('double', port.sanitizedName, undefined, `${comment}: ${port.name}`)
  }

  private getBlockOutputType(block: FlattenedBlock): string {
    const mappedType = this.typeMap.get(block.originalId)
    if (mappedType) return mappedType

    const dataType = block.block.parameters?.dataType
    if (dataType) return dataType

    return 'double'
  }

  /**
   * Integrator data + control inputs for codegen:
   *   [0] derivative (port 0), [1] x(0) if showInitPort, [last] reset if showResetInput
   */
  private getIntegratorInputExpressions(block: FlattenedBlock): string[] {
    const showInitPort = !!block.block.parameters?.showInitPort
    const showResetInput = !!block.block.parameters?.showResetInput
    const inputs: string[] = []

    inputs.push(this.getInputExpressionForPort(block, 0) || '0.0')
    if (showInitPort) {
      inputs.push(this.getInputExpressionForPort(block, 1) || '0.0')
    }
    if (showResetInput) {
      inputs.push(this.getInputExpressionForPort(block, -2) || '0')
    }
    return inputs
  }

  /** Signal expression for a source block output port (unique flattened name + port suffix). */
  private signalExpression(sourceBlock: FlattenedBlock, sourcePortIndex: number): string {
    if (sourceBlock.block.type === 'input_port') {
      const portName = sourceBlock.block.parameters?.portName || sourceBlock.block.name
      const inputPort = this.info.inputPorts.find(p => p.name === portName)
      if (inputPort) {
        return `model->inputs.${inputPort.sanitizedName}`
      }
      return `model->inputs.${CCodeBuilder.sanitizeIdentifier(portName)}`
    }

    const memberName = getSignalMemberName(
      this.signalName(sourceBlock),
      sourceBlock.block.type,
      sourcePortIndex,
      this.asNamedBlock(sourceBlock)
    )
    return `model->signals.${memberName}`
  }

  private getInputExpressionForPort(block: FlattenedBlock, portIndex: number): string | null {
    const connection = this.info.flattenedModel.connections.find(c =>
      c.targetBlockId === block.originalId && c.targetPortIndex === portIndex
    )
    if (!connection) return null

    const sourceBlock = this.info.flattenedModel.blocks.find(b =>
      b.originalId === connection.sourceBlockId
    )
    if (!sourceBlock) return null

    return this.signalExpression(sourceBlock, connection.sourcePortIndex)
  }

  private getBlockInputExpressions(block: FlattenedBlock): string[] {
    // Port-indexed like AlgebraicEvaluator so gaps stay aligned
    const connections = this.info.flattenedModel.connections
      .filter(c => c.targetBlockId === block.originalId && c.targetPortIndex >= 0)
      .sort((a, b) => a.targetPortIndex - b.targetPortIndex)

    let maxPort = -1
    for (const c of connections) {
      if (c.targetPortIndex > maxPort) maxPort = c.targetPortIndex
    }
    const inputs: string[] = Array.from({ length: maxPort + 1 }, () => '0.0')

    // SwitchCase / If enable sources must see live DSM (not stale Data_Store_Read
    // signals evaluated earlier in the same pass before mode / T_1 DSWs).
    const preferLiveDsm = this.enableSourceBlockIds.has(block.originalId)

    for (const connection of connections) {
      const sourceBlock = this.info.flattenedModel.blocks.find(b =>
        b.originalId === connection.sourceBlockId
      )
      if (!sourceBlock) continue

      let expr = this.signalExpression(sourceBlock, connection.sourcePortIndex)
      if (preferLiveDsm && sourceBlock.block.type === 'data_store_read') {
        const store =
          sourceBlock.block.parameters?.storeName ||
          sourceBlock.block.parameters?.dataStoreName ||
          'store'
        const safeStore = CCodeBuilder.sanitizeIdentifier(String(store))
        expr = `model->data_stores.${safeStore}`
      }
      if (inputs[connection.targetPortIndex] === '0.0') {
        inputs[connection.targetPortIndex] = expr
      }
    }

    return inputs
  }

  private isSwitchCaseCaseEvaluate(block: FlattenedBlock): boolean {
    const n = block.flattenedName || block.block.name || ''
    return (
      /Switch_Case_case_-?\d+$/i.test(n) ||
      /_case_-?\d+$/i.test(block.block.name || '')
    )
  }

  /**
   * Same-step ActionPort enable when If / epsilon_prime updates — so nested
   * DSM writes (Set_nIGMMode, Chi steering, …) run in this major hit (RTW).
   * SwitchCase case_* intentionally excluded (live DSM + end-of-step enables).
   */
  private shouldSameStepRefreshTarget(info: SubsystemEnableInfo): boolean {
    const n = info.subsystemName || ''
    if (/IGM_Chi_Steering/i.test(n) || /Set_Terminal_Steering/i.test(n)) {
      return true
    }
    if (/Set_nIGMMode_to_3/i.test(n)) return true

    for (const id of info.controlledBlockIds || []) {
      const b = this.info.flattenedModel.blocks.find(x => x.originalId === id)
      if (!b || b.block.type !== 'data_store_write') continue
      const store = String(
        b.block.parameters?.storeName ||
          b.block.parameters?.logicalStoreName ||
          b.block.parameters?.dataStoreName ||
          ''
      )
      if (/nIGMMode$/i.test(store) || store === 'nIGMMode') {
        const path = b.flattenedName || ''
        // Match AlgebraicEvaluator: First Phase set-to-1 is end-of-step only
        // (same-step here advances mode by one 1.6s major frame vs flatten).
        if (/First_Phase|Set_nIGMMode_to_1|_to_1_/i.test(path)) continue
        return true
      }
      if (/Chi_[YZ]_deg$/i.test(store) || /nTerminalSteeringMode$/i.test(store)) {
        return true
      }
    }
    // Do NOT special-case Set_nIGMMode_to_1 by name — that diverges from
    // AlgebraicEvaluator and makes segregated IGM mode transitions 1.6s early.
    // Set_HSL_Mode that writes nIGMMode is already covered by the store heuristic.
    return false
  }

  private generateSameStepEnableRefresh(sourceBlock: FlattenedBlock): string {
    if (this.isSwitchCaseCaseEvaluate(sourceBlock)) return ''

    const dependents = this.enableInfos.filter(
      info =>
        info.hasEnableInput &&
        info.enableWire?.sourceBlockId === sourceBlock.originalId &&
        info.enableEdge !== 'rising' &&
        this.shouldSameStepRefreshTarget(info)
    )
    if (dependents.length === 0) return ''

    const sourceExpr = this.signalExpression(sourceBlock, 0)
    const boolExpr = CCodeBuilder.generateBooleanExpression(sourceExpr)

    let code = `    /* Same-step enable refresh from ${sourceBlock.flattenedName || sourceBlock.block.name} */\n`
    for (const info of dependents) {
      const safeSys = CCodeBuilder.sanitizeIdentifier(info.subsystemName)
      if (info.parentSubsystemId) {
        const parent = this.enableInfos.find(
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

  private getBlockInputTypes(block: FlattenedBlock): string[] {
    const types: string[] = []

    const connections = this.info.flattenedModel.connections
      .filter(c => c.targetBlockId === block.originalId && c.targetPortIndex >= 0)
      .sort((a, b) => a.targetPortIndex - b.targetPortIndex)

    for (const connection of connections) {
      const sourceType = this.typeMap.get(connection.sourceBlockId) || 'double'
      types.push(sourceType)
    }

    return types
  }

  private getBlockDerivativeInput(block: FlattenedBlock): string {
    // Find the connection to this block's first input
    const connection = this.info.flattenedModel.connections.find(c =>
      c.targetBlockId === block.originalId && c.targetPortIndex === 0
    )

    if (connection) {
      const sourceBlock = this.info.flattenedModel.blocks.find(b =>
        b.originalId === connection.sourceBlockId
      )
      if (sourceBlock) {
        return this.signalExpression(sourceBlock, connection.sourcePortIndex)
      }
    }

    return '0.0'
  }

  private getOutputPortSourceExpression(port: SubsystemPort): string | null {
    // Find the output_port block
    const portBlock = this.info.flattenedModel.blocks.find(b =>
      b.block.type === 'output_port' && b.block.parameters?.portName === port.name
    )

    if (!portBlock) return null

    // Find the connection to this output port
    const connection = this.info.flattenedModel.connections.find(c =>
      c.targetBlockId === portBlock.originalId && c.targetPortIndex === 0
    )

    if (connection) {
      const sourceBlock = this.info.flattenedModel.blocks.find(b =>
        b.originalId === connection.sourceBlockId
      )
      if (sourceBlock) {
        return this.signalExpression(sourceBlock, connection.sourcePortIndex)
      }
    }

    return null
  }

  private calculateExecutionOrder(): FlattenedBlock[] {
    const sorted: FlattenedBlock[] = []
    const visited = new Set<string>()
    const visiting = new Set<string>()

    // Build dependency map
    const dependencies = new Map<string, string[]>()
    for (const block of this.info.flattenedModel.blocks) {
      dependencies.set(block.originalId, [])
    }

    for (const connection of this.info.flattenedModel.connections) {
      const targetBlock = this.info.flattenedModel.blocks.find(b =>
        b.originalId === connection.targetBlockId
      )
      if (targetBlock && this.hasDirectFeedthrough(targetBlock)) {
        const deps = dependencies.get(connection.targetBlockId)
        if (deps && !deps.includes(connection.sourceBlockId)) {
          deps.push(connection.sourceBlockId)
        }
      }
    }

    // Enable-wire sources (If / epsilon_prime) before gated ActionPort bodies so
    // same-step enable refresh can arm DSM writes in this major hit (RTW).
    // SwitchCase case_* stay late so live-DSM selectors see mode writes.
    for (const info of this.enableInfos) {
      const srcId = info.enableWire?.sourceBlockId
      if (!srcId || !info.hasEnableInput) continue
      const srcBlock = this.info.flattenedModel.blocks.find(b => b.originalId === srcId)
      if (srcBlock && this.isSwitchCaseCaseEvaluate(srcBlock)) continue
      for (const controlledId of info.controlledBlockIds || []) {
        const deps = dependencies.get(controlledId)
        if (deps && !deps.includes(srcId) && dependencies.has(srcId)) {
          deps.push(srcId)
        }
      }
    }

    // Topological sort
    const visit = (blockId: string) => {
      if (visited.has(blockId)) return
      if (visiting.has(blockId)) {
        this.warnings.push(`Algebraic loop detected in subsystem ${this.info.subsystemName}`)
        return
      }

      visiting.add(blockId)
      const deps = dependencies.get(blockId) || []
      for (const dep of deps) {
        visit(dep)
      }
      visiting.delete(blockId)
      visited.add(blockId)

      const block = this.info.flattenedModel.blocks.find(b => b.originalId === blockId)
      if (block) {
        sorted.push(block)
      }
    }

    for (const block of this.info.flattenedModel.blocks) {
      visit(block.originalId)
    }

    return sorted
  }

  private hasDirectFeedthrough(block: FlattenedBlock): boolean {
    if (BlockModuleFactory.isSupported(block.block.type)) {
      try {
        const module1 = BlockModuleFactory.getBlockModule(block.block.type)
        if (module1.isDirectFeedthrough) {
          return module1.isDirectFeedthrough(block.block) ?? true
        }
      } catch {
        // Default to true
      }
    }
    return true
  }
}
