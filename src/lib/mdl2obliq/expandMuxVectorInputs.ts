/**
 * Post-emit pass: expand vector/matrix wires into Mux ports so Obliq's
 * scalar-only Mux validation matches Simulink Mux expand semantics.
 *
 * For each mux input of width W>1, insert a demux and replace that one port
 * with W scalar ports (output width grows accordingly).
 */

import { BlockData } from '@/components/BlockNode'
import { WireData } from '@/components/Wire'
import { parseType } from '@/lib/typeValidator'
import { propagateSignalTypesMultiSheet } from '@/lib/signalTypePropagation'


export interface ExpandMuxResult {
  expandedMuxes: number
  insertedDemuxes: number
}

function elementWidth(typeStr: string | undefined): number {
  if (!typeStr) return 1
  try {
    const p = parseType(typeStr)
    // Column matrix e.g. double[4][1] (quaternion) → expand like a vector
    if (p.isMatrix && p.rows && p.cols === 1) return p.rows
    if (p.isMatrix && p.rows === 1 && p.cols) return p.cols
    // Full 2D matrices are not Simulink Mux-expand targets here
    if (p.isMatrix) return 1
    if (p.isArray && p.arraySize) return p.arraySize
    return 1
  } catch {
    return 1
  }
}

/** True if this type should be demuxed into scalar Mux ports. */
function isExpandableVectorType(typeStr: string | undefined): boolean {
  if (!typeStr || !typeStr.includes('[')) return false
  try {
    const p = parseType(typeStr)
    if (p.isArray && (p.arraySize || 0) > 1) return true
    if (p.isMatrix && p.rows && p.cols === 1 && p.rows > 1) return true
    if (p.isMatrix && p.cols && p.rows === 1 && p.cols > 1) return true
    return false
  } catch {
    return false
  }
}

function nid(prefix: string, counter: { n: number }): string {
  return `${prefix}_${counter.n++}`
}

/** Highest numeric id suffix already used (blocks + wires), so iterative expand passes do not reuse wire_900001 etc. */
function nextIdStart(model: {
  sheets: Array<{ blocks?: BlockData[]; connections?: WireData[]; [k: string]: unknown }>
}): number {
  let max = 899999
  const consider = (id: unknown) => {
    const m = String(id ?? '').match(/(\d+)$/)
    if (m) max = Math.max(max, Number(m[1]))
  }
  const walk = (sheets: typeof model.sheets) => {
    for (const s of sheets || []) {
      for (const b of s.blocks || []) {
        consider(b.id)
        if (b.type === 'subsystem' && Array.isArray(b.parameters?.sheets)) {
          walk(b.parameters.sheets)
        }
      }
      for (const c of s.connections || []) {
        consider(c.id)
      }
    }
  }
  walk(model.sheets)
  return max + 1
}

/**
 * Mutates model sheets in place. Returns stats.
 */
export function expandMuxVectorInputs(model: {
  sheets: Array<{ blocks: BlockData[]; connections: WireData[]; [k: string]: unknown }>
}): ExpandMuxResult {
  let expandedMuxes = 0
  let insertedDemuxes = 0
  const idCounter = { n: nextIdStart(model) }

  // Type-prop across nested sheets so subsystem outs are known
  const prop = propagateSignalTypesMultiSheet(
    model.sheets.map(s => ({ blocks: s.blocks, connections: s.connections }))
  )
  const types = prop.blockOutputTypes

  // Walk nested sheets in-place (must mutate original sheet objects, not copies)
  const sheets: Array<{ blocks: BlockData[]; connections: WireData[] }> = []
  const visitSheet = (sh: { blocks?: BlockData[]; connections?: WireData[] }) => {
    if (!sh.blocks || !sh.connections) return
    sheets.push(sh as { blocks: BlockData[]; connections: WireData[] })
    for (const b of sh.blocks) {
      if (b.type === 'subsystem' && Array.isArray(b.parameters?.sheets)) {
        for (const nested of b.parameters.sheets) visitSheet(nested)
      }
    }
  }
  for (const s of model.sheets) visitSheet(s)

  for (const sheet of sheets) {
    const muxes = sheet.blocks.filter(b => b.type === 'mux')
    for (const mux of muxes) {
      // Skip matrix-assembly muxes (e.g. Create 3x3 → double[3][3])
      const declared = String(mux.parameters?.outputType || '')
      if (declared.includes('][')) continue
      const rows = Number(mux.parameters?.rows || 1)
      if (rows > 1) continue

      const inbound = sheet.connections
        .filter(c => c.targetBlockId === mux.id && (c.targetPortIndex ?? 0) >= 0)
        .sort((a, b) => (a.targetPortIndex ?? 0) - (b.targetPortIndex ?? 0))

      if (inbound.length === 0) continue

      const portWidths: number[] = []
      let needsExpand = false
      for (const c of inbound) {
        const srcKey = `${c.sourceBlockId}:${c.sourcePortIndex ?? 0}`
        const srcBlk = sheet.blocks.find(b => b.id === c.sourceBlockId)
        // Prefer propagated type; fall back to declared port/source dataType
        let t =
          types.get(srcKey) ||
          (typeof srcBlk?.parameters?.dataType === 'string'
            ? srcBlk.parameters.dataType
            : undefined) ||
          (typeof srcBlk?.parameters?.outputType === 'string'
            ? srcBlk.parameters.outputType
            : undefined)
        if (!isExpandableVectorType(t)) {
          portWidths.push(1)
          continue
        }
        const w = elementWidth(t)
        portWidths.push(w)
        if (w > 1) needsExpand = true
      }
      if (!needsExpand) continue

      // Build new port list: each old port → W scalar ports
      const newInbound: WireData[] = []
      let newPort = 0
      for (let i = 0; i < inbound.length; i++) {
        const c = inbound[i]
        const w = portWidths[i]
        if (w <= 1) {
          newInbound.push({
            ...c,
            id: c.id,
            targetPortIndex: newPort++
          })
          continue
        }

        const demuxId = nid('demux', idCounter)
        // Include demuxId so iterative expand / multiple Muxes with the same
        // display name cannot collide in flattened C struct members
        // (e.g. two root-level "Mux_expand_9" → duplicate Mux_expand_9_0).
        const demuxName = `${mux.name}_expand_${i}_${demuxId}`
        const demux: BlockData = {
          id: demuxId,
          type: 'demux',
          name: demuxName,
          position: {
            x: (mux.position?.x ?? 0) - 80,
            y: (mux.position?.y ?? 0) + i * 24
          },
          parameters: {
            outputCount: w,
            inputDimensions: [w]
          }
        }
        sheet.blocks.push(demux)
        insertedDemuxes++

        // Source → demux
        sheet.connections.push({
          id: nid('wire', idCounter),
          sourceBlockId: c.sourceBlockId,
          sourcePortIndex: c.sourcePortIndex ?? 0,
          targetBlockId: demuxId,
          targetPortIndex: 0
        })

        // Demux outs → mux
        for (let k = 0; k < w; k++) {
          newInbound.push({
            id: nid('wire', idCounter),
            sourceBlockId: demuxId,
            sourcePortIndex: k,
            targetBlockId: mux.id,
            targetPortIndex: newPort++
          })
        }
      }

      // Remove old inbound wires to this mux
      const remove = new Set(inbound.map(c => c.id))
      sheet.connections = sheet.connections.filter(c => !remove.has(c.id))
      sheet.connections.push(...newInbound)

      const total = newPort
      mux.parameters = {
        ...(mux.parameters || {}),
        cols: total,
        rows: 1,
        outputType: `double[${total}]`
      }
      expandedMuxes++

      // Widen any output_port fed solely by this mux
      for (const c of sheet.connections) {
        if (c.sourceBlockId !== mux.id) continue
        const tgt = sheet.blocks.find(b => b.id === c.targetBlockId)
        if (tgt?.type === 'output_port') {
          tgt.parameters = {
            ...(tgt.parameters || {}),
            dataType: `double[${total}]`
          }
        }
      }
    }
  }

  return { expandedMuxes, insertedDemuxes }
}
