/**
 * Build multi-column CSV from stored SimulationResults (post-run UI data).
 *
 * The run path destroys WasmSimulationEngine after collecting samples, so export
 * must use SimulationResults / globalSimulationResults — not a live engine.
 */

import { BlockData } from '@/components/BlockNode'
import { SimulationResults } from '@/lib/simulationTypes'
import { SignalValue } from '@/lib/modelSchema'

export interface ExportSimulationCsvOptions {
  /** Include signal_display blocks as columns (default true) */
  includeDisplays?: boolean
  /** Include signal_logger blocks as columns (default true) */
  includeLoggers?: boolean
}

/**
 * Export logger/display time series from SimulationResults as CSV.
 * Column 1 is `time`; subsequent columns use block names (sanitized for CSV).
 *
 * @returns CSV string, or null if nothing to export
 */
export function exportSimulationResultsAsCSV(
  results: SimulationResults | null | undefined,
  blocks: BlockData[],
  options: ExportSimulationCsvOptions = {}
): string | null {
  if (!results || !results.timePoints?.length || !results.signalData?.size) {
    return null
  }

  const includeDisplays = options.includeDisplays !== false
  const includeLoggers = options.includeLoggers !== false

  const blockById = new Map(blocks.map(b => [b.id, b]))
  const columns: { name: string; values: SignalValue[] }[] = []

  for (const [blockId, values] of results.signalData.entries()) {
    if (!values || values.length === 0) continue
    const block = blockById.get(blockId)
    if (!block) continue
    if (block.type === 'signal_logger' && !includeLoggers) continue
    if (block.type === 'signal_display' && !includeDisplays) continue
    if (block.type !== 'signal_logger' && block.type !== 'signal_display') continue

    const name = sanitizeCsvHeader(block.name || blockId)
    columns.push({ name, values })
  }

  if (columns.length === 0) {
    return null
  }

  const headers: string[] = ['time']
  const elementSizes: number[] = []

  for (const col of columns) {
    const first = col.values[0]
    const size = elementCount(first)
    elementSizes.push(size)
    if (size === 1) {
      headers.push(col.name)
    } else if (isMatrixSample(first)) {
      const m = first as number[][]
      const rows = m.length
      const cols = m[0]?.length ?? 0
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          headers.push(`${col.name}[${r}][${c}]`)
        }
      }
    } else {
      for (let i = 0; i < size; i++) {
        headers.push(`${col.name}[${i}]`)
      }
    }
  }

  const lines: string[] = [headers.join(',')]
  const n = results.timePoints.length

  for (let i = 0; i < n; i++) {
    const row: string[] = [formatNumber(results.timePoints[i])]
    for (let c = 0; c < columns.length; c++) {
      const sample = i < columns[c].values.length ? columns[c].values[i] : undefined
      row.push(...formatSampleCells(sample, elementSizes[c]))
    }
    lines.push(row.join(','))
  }

  return lines.join('\n')
}

/**
 * Merge several sheets' SimulationResults into one CSV (shared time base of the
 * longest series). Column names are prefixed with sheet name when provided.
 */
export function exportGlobalSimulationResultsAsCSV(
  globalResults: Map<string, SimulationResults> | null | undefined,
  sheets: Array<{ id: string; name: string; blocks: BlockData[] }>,
  options: ExportSimulationCsvOptions = {}
): string | null {
  if (!globalResults || globalResults.size === 0) return null

  // Single sheet: plain export
  if (globalResults.size === 1) {
    const [sheetId, results] = Array.from(globalResults.entries())[0]
    const sheet = sheets.find(s => s.id === sheetId)
    return exportSimulationResultsAsCSV(results, sheet?.blocks ?? [], options)
  }

  // Multi-sheet: prefix column names with sheet name
  // Build a synthetic results object by renaming columns via fake block names
  const fakeBlocks: BlockData[] = []
  const merged: SimulationResults = {
    timePoints: [],
    finalTime: 0,
    signalData: new Map()
  }

  for (const [sheetId, results] of globalResults) {
    const sheet = sheets.find(s => s.id === sheetId)
    if (!sheet) continue
    if (results.timePoints.length > merged.timePoints.length) {
      merged.timePoints = results.timePoints
      merged.finalTime = results.finalTime
    }
    for (const [blockId, values] of results.signalData) {
      const block = sheet.blocks.find(b => b.id === blockId)
      if (!block) continue
      if (block.type !== 'signal_logger' && block.type !== 'signal_display') continue
      const fakeId = `${sheetId}__${blockId}`
      fakeBlocks.push({
        ...block,
        id: fakeId,
        name: `${sheet.name}_${block.name}`
      })
      merged.signalData.set(fakeId, values)
    }
  }

  return exportSimulationResultsAsCSV(merged, fakeBlocks, options)
}

function sanitizeCsvHeader(name: string): string {
  return name.replace(/[,\r\n"]/g, '_')
}

function elementCount(sample: SignalValue | undefined): number {
  if (sample === undefined || sample === null) return 1
  if (typeof sample === 'number' || typeof sample === 'boolean') return 1
  if (Array.isArray(sample)) {
    if (sample.length > 0 && Array.isArray(sample[0])) {
      const m = sample as number[][]
      return m.length * (m[0]?.length ?? 0)
    }
    return sample.length
  }
  return 1
}

function isMatrixSample(sample: SignalValue | undefined): boolean {
  return (
    Array.isArray(sample) &&
    sample.length > 0 &&
    Array.isArray((sample as unknown[])[0])
  )
}

function formatNumber(v: number): string {
  if (!Number.isFinite(v)) return ''
  // Keep enough precision for residual scripts; avoid huge scientific noise
  return Number.isInteger(v) ? String(v) : v.toFixed(6)
}

function formatSampleCells(
  sample: SignalValue | undefined,
  expectedSize: number
): string[] {
  if (sample === undefined || sample === null) {
    return Array(expectedSize).fill('')
  }
  if (typeof sample === 'boolean') {
    return [sample ? '1' : '0']
  }
  if (typeof sample === 'number') {
    return [formatNumber(sample)]
  }
  if (Array.isArray(sample)) {
    if (sample.length > 0 && Array.isArray(sample[0])) {
      const cells: string[] = []
      for (const row of sample as number[][]) {
        for (const v of row) {
          cells.push(typeof v === 'number' ? formatNumber(v) : '')
        }
      }
      return cells
    }
    return (sample as number[]).map(v =>
      typeof v === 'number' ? formatNumber(v) : ''
    )
  }
  return ['']
}
