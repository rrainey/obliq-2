/**
 * Emit Obliq ModelData JSON from an MDL system (Phase 1 MVP).
 */

import type { MdlBlock, MdlSystem } from './types'
import {
  mapBlock,
  MapError,
  parseMaskParams,
  type ObliqBlockDesc
} from './mapper'
import { walkBlocks } from './parseMdl'
import { as205ModelParameters } from './workspaceConsts'
import { expandMuxVectorInputs } from './expandMuxVectorInputs'
import { widenDemuxSources } from './widenDemuxSources'
import { wireRootOut22 } from './wireRootOut22'
import { validateEmittedObliqModel } from './validateObliqModel'

export interface EmitOptions {
  /** Fail on first MapError (default true) */
  strict?: boolean
  modelName?: string
  description?: string
  /** Insert demuxes before vector→Mux wires (default true) */
  expandMuxVectors?: boolean
  /** Run UI-equivalent Obliq model validation after emit (default true) */
  validate?: boolean
}

export interface EmitResult {
  model: {
    name: string
    description: string
    version: string
    metadata: { created: string; description?: string }
    sheets: Array<{
      id: string
      name: string
      blocks: Array<{
        id: string
        type: string
        name: string
        position: { x: number; y: number }
        parameters?: Record<string, unknown>
      }>
      connections: Array<{
        id: string
        sourceBlockId: string
        sourcePortIndex: number
        targetBlockId: string
        targetPortIndex: number
      }>
      extents: { width: number; height: number }
    }>
    globalSettings: {
      simulationTimeStep: number
      simulationDuration: number
      integrationAlgorithm: 'rk4'
    }
    parameters: unknown[]
    dataStores: Array<{
      name: string
      dataType?: string
      initialValue?: string
    }>
  }
  warnings: string[]
  errors: string[]
  /** Present when validate !== false */
  validation?: {
    valid: boolean
    errorCount: number
    warningCount: number
    report: string
  }
}

let _seq = 0
function nid(prefix: string): string {
  return `${prefix}_${++_seq}`
}

function resetIds(): void {
  _seq = 0
}

/** Simulink 1-based port → Obliq 0-based */
function port0(simulinkPort: number): number {
  return Math.max(0, simulinkPort - 1)
}

/**
 * Switch→if port remap (Simulink ports are 1-based on the block):
 *   u1 = first data, u2 = control, u3 = third data
 * Obliq if: in0 = falsePath, in1 = control, in2 = truePath
 * Criteria u2~=0: when control nonzero → y=u1, else y=u3
 *   ⇒ truePath=u1 → if port 2, falsePath=u3 → if port 0, control=u2 → if port 1
 */
function remapSwitchTargetPort(simulinkPort1: number): number {
  if (simulinkPort1 === 1) return 2 // u1 → true path
  if (simulinkPort1 === 2) return 1 // u2 → control
  if (simulinkPort1 === 3) return 0 // u3 → false path
  return port0(simulinkPort1)
}

interface MappedEntry {
  mdlName: string
  desc: ObliqBlockDesc
  id: string
  block?: MdlBlock
}

function emitSystemSheet(
  system: MdlSystem,
  sheetName: string,
  warnings: string[],
  errors: string[],
  strict: boolean,
  maskEnv: Record<string, string> = {}
): EmitResult['model']['sheets'][0] {
  const blocksOut: EmitResult['model']['sheets'][0]['blocks'] = []
  const conns: EmitResult['model']['sheets'][0]['connections'] = []
  const byName = new Map<string, MappedEntry>()
  const ignored = new Set<string>()
  const passthrough = new Set<string>()
  /** Simulink 1-based outPort → inPort for multi-port passthrough blocks */
  const passthroughOutToIn = new Map<string, Record<number, number>>()
  /** Simulink 1-based outPort → expand-into-synthetic-block config */
  const passthroughExpandOut = new Map<
    string,
    Record<number, { type: string; fromInputs: number[]; nameSuffix?: string }>
  >()
  /** PT mdl name + outPort → synthetic MappedEntry (e.g. inertia_diag_pack) */
  const ptExpandBlocks = new Map<string, MappedEntry>()
  const switchIf = new Set<string>()

  // Unique Obliq names within this sheet (codegen flattens paths; collisions break C)
  const usedNames = new Set<string>()
  const uniqueName = (base: string): string => {
    let n = base.replace(/\W+/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '')
    if (!n) n = 'blk'
    if (!usedNames.has(n)) {
      usedNames.add(n)
      return n
    }
    let i = 2
    while (usedNames.has(`${n}_${i}`)) i++
    const u = `${n}_${i}`
    usedNames.add(u)
    return u
  }

  // Map blocks
  for (const b of system.blocks) {
    try {
      const desc = mapBlock(b, { maskEnv, parentName: sheetName })
      if (desc.meta?.ignored) {
        ignored.add(b.name)
        continue
      }
      if (desc.meta?.passthrough) {
        passthrough.add(b.name)
        if (desc.meta.passthroughOutToIn) {
          passthroughOutToIn.set(b.name, desc.meta.passthroughOutToIn)
        }
        if (desc.meta.passthroughExpandOut) {
          passthroughExpandOut.set(b.name, desc.meta.passthroughExpandOut)
        }
        continue
      }
      if (desc.meta?.switchToIf) switchIf.add(b.name)

      const id = nid(desc.type)
      const obliqName = uniqueName(desc.name)
      const entry: MappedEntry = {
        mdlName: b.name,
        desc: { ...desc, name: obliqName },
        id,
        block: b
      }

      const hasEnable = b.system
        ? b.system.blocks.some(
            x => x.blockType === 'EnablePort' || x.blockType === 'TriggerPort'
          )
        : false

      if (desc.meta?.subsystem && b.system) {
        // Child inherits parent mask env; own MaskValueString overrides
        const childMask = { ...maskEnv, ...parseMaskParams(b) }
        const childSheet = emitSystemSheet(
          b.system,
          obliqName,
          warnings,
          errors,
          strict,
          childMask
        )
        // Use emitted child port block names (already uniquified in child sheet)
        const inNames = childSheet.blocks
          .filter(x => x.type === 'input_port')
          .map(x => x.name)
        const outNames = childSheet.blocks
          .filter(x => x.type === 'output_port')
          .map(x => x.name)
        blocksOut.push({
          id,
          type: 'subsystem',
          name: obliqName,
          position: {
            x: b.position?.x ?? 0,
            y: b.position?.y ?? 0
          },
          parameters: {
            // Keep empty arrays when the MDL subsystem has no I/O (e.g. Triggered
            // Timer Initialization is Ports [1,0,0,1] — inventing "y" breaks validation).
            inputPorts: inNames,
            outputPorts: outNames,
            sheets: [childSheet],
            showEnableInput: hasEnable,
            codeGenStrategy: 'flatten'
          }
        })
      } else {
        const params = { ...(desc.parameters || {}) }
        // Flattener matches subsystem inputPorts/outputPorts lists (block names)
        // against parameters.portName — keep them identical after uniquify.
        if (desc.type === 'input_port' || desc.type === 'output_port') {
          params.portName = obliqName
        }
        blocksOut.push({
          id,
          type: desc.type,
          name: obliqName,
          position: {
            x: b.position?.x ?? 0,
            y: b.position?.y ?? 0
          },
          parameters: params
        })
      }
      byName.set(b.name, entry)
    } catch (err) {
      const msg =
        err instanceof MapError
          ? `${err.blockType} "${err.blockName}": ${err.message}`
          : String(err)
      errors.push(msg)
      if (strict) throw err
    }
  }

  // Passthrough inputs: PT block → (1-based inPort → wire source)
  const ptInputs = new Map<
    string,
    Map<number, { srcBlock: string; srcPort: number }>
  >()
  for (const L of system.lines) {
    if (!passthrough.has(L.dstBlock)) continue
    let m = ptInputs.get(L.dstBlock)
    if (!m) {
      m = new Map()
      ptInputs.set(L.dstBlock, m)
    }
    m.set(L.dstPort, { srcBlock: L.srcBlock, srcPort: L.srcPort })
  }

  // Materialize expand-out synthetic blocks (e.g. inertia_diag_pack for out3)
  for (const [ptName, expandMap] of passthroughExpandOut) {
    const inputs = ptInputs.get(ptName)
    for (const [outPortStr, cfg] of Object.entries(expandMap)) {
      const outPort = Number(outPortStr)
      const synName = uniqueName(
        (ptName.replace(/\W+/g, '_') || 'pt') + (cfg.nameSuffix || `_out${outPort}`)
      )
      const synId = nid(cfg.type)
      const synEntry: MappedEntry = {
        mdlName: synName,
        desc: {
          type: cfg.type,
          name: synName,
          parameters: { numInputs: cfg.fromInputs.length }
        },
        id: synId
      }
      blocksOut.push({
        id: synId,
        type: cfg.type,
        name: synName,
        position: { x: 0, y: 0 },
        parameters: { numInputs: cfg.fromInputs.length }
      })
      byName.set(synName, synEntry)
      ptExpandBlocks.set(`${ptName}#${outPort}`, synEntry)

      // Wire fromInputs (1-based PT inports) → synthetic block ports
      cfg.fromInputs.forEach((inPort1, idx) => {
        const inn = inputs?.get(inPort1)
        if (!inn) {
          warnings.push(
            `Expand ${JSON.stringify(ptName)} out${outPort}: missing inport ${inPort1}`
          )
          return
        }
        // Resolve nested passthrough on the source if needed
        let srcN = inn.srcBlock
        let srcP = inn.srcPort
        const seen = new Set<string>()
        while (passthrough.has(srcN) && !seen.has(srcN)) {
          seen.add(srcN)
          const o2i = passthroughOutToIn.get(srcN)
          const ip = o2i?.[srcP] ?? (o2i ? undefined : 1)
          if (ip == null) break
          const next = ptInputs.get(srcN)?.get(ip)
          if (!next) break
          srcN = next.srcBlock
          srcP = next.srcPort
        }
        const src = byName.get(srcN)
        if (!src) {
          warnings.push(
            `Expand ${JSON.stringify(ptName)} dangling in${inPort1} from ${JSON.stringify(srcN)}`
          )
          return
        }
        conns.push({
          id: nid('wire'),
          sourceBlockId: src.id,
          sourcePortIndex: port0(srcP),
          targetBlockId: synId,
          targetPortIndex: idx
        })
      })
    }
  }

  /** Resolve source through passthrough chain (supports multi-port out→in maps). */
  const resolveSrc = (
    name: string,
    port: number
  ): { name: string; port: number } | null => {
    let n = name
    let p = port
    const seen = new Set<string>()
    while (passthrough.has(n)) {
      if (seen.has(n)) return null
      seen.add(n)
      // Expanded synthetic output (e.g. inertia_diag_pack)
      const exp = ptExpandBlocks.get(`${n}#${p}`)
      if (exp) {
        return { name: exp.mdlName, port: 1 }
      }
      const outToIn = passthroughOutToIn.get(n)
      const inPort = outToIn?.[p] ?? (outToIn ? undefined : 1)
      if (inPort == null) return null
      const inn = ptInputs.get(n)?.get(inPort)
      if (!inn) return null
      n = inn.srcBlock
      p = inn.srcPort
    }
    if (ignored.has(n)) return null
    return { name: n, port: p }
  }

  // Wires (skip edges into passthrough; edges from passthrough rewired to PT input)
  for (const L of system.lines) {
    if (ignored.has(L.srcBlock) || ignored.has(L.dstBlock)) continue
    if (passthrough.has(L.dstBlock)) continue // consumed as ptInput

    let srcName = L.srcBlock
    let srcPort = L.srcPort
    const dstName = L.dstBlock
    const dstPort = L.dstPort

    if (passthrough.has(srcName)) {
      const r = resolveSrc(srcName, srcPort)
      if (!r) {
        warnings.push(
          'Passthrough source unresolved: ' + JSON.stringify(srcName)
        )
        continue
      }
      srcName = r.name
      srcPort = r.port
    }

    if (passthrough.has(dstName)) continue

    const src = byName.get(srcName)
    const dst = byName.get(dstName)
    if (!src || !dst) {
      warnings.push(
        'Dangling line ' +
          JSON.stringify(srcName) +
          '[' +
          srcPort +
          '] -> ' +
          JSON.stringify(dstName) +
          '[' +
          dstPort +
          ']'
      )
      continue
    }

    // Trigger/Enable → Obliq subsystem enable pin (ModelFlattener uses −1).
    // Insert bool cast when source is not already a condition/bool evaluate —
    // Simulink trigger lines are often double flags (bStart).
    if (L.dstSpecial === 'trigger' || L.dstSpecial === 'enable') {
      const srcIsBool =
        src.desc.type === 'condition' ||
        (src.desc.type === 'evaluate' &&
          (src.desc.parameters as any)?.outputType === 'bool')
      let enableSrcId = src.id
      let enableSrcPort = port0(srcPort)
      if (!srcIsBool) {
        const castName = uniqueName(`${dst.desc.name}_enable_bool`)
        const castId = nid('evaluate')
        blocksOut.push({
          id: castId,
          type: 'evaluate',
          name: castName,
          position: {
            x: (dst.block?.position?.x ?? 0) - 40,
            y: (dst.block?.position?.y ?? 0) - 20
          },
          parameters: {
            numInputs: 1,
            expression: 'in(0)!=0',
            outputType: 'bool'
          }
        })
        byName.set(castName, {
          mdlName: castName,
          desc: {
            type: 'evaluate',
            name: castName,
            parameters: {
              numInputs: 1,
              expression: 'in(0)!=0',
              outputType: 'bool'
            }
          },
          id: castId
        })
        conns.push({
          id: nid('wire'),
          sourceBlockId: src.id,
          sourcePortIndex: port0(srcPort),
          targetBlockId: castId,
          targetPortIndex: 0
        })
        enableSrcId = castId
        enableSrcPort = 0
      }
      conns.push({
        id: nid('wire'),
        sourceBlockId: enableSrcId,
        sourcePortIndex: enableSrcPort,
        targetBlockId: dst.id,
        targetPortIndex: -1
      })
      continue
    }

    let tPort = port0(dstPort)
    if (switchIf.has(dstName)) {
      tPort = remapSwitchTargetPort(dstPort)
    }

    conns.push({
      id: nid('wire'),
      sourceBlockId: src.id,
      sourcePortIndex: port0(srcPort),
      targetBlockId: dst.id,
      targetPortIndex: tPort
    })
  }

  // extents from positions
  let maxX = 800
  let maxY = 600
  for (const b of blocksOut) {
    maxX = Math.max(maxX, b.position.x + 200)
    maxY = Math.max(maxY, b.position.y + 120)
  }

  return {
    id: nid('sheet'),
    name: sheetName,
    blocks: blocksOut,
    connections: conns,
    extents: { width: maxX, height: maxY }
  }
}

function collectDataStores(
  system: MdlSystem
): Array<{ name: string; dataType?: string; initialValue?: string }> {
  const byName = new Map<
    string,
    { name: string; dataType?: string; initialValue?: string }
  >()
  walkBlocks(system, b => {
    if (b.blockType !== 'DataStoreMemory') return
    const name = (b.params.DataStoreName || b.name || 'store').replace(
      /\W+/g,
      '_'
    )
    if (byName.has(name)) return
    const rawIv = (b.params.InitialValue ?? '0').trim()
    // Codegen expects a C literal; MATLAB exprs / other-block refs → 0
    const numeric =
      /^-?[0-9]+(\.[0-9]+)?([eE][-+]?[0-9]+)?$/.test(rawIv) ||
      /^\[\s*-?[0-9eE.+,\s]+\]$/.test(rawIv)
    let initialValue = '0'
    let dataType = b.params.DataType || 'double'
    if (numeric) {
      if (rawIv.startsWith('[')) {
        // Vector literal → keep as C-ish brace init later; use zeros of inferred length
        const nums = rawIv.replace(/[\[\]]/g, '').trim().split(/[\s,]+/).filter(Boolean)
        dataType = `double[${nums.length || 3}]`
        initialValue = `{${nums.map(() => '0').join(', ')}}`
      } else {
        initialValue = rawIv
      }
    }
    byName.set(name, {
      name,
      dataType,
      initialValue
    })
  })
  return [...byName.values()]
}

export function emitObliqFromSystem(
  system: MdlSystem,
  opts: EmitOptions = {}
): EmitResult {
  resetIds()
  const strict = opts.strict !== false
  const warnings: string[] = []
  const errors: string[] = []
  const sheet = emitSystemSheet(
    system,
    system.name || 'Main',
    warnings,
    errors,
    strict
  )
  const dataStores = collectDataStores(system)

  const model = {
    name: opts.modelName || system.name || 'mdl2obliq',
    description:
      opts.description ||
      `Translated from MDL subsystem "${system.name}" (mdl2obliq Phase 1)`,
    version: '2.2',
    metadata: {
      created: new Date().toISOString(),
      description: opts.description
    },
    sheets: [sheet],
    globalSettings: {
      simulationTimeStep: 0.005,
      simulationDuration: 1,
      integrationAlgorithm: 'rk4' as const
    },
    parameters: as205ModelParameters(),
    dataStores
  }

  // Widen scalar Inports/Ground that feed multi-output Demuxes (Simulink size inheritance)
  try {
    const w = widenDemuxSources(model as any)
    if (w.widened > 0) {
      warnings.push(`Widened ${w.widened} Demux source(s) to match demux width`)
    }
  } catch (e) {
    warnings.push(
      `widenDemuxSources failed: ${e instanceof Error ? e.message : String(e)}`
    )
  }

  if (opts.expandMuxVectors !== false) {
    try {
      // Iterate: Pass 2b may seed vector Inports during type-prop inside
      // expandMux, revealing new vector→Mux edges only on the next pass.
      let totalMux = 0
      let totalDemux = 0
      for (let pass = 0; pass < 5; pass++) {
        const muxStats = expandMuxVectorInputs(model as any)
        totalMux += muxStats.expandedMuxes
        totalDemux += muxStats.insertedDemuxes
        if (muxStats.expandedMuxes === 0) break
      }
      if (totalMux > 0) {
        warnings.push(
          `Expanded ${totalMux} Mux block(s) with ${totalDemux} demux(es) for vector inputs`
        )
      }
    } catch (e) {
      const msg = `expandMuxVectorInputs failed: ${e instanceof Error ? e.message : String(e)}`
      errors.push(msg)
      warnings.push(msg)
    }
  }

  // RTW ExtY OUT22[9] ← On Pad lat/lon/h/Xe/Ve (parallel to existing Gotos)
  // Note: On Pad IC GMST path is rad→deg (outport/Goto) → unary-minus → deg→rad
  // for Euler; do not strip the deg→rad (that would leave ψ in degrees).
  try {
    const o22 = wireRootOut22(model as any)
    if (o22.wired) {
      warnings.push('Wired root Out22 (double[9]) from On_Pad outs')
    } else if (o22.reason && !/already present|not found/i.test(o22.reason)) {
      warnings.push(`Out22 not wired: ${o22.reason}`)
    }
  } catch (e) {
    warnings.push(
      `wireRootOut22 failed: ${e instanceof Error ? e.message : String(e)}`
    )
  }

  let validation: EmitResult['validation']
  if (opts.validate !== false) {
    const v = validateEmittedObliqModel(model as any)
    validation = {
      valid: v.valid,
      errorCount: v.errors.length,
      warningCount: v.warnings.length,
      report: v.report
    }
    if (!v.valid) {
      for (const e of v.errors.slice(0, 50)) {
        errors.push(`Obliq validation: ${e.message}`)
      }
      if (v.errors.length > 50) {
        errors.push(`Obliq validation: …and ${v.errors.length - 50} more errors`)
      }
    }
    for (const w of v.warnings.slice(0, 20)) {
      warnings.push(`Obliq validation: ${w.message}`)
    }
  }

  return {
    model,
    warnings,
    errors,
    validation
  }
}
