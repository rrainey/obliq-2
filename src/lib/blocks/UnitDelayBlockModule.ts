// lib/blocks/UnitDelayBlockModule.ts
//
// Unit delay (z⁻¹ / Memory): output is the previous sample of the input.
//
// Two-phase algorithm (Simulink-compatible):
//   Phase 1 generateComputation:       y = state
//   Phase 2 generateDeferredStateUpdate: if sample due (and enabled): state = u
//
// Updating state in phase 1 (before producers like Sum run) makes discrete
// feedback z⁻² and destabilizes IIRs (Saturn reciprocal-acceleration filter).
//
// sampleInterval == 0  → update every model step
// sampleInterval > 0   → update on sample_tick hit (same gate as discrete algebra)
//
// Continuous integration does not touch this state (getBlockStateOrder returns 0
// for non-integrator/TF blocks).

import { BlockData } from '@/components/BlockNode'
import { IBlockModule, BlockModuleUtils, CodeGenContext } from './BlockModule'

export class UnitDelayBlockModule implements IBlockModule {
  private sampleIntervalOf(block: BlockData): number {
    return Number(
      block.parameters?.sampleInterval ?? block.parameters?.sampleTimeSec ?? 0
    )
  }

  generateComputation(
    block: BlockData,
    inputs: string[],
    inputTypes?: string[],
    _context?: CodeGenContext
  ): string {
    const outputName = `model->signals.${BlockModuleUtils.sanitizeIdentifier(block.name)}`
    const name = BlockModuleUtils.sanitizeIdentifier(block.name)

    let code = `    // Unit Delay block: ${block.name} (output phase)\n`

    if (inputs.length === 0) {
      code += `    ${outputName} = 0.0; // No input\n`
      return code
    }

    const outputType = this.getOutputType(block, inputTypes || [])
    const typeInfo = BlockModuleUtils.parseType(outputType)

    // Output previous state only — state update is deferred
    if (typeInfo.isMatrix && typeInfo.rows && typeInfo.cols) {
      code += `    for (int i = 0; i < ${typeInfo.rows}; i++) {\n`
      code += `        for (int j = 0; j < ${typeInfo.cols}; j++) {\n`
      code += `            ${outputName}[i][j] = model->states.${name}_state[i][j];\n`
      code += `        }\n`
      code += `    }\n`
    } else if (typeInfo.isArray && typeInfo.arraySize) {
      code += `    for (int i = 0; i < ${typeInfo.arraySize}; i++) {\n`
      code += `        ${outputName}[i] = model->states.${name}_state[i];\n`
      code += `    }\n`
    } else {
      code += `    ${outputName} = model->states.${name}_state;\n`
    }

    return code
  }

  generateDeferredStateUpdate(
    block: BlockData,
    inputs: string[],
    inputTypes?: string[],
    context?: CodeGenContext
  ): string {
    if (inputs.length === 0) {
      return ''
    }

    const name = BlockModuleUtils.sanitizeIdentifier(block.name)
    const sampleInterval = this.sampleIntervalOf(block)
    const outputType = this.getOutputType(block, inputTypes || [])
    const typeInfo = BlockModuleUtils.parseType(outputType)
    const inputExpr = inputs[0]
    const enableExpr =
      context?.enableExpr && context.enableExpr !== '1'
        ? context.enableExpr
        : null

    let code = `    // Unit Delay state update: ${block.name}\n`

    const conditions: string[] = []
    if (enableExpr) {
      conditions.push(enableExpr)
    }
    if (sampleInterval > 0) {
      // Must match AlgebraicEvaluator sample_tick gates on sibling discrete
      // algebra. Time-based next_sample_time desyncs: enable between hits can
      // overwrite Memory with stale u (soe=0) and scramble FIR taps
      // (Saturn reciprocal-acceleration → negative soe → G2≪0 → T3 NaN).
      conditions.push(
        `(model->sample_tick % (unsigned long long)llround((${sampleInterval}) / model->dt) == 0ULL)`
      )
    }

    const indent = conditions.length > 0 ? '        ' : '    '
    if (conditions.length > 0) {
      code += `    if (${conditions.join(' && ')}) {\n`
    }
    code += this.generateStateUpdate(name, inputExpr, typeInfo, indent)
    if (conditions.length > 0) {
      code += `    }\n`
    }

    return code
  }

  private generateStateUpdate(
    name: string,
    inputExpr: string,
    typeInfo: ReturnType<typeof BlockModuleUtils.parseType>,
    indent: string
  ): string {
    let code = ''
    if (typeInfo.isMatrix && typeInfo.rows && typeInfo.cols) {
      code += `${indent}for (int i = 0; i < ${typeInfo.rows}; i++) {\n`
      code += `${indent}    for (int j = 0; j < ${typeInfo.cols}; j++) {\n`
      code += `${indent}        model->states.${name}_state[i][j] = ${inputExpr}[i][j];\n`
      code += `${indent}    }\n`
      code += `${indent}}\n`
    } else if (typeInfo.isArray && typeInfo.arraySize) {
      code += `${indent}for (int i = 0; i < ${typeInfo.arraySize}; i++) {\n`
      code += `${indent}    model->states.${name}_state[i] = ${inputExpr}[i];\n`
      code += `${indent}}\n`
    } else {
      code += `${indent}model->states.${name}_state = ${inputExpr};\n`
    }
    return code
  }

  getOutputType(block: BlockData, inputTypes: string[]): string {
    if (inputTypes.length === 0) {
      return 'double'
    }
    return inputTypes[0]
  }

  generateStructMember(block: BlockData, outputType: string): string | null {
    return BlockModuleUtils.generateStructMember(block.name, outputType)
  }

  requiresState(block: BlockData): boolean {
    return true
  }

  generateStateStructMembers(block: BlockData, outputType: string): string[] {
    const name = BlockModuleUtils.sanitizeIdentifier(block.name)
    const typeInfo = BlockModuleUtils.parseType(outputType)
    const sampleInterval = this.sampleIntervalOf(block)
    const members: string[] = []

    if (typeInfo.isMatrix && typeInfo.rows && typeInfo.cols) {
      members.push(`    double ${name}_state[${typeInfo.rows}][${typeInfo.cols}];`)
    } else if (typeInfo.isArray && typeInfo.arraySize) {
      members.push(`    double ${name}_state[${typeInfo.arraySize}];`)
    } else {
      members.push(`    double ${name}_state;`)
    }

    return members
  }

  generateInitialization(block: BlockData, outputType?: string): string {
    const name = BlockModuleUtils.sanitizeIdentifier(block.name)
    // mdl2obliq historically used initialCondition; Obliq UI uses initialValue
    const initialValue =
      block.parameters?.initialValue ?? block.parameters?.initialCondition ?? 0
    const sampleInterval = this.sampleIntervalOf(block)
    const typeInfo = BlockModuleUtils.parseType(
      outputType ||
        (Array.isArray(initialValue)
          ? `double[${initialValue.length}]`
          : 'double')
    )
    const scalarInitial = typeof initialValue === 'number' ? initialValue : 0

    let code = `    // Initialize unit delay: ${block.name}\n`

    if (typeInfo.isMatrix && typeInfo.rows && typeInfo.cols) {
      for (let i = 0; i < typeInfo.rows; i++) {
        for (let j = 0; j < typeInfo.cols; j++) {
          let val = scalarInitial
          if (Array.isArray(initialValue) && Array.isArray(initialValue[i])) {
            val = (initialValue[i] as number[])[j] ?? scalarInitial
          } else if (
            Array.isArray(initialValue) &&
            !Array.isArray(initialValue[0])
          ) {
            // Flat vector written into column/row matrix state
            val = (initialValue as number[])[i * typeInfo.cols! + j] ?? scalarInitial
          }
          code += `    model->states.${name}_state[${i}][${j}] = ${val};\n`
        }
      }
    } else if (typeInfo.isArray && typeInfo.arraySize) {
      for (let i = 0; i < typeInfo.arraySize; i++) {
        let val = scalarInitial
        if (Array.isArray(initialValue) && !Array.isArray(initialValue[0])) {
          val = (initialValue as number[])[i] ?? scalarInitial
        }
        code += `    model->states.${name}_state[${i}] = ${val};\n`
      }
    } else {
      code += `    model->states.${name}_state = ${scalarInitial};\n`
    }

    return code
  }

  getInputPortCount(block: BlockData): number {
    return 1
  }

  getOutputPortCount(block: BlockData): number {
    return 1
  }

  getInputPortLabels(block: BlockData): string[] | undefined {
    return ['in']
  }

  getOutputPortLabels(block: BlockData): string[] | undefined {
    return ['out']
  }

  /**
   * No direct feedthrough: output is previous state only.
   * Unit delay is the classic algebraic-loop breaker.
   */
  isDirectFeedthrough(block: BlockData): boolean {
    return false
  }
}
