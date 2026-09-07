import { PDFDocument } from 'pdf-lib'
import { buildFullPlan, buildExportPlan, applyScope } from '@/lib/export/sheetTree'
import {
  renderModelToPdf, DEFAULT_PDF_OPTIONS,
  roundedRectPath, terminatorPath, arrowHeadPath, showsPortNames, portLabel,
  wrapText, subsystemPathOf, sheetNameOf, footerHeightForLines,
  wireLineCount, drawLookupPlot, drawTransferFunction, polynomialChunks,
} from '@/lib/export/pdfRenderer'
import { resolvePageSize, getPageSize, PAGE_SIZES } from '@/lib/export/pageSizes'
import { getGlyphSpec, glyphWorkList, needsRaster } from '@/lib/export/blockGlyphs'
import type { BlockData } from '@/components/BlockNode'

const block = (id: string, type: string, params: Record<string, any> = {}, x = 0, y = 0): BlockData =>
  ({ id, type, name: id, position: { x, y }, parameters: params })

const wire = (id: string, s: string, sp: number, t: string, tp: number) =>
  ({ id, sourceBlockId: s, sourcePortIndex: sp, targetBlockId: t, targetPortIndex: tp })

const simpleSheet = (id = 'main', name = 'Main') => ({
  id, name,
  blocks: [
    block('src', 'source', { value: 1 }, 0, 0),
    block('gain', 'scale', { gain: 2 }, 200, 0),
    block('out', 'output_port', { portName: 'y' }, 400, 0),
  ],
  connections: [wire('w1', 'src', 0, 'gain', 0), wire('w2', 'gain', 0, 'out', 0)],
})

const subsystemSheet = () => ({
  id: 'main', name: 'Main',
  blocks: [
    block('in1', 'input_port', { portName: 'u' }, 0, 0),
    block('sub', 'subsystem', {
      inputPorts: ['u'],
      outputPorts: ['y'],
      codeGenStrategy: 'flatten',
      parameters: [{ name: 'GAIN', dataType: 'double', defaultValue: '2.5' }],
      sheets: [
        { id: 'sub_main', name: 'Sub Main', blocks: [block('si', 'input_port', {}, 0, 0)], connections: [] },
        { id: 'sub_alt', name: 'Sub Alt', blocks: [], connections: [] },
      ],
    }, 200, 0),
  ],
  connections: [wire('w1', 'in1', 0, 'sub', 0)],
})

const ctx = { modelName: 'Test Model', printedAt: new Date('2026-01-15T10:30:00Z') }
const opts = (over: Partial<typeof DEFAULT_PDF_OPTIONS> & { fileName?: string } = {}) =>
  ({ ...DEFAULT_PDF_OPTIONS, fileName: 'test.pdf', ...over })

describe('page sizes', () => {
  test('landscape swaps width and height', () => {
    const portrait = resolvePageSize('letter', 'portrait')
    const landscape = resolvePageSize('letter', 'landscape')
    expect(portrait.width).toBeCloseTo(612)
    expect(portrait.height).toBeCloseTo(792)
    expect(landscape.width).toBeCloseTo(792)
    expect(landscape.height).toBeCloseTo(612)
  })

  test('blueprint sizes are present and correct', () => {
    const archE = getPageSize('arch_e')
    expect(archE.width).toBeCloseTo(36 * 72)
    expect(archE.height).toBeCloseTo(48 * 72)
  })

  test('ISO A4 matches the 210x297mm standard', () => {
    const a4 = getPageSize('a4')
    expect(a4.width).toBeCloseTo(595.28, 1)
    expect(a4.height).toBeCloseTo(841.89, 1)
  })

  test('every size is portrait-oriented in the table', () => {
    for (const p of PAGE_SIZES) expect(p.width).toBeLessThanOrEqual(p.height)
  })

  test('unknown id falls back to the default rather than throwing', () => {
    expect(getPageSize('nope').id).toBe('letter')
  })
})

describe('sheet tree', () => {
  test('flattens nested subsystem sheets with breadcrumb paths', () => {
    const plan = buildFullPlan([subsystemSheet()])
    expect(plan.sheets.map(s => s.id)).toEqual(['main', 'sub_main', 'sub_alt'])
    expect(plan.sheets[1].path).toEqual(['Main', 'sub', 'Sub Main'])
  })

  test('collects subsystem metadata for summaries', () => {
    const plan = buildFullPlan([subsystemSheet()])
    expect(plan.subsystems).toHaveLength(1)
    const sub = plan.subsystems[0]
    expect(sub.inputPorts).toEqual(['u'])
    expect(sub.outputPorts).toEqual(['y'])
    expect(sub.sheetNames).toEqual(['Sub Main', 'Sub Alt'])
    expect(sub.parameters[0]).toMatchObject({ name: 'GAIN', dataType: 'double', value: '2.5' })
  })

  test('scope "sheet" keeps only the active sheet', () => {
    const plan = buildExportPlan([subsystemSheet()], 'sheet', 'sub_main')
    expect(plan.sheets.map(s => s.id)).toEqual(['sub_main'])
  })

  test('scope "subsystem" keeps the owning subsystem\'s sheets', () => {
    const plan = buildExportPlan([subsystemSheet()], 'subsystem', 'sub_main')
    expect(plan.sheets.map(s => s.id).sort()).toEqual(['sub_alt', 'sub_main'])
  })

  test('scope "subsystem" on a top-level sheet falls back to the whole model', () => {
    const plan = buildExportPlan([subsystemSheet()], 'subsystem', 'main')
    expect(plan.sheets).toHaveLength(3)
  })

  test('unknown active sheet degrades to the full plan', () => {
    const plan = buildExportPlan([subsystemSheet()], 'sheet', 'does-not-exist')
    expect(plan.sheets).toHaveLength(3)
  })
})

describe('glyph classification', () => {
  test('WinAnsi-safe symbols are drawn as text', () => {
    expect(getGlyphSpec(block('b', 'divide')).kind).toBe('text')
    expect(getGlyphSpec(block('b', 'sign')).kind).toBe('text')
  })

  test('symbols outside WinAnsi are flagged for raster', () => {
    expect(getGlyphSpec(block('b', 'sum')).kind).toBe('raster')
    expect(getGlyphSpec(block('b', 'matrix_multiply')).kind).toBe('raster')
  })

  test('icon-backed blocks are classified separately', () => {
    expect(getGlyphSpec(block('b', 'subsystem')).kind).toBe('icon')
  })

  test('custom-SVG blocks are classified as draw', () => {
    expect(getGlyphSpec(block('b', 'transfer_function')).kind).toBe('draw')
  })

  test('port blocks show their port name', () => {
    expect(getGlyphSpec(block('b', 'input_port', { portName: 'theta' })).text).toBe('theta')
  })

  test('needsRaster distinguishes WinAnsi from beyond', () => {
    expect(needsRaster('A x B')).toBe(false)
    expect(needsRaster('×')).toBe(false)   // U+00D7 is within WinAnsi
    expect(needsRaster('∑')).toBe(true)
  })

  test('work list covers icons, custom SVG, and non-WinAnsi glyphs', () => {
    const items = glyphWorkList()
    const reasons = new Set(items.map(i => i.reason))
    expect(reasons).toContain('icon')
    expect(reasons).toContain('custom-svg')
    expect(reasons).toContain('non-winansi')
    expect(reasons).toContain('dynamic-label')
    expect(items.find(i => i.blockType === 'sum')?.detail).toContain('U+2211')
  })
})

describe('block shapes', () => {
  test('rounded rectangle path uses arcs at every corner', () => {
    const path = roundedRectPath(80, 64, 8)
    expect(path.startsWith('M 8 0')).toBe(true)
    expect((path.match(/A /g) || []).length).toBe(4)
    expect(path.trim().endsWith('Z')).toBe(true)
  })

  test('corner radius is clamped so it cannot exceed half the block', () => {
    const path = roundedRectPath(10, 10, 40)
    expect(path).toContain('M 5 0')
  })

  test('a zero radius degrades to a plain rectangle', () => {
    expect(roundedRectPath(20, 10, 0)).toBe('M 0 0 H 20 V 10 H 0 Z')
  })

  test('terminator path is a stadium with semicircular ends', () => {
    const path = terminatorPath(100, 45)
    // Ends are arcs of radius (height/2 - 2), matching the canvas 2px inset.
    expect(path).toContain('A 20.5 20.5')
    expect((path.match(/A /g) || []).length).toBe(2)
  })

  test('arrowhead is a closed triangle behind its tip', () => {
    const path = arrowHeadPath(7, 3)
    expect(path).toBe('M 0 0 L -7 -3 L -7 3 Z')
  })
})

describe('port name labels', () => {
  test('subsystems opt in via showPortNames', () => {
    expect(showsPortNames(block('s', 'subsystem', { showPortNames: true }))).toBe(true)
    expect(showsPortNames(block('s', 'subsystem', {}))).toBe(false)
  })

  test('body2quaternion_rates always shows names, multiply never does', () => {
    expect(showsPortNames(block('b', 'body2quaternion_rates'))).toBe(true)
    expect(showsPortNames(block('m', 'multiply', { showPortNames: true }))).toBe(false)
  })

  test('a subsystem names its ports from its own port lists', () => {
    const sub = block('sub', 'subsystem', { inputPorts: ['a', 'b'], outputPorts: ['y'] })
    expect(portLabel(sub, 0, true, [sub], [])).toBe('a')
    expect(portLabel(sub, 1, true, [sub], [])).toBe('b')
    expect(portLabel(sub, 0, false, [sub], [])).toBe('y')
    expect(portLabel(sub, 5, true, [sub], [])).toBeNull()
  })

  test('other blocks borrow the name of a connected port block', () => {
    const gain = block('g', 'scale')
    const src = block('u', 'input_port', { portName: 'throttle' })
    const wires = [wire('w', 'u', 0, 'g', 0)]
    expect(portLabel(gain, 0, true, [gain, src], wires)).toBe('throttle')
  })

  test('a connection to a non-port block yields no label', () => {
    const gain = block('g', 'scale')
    const other = block('o', 'sum')
    expect(portLabel(gain, 0, true, [gain, other], [wire('w', 'o', 0, 'g', 0)])).toBeNull()
  })

  test('sum blocks suppress output labels, matching the canvas', () => {
    const sum = block('s', 'sum')
    const out = block('y', 'output_port', { portName: 'result' })
    expect(portLabel(sum, 0, false, [sum, out], [wire('w', 's', 0, 'y', 0)])).toBeNull()
  })

  test('body2quaternion_rates uses its fixed port names', () => {
    const b = block('b', 'body2quaternion_rates')
    expect(portLabel(b, 0, true, [b], [])).toBe('q')
    expect(portLabel(b, 3, true, [b], [])).toBe('R')
    expect(portLabel(b, 0, false, [b], [])).toBe('q̇')
  })
})

describe('footer layout', () => {
  const helv = { widthOfTextAtSize: (t: string, size: number) => t.length * size * 0.5 } as any

  test('wrapText breaks on spaces without shortening anything', () => {
    const lines = wrapText('alpha beta gamma delta', helv, 10, 60)
    expect(lines.join(' ')).toBe('alpha beta gamma delta')
    expect(lines.length).toBeGreaterThan(1)
    expect(lines.join('')).not.toContain('...')
  })

  test('a word wider than the column overflows rather than being cut', () => {
    // Searchability depends on this: an ellipsis would make the text unfindable.
    const long = 'Saturn_Instrument_Unit_LVDA_LVDC_Iterative_Guidance_Mode'
    const lines = wrapText(long, helv, 10, 20)
    expect(lines).toEqual([long])
  })

  test('empty text yields no lines', () => {
    expect(wrapText('', helv, 10, 100)).toEqual([])
  })

  test('subsystem path is the breadcrumb without the sheet name', () => {
    expect(subsystemPathOf(['Main', 'Controller', 'Inner'])).toBe('Main / Controller')
  })

  test('a top-level sheet has no subsystem path', () => {
    expect(subsystemPathOf(['Main'])).toBeNull()
    expect(subsystemPathOf([])).toBeNull()
  })

  test('sheet name is the last breadcrumb element', () => {
    expect(sheetNameOf(['Main', 'Controller', 'Inner'])).toBe('Inner')
    expect(sheetNameOf([])).toBe('')
  })

  test('footer grows one line height per wrapped line', () => {
    const base = footerHeightForLines(0)
    expect(footerHeightForLines(1)).toBeGreaterThan(base)
    expect(footerHeightForLines(2) - footerHeightForLines(1))
      .toBe(footerHeightForLines(1) - base)
  })
})

describe('text truncation options', () => {
  test('truncation is off by default', () => {
    expect(DEFAULT_PDF_OPTIONS.allowTruncation).toEqual({
      blockNames: false, inBlockText: false,
    })
  })

  test('a long block name renders without truncation by default', async () => {
    const long = 'Saturn_Instrument_Unit_LVDC_Iterative_Guidance_Mode_Gain3'
    const mk = (allow: boolean) => buildFullPlan([{
      id: 'm', name: 'M',
      blocks: [{ ...block('b', 'scale', { gain: 1 }), name: long }],
      connections: [],
    }])
    const full = await renderModelToPdf(mk(false), opts(), ctx)
    const cut = await renderModelToPdf(
      mk(true), opts({ allowTruncation: { blockNames: true, inBlockText: false } }), ctx)
    // The untruncated name carries more glyphs, so more content.
    expect(full.length).toBeGreaterThan(cut.length)
  })

  test('an evaluate expression is no longer shortened at the glyph layer', () => {
    const longExpr = 'in(0)*2.0 + in(1)/3.14159265358979 - in(2) + in(3)*1.5'
    const spec = getGlyphSpec(block('e', 'evaluate', { expression: longExpr }))
    expect(spec.text).toBe(longExpr)
    expect(spec.text).not.toContain('\u2026')
  })

  test('a condition expression is no longer shortened at the glyph layer', () => {
    const spec = getGlyphSpec(block('c', 'condition', { condition: '> 0.000000001234' }))
    expect(spec.text).toBe('x1 > 0.000000001234')
  })

  test('both truncation modes still render valid PDFs', async () => {
    const plan = buildFullPlan([subsystemSheet()])
    for (const allow of [
      { blockNames: false, inBlockText: false },
      { blockNames: true, inBlockText: true },
    ]) {
      const bytes = await renderModelToPdf(plan, opts({ allowTruncation: allow }), ctx)
      const doc = await PDFDocument.load(bytes)
      expect(doc.getPageCount()).toBe(3)
    }
  })
})

describe('pdf rendering', () => {
  test('renders a subsystem with port names without throwing', async () => {
    const sub = block('sub', 'subsystem', {
      showPortNames: true,
      inputPorts: ['force', 'mass'],
      outputPorts: ['pos'],
      sheets: [],
    })
    const plan = buildFullPlan([{ id: 'm', name: 'M', blocks: [sub], connections: [] }])
    const bytes = await renderModelToPdf(plan, opts(), ctx)
    expect(bytes.length).toBeGreaterThan(0)
  })

  test('reserves horizontal room for port labels in the sheet bounds', async () => {
    // Two identical models, one with labels enabled: the labelled one needs
    // more width, so at fit-scaling it must render at a smaller scale.
    const mk = (showPortNames: boolean) => buildFullPlan([{
      id: 'm', name: 'M',
      blocks: [block('sub', 'subsystem', {
        showPortNames, inputPorts: ['in'], outputPorts: ['out'], sheets: [],
      })],
      connections: [],
    }])
    const plain = await renderModelToPdf(mk(false), opts({ scaling: 'fit' }), ctx)
    const labelled = await renderModelToPdf(mk(true), opts({ scaling: 'fit' }), ctx)
    // Both valid; the labelled one carries extra text operators.
    expect(labelled.length).toBeGreaterThan(plain.length)
  })

  test('produces one page per sheet', async () => {
    const plan = buildFullPlan([simpleSheet('a', 'A'), simpleSheet('b', 'B')])
    const bytes = await renderModelToPdf(plan, opts(), ctx)
    const doc = await PDFDocument.load(bytes)
    expect(doc.getPageCount()).toBe(2)
  })

  test('emits a valid PDF with the model name as title', async () => {
    const plan = buildFullPlan([simpleSheet()])
    const bytes = await renderModelToPdf(plan, opts(), ctx)
    expect(Buffer.from(bytes.slice(0, 5)).toString()).toBe('%PDF-')
    const doc = await PDFDocument.load(bytes)
    expect(doc.getTitle()).toBe('Test Model')
  })

  test('honours page size and orientation', async () => {
    const plan = buildFullPlan([simpleSheet()])
    const bytes = await renderModelToPdf(
      plan, opts({ pageSizeId: 'a3', orientation: 'landscape' }), ctx)
    const doc = await PDFDocument.load(bytes)
    const { width, height } = doc.getPage(0).getSize()
    expect(width).toBeGreaterThan(height)
    expect(width).toBeCloseTo(1190.55, 0)
  })

  test('subsystem summaries are omitted by default', async () => {
    const plan = buildFullPlan([subsystemSheet()])
    const bytes = await renderModelToPdf(plan, opts(), ctx)
    const doc = await PDFDocument.load(bytes)
    expect(doc.getPageCount()).toBe(3) // three sheets, no summary
  })

  test('subsystem summaries add one page per subsystem when enabled', async () => {
    const plan = buildFullPlan([subsystemSheet()])
    const bytes = await renderModelToPdf(
      plan, opts({ includeSubsystemSummaries: true }), ctx)
    const doc = await PDFDocument.load(bytes)
    expect(doc.getPageCount()).toBe(4) // three sheets + one summary
  })

  test('renders without a rasterizer by falling back to transliteration', async () => {
    const sheet = {
      id: 'm', name: 'M',
      blocks: [block('s', 'sum', { signs: '++' }), block('i', 'integrator')],
      connections: [],
    }
    const plan = buildFullPlan([sheet])
    const bytes = await renderModelToPdf(plan, opts(), ctx)
    expect(bytes.length).toBeGreaterThan(0)
  })

  test('uses the rasterizer for non-WinAnsi glyphs when provided', async () => {
    // 1x1 transparent PNG
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      'base64')
    const calls: string[] = []
    const plan = buildFullPlan([{
      id: 'm', name: 'M',
      blocks: [block('s', 'sum'), block('mm', 'matrix_multiply')],
      connections: [],
    }])
    await renderModelToPdf(plan, opts(), {
      ...ctx,
      rasterizeGlyph: async (text) => {
        calls.push(text)
        return { png: new Uint8Array(png), width: 1, height: 1 }
      },
    })
    expect(calls).toContain('∑')
    expect(calls).toContain('⊗')
  })

  test('scale-to-fit does not throw on an oversized sheet', async () => {
    const blocks: BlockData[] = []
    for (let i = 0; i < 60; i++) blocks.push(block(`b${i}`, 'scale', {}, i * 300, i * 200))
    const plan = buildFullPlan([{ id: 'big', name: 'Big', blocks, connections: [] }])
    const bytes = await renderModelToPdf(plan, opts({ scaling: 'fit' }), ctx)
    expect(bytes.length).toBeGreaterThan(0)
  })

  test('handles an empty sheet without throwing', async () => {
    const plan = buildFullPlan([{ id: 'e', name: 'Empty', blocks: [], connections: [] }])
    const bytes = await renderModelToPdf(plan, opts(), ctx)
    const doc = await PDFDocument.load(bytes)
    expect(doc.getPageCount()).toBe(1)
  })

  test('skips wires whose endpoints are missing', async () => {
    const plan = buildFullPlan([{
      id: 'm', name: 'M',
      blocks: [block('a', 'scale')],
      connections: [wire('w', 'a', 0, 'ghost', 0)],
    }])
    const bytes = await renderModelToPdf(plan, opts(), ctx)
    expect(bytes.length).toBeGreaterThan(0)
  })
})

describe('wire bundles', () => {
  test('scalar types get one line', () => {
    expect(wireLineCount('double')).toBe(1)
    expect(wireLineCount('float')).toBe(1)
    expect(wireLineCount('long')).toBe(1)
    expect(wireLineCount('bool')).toBe(1)
  })

  test('1D arrays get two lines', () => {
    expect(wireLineCount('double[3]')).toBe(2)
    expect(wireLineCount('float[7]')).toBe(2)
    expect(wireLineCount('long[16]')).toBe(2)
  })

  test('matrices get three lines', () => {
    expect(wireLineCount('double[3][3]')).toBe(3)
    expect(wireLineCount('float[4][1]')).toBe(3)
    expect(wireLineCount('double[2][6]')).toBe(3)
  })

  test('unknown or missing types fall back to a single line', () => {
    // A wire whose type could not be resolved must not block the export.
    expect(wireLineCount(undefined)).toBe(1)
    expect(wireLineCount('')).toBe(1)
    expect(wireLineCount('not a real type')).toBe(1)
  })

  test('vector wires produce a larger PDF than scalar wires', async () => {
    // Byte-count is a coarse but honest signal that extra segments are being
    // emitted; testing pixel positions would need a raster comparison.
    const plan = buildFullPlan([simpleSheet()])
    const scalar = await renderModelToPdf(plan, opts(), ctx)
    const vector = await renderModelToPdf(plan, opts(), {
      ...ctx,
      signalTypes: new Map([
        ['w1', { type: 'double[3]' }],
        ['w2', { type: 'double[3]' }],
      ]),
    })
    expect(vector.length).toBeGreaterThan(scalar.length)
  })

  test('matrix wires produce a larger PDF than vector wires', async () => {
    const plan = buildFullPlan([simpleSheet()])
    const vector = await renderModelToPdf(plan, opts(), {
      ...ctx,
      signalTypes: new Map([
        ['w1', { type: 'double[3]' }],
        ['w2', { type: 'double[3]' }],
      ]),
    })
    const matrix = await renderModelToPdf(plan, opts(), {
      ...ctx,
      signalTypes: new Map([
        ['w1', { type: 'double[3][3]' }],
        ['w2', { type: 'double[3][3]' }],
      ]),
    })
    expect(matrix.length).toBeGreaterThan(vector.length)
  })

  test('a wire missing from signalTypes still renders (scalar fallback)', async () => {
    const plan = buildFullPlan([simpleSheet()])
    const bytes = await renderModelToPdf(plan, opts(), {
      ...ctx,
      // Deliberately empty: nothing looks up any wire.
      signalTypes: new Map(),
    })
    expect(bytes.length).toBeGreaterThan(0)
  })
})

describe('lookup-table plots', () => {
  const emptyBlock = (type: 'lookup_1d' | 'lookup_2d', params: Record<string, any> = {}) =>
    block('lk', type, params)

  // drawLookupPlot delegates every stroke to PDFPage; capturing those gives us
  // a deterministic view of what the plot emits without relying on byte counts.
  const capture = () => {
    const lines: any[] = []
    const page: any = {
      drawLine: (arg: any) => lines.push(arg),
    }
    return { page, lines }
  }

  test('emits two axis strokes plus one segment per interval for 1D', () => {
    const { page, lines } = capture()
    drawLookupPlot(
      page, emptyBlock('lookup_1d', { inputValues: [0, 1, 2, 3], outputValues: [0, 1, 4, 9] }),
      0, 0, 80, 60, 1,
    )
    // Two axes + three segments joining four points.
    expect(lines.length).toBe(5)
  })

  test('draws one polyline per row of the 2D table', () => {
    const { page, lines } = capture()
    drawLookupPlot(
      page, emptyBlock('lookup_2d', {
        input1Values: [0, 1, 2],
        input2Values: [0, 1, 2],
        outputTable: [[0, 1, 2], [1, 2, 3], [2, 3, 4]],
      }),
      0, 0, 80, 60, 1,
    )
    // Two axes + three rows x two segments = 8 strokes.
    expect(lines.length).toBe(8)
  })

  test('does not draw when there is no room in a shrunken block', () => {
    const { page, lines } = capture()
    drawLookupPlot(
      page, emptyBlock('lookup_1d', { inputValues: [0, 1], outputValues: [0, 1] }),
      0, 0, 10, 10, 1,
    )
    expect(lines.length).toBe(0)
  })

  test('tolerates degenerate flat output ranges without dividing by zero', () => {
    const { page, lines } = capture()
    // All outputs equal -> yRange 0. Should still draw axes and a horizontal line.
    drawLookupPlot(
      page, emptyBlock('lookup_1d', { inputValues: [0, 1, 2], outputValues: [3, 3, 3] }),
      0, 0, 80, 60, 1,
    )
    expect(lines.length).toBe(4)
    for (const l of lines) {
      expect(Number.isFinite(l.start.x)).toBe(true)
      expect(Number.isFinite(l.start.y)).toBe(true)
      expect(Number.isFinite(l.end.x)).toBe(true)
      expect(Number.isFinite(l.end.y)).toBe(true)
    }
  })

  test('renders a full model containing lookup blocks without throwing', async () => {
    const plan = buildFullPlan([{
      id: 'm', name: 'M',
      blocks: [
        block('l1', 'lookup_1d', { inputValues: [0, 1, 2], outputValues: [0, 1, 4] }),
        block('l2', 'lookup_2d', {
          input1Values: [0, 1, 2],
          input2Values: [0, 1],
          outputTable: [[0, 1, 2], [1, 2, 3]],
        }, 200, 0),
      ],
      connections: [],
    }])
    const bytes = await renderModelToPdf(plan, opts(), ctx)
    expect(bytes.length).toBeGreaterThan(0)
  })

  test('polynomial chunks omit unit coefficient for powers >= 1', () => {
    // 1*s^2 + 0*s + 3  ->  "s", sup "2", "+3"
    const chunks = polynomialChunks([1, 0, 3], 's', 10)
    expect(chunks.map(c => c.text)).toEqual(['s', '2', '+3'])
    expect(chunks[1].rise).toBeGreaterThan(0)   // "2" is a superscript
    expect(chunks[1].size).toBeLessThan(10)
    expect(chunks[0].rise).toBe(0)              // "s" sits on the baseline
  })

  test('polynomial chunks keep a leading unit constant', () => {
    // Constant term never drops its "1".
    expect(polynomialChunks([1], 's', 10).map(c => c.text)).toEqual(['1'])
  })

  test('polynomial chunks emit a leading minus for a negative first term', () => {
    // -2*s + 3
    expect(polynomialChunks([-2, 3], 's', 10).map(c => c.text)).toEqual(['-2s', '+3'])
  })

  test('polynomial chunks drop zero coefficients entirely', () => {
    // 0*s^2 + 4*s + 0 -> just "4s"
    expect(polynomialChunks([0, 4, 0], 's', 10).map(c => c.text)).toEqual(['4s'])
  })

  test('polynomial chunks yield a single "0" for an all-zero polynomial', () => {
    expect(polynomialChunks([0, 0, 0], 's', 10).map(c => c.text)).toEqual(['0'])
  })

  test('discrete transform uses z as the variable', () => {
    const chunks = polynomialChunks([1, -0.5], 'z', 10)
    expect(chunks.map(c => c.text)).toEqual(['z', '-0.5'])
  })

  test('drawTransferFunction emits fraction bar plus a chunk per term', async () => {
    const lines: any[] = []
    const texts: any[] = []
    const page: any = {
      drawLine: (arg: any) => lines.push(arg),
      drawText: (text: string, opts: any) => texts.push({ text, ...opts }),
    }
    // Real Helvetica so widthOfTextAtSize works.
    const doc = await PDFDocument.create()
    const helv = await doc.embedFont('Helvetica' as any)
    drawTransferFunction(
      page,
      block('tf', 'transfer_function', { numerator: [1, 2], denominator: [1, 3, 5] }),
      helv, 0, 60, 80, 60, 1,
    )
    // Exactly one fraction bar.
    expect(lines.length).toBe(1)
    // "s" and "+2" for the numerator; "s", sup "2", "+3s", "+5" for the denominator.
    const drawn = texts.map(t => t.text)
    expect(drawn).toEqual(['s', '+2', 's', '2', '+3s', '+5'])
  })

  test('drawTransferFunction picks z for discrete_transform blocks', async () => {
    const texts: any[] = []
    const page: any = {
      drawLine: () => {},
      drawText: (text: string, opts: any) => texts.push({ text, ...opts }),
    }
    const doc = await PDFDocument.create()
    const helv = await doc.embedFont('Helvetica' as any)
    drawTransferFunction(
      page,
      block('dt', 'discrete_transform', { numerator: [1], denominator: [1, -0.5] }),
      helv, 0, 60, 80, 60, 1,
    )
    expect(texts.map(t => t.text)).toEqual(['1', 'z', '-0.5'])
  })

  test('drawTransferFunction skips drawing at tiny scales', async () => {
    const lines: any[] = []
    const texts: any[] = []
    const page: any = {
      drawLine: (arg: any) => lines.push(arg),
      drawText: (text: string, opts: any) => texts.push({ text, ...opts }),
    }
    const doc = await PDFDocument.create()
    const helv = await doc.embedFont('Helvetica' as any)
    // scale so small the text would be unreadable
    drawTransferFunction(
      page,
      block('tf', 'transfer_function', { numerator: [1, 2], denominator: [1, 3] }),
      helv, 0, 60, 80, 60, 0.2,
    )
    expect(lines.length).toBe(0)
    expect(texts.length).toBe(0)
  })

  test('renders transfer function and discrete transform blocks in a full model', async () => {
    const plan = buildFullPlan([{
      id: 'm', name: 'M',
      blocks: [
        block('tf', 'transfer_function', { numerator: [1, 2], denominator: [1, 3, 5] }),
        block('dt', 'discrete_transform', { numerator: [1, 0.5], denominator: [1, -0.7] }, 200, 0),
      ],
      connections: [],
    }])
    const bytes = await renderModelToPdf(plan, opts(), ctx)
    expect(bytes.length).toBeGreaterThan(0)
  })

  test('transfer function blocks add content vs an empty block of the same size', async () => {
    const mk = (type: string) => buildFullPlan([{
      id: 'm', name: 'M',
      blocks: [block('b', type, { numerator: [1, 2, 3], denominator: [1, 4, 5, 6] })],
      connections: [],
    }])
    const empty = await renderModelToPdf(mk('scale'), opts(), ctx)
    const tf = await renderModelToPdf(mk('transfer_function'), opts(), ctx)
    const dt = await renderModelToPdf(mk('discrete_transform'), opts(), ctx)
    expect(tf.length).toBeGreaterThan(empty.length)
    expect(dt.length).toBeGreaterThan(empty.length)
  })

  test('lookup blocks make the PDF larger than empty blocks of the same size', async () => {
    // Sanity: the plot really is putting extra content into the page stream.
    const mk = (type: string) => buildFullPlan([{
      id: 'm', name: 'M',
      blocks: [block('b', type, {
        inputValues: [0, 1, 2, 3, 4],
        outputValues: [0, 1, 4, 9, 16],
        input1Values: [0, 1, 2, 3, 4],
        input2Values: [0, 1, 2],
        outputTable: [[0, 1, 2, 3, 4], [1, 2, 3, 4, 5], [2, 3, 4, 5, 6]],
      })],
      connections: [],
    }])
    const empty = await renderModelToPdf(mk('scale'), opts(), ctx)
    const lookup1 = await renderModelToPdf(mk('lookup_1d'), opts(), ctx)
    const lookup2 = await renderModelToPdf(mk('lookup_2d'), opts(), ctx)
    expect(lookup1.length).toBeGreaterThan(empty.length)
    expect(lookup2.length).toBeGreaterThan(lookup1.length)
  })
})
