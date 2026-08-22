/**
 * Simulink `.mdl` (R2006b / 6.x text) brace parser → MdlModel IR.
 *
 * Handles CRLF, tab-separated Key/Value, multi-line quoted names with `\n`,
 * nested Block / System / Line. Does not expand library References.
 */

import type {
  MdlBlock,
  MdlLine,
  MdlModel,
  MdlPosition,
  MdlSystem
} from './types'

/** Generic brace object from the MDL property stream. */
interface BraceObj {
  tag: string
  props: Record<string, string>
  children: BraceObj[]
}

function normalizeNewlines(text: string): string {
  return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
}

/**
 * Parse the entire document into nested BraceObj trees for top-level tags
 * (Model, Library, …). Skips BlockParameterDefaults noise by still parsing it
 * if present — caller filters.
 */
export function parseBraceDocument(text: string): BraceObj[] {
  const s = normalizeNewlines(text)
  const roots: BraceObj[] = []
  let i = 0
  const n = s.length

  const skipWs = () => {
    while (i < n && /[ \t\n]/.test(s[i]!)) i++
  }

  /** Property / tag names: letters, digits, _, $, and occasional '.' */
  const readIdent = (): string => {
    const start = i
    while (i < n && /[A-Za-z0-9_$.]/.test(s[i]!)) i++
    return s.slice(start, i)
  }

  const readQuoted = (): string => {
    if (s[i] !== '"') throw new Error(`Expected " at ${i}`)
    const qStart = i
    i++
    let out = ''
    while (i < n) {
      const c = s[i]!
      if (c === '\\' && i + 1 < n) {
        const n1 = s[i + 1]!
        if (n1 === 'n') {
          out += '\n'
          i += 2
          continue
        }
        if (n1 === 't') {
          out += '\t'
          i += 2
          continue
        }
        if (n1 === '"' || n1 === '\\') {
          out += n1
          i += 2
          continue
        }
      }
      if (c === '"') {
        i++
        return out
      }
      out += c
      i++
    }
    throw new Error(`Unterminated string starting at ${qStart}`)
  }

  const readValue = (): string => {
    skipWs()
    if (i >= n) return ''
    if (s[i] === '"') {
      // MDL continues long strings as adjacent quoted segments on following lines:
      //   "…memor"
      //   "y allocation"
      let out = readQuoted()
      for (;;) {
        const save = i
        skipWs()
        if (i < n && s[i] === '"') {
          out += readQuoted()
          continue
        }
        i = save
        break
      }
      return out
    }
    // unquoted: read until newline (trim trailing ws)
    const start = i
    while (i < n && s[i] !== '\n') i++
    return s.slice(start, i).trimEnd()
  }

  const parseObject = (tag: string): BraceObj => {
    // caller consumed "Tag" and we are at '{' or about to skip to '{'
    skipWs()
    if (s[i] !== '{') {
      throw new Error(`Expected { after ${tag} at offset ${i}`)
    }
    i++ // {
    const obj: BraceObj = { tag, props: {}, children: [] }
    while (i < n) {
      skipWs()
      if (i >= n) break
      if (s[i] === '}') {
        i++
        return obj
      }
      const key = readIdent()
      if (!key) {
        throw new Error(
          `Expected property or } inside ${tag} at offset ${i}: ${JSON.stringify(s.slice(i, i + 40))}`
        )
      }
      skipWs()
      if (s[i] === '{') {
        // nested object with this key as tag (Block, System, Line, Port, …)
        obj.children.push(parseObject(key))
        continue
      }
      // property value
      const val = readValue()
      // If key already set, keep first (rare duplicates)
      if (!(key in obj.props)) obj.props[key] = val
    }
    throw new Error(`Unterminated object ${tag}`)
  }

  while (i < n) {
    skipWs()
    if (i >= n) break
    // Skip lone comments? MDL uses no // comments typically.
    const tag = readIdent()
    if (!tag) {
      // skip unknown junk char
      i++
      continue
    }
    skipWs()
    if (s[i] === '{') {
      roots.push(parseObject(tag))
    } else {
      // top-level Key Value outside braces — ignore for now
      readValue()
    }
  }
  return roots
}

function parsePosition(raw?: string): MdlPosition | undefined {
  if (!raw) return undefined
  const m = raw.match(
    /\[\s*([-\d.eE+]+)\s*,\s*([-\d.eE+]+)(?:\s*,\s*([-\d.eE+]+)\s*,\s*([-\d.eE+]+))?\s*\]/
  )
  if (!m) return undefined
  const pos: MdlPosition = { x: Number(m[1]), y: Number(m[2]) }
  if (m[3] !== undefined) {
    pos.x2 = Number(m[3])
    pos.y2 = Number(m[4])
  }
  return pos
}

function braceToBlock(obj: BraceObj): MdlBlock {
  const blockType = obj.props.BlockType ?? 'Unknown'
  const name = obj.props.Name ?? '?'
  const systemChild = obj.children.find(c => c.tag === 'System')
  const block: MdlBlock = {
    blockType,
    name,
    params: { ...obj.props },
    sourceType: obj.props.SourceType,
    sourceBlock: obj.props.SourceBlock,
    position: parsePosition(obj.props.Position)
  }
  if (systemChild) {
    block.system = braceToSystem(systemChild)
  }
  return block
}

/**
 * Expand a Line (and nested Branch trees) into one logical edge per destination.
 * Simulink fan-out: Line may omit DstBlock and only list Branch { DstBlock… }.
 */
function braceToLines(obj: BraceObj): MdlLine[] {
  const src = obj.props.SrcBlock ?? ''
  const sp = Number(obj.props.SrcPort ?? '1')
  const srcPort = Number.isFinite(sp) ? sp : 1
  const out: MdlLine[] = []

  const pushDst = (
    dstBlock: string,
    dstPortRaw: string | undefined,
    params: Record<string, string>
  ) => {
    if (!dstBlock) return
    const raw = (dstPortRaw ?? '1').trim()
    const special = raw.toLowerCase()
    // Enabled/Triggered subsystem control ports are named, not numeric.
    // Previously Number("trigger") → NaN → coerced to 1, colliding with In1.
    if (special === 'trigger' || special === 'enable') {
      out.push({
        srcBlock: src,
        srcPort,
        dstBlock,
        dstPort: 0,
        dstSpecial: special as 'trigger' | 'enable',
        params
      })
      return
    }
    const dp = Number(raw)
    out.push({
      srcBlock: src,
      srcPort,
      dstBlock,
      dstPort: Number.isFinite(dp) ? dp : 1,
      params
    })
  }

  if (obj.props.DstBlock) {
    pushDst(obj.props.DstBlock, obj.props.DstPort, { ...obj.props })
  }

  const walkBranch = (br: BraceObj) => {
    if (br.props.DstBlock) {
      pushDst(br.props.DstBlock, br.props.DstPort, {
        ...obj.props,
        ...br.props
      })
    }
    for (const ch of br.children) {
      if (ch.tag === 'Branch') walkBranch(ch)
    }
  }
  for (const ch of obj.children) {
    if (ch.tag === 'Branch') walkBranch(ch)
  }
  return out
}

function braceToSystem(obj: BraceObj): MdlSystem {
  const blocks: MdlBlock[] = []
  const lines: MdlLine[] = []
  for (const ch of obj.children) {
    if (ch.tag === 'Block') blocks.push(braceToBlock(ch))
    else if (ch.tag === 'Line') lines.push(...braceToLines(ch))
    // ignore Annotation, etc.
  }
  return {
    name: obj.props.Name ?? '',
    blocks,
    lines,
    params: { ...obj.props }
  }
}

/**
 * Parse a `.mdl` file string into MdlModel.
 * Prefers the first `Model { … System {…} }` root.
 */
export function parseMdl(text: string, path?: string): MdlModel {
  const roots = parseBraceDocument(text)
  const model = roots.find(r => r.tag === 'Model')
  if (!model) {
    throw new Error(
      `No Model {…} root found${path ? ` in ${path}` : ''} (roots: ${roots
        .map(r => r.tag)
        .join(', ')})`
    )
  }
  const sys = model.children.find(c => c.tag === 'System')
  if (!sys) {
    throw new Error('Model has no System child')
  }
  return {
    path,
    name: model.props.Name ?? path ?? 'unnamed',
    root: braceToSystem(sys),
    params: { ...model.props }
  }
}

/** Find a SubSystem block by exact name anywhere under a system (DFS). */
export function findSubsystem(
  system: MdlSystem,
  name: string
): MdlBlock | undefined {
  for (const b of system.blocks) {
    if (b.blockType === 'SubSystem' && b.name === name) return b
    if (b.system) {
      const hit = findSubsystem(b.system, name)
      if (hit) return hit
    }
  }
  return undefined
}

/** Walk all blocks depth-first. */
export function walkBlocks(
  system: MdlSystem,
  fn: (block: MdlBlock, path: string[]) => void,
  path: string[] = []
): void {
  for (const b of system.blocks) {
    const p = [...path, b.name]
    fn(b, p)
    if (b.system) walkBlocks(b.system, fn, p)
  }
}

/** Immediate child SubSystem names. */
export function childSubsystemNames(system: MdlSystem): string[] {
  return system.blocks
    .filter(b => b.blockType === 'SubSystem')
    .map(b => b.name)
}
