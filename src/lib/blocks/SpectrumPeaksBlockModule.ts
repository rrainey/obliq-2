// lib/blocks/SpectrumPeaksBlockModule.ts
//
// Spectrum Peaks: tracks the strongest frequencies in a signal, to drive Notch
// Filter blocks. It re-implements the behaviour of Betaflight's dynamic notch
// analysis (docs/fpv-hud-gnss-plan.md, "Notch filters"); no firmware code is used.
//
// 1. Average `decimation` input samples, where decimation = max(1, floor(fs / (2·maxHz))).
// 2. Push the result through a sliding DFT of N samples, damped by r = 0.9999:
//    X[k] ← r·e^(j2πk/N)·(X[k] + x_new − r^N·x_old). Only bins in the search range update.
// 3. Every `updateEvery` input samples, apply a Hann window in the frequency domain,
//    Y[k] = X[k] − (X[k−1] + X[k+1]) / 2, and take the power |Y[k]|².
// 4. Keep the `count` highest local maxima, in bin order.
// 5. Noise floor: the mean power of the bins from max(start bin, 60 Hz) up, without
//    the peaks and most of their neighbours. The threshold is twice the floor.
// 6. Each peak above the threshold moves its output: parabolic interpolation gives its
//    frequency, and a PT1 follows it. The PT1 cutoff is 4 Hz × (power / threshold),
//    limited to 4–40 Hz. A peak below the threshold leaves its output where it is.
//
// Output: double[count], Hz. Outputs start evenly spaced across [minHz, maxHz].
// Timing: as Random Noise, one update on each sample hit, idempotent within a tick.

import { BlockData } from '@/components/BlockNode'
import { IBlockModule, BlockModuleUtils } from './BlockModule'
import { RandomNoiseBlockModule } from './RandomNoiseBlockModule'

const R = 0.9999
const FLOOR_MIN_HZ = 60
const THRESHOLD_FACTOR = 2
const BASE_CUTOFF_HZ = 4
const MAX_CUTOFF_FACTOR = 10

export class SpectrumPeaksBlockModule implements IBlockModule {
  private config(block: BlockData) {
    const p = block.parameters || {}
    const num = (v: unknown, d: number) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : d)
    return {
      count: Math.max(1, Math.trunc(num(p.count, 3))),
      windowSize: Math.max(8, 2 * Math.trunc(num(p.windowSize, 72) / 2)),
      minHz: num(p.minHz, 100),
      maxHz: num(p.maxHz, 600),
      updateEvery: Math.max(1, Math.trunc(num(p.updateEvery, 12))),
      sampleTime: RandomNoiseBlockModule.sampleTimeOf(block),
    }
  }

  generateComputation(block: BlockData, inputs: string[]): string {
    const outputName = `model->signals.${BlockModuleUtils.sanitizeIdentifier(block.name)}`
    const st = `model->states.${BlockModuleUtils.sanitizeIdentifier(block.name)}`
    const c = this.config(block)
    const N = c.windowSize
    const bins = N / 2
    const ts = c.sampleTime > 0 ? String(c.sampleTime) : 'model->dt'
    const period = c.sampleTime > 0 ? `(unsigned long long)llround(${ts} / model->dt)` : '1ULL'
    const twRe = Array.from({ length: bins }, (_, k) => R * Math.cos((2 * Math.PI * k) / N))
    const twIm = Array.from({ length: bins }, (_, k) => R * Math.sin((2 * Math.PI * k) / N))
    const x = inputs[0] || '0.0'

    return `    // Spectrum Peaks: ${block.name}
    {
        unsigned long long sp_n = ${period};
        if (sp_n < 1ULL) sp_n = 1ULL;
        if (${st}_tick != (long long)model->sample_tick &&
            (${st}_tick < 0 || model->sample_tick % sp_n == 0ULL)) {
            static const double sp_tw_re[${bins}] = { ${twRe.join(', ')} };
            static const double sp_tw_im[${bins}] = { ${twIm.join(', ')} };
            const double sp_ts = ${ts};
            const double sp_nyq = 0.5 / sp_ts;
            const double sp_max = fmin(${c.maxHz}, sp_nyq);
            int sp_dec = (int)floor(sp_nyq / sp_max);
            if (sp_dec < 1) sp_dec = 1;
            const double sp_res = 1.0 / (sp_dec * sp_ts * ${N}.0);
            int sp_start = (int)lround(fmin(${c.minHz}, sp_max) / sp_res);
            if (sp_start < 2) sp_start = 2;
            int sp_end = (int)lround(sp_max / sp_res);
            if (sp_end > ${bins - 2}) sp_end = ${bins - 2};
            ${st}_acc += ${x};
            if (++${st}_acc_count >= sp_dec) {
                const double sp_in = ${st}_acc / (double)${st}_acc_count;
                const double sp_delta = sp_in - ${Math.pow(R, N)} * ${st}_window[${st}_pos];
                ${st}_window[${st}_pos] = sp_in;
                ${st}_pos = (${st}_pos + 1) % ${N};
                ${st}_acc = 0.0;
                ${st}_acc_count = 0;
                for (int k = sp_start - 1; k <= sp_end + 1; k++) {
                    const double re = ${st}_re[k] + sp_delta;
                    const double im = ${st}_im[k];
                    ${st}_re[k] = sp_tw_re[k] * re - sp_tw_im[k] * im;
                    ${st}_im[k] = sp_tw_re[k] * im + sp_tw_im[k] * re;
                }
            }
            if (++${st}_since_update >= ${c.updateEvery}) {
                double sp_p[${bins}];
                int sp_bin[${c.count}];
                double sp_val[${c.count}];
                int sp_found = 0;
                ${st}_since_update = 0;
                for (int k = sp_start - 1; k <= sp_end + 1; k++) {
                    /* The bin below the search range has only one good neighbour */
                    const double yr = ${st}_re[k] - 0.5 * ((k > sp_start - 1 ? ${st}_re[k - 1] : ${st}_re[k]) + (k < sp_end + 1 ? ${st}_re[k + 1] : ${st}_re[k]));
                    const double yi = ${st}_im[k] - 0.5 * ((k > sp_start - 1 ? ${st}_im[k - 1] : ${st}_im[k]) + (k < sp_end + 1 ? ${st}_im[k + 1] : ${st}_im[k]));
                    sp_p[k] = yr * yr + yi * yi;
                }
                for (int k = sp_start; k <= sp_end; k++) {
                    if (sp_p[k] > sp_p[k - 1] && sp_p[k] > sp_p[k + 1]) {
                        /* Insert into the largest ${c.count}, highest power first */
                        int at = sp_found;
                        while (at > 0 && sp_val[at - 1] < sp_p[k]) at--;
                        if (at < ${c.count}) {
                            const int last = sp_found < ${c.count} ? sp_found : ${c.count} - 1;
                            for (int m = last; m > at; m--) { sp_val[m] = sp_val[m - 1]; sp_bin[m] = sp_bin[m - 1]; }
                            sp_val[at] = sp_p[k];
                            sp_bin[at] = k;
                            if (sp_found < ${c.count}) sp_found++;
                        }
                        k++;
                    }
                }
                /* Bin order, so an output keeps to its part of the spectrum */
                for (int a = 1; a < sp_found; a++) {
                    const int b0 = sp_bin[a];
                    const double v0 = sp_val[a];
                    int m = a;
                    while (m > 0 && sp_bin[m - 1] > b0) { sp_bin[m] = sp_bin[m - 1]; sp_val[m] = sp_val[m - 1]; m--; }
                    sp_bin[m] = b0;
                    sp_val[m] = v0;
                }
                {
                    int sp_floor_start = (int)lround(${FLOOR_MIN_HZ}.0 / sp_res);
                    if (sp_floor_start < sp_start) sp_floor_start = sp_start;
                    if (sp_floor_start > sp_end - 3) sp_floor_start = sp_start;
                    double sp_sum = 0.0;
                    for (int k = sp_floor_start; k <= sp_end; k++) sp_sum += sp_p[k];
                    int sp_used = sp_end - sp_floor_start + 1;
                    for (int a = 0; a < sp_found; a++) {
                        if (sp_bin[a] > sp_floor_start) {
                            sp_sum -= 0.75 * sp_p[sp_bin[a] - 1] + sp_p[sp_bin[a]] + 0.75 * sp_p[sp_bin[a] + 1];
                            sp_used--;
                        }
                    }
                    if (sp_used < 1) sp_used = 1;
                    const double sp_threshold = ${THRESHOLD_FACTOR}.0 * fmax(sp_sum, 0.0) / sp_used;
                    for (int a = 0; a < sp_found; a++) {
                        const int b = sp_bin[a];
                        if (sp_val[a] > sp_threshold) {
                            const double y0 = sp_p[b - 1], y1 = sp_p[b], y2 = sp_p[b + 1];
                            const double den = y0 - 2.0 * y1 + y2;
                            const double frac = den != 0.0 ? (y0 - y2) / (2.0 * den) : 0.0;
                            const double hz = fmin(fmax((b + frac) * sp_res, ${c.minHz}), sp_max);
                            const double ratio = sp_threshold > 0.0 ? sp_val[a] / sp_threshold : ${MAX_CUTOFF_FACTOR}.0;
                            const double cutoff = ${BASE_CUTOFF_HZ}.0 * fmin(fmax(ratio, 1.0), ${MAX_CUTOFF_FACTOR}.0);
                            const double w = 6.283185307179586 * cutoff * ${c.updateEvery}.0 * sp_ts;
                            ${st}_center[a] += (w / (w + 1.0)) * (hz - ${st}_center[a]);
                        }
                    }
                }
            }
            ${st}_tick = (long long)model->sample_tick;
        }
    }
    for (int i = 0; i < ${c.count}; i++) ${outputName}[i] = ${st}_center[i];
`
  }

  getOutputType(block: BlockData, _inputTypes: string[]): string {
    return `double[${this.config(block).count}]`
  }

  generateStructMember(block: BlockData, outputType: string): string | null {
    return BlockModuleUtils.generateStructMember(block.name, outputType)
  }

  requiresState(_block: BlockData): boolean {
    return true
  }

  generateStateStructMembers(block: BlockData, _outputType: string): string[] {
    const name = BlockModuleUtils.sanitizeIdentifier(block.name)
    const c = this.config(block)
    return [
      `    long long ${name}_tick; /* sample_tick of the last update, -1 = none */`,
      `    double ${name}_window[${c.windowSize}]; /* samples in the sliding DFT */`,
      `    int ${name}_pos;`,
      `    double ${name}_re[${c.windowSize / 2}];`,
      `    double ${name}_im[${c.windowSize / 2}];`,
      `    double ${name}_acc; /* decimation average */`,
      `    int ${name}_acc_count;`,
      `    int ${name}_since_update;`,
      `    double ${name}_center[${c.count}]; /* Hz */`,
    ]
  }

  generateInitialization(block: BlockData): string {
    const name = BlockModuleUtils.sanitizeIdentifier(block.name)
    const c = this.config(block)
    let code = `    model->states.${name}_tick = -1;\n`
    for (let i = 0; i < c.count; i++) {
      code += `    model->states.${name}_center[${i}] = ${c.minHz + ((i + 1) * (c.maxHz - c.minHz)) / (c.count + 1)};\n`
    }
    return code
  }

  getInputPortCount(_block: BlockData): number {
    return 1
  }

  getOutputPortCount(_block: BlockData): number {
    return 1
  }
}
