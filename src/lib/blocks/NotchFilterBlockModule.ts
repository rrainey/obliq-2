// lib/blocks/NotchFilterBlockModule.ts
//
// Notch Filter: a second-order notch whose centre frequency and depth can change
// on every sample. A state-variable form keeps its states valid when the frequency
// moves, which a direct-form biquad does not.
//
// Trapezoidal state-variable filter, with g = tan(π·f·Ts) and k = 1/Q:
//   a1 = 1 / (1 + g·(g + k)),  a2 = g·a1
//   v1 = a1·s1 + a2·(x − s2),  v2 = s2 + g·v1
//   s1 ← 2·v1 − s1,            s2 ← 2·v2 − s2
//   y  = x − weight·k·v1
// With weight 1 this is the bilinear transform of (s² + ω²) / (s² + (ω/Q)·s + ω²).
// With weight 0 the output is the input, and the states keep running.
//
// Inputs: signal (double or double[N], element-wise), center_Hz, weight. The centre
// frequency is limited to [1 Hz, 0.48/Ts] and the weight to [0, 1].
//
// Timing: as Random Noise, one update on each sample hit, idempotent within a tick.

import { BlockData } from '@/components/BlockNode'
import { IBlockModule, BlockModuleUtils } from './BlockModule'
import { RandomNoiseBlockModule } from './RandomNoiseBlockModule'

export class NotchFilterBlockModule implements IBlockModule {
  private widthOf(type: string | undefined): number {
    return RandomNoiseBlockModule.widthOf(type)
  }

  private qOf(block: BlockData): number {
    const q = Number(block.parameters?.q ?? 5)
    return Number.isFinite(q) && q > 0 ? q : 5
  }

  generateComputation(block: BlockData, inputs: string[], inputTypes?: string[]): string {
    const outputName = `model->signals.${BlockModuleUtils.sanitizeIdentifier(block.name)}`
    const st = `model->states.${BlockModuleUtils.sanitizeIdentifier(block.name)}`
    const type = inputTypes?.[0] || 'double'
    const width = this.widthOf(type)
    const isVector = BlockModuleUtils.parseType(type).isArray
    const x = inputs[0] || '0.0'
    const sampleTime = RandomNoiseBlockModule.sampleTimeOf(block)
    const ts = sampleTime > 0 ? String(sampleTime) : 'model->dt'
    const period = sampleTime > 0 ? `(unsigned long long)llround(${ts} / model->dt)` : '1ULL'

    let code = `    // Notch Filter: ${block.name}\n`
    code += `    {\n`
    code += `        unsigned long long nf_n = ${period};\n`
    code += `        if (nf_n < 1ULL) nf_n = 1ULL;\n`
    code += `        if (${st}_tick != (long long)model->sample_tick &&\n`
    code += `            (${st}_tick < 0 || model->sample_tick % nf_n == 0ULL)) {\n`
    code += `            const double nf_ts = ${ts};\n`
    code += `            const double nf_f = fmin(fmax(${inputs[1] || '1.0'}, 1.0), 0.48 / nf_ts);\n`
    code += `            const double nf_w = fmin(fmax(${inputs[2] || '1.0'}, 0.0), 1.0);\n`
    code += `            const double nf_g = tan(3.141592653589793 * nf_f * nf_ts);\n`
    code += `            const double nf_k = ${1 / this.qOf(block)};\n`
    code += `            const double nf_a1 = 1.0 / (1.0 + nf_g * (nf_g + nf_k));\n`
    code += `            const double nf_a2 = nf_g * nf_a1;\n`
    code += `            for (int i = 0; i < ${width}; i++) {\n`
    code += `                const double nf_x = ${isVector ? `${x}[i]` : x};\n`
    code += `                const double nf_v1 = nf_a1 * ${st}_s1[i] + nf_a2 * (nf_x - ${st}_s2[i]);\n`
    code += `                const double nf_v2 = ${st}_s2[i] + nf_g * nf_v1;\n`
    code += `                ${st}_s1[i] = 2.0 * nf_v1 - ${st}_s1[i];\n`
    code += `                ${st}_s2[i] = 2.0 * nf_v2 - ${st}_s2[i];\n`
    code += `                ${st}_value[i] = nf_x - nf_w * nf_k * nf_v1;\n`
    code += `            }\n`
    code += `            ${st}_tick = (long long)model->sample_tick;\n`
    code += `        }\n`
    code += `    }\n`
    code += isVector
      ? `    for (int i = 0; i < ${width}; i++) ${outputName}[i] = ${st}_value[i];\n`
      : `    ${outputName} = ${st}_value[0];\n`
    return code
  }

  getOutputType(_block: BlockData, inputTypes: string[]): string {
    return inputTypes[0] || 'double'
  }

  generateStructMember(block: BlockData, outputType: string): string | null {
    return BlockModuleUtils.generateStructMember(block.name, outputType)
  }

  requiresState(_block: BlockData): boolean {
    return true
  }

  generateStateStructMembers(block: BlockData, outputType: string): string[] {
    const name = BlockModuleUtils.sanitizeIdentifier(block.name)
    const width = this.widthOf(outputType)
    return [
      `    long long ${name}_tick; /* sample_tick of the last update, -1 = none */`,
      `    double ${name}_s1[${width}]; /* state-variable filter states */`,
      `    double ${name}_s2[${width}];`,
      `    double ${name}_value[${width}]; /* held output */`,
    ]
  }

  generateInitialization(block: BlockData): string {
    const name = BlockModuleUtils.sanitizeIdentifier(block.name)
    return `    model->states.${name}_tick = -1;\n`
  }

  getInputPortCount(_block: BlockData): number {
    return 3
  }

  getOutputPortCount(_block: BlockData): number {
    return 1
  }
}
