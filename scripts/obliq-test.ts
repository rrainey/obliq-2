#!/usr/bin/env npx tsx
/**
 * Run the Assert blocks of obliq models natively and report pass/fail.
 *
 * Usage:
 *   npm run obliq:test -- [model ...] [--all] [--json] [--junit <file>] [--keep] [--timeout <s>]
 *
 * A model is a path to a model JSON file, a stored model's id, or a stored
 * model's name (from OBLIQ_HOME, default ~/.config/obliq-2). --all adds every
 * stored model that contains an Assert block. Each model runs with its saved
 * simulation settings (duration, time step, integrator).
 *
 * Needs a C compiler ($CC, else cc).
 *
 * Exit code: 0 every Assert passed; 1 an Assert failed or was not checked, or
 * a named model has no Assert blocks; 2 a model could not be found, built or run.
 */
import * as fs from 'fs'
import {
  ModelTestReport,
  exitCodeFor,
  formatJUnitReport,
  formatTextReport,
  runModelTests,
} from '../src/lib/testing/modelTestRunner'
import { resolveTestTargets } from '../src/lib/testing/resolveTestTargets'

function usage(code: number): never {
  const text = `Usage: npm run obliq:test -- [model ...] [options]

  model             A model JSON file, a stored model id, or a stored model name
Options:
  --all             Also run every stored model that has Assert blocks
  --json            Print results as JSON instead of text
  --junit <file>    Also write JUnit XML (for CI)
  --keep            Keep each generated C project and print where
  --timeout <s>     Stop a model's run after this many seconds (default 600)
  --help            This message

Models come from OBLIQ_HOME (default ~/.config/obliq-2). The C compiler is $CC, else cc.
Exit code: 0 all passed; 1 a test failed or a model has none; 2 a model could not be found, built or run.`
  ;(code === 0 ? console.log : console.error)(text)
  process.exit(code)
}

function parseArgs(argv: string[]) {
  const opts = { models: [] as string[], all: false, json: false, junit: undefined as string | undefined, keep: false, timeoutS: 600 }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!
    const value = () => {
      const v = argv[++i]
      if (v === undefined) {
        console.error(`${a} needs a value`)
        usage(2)
      }
      return v
    }
    if (a === '--help' || a === '-h') usage(0)
    else if (a === '--all') opts.all = true
    else if (a === '--json') opts.json = true
    else if (a === '--keep') opts.keep = true
    else if (a === '--junit') opts.junit = value()
    else if (a === '--timeout') {
      opts.timeoutS = Number(value())
      if (!(opts.timeoutS > 0)) {
        console.error('--timeout must be a positive number of seconds')
        usage(2)
      }
    } else if (a.startsWith('--')) {
      console.error(`Unknown option ${a}`)
      usage(2)
    } else opts.models.push(a)
  }
  if (opts.models.length === 0 && !opts.all) usage(2)
  return opts
}

function main(): void {
  const opts = parseArgs(process.argv.slice(2))
  const { targets, errors } = resolveTestTargets(opts.models, { all: opts.all })

  const reports: ModelTestReport[] = errors.map(e => ({
    name: e.arg,
    status: 'error',
    error: e.message,
    asserts: [],
    stoppedBy: null,
    steps: 0,
    stepsRun: 0,
    timeStep: 0,
    duration: 0,
    integrationAlgorithm: 'rk4',
    warnings: [],
    elapsedMs: 0,
  }))
  if (opts.all && targets.length === 0 && errors.length === 0 && opts.models.length === 0) {
    console.error('No stored model has Assert blocks.')
  }

  for (const target of targets) {
    if (!opts.json) process.stderr.write(`Running ${target.name}…\n`)
    reports.push(runModelTests(target, { keep: opts.keep, timeoutMs: opts.timeoutS * 1000 }))
  }

  if (opts.json) {
    console.log(JSON.stringify({ models: reports, exitCode: exitCodeFor(reports) }, null, 2))
  } else {
    console.log(formatTextReport(reports))
  }
  if (opts.junit) fs.writeFileSync(opts.junit, formatJUnitReport(reports))
  process.exitCode = exitCodeFor(reports)
}

main()
