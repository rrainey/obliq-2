// lib/testing/modelTestRunner.ts
//
// Runs a model's Assert blocks natively: generates C with OBLIQ_ASSERTS,
// compiles it with the host C compiler, runs it with the model's saved
// simulation settings (stopping early on request, as the editor does) and
// reads back the results table. Used by `npm run obliq:test`.
//
// The step loop mirrors the browser's WASM runner: _init(dt), then
// seed_from_inputs before the first step, then round(duration / dt) steps.

import { spawnSync } from 'child_process'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { CodeGenerator } from '@/lib/codegen/CodeGenerator'
import { CCodeBuilder } from '@/lib/codegen/CCodeBuilder'
import { normalizeGlobalSettings } from '@/lib/globalSettings'
import {
  AssertResult,
  AssertStatus,
  TestRunResults,
  findStoppingAssert,
  simulationStepCount,
  summarizeAsserts,
} from '@/lib/simulation/assertResults'

/** The parts of a model document the runner needs. */
export interface TestableModelData {
  sheets: any[]
  parameters?: any[]
  dataStores?: any[]
  globalSettings?: unknown
}

export interface ModelTestTarget {
  /** Model name, for reports */
  name: string
  /** Store id, when the model came from the store */
  id?: string
  /** File path, when the model came from a file */
  file?: string
  data: TestableModelData
}

export type ModelTestStatus = 'passed' | 'failed' | 'no_tests' | 'error'

export interface ModelTestReport {
  name: string
  id?: string
  file?: string
  /** passed: every Assert passed; failed: one failed or was not checked; error: not built or run */
  status: ModelTestStatus
  error?: string
  asserts: AssertResult[]
  stoppedBy: TestRunResults['stoppedBy']
  steps: number
  stepsRun: number
  timeStep: number
  duration: number
  integrationAlgorithm: 'rk4' | 'euler'
  /** Code generation warnings */
  warnings: string[]
  elapsedMs: number
}

export interface RunOptions {
  /** C compiler (default: $CC, else cc) */
  cc?: string
  /** Kill the model run after this long (default 10 minutes) */
  timeoutMs?: number
  /** Keep the generated project; its folder is noted in the report's warnings */
  keep?: boolean
}

/** Whether a model (or any subsystem sheet in it) contains an Assert block. */
export function modelHasAsserts(sheets: any[]): boolean {
  for (const sheet of sheets || []) {
    for (const block of sheet?.blocks || []) {
      if (block?.type === 'assert') return true
      if (Array.isArray(block?.parameters?.sheets) && modelHasAsserts(block.parameters.sheets)) return true
    }
  }
  return false
}

const STATUSES: AssertStatus[] = ['not_checked', 'passed', 'failed']

/** Runs fn with console output discarded (code generation logs its progress). */
function quietly<T>(fn: () => T): T {
  const methods = ['log', 'info', 'debug', 'warn', 'error'] as const
  const saved = methods.map(m => console[m])
  for (const m of methods) console[m] = () => {}
  try {
    return fn()
  } finally {
    methods.forEach((m, i) => (console[m] = saved[i]!))
  }
}

function mainSource(modelName: string, dt: number, steps: number): string {
  return `#include "${modelName}.h"
#include <stdio.h>

int main(void) {
    static ${modelName}_t model;
    ${modelName}_init(&model, ${dt});
    ${modelName}_seed_from_inputs(&model);
    long steps_run = 0;
    while (steps_run < ${steps}L) {
        ${modelName}_step(&model);
        steps_run++;
        if (${modelName}_stop_requested(&model)) break;
    }
    printf("STEPS\\t%ld\\n", steps_run);
    for (int i = 0; i < ${modelName}_assert_count(); i++) {
        obliq_assert_result_t r;
        if (${modelName}_assert_result(&model, i, &r) != 0) return 3;
        printf("ASSERT\\t%s\\t%s\\t%s\\t%d\\t%lu\\t%lu\\t%.17g\\t%.17g\\t%d\\t%.17g\\t%d\\n",
            r.block_id, r.name, r.qualified_name, (int)r.status, r.checks, r.failures,
            r.first_fail_time, r.first_fail_value, r.first_fail_index, r.worst_violation, r.stops_on_failure);
    }
    return 0;
}
`
}

/** Parses the test main's output into results. */
export function parseRunOutput(stdout: string): { stepsRun: number; asserts: AssertResult[] } {
  let stepsRun = 0
  const asserts: AssertResult[] = []
  for (const line of stdout.split('\n')) {
    const f = line.split('\t')
    if (f[0] === 'STEPS') stepsRun = Number(f[1])
    if (f[0] !== 'ASSERT' || f.length < 12) continue
    const failures = Number(f[6])
    const index = Number(f[9])
    asserts.push({
      blockId: f[1]!,
      name: f[2]!,
      qualifiedName: f[3]!,
      status: STATUSES[Number(f[4])] ?? 'not_checked',
      checks: Number(f[5]),
      failures,
      firstFailTime: failures > 0 ? Number(f[7]) : null,
      firstFailValue: failures > 0 ? Number(f[8]) : null,
      firstFailIndex: failures > 0 && index >= 0 ? index : null,
      worstViolation: Number(f[10]),
      stopsOnFailure: f[11] === '1',
    })
  }
  return { stepsRun, asserts }
}

function excerpt(text: string, lines = 20): string {
  const all = text.trim().split('\n')
  return all.length > lines ? [...all.slice(0, lines), `… (${all.length - lines} more lines)`].join('\n') : all.join('\n')
}

/** Generates, builds and runs one model, returning its test report. */
export function runModelTests(target: ModelTestTarget, opts: RunOptions = {}): ModelTestReport {
  const started = Date.now()
  const settings = normalizeGlobalSettings(target.data.globalSettings)
  const steps = simulationStepCount(settings.simulationDuration, settings.simulationTimeStep)
  const report: ModelTestReport = {
    name: target.name,
    id: target.id,
    file: target.file,
    status: 'error',
    asserts: [],
    stoppedBy: null,
    steps,
    stepsRun: 0,
    timeStep: settings.simulationTimeStep,
    duration: settings.simulationDuration,
    integrationAlgorithm: settings.integrationAlgorithm,
    warnings: [],
    elapsedMs: 0,
  }
  const finish = (r: ModelTestReport) => ({ ...r, elapsedMs: Date.now() - started })

  if (!modelHasAsserts(target.data.sheets)) {
    return finish({ ...report, status: 'no_tests' })
  }

  const modelName = CCodeBuilder.sanitizeIdentifier(target.name).toLowerCase() || 'model'
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `obliq-test-${modelName}-`))
  if (opts.keep) report.warnings.push(`Generated project kept in ${dir}`)
  try {
    let result
    try {
      result = quietly(() =>
        new CodeGenerator({
          modelName,
          integrationAlgorithm: settings.integrationAlgorithm,
          debugMath: settings.debugMath,
          asserts: true,
        }).generate(target.data.sheets, target.data.parameters || [], target.data.dataStores || [])
      )
    } catch (e) {
      return finish({ ...report, error: `Code generation failed: ${(e as Error).message}` })
    }
    report.warnings.push(...result.warnings.filter(w => /assert/i.test(w) || /^ERROR/.test(w)))

    const sources = [`${modelName}.c`, 'test_main.c']
    fs.writeFileSync(path.join(dir, `${modelName}.h`), result.header)
    fs.writeFileSync(path.join(dir, `${modelName}.c`), result.source)
    for (const sub of result.subsystemFiles || []) {
      fs.writeFileSync(path.join(dir, `${sub.subsystemName}.h`), sub.header)
      fs.writeFileSync(path.join(dir, `${sub.subsystemName}.c`), sub.source)
      sources.push(`${sub.subsystemName}.c`)
    }
    fs.writeFileSync(path.join(dir, 'test_main.c'), mainSource(modelName, settings.simulationTimeStep, steps))

    const cc = opts.cc || process.env.CC || 'cc'
    const build = spawnSync(cc, ['-O2', '-o', 'model_test', ...sources, '-lm'], { cwd: dir, encoding: 'utf8' })
    if (build.error || build.status !== 0) {
      const why = build.error ? build.error.message : excerpt(build.stderr || build.stdout || '')
      return finish({ ...report, error: `C build failed (${cc}):\n${why}` })
    }

    const run = spawnSync(path.join(dir, 'model_test'), [], {
      cwd: dir,
      encoding: 'utf8',
      timeout: opts.timeoutMs ?? 10 * 60 * 1000,
      maxBuffer: 64 * 1024 * 1024,
    })
    if (run.error || run.status !== 0) {
      const why = run.error
        ? run.error.message
        : run.signal
          ? `killed by ${run.signal}`
          : `exit code ${run.status}`
      return finish({ ...report, error: `Model run failed: ${why}${run.stderr ? `\n${excerpt(run.stderr)}` : ''}` })
    }

    const { stepsRun, asserts } = parseRunOutput(run.stdout)
    const sum = summarizeAsserts(asserts)
    return finish({
      ...report,
      status: sum.failed > 0 || sum.notChecked > 0 ? 'failed' : 'passed',
      asserts,
      stoppedBy: findStoppingAssert(asserts),
      stepsRun,
    })
  } finally {
    if (!opts.keep) fs.rmSync(dir, { recursive: true, force: true })
  }
}

// ---------------------------------------------------------------------------
// Reports

const fmt = (n: number) => String(Number(n.toPrecision(6)))

function describeFailure(a: AssertResult): string {
  if (a.status === 'not_checked') return 'not checked: no step fell inside its check window'
  const where = a.firstFailIndex !== null ? ` (element ${a.firstFailIndex})` : ''
  return (
    `first failed at t = ${fmt(a.firstFailTime ?? 0)} s with value ${fmt(a.firstFailValue ?? NaN)}${where}; ` +
    `${a.failures} of ${a.checks} steps failed, worst violation ${fmt(a.worstViolation)}`
  )
}

/** Plain-text summary for the terminal. */
export function formatTextReport(reports: ModelTestReport[]): string {
  const lines: string[] = []
  for (const r of reports) {
    const label = r.id ? `${r.name} (${r.id})` : r.file ? `${r.name} (${r.file})` : r.name
    if (r.status === 'error') {
      lines.push(`ERROR   ${label}`)
      lines.push(...(r.error || '').split('\n').map(l => `        ${l}`))
      continue
    }
    if (r.status === 'no_tests') {
      lines.push(`NO TESTS ${label}: the model has no Assert blocks`)
      continue
    }
    const sum = summarizeAsserts(r.asserts)
    const counts = `${sum.passed} passed, ${sum.failed} failed` + (sum.notChecked ? `, ${sum.notChecked} not checked` : '')
    lines.push(`${r.status === 'passed' ? 'PASS' : 'FAIL'}    ${label}: ${counts} (${(r.elapsedMs / 1000).toFixed(1)} s)`)
    if (r.stoppedBy) {
      lines.push(`        stopped at t = ${fmt(r.stoppedBy.time)} s by Assert "${r.stoppedBy.name}" (${r.stepsRun} of ${r.steps} steps)`)
    }
    for (const a of r.asserts.filter(a => a.status !== 'passed')) {
      lines.push(`        ✕ ${a.qualifiedName}: ${describeFailure(a)}`)
    }
    for (const w of r.warnings) lines.push(`        warning: ${w}`)
  }
  const failed = reports.filter(r => r.status !== 'passed').length
  lines.push('')
  lines.push(`${reports.length - failed} of ${reports.length} model${reports.length === 1 ? '' : 's'} passed`)
  return lines.join('\n')
}

function xml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    // Control characters other than tab/newline are not allowed in XML 1.0
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
}

/** JUnit XML: one test suite per model, one test case per Assert. */
export function formatJUnitReport(reports: ModelTestReport[]): string {
  const out: string[] = ['<?xml version="1.0" encoding="UTF-8"?>']
  const total = { tests: 0, failures: 0, errors: 0 }
  const suites: string[] = []
  for (const r of reports) {
    const suiteName = xml(r.name)
    const time = (r.elapsedMs / 1000).toFixed(3)
    if (r.status === 'error' || r.status === 'no_tests') {
      const message = r.status === 'error' ? r.error || 'error' : 'The model has no Assert blocks'
      total.tests++
      total.errors++
      suites.push(
        `  <testsuite name="${suiteName}" tests="1" failures="0" errors="1" time="${time}">\n` +
          `    <testcase classname="${suiteName}" name="${r.status === 'error' ? 'build and run' : 'has tests'}" time="${time}">\n` +
          `      <error message="${xml(message.split('\n')[0]!)}">${xml(message)}</error>\n` +
          `    </testcase>\n` +
          `  </testsuite>`
      )
      continue
    }
    const failures = r.asserts.filter(a => a.status !== 'passed').length
    total.tests += r.asserts.length
    total.failures += failures
    const cases = r.asserts.map(a => {
      const head = `    <testcase classname="${suiteName}" name="${xml(a.qualifiedName)}" time="0">`
      if (a.status === 'passed') return `${head}</testcase>`
      const message = describeFailure(a)
      return `${head}\n      <failure message="${xml(message)}" type="${a.status}">${xml(message)}</failure>\n    </testcase>`
    })
    suites.push(
      `  <testsuite name="${suiteName}" tests="${r.asserts.length}" failures="${failures}" errors="0" time="${time}">\n` +
        cases.join('\n') +
        `\n  </testsuite>`
    )
  }
  out.push(`<testsuites name="obliq" tests="${total.tests}" failures="${total.failures}" errors="${total.errors}">`)
  out.push(...suites)
  out.push('</testsuites>')
  return out.join('\n') + '\n'
}

/** CLI exit code: 0 all passed, 1 a test failed (or a model has none), 2 a model could not be built or run. */
export function exitCodeFor(reports: ModelTestReport[]): number {
  if (reports.some(r => r.status === 'error')) return 2
  if (reports.some(r => r.status !== 'passed')) return 1
  return 0
}
