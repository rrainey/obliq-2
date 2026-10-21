// lib/blocks/AssertBlockModule.ts
//
// Assert: a test sink that checks a condition at each major time step and
// records whether it ever failed.
//
// Modes:
//   bounds  u within [lower, upper] (blank bound = unbounded)
//   near    |u - expected| <= absTol + relTol*|expected| (second input)
//   true    u is true / non-zero
// Vectors and matrices are checked element by element; any failing element
// fails the step. NaN always fails.
//
// Timing: the check runs once per sample_tick, inside the check window
// [checkFrom, checkUntil] (half-step slack for accumulated time). `checked_tick`
// makes it idempotent: _init evaluates the algebra twice at tick 0, and _step
// re-evaluates tick 0. RK4 minor stages run at the same tick and are skipped,
// and are rolled back by the RK4 snapshot anyway.
//
// All check code is inside `#ifdef OBLIQ_ASSERTS`, so exported C carries no
// test logic unless the user defines it. Results are read through
// <model>_assert_count() / <model>_assert_result() (see codegen/AssertResults).

import { BlockData } from '@/components/BlockNode'
import { IBlockModule, BlockModuleUtils } from './BlockModule'

export type AssertMode = 'bounds' | 'near' | 'true'

export function assertModeOf(block: BlockData): AssertMode {
  const m = block.parameters?.mode
  return m === 'near' || m === 'true' ? m : 'bounds'
}

/** Finite number from a parameter, or null when blank / unbounded. */
function optionalNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function cLiteral(n: number): string {
  const s = String(n)
  return /[.eE]/.test(s) ? s : `${s}.0`
}

/** Loop extents for a C type: scalars and vectors are 1-column matrices. */
function shapeOf(type: string | undefined): { rows: number; cols: number; kind: 'scalar' | 'vector' | 'matrix' } {
  const info = BlockModuleUtils.parseType(type || 'double')
  if (info.isMatrix && info.rows && info.cols) return { rows: info.rows, cols: info.cols, kind: 'matrix' }
  if (info.isArray && info.arraySize) return { rows: info.arraySize, cols: 1, kind: 'vector' }
  return { rows: 1, cols: 1, kind: 'scalar' }
}

function element(expr: string, kind: 'scalar' | 'vector' | 'matrix'): string {
  if (kind === 'matrix') return `${expr}[as_i][as_j]`
  if (kind === 'vector') return `${expr}[as_i]`
  return expr
}

export class AssertBlockModule implements IBlockModule {
  generateComputation(block: BlockData, inputs: string[], inputTypes?: string[]): string {
    const name = BlockModuleUtils.sanitizeIdentifier(block.name)
    const st = `model->states.${name}`
    const mode = assertModeOf(block)
    const u = inputs[0] ?? '0.0'
    const uShape = shapeOf(inputTypes?.[0])
    const from = optionalNumber(block.parameters?.checkFrom) ?? 0
    const until = optionalNumber(block.parameters?.checkUntil)
    const stop = block.parameters?.onFailure === 'stop'

    // Per-element pass test and violation amount (> 0 when failing)
    let elementCode = `                const double as_v = (double)(${element(u, uShape.kind)});\n`
    if (mode === 'bounds') {
      const lo = optionalNumber(block.parameters?.lower)
      const hi = optionalNumber(block.parameters?.upper)
      const loC = lo === null ? '-INFINITY' : cLiteral(lo)
      const hiC = hi === null ? 'INFINITY' : cLiteral(hi)
      elementCode += `                const int as_ok = (as_v >= ${loC} && as_v <= ${hiC});\n`
      elementCode += `                const double as_viol = (as_v < ${loC}) ? (${loC} - as_v) : (as_v - ${hiC});\n`
    } else if (mode === 'near') {
      const e = inputs[1] ?? '0.0'
      const eShape = shapeOf(inputTypes?.[1])
      const eElem = eShape.kind === 'scalar' ? e : element(e, uShape.kind)
      const absTol = optionalNumber(block.parameters?.absTol) ?? 0
      const relTol = optionalNumber(block.parameters?.relTol) ?? 0
      elementCode += `                const double as_e = (double)(${eElem});\n`
      elementCode += `                const double as_tol = ${cLiteral(absTol)} + ${cLiteral(relTol)} * fabs(as_e);\n`
      elementCode += `                const int as_ok = (fabs(as_v - as_e) <= as_tol);\n`
      elementCode += `                const double as_viol = fabs(as_v - as_e) - as_tol;\n`
    } else {
      elementCode += `                const int as_ok = (as_v != 0.0);\n`
      elementCode += `                const double as_viol = 1.0;\n`
    }
    elementCode += `                if (!as_ok) {\n`
    // Element index for vectors and matrices; -1 for a scalar
    const indexExpr = uShape.kind === 'scalar' ? '-1' : `as_i * ${uShape.cols} + as_j`
    elementCode += `                    if (!as_fail) { as_val = as_v; as_idx = ${indexExpr}; }\n`
    elementCode += `                    as_fail = 1;\n`
    elementCode += `                    /* NaN violation counts as infinitely bad */\n`
    elementCode += `                    if (!(as_viol <= as_worst)) as_worst = isnan(as_viol) ? INFINITY : as_viol;\n`
    elementCode += `                }\n`

    const window =
      until === null
        ? `model->time >= ${cLiteral(from)} - 0.5 * model->dt`
        : `model->time >= ${cLiteral(from)} - 0.5 * model->dt && model->time <= ${cLiteral(until)} + 0.5 * model->dt`

    const describe =
      mode === 'bounds' ? 'within bounds' : mode === 'near' ? 'near expected' : 'true'
    let code = `#ifdef OBLIQ_ASSERTS\n`
    code += `    /* Assert: ${block.name} (${describe}${stop ? ', stops on failure' : ''}) */\n`
    code += `    if (${st}_checked_tick != (long long)model->sample_tick) {\n`
    code += `        ${st}_checked_tick = (long long)model->sample_tick;\n`
    code += `        if (${window}) {\n`
    code += `            int as_fail = 0, as_idx = -1;\n`
    code += `            double as_val = 0.0, as_worst = 0.0;\n`
    code += `            for (int as_i = 0; as_i < ${uShape.rows}; as_i++) {\n`
    code += `            for (int as_j = 0; as_j < ${uShape.cols}; as_j++) {\n`
    code += elementCode
    code += `            }\n`
    code += `            }\n`
    code += `            ${st}_checks++;\n`
    code += `            if (as_fail) {\n`
    code += `                if (${st}_failures == 0UL) {\n`
    code += `                    ${st}_first_fail_time = model->time;\n`
    code += `                    ${st}_first_fail_value = as_val;\n`
    code += `                    ${st}_first_fail_index = as_idx;\n`
    code += `                }\n`
    code += `                ${st}_failures++;\n`
    code += `                if (as_worst > ${st}_worst_violation) ${st}_worst_violation = as_worst;\n`
    if (stop) code += `                model->stop_requested = 1;\n`
    code += `            }\n`
    code += `        }\n`
    code += `    }\n`
    code += `#endif /* OBLIQ_ASSERTS */\n`
    return code
  }

  getOutputType(_block: BlockData, _inputTypes: string[]): string {
    return 'void'
  }

  generateStructMember(_block: BlockData, _outputType: string): string | null {
    return null
  }

  requiresState(_block: BlockData): boolean {
    return true
  }

  generateStateStructMembers(block: BlockData, _outputType: string): string[] {
    const name = BlockModuleUtils.sanitizeIdentifier(block.name)
    return [
      `    long long ${name}_checked_tick; /* Assert: last sample_tick checked, -1 = none */`,
      `    unsigned long ${name}_checks; /* Assert: steps checked */`,
      `    unsigned long ${name}_failures; /* Assert: steps failed */`,
      `    double ${name}_first_fail_time;`,
      `    double ${name}_first_fail_value;`,
      `    int ${name}_first_fail_index; /* flat element index of the first failure; -1 for a scalar */`,
      `    double ${name}_worst_violation;`,
    ]
  }

  generateInitialization(block: BlockData): string {
    const name = BlockModuleUtils.sanitizeIdentifier(block.name)
    let code = `    // Initialize assert: ${block.name}\n`
    code += `    model->states.${name}_checked_tick = -1;\n`
    code += `    model->states.${name}_first_fail_time = -1.0;\n`
    code += `    model->states.${name}_first_fail_index = -1;\n`
    return code
  }

  getInputPortCount(block: BlockData): number {
    return assertModeOf(block) === 'near' ? 2 : 1
  }

  getOutputPortCount(_block: BlockData): number {
    return 0
  }

  getInputPortLabels(block: BlockData): string[] | undefined {
    return assertModeOf(block) === 'near' ? ['u', 'expected'] : undefined
  }
}
