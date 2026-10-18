/**
 * Variable transport delay — ring buffer of samples at model->dt.
 *
 * Ports: [0]=u (signal), [1]=delay_sec
 * Params: maximumDelay (s), maximumPoints (buffer length), initialInput
 *
 * Output uses linear interpolation between samples at t - clamp(delay,0,maxDelay).
 * Buffer write is deferred after algebra (like unit_delay).
 */

import { BlockData } from '@/components/BlockNode'
import { IBlockModule, BlockModuleUtils, CodeGenContext } from './BlockModule'

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
    _inputTypes?: string[],
    _context?: CodeGenContext
  ): string {
    const outputName = `model->signals.${BlockModuleUtils.sanitizeIdentifier(block.name)}`
    const name = BlockModuleUtils.sanitizeIdentifier(block.name)
    const N = this.maxPoints(block)
    const maxD = this.maxDelay(block)
    let code = `    // Variable transport delay: ${block.name}\n`
    if (inputs.length < 2) {
      code += `    ${outputName} = ${this.initialInput(block)};\n`
      return code
    }
    const delayExpr = inputs[1]
    code += `    {\n`
    code += `        double __d = ${delayExpr};\n`
    code += `        if (__d < 0.0) __d = 0.0;\n`
    code += `        if (__d > ${maxD}) __d = ${maxD};\n`
    code += `        double __dt = model->dt;\n`
    code += `        if (__dt < 1e-15) __dt = 1e-15;\n`
    code += `        double __samp = __d / __dt;\n`
    code += `        int __count = model->states.${name}_count;\n`
    code += `        if (__count <= 0) {\n`
    code += `            ${outputName} = ${this.initialInput(block)};\n`
    code += `        } else {\n`
    code += `            if (__samp > (double)(__count - 1)) __samp = (double)(__count - 1);\n`
    code += `            int __i0 = (int)__samp;\n`
    code += `            int __i1 = __i0 + 1;\n`
    code += `            if (__i1 > __count - 1) __i1 = __count - 1;\n`
    code += `            double __f = __samp - (double)__i0;\n`
    code += `            int __head = model->states.${name}_head;\n`
    /* newest sample is at (head-1+N)%N; age i means i steps back */
    code += `            int __idx0 = (__head - 1 - __i0 + ${N} * 4) % ${N};\n`
    code += `            int __idx1 = (__head - 1 - __i1 + ${N} * 4) % ${N};\n`
    code += `            double __y0 = model->states.${name}_buf[__idx0];\n`
    code += `            double __y1 = model->states.${name}_buf[__idx1];\n`
    code += `            ${outputName} = __y0 + __f * (__y1 - __y0);\n`
    code += `        }\n`
    code += `    }\n`
    return code
  }

  generateDeferredStateUpdate(
    block: BlockData,
    inputs: string[],
    _inputTypes?: string[],
    context?: CodeGenContext
  ): string {
    if (inputs.length === 0) return ''
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
    code += `${indent}model->states.${name}_buf[model->states.${name}_head] = ${u};\n`
    code += `${indent}model->states.${name}_head = (model->states.${name}_head + 1) % ${N};\n`
    code += `${indent}if (model->states.${name}_count < ${N}) model->states.${name}_count++;\n`
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
      `    int ${name}_count;`
    ]
  }

  generateInitialization(block: BlockData): string {
    const name = BlockModuleUtils.sanitizeIdentifier(block.name)
    const N = this.maxPoints(block)
    const ic = this.initialInput(block)
    let code = `    // Variable transport delay IC: ${block.name}\n`
    code += `    for (int __i = 0; __i < ${N}; ++__i) model->states.${name}_buf[__i] = ${ic};\n`
    code += `    model->states.${name}_head = 0;\n`
    code += `    model->states.${name}_count = 0;\n`
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
    // Output depends on past buffer, not current u (delay>0); still DF on delay port.
    // Treat as DF for ordering so delay signal is ready; u is only written deferred.
    return true
  }
}
