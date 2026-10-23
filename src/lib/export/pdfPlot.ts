// lib/export/pdfPlot.ts
//
// A Signal Display plot drawn into a PDF page as vector graphics: title,
// axes with nice ticks, a dashed grid, one line per element, and a legend
// for vectors. Ranges, ticks and labels come from lib/plots/signalPlot, so
// the printed plot matches the screen. Long series are min/max decimated to
// about one point per printed point of width, keeping every peak.

import { PDFFont, PDFPage, degrees, rgb } from 'pdf-lib'
import {
  PlotColumns,
  decimateMinMax,
  formatTick,
  niceStep,
  niceTicks,
  plotColor,
  plotYRange,
} from '@/lib/plots/signalPlot'

export interface PdfPlot {
  blockId: string
  title: string
  columns: PlotColumns
}

export interface PdfPlotFonts {
  regular: PDFFont
  bold: PDFFont
}

/** A rectangle in PDF points, with y the bottom edge (PDF y grows upward). */
export interface PdfRect {
  x: number
  y: number
  width: number
  height: number
}

const BLACK = rgb(0.1, 0.1, 0.1)
const AXIS = rgb(0.42, 0.45, 0.5)
const GRID = rgb(0.85, 0.86, 0.88)

const hexToRgb = (hex: string) => {
  const h = hex.replace('#', '')
  return rgb(parseInt(h.slice(0, 2), 16) / 255, parseInt(h.slice(2, 4), 16) / 255, parseInt(h.slice(4, 6), 16) / 255)
}

const TITLE_SIZE = 9
const TICK_SIZE = 6.5
const LABEL_SIZE = 7
const LEGEND_SIZE = 6.5

/** Legend rows for a vector plot: entries laid out left to right, wrapping. */
function legendRows(labels: string[], font: PDFFont, width: number): Array<Array<{ label: string; index: number; w: number }>> {
  const rows: Array<Array<{ label: string; index: number; w: number }>> = [[]]
  let used = 0
  labels.forEach((label, index) => {
    const w = 10 + font.widthOfTextAtSize(label, LEGEND_SIZE) + 10
    if (used + w > width && rows[rows.length - 1]!.length > 0) {
      rows.push([])
      used = 0
    }
    rows[rows.length - 1]!.push({ label, index, w })
    used += w
  })
  return rows
}

/** Draw one plot to fill `rect`. */
export function drawPdfPlot(page: PDFPage, rect: PdfRect, plot: PdfPlot, fonts: PdfPlotFonts): void {
  const { columns } = plot
  const top = rect.y + rect.height

  // Title
  page.drawText(plot.title, { x: rect.x, y: top - TITLE_SIZE, size: TITLE_SIZE, font: fonts.bold, color: BLACK })
  let areaTop = top - TITLE_SIZE - 6

  // Legend (vectors only), at the bottom
  const legend = columns.isVector ? legendRows(columns.labels, fonts.regular, rect.width) : []
  const legendHeight = legend.length * (LEGEND_SIZE + 4)
  let areaBottom = rect.y + legendHeight
  legend.forEach((row, r) => {
    let x = rect.x
    const y = rect.y + legendHeight - (r + 1) * (LEGEND_SIZE + 4) + 2
    for (const entry of row) {
      page.drawLine({
        start: { x, y: y + LEGEND_SIZE / 2 - 1 },
        end: { x: x + 8, y: y + LEGEND_SIZE / 2 - 1 },
        thickness: 1.5,
        color: hexToRgb(plotColor(entry.index)),
      })
      page.drawText(entry.label, { x: x + 10, y, size: LEGEND_SIZE, font: fonts.regular, color: BLACK })
      x += entry.w
    }
  })

  // Axes area: room for the x tick labels and title below, y tick labels and title to the left
  const n = columns.times.length
  const tMin = n > 0 ? columns.times[0]! : 0
  const tMax = n > 1 ? columns.times[n - 1]! : tMin + 1
  const [yMin, yMax] = plotYRange(columns.series)
  areaBottom += TICK_SIZE + LABEL_SIZE + 8
  const yTarget = Math.max(3, Math.round((areaTop - areaBottom) / 28))
  const yTicks = niceTicks(yMin, yMax, yTarget)
  const yStep = niceStep(yMin, yMax, yTarget)
  const yLabels = yTicks.map(v => formatTick(v, yStep))
  const yLabelWidth = Math.max(0, ...yLabels.map(l => fonts.regular.widthOfTextAtSize(l, TICK_SIZE)))
  const left = rect.x + LABEL_SIZE + 4 + yLabelWidth + 3
  const right = rect.x + rect.width - 4
  areaTop -= 2
  const plotW = Math.max(10, right - left)
  const plotH = Math.max(10, areaTop - areaBottom)
  const px = (t: number) => left + ((t - tMin) / (tMax - tMin || 1)) * plotW
  const py = (v: number) => areaBottom + ((v - yMin) / (yMax - yMin || 1)) * plotH

  // Grid and tick labels
  const xTarget = Math.max(3, Math.round(plotW / 45))
  const xTicks = niceTicks(tMin, tMax, xTarget)
  const xStep = niceStep(tMin, tMax, xTarget)
  for (const t of xTicks) {
    const x = px(t)
    page.drawLine({ start: { x, y: areaBottom }, end: { x, y: areaBottom + plotH }, thickness: 0.4, color: GRID, dashArray: [2, 2] })
    const label = formatTick(t, xStep)
    const w = fonts.regular.widthOfTextAtSize(label, TICK_SIZE)
    page.drawText(label, { x: x - w / 2, y: areaBottom - TICK_SIZE - 2, size: TICK_SIZE, font: fonts.regular, color: AXIS })
  }
  yTicks.forEach((v, i) => {
    const y = py(v)
    page.drawLine({ start: { x: left, y }, end: { x: left + plotW, y }, thickness: 0.4, color: GRID, dashArray: [2, 2] })
    const label = yLabels[i]!
    const w = fonts.regular.widthOfTextAtSize(label, TICK_SIZE)
    page.drawText(label, { x: left - 3 - w, y: y - TICK_SIZE / 3, size: TICK_SIZE, font: fonts.regular, color: AXIS })
  })
  // Axis titles
  const xTitle = 'Time (s)'
  const xTitleW = fonts.regular.widthOfTextAtSize(xTitle, LABEL_SIZE)
  page.drawText(xTitle, { x: left + (plotW - xTitleW) / 2, y: areaBottom - TICK_SIZE - LABEL_SIZE - 5, size: LABEL_SIZE, font: fonts.regular, color: AXIS })
  const yTitle = 'Value'
  const yTitleW = fonts.regular.widthOfTextAtSize(yTitle, LABEL_SIZE)
  page.drawText(yTitle, { x: rect.x + LABEL_SIZE, y: areaBottom + (plotH - yTitleW) / 2, size: LABEL_SIZE, font: fonts.regular, color: AXIS, rotate: degrees(90) })
  // Frame
  page.drawRectangle({ x: left, y: areaBottom, width: plotW, height: plotH, borderColor: AXIS, borderWidth: 0.5 })

  // Lines: decimated to about one point per printed point, split at gaps (NaN)
  const buckets = Math.max(50, Math.round(plotW))
  columns.series.forEach((ys, k) => {
    const d = decimateMinMax(columns.times, ys, buckets)
    let path = ''
    let pen = false
    for (let i = 0; i < d.t.length; i++) {
      const v = d.y[i]!
      if (!Number.isFinite(v)) {
        pen = false
        continue
      }
      // drawSvgPath's origin is the top-left of the drawing, y down
      const sx = (px(d.t[i]!) - left).toFixed(2)
      const sy = (areaBottom + plotH - py(v)).toFixed(2)
      path += `${pen ? 'L' : 'M'}${sx} ${sy} `
      pen = true
    }
    if (path) {
      page.drawSvgPath(path, { x: left, y: areaBottom + plotH, borderColor: hexToRgb(plotColor(k)), borderWidth: 0.8 })
    }
  })
}

/** Minimum height of a printed plot (1.5 in). */
export const MIN_PDF_PLOT_HEIGHT = 108
const PLOT_GAP = 12

/** How many plots fit in a column of this height. */
export function plotsPerColumn(height: number): number {
  return Math.max(1, Math.floor((height + PLOT_GAP) / (MIN_PDF_PLOT_HEIGHT + PLOT_GAP)))
}

/** Stack plots top to bottom in a column, sharing its height. */
export function drawPdfPlotColumn(page: PDFPage, column: PdfRect, plots: PdfPlot[], fonts: PdfPlotFonts): void {
  if (plots.length === 0) return
  const each = (column.height - PLOT_GAP * (plots.length - 1)) / plots.length
  plots.forEach((plot, i) => {
    const y = column.y + column.height - (i + 1) * each - i * PLOT_GAP
    drawPdfPlot(page, { x: column.x, y, width: column.width, height: each }, plot, fonts)
  })
}
