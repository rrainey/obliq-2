/**
 * Variable transport delay: ring buffer of samples at model->dt.
 *
 * Ports: [0]=u (signal), [1]=delay_sec
 * Params: maximumDelay (s), maximumPoints (buffer length), initialInput
 *
 * y(t) = u(t - d), d = clamp(delay_sec, 0, maximumDelay), with linear
 * interpolation between samples. Age 0 is the current input u, age j >= 1 is
 * the sample of j steps before (buf, written once for each step after the
 * algebra, like unit_delay). The largest age is maximumPoints, thus the
 * largest delay is maximumPoints * dt. Before the history exists the buffer
 * gives initialInput. A NaN delay gives d = 0.
 *
 * The buffer takes at most one sample for each value of model->time. Thus a
 * second algebra pass at the same time (seed_from_inputs, the passes of a
 * For Iterator body) does not add a sample.
 *
 * u and delay_sec must be scalars. A vector or matrix input gives a C
 * #error, and the type validation shows an error.
 */

import { BlockData } from '@/components/BlockNode'
import { IBlockModule, BlockModuleUtils, CodeGenContext } from './BlockModule'

/** Error text when u or delay_sec is not a scalar, else null. */
export function variableTransportDelayInputError(
  blockName: string,
  types: Array<string | undefined>
): string | null {
  const names = ['u', 'delay_sec']
  for (let i = 0; i < 2; i++) {
    const t = types[i]
    if (t && t.includes('[')) {
      return `Variable Transport Delay "${blockName}": input ${names[i]} must be a scalar, not ${t}`
    }
  }
  return null
}

export class VariableTransportDelayBlockModule implements IBlockModule {
  private maxPoints(block: BlockData): number {
    const n = Math.floor(Number(block.parameters?.maximumPoints ?? 1024))
    return Number.isFinite(n) && n >= 2 ? n : 1024
  }

  private maxDelay(block: BlockData): number {
    const d = Number(block.parameters?.maximumDelay ?? 1)
    return Number.isFinite(d) && d > 0 ? d : 1
  }

  private initialInput(block: BlockData): number {
    const v = Number(block.parameters?.initialInput ?? 0)
    return Number.isFinite(v) ? v : 0
  }

  generateComputation(
    block: BlockData,
    inputs: string[],
    inputTypes?: string[],
    _context?: CodeGenContext
  ): string {
    const outputName = `model->signals.${BlockModuleUtils.sanitizeIdentifier(block.name)}`
    const name = BlockModuleUtils.sanitizeIdentifier(block.name)
    const N = this.maxPoints(block)
    const maxD = this.maxDelay(block)
    let code = `    // Variable transport delay: ${block.name}\n`
    const shapeError = variableTransportDelayInputError(block.name, inputTypes || [])
    if (shapeError) {
      return code + `#error "${shapeError.replace(/"/g, "'")}"\n`
    }
    if (inputs.length < 2) {
      code += `    ${outputName} = ${this.initialInput(block)};\n`
      return code
    }
    const u = inputs[0]
    const delayExpr = inputs[1]
    code += `    {\n`
    code += `        double __d = ${delayExpr};\n`
    code += `        if (!(__d > 0.0)) __d = 0.0; /* also NaN */\n`
    code += `        if (__d > ${maxD}) __d = ${maxD};\n`
    code += `        double __dt = model->dt;\n`
    code += `        if (__dt < 1e-15) __dt = 1e-15;\n`
    code += `        double __samp = __d / __dt;\n`
    code += `        if (__samp > (double)${N}) __samp = (double)${N};\n`
    code += `        int __i0 = (int)__samp;\n`
    code += `        int __i1 = __i0 + 1;\n`
    code += `        if (__i1 > ${N}) __i1 = ${N};\n`
    code += `        double __f = __samp - (double)__i0;\n`
    code += `        int __head = model->states.${name}_head;\n`
    /* newest stored sample (age 1) is at (head-1+N)%N; age 0 is the current input */
    code += `        double __y0 = (__i0 == 0) ? (double)(${u}) : model->states.${name}_buf[(__head - __i0 + ${N}) % ${N}];\n`
    code += `        double __y1 = model->states.${name}_buf[(__head - __i1 + ${N}) % ${N}];\n`
    code += `        ${outputName} = __y0 + __f * (__y1 - __y0);\n`
    code += `    }\n`
    return code
  }

  generateDeferredStateUpdate(
    block: BlockData,
    inputs: string[],
    inputTypes?: string[],
    context?: CodeGenContext
  ): string {
    if (inputs.length === 0) return ''
    if (variableTransportDelayInputError(block.name, inputTypes || [])) return ''
    const name = BlockModuleUtils.sanitizeIdentifier(block.name)
    const N = this.maxPoints(block)
    const u = inputs[0]
    const enableExpr =
      context?.enableExpr && context.enableExpr !== '1'
        ? context.enableExpr
        : null
    let code = `    // Variable transport delay push: ${block.name}\n`
    const indent = enableExpr ? '        ' : '    '
    if (enableExpr) code += `    if (${enableExpr}) {\n`
    code += `${indent}if (!model->states.${name}_filled || model->time > model->states.${name}_tlast) {\n`
    code += `${indent}    model->states.${name}_buf[model->states.${name}_head] = ${u};\n`
    code += `${indent}    model->states.${name}_head = (model->states.${name}_head + 1) % ${N};\n`
    code += `${indent}    model->states.${name}_tlast = model->time;\n`
    code += `${indent}    model->states.${name}_filled = 1;\n`
    code += `${indent}}\n`
    if (enableExpr) code += `    }\n`
    return code
  }

  getOutputType(): string {
    return 'double'
  }

  generateStructMember(block: BlockData, outputType: string): string | null {
    return BlockModuleUtils.generateStructMember(block.name, outputType)
  }

  requiresState(): boolean {
    return true
  }

  generateStateStructMembers(block: BlockData): string[] {
    const name = BlockModuleUtils.sanitizeIdentifier(block.name)
    const N = this.maxPoints(block)
    return [
      `    double ${name}_buf[${N}];`,
      `    int ${name}_head;`,
      `    double ${name}_tlast; /* time of the last sample in buf */`,
      `    int ${name}_filled; /* 0 until the first sample */`
    ]
  }

  generateInitialization(block: BlockData): string {
    const name = BlockModuleUtils.sanitizeIdentifier(block.name)
    const N = this.maxPoints(block)
    const ic = this.initialInput(block)
    let code = `    // Variable transport delay IC: ${block.name}\n`
    code += `    for (int __i = 0; __i < ${N}; ++__i) model->states.${name}_buf[__i] = ${ic};\n`
    code += `    model->states.${name}_head = 0;\n`
    code += `    model->states.${name}_tlast = 0.0;\n`
    code += `    model->states.${name}_filled = 0;\n`
    return code
  }

  getInputPortCount(): number {
    return 2
  }

  getOutputPortCount(): number {
    return 1
  }

  getInputPortLabels(): string[] {
    return ['u', 'delay_sec']
  }

  isDirectFeedthrough(): boolean {
    // Direct feedthrough on both ports: a delay below one step interpolates
    // with the current input u, and delay_sec is read in the same step.
    return true
  }
}
