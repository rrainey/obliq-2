// Renders a model to a printable PDF.
//
// Draws directly from model data rather than capturing the canvas DOM. That
// keeps output vector (essential at blueprint page sizes, where a 300 DPI
// raster of ARCH E would be ~10800 x 14400 px), and lets sheets that are not
// currently mounted in React Flow be exported.
//
// Block sizes and port offsets come from blockGeometry.ts, the same module the
// canvas renders from, so PDF coordinates cannot drift from what is on screen.

import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from 'pdf-lib'
import type { BlockData } from '@/components/BlockNode'
import type { WireData } from '@/components/Wire'
import { PortCountAdapter } from '@/lib/validation/PortCountAdapter'
import { getBlockWidth, getBlockHeight, portOffsetY } from '@/lib/layout/blockGeometry'
import { getGlyphSpec, needsRaster } from './blockGlyphs'
import { parseType } from '@/lib/typeValidator'
import { resolvePageSize, type PageOrientation } from './pageSizes'
import type { ExportPlan, ExportSheet, ExportSubsystem, PrintScope } from './sheetTree'

export type PdfScaling = '100' | '50' | 'fit'

export interface PdfExportOptions {
  fileName: string
  orientation: PageOrientation
  pageSizeId: string
  scaling: PdfScaling
  /** Shrink oversized sheets to the printable area regardless of `scaling`. */
  fitLargeSheets: boolean
  scope: PrintScope
  includeSubsystemSummaries: boolean
  /**
   * Text the user permits to be shortened with an ellipsis. Both off by
   * default: truncated text cannot be found by a reader searching the PDF.
   */
  allowTruncation: {
    blockNames: boolean
    /** Port-name labels and in-block expression/symbol text. */
    inBlockText: boolean
  }
}

export const DEFAULT_PDF_OPTIONS: Omit<PdfExportOptions, 'fileName'> = {
  orientation: 'landscape',
  pageSizeId: 'letter',
  scaling: '100',
  fitLargeSheets: false,
  scope: 'model',
  includeSubsystemSummaries: false,
  allowTruncation: { blockNames: false, inBlockText: false },
}

export interface PdfRenderContext {
  modelName: string
  printedAt: Date
  /**
   * Wire signal types, keyed by wire id. Wires whose type is known are drawn
   * as bundles: single line for scalars, double for vectors/1D arrays, triple
   * for matrices. Wires without an entry render as scalars. Callers should
   * populate this with propagateSignalTypesMultiSheet's output.
   */
  signalTypes?: Map<string, { type: string }>
  /**
   * Rasterises a string that Helvetica cannot draw, returning PNG bytes plus
   * pixel dimensions. Supplied by the browser (canvas-backed); omit in tests
   * and such glyphs fall back to a WinAnsi transliteration.
   */
  rasterizeGlyph?: (text: string, fontSizePt: number) => Promise<{
    png: Uint8Array
    width: number
    height: number
  } | null>
}

const MARGIN = 36           // 0.5in page margin
/** Footer height with only the single info line present. */
const FOOTER_HEIGHT = 24
const FOOTER_FONT_SIZE = 8
/** Vertical advance between footer lines. */
const FOOTER_LINE_HEIGHT = 11

// Mirrors the canvas palette and stroke weights so print matches screen.
const GRAY = rgb(0.45, 0.45, 0.45)
const BLACK = rgb(0.1, 0.1, 0.1)
/** Medium gray for wires (Tailwind gray-500). */
const WIRE = rgb(0.42, 0.45, 0.50)
/** Block border, matching Tailwind border-gray-400 (#9ca3af). */
const BLOCK_BORDER = rgb(0.61, 0.64, 0.69)
/** Port-name labels, matching the canvas' #374151. */
const LABEL = rgb(0.22, 0.25, 0.32)

const BLOCK_BORDER_WIDTH = 2   // Tailwind border-2
const BLOCK_CORNER_RADIUS = 8  // Tailwind rounded-lg
const WIRE_WIDTH = 2           // CustomEdge default strokeWidth
/**
 * How far apart parallel wire copies sit, in multiples of the line thickness.
 * 1.75x thickness reads as clearly distinct lines rather than one thick line.
 */
const WIRE_BUNDLE_SPACING = 1.75

/**
 * How many parallel lines a wire's data type gets on the page. Anything not
 * matched -- unknown type, error type, control ports -- degrades to a single
 * scalar line so failure never blocks the export.
 */
export function wireLineCount(rawType: string | undefined): 1 | 2 | 3 {
  if (!rawType) return 1
  try {
    const t = parseType(rawType)
    if (t.isMatrix) return 3
    if (t.isArray) return 2
    return 1
  } catch {
    return 1
  }
}
const PORT_LABEL_GAP = 12      // canvas margin between block edge and label
const NAME_FONT_SIZE = 8       // canvas block name is 0.5rem
const PORT_LABEL_FONT_SIZE = 8 // canvas .port-name-label is 0.5rem
// The canvas lifts port labels clear of their wire (see the `top` offsets on
// .port-name-label in BlockNode); mirror that so labels never sit on a line.
const PORT_LABEL_RISE = 7      // input labels
const PORT_LABEL_RISE_OUT = 9  // output labels

/** SVG path for a rounded rectangle anchored at the origin. */
export function roundedRectPath(w: number, h: number, r: number): string {
  const radius = Math.max(0, Math.min(r, w / 2, h / 2))
  if (radius === 0) return `M 0 0 H ${w} V ${h} H 0 Z`
  return [
    `M ${radius} 0`,
    `H ${w - radius}`,
    `A ${radius} ${radius} 0 0 1 ${w} ${radius}`,
    `V ${h - radius}`,
    `A ${radius} ${radius} 0 0 1 ${w - radius} ${h}`,
    `H ${radius}`,
    `A ${radius} ${radius} 0 0 1 0 ${h - radius}`,
    `V ${radius}`,
    `A ${radius} ${radius} 0 0 1 ${radius} 0`,
    'Z',
  ].join(' ')
}

/**
 * Stadium / pill outline used for Input and Output Port blocks, matching the
 * terminator path BlockNode draws (2px inset, semicircular ends).
 */
export function terminatorPath(w: number, h: number): string {
  const r = h / 2
  const ar = Math.max(0.1, r - 2)
  return [
    `M ${r} 2`,
    `L ${w - r} 2`,
    `A ${ar} ${ar} 0 0 1 ${w - r} ${h - 2}`,
    `L ${r} ${h - 2}`,
    `A ${ar} ${ar} 0 0 1 ${r} 2`,
    'Z',
  ].join(' ')
}

/** Filled triangular arrowhead pointing right, tip at the origin. */
export function arrowHeadPath(length: number, halfWidth: number): string {
  return `M 0 0 L ${-length} ${-halfWidth} L ${-length} ${halfWidth} Z`
}

const TERMINATOR_TYPES = new Set(['input_port', 'output_port'])

/** Last-resort mapping so a missing rasterizer still yields readable output. */
const TRANSLITERATE: Record<string, string> = {
  '∑': 'SUM', '∫': 'INT', '⊗': '(x)', '▦': '[#]', '▥': '[=]',
  '‖': '||', 'ᵀ': 'T', '⁻': '-', '¹': '1', '⊏': '[', '⌃': '^',
  '↓': 'v', '↑': '^', '→': '->', '↔': '<->', 'ω': 'w', '̇': '.',
  '…': '...', '×': 'x', '·': '.',
}

function transliterate(text: string): string {
  return [...text].map(ch => TRANSLITERATE[ch] ?? (needsRaster(ch) ? '?' : ch)).join('')
}

interface Metrics {
  width: number
  height: number
  inputs: number
  outputs: number
}

function measure(block: BlockData): Metrics {
  const counts = PortCountAdapter.getPortCounts(block)
  const outputs = block.type === 'output_port' ? 0 : counts.outputCount
  const inputs = counts.inputCount
  return {
    width: getBlockWidth(block),
    height: getBlockHeight(block, inputs, outputs),
    inputs,
    outputs,
  }
}

/**
 * Whether a block shows port-name labels, mirroring BlockNode: opt-in via the
 * showPortNames parameter, always on for body2quaternion_rates, never for
 * multiply.
 */
export function showsPortNames(block: BlockData): boolean {
  if (block.type === 'multiply') return false
  return Boolean(block.parameters?.showPortNames) || block.type === 'body2quaternion_rates'
}

/**
 * Label for one port, following the same precedence as the canvas: subsystems
 * name their own ports, body2quaternion_rates has fixed names, and everything
 * else borrows the name of a directly connected Input/Output Port block.
 */
export function portLabel(
  block: BlockData,
  index: number,
  isInput: boolean,
  blocks: BlockData[],
  wires: WireData[],
): string | null {
  if (block.type === 'subsystem') {
    const names = isInput ? block.parameters?.inputPorts : block.parameters?.outputPorts
    return Array.isArray(names) ? (names[index] ?? null) : null
  }
  if (block.type === 'body2quaternion_rates') {
    return isInput ? (['q', 'P', 'Q', 'R'][index] ?? null) : 'q̇'
  }
  // Output labels are suppressed for sum blocks on the canvas.
  if (!isInput && block.type === 'sum') return null

  const wire = wires.find(w =>
    isInput
      ? w.targetBlockId === block.id && w.targetPortIndex === index
      : w.sourceBlockId === block.id && w.sourcePortIndex === index
  )
  if (!wire) return null
  const otherId = isInput ? wire.sourceBlockId : wire.targetBlockId
  const other = blocks.find(b => b.id === otherId)
  if (!other) return null
  if (other.type !== 'input_port' && other.type !== 'output_port') return null
  return other.parameters?.portName || other.parameters?.signalName || other.name || null
}

interface Bounds { minX: number; minY: number; maxX: number; maxY: number }

/** Room reserved either side of a block that prints port-name labels. */
const PORT_LABEL_RESERVE = 60

function sheetBounds(blocks: BlockData[], metrics: Map<string, Metrics>): Bounds {
  const b: Bounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity }
  for (const block of blocks) {
    const m = metrics.get(block.id)!
    const x = block.position?.x ?? 0
    const y = block.position?.y ?? 0
    // Port stubs and, where enabled, labels extend past the block body.
    const pad = showsPortNames(block) ? PORT_LABEL_RESERVE : 8
    b.minX = Math.min(b.minX, x - pad)
    b.minY = Math.min(b.minY, y - 14) // block name renders above the body
    b.maxX = Math.max(b.maxX, x + m.width + pad)
    b.maxY = Math.max(b.maxY, y + m.height)
  }
  if (!Number.isFinite(b.minX)) return { minX: 0, minY: 0, maxX: 1, maxY: 1 }
  return b
}

/** Truncate to fit a width, appending an ellipsis when it does not. */
function fitText(text: string, font: PDFFont, size: number, maxWidth: number): string {
  if (font.widthOfTextAtSize(text, size) <= maxWidth) return text
  let lo = 0, hi = text.length
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2)
    if (font.widthOfTextAtSize(text.slice(0, mid) + '...', size) <= maxWidth) lo = mid
    else hi = mid - 1
  }
  return text.slice(0, lo) + '...'
}

/**
 * Break text onto as many lines as it needs, never shortening it. A single
 * word wider than `maxWidth` is left to overflow rather than be cut -- the
 * footer's subsystem path must stay searchable in the produced PDF.
 */
export function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = text.split(' ').filter(w => w.length > 0)
  if (words.length === 0) return []
  const lines: string[] = []
  let line = words[0]
  for (let i = 1; i < words.length; i++) {
    const candidate = `${line} ${words[i]}`
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      line = candidate
    } else {
      lines.push(line)
      line = words[i]
    }
  }
  lines.push(line)
  return lines
}

/**
 * The owning subsystem's path, i.e. the page's breadcrumb without the sheet
 * name on the end. Null for a top-level sheet, which has no subsystem above it
 * and so gets a single-line footer.
 */
export function subsystemPathOf(path: string[]): string | null {
  return path.length > 1 ? path.slice(0, -1).join(' / ') : null
}

export function sheetNameOf(path: string[]): string {
  return path.length > 0 ? path[path.length - 1] : ''
}

/** Footer grows upward as the subsystem path wraps onto more lines. */
export function footerHeightForLines(pathLineCount: number): number {
  return FOOTER_HEIGHT + pathLineCount * FOOTER_LINE_HEIGHT
}

export async function renderModelToPdf(
  plan: ExportPlan,
  options: PdfExportOptions,
  ctx: PdfRenderContext,
): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  doc.setTitle(ctx.modelName)
  doc.setCreator('obliq-2')
  doc.setProducer('obliq-2')

  const helv = await doc.embedFont(StandardFonts.Helvetica)
  const helvBold = await doc.embedFont(StandardFonts.HelveticaBold)
  const mono = await doc.embedFont(StandardFonts.Courier)

  // Truncation is opt-in per category: shortened text cannot be found by a
  // reader searching the PDF, so by default everything renders in full and is
  // simply allowed to overflow its block. Callers may re-enable it to keep
  // dense sheets legible without zooming.
  const allowTruncation = options.allowTruncation ?? { blockNames: false, inBlockText: false }
  const fitIf = (allowed: boolean) =>
    (text: string, font: PDFFont, size: number, maxWidth: number) =>
      allowed ? fitText(text, font, size, maxWidth) : text
  const fitBlockName = fitIf(allowTruncation.blockNames)
  const fitInBlock = fitIf(allowTruncation.inBlockText)

  const page = resolvePageSize(options.pageSizeId, options.orientation)
  const contentWidth = page.width - MARGIN * 2

  const footerDate = ctx.printedAt.toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
  // Page numbering is not known while pages are still being drawn, so reserve
  // a worst-case width. Over-reserving a few points is harmless; letting the
  // footer height change once the count is known would not be.
  const footerRightSample = `${footerDate}    Page 9999 of 9999`

  /**
   * Resolves the whole footer for a page: the wrapped subsystem path, and
   * whether the sheet name fits between the model name and the date or needs a
   * line of its own. Both the drawing area and addFooter read this, so they
   * cannot disagree about how tall the footer is.
   */
  const footerLayoutFor = (path: string[]) => {
    const sub = subsystemPathOf(path)
    const pathLines = sub ? wrapText(sub, helvBold, FOOTER_FONT_SIZE, contentWidth) : []

    const leftWidth = helv.widthOfTextAtSize(
      fitText(ctx.modelName, helv, FOOTER_FONT_SIZE, contentWidth * 0.3), FOOTER_FONT_SIZE)
    const rightWidth = helv.widthOfTextAtSize(footerRightSample, FOOTER_FONT_SIZE)
    const gap = contentWidth - leftWidth - rightWidth - 16
    const sheetWidth = helv.widthOfTextAtSize(sheetNameOf(path), FOOTER_FONT_SIZE)
    // Never squeeze or clip the sheet name; give it its own line instead.
    const sheetOnOwnLine = sheetWidth > gap

    const extraLines = pathLines.length + (sheetOnOwnLine ? 1 : 0)
    return {
      pathLines,
      sheetOnOwnLine,
      gapStart: MARGIN + leftWidth + 8,
      gapWidth: Math.max(0, gap),
      height: footerHeightForLines(extraLines),
    }
  }

  /**
   * Drawing area for a page. The footer grows as the subsystem path wraps, so
   * this has to be resolved per page rather than once for the document.
   */
  const printableFor = (path: string[]) => {
    const footerHeight = footerLayoutFor(path).height
    return {
      x: MARGIN,
      y: MARGIN + footerHeight,
      width: contentWidth,
      height: page.height - MARGIN * 2 - footerHeight,
      footerHeight,
    }
  }

  // Cache rasterised glyphs; the same symbol recurs across a model.
  const glyphCache = new Map<string, { img: any; width: number; height: number } | null>()
  const getRaster = async (text: string, size: number) => {
    const key = `${text}@${size}`
    if (glyphCache.has(key)) return glyphCache.get(key)!
    let result: { img: any; width: number; height: number } | null = null
    if (ctx.rasterizeGlyph) {
      try {
        const raster = await ctx.rasterizeGlyph(text, size)
        if (raster) {
          const img = await doc.embedPng(raster.png)
          result = { img, width: raster.width, height: raster.height }
        }
      } catch {
        result = null
      }
    }
    glyphCache.set(key, result)
    return result
  }

  const pages: Array<{ page: PDFPage; path: string[] }> = []

  const addFooter = (p: PDFPage, path: string[], pageNo: number, total: number) => {
    const size = FOOTER_FONT_SIZE
    const infoBaseline = MARGIN - 4
    const layout = footerLayoutFor(path)
    const { pathLines, sheetOnOwnLine } = layout

    p.drawLine({
      start: { x: MARGIN, y: MARGIN + layout.height - 10 },
      end: { x: page.width - MARGIN, y: MARGIN + layout.height - 10 },
      thickness: 0.5,
      color: GRAY,
    })

    // Lines above the info line, top-most first.
    const above: Array<{ text: string; font: PDFFont; color: typeof BLACK; centered: boolean }> = []
    // The owning subsystem's path, in bold and never shortened: an ellipsis
    // here would make the page impossible to find by searching the PDF.
    for (const line of pathLines) {
      above.push({ text: line, font: helvBold, color: BLACK, centered: false })
    }
    if (sheetOnOwnLine) {
      above.push({ text: sheetNameOf(path), font: helv, color: GRAY, centered: true })
    }

    above.forEach((line, i) => {
      const y = infoBaseline + (above.length - i) * FOOTER_LINE_HEIGHT
      const w = line.font.widthOfTextAtSize(line.text, size)
      const x = line.centered ? MARGIN + (contentWidth - w) / 2 : MARGIN
      p.drawText(line.text, { x, y, size, font: line.font, color: line.color })
    })

    // Info line: model name, sheet name (when it fits), date and page number.
    const left = fitText(ctx.modelName, helv, size, contentWidth * 0.3)
    p.drawText(left, { x: MARGIN, y: infoBaseline, size, font: helv, color: GRAY })

    if (!sheetOnOwnLine) {
      const sheet = sheetNameOf(path)
      const sheetWidth = helv.widthOfTextAtSize(sheet, size)
      p.drawText(sheet, {
        x: layout.gapStart + (layout.gapWidth - sheetWidth) / 2,
        y: infoBaseline, size, font: helv, color: GRAY,
      })
    }

    const right = `${footerDate}    Page ${pageNo} of ${total}`
    const rightWidth = helv.widthOfTextAtSize(right, size)
    p.drawText(right, {
      x: page.width - MARGIN - rightWidth,
      y: infoBaseline, size, font: helv, color: GRAY,
    })
  }

  // --- Sheet pages --------------------------------------------------------

  const drawSheet = async (sheet: ExportSheet) => {
    const p = doc.addPage([page.width, page.height])
    pages.push({ page: p, path: sheet.path })
    const printable = printableFor(sheet.path)

    const metrics = new Map(sheet.blocks.map(b => [b.id, measure(b)]))
    const bounds = sheetBounds(sheet.blocks, metrics)
    const contentW = Math.max(1, bounds.maxX - bounds.minX)
    const contentH = Math.max(1, bounds.maxY - bounds.minY)

    let scale = options.scaling === '50' ? 0.5 : 1
    if (options.scaling === 'fit') {
      scale = Math.min(printable.width / contentW, printable.height / contentH)
    } else if (options.fitLargeSheets) {
      const fit = Math.min(printable.width / contentW, printable.height / contentH)
      if (fit < scale) scale = fit
    }

    // Centre the scaled content in the printable area. PDF y grows upward
    // while model y grows downward, so y is flipped here.
    const drawnW = contentW * scale
    const drawnH = contentH * scale
    const offsetX = printable.x + (printable.width - drawnW) / 2
    const offsetTop = printable.y + printable.height - (printable.height - drawnH) / 2

    const tx = (mx: number) => offsetX + (mx - bounds.minX) * scale
    const ty = (my: number) => offsetTop - (my - bounds.minY) * scale

    // Wires first so blocks sit on top of them.
    for (const wire of sheet.connections) {
      const src = sheet.blocks.find(b => b.id === wire.sourceBlockId)
      const tgt = sheet.blocks.find(b => b.id === wire.targetBlockId)
      if (!src || !tgt) continue
      const sm = metrics.get(src.id)!
      const tm = metrics.get(tgt.id)!

      const sx = (src.position?.x ?? 0) + sm.width
      const sy = (src.position?.y ?? 0) +
        portOffsetY(Math.max(0, wire.sourcePortIndex), sm.outputs, sm.height)
      const txx = tgt.position?.x ?? 0
      const tyy = (tgt.position?.y ?? 0) +
        portOffsetY(Math.max(0, wire.targetPortIndex), tm.inputs, tm.height)

      // Orthogonal step route, mirroring the canvas' default edge shape.
      const waypoints = wire.routing?.waypoints
      const pts: Array<{ x: number; y: number }> = waypoints && waypoints.length > 0
        ? [{ x: sx, y: sy }, ...waypoints, { x: txx, y: tyy }]
        : (() => {
            const midX = sx + (txx - sx) / 2 + (wire.routing?.midpointOffset ?? 0)
            return [
              { x: sx, y: sy },
              { x: midX, y: sy },
              { x: midX, y: tyy },
              { x: txx, y: tyy },
            ]
          })()

      const wireThickness = Math.max(0.5, WIRE_WIDTH * scale)
      // The arrowhead occupies the last stretch, so stop the final segment
      // short of the port rather than drawing under the head.
      const headLength = Math.max(3, 7 * scale)
      const baseHeadHalfWidth = Math.max(1.5, 3 * scale)

      // A vector/matrix wire is drawn as parallel copies of the same polyline.
      // Look-up degrades to scalar when the type is not known, so unresolved
      // signals never block the export.
      const lineCount = wireLineCount(ctx.signalTypes?.get(wire.id)?.type)
      const spacing = wireThickness * WIRE_BUNDLE_SPACING
      // Offsets centred on zero so the middle line coincides with the original
      // path. Double lines straddle it symmetrically.
      const offsets: number[] = lineCount === 1
        ? [0]
        : lineCount === 2
          ? [-spacing / 2, spacing / 2]
          : [-spacing, 0, spacing]

      // Transform to PDF space first, then compute offsets there. Doing it in
      // canvas space would need to account for ty()'s y-flip.
      const page: Array<{ x: number; y: number }> =
        pts.map(pt => ({ x: tx(pt.x), y: ty(pt.y) }))

      // Right-hand perpendicular of a directed segment; zero vector for degenerate.
      const perp = (a: { x: number; y: number }, b: { x: number; y: number }) => {
        const dx = b.x - a.x, dy = b.y - a.y
        const len = Math.hypot(dx, dy)
        return len < 1e-9 ? { x: 0, y: 0 } : { x: dy / len, y: -dx / len }
      }

      /**
       * Offset a polyline by d perpendicular to itself. At a corner both incident
       * perpendiculars are summed rather than averaged: for orthogonal turns that
       * places the meeting point exactly at the intersection of the two shifted
       * segments, so the offset polyline stays parallel to the original throughout.
       */
      const offsetPolyline = (pts: typeof page, d: number) => pts.map((pt, i) => {
        const prevPt = i > 0 ? pts[i - 1] : null
        const nextPt = i < pts.length - 1 ? pts[i + 1] : null
        let nx = 0, ny = 0
        if (prevPt) { const q = perp(prevPt, pt); nx += q.x; ny += q.y }
        if (nextPt) { const q = perp(pt, nextPt); nx += q.x; ny += q.y }
        return { x: pt.x + d * nx, y: pt.y + d * ny }
      })

      for (const d of offsets) {
        const line = offsetPolyline(page, d)
        for (let i = 0; i < line.length - 1; i++) {
          const from = line[i]
          const to = line[i + 1]
          const isLast = i === line.length - 2

          let end = to
          if (isLast) {
            const dx = to.x - from.x
            const dy = to.y - from.y
            const len = Math.hypot(dx, dy)
            if (len > headLength) {
              end = {
                x: to.x - (dx / len) * headLength,
                y: to.y - (dy / len) * headLength,
              }
            }
          }

          p.drawLine({ start: from, end, thickness: wireThickness, color: WIRE })
        }
      }

      // Arrowhead at the destination, oriented along the incoming segment.
      // Grow the head to visually cap the whole bundle without any tips
      // poking out either side.
      const last = { x: tx(pts[pts.length - 1].x), y: ty(pts[pts.length - 1].y) }
      const prev = { x: tx(pts[pts.length - 2].x), y: ty(pts[pts.length - 2].y) }
      const angle = Math.atan2(last.y - prev.y, last.x - prev.x)
      const bundleHalfSpan = ((lineCount - 1) * spacing) / 2
      const headHalfWidth = Math.max(baseHeadHalfWidth, bundleHalfSpan + baseHeadHalfWidth * 0.8)
      p.drawSvgPath(arrowHeadPath(headLength, headHalfWidth), {
        x: last.x,
        y: last.y,
        color: WIRE,
        borderWidth: 0,
        rotate: { type: 'radians', angle: -angle } as any,
      })
    }

    for (const block of sheet.blocks) {
      if (block.type === 'comment') continue
      const m = metrics.get(block.id)!
      const bx = block.position?.x ?? 0
      const by = block.position?.y ?? 0

      const x = tx(bx)
      const yTop = ty(by)
      const w = m.width * scale
      const h = m.height * scale

      // Body outline: Input/Output Port blocks use the stadium terminator
      // shape; everything else is a rounded rectangle, matching the canvas.
      //
      // drawSvgPath multiplies borderWidth by its `scale` option, so the width
      // handed to it must be divided by the scale to land on the page at the
      // intended thickness. Passing an already-scaled width squares it, which
      // at large scales produced a stroke wide enough to overhang the footer.
      const onPageBorder = Math.max(0.4, BLOCK_BORDER_WIDTH * scale)
      const borderWidth = onPageBorder / scale
      const shape = TERMINATOR_TYPES.has(block.type)
        ? terminatorPath(m.width, m.height)
        : roundedRectPath(m.width, m.height, BLOCK_CORNER_RADIUS)

      p.drawSvgPath(shape, {
        x, y: yTop,
        scale,
        color: rgb(1, 1, 1),
        borderColor: BLOCK_BORDER,
        borderWidth,
      })

      // Block name above the body, when the block shows one. A missing
      // showName means "show", matching the canvas: blocks saved before the
      // setting existed keep printing their names.
      const nameSize = Math.max(4, NAME_FONT_SIZE * scale)
      if (nameSize >= 3.5 && block.parameters?.showName !== false) {
        const name = fitBlockName(block.name || '', helv, nameSize, w * 1.4)
        const nameW = helv.widthOfTextAtSize(name, nameSize)
        p.drawText(name, {
          x: x + (w - nameW) / 2, y: yTop + 2,
          size: nameSize, font: helv, color: BLACK,
        })
      }

      // Symbol inside the body.
      const spec = getGlyphSpec(block)
      const symSize = Math.max(3, (spec.fontSize ?? 10) * scale)
      if (spec.text && symSize >= 3) {
        const font = spec.mono ? mono : helv
        if (spec.kind === 'raster' || needsRaster(spec.text)) {
          const raster = await getRaster(spec.text, spec.fontSize ?? 10)
          if (raster) {
            const drawH = symSize * 1.2
            const drawW = drawH * (raster.width / raster.height)
            p.drawImage(raster.img, {
              x: x + (w - drawW) / 2,
              y: yTop - h / 2 - drawH / 2,
              width: Math.min(drawW, w * 0.9),
              height: drawH,
            })
          } else {
            const fallback = fitInBlock(transliterate(spec.text), font, symSize, w * 0.9)
            const fw = font.widthOfTextAtSize(fallback, symSize)
            p.drawText(fallback, {
              x: x + (w - fw) / 2, y: yTop - h / 2 - symSize * 0.35,
              size: symSize, font, color: BLACK,
            })
          }
        } else {
          const text = fitInBlock(spec.text, font, symSize, w * 0.9)
          const tw = font.widthOfTextAtSize(text, symSize)
          p.drawText(text, {
            x: x + (w - tw) / 2, y: yTop - h / 2 - symSize * 0.35,
            size: symSize, font, color: BLACK,
          })
        }
      }

      // Port stubs.
      const stub = 6 * scale
      const stubWidth = Math.max(0.3, 1.2 * scale)
      for (let i = 0; i < m.inputs; i++) {
        const py = ty(by + portOffsetY(i, m.inputs, m.height))
        p.drawLine({
          start: { x: x - stub, y: py }, end: { x, y: py },
          thickness: stubWidth, color: WIRE,
        })
      }
      for (let i = 0; i < m.outputs; i++) {
        const py = ty(by + portOffsetY(i, m.outputs, m.height))
        p.drawLine({
          start: { x: x + w, y: py }, end: { x: x + w + stub, y: py },
          thickness: stubWidth, color: WIRE,
        })
      }

      // Port-name labels, for blocks that request them (notably subsystems).
      if (showsPortNames(block)) {
        const labelSize = Math.max(3, PORT_LABEL_FONT_SIZE * scale)
        if (labelSize >= 3) {
          const gap = PORT_LABEL_GAP * scale
          const maxLabelWidth = PORT_LABEL_RESERVE * scale

          for (let i = 0; i < m.inputs; i++) {
            const raw = portLabel(block, i, true, sheet.blocks, sheet.connections)
            if (!raw) continue
            const text = fitInBlock(
              needsRaster(raw) ? transliterate(raw) : raw, helv, labelSize, maxLabelWidth)
            const tw = helv.widthOfTextAtSize(text, labelSize)
            const py = ty(by + portOffsetY(i, m.inputs, m.height))
            // Right-aligned, ending a gap short of the block's left edge, and
            // lifted clear of the wire the way the canvas offsets it.
            p.drawText(text, {
              x: x - gap - tw,
              y: py + PORT_LABEL_RISE * scale - labelSize * 0.35,
              size: labelSize, font: helv, color: LABEL,
            })
          }

          for (let i = 0; i < m.outputs; i++) {
            const raw = portLabel(block, i, false, sheet.blocks, sheet.connections)
            if (!raw) continue
            const text = fitInBlock(
              needsRaster(raw) ? transliterate(raw) : raw, helv, labelSize, maxLabelWidth)
            const py = ty(by + portOffsetY(i, m.outputs, m.height))
            // Left-aligned, starting a gap past the block's right edge.
            p.drawText(text, {
              x: x + w + gap,
              y: py + PORT_LABEL_RISE_OUT * scale - labelSize * 0.35,
              size: labelSize, font: helv, color: LABEL,
            })
          }
        }
      }
    }
  }

  // --- Subsystem summary pages -------------------------------------------

  const drawSummary = (sub: ExportSubsystem) => {
    const p = doc.addPage([page.width, page.height])
    const summaryPath = [...sub.path, 'Summary']
    pages.push({ page: p, path: summaryPath })
    const printable = printableFor(summaryPath)

    let y = printable.y + printable.height - 24

    p.drawText('Subsystem Summary', {
      x: MARGIN, y, size: 16, font: helvBold, color: BLACK,
    })
    y -= 22
    p.drawText(fitText(sub.name, helvBold, 13, printable.width), {
      x: MARGIN, y, size: 13, font: helvBold, color: BLACK,
    })
    y -= 14
    p.drawText(fitText(sub.path.join(' / '), helv, 9, printable.width), {
      x: MARGIN, y, size: 9, font: helv, color: GRAY,
    })
    y -= 24

    const section = (title: string) => {
      p.drawText(title, { x: MARGIN, y, size: 11, font: helvBold, color: BLACK })
      y -= 6
      p.drawLine({
        start: { x: MARGIN, y }, end: { x: page.width - MARGIN, y },
        thickness: 0.5, color: GRAY,
      })
      y -= 14
    }
    const line = (text: string, indent = 0, font: PDFFont = helv, size = 9) => {
      if (y < printable.y + 12) return // spill guard; summaries are short
      p.drawText(fitText(text, font, size, printable.width - indent), {
        x: MARGIN + indent, y, size, font, color: BLACK,
      })
      y -= size + 4
    }

    section(`Input Ports (${sub.inputPorts.length})`)
    if (sub.inputPorts.length === 0) line('None', 12, helv)
    sub.inputPorts.forEach((name, i) => line(`${i}.  ${name}`, 12, mono))
    y -= 8

    section(`Output Ports (${sub.outputPorts.length})`)
    if (sub.outputPorts.length === 0) line('None', 12, helv)
    sub.outputPorts.forEach((name, i) => line(`${i}.  ${name}`, 12, mono))
    y -= 8

    section(`Parameters (${sub.parameters.length})`)
    if (sub.parameters.length === 0) line('None', 12, helv)
    for (const param of sub.parameters) {
      const type = param.dataType ? ` : ${param.dataType}` : ''
      const value = param.value ? ` = ${param.value}` : ''
      line(`${param.name}${type}${value}`, 12, mono)
    }
    y -= 8

    section(`Sheets (${sub.sheetNames.length})`)
    if (sub.sheetNames.length === 0) line('None', 12, helv)
    sub.sheetNames.forEach((name, i) => line(`${i + 1}.  ${name}`, 12, helv))

    if (sub.codeGenStrategy) {
      y -= 8
      section('Code Generation')
      line(sub.codeGenStrategy, 12, mono)
    }
  }

  // --- Assemble -----------------------------------------------------------

  for (const sheet of plan.sheets) {
    // A subsystem's summary precedes its sheets.
    if (options.includeSubsystemSummaries && sheet.ownerSubsystemId) {
      const sub = plan.subsystems.find(s => s.id === sheet.ownerSubsystemId)
      const alreadyDrawn = pages.some(pg => sub && pg.path.join('/') === [...sub.path, 'Summary'].join('/'))
      if (sub && !alreadyDrawn) drawSummary(sub)
    }
    await drawSheet(sheet)
  }

  const total = pages.length
  pages.forEach((entry, i) => addFooter(entry.page, entry.path, i + 1, total))

  return doc.save()
}
