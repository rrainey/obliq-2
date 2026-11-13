// Subsystem function: what a subsystem does in a control loop (Phase 3 of
// docs/layout-improvement-plan-pass-2.md).
//
// A subsystem block can have a `subsystemFunction` parameter: `controller`,
// `actuator`, `plant`, `sensor`, `compensator` or `other`. No value means
// "not set". The parameter has no effect on simulation or code generation.
// The ELK layout uses it to put a closed loop in the conventional order:
// controller, actuator, plant from left to right, with sensors and
// compensators on the return path (autoLayout.ts, `signalFlowAnalysis()`).
//
// This module suggests a value from rules. It does not use a learned model
// (the plan defers that: no public corpus has these labels). Each rule in
// ROLE_RULES adds a weight to one function. The rules look at:
//   a. words in the block name;
//   b. the blocks in the subsystem's sheets, nested subsystems included;
//   c. the position of the subsystem in the loop on the parent sheet: the
//      functions of the subsystems before and after it, from (a) and (b).
// The suggestion is the function with the largest score. Its confidence is
// 1 - exp(-(best - second best)): a lead of 1 gives 0.63, a lead of 3 gives
// 0.95. The layout uses a suggestion only when its confidence is at least
// ROLE_CONFIDENCE_THRESHOLD.
//
// All the functions here are pure. They read the wiring, the block types and
// the names, and never the block positions.

import type { BlockData } from '@/components/BlockNode'
import type { WireData } from '@/components/Wire'

export const SUBSYSTEM_FUNCTIONS = ['controller', 'actuator', 'plant', 'sensor', 'compensator', 'other'] as const
export type SubsystemFunction = typeof SUBSYSTEM_FUNCTIONS[number]

/** Names for the UI. */
export const SUBSYSTEM_FUNCTION_LABELS: Record<SubsystemFunction, string> = {
  controller: 'Controller',
  actuator: 'Actuator',
  plant: 'Plant',
  sensor: 'Sensor',
  compensator: 'Compensator (feedback path)',
  other: 'Other',
}

/** The layout uses a suggestion only at this confidence or more. */
export const ROLE_CONFIDENCE_THRESHOLD = 0.6

export function isSubsystemFunction(v: unknown): v is SubsystemFunction {
  return typeof v === 'string' && (SUBSYSTEM_FUNCTIONS as readonly string[]).includes(v)
}

export function isSubsystemBlock(b: BlockData | undefined): boolean {
  return !!b && (b.type === 'subsystem' || b.type === 'for_iterator_subsystem')
}

// --- Features -------------------------------------------------------------

/** What the rules can see of one subsystem. */
export interface RoleFeatures {
  /** Lower-case words of the block name, in order. The last word is the head noun. */
  words: string[]
  inputs: number
  outputs: number
  /** False when the content is not known (a model reference, or a dangling subsystem reference). */
  hasContent: boolean
  /** Count of each block type in the sheets, nested subsystems included. */
  counts: Record<string, number>
  /** Blocks in the content, without wiring blocks (ports, Sheet Labels, mux, demux, comments). */
  total: number
  /** Count of `sum` blocks with at least one `-` sign. */
  negativeSums: number
  /** The subsystem has its own sample time (a sampled, digital part). */
  sampled: boolean
  /** Functions of the subsystems before it and after it on the parent sheet (from rules a and b). */
  upstream: SubsystemFunction[]
  downstream: SubsystemFunction[]
}

/** Blocks that only carry signals. The content rules ignore them. */
const WIRING_TYPES = new Set([
  'input_port', 'output_port', 'sheet_label_sink', 'sheet_label_source', 'mux', 'demux', 'comment',
  'no_connection', 'subsystem', 'for_iterator_subsystem',
])

/** Split a block name into lower-case words: `FlightController` -> flight, controller; `Motor_RR` -> motor, rr. */
export function nameWords(name: string): string[] {
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .split(/[^A-Za-z]+/)
    .filter(Boolean)
    .map(w => w.toLowerCase())
}

/** How to find the definition of a subsystem reference (`isReference`). */
export type DefinitionLookup = (blockId: string) => BlockData | undefined

function contentSheets(block: BlockData, lookup?: DefinitionLookup): any[] | null {
  const p = block.parameters ?? {}
  if (p.isReference && typeof p.referencedSubsystemId === 'string') {
    const def = lookup?.(p.referencedSubsystemId)
    return def && !def.parameters?.isReference && Array.isArray(def.parameters?.sheets) && def.parameters!.sheets.length
      ? def.parameters!.sheets
      : null
  }
  return Array.isArray(p.sheets) && p.sheets.length > 0 ? p.sheets : null
}

/** Rules (a) and (b): the features of the block itself, without its position. */
export function contentFeatures(block: BlockData, lookup?: DefinitionLookup): RoleFeatures {
  const counts: Record<string, number> = {}
  let total = 0, negativeSums = 0
  const sheets = contentSheets(block, lookup)
  const visit = (list: any[], depth: number) => {
    if (depth > 20) return
    for (const s of list) {
      for (const b of (s?.blocks ?? []) as BlockData[]) {
        counts[b.type] = (counts[b.type] ?? 0) + 1
        if (!WIRING_TYPES.has(b.type)) total++
        if (b.type === 'sum' && typeof b.parameters?.signs === 'string' && b.parameters.signs.includes('-')) negativeSums++
        if (isSubsystemBlock(b)) {
          const inner = contentSheets(b, lookup)
          if (inner) visit(inner, depth + 1)
        }
      }
    }
  }
  if (sheets) visit(sheets, 0)
  const p = block.parameters ?? {}
  return {
    words: nameWords(block.name ?? ''),
    inputs: Array.isArray(p.inputPorts) ? p.inputPorts.length : 0,
    outputs: Array.isArray(p.outputPorts) ? p.outputPorts.length : 0,
    hasContent: !!sheets,
    counts,
    total,
    negativeSums,
    sampled: Number(p.sampleTimeSec) > 0,
    upstream: [],
    downstream: [],
  }
}

// --- Rules ----------------------------------------------------------------

/** One rule: when `test` gives a value above 0, `weight` times that value goes to `role`. */
export interface RoleRule {
  id: string
  role: SubsystemFunction
  weight: number
  /** Why the rule fires, for the dialog and the report. */
  reason: string | ((f: RoleFeatures) => string)
  /** 0 when the rule does not apply; 1 when it applies fully; a value between for a partial match. */
  test: (f: RoleFeatures) => number
}

/**
 * Name keywords of each function. A keyword in the head noun of the name (the
 * last word of three letters or more: "Flight*Controller*", "Gps*Rescue*",
 * "*Motor*_RR") counts fully. A keyword in another word ("*Imu*FrontEnd")
 * counts half.
 */
export const ROLE_KEYWORDS: Record<SubsystemFunction, string[]> = {
  controller: ['controller', 'control', 'ctrl', 'pid', 'autopilot', 'regulator', 'governor', 'guidance', 'hold', 'rescue', 'mode'],
  actuator: ['actuator', 'actuators', 'motor', 'motors', 'esc', 'servo', 'servos', 'valve', 'pump', 'thruster', 'rotor', 'rotors', 'propeller', 'drive'],
  plant: ['plant', 'frame', 'airframe', 'body', 'dynamics', 'vehicle', 'process', 'physics', 'aero', 'aerodynamics', 'battery', 'load'],
  sensor: ['sensor', 'sensors', 'imu', 'gyro', 'accel', 'accelerometer', 'magnetometer', 'mag', 'baro', 'barometer', 'gnss', 'gps', 'encoder', 'tachometer', 'adc', 'lidar', 'sonar', 'camera'],
  compensator: ['compensator', 'filter', 'filters', 'estimator', 'observer', 'kalman', 'ekf', 'notch'],
  other: ['logger', 'telemetry', 'display', 'monitor', 'test', 'tests', 'conditions', 'scenario', 'environment'],
}

/**
 * The head noun of a name: the last word of three letters or more. A short
 * last word is a position or an index code ("Motor_*RR*", "Motor_*FL*").
 */
function headIndex(words: string[]): number {
  for (let i = words.length - 1; i >= 0; i--) if (words[i].length >= 3) return i
  return words.length - 1
}

/** The keyword of `role` in the name, and 1 (in the head noun) or 0.5 (in another word). */
function keywordMatch(f: RoleFeatures, role: SubsystemFunction): { word: string; value: number } | null {
  const words = f.words
  if (words.length === 0) return null
  const keys = ROLE_KEYWORDS[role]
  const head = headIndex(words)
  if (keys.includes(words[head])) return { word: words[head], value: 1 }
  const other = words.find((w, i) => i !== head && keys.includes(w))
  return other ? { word: other, value: 0.5 } : null
}

const count = (f: RoleFeatures, ...types: string[]) => types.reduce((n, t) => n + (f.counts[t] ?? 0), 0)
const fraction = (f: RoleFeatures, ...types: string[]) => (f.total > 0 ? count(f, ...types) / f.total : 0)
const hasAny = (list: SubsystemFunction[], ...roles: SubsystemFunction[]) => list.some(r => roles.includes(r))

/** Continuous states: integrators and transfer functions (the model has no state-space block). */
const CONTINUOUS = ['integrator', 'transfer_function']
/** Rigid-body and environment blocks. */
const PHYSICS = ['body2quaternion_rates', 'inertia_diag_pack', 'atmosphere', 'cross']
/** Measurement effects: noise and quantisation. */
const NOISE = ['random_noise']
const QUANTISE = ['quantizer']
/** Discrete filters. */
const FILTERS = ['notch_filter', 'discrete_transform', 'spectrum_peaks']
/** Limits on a command. */
const SATURATION = ['limit', 'saturation_dynamic', 'rate_limiter']
/** Logic and mode switching. */
const LOGIC = ['if', 'condition', 'edge_detect', 'relay']
/** Delays and holds. The model has no sample-and-hold block: a sampled sensor uses a unit delay. */
const DELAYS = ['unit_delay', 'variable_transport_delay']

/**
 * The rules, as a weighted table. A function's score is the sum of
 * `weight × test` of its rules. The README and
 * docs/layout-engine-comparison.md list the results on the reference models.
 */
export const ROLE_RULES: RoleRule[] = [
  // (a) Name keywords
  ...SUBSYSTEM_FUNCTIONS.map((role): RoleRule => ({
    id: `name-${role}`,
    role,
    weight: 3,
    reason: f => `name has the ${role} keyword "${keywordMatch(f, role)?.word}"`,
    test: f => keywordMatch(f, role)?.value ?? 0,
  })),

  // (b) Content
  { id: 'continuous-states', role: 'plant', weight: 1.5, reason: 'has continuous states (integrator or transfer function)',
    test: f => (count(f, ...CONTINUOUS) > 0 ? 1 : 0) },
  { id: 'many-continuous-states', role: 'plant', weight: 1.5, reason: 'has three or more continuous states',
    test: f => (count(f, ...CONTINUOUS) >= 3 ? 1 : 0) },
  { id: 'one-lag', role: 'actuator', weight: 0.5, reason: 'has one continuous state (a lag, such as a motor time constant)',
    test: f => (count(f, ...CONTINUOUS) === 1 ? 1 : 0) },
  { id: 'physics', role: 'plant', weight: 1, reason: 'has rigid-body or environment blocks',
    test: f => (count(f, ...PHYSICS) > 0 ? 1 : 0) },
  { id: 'lookup', role: 'plant', weight: 0.5, reason: 'has a lookup table (a characteristic curve)',
    test: f => (count(f, 'lookup_1d', 'lookup_2d') > 0 ? 1 : 0) },
  { id: 'noise', role: 'sensor', weight: 1.5, reason: 'adds noise',
    test: f => (count(f, ...NOISE) > 0 ? 1 : 0) },
  { id: 'quantiser', role: 'sensor', weight: 1, reason: 'quantises a signal',
    test: f => (count(f, ...QUANTISE) > 0 ? 1 : 0) },
  { id: 'measurement-latency', role: 'sensor', weight: 0.5, reason: 'adds noise and a delay (measurement latency)',
    test: f => (count(f, ...NOISE) > 0 && count(f, ...DELAYS) > 0 ? 1 : 0) },
  { id: 'filters', role: 'compensator', weight: 1.5, reason: 'is mostly discrete filters',
    test: f => (fraction(f, ...FILTERS) >= 0.25 ? 1 : 0) },
  { id: 'error-and-limit', role: 'controller', weight: 1, reason: 'has a sum with a negative input (an error) and a saturation',
    test: f => (f.negativeSums > 0 && count(f, ...SATURATION) > 0 ? 1 : 0) },
  { id: 'pid-structure', role: 'controller', weight: 1, reason: 'has PID-like structure: an error, an integrating or filter element and gains',
    test: f => (f.negativeSums > 0 && count(f, 'integrator', 'discrete_transform', 'unit_delay') > 0 && count(f, 'scale', 'multiply') > 0 ? 1 : 0) },
  { id: 'sampled', role: 'controller', weight: 0.75, reason: 'has its own sample time (a digital part)',
    test: f => (f.sampled ? 1 : 0) },
  { id: 'logic', role: 'other', weight: 1, reason: 'is mostly logic and mode switching',
    test: f => (fraction(f, ...LOGIC) >= 0.3 ? 1 : 0) },
  { id: 'source-only', role: 'other', weight: 3, reason: 'has no inputs (a source of reference or environment signals)',
    test: f => (f.inputs === 0 && f.outputs > 0 ? 1 : 0) },
  { id: 'sink-only', role: 'other', weight: 3, reason: 'has no outputs',
    test: f => (f.outputs === 0 && f.inputs > 0 ? 1 : 0) },

  // (c) Position in the loop on the parent sheet
  { id: 'between-controller-and-plant', role: 'actuator', weight: 1.5, reason: 'is after a controller and before a plant',
    test: f => (hasAny(f.upstream, 'controller') && hasAny(f.downstream, 'plant') ? 1 : 0) },
  { id: 'after-actuator', role: 'plant', weight: 1, reason: 'is after an actuator',
    test: f => (hasAny(f.upstream, 'actuator') && !hasAny(f.downstream, 'plant') ? 1 : 0) },
  { id: 'between-plant-and-controller', role: 'sensor', weight: 1.5, reason: 'is after a plant and before a controller',
    test: f => (hasAny(f.upstream, 'plant') && hasAny(f.downstream, 'controller') ? 1 : 0) },
  { id: 'before-actuator', role: 'controller', weight: 1, reason: 'is before an actuator and after a sensor or a plant',
    test: f => (hasAny(f.downstream, 'actuator') && hasAny(f.upstream, 'sensor', 'plant', 'compensator') ? 1 : 0) },
]

// --- Suggestion -----------------------------------------------------------

export interface RoleSuggestion {
  /** The function with the largest score; null when no rule applies. */
  role: SubsystemFunction | null
  /** 1 - exp(-(best score - second score)), 0..1. */
  confidence: number
  /** The rules that add to `role`, as text. */
  reasons: string[]
  scores: Record<SubsystemFunction, number>
}

function score(f: RoleFeatures, rules: RoleRule[] = ROLE_RULES): RoleSuggestion {
  const scores = Object.fromEntries(SUBSYSTEM_FUNCTIONS.map(r => [r, 0])) as Record<SubsystemFunction, number>
  const fired: Array<{ role: SubsystemFunction; text: string }> = []
  for (const rule of rules) {
    const v = rule.test(f)
    if (v <= 0) continue
    scores[rule.role] += rule.weight * v
    const why = typeof rule.reason === 'function' ? rule.reason(f) : rule.reason
    fired.push({ role: rule.role, text: `${why} (+${rule.weight * v})` })
  }
  // Ties keep the order of SUBSYSTEM_FUNCTIONS
  const ranked = [...SUBSYSTEM_FUNCTIONS].sort((a, b) => scores[b] - scores[a])
  const best = ranked[0], second = ranked[1]
  if (scores[best] <= 0) return { role: null, confidence: 0, reasons: [], scores }
  const confidence = 1 - Math.exp(-(scores[best] - scores[second]))
  return {
    role: best,
    confidence: Math.round(confidence * 1000) / 1000,
    reasons: fired.filter(r => r.role === best).map(r => r.text),
    scores,
  }
}

/** Suggest the function of a subsystem from its name and content only (rules a and b). */
export function suggestFromContent(block: BlockData, lookup?: DefinitionLookup): RoleSuggestion {
  return score(contentFeatures(block, lookup))
}

/**
 * The subsystems that a block's outputs reach (`dir` = 'down') or that reach
 * its inputs (`dir` = 'up') on the sheet, through blocks that are not
 * subsystems. Enable and reset wires count.
 */
function neighbourSubsystems(id: string, blocks: Map<string, BlockData>, wires: WireData[], dir: 'up' | 'down'): string[] {
  const next = new Map<string, string[]>()
  for (const w of wires) {
    if (!blocks.has(w.sourceBlockId) || !blocks.has(w.targetBlockId)) continue
    const [from, to] = dir === 'down' ? [w.sourceBlockId, w.targetBlockId] : [w.targetBlockId, w.sourceBlockId]
    if (!next.has(from)) next.set(from, [])
    next.get(from)!.push(to)
  }
  const found: string[] = []
  const seen = new Set([id])
  const queue = [id]
  while (queue.length) {
    const u = queue.shift()!
    for (const v of next.get(u) ?? []) {
      if (seen.has(v)) continue
      seen.add(v)
      if (isSubsystemBlock(blocks.get(v))) found.push(v)
      else queue.push(v)
    }
  }
  return found
}

export interface SheetRoleOptions {
  /** Finds the definition of a subsystem reference. Default: the blocks of the sheet. */
  lookup?: DefinitionLookup
  /** Default ROLE_CONFIDENCE_THRESHOLD. */
  threshold?: number
}

export interface SheetRoleEntry {
  /** The value that the user set, if any. */
  user: SubsystemFunction | null
  suggestion: RoleSuggestion
  /** The user's value; else the suggestion at the threshold or above; else null. */
  effective: SubsystemFunction | null
}

/**
 * The function of each subsystem on one sheet: rules a and b first, then rule
 * c with the functions of the neighbours from the first pass (the user's
 * value when set). Returns an entry for each subsystem block.
 */
export function sheetSubsystemRoles(
  blocks: BlockData[],
  wires: WireData[],
  options: SheetRoleOptions = {},
): Map<string, SheetRoleEntry> {
  const threshold = options.threshold ?? ROLE_CONFIDENCE_THRESHOLD
  const byId = new Map(blocks.map(b => [b.id, b]))
  const lookup: DefinitionLookup = options.lookup ?? (id => byId.get(id))
  const subs = blocks.filter(isSubsystemBlock)
  const userOf = (b: BlockData) => (isSubsystemFunction(b.parameters?.subsystemFunction) ? b.parameters!.subsystemFunction as SubsystemFunction : null)

  const features = new Map(subs.map(b => [b.id, contentFeatures(b, lookup)]))
  const first = new Map<string, SubsystemFunction | null>()
  for (const b of subs) {
    const s = score(features.get(b.id)!)
    first.set(b.id, userOf(b) ?? (s.confidence >= threshold ? s.role : null))
  }
  const result = new Map<string, SheetRoleEntry>()
  for (const b of subs) {
    const f = features.get(b.id)!
    const known = (ids: string[]) => ids.map(id => first.get(id)).filter((r): r is SubsystemFunction => !!r)
    f.upstream = known(neighbourSubsystems(b.id, byId, wires, 'up'))
    f.downstream = known(neighbourSubsystems(b.id, byId, wires, 'down'))
    const suggestion = score(f)
    const user = userOf(b)
    result.set(b.id, {
      user,
      suggestion,
      effective: user ?? (suggestion.confidence >= threshold ? suggestion.role : null),
    })
  }
  return result
}

/** The effective function of each subsystem on a sheet that has one. */
export function effectiveSheetRoles(blocks: BlockData[], wires: WireData[], options: SheetRoleOptions = {}): Map<string, SubsystemFunction> {
  const out = new Map<string, SubsystemFunction>()
  for (const [id, e] of sheetSubsystemRoles(blocks, wires, options)) if (e.effective) out.set(id, e.effective)
  return out
}

/** A lookup of every block in a sheet tree by id, for subsystem references. */
export function modelBlockLookup(sheets: Array<{ blocks?: BlockData[] }>): DefinitionLookup {
  const all = new Map<string, BlockData>()
  const visit = (list: Array<{ blocks?: BlockData[] }>, depth: number) => {
    if (depth > 30) return
    for (const s of list) {
      for (const b of s.blocks ?? []) {
        if (!all.has(b.id)) all.set(b.id, b)
        if (isSubsystemBlock(b) && Array.isArray(b.parameters?.sheets)) visit(b.parameters!.sheets, depth + 1)
      }
    }
  }
  visit(sheets, 0)
  return id => all.get(id)
}
