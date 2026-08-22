/**
 * When a Demux expects N>1 elements but its driver is a scalar-typed
 * input_port / Ground / source constant, widen the driver to double[N].
 * Simulink inherits vector size into Ground/Inport; Obliq often defaults to double.
 */

import { BlockData } from '@/components/BlockNode'
import { WireData } from '@/components/Wire'

export interface WidenDemuxResult {
  widened: number
}

export function widenDemuxSources(model: {
  sheets: Array<{ blocks: BlockData[]; connections: WireData[]; [k: string]: unknown }>
}): WidenDemuxResult {
  let widened = 0

  const visit = (blocks: BlockData[], connections: WireData[]) => {
    const byId = new Map(blocks.map(b => [b.id, b]))
    for (const demux of blocks.filter(b => b.type === 'demux')) {
      const n = Number(demux.parameters?.outputCount || 1)
      if (n <= 1) continue
      const inn = connections.find(
        c => c.targetBlockId === demux.id && (c.targetPortIndex ?? 0) === 0
      )
      if (!inn) continue
      const src = byId.get(inn.sourceBlockId)
      if (!src) continue

      const widenPortOrSource = () => {
        const dt = String(src.parameters?.dataType || '')
        if (dt.includes('[')) return
        src.parameters = {
          ...(src.parameters || {}),
          dataType: `double[${n}]`,
          ...(src.type === 'input_port'
            ? { defaultValue: Array(n).fill(0) }
            : {}),
          ...(src.type === 'source'
            ? {
                signalType: 'constant',
                value: Array(n).fill(0),
                dataType: `double[${n}]`
              }
            : {})
        }
        widened++
      }

      // Walk through type-preserving passthroughs (scale, units_conversion)
      let driver: BlockData | undefined = src
      const seen = new Set<string>()
      while (
        driver &&
        (driver.type === 'scale' || driver.type === 'units_conversion') &&
        !seen.has(driver.id)
      ) {
        seen.add(driver.id)
        const prev = connections.find(
          c =>
            c.targetBlockId === driver!.id && (c.targetPortIndex ?? 0) === 0
        )
        driver = prev ? byId.get(prev.sourceBlockId) : undefined
      }
      if (!driver) continue

      if (driver.type === 'input_port') {
        const dt = String(driver.parameters?.dataType || '')
        if (!dt.includes('[')) {
          driver.parameters = {
            ...(driver.parameters || {}),
            dataType: `double[${n}]`,
            defaultValue: Array(n).fill(0)
          }
          widened++
        }
      } else if (
        driver.type === 'source' &&
        (driver.name === 'Ground' ||
          /ground/i.test(driver.name) ||
          driver.parameters?.signalType === 'constant')
      ) {
        const dt = String(driver.parameters?.dataType || '')
        if (!dt.includes('[')) {
          driver.parameters = {
            ...(driver.parameters || {}),
            signalType: 'constant',
            value: Array(n).fill(0),
            dataType: `double[${n}]`
          }
          widened++
        }
      } else if (driver.type === 'evaluate') {
        // MultiPortSwitch (and similar) map to evaluate; default seed is scalar
        // double, which breaks Demux. Declare vector output to match Demux width.
        const ot = String(
          driver.parameters?.outputType || driver.parameters?.dataType || ''
        )
        if (!ot.includes('[')) {
          driver.parameters = {
            ...(driver.parameters || {}),
            outputType: `double[${n}]`
          }
          widened++
        }
      }
    }

    for (const b of blocks) {
      if (b.type === 'subsystem' && Array.isArray(b.parameters?.sheets)) {
        for (const sh of b.parameters.sheets) {
          visit(sh.blocks || [], sh.connections || [])
        }
      }
    }
  }

  for (const s of model.sheets) {
    visit(s.blocks || [], s.connections || [])
  }
  return { widened }
}
