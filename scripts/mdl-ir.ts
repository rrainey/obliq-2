#!/usr/bin/env npx tsx
/**
 * Dump MDL IR / coverage for mdl2obliq Phase 0.
 *
 * Usage:
 *   npx tsx scripts/mdl-ir.ts saturn-1B/saturn_ib_stack.mdl
 *   npx tsx scripts/mdl-ir.ts saturn-1B/saturn_ib_stack.mdl --subsystem "Initial Conditions"
 *   npx tsx scripts/mdl-ir.ts … --coverage --json out.json
 */

import * as fs from 'fs'
import * as path from 'path'
import {
  buildCoverageReport,
  childSubsystemNames,
  coverageSummary,
  emitObliqFromSystem,
  findSubsystem,
  parseMdl,
  walkBlocks
} from '../src/lib/mdl2obliq'

function usage(): never {
  console.error(`Usage: mdl-ir <file.mdl> [--subsystem NAME] [--coverage] [--json out.json] [--emit obliq.json]
`)
  process.exit(2)
}

function main(): void {
  const argv = process.argv.slice(2)
  if (argv.length < 1 || argv[0]!.startsWith('-')) usage()
  const mdlPath = path.resolve(argv[0]!)
  let subsystem: string | undefined
  let wantCoverage = false
  let jsonOut: string | undefined
  let emitOut: string | undefined
  for (let i = 1; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--subsystem') {
      subsystem = argv[++i]
    } else if (a === '--coverage') {
      wantCoverage = true
    } else if (a === '--json') {
      jsonOut = argv[++i]
    } else if (a === '--emit') {
      emitOut = argv[++i]
    } else {
      usage()
    }
  }

  const text = fs.readFileSync(mdlPath, 'latin1')
  const model = parseMdl(text, mdlPath)

  let focus = model.root
  let focusLabel = model.name
  if (subsystem) {
    const hit = findSubsystem(model.root, subsystem)
    if (!hit?.system) {
      console.error(`Subsystem not found: ${JSON.stringify(subsystem)}`)
      // suggest close names
      const names: string[] = []
      walkBlocks(model.root, b => {
        if (b.blockType === 'SubSystem') names.push(b.name)
      })
      const needle = subsystem.toLowerCase()
      const sug = names.filter(n => n.toLowerCase().includes(needle)).slice(0, 20)
      if (sug.length) console.error('Suggestions:', sug)
      process.exit(1)
    }
    focus = hit.system
    focusLabel = subsystem
  }

  const bt = new Map<string, number>()
  let nBlocks = 0
  walkBlocks(focus, b => {
    nBlocks++
    bt.set(b.blockType, (bt.get(b.blockType) ?? 0) + 1)
  })

  const report = {
    path: mdlPath,
    modelName: model.name,
    focus: focusLabel,
    blockCount: nBlocks,
    lineCount: focus.lines.length,
    childSubsystems: childSubsystemNames(focus),
    blockTypes: Object.fromEntries(
      [...bt.entries()].sort((a, b) => b[1] - a[1])
    ),
    coverage: wantCoverage
      ? (() => {
          // coverage always on full model for global catalog
          const rows = buildCoverageReport(model)
          return { summary: coverageSummary(rows), rows }
        })()
      : undefined
  }

  if (jsonOut) {
    fs.writeFileSync(jsonOut, JSON.stringify(report, null, 2))
    console.error(`Wrote ${jsonOut}`)
  }

  console.log(`Model: ${model.name}`)
  console.log(`Focus: ${focusLabel}`)
  console.log(`Blocks (incl. nested): ${nBlocks}`)
  console.log(`Lines (this system only): ${focus.lines.length}`)
  console.log(`Child SubSystems (${report.childSubsystems.length}):`)
  for (const n of report.childSubsystems) console.log(`  - ${n}`)
  console.log('BlockTypes:')
  for (const [k, v] of Object.entries(report.blockTypes)) {
    console.log(`  ${v}\t${k}`)
  }

  if (wantCoverage && report.coverage) {
    const s = report.coverage.summary
    console.log('\nCoverage (full model BlockType instances):')
    console.log(`  total ${s.instanceTotal}`)
    for (const [st, n] of Object.entries(s.byStatus)) {
      if (n) console.log(`  ${st}: ${n}`)
    }
    if (s.unmappedKeys.length) {
      console.log(`  UNMAPPED keys: ${s.unmappedKeys.join(', ')}`)
    }
    if (s.needBlockKeys?.length) {
      console.log(`  NEED_BLOCK keys: ${s.needBlockKeys.join(', ')}`)
    }
    console.log('\nTop NEED_BLOCK / UNMAPPED:')
    for (const r of report.coverage.rows
      .filter(
        x =>
          x.kind === 'BlockType' &&
          (x.status === 'NEED_BLOCK' || x.status === 'UNMAPPED')
      )
      .slice(0, 30)) {
      console.log(`  ${r.count}\t${r.status}\t${r.key}\t${r.notes ?? ''}`)
    }
  }

  if (emitOut) {
    try {
      const emitted = emitObliqFromSystem(focus, {
        modelName: `mdl2obliq_${focusLabel.replace(/\W+/g, '_')}`,
        strict: true
      })
      fs.writeFileSync(emitOut, JSON.stringify(emitted.model, null, 2))
      console.error(`\nEmitted Obliq JSON → ${emitOut}`)
      console.error(
        `  blocks=${emitted.model.sheets[0]?.blocks.length} wires=${emitted.model.sheets[0]?.connections.length}`
      )
      if (emitted.warnings.length) {
        console.error(`  warnings (${emitted.warnings.length}):`)
        for (const w of emitted.warnings.slice(0, 20)) console.error(`    - ${w}`)
      }
    } catch (e) {
      console.error('\nEMIT FAILED (strict):', e instanceof Error ? e.message : e)
      process.exit(1)
    }
  }
}

main()
