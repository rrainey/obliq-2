/**
 * @jest-environment node
 *
 * The PDFs in reference-models/ are what `npm run obliq:pdf` writes for the
 * committed models, with the options and the fixed date of the builder
 * (SHIPPED_PDF_OPTIONS, SHIPPED_PDF_DATE). The comparison is byte for byte:
 * with a fixed date the output does not depend on the clock, the locale or
 * the time zone, and Node 18, 20 and 22 gave the same bytes. fpv-plant.test.ts
 * checks the models against the builder, so together the PDFs follow the builder.
 *
 * To regenerate: npx tsx --tsconfig tsconfig.json scripts/build-fpv-reference-model.ts
 */
import * as fs from 'fs'
import * as path from 'path'
import { PDFDocument } from 'pdf-lib'
import { SHIPPED_PDF_DATE, SHIPPED_PDF_OPTIONS } from '../../scripts/build-fpv-reference-model'
import { defaultPdfPath, modelFileToPdf, resolvePrintDate } from '../../scripts/lib/pdfExport'

jest.setTimeout(120000)

const DIR = path.join(__dirname, '..', '..', 'reference-models')
const REGENERATE = 'npx tsx --tsconfig tsconfig.json scripts/build-fpv-reference-model.ts'

describe('shipped reference-model PDFs', () => {
  test('each reference model has a PDF beside it, and there is no other PDF', () => {
    const models = fs.readdirSync(DIR).filter(f => f.endsWith('.json')).sort()
    expect(Object.keys(SHIPPED_PDF_OPTIONS).sort()).toEqual(models)
    const pdfs = fs.readdirSync(DIR).filter(f => f.toLowerCase().endsWith('.pdf')).sort()
    expect(pdfs).toEqual(models.map(m => path.basename(defaultPdfPath(m))).sort())
  })

  test.each(Object.entries(SHIPPED_PDF_OPTIONS))('%s: the committed PDF is what the builder writes', async (file, options) => {
    const pdfFile = defaultPdfPath(path.join(DIR, file))
    expect(fs.existsSync(pdfFile)).toBe(true)
    const committed = fs.readFileSync(pdfFile)
    // The vehicle comes from the file beside the test models, not from a store
    const result = await modelFileToPdf(path.join(DIR, file), options, resolvePrintDate(SHIPPED_PDF_DATE), { home: path.join(DIR, 'no-store-here') })
    const same = Buffer.from(result.bytes).equals(committed)
    if (!same) {
      // Say which part differs, then fail with the fix
      const [a, b] = [await PDFDocument.load(committed, { updateMetadata: false }), await PDFDocument.load(result.bytes, { updateMetadata: false })]
      expect({ pages: a.getPageCount(), title: a.getTitle() }).toEqual({ pages: b.getPageCount(), title: b.getTitle() })
    }
    expect(same ? 'up to date' : `${path.basename(pdfFile)} is stale: run ${REGENERATE}`).toBe('up to date')
    expect(result.pageCount).toBe((await PDFDocument.load(committed)).getPageCount())
  })
})
