// scripts/lib/pdfExport.ts
//
// The model-file side of `npm run obliq:pdf` (scripts/obliq-pdf.ts): load a
// model file, find the models that its model references point at, and give
// the sheets to the render path that the editor uses (src/lib/export/modelPdf.ts).
// The FPV builder (scripts/build-fpv-reference-model.ts) also calls it, to
// write the PDFs beside the reference models.

import * as fs from 'fs'
import * as path from 'path'
import { parseModelDocument } from '../../src/lib/server/storage/ModelRepository'
import { modelFileLoader } from '../../src/lib/testing/resolveTestTargets'
import type { ModelLoader } from '../../src/lib/modelReferences'
import {
  collectModelRefs,
  modelRefKey,
  publishReferencedModels,
  type ReferencedModelEntry,
} from '../../src/lib/referencedModels'
import { buildFullPlan, type ExportPlan, type PrintScope } from '../../src/lib/export/sheetTree'
import { DEFAULT_PDF_OPTIONS, type PdfExportOptions, type PdfScaling } from '../../src/lib/export/pdfRenderer'
import { PAGE_SIZES, type PageOrientation } from '../../src/lib/export/pageSizes'
import { planModelPdf, renderModelPdf, type ModelPdfSheet } from '../../src/lib/export/modelPdf'

/** A problem with the input: the command prints the message and exits 1. */
export class PdfExportError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PdfExportError'
  }
}

export interface LoadedPdfModel {
  file: string
  /** The `name` of a `{name, data}` file, else the file name without `.json`. */
  name: string
  sheets: ModelPdfSheet[]
  /** The referenced models, by modelRefKey, as publishReferencedModels takes them. */
  referenced: Record<string, ReferencedModelEntry>
}

/** The output path when no -o is given: the model path with `.pdf` in place of `.json`. */
export function defaultPdfPath(modelFile: string): string {
  return /\.json$/i.test(modelFile) ? modelFile.replace(/\.json$/i, '.pdf') : `${modelFile}.pdf`
}

/**
 * Load the referenced models of `sheets` (and the models that they reference)
 * with `load`. An unresolved reference is an error, because without the
 * model the wires from the reference block have no type.
 */
export function loadReferencedModels(sheets: any[], load: ModelLoader): Record<string, ReferencedModelEntry> {
  const entries: Record<string, ReferencedModelEntry> = {}
  const queue = collectModelRefs(sheets)
  while (queue.length > 0) {
    const ref = queue.shift()!
    const key = modelRefKey(ref)
    if (entries[key]) continue
    let loaded
    try {
      loaded = load(ref)
    } catch (e) {
      const why = e instanceof Error ? e.message : String(e)
      throw new PdfExportError(`cannot resolve the model reference to "${ref.name ?? ref.modelId}": ${why}`)
    }
    const data = { sheets: loaded.data.sheets ?? [], parameters: loaded.data.parameters, dataStores: loaded.data.dataStores }
    entries[key] = {
      key, modelId: ref.modelId, version: ref.version, status: 'ok', name: loaded.name, data, hash: loaded.hash,
    }
    queue.push(...collectModelRefs(data.sheets))
  }
  return entries
}

/**
 * Read a model file: a `{name, data}` file from the model store, or a bare
 * model with `sheets`. Model references resolve as for obliq:test and
 * obliq:cgen: the model files beside the file (by name), then the store.
 */
export function loadModelForPdf(file: string, opts: { home?: string } = {}): LoadedPdfModel {
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) throw new PdfExportError(`model file not found: ${file}`)
  let doc
  try {
    doc = parseModelDocument(fs.readFileSync(file, 'utf8'), file)
  } catch (e) {
    throw new PdfExportError(e instanceof Error ? e.message : String(e))
  }
  const sheets = (doc.data as any).sheets as ModelPdfSheet[]
  if (!Array.isArray(sheets) || sheets.length === 0) throw new PdfExportError(`${file} has no sheets`)
  const name = doc.name || path.basename(file).replace(/\.json$/i, '')
  const referenced = loadReferencedModels(sheets, modelFileLoader(file, opts.home))
  return { file, name, sheets, referenced }
}

/**
 * The id of the sheet that `wanted` names: a sheet id, a breadcrumb path
 * joined with "/", or a sheet name (as obliq:layout --sheet). Without
 * `wanted`: the first top-level sheet.
 */
export function findSheetId(sheets: ModelPdfSheet[], wanted: string | undefined): string | null {
  if (wanted === undefined) return sheets[0]?.id ?? null
  const all = buildFullPlan(sheets).sheets
  const matches = [
    all.filter(s => s.id === wanted),
    all.filter(s => s.path.join('/') === wanted),
    all.filter(s => s.name === wanted),
  ].find(list => list.length > 0) ?? []
  if (matches.length === 0) throw new PdfExportError(`no sheet has the id, path or name "${wanted}"`)
  if (matches.length > 1) {
    throw new PdfExportError(`more than one sheet matches "${wanted}": ${matches.map(s => s.path.join('/')).join(', ')}. Use the path.`)
  }
  return matches[0]!.id
}

export interface PrintDate {
  printedAt: Date
  /** Fixed footer text, only for a fixed date (see PdfRenderContext.footerDate). */
  footerDate?: string
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** "Nov 12, 2026, 00:00 UTC": the same text on each computer, in each locale. */
export function formatFixedFooterDate(d: Date): string {
  const two = (n: number) => String(n).padStart(2, '0')
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}, ${two(d.getUTCHours())}:${two(d.getUTCMinutes())} UTC`
}

/**
 * The print date. `--date` (ISO 8601) comes first, then SOURCE_DATE_EPOCH
 * (seconds since 1970, https://reproducible-builds.org/specs/source-date-epoch/).
 * Both give a fixed date, printed in UTC. Else the current time, printed for
 * the locale, as the editor does.
 */
export function resolvePrintDate(
  dateArg: string | undefined,
  env: Record<string, string | undefined> = process.env,
  now = () => new Date(),
): PrintDate {
  if (dateArg !== undefined) {
    const iso = /^(\d{4}-\d{2}-\d{2})(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?$/.exec(dateArg)
    // A date alone is midnight UTC; a time without a zone is UTC too, not local time
    const d = iso ? new Date(iso[2] && !iso[5] ? `${dateArg}Z` : dateArg) : new Date(NaN)
    if (Number.isNaN(d.getTime())) {
      throw new PdfExportError(`--date must be an ISO 8601 date, for example 2026-11-12 or 2026-11-12T09:30:00Z (got "${dateArg}")`)
    }
    return { printedAt: d, footerDate: formatFixedFooterDate(d) }
  }
  const epoch = env.SOURCE_DATE_EPOCH
  if (epoch !== undefined && epoch.trim() !== '') {
    if (!/^\d+$/.test(epoch.trim())) throw new PdfExportError(`SOURCE_DATE_EPOCH must be a whole number of seconds (got "${epoch}")`)
    const d = new Date(Number(epoch.trim()) * 1000)
    return { printedAt: d, footerDate: formatFixedFooterDate(d) }
  }
  return { printedAt: now() }
}

/** The options of the command; the defaults are the editor's dialog defaults. */
export interface PdfCommandOptions {
  pageSizeId: string
  orientation: PageOrientation
  scaling: PdfScaling
  fitLargeSheets: boolean
  scope: PrintScope
  /** The active sheet for the subsystem and sheet scopes (see findSheetId). */
  sheet?: string
  includeSubsystemSummaries: boolean
  truncateBlockNames: boolean
  truncateInBlockText: boolean
}

export const DEFAULT_PDF_COMMAND_OPTIONS: PdfCommandOptions = {
  pageSizeId: DEFAULT_PDF_OPTIONS.pageSizeId,
  orientation: DEFAULT_PDF_OPTIONS.orientation,
  scaling: DEFAULT_PDF_OPTIONS.scaling,
  fitLargeSheets: DEFAULT_PDF_OPTIONS.fitLargeSheets,
  scope: DEFAULT_PDF_OPTIONS.scope,
  includeSubsystemSummaries: DEFAULT_PDF_OPTIONS.includeSubsystemSummaries,
  truncateBlockNames: DEFAULT_PDF_OPTIONS.allowTruncation.blockNames,
  truncateInBlockText: DEFAULT_PDF_OPTIONS.allowTruncation.inBlockText,
}

export const PAGE_SIZE_IDS = PAGE_SIZES.map(p => p.id)

/** The renderer options for the command options, as the editor's dialog makes them. */
export function toPdfExportOptions(opts: PdfCommandOptions, fileName: string): PdfExportOptions {
  if (!PAGE_SIZE_IDS.includes(opts.pageSizeId)) {
    throw new PdfExportError(`unknown page size "${opts.pageSizeId}". Use one of: ${PAGE_SIZE_IDS.join(', ')}`)
  }
  return {
    fileName,
    orientation: opts.orientation,
    pageSizeId: opts.pageSizeId,
    scaling: opts.scaling,
    fitLargeSheets: opts.fitLargeSheets,
    scope: opts.scope,
    includeSubsystemSummaries: opts.includeSubsystemSummaries,
    // Plots need a run; the command does not simulate (see README, Command-line PDF export)
    includePlotResults: false,
    allowTruncation: { blockNames: opts.truncateBlockNames, inBlockText: opts.truncateInBlockText },
  }
}

export interface ModelPdfResult {
  bytes: Uint8Array
  plan: ExportPlan
  /** Pages in the file (sheets, and summary pages if requested). */
  pageCount: number
}

/**
 * The one call that renders a loaded model: publish its referenced models
 * for type propagation, plan the pages in scope, and render them.
 */
export async function renderLoadedModelPdf(
  model: LoadedPdfModel,
  opts: PdfCommandOptions,
  date: PrintDate,
): Promise<ModelPdfResult> {
  const options = toPdfExportOptions(opts, path.basename(defaultPdfPath(model.file)))
  const activeSheetId = findSheetId(model.sheets, opts.sheet)
  const plan = planModelPdf(model.sheets, options, activeSheetId)
  if (plan.sheets.length === 0) throw new PdfExportError(`${model.file}: the scope contains no sheets`)
  publishReferencedModels(model.referenced)
  try {
    const bytes = await renderModelPdf(plan, {
      sheets: model.sheets,
      modelName: model.name,
      options,
      printedAt: date.printedAt,
      footerDate: date.footerDate,
    })
    const summaries = opts.includeSubsystemSummaries
      ? new Set(plan.sheets.map(s => s.ownerSubsystemId).filter(Boolean)).size
      : 0
    return { bytes, plan, pageCount: plan.sheets.length + summaries }
  } finally {
    publishReferencedModels({})
  }
}

/** Load a model file and render it (loadModelForPdf, then renderLoadedModelPdf). */
export async function modelFileToPdf(
  file: string,
  opts: Partial<PdfCommandOptions> = {},
  date: PrintDate = resolvePrintDate(undefined),
  load: { home?: string } = {},
): Promise<ModelPdfResult> {
  return renderLoadedModelPdf(loadModelForPdf(file, load), { ...DEFAULT_PDF_COMMAND_OPTIONS, ...opts }, date)
}

/** Write a PDF of `file` to `out` (default: defaultPdfPath). Returns the path and the result. */
export async function writeModelPdf(
  file: string,
  out: string | undefined,
  opts: Partial<PdfCommandOptions>,
  date: PrintDate,
  load: { home?: string } = {},
): Promise<ModelPdfResult & { out: string }> {
  const result = await modelFileToPdf(file, opts, date, load)
  const target = out ?? defaultPdfPath(file)
  fs.writeFileSync(target, result.bytes)
  return { ...result, out: target }
}
