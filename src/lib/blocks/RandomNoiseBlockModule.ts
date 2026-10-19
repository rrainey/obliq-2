// lib/blocks/RandomNoiseBlockModule.ts
//
// Random Noise source: Gaussian or uniform white noise, held for one sample
// period (zero-order hold).
//
// Generator: SplitMix64 (Steele, Lea & Flood 2014), emitted inline so native
// and WASM builds produce identical sequences (no libc rand()). Gaussian
// values use Box–Muller with u1 in (0, 1]; uniform values span mean ± √3·σ so
// both distributions have the same variance.
//
// Amplitude: either a standard deviation σ, or a noise density N (units/√Hz,
// the IMU-datasheet convention) with σ = N/√Ts. Ts is `sampleTime`, else an
// inherited subsystem sample scope, else the model step.
//
// Timing: a new value is drawn in the output phase on each sample hit,
// sample_tick % round(Ts/dt) == 0, so it takes effect at the start of the
// period. `drawn_tick` makes the draw idempotent within a tick: _init runs
// evaluate_algebraic twice, and re-evaluation must never advance the stream.
// RK4 minor stages do not evaluate this block.

import { BlockData } from '@/components/BlockNode'
import { IBlockModule, BlockModuleUtils } from './BlockModule'

type NumOrVec = number | number[]

export class RandomNoiseBlockModule implements IBlockModule {
  /** Explicit sample time, or the enclosing subsystem's sample scope; 0 = every step. */
  static sampleTimeOf(block: BlockData): number {
    const own = Number(block.parameters?.sampleTime ?? 0)
    if (Number.isFinite(own) && own > 0) return own
    const scope = Number(block.parameters?.sampleTimeSec ?? 0)
    return Number.isFinite(scope) && scope > 0 ? scope : 0
  }

  /** Output width: 1 for a scalar, N for double[N]. */
  static widthOf(dataType: string | undefined): number {
    const info = BlockModuleUtils.parseType(dataType || 'double')
    return info.isArray && info.arraySize ? info.arraySize : 1
  }

  private static elementValues(value: unknown, width: number, fallback: number): number[] {
    const at = (i: number): number => {
      const v = Array.isArray(value) ? value[i] ?? value[value.length - 1] : value
      const n = Number(v)
      return Number.isFinite(n) ? n : fallback
    }
    return Array.from({ length: width }, (_, i) => at(i))
  }

  private static cLiteral(n: number): string {
    const s = String(n)
    return /[.eE]/.test(s) ? s : `${s}.0`
  }

  private static cArray(values: number[]): string {
    return `{ ${values.map(RandomNoiseBlockModule.cLiteral).join(', ')} }`
  }

  private static seedOf(block: BlockData): string {
    const raw = Number(block.parameters?.seed ?? 1)
    const seed = Number.isFinite(raw) ? Math.trunc(Math.abs(raw)) : 1
    return `${seed.toFixed(0)}ULL`
  }

  private dataTypeOf(block: BlockData): string {
    const dt = String(block.parameters?.dataType || 'double').trim()
    const info = BlockModuleUtils.parseType(dt)
    return info.isArray && info.arraySize ? `double[${info.arraySize}]` : 'double'
  }

  generateComputation(block: BlockData, _inputs: string[]): string {
    const name = BlockModuleUtils.sanitizeIdentifier(block.name)
    const outputName = `model->signals.${name}`
    const st = `model->states.${name}`
    const width = RandomNoiseBlockModule.widthOf(this.dataTypeOf(block))
    const isVector = width > 1 || BlockModuleUtils.parseType(this.dataTypeOf(block)).isArray
    const gaussian = block.parameters?.distribution !== 'uniform'
    const useDensity = block.parameters?.amplitudeMode === 'density'
    const sampleTime = RandomNoiseBlockModule.sampleTimeOf(block)

    const means = RandomNoiseBlockModule.elementValues(block.parameters?.mean as NumOrVec, width, 0)
    const amps = RandomNoiseBlockModule.elementValues(
      (useDensity ? block.parameters?.noiseDensity : block.parameters?.stdDev) as NumOrVec,
      width,
      useDensity ? 0 : 1
    )

    const tsExpr = sampleTime > 0 ? RandomNoiseBlockModule.cLiteral(sampleTime) : 'model->dt'
    const periodExpr =
      sampleTime > 0
        ? `(unsigned long long)llround(${tsExpr} / model->dt)`
        : '1ULL'

    let code = `    // Random Noise: ${block.name} (${gaussian ? 'gaussian' : 'uniform'}${sampleTime > 0 ? `, Ts=${sampleTime}` : ''})\n`
    code += `    {\n`
    code += `        static const double rn_mean[${width}] = ${RandomNoiseBlockModule.cArray(means)};\n`
    code += `        static const double rn_amp[${width}] = ${RandomNoiseBlockModule.cArray(amps)};\n`
    code += `        unsigned long long rn_n = ${periodExpr};\n`
    code += `        if (rn_n < 1ULL) rn_n = 1ULL;\n`
    code += `        if (${st}_drawn_tick != (long long)model->sample_tick &&\n`
    code += `            (${st}_drawn_tick < 0 || model->sample_tick % rn_n == 0ULL)) {\n`
    if (useDensity) {
      code += `            const double rn_scale = 1.0 / sqrt(${tsExpr}); /* sigma = N / sqrt(Ts) */\n`
    } else {
      code += `            const double rn_scale = 1.0;\n`
    }
    code += `            for (int i = 0; i < ${width}; i++) {\n`
    code += `                double rn_u[2];\n`
    code += `                for (int k = 0; k < 2; k++) {\n`
    code += `                    /* SplitMix64 */\n`
    code += `                    unsigned long long z = (${st}_rng += 0x9E3779B97F4A7C15ULL);\n`
    code += `                    z = (z ^ (z >> 30)) * 0xBF58476D1CE4E5B9ULL;\n`
    code += `                    z = (z ^ (z >> 27)) * 0x94D049BB133111EBULL;\n`
    code += `                    z ^= z >> 31;\n`
    code += `                    rn_u[k] = (double)((z >> 11) + 1ULL) * (1.0 / 9007199254740992.0); /* (0, 1] */\n`
    code += `                }\n`
    const sigma = 'rn_amp[i] * rn_scale'
    if (gaussian) {
      code += `                /* Box-Muller */\n`
      code += `                const double rn_g = sqrt(-2.0 * log(rn_u[0])) * cos(6.283185307179586 * rn_u[1]);\n`
      code += `                ${st}_value[i] = rn_mean[i] + ${sigma} * rn_g;\n`
    } else {
      code += `                /* Uniform on mean +/- sqrt(3)*sigma (same variance as gaussian) */\n`
      code += `                ${st}_value[i] = rn_mean[i] + ${sigma} * 1.7320508075688772 * (2.0 * rn_u[0] - 1.0);\n`
    }
    code += `            }\n`
    code += `            ${st}_drawn_tick = (long long)model->sample_tick;\n`
    code += `        }\n`
    code += `    }\n`

    if (isVector) {
      code += `    for (int i = 0; i < ${width}; i++) {\n`
      code += `        ${outputName}[i] = ${st}_value[i];\n`
      code += `    }\n`
    } else {
      code += `    ${outputName} = ${st}_value[0];\n`
    }
    return code
  }

  getOutputType(block: BlockData, _inputTypes: string[]): string {
    return this.dataTypeOf(block)
  }

  generateStructMember(block: BlockData, outputType: string): string | null {
    return BlockModuleUtils.generateStructMember(block.name, outputType)
  }

  requiresState(_block: BlockData): boolean {
    return true
  }

  generateStateStructMembers(block: BlockData, _outputType: string): string[] {
    const name = BlockModuleUtils.sanitizeIdentifier(block.name)
    const width = RandomNoiseBlockModule.widthOf(this.dataTypeOf(block))
    return [
      `    unsigned long long ${name}_rng; /* SplitMix64 state */`,
      `    long long ${name}_drawn_tick; /* sample_tick of the held value, -1 = none */`,
      `    double ${name}_value[${width}]; /* held noise value */`,
    ]
  }

  generateInitialization(block: BlockData): string {
    const name = BlockModuleUtils.sanitizeIdentifier(block.name)
    let code = `    // Initialize random noise: ${block.name}\n`
    code += `    model->states.${name}_rng = ${RandomNoiseBlockModule.seedOf(block)};\n`
    code += `    model->states.${name}_drawn_tick = -1; /* first draw on the first evaluation */\n`
    return code
  }

  getInputPortCount(_block: BlockData): number {
    return 0
  }

  getOutputPortCount(_block: BlockData): number {
    return 1
  }

  /** Output depends only on held state, never on an input. */
  isDirectFeedthrough(_block: BlockData): boolean {
    return false
  }
}
