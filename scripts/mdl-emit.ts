#!/usr/bin/env npx tsx
/**
 * Emit full (or subsystem) MDL → Obliq JSON, optionally codegen to C.
 *
 *   npm run mdl:emit -- saturn-1B/saturn_ib_stack.mdl
 *   npm run mdl:emit -- saturn-1B/saturn_ib_stack.mdl --subsystem "Saturn_IB_Stack" --cgen
 */
import * as fs from 'fs'
import * as path from 'path'
import {
  emitObliqFromSystem,
  findSubsystem,
  parseMdl
} from '../src/lib/mdl2obliq'

function usage(): never {
  console.error(
    `Usage: mdl-emit <file.mdl> [--subsystem NAME] [--out dir] [--cgen]
                [--skip-validate] [--skip-mux-expand]
`
  )
  process.exit(2)
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2)
  if (!argv[0] || argv[0].startsWith('-')) usage()
  const mdlPath = path.resolve(argv[0]!)
  let subsystem = 'Saturn_IB_Stack'
  let outDir = '/tmp/mdl2obliq'
  let doCgen = false
  let doValidate = true
  let expandMux = true
  for (let i = 1; i < argv.length; i++) {
    if (argv[i] === '--subsystem') subsystem = argv[++i]!
    else if (argv[i] === '--out') outDir = argv[++i]!
    else if (argv[i] === '--cgen') doCgen = true
    else if (argv[i] === '--skip-validate') doValidate = false
    else if (argv[i] === '--skip-mux-expand') expandMux = false
    else usage()
  }

  const model = parseMdl(fs.readFileSync(mdlPath, 'latin1'), mdlPath)
  const hit = findSubsystem(model.root, subsystem)
  if (!hit?.system) {
    console.error(`Subsystem not found: ${subsystem}`)
    process.exit(1)
  }

  const emitted = emitObliqFromSystem(hit.system, {
    strict: true,
    modelName: subsystem.replace(/\W+/g, '_').toLowerCase() + '_translated',
    description: `mdl2obliq emit of ${subsystem} from ${path.basename(mdlPath)}`,
    expandMuxVectors: expandMux,
    validate: doValidate
  })

  fs.mkdirSync(outDir, { recursive: true })
  const jsonPath = path.join(outDir, `${emitted.model.name}.json`)
  fs.writeFileSync(jsonPath, JSON.stringify(emitted.model, null, 2))
  console.log(
    `Emitted ${jsonPath} (${emitted.model.sheets[0]?.blocks.length} top blocks, ${emitted.warnings.length} warnings)`
  )

  if (emitted.validation) {
    console.log(
      `Obliq validation: ${emitted.validation.valid ? 'PASS' : 'FAIL'} ` +
        `(${emitted.validation.errorCount} errors, ${emitted.validation.warningCount} warnings)`
    )
    if (!emitted.validation.valid) {
      console.error(emitted.validation.report)
      process.exit(1)
    }
  }

  if (emitted.errors.length > 0 && !emitted.validation) {
    console.error('Emit errors:', emitted.errors.slice(0, 20))
    process.exit(1)
  }

  if (!doCgen) return

  const { execSync } = await import('child_process')
  const cgenOut = path.join(outDir, 'cgen')
  fs.mkdirSync(cgenOut, { recursive: true })
  const cmd = `npx --yes tsx scripts/obliq-cgen.ts ${JSON.stringify(jsonPath)} --out ${JSON.stringify(cgenOut)} --name ${JSON.stringify(emitted.model.name)} --compile`
  console.log('Running', cmd)
  execSync(cmd, { stdio: 'inherit', cwd: path.resolve(__dirname, '..') })
}

main().catch(e => {
  console.error(e)
  process.exit(1)
})
