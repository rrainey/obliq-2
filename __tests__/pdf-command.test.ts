/**
 * @jest-environment node
 *
 * npm run obliq:pdf (scripts/obliq-pdf.ts) and its helper scripts/lib/pdfExport.ts:
 * model files in both shapes, pages for each scope, reproducible dates, the
 * output paths, model references, and the errors.
 */
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { spawnSync } from 'child_process'
import { PDFDocument } from 'pdf-lib'
import {
  PdfExportError,
  defaultPdfPath,
  findSheetId,
  formatFixedFooterDate,
  loadModelForPdf,
  modelFileToPdf,
  resolvePrintDate,
} from '../scripts/lib/pdfExport'
import { outputPaths } from '../scripts/obliq-pdf'
import { publishReferencedModels } from '@/lib/referencedModels'
import { propagateSignalTypesMultiSheet } from '@/lib/signalTypePropagation'

jest.setTimeout(60000)

const block = (id: string, type: string, parameters: Record<string, any> = {}, x = 0, y = 0) =>
  ({ id, type, name: id, position: { x, y }, parameters })
const wire = (id: string, s: string, sp: number, t: string, tp: number) =>
  ({ id, sourceBlockId: s, sourcePortIndex: sp, targetBlockId: t, targetPortIndex: tp })

/** Inner: a 3-vector constant to its one Output Port. */
const inner = {
  name: 'Inner',
  data: {
    sheets: [{
      id: 'inner_main', name: 'Main',
      blocks: [block('k', 'source', { value: [1, 2, 3], dataType: 'double[3]' }), block('y', 'output_port', { portName: 'y', dataType: 'double[3]' }, 200, 0)],
      connections: [wire('iw', 'k', 0, 'y', 0)],
    }],
  },
}

/**
 * Host: Main has a subsystem with two sheets and a model reference to Inner,
 * whose output goes to an Output Port; Tests is a second top-level sheet.
 */
const host = {
  name: 'Host Model',
  data: {
    sheets: [
      {
        id: 'main', name: 'Main',
        blocks: [
          block('u', 'input_port', { portName: 'u' }),
          block('sub', 'subsystem', {
            inputPorts: ['u'], outputPorts: [],
            sheets: [
              { id: 'sub_a', name: 'Sub A', blocks: [block('si', 'input_port', { portName: 'u' })], connections: [] },
              { id: 'sub_b', name: 'Sub B', blocks: [block('g', 'scale', { gain: 1.3333333333333333 })], connections: [] },
            ],
          }, 200, 0),
          block('ref', 'subsystem', {
            modelRef: { modelId: 'some-store-id', version: null, name: 'Inner' },
            inputPorts: [], outputPorts: ['y'], sheets: [],
          }, 0, 200),
          block('out', 'output_port', { portName: 'y' }, 300, 200),
        ],
        connections: [wire('w_u', 'u', 0, 'sub', 0), wire('w_ref', 'ref', 0, 'out', 0)],
      },
      { id: 'tests', name: 'Tests', blocks: [block('e', 'evaluate', { expression: '(in(0) > 0.5) ? in(1) : in(2)' })], connections: [] },
    ],
  },
}

let tmp: string
let hostFile: string
const noStore = () => path.join(tmp, 'no-store')
const DATE = resolvePrintDate('2026-11-12T09:30:00Z')

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'obliq-pdf-'))
  hostFile = path.join(tmp, 'host.json')
  fs.writeFileSync(hostFile, JSON.stringify(host))
  fs.writeFileSync(path.join(tmp, 'inner.json'), JSON.stringify(inner))
})

afterEach(() => {
  publishReferencedModels({})
  fs.rmSync(tmp, { recursive: true, force: true })
})

const pages = async (bytes: Uint8Array) => (await PDFDocument.load(bytes)).getPageCount()

describe('obliq:pdf helper', () => {
  test('one page for each sheet of the model, nested sheets included; a model reference prints as its block only', async () => {
    const r = await modelFileToPdf(hostFile, {}, DATE, { home: noStore() })
    expect(r.plan.sheets.map(s => s.path.join('/'))).toEqual(['Main', 'Main/sub/Sub A', 'Main/sub/Sub B', 'Tests'])
    expect(r.pageCount).toBe(4)
    expect(await pages(r.bytes)).toBe(4)
  })

  test('page count for each scope, with --sheet by name, path or id', async () => {
    const count = async (opts: object) => (await modelFileToPdf(hostFile, opts, DATE, { home: noStore() })).pageCount
    expect(await count({ scope: 'subsystem', sheet: 'Sub B' })).toBe(2)
    expect(await count({ scope: 'sheet', sheet: 'Main/sub/Sub B' })).toBe(1)
    expect(await count({ scope: 'sheet', sheet: 'tests' })).toBe(1)
    // A top-level sheet has no subsystem: the subsystem scope prints the model
    expect(await count({ scope: 'subsystem' })).toBe(4)
    // A summary page before the sheets of each subsystem
    const withSummaries = await modelFileToPdf(hostFile, { includeSubsystemSummaries: true }, DATE, { home: noStore() })
    expect(withSummaries.pageCount).toBe(5)
    expect(await pages(withSummaries.bytes)).toBe(5)
  })

  test('the bare model shape and the {name, data} shape give the same pages; the bare name comes from the file', async () => {
    const bare = path.join(tmp, 'bare-host.json')
    fs.writeFileSync(bare, JSON.stringify(host.data))
    const a = loadModelForPdf(hostFile, { home: noStore() })
    const b = loadModelForPdf(bare, { home: noStore() })
    expect(a.name).toBe('Host Model')
    expect(b.name).toBe('bare-host')
    expect(b.sheets).toEqual(a.sheets)
  })

  test('--date: two runs give the same bytes, and the date is in the metadata', async () => {
    const one = await modelFileToPdf(hostFile, {}, DATE, { home: noStore() })
    const two = await modelFileToPdf(hostFile, {}, resolvePrintDate('2026-11-12T09:30:00Z'), { home: noStore() })
    expect(Buffer.from(two.bytes).equals(Buffer.from(one.bytes))).toBe(true)
    const doc = await PDFDocument.load(one.bytes, { updateMetadata: false })
    expect(doc.getCreationDate()?.toISOString()).toBe('2026-11-12T09:30:00.000Z')
    expect(doc.getModificationDate()?.toISOString()).toBe('2026-11-12T09:30:00.000Z')
    expect(doc.getTitle()).toBe('Host Model')
    // Another date gives another file
    const other = await modelFileToPdf(hostFile, {}, resolvePrintDate('2026-11-13'), { home: noStore() })
    expect(Buffer.from(other.bytes).equals(Buffer.from(one.bytes))).toBe(false)
  })

  test('print dates: --date, then SOURCE_DATE_EPOCH, else the clock', () => {
    expect(resolvePrintDate('2026-11-12').printedAt.toISOString()).toBe('2026-11-12T00:00:00.000Z')
    // A time without a zone is UTC, so the result does not depend on TZ
    expect(resolvePrintDate('2026-11-12T09:30').printedAt.toISOString()).toBe('2026-11-12T09:30:00.000Z')
    expect(resolvePrintDate('2026-11-12T09:30:00+02:00').printedAt.toISOString()).toBe('2026-11-12T07:30:00.000Z')
    expect(resolvePrintDate('2026-11-12').footerDate).toBe('Nov 12, 2026, 00:00 UTC')
    expect(resolvePrintDate(undefined, { SOURCE_DATE_EPOCH: '1794441600' }).printedAt.toISOString()).toBe('2026-11-12T00:00:00.000Z')
    expect(resolvePrintDate('2026-01-01', { SOURCE_DATE_EPOCH: '1794441600' }).printedAt.toISOString()).toBe('2026-01-01T00:00:00.000Z')
    const now = new Date('2030-05-06T07:08:09Z')
    expect(resolvePrintDate(undefined, {}, () => now)).toEqual({ printedAt: now })
    expect(() => resolvePrintDate('12/11/2026')).toThrow(PdfExportError)
    expect(() => resolvePrintDate('2026-13-45')).toThrow(/ISO 8601/)
    expect(() => resolvePrintDate(undefined, { SOURCE_DATE_EPOCH: 'yesterday' })).toThrow(/SOURCE_DATE_EPOCH/)
    expect(formatFixedFooterDate(new Date('2026-03-04T05:06:00Z'))).toBe('Mar 4, 2026, 05:06 UTC')
  })

  test('output paths: beside the model by default; -o is a file for one model, a folder for several', () => {
    expect(defaultPdfPath('reference-models/fpv-vehicle.json')).toBe('reference-models/fpv-vehicle.pdf')
    expect(defaultPdfPath('a/Model.JSON')).toBe('a/Model.pdf')
    expect(defaultPdfPath('a/model')).toBe('a/model.pdf')
    expect(outputPaths(['a/x.json'], undefined)).toEqual(['a/x.pdf'])
    expect(outputPaths(['a/x.json'], 'out.pdf')).toEqual(['out.pdf'])
    expect(outputPaths(['a/x.json'], tmp)).toEqual([path.join(tmp, 'x.pdf')])
    expect(outputPaths(['a/x.json', 'b/y.json'], tmp)).toEqual([path.join(tmp, 'x.pdf'), path.join(tmp, 'y.pdf')])
    expect(() => outputPaths(['a/x.json', 'b/y.json'], path.join(tmp, 'out.pdf'))).toThrow(/existing folder/)
    expect(() => outputPaths(['a/x.json', 'b/x.json'], tmp)).toThrow(/same output file/)
  })

  test('a model reference resolves from the files beside the model, by name, and types the wires from the block', () => {
    const model = loadModelForPdf(hostFile, { home: noStore() })
    expect(Object.values(model.referenced).map(e => [e.name, e.status])).toEqual([['Inner', 'ok']])
    const typeOf = () => propagateSignalTypesMultiSheet(model.sheets.map(s => ({ blocks: s.blocks, connections: s.connections }))).signalTypes.get('w_ref')?.type
    // Without the referenced model, the wire has no known vector type
    publishReferencedModels({})
    expect(typeOf()).not.toBe('double[3]')
    publishReferencedModels(model.referenced)
    const types = propagateSignalTypesMultiSheet(model.sheets.map(s => ({ blocks: s.blocks, connections: s.connections })))
    expect(types.signalTypes.get('w_ref')?.type).toBe('double[3]')
  })

  test('errors: a missing file, a file that is not a model, an unknown sheet, an unresolved reference, an unknown page size', async () => {
    const load = { home: noStore() }
    await expect(modelFileToPdf(path.join(tmp, 'nope.json'), {}, DATE, load)).rejects.toThrow(/model file not found/)
    fs.writeFileSync(path.join(tmp, 'bad.json'), '{ not json')
    await expect(modelFileToPdf(path.join(tmp, 'bad.json'), {}, DATE, load)).rejects.toThrow(/not valid JSON/)
    fs.writeFileSync(path.join(tmp, 'other.json'), JSON.stringify({ foo: 1 }))
    await expect(modelFileToPdf(path.join(tmp, 'other.json'), {}, DATE, load)).rejects.toThrow(/sheets/)
    await expect(modelFileToPdf(hostFile, { scope: 'sheet', sheet: 'Nowhere' }, DATE, load)).rejects.toThrow(/no sheet has the id, path or name "Nowhere"/)
    await expect(modelFileToPdf(hostFile, { pageSizeId: 'b5' }, DATE, load)).rejects.toThrow(/unknown page size "b5"/)
    fs.rmSync(path.join(tmp, 'inner.json'))
    await expect(modelFileToPdf(hostFile, {}, DATE, load)).rejects.toThrow(/cannot resolve the model reference to "Inner"/)
  })

  test('findSheetId: the first top-level sheet by default; an ambiguous name asks for the path', () => {
    const sub = (id: string, sheetId: string) => block(id, 'subsystem', { sheets: [{ id: sheetId, name: 'Inner', blocks: [], connections: [] }] })
    const sheets = [{ id: 'a', name: 'Main', blocks: [sub('s1', 'x1'), sub('s2', 'x2')], connections: [] }]
    expect(findSheetId(sheets, undefined)).toBe('a')
    expect(findSheetId(sheets, 'Main')).toBe('a')
    expect(findSheetId(sheets, 'Main/s2/Inner')).toBe('x2')
    expect(() => findSheetId(sheets, 'Inner')).toThrow(/more than one sheet matches "Inner".*Use the path/)
  })
})

describe('obliq:pdf command', () => {
  const ROOT = path.join(__dirname, '..')
  const run = (...args: string[]) =>
    spawnSync(process.execPath, [path.join(ROOT, 'node_modules', 'tsx', 'dist', 'cli.mjs'), path.join(ROOT, 'scripts', 'obliq-pdf.ts'), ...args], {
      cwd: ROOT, encoding: 'utf8', env: { ...process.env, OBLIQ_HOME: noStore(), SOURCE_DATE_EPOCH: '' },
    })

  test('writes the PDF beside the model by default, and the same bytes with the same --date', () => {
    const r = run(hostFile, '--date', '2026-11-12')
    expect(r.stderr).toBe('')
    expect(r.status).toBe(0)
    const out = path.join(tmp, 'host.pdf')
    expect(r.stdout).toContain(`Wrote ${out} (4 pages`)
    const first = fs.readFileSync(out)
    expect(run(hostFile, '--date', '2026-11-12', '-o', path.join(tmp, 'again.pdf')).status).toBe(0)
    expect(fs.readFileSync(path.join(tmp, 'again.pdf')).equals(first)).toBe(true)
  })

  test('exits 1 with a clear message on a bad option, an unknown sheet or an unresolved reference', () => {
    const bad = run(hostFile, '--scaling', '75')
    expect(bad.status).toBe(1)
    expect(bad.stderr).toContain('Error: --scaling must be 100, 50 or fit')
    const sheet = run(hostFile, '--scope', 'sheet', '--sheet', 'Nowhere')
    expect(sheet.status).toBe(1)
    expect(sheet.stderr).toContain('Error: no sheet has the id, path or name "Nowhere"')
    fs.rmSync(path.join(tmp, 'inner.json'))
    const ref = run(hostFile)
    expect(ref.status).toBe(1)
    expect(ref.stderr).toContain('cannot resolve the model reference to "Inner"')
    expect(fs.existsSync(path.join(tmp, 'host.pdf'))).toBe(false)
  })

  test('--help prints the usage and exits 0', () => {
    const r = run('--help')
    expect(r.status).toBe(0)
    expect(r.stdout).toContain('Usage: npm run obliq:pdf')
    expect(r.stdout).toContain('--date <ISO 8601>')
  })
})
