// lib/export/modelPdf.ts
//
// The one path from a model's sheets to PDF bytes, shared by the editor's
// Export as PDF (src/app/models/[id]/page.tsx) and the command line
// (scripts/obliq-pdf.ts, through scripts/lib/pdfExport.ts). It builds the
// render context the same way for both callers: wire types from type
// propagation over the whole model, and Signal Display plots from a run when
// the caller has one. Thus the two cannot print different pages.
//
// Model references: the plan prints a model reference as its block only (the
// block has no sheets of its own). Type propagation looks inside the
// referenced model through the copies published with publishReferencedModels
// (src/lib/referencedModels.ts), so a caller must publish them first.

import { buildExportPlan, type ExportPlan } from './sheetTree'
import { renderModelToPdf, type PdfExportOptions, type PdfRenderContext } from './pdfRenderer'
import type { PdfPlot } from './pdfPlot'
import { propagateSignalTypesMultiSheet } from '@/lib/signalTypePropagation'
import { resultsToColumns } from '@/lib/plots/signalPlot'
import type { SimulationResults } from '@/lib/simulationTypes'

export interface ModelPdfSheet {
  id: string
  name: string
  blocks: any[]
  connections: any[]
}

export interface ModelPdfRequest {
  /** All top-level sheets of the model, not only the sheets in scope. */
  sheets: ModelPdfSheet[]
  modelName: string
  options: PdfExportOptions
  printedAt: Date
  /** See PdfRenderContext.footerDate. */
  footerDate?: string
  rasterizeGlyph?: PdfRenderContext['rasterizeGlyph']
  /** Results of the last run, by sheet id (for options.includePlotResults). */
  simulationResults?: Map<string, Pick<SimulationResults, 'timePoints' | 'signalData'>>
}

/** The pages of an export: the sheets in the scope of `activeSheetId`. */
export function planModelPdf(
  sheets: ModelPdfSheet[],
  options: Pick<PdfExportOptions, 'scope'>,
  activeSheetId: string | null,
): ExportPlan {
  return buildExportPlan(sheets, options.scope, activeSheetId)
}

/** Signal Display plots of the sheets in `plan`, from a run's results. */
export function pdfPlotResults(
  plan: ExportPlan,
  results: ModelPdfRequest['simulationResults'],
): Map<string, PdfPlot[]> {
  const plotResults = new Map<string, PdfPlot[]>()
  if (!results) return plotResults
  for (const sheet of plan.sheets) {
    const sheetResults = results.get(sheet.id)
    if (!sheetResults) continue
    const plots: PdfPlot[] = []
    for (const block of sheet.blocks) {
      if (block.type !== 'signal_display') continue
      const values = sheetResults.signalData.get(block.id)
      if (!values || values.length === 0) continue
      plots.push({
        blockId: block.id,
        title: block.name,
        columns: resultsToColumns(sheetResults.timePoints, values as any, block.parameters?.maxSamples || 1000),
      })
    }
    if (plots.length > 0) plotResults.set(sheet.id, plots)
  }
  return plotResults
}

/** Render the pages of `plan` (from planModelPdf) to PDF bytes. */
export async function renderModelPdf(plan: ExportPlan, req: ModelPdfRequest): Promise<Uint8Array> {
  // Type propagation runs on the whole model, not the scoped plan: an
  // in-scope wire can be typed by a source that lives outside the scope.
  const typeResult = propagateSignalTypesMultiSheet(
    req.sheets.map(s => ({ blocks: s.blocks, connections: s.connections }))
  )
  const plotResults = req.options.includePlotResults
    ? pdfPlotResults(plan, req.simulationResults)
    : new Map<string, PdfPlot[]>()

  return renderModelToPdf(plan, req.options, {
    modelName: req.modelName,
    printedAt: req.printedAt,
    footerDate: req.footerDate,
    rasterizeGlyph: req.rasterizeGlyph,
    signalTypes: typeResult.signalTypes,
    plotResults,
  })
}
