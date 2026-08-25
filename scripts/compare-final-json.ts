#!/usr/bin/env npx tsx
/**
 * Compare two batch_sim final.json files on the Phase 1/2 primary field set.
 *
 * Usage:
 *   npx --yes tsx scripts/compare-final-json.ts \
 *     --ref ~/src/viper/ApolloA/reference-1000s-final.json \
 *     --model path/to/obliq-final.json \
 *     [--rel 0.005] [--out report.md] [--gate]
 */

import * as fs from 'fs'
import * as path from 'path'
import {
  compareFinalJson,
  formatFinalJsonReport,
  PRIMARY_FIELDS
} from '../../viper/lib_SaturnIBObliq/ts/compareFinalJson'

function usage(): never {
  console.error(`Usage: npx tsx scripts/compare-final-json.ts --ref <final.json> --model <final.json> [options]

Options:
  --ref <path>     Reference final.json (required)
  --model <path>   Model final.json (required)
  --rel <frac>     Relative tolerance (default 0.005 = 0.5%)
  --eps <n>        |ref| below this uses abs tol (default 1e-6)
  --abs <n>        Absolute tolerance for near-zero refs (default 1e-3)
  --fields <list>  Comma-separated override (default: primary allowlist)
  --out <path>     Write markdown report
  --gate           Exit 1 on FAIL (default: exit 0, report only)
  --help           This message

Primary default fields:
  ${PRIMARY_FIELDS.join(', ')}
`)
  process.exit(1)
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name)
  if (i < 0 || i + 1 >= process.argv.length) return undefined
  return process.argv[i + 1]
}

function loadJson(p: string): Record<string, unknown> {
  const raw = JSON.parse(fs.readFileSync(p, 'utf8'))
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    return raw as Record<string, unknown>
  }
  throw new Error(`Expected object JSON: ${p}`)
}

function main() {
  if (process.argv.includes('--help') || process.argv.includes('-h')) usage()

  const refPath = arg('--ref')
  const modelPath = arg('--model')
  if (!refPath || !modelPath) {
    console.error('Error: --ref and --model are required\n')
    usage()
  }

  if (!fs.existsSync(refPath!)) {
    console.error(`Reference not found: ${refPath}`)
    process.exit(1)
  }
  if (!fs.existsSync(modelPath!)) {
    console.error(`Model not found: ${modelPath}`)
    process.exit(1)
  }

  const relTol = Number(arg('--rel') ?? '0.005')
  const epsAbs = Number(arg('--eps') ?? '1e-6')
  const absTol = Number(arg('--abs') ?? '1e-3')
  const fieldsArg = arg('--fields')
  const fields = fieldsArg
    ? fieldsArg.split(',').map(s => s.trim()).filter(Boolean)
    : undefined

  const options = {
    relTol,
    epsAbs,
    absTol,
    fields,
    referenceName: path.basename(refPath!),
    modelName: path.basename(modelPath!)
  }

  const ref = loadJson(refPath!)
  const model = loadJson(modelPath!)
  const result = compareFinalJson(ref, model, options)
  const report = formatFinalJsonReport(result, options)

  console.log(report)

  const outPath = arg('--out')
  if (outPath) {
    fs.mkdirSync(path.dirname(path.resolve(outPath)) || '.', { recursive: true })
    fs.writeFileSync(outPath, report + '\n', 'utf8')
    console.error(`Wrote ${outPath}`)
  }

  if (process.argv.includes('--gate') && !result.passed) {
    process.exit(1)
  }
  process.exit(0)
}

main()
