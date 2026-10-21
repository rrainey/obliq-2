// lib/simulation/assertResults.ts
//
// Assert block results read from a simulation WASM module, and the step
// count every runner uses.

export type AssertStatus = 'not_checked' | 'passed' | 'failed'

export interface AssertResult {
  /** Editor block id */
  blockId: string
  name: string
  /** Flattened name, unique in the model (includes the subsystem path) */
  qualifiedName: string
  status: AssertStatus
  /** Steps checked */
  checks: number
  /** Steps that failed */
  failures: number
  /** Time of the first failure, or null */
  firstFailTime: number | null
  firstFailValue: number | null
  /** Flat element index of the first failure (vectors/matrices), or null */
  firstFailIndex: number | null
  worstViolation: number
  stopsOnFailure: boolean
}

export interface TestRunResults {
  results: AssertResult[]
  /** Set when an Assert stopped the run */
  stoppedBy: { blockId: string; name: string; time: number } | null
  /** Steps run (fewer than requested when stopped) */
  stepsRun: number
}

const STATUSES: AssertStatus[] = ['not_checked', 'passed', 'failed']

/**
 * Number of fixed steps for a run of `duration` at `timeStep`. Rounded, so a
 * duration that is a multiple of the step is not cut short by floating error
 * (0.3 / 0.1 = 2.9999999999999996).
 */
export function simulationStepCount(duration: number, timeStep: number): number {
  if (!(duration > 0) || !(timeStep > 0)) return 0
  return Math.max(0, Math.round(duration / timeStep))
}

/** Whether a stop-on-failure Assert has fired. False for modules without the export. */
export function wasmStopRequested(mod: any): boolean {
  return typeof mod?._wasm_stop_requested === 'function' && mod._wasm_stop_requested() !== 0
}

/** Reads every Assert result from a WASM module (empty for modules built before Asserts). */
export function readWasmAssertResults(mod: any): AssertResult[] {
  if (typeof mod?._wasm_get_assert_count !== 'function') return []
  const count: number = mod._wasm_get_assert_count()
  const text = (i: number, field: number): string => {
    const ptr = mod._wasm_get_assert_text(i, field)
    return ptr ? mod.UTF8ToString(ptr) : ''
  }
  const results: AssertResult[] = []
  for (let i = 0; i < count; i++) {
    const num = (field: number): number => mod._wasm_get_assert_number(i, field)
    const failures = num(2)
    results.push({
      blockId: text(i, 2),
      name: text(i, 0),
      qualifiedName: text(i, 1),
      status: STATUSES[num(0)] ?? 'not_checked',
      checks: num(1),
      failures,
      firstFailTime: failures > 0 ? num(3) : null,
      firstFailValue: failures > 0 ? num(4) : null,
      firstFailIndex: failures > 0 && num(5) >= 0 ? num(5) : null,
      worstViolation: num(6),
      stopsOnFailure: num(7) !== 0,
    })
  }
  return results
}

/** The Assert that stopped a run: the stop-on-failure Assert that failed first. */
export function findStoppingAssert(results: AssertResult[]): TestRunResults['stoppedBy'] {
  const stoppers = results.filter(r => r.stopsOnFailure && r.status === 'failed' && r.firstFailTime !== null)
  if (stoppers.length === 0) return null
  const first = stoppers.reduce((a, b) => (b.firstFailTime! < a.firstFailTime! ? b : a))
  return { blockId: first.blockId, name: first.name, time: first.firstFailTime! }
}

/** A simulation time for messages: up to 6 significant digits, no trailing zeros. */
export function formatSimTime(t: number): string {
  return String(Number(t.toPrecision(6)))
}

export function summarizeAsserts(results: AssertResult[]): { passed: number; failed: number; notChecked: number } {
  return {
    passed: results.filter(r => r.status === 'passed').length,
    failed: results.filter(r => r.status === 'failed').length,
    notChecked: results.filter(r => r.status === 'not_checked').length,
  }
}
