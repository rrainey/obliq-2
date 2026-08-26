// Browser-side glyph rasterisation for PDF export.
//
// The PDF standard-14 fonts only cover WinAnsiEncoding, which excludes most of
// the symbols the block library uses (∑, ∫, ⊗, →, ω, …). Rather than embed a
// full Unicode font, those few glyphs are drawn to a canvas at high resolution
// and embedded as small bitmaps.
//
// This is a deliberate stopgap: see `glyphWorkList()` in blockGlyphs.ts for the
// set of block types that still depend on it. Authoring real SVG glyphs for
// those blocks removes this path entirely.

/** Supersampling factor. Glyphs are tiny, so a high factor stays cheap. */
const RASTER_SCALE = 8

const FONT_STACK =
  '"DejaVu Sans", "Segoe UI Symbol", "Noto Sans Symbols 2", "Apple Symbols", ' +
  'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif'

export interface RasterizedGlyph {
  png: Uint8Array
  width: number
  height: number
}

function dataUrlToBytes(dataUrl: string): Uint8Array {
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1)
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

/**
 * Build a rasterizer bound to the current document. Returns null for any glyph
 * it cannot draw, letting the renderer fall back to transliteration.
 */
export function createGlyphRasterizer(): (
  text: string,
  fontSizePt: number,
) => Promise<RasterizedGlyph | null> {
  return async (text: string, fontSizePt: number) => {
    if (typeof document === 'undefined') return null

    const px = Math.max(8, fontSizePt) * RASTER_SCALE
    const measureCanvas = document.createElement('canvas')
    const measureCtx = measureCanvas.getContext('2d')
    if (!measureCtx) return null

    measureCtx.font = `${px}px ${FONT_STACK}`
    const metrics = measureCtx.measureText(text)
    const ascent = metrics.actualBoundingBoxAscent || px * 0.8
    const descent = metrics.actualBoundingBoxDescent || px * 0.25
    const width = Math.ceil(Math.max(1, metrics.width)) + 4
    const height = Math.ceil(ascent + descent) + 4
    if (width <= 0 || height <= 0) return null

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) return null

    ctx.font = `${px}px ${FONT_STACK}`
    ctx.textBaseline = 'alphabetic'
    ctx.fillStyle = '#1a1a1a'
    ctx.fillText(text, 2, ascent + 2)

    try {
      return { png: dataUrlToBytes(canvas.toDataURL('image/png')), width, height }
    } catch {
      return null // tainted canvas or unsupported encoder
    }
  }
}

/** Hand a generated PDF to the browser as a download. */
export function downloadPdf(bytes: Uint8Array, fileName: string): void {
  const name = fileName.toLowerCase().endsWith('.pdf') ? fileName : `${fileName}.pdf`
  // Copy into a fresh buffer: pdf-lib may hand back a view over a larger pool.
  const blob = new Blob([new Uint8Array(bytes)], { type: 'application/pdf' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = name
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  // Revoke on the next tick so the click has been dispatched.
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

/** Turn a model name into a safe default file name. */
export function defaultPdfFileName(modelName: string): string {
  const base = (modelName || 'model')
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .toLowerCase() || 'model'
  return `${base}.pdf`
}
