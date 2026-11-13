#!/usr/bin/env npx tsx
/**
 * Write a PDF of an Obliq model JSON file: the pages of the editor's
 * Export as PDF, from the same render path (src/lib/export/modelPdf.ts).
 *
 * Usage:
 *   npm run obliq:pdf -- <model.json> [-o <out.pdf>] [options]
 *   npm run obliq:pdf -- <model.json> <model.json> ... [-o <dir>] [options]
 *
 * Accepts the same files as obliq-cgen.ts and obliq-layout.ts:
 *   { "name": "...", "data": { "sheets": [...], ... } }   // as stored in the model store
 *   { "sheets": [...], ... }                              // bare ModelData
 * Model references resolve as for obliq:test and obliq:cgen: the model files
 * beside the model file, by name, then the store. A model reference prints as
 * its block, as in the editor; type propagation looks inside the referenced
 * model, so its wires get their vector and matrix lines.
 *
 * The command prints diagrams only: the editor's plot results come from a
 * simulation run in the browser (WebAssembly), which the command does not do.
 */

import * as fs from 'fs'
import * as path from 'path'
import type { PrintScope } from '../src/lib/export/sheetTree'
import type { PdfScaling } from '../src/lib/export/pdfRenderer'
import type { PageOrientation } from '../src/lib/export/pageSizes'
import {
  DEFAULT_PDF_COMMAND_OPTIONS,
  PAGE_SIZE_IDS,
  PdfExportError,
  defaultPdfPath,
  resolvePrintDate,
  writeModelPdf,
  type PdfCommandOptions,
} from './lib/pdfExport'

function usage(code = 1): never {
  const out = code === 0 ? console.log : console.error
  out(`Usage: npm run obliq:pdf -- <model.json> [more models] [-o <out>] [options]

Write a PDF of each model file: the pages of Export as PDF in the editor.

Output:
  -o, --out <path>          With one model: the PDF file to write. With more
                            than one model: an existing folder. The PDF of each
                            model goes in it, with the model's file name.
                            Default: the model's path with .pdf in place of .json
  --date <ISO 8601>         Fixed print date for the footer and the PDF metadata,
                            for example 2026-11-12 or 2026-11-12T09:30:00Z. The
                            footer prints it in UTC. Two runs with the same date
                            give the same bytes. Default: SOURCE_DATE_EPOCH if
                            it is set, else the current time

Page (the defaults are the defaults of the editor's dialog):
  --page-size <id>          Default letter. One of:
                            ${PAGE_SIZE_IDS.join(', ')}
  --orientation <landscape|portrait>
                            Default landscape
  --scaling <100|50|fit>    Default 100. fit scales each sheet to the print area
  --fit-large-sheets        Scale only the sheets that do not fit the print area.
                            Has no effect with --scaling fit

Content:
  --scope <model|subsystem|sheet>
                            Sheets to print (default: model)
  --sheet <name|id|path>    The active sheet for --scope subsystem|sheet
                            (default: the first top-level sheet). A path is
                            the breadcrumb joined with "/", for example
                            Main/FlightController/FlightController
  --summaries               Add a summary page before the sheets of each
                            subsystem: ports, parameters and sheets
  --truncate-block-names    Shorten long block names with an ellipsis
  --truncate-in-block-text  Shorten port names and in-block expressions with an
                            ellipsis
  -h, --help                Show this message

Exit code: 0 all PDFs written; 1 a usage error, a model file that cannot be
read, an unknown sheet or page size, or a model reference that cannot be resolved.`)
  process.exit(code)
}

function fail(message: string, showUsage = true): never {
  console.error(`Error: ${message}`)
  if (showUsage) {
    console.error('')
    usage()
  }
  process.exit(1)
}

interface CliArgs {
  models: string[]
  out?: string
  date?: string
  options: PdfCommandOptions
}

const VALUE_FLAGS = new Set(['-o', '--out', '--date', '--page-size', '--orientation', '--scaling', '--scope', '--sheet'])
const BOOLEAN_FLAGS = new Set(['--fit-large-sheets', '--summaries', '--truncate-block-names', '--truncate-in-block-text'])

export function parseArgs(argv: string[]): CliArgs {
  const values = new Map<string, string>()
  const flags = new Set<string>()
  const models: string[] = []
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!
    if (a === '-h' || a === '--help') usage(0)
    if (VALUE_FLAGS.has(a)) {
      if (i + 1 >= argv.length) fail(`${a} needs a value`)
      values.set(a === '-o' ? '--out' : a, argv[++i]!)
    } else if (BOOLEAN_FLAGS.has(a)) {
      flags.add(a)
    } else if (a.startsWith('-')) {
      fail(`unknown option ${a}`)
    } else {
      models.push(a)
    }
  }
  if (models.length === 0) fail('give a model file')

  const orientation = (values.get('--orientation') ?? DEFAULT_PDF_COMMAND_OPTIONS.orientation) as PageOrientation
  if (!['landscape', 'portrait'].includes(orientation)) fail('--orientation must be landscape or portrait')
  const scaling = (values.get('--scaling') ?? DEFAULT_PDF_COMMAND_OPTIONS.scaling).replace(/%$/, '') as PdfScaling
  if (!['100', '50', 'fit'].includes(scaling)) fail('--scaling must be 100, 50 or fit')
  const scope = (values.get('--scope') ?? DEFAULT_PDF_COMMAND_OPTIONS.scope) as PrintScope
  if (!['model', 'subsystem', 'sheet'].includes(scope)) fail('--scope must be model, subsystem or sheet')
  const pageSizeId = (values.get('--page-size') ?? DEFAULT_PDF_COMMAND_OPTIONS.pageSizeId).toLowerCase()
  if (!PAGE_SIZE_IDS.includes(pageSizeId)) fail(`unknown page size "${pageSizeId}". Use one of: ${PAGE_SIZE_IDS.join(', ')}`, false)

  return {
    models,
    out: values.get('--out'),
    date: values.get('--date'),
    options: {
      pageSizeId,
      orientation,
      scaling,
      fitLargeSheets: flags.has('--fit-large-sheets'),
      scope,
      sheet: values.get('--sheet'),
      includeSubsystemSummaries: flags.has('--summaries'),
      truncateBlockNames: flags.has('--truncate-block-names'),
      truncateInBlockText: flags.has('--truncate-in-block-text'),
    },
  }
}

/** The output path of each model, from -o (see the usage text). */
export function outputPaths(models: string[], out: string | undefined): string[] {
  if (out === undefined) return models.map(defaultPdfPath)
  const isDir = fs.existsSync(out) && fs.statSync(out).isDirectory()
  if (models.length > 1) {
    if (!isDir) {
      throw new PdfExportError(`with more than one model, -o must name an existing folder (${out} is not a folder)`)
    }
    const targets = models.map(m => path.join(out, path.basename(defaultPdfPath(m))))
    const dup = targets.find((t, i) => targets.indexOf(t) !== i)
    if (dup) throw new PdfExportError(`two models give the same output file ${dup}; run them separately`)
    return targets
  }
  return [isDir ? path.join(out, path.basename(defaultPdfPath(models[0]!))) : out]
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const date = resolvePrintDate(args.date)
  const outs = outputPaths(args.models, args.out)
  for (let i = 0; i < args.models.length; i++) {
    const model = args.models[i]!
    const result = await writeModelPdf(model, outs[i], args.options, date)
    const kib = (result.bytes.length / 1024).toFixed(0)
    console.log(`Wrote ${result.out} (${result.pageCount} page${result.pageCount === 1 ? '' : 's'}, ${kib} KiB)`)
  }
}

if (require.main === module) {
  main().catch(e => {
    console.error(`Error: ${e instanceof Error ? e.message : String(e)}`)
    process.exit(1)
  })
}
