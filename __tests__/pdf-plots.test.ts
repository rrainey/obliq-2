/**
 * PDF export: Signal Display plots in a column on each sheet's page
 * ("Include plot results on sheets").
 */
import { PDFDocument, StandardFonts } from 'pdf-lib'
import { buildFullPlan } from '@/lib/export/sheetTree'
import { DEFAULT_PDF_OPTIONS, renderModelToPdf } from '@/lib/export/pdfRenderer'
import { drawPdfPlot, plotsPerColumn, MIN_PDF_PLOT_HEIGHT, type PdfPlot } from '@/lib/export/pdfPlot'
import { resultsToColumns } from '@/lib/plots/signalPlot'
import type { BlockData } from '@/components/BlockNode'

const block = (id: string, type: string, params: Record<string, any> = {}, x = 0, y = 0): BlockData =>
  ({ id, type, name: id, position: { x, y }, parameters: params })

const N = 10000
const times = Array.from({ length: N }, (_, i) => i * 0.0005)
const scalar = times.map(t => Math.sin(t * 3))
const vector = times.map(t => [t, -t, Math.cos(t)])

/** A sheet with `count` displays, stacked by y in reverse id order. */
function sheetWithDisplays(count: number) {
  const blocks = [block('src', 'source', { value: 1 }, 0, 0)]
  for (let i = 0; i < count; i++) blocks.push(block(`d${i}`, 'signal_display', {}, 200, (count - i) * 100))
  return { id: 'main', name: 'Main', blocks, connections: [] }
}

const plotsFor = (count: number): PdfPlot[] =>
  Array.from({ length: count }, (_, i) => ({
    blockId: `d${i}`,
    title: `Scope ${i}`,
    columns: resultsToColumns(times, i % 2 ? (vector as any) : scalar, N),
  }))

const ctx = (count: number) => ({
  modelName: 'Plots',
  printedAt: new Date('2026-10-23T12:00:00Z'),
  plotResults: new Map([['main', plotsFor(count)]]),
})
const opts = (over: Record<string, unknown> = {}) => ({ ...DEFAULT_PDF_OPTIONS, fileName: 'p.pdf', ...over })

describe('Include plot results on sheets', () => {
  test('off (the default): pages and size are unchanged by available results', async () => {
    const plan = buildFullPlan([sheetWithDisplays(2)])
    const without = await renderModelToPdf(plan, opts(), { modelName: 'Plots', printedAt: new Date('2026-10-23T12:00:00Z') })
    const ignored = await renderModelToPdf(plan, opts(), ctx(2))
    expect((await PDFDocument.load(ignored)).getPageCount()).toBe(1)
    expect(Math.abs(ignored.length - without.length)).toBeLessThan(200) // only the creation date differs
  })

  test('on: plots join the sheet page; the file stays small for 10,000-sample series', async () => {
    const plan = buildFullPlan([sheetWithDisplays(2)])
    const bytes = await renderModelToPdf(plan, opts({ includePlotResults: true }), ctx(2))
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(1)
    // Decimated to about one point per printed point: well under a megabyte
    expect(bytes.length).toBeLessThan(400_000)
  })

  test('more plots than fit continue on further pages for the sheet', async () => {
    const plan = buildFullPlan([sheetWithDisplays(12)])
    const bytes = await renderModelToPdf(plan, opts({ includePlotResults: true }), ctx(12))
    // Letter landscape: about 4 plots of at least 1.5 in fit beside the diagram
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(3)
    expect(plotsPerColumn(500)).toBe(4)
    expect(plotsPerColumn(MIN_PDF_PLOT_HEIGHT)).toBe(1)
  })
})

describe('drawPdfPlot', () => {
  /** A page stand-in that records what is drawn. */
  const recorder = () => {
    const texts: string[] = []
    const paths: string[] = []
    const page: any = {
      drawText: (t: string) => texts.push(t),
      drawLine: () => {},
      drawRectangle: () => {},
      drawSvgPath: (p: string) => paths.push(p),
    }
    return { page, texts, paths }
  }

  test('a vector plot: title, axis titles, tick labels, a legend, and one decimated line per element', async () => {
    const doc = await PDFDocument.create()
    const fonts = { regular: await doc.embedFont(StandardFonts.Helvetica), bold: await doc.embedFont(StandardFonts.HelveticaBold) }
    const { page, texts, paths } = recorder()
    drawPdfPlot(page, { x: 400, y: 100, width: 220, height: 160 }, plotsFor(2)[1]!, fonts)
    expect(texts).toEqual(expect.arrayContaining(['Scope 1', 'Time (s)', 'Value', 'Element 0', 'Element 1', 'Element 2']))
    expect(texts.some(t => /^-?\d/.test(t))).toBe(true) // tick labels
    expect(paths).toHaveLength(3)
    for (const p of paths) {
      const points = p.trim().split(/[ML]/).filter(Boolean).length
      expect(points).toBeGreaterThan(100)
      expect(points).toBeLessThanOrEqual(4 * 220) // min/max decimation
    }
  })

  test('a scalar plot has no legend', async () => {
    const doc = await PDFDocument.create()
    const fonts = { regular: await doc.embedFont(StandardFonts.Helvetica), bold: await doc.embedFont(StandardFonts.HelveticaBold) }
    const { page, texts, paths } = recorder()
    drawPdfPlot(page, { x: 0, y: 0, width: 200, height: 120 }, plotsFor(1)[0]!, fonts)
    expect(texts).not.toContain('Element 0')
    expect(paths).toHaveLength(1)
  })
})
