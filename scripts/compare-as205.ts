#!/usr/bin/env npx tsx
/**
 * Compare an obliq multi-logger CSV export against TN-AP-67-158 reference.
 *
 * Usage (from repo root):
 *   npx --yes tsx scripts/compare-as205.ts \
 *     --model path/to/sim_export.csv \
 *     [--ref ../viper/lib_SaturnIBObliq/model/as205-reference/as205_trajectory_reference.csv] \
 *     [--offset 1] [--tmin 0] [--tmax 150] [--tol 1] \
 *     [--fields h_m,mass_kg,qbar_Pa] \
 *     [--out residual-report.md]
 *
 * Policy: TN is primary; Simulink may disagree. Prefer h_m and mass_kg
 * (frame-light). Defer space-fixed V/γ/XYZ until ECI→S exists.
 * TN Space frame ≈ EDD S (working assumption).
 */

import * as fs from 'fs'
import * as path from 'path'
import {
  compareCsvTexts,
  type ComparableField,
  type CompareOptions
} from '../../viper/lib_SaturnIBObliq/ts/as205Compare'

function usage(): never {
  console.error(`Usage: npx tsx scripts/compare-as205.ts --model <logger.csv> [options]

Options:
  --model <path>   Obliq multi-logger CSV (required). Columns: time, log_altitude, …
  --ref <path>     TN reference CSV (default: as205_trajectory_reference.csv)
  --offset <s>     Subtract from model time (default: 1 for 9.x liftoff step)
  --tmin <s>       Reference window start (default: 0)
  --tmax <s>       Reference window end (default: 150)
  --tol <s>        Nearest-time match tolerance (default: 1)
  --fields <list>  Comma list: h_m,mass_kg,qbar_Pa,v_mps,gamma_rad
  --out <path>     Write markdown report to file (also prints to stdout)
  --help           This message
`)
  process.exit(1)
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name)
  if (i < 0 || i + 1 >= process.argv.length) return undefined
  return process.argv[i + 1]
}

function main() {
  if (process.argv.includes('--help') || process.argv.includes('-h')) usage()

  const modelPath = arg('--model')
  if (!modelPath) {
    console.error('Error: --model is required\n')
    usage()
  }

  const repoRoot = path.resolve(__dirname, '..')
  const refPath =
    arg('--ref') ||
    path.join(
      repoRoot,
      '../viper/lib_SaturnIBObliq/model/as205-reference/as205_trajectory_reference.csv'
    )

  if (!fs.existsSync(modelPath!)) {
    console.error(`Model CSV not found: ${modelPath}`)
    process.exit(1)
  }
  if (!fs.existsSync(refPath)) {
    console.error(`Reference CSV not found: ${refPath}`)
    process.exit(1)
  }

  const offset = Number(arg('--offset') ?? '1')
  const tMin = Number(arg('--tmin') ?? '0')
  const tMax = Number(arg('--tmax') ?? '150')
  const tol = Number(arg('--tol') ?? '1')
  const fieldsArg = arg('--fields')
  const fields = (fieldsArg
    ? fieldsArg.split(',').map(s => s.trim())
    : ['h_m', 'mass_kg', 'qbar_Pa']) as ComparableField[]

  const options: CompareOptions & {
    referenceName?: string
    modelName?: string
  } = {
    referenceName: path.basename(refPath),
    modelName: path.basename(modelPath!),
    fields,
    tMin,
    tMax,
    timeMatchTol_s: tol,
    modelTimeOffset_s: offset
  }

  const refText = fs.readFileSync(refPath, 'utf8')
  const modelText = fs.readFileSync(modelPath!, 'utf8')
  const { result, report } = compareCsvTexts(refText, modelText, {
    ...options,
    includePhaseWindows: true
  })

  console.log(report)
  console.log('')
  console.log(
    `Paired points (max field): ${result.paired}; warnings: ${result.warnings.length}`
  )

  const outPath = arg('--out')
  if (outPath) {
    fs.mkdirSync(path.dirname(path.resolve(outPath)) || '.', { recursive: true })
    fs.writeFileSync(outPath, report + '\n', 'utf8')
    console.error(`Wrote ${outPath}`)
  }

  // Exit 0 always for now (no hard gates). Soft flags are in the report only.
  process.exit(0)
}

main()
