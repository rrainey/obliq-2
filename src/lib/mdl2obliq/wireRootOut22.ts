/**
 * RTW ExtY OUT22[9] = On Pad pad reference:
 *   [lat, lon, h, Xe[3], Ve[3]]
 *
 * MDL often Terminates lat/lon/h and Gotos Xe/Ve; RTW still exposes OUT22.
 * Add a root Out22 output_port packed from On_Pad subsystem outs.
 */

import { BlockData } from '@/components/BlockNode'
import { WireData } from '@/components/Wire'

export interface WireOut22Result {
  wired: boolean
  reason?: string
}

function nid(prefix: string, counter: { n: number }): string {
  return `${prefix}_${counter.n++}`
}

function nextIdStart(blocks: BlockData[], connections: WireData[]): number {
  let max = 800000
  const consider = (id: string) => {
    const m = String(id).match(/(\d+)$/)
    if (m) max = Math.max(max, Number(m[1]))
  }
  for (const b of blocks) consider(b.id)
  for (const c of connections) consider(c.id)
  return max + 1
}

export function wireRootOut22(model: {
  sheets: Array<{ blocks: BlockData[]; connections: WireData[]; [k: string]: unknown }>
}): WireOut22Result {
  const sheet = model.sheets?.[0]
  if (!sheet?.blocks || !sheet.connections) {
    return { wired: false, reason: 'no root sheet' }
  }

  const onPad = sheet.blocks.find(
    b => b.type === 'subsystem' && (b.name === 'On_Pad' || b.name === 'On Pad')
  )
  if (!onPad) {
    return { wired: false, reason: 'On_Pad subsystem not found' }
  }

  const outs: string[] = onPad.parameters?.outputPorts || []
  const idx = (name: string) =>
    outs.findIndex(p => p === name || p.toLowerCase() === name.toLowerCase())

  const iLat = idx('lat_deg')
  const iLon = idx('lon_deg')
  const iH = idx('h_m')
  const iXe = idx('Xe_m')
  const iVe = idx('Ve_mps')
  if ([iLat, iLon, iH, iXe, iVe].some(i => i < 0)) {
    return {
      wired: false,
      reason: `On_Pad missing outs (lat/lon/h/Xe/Ve); have [${outs.join(', ')}]`
    }
  }

  // Already have Out22?
  const existing = sheet.blocks.find(
    b =>
      b.type === 'output_port' &&
      (b.name === 'Out22' ||
        b.name === 'OUT22' ||
        b.parameters?.portName === 'Out22' ||
        b.parameters?.portName === 'OUT22')
  )
  if (existing) {
    return { wired: false, reason: 'Out22 already present' }
  }

  const idCounter = { n: nextIdStart(sheet.blocks, sheet.connections) }
  const x = (onPad.position?.x ?? 0) + 220
  const y = onPad.position?.y ?? 200

  const demuxXeId = nid('demux', idCounter)
  const demuxVeId = nid('demux', idCounter)
  const muxId = nid('mux', idCounter)
  const outId = nid('output_port', idCounter)
  const w = () => nid('wire', idCounter)

  const demuxXe: BlockData = {
    id: demuxXeId,
    type: 'demux',
    name: 'Out22_Xe_demux',
    position: { x: x - 40, y: y + 40 },
    parameters: { outputCount: 3, inputDimensions: [3] }
  }
  const demuxVe: BlockData = {
    id: demuxVeId,
    type: 'demux',
    name: 'Out22_Ve_demux',
    position: { x: x - 40, y: y + 120 },
    parameters: { outputCount: 3, inputDimensions: [3] }
  }
  const mux: BlockData = {
    id: muxId,
    type: 'mux',
    name: 'Out22_pack',
    position: { x: x + 40, y: y + 40 },
    parameters: {
      rows: 1,
      cols: 9,
      baseType: 'double',
      outputType: 'double[9]',
      outputShape: 'vector'
    }
  }
  const out22: BlockData = {
    id: outId,
    type: 'output_port',
    name: 'Out22',
    position: { x: x + 160, y: y + 60 },
    parameters: {
      portName: 'Out22',
      dataType: 'double[9]',
      defaultValue: Array(9).fill(0)
    }
  }

  const conns: WireData[] = [
    // On_Pad scalars → mux 0..2
    {
      id: w(),
      sourceBlockId: onPad.id,
      sourcePortIndex: iLat,
      targetBlockId: muxId,
      targetPortIndex: 0
    },
    {
      id: w(),
      sourceBlockId: onPad.id,
      sourcePortIndex: iLon,
      targetBlockId: muxId,
      targetPortIndex: 1
    },
    {
      id: w(),
      sourceBlockId: onPad.id,
      sourcePortIndex: iH,
      targetBlockId: muxId,
      targetPortIndex: 2
    },
    // Xe vector → demux → mux 3..5
    {
      id: w(),
      sourceBlockId: onPad.id,
      sourcePortIndex: iXe,
      targetBlockId: demuxXeId,
      targetPortIndex: 0
    },
    {
      id: w(),
      sourceBlockId: demuxXeId,
      sourcePortIndex: 0,
      targetBlockId: muxId,
      targetPortIndex: 3
    },
    {
      id: w(),
      sourceBlockId: demuxXeId,
      sourcePortIndex: 1,
      targetBlockId: muxId,
      targetPortIndex: 4
    },
    {
      id: w(),
      sourceBlockId: demuxXeId,
      sourcePortIndex: 2,
      targetBlockId: muxId,
      targetPortIndex: 5
    },
    // Ve vector → demux → mux 6..8
    {
      id: w(),
      sourceBlockId: onPad.id,
      sourcePortIndex: iVe,
      targetBlockId: demuxVeId,
      targetPortIndex: 0
    },
    {
      id: w(),
      sourceBlockId: demuxVeId,
      sourcePortIndex: 0,
      targetBlockId: muxId,
      targetPortIndex: 6
    },
    {
      id: w(),
      sourceBlockId: demuxVeId,
      sourcePortIndex: 1,
      targetBlockId: muxId,
      targetPortIndex: 7
    },
    {
      id: w(),
      sourceBlockId: demuxVeId,
      sourcePortIndex: 2,
      targetBlockId: muxId,
      targetPortIndex: 8
    },
    // mux → Out22
    {
      id: w(),
      sourceBlockId: muxId,
      sourcePortIndex: 0,
      targetBlockId: outId,
      targetPortIndex: 0
    }
  ]

  sheet.blocks.push(demuxXe, demuxVe, mux, out22)
  sheet.connections.push(...conns)
  return { wired: true }
}
