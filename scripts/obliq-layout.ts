#!/usr/bin/env npx tsx
/**
 * Apply the editor's layout to a model JSON file, or score its layout.
 *
 * Usage:
 *   npm run obliq:layout -- <model.json> -o <out.json> [options]
 *   npm run obliq:layout -- <model.json> --in-place [options]
 *   npm run obliq:layout -- <model.json> --report [--json] [options]
 *
 * The layout is the one that "Tune Model Layout..." applies in the editor
 * (src/lib/layout/tuneModelLayout.ts). The score is src/lib/layout/layoutMetrics.ts.
 *
 * Accepts the same files as obliq-cgen.ts:
 *   { "name": "...", "data": { "sheets": [...], ... } }   // as stored in the model store
 *   { "sheets": [...], ... }                              // bare ModelData
 * The output keeps the shape of the input. Model references are not expanded:
 * the layout changes only the sheets that the file holds.
 */

import * as fs from 'fs'
import * as path from 'path'
import type { Sheet } from '../src/lib/modelStore'
import {
  tuneModelLayout,
  DEFAULT_TUNE_OPTIONS,
  type TuneLayoutOptions,
  type TuneLayoutResult,
  type TuneScope,
  type PortLabelChoice,
  type LayoutEngine,
} from '../src/lib/layout/tuneModelLayout'
import { buildExportPlan, buildFullPlan } from '../src/lib/export/sheetTree'
import { scoreSheetTree, type SheetLayoutMetrics } from '../src/lib/layout/layoutMetrics'
import { DEFAULT_TIDY_OPTIONS, type TidyLabelOptions } from '../src/lib/layout/tidyLabels'

function usage(code = 1): never {
  const out = code === 0 ? console.log : console.error
  out(`Usage: npm run obliq:layout -- <model.json> (-o <out.json> | --in-place | --report) [options]

Apply the layout of "Tune Model Layout..." to a model file, or print its layout score.

Output:
  -o, --out <file>          Write the model with the layout applied to this file
  --in-place                Write the result to the input file
  --report                  Print the score of each sheet before and after the layout.
                            Write no file.
  --json                    With --report, print JSON instead of a table

Layout options (the same as the Tune Model Layout dialog):
  --engine <elk|classic>    Layout engine (default elk). elk is ELK Layered
                            (src/lib/layout/elkLayout.ts) with satellite blocks
                            beside their hosts. classic is src/lib/layout/autoLayout.ts.
  --elk-option <key=value>  Replace or add one ELK option, for example
                            elk.layered.nodePlacement.strategy=BRANDES_KOEPF.
                            Give it again for more options. Only with --engine elk.
  --elk-order <flow|list>   The model order that ELK receives (default flow):
                            signal-flow order, or the order of the block list.
  --no-roles                Do not use the subsystem functions for the signal-flow
                            order (the order before this option). Only with
                            --engine elk.
  --no-port-name-clearance  Do not reserve the space of the port names outside
                            blocks. Only with --engine elk.
  --no-mirror               Do not mirror the feedback-path blocks: no return row
                            below the forward path, and the stored flip of each
                            block does not change. Only with --engine elk.
  --tidy-labels             Tidy signal labels (changes the model, not its behaviour).
                            Replaces long wires that cross many other wires with
                            Sheet Label pairs, when the sheet then has fewer crossings.
                            See src/lib/layout/tidyLabels.ts. Only with --engine elk.
  --tidy-option <key=value> Replace one option of the tidy, for example
                            pairToWire=true or wireMinCrossings=8 (DEFAULT_TIDY_OPTIONS
                            in src/lib/layout/tidyLabels.ts). Give it again for more.
  --scope <model|subsystem|sheet>
                            Sheets to lay out (default: model)
  --sheet <name|id|path>    The active sheet for --scope subsystem|sheet
                            (default: the first top-level sheet). A path is
                            the breadcrumb joined with "/", as in the report.
  --resize-subsystems       Resize subsystem blocks to align their ports
  --max-port-spacing <px>   Largest port spacing a resize can make (default 40)
  --hide-block-names        Hide the names of all blocks except subsystems
  --port-labels <show|hide|asis>
                            Port-name labels on subsystem blocks (default asis)
  --no-clean-up             Do not move blocks or route wires
  -h, --help                Show this message
`)
  process.exit(code)
}

/** Stop on a usage error. The usage text follows only when `showUsage` is true. */
function fail(message: string, showUsage = true): never {
  console.error(`Error: ${message}`)
  if (showUsage) {
    console.error('')
    usage()
  }
  process.exit(1)
}

interface CliArgs {
  model: string
  out?: string
  inPlace: boolean
  report: boolean
  json: boolean
  sheet?: string
  options: TuneLayoutOptions
}

const VALUE_FLAGS = new Set(['-o', '--out', '--scope', '--sheet', '--max-port-spacing', '--port-labels', '--engine', '--elk-order'])

function parseArgs(argv: string[]): CliArgs {
  const values = new Map<string, string>()
  const flags = new Set<string>()
  const positional: string[] = []
  const elkOptions: Record<string, string> = {}
  const tidyOptions: Record<string, number | boolean> = {}
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '-h' || a === '--help') usage(0)
    if (a === '--elk-option') {
      const kv = argv[++i]
      const eq = kv?.indexOf('=') ?? -1
      if (!kv || eq <= 0) fail('--elk-option needs key=value')
      elkOptions[kv.slice(0, eq)] = kv.slice(eq + 1)
    } else if (a === '--tidy-option') {
      const kv = argv[++i]
      const eq = kv?.indexOf('=') ?? -1
      if (!kv || eq <= 0) fail('--tidy-option needs key=value')
      const key = kv.slice(0, eq), text = kv.slice(eq + 1)
      if (!(key in DEFAULT_TIDY_OPTIONS)) fail(`unknown tidy option ${key}`)
      const def = DEFAULT_TIDY_OPTIONS[key as keyof TidyLabelOptions]
      if (typeof def === 'boolean') {
        if (text !== 'true' && text !== 'false') fail(`--tidy-option ${key} must be true or false`)
        tidyOptions[key] = text === 'true'
      } else {
        const n = Number(text)
        if (!Number.isFinite(n) || n < 0) fail(`--tidy-option ${key} must be a number of 0 or more`)
        tidyOptions[key] = n
      }
    } else if (VALUE_FLAGS.has(a)) {
      if (i + 1 >= argv.length) fail(`${a} needs a value`)
      values.set(a === '-o' ? '--out' : a, argv[++i])
    } else if (a.startsWith('-')) {
      flags.add(a)
    } else {
      positional.push(a)
    }
  }
  const known = new Set([
    '--in-place', '--report', '--json', '--resize-subsystems', '--hide-block-names', '--no-clean-up',
    '--no-roles', '--no-port-name-clearance', '--no-mirror', '--tidy-labels',
  ])
  for (const f of flags) if (!known.has(f)) fail(`unknown option ${f}`)
  if (positional.length !== 1) fail(positional.length ? 'give one model file only' : 'give a model file')

  const scope = (values.get('--scope') ?? 'model') as TuneScope
  if (!['model', 'subsystem', 'sheet'].includes(scope)) fail(`--scope must be model, subsystem or sheet`)
  const portLabels = (values.get('--port-labels') ?? 'asis') as PortLabelChoice
  if (!['show', 'hide', 'asis'].includes(portLabels)) fail(`--port-labels must be show, hide or asis`)
  const spacingText = values.get('--max-port-spacing')
  const maxPortSpacing = spacingText === undefined ? DEFAULT_TUNE_OPTIONS.maxPortSpacing : Number(spacingText)
  if (!Number.isFinite(maxPortSpacing) || maxPortSpacing <= 0) fail('--max-port-spacing must be a positive number')
  const engine = (values.get('--engine') ?? 'elk') as LayoutEngine
  if (!['classic', 'elk'].includes(engine)) fail('--engine must be classic or elk')
  if (engine !== 'elk' && Object.keys(elkOptions).length > 0) fail('--elk-option needs --engine elk')
  const elkOrder = values.get('--elk-order') as 'flow' | 'list' | undefined
  if (elkOrder !== undefined && !['flow', 'list'].includes(elkOrder)) fail('--elk-order must be flow or list')
  if (elkOrder !== undefined && engine !== 'elk') fail('--elk-order needs --engine elk')
  if (flags.has('--no-roles') && engine !== 'elk') fail('--no-roles needs --engine elk')
  if (flags.has('--no-port-name-clearance') && engine !== 'elk') fail('--no-port-name-clearance needs --engine elk')
  if (flags.has('--no-mirror') && engine !== 'elk') fail('--no-mirror needs --engine elk')
  if (flags.has('--tidy-labels') && (engine !== 'elk' || flags.has('--no-clean-up'))) fail('--tidy-labels needs --engine elk and the clean-up')
  if (Object.keys(tidyOptions).length > 0 && !flags.has('--tidy-labels')) fail('--tidy-option needs --tidy-labels')

  return {
    model: positional[0],
    out: values.get('--out'),
    inPlace: flags.has('--in-place'),
    report: flags.has('--report'),
    json: flags.has('--json'),
    sheet: values.get('--sheet'),
    options: {
      ...DEFAULT_TUNE_OPTIONS,
      cleanUpLayout: !flags.has('--no-clean-up'),
      resizeSubsystems: flags.has('--resize-subsystems'),
      maxPortSpacing,
      subsystemPortLabels: portLabels,
      hideBlockNames: flags.has('--hide-block-names'),
      scope,
      engine,
      ...(Object.keys(elkOptions).length > 0 ? { elkOptions } : {}),
      ...(elkOrder ? { elkOrder } : {}),
      useSubsystemFunctions: !flags.has('--no-roles'),
      mirrorReturnPath: !flags.has('--no-mirror'),
      ...(flags.has('--no-port-name-clearance') ? { portNameClearance: false } : {}),
      ...(flags.has('--tidy-labels') ? { tidySignalLabels: true } : {}),
      ...(Object.keys(tidyOptions).length > 0 ? { tidyLabelOptions: tidyOptions as Partial<TidyLabelOptions> } : {}),
    },
  }
}

interface LoadedModel {
  /** The parsed file; `data.sheets` (or `sheets`) is replaced on write. */
  raw: any
  /** The object that holds `sheets`: `raw.data` for a wrapped file, else `raw`. */
  holder: any
  sheets: Sheet[]
  trailingNewline: boolean
}

function loadModel(filePath: string): LoadedModel {
  const text = fs.readFileSync(filePath, 'utf8')
  const raw = JSON.parse(text)
  const holder = raw?.data && Array.isArray(raw.data.sheets) ? raw.data : raw
  if (!holder || !Array.isArray(holder.sheets)) throw new Error(`No sheets[] in ${filePath}`)
  return { raw, holder, sheets: holder.sheets, trailingNewline: text.endsWith('\n') }
}

/** Find the active sheet by id, by name, or by its breadcrumb path. */
function resolveSheet(sheets: Sheet[], wanted: string | undefined): string | null {
  const all = buildFullPlan(sheets).sheets
  if (wanted === undefined) return sheets[0]?.id ?? null
  const matches = [
    all.filter(s => s.id === wanted),
    all.filter(s => s.path.join('/') === wanted),
    all.filter(s => s.name === wanted),
  ].find(list => list.length > 0) ?? []
  if (matches.length === 0) fail(`no sheet has the id, path or name "${wanted}"`, false)
  if (matches.length > 1) {
    fail(`more than one sheet matches "${wanted}": ${matches.map(s => s.path.join('/')).join(', ')}. Use the path.`, false)
  }
  return matches[0].id
}

/** The one place that runs the layout engine (`options.engine`). */
function applyLayout(
  sheets: Sheet[],
  activeSheetId: string | null,
  options: TuneLayoutOptions,
): Promise<TuneLayoutResult> {
  return tuneModelLayout(sheets, activeSheetId, options)
}

// --- Report ---------------------------------------------------------------

const COLUMNS: Array<{ key: keyof SheetLayoutMetrics; title: string }> = [
  { key: 'wires', title: 'Wires' },
  { key: 'throughBlock', title: 'Thru' },
  { key: 'overlaps', title: 'Ovlp' },
  { key: 'crossings', title: 'Cross' },
  { key: 'blockOverlaps', title: 'BlkOvl' },
  { key: 'bends', title: 'Bends' },
  { key: 'straight', title: 'Strt' },
  { key: 'backward', title: 'Back' },
  { key: 'backwardLength', title: 'BackLen' },
  { key: 'wireLength', title: 'Length' },
  { key: 'diagonalSegments', title: 'Diag' },
  { key: 'portDirection', title: 'PortDir' },
  { key: 'microJogs', title: 'Jogs' },
  { key: 'width', title: 'Width' },
  { key: 'height', title: 'Height' },
  { key: 'aspect', title: 'Aspect' },
]

function printTable(rows: Array<{ path: string; before: SheetLayoutMetrics; after: SheetLayoutMetrics }>) {
  const nameWidth = Math.max(5, ...rows.map(r => r.path.length))
  const widths = COLUMNS.map(c => Math.max(c.title.length, 7))
  const line = (name: string, state: string, cells: string[]) =>
    `${name.padEnd(nameWidth)}  ${state.padEnd(6)}` + cells.map((c, i) => c.padStart(widths[i] + 1)).join('')
  const cells = (m: SheetLayoutMetrics) => COLUMNS.map(c => String(m[c.key]))

  console.log(line('Sheet', 'State', COLUMNS.map(c => c.title)))
  console.log('-'.repeat(nameWidth + 8 + widths.reduce((a, b) => a + b + 1, 0)))
  const totals = { before: {} as Record<string, number>, after: {} as Record<string, number> }
  const additive = COLUMNS.filter(c => !['width', 'height', 'aspect'].includes(c.key))
  for (const r of rows) {
    console.log(line(r.path, 'before', cells(r.before)))
    console.log(line('', 'after', cells(r.after)))
    for (const c of additive) {
      totals.before[c.key] = (totals.before[c.key] ?? 0) + (r.before[c.key] as number)
      totals.after[c.key] = (totals.after[c.key] ?? 0) + (r.after[c.key] as number)
    }
  }
  const totalCells = (t: Record<string, number>) => COLUMNS.map(c => (c.key in t ? String(t[c.key]) : ''))
  console.log('-'.repeat(nameWidth + 8 + widths.reduce((a, b) => a + b + 1, 0)))
  console.log(line(`Total (${rows.length} sheet${rows.length === 1 ? '' : 's'})`, 'before', totalCells(totals.before)))
  console.log(line('', 'after', totalCells(totals.after)))
  console.log(`
Thru: wires through a block. Ovlp: overlaps between collinear segments of different nets.
Cross: crossings between different nets. BlkOvl: pairs of blocks that overlap. Strt: wires with no bend.
Back: wires whose target is behind their source port (left of an output on the right, or right of an output on the left).
Diag: wire segments that are not horizontal or vertical.
PortDir: wires that leave or enter a port against its direction (back through their own block).
Jogs: wire segments shorter than 2 px with a bend at an end (a small visible step).
Lengths and sizes are in px.`)
}

/** The edits of the tidy of signal labels: counts by kind, and with `list` each edit. */
function printTidy(result: TuneLayoutResult, list: boolean) {
  const t = result.labelTidy
  if (!t) return
  const c = t.counts
  console.log(`\nTidy signal labels: ${t.edits.length} edit${t.edits.length === 1 ? '' : 's'}`
    + ` (wire to label pair ${c['wire-to-pair']}, label pair to wire ${c['pair-to-wire']}, source split ${c['split-source']}),`
    + ` ${t.evaluations} trial layouts, ${t.elapsedMsec} ms`)
  const refused = Object.entries(t.refused).map(([k, v]) => `${k} ${v}`).join(', ')
  if (refused) console.log(`  Candidates kept as wires by a guard: ${refused}`)
  if (t.notSettled.length) console.log(`  Not settled (a second run can make more edits): ${t.notSettled.join(', ')}`)
  console.log(`  Labels that are not at the end of their wire: ${t.endpointFaults.length}`)
  for (const f of t.endpointFaults) console.log(`    ${f.sheetPath}: ${f.kind} ${f.signalName} (${f.blockId}), wire ${f.wireId}`)
  if (!list) return
  for (const e of t.edits) console.log(`  ${e.kind.padEnd(12)} ${e.sheetPath}  ${e.signalName}: ${e.reason}`)
}

// --- Main -----------------------------------------------------------------

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (!fs.existsSync(args.model)) fail(`model not found: ${args.model}`, false)

  const modelPath = path.resolve(args.model)
  let outPath: string | undefined
  if (!args.report) {
    if (args.out && args.inPlace) fail('give -o or --in-place, not both')
    if (!args.out && !args.inPlace) fail('give -o <out.json>, --in-place or --report')
    outPath = args.inPlace ? modelPath : path.resolve(args.out!)
  } else if (args.out || args.inPlace) {
    fail('--report writes no file; do not give -o or --in-place with it')
  }

  const loaded = loadModel(modelPath)
  const activeSheetId = resolveSheet(loaded.sheets, args.sheet)
  const inScope = new Set(buildExportPlan(loaded.sheets, args.options.scope, activeSheetId).sheets.map(s => s.id))

  const started = Date.now()
  const result = await applyLayout(loaded.sheets, activeSheetId, args.options)
  const elapsedMs = Date.now() - started

  if (args.report) {
    const before = scoreSheetTree(loaded.sheets)
    const after = scoreSheetTree(result.sheets)
    const rows = before
      .map((b, i) => ({ id: b.id, name: b.name, path: b.path.join('/'), before: b.metrics, after: after[i].metrics }))
      .filter(r => inScope.has(r.id))
    if (args.json) {
      console.log(JSON.stringify({
        model: modelPath,
        options: args.options,
        activeSheetId,
        layoutTimeMsec: elapsedMs,
        summary: result.summary,
        ...(result.labelTidy ? { labelTidy: result.labelTidy } : {}),
        sheets: rows,
      }, null, 2))
    } else {
      console.log(`Model: ${modelPath}`)
      console.log(`Scope: ${args.options.scope}${args.options.scope === 'model' ? '' : `, active sheet ${activeSheetId}`}`)
      console.log(`Engine: ${args.options.engine ?? 'elk'} (layout time ${elapsedMs} ms)\n`)
      printTable(rows)
      printTidy(result, true)
    }
    return
  }

  loaded.holder.sheets = result.sheets
  const text = JSON.stringify(loaded.raw, null, 2) + (loaded.trailingNewline ? '\n' : '')
  fs.writeFileSync(outPath!, text)
  const s = result.summary
  if (args.json) {
    console.log(JSON.stringify({ model: modelPath, out: outPath, summary: s, ...(result.labelTidy ? { labelTidy: result.labelTidy } : {}) }, null, 2))
  } else {
    console.log(`Wrote ${outPath}`)
    console.log(`  sheets changed: ${s.sheetsAffected}  blocks moved: ${s.blocksMoved}  wires routed: ${s.wiresRouted}`
      + `  blocks resized: ${s.blocksResized}  blocks flipped: ${s.blocksFlipped}  names hidden: ${s.namesHidden}  port labels changed: ${s.portLabelsChanged}`)
    printTidy(result, false)
  }
}

if (require.main === module) {
  main().catch(e => {
    console.error(`Error: ${e instanceof Error ? e.message : String(e)}`)
    process.exit(1)
  })
}
