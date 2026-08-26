// Printable page sizes, in PDF points (1 pt = 1/72 inch).
//
// Dimensions are stored portrait (width <= height); `resolvePageSize` applies
// the requested orientation.

export type PageOrientation = 'landscape' | 'portrait'

export interface PageSizeDef {
  id: string
  label: string
  group: 'US' | 'ISO' | 'Blueprint'
  /** Portrait width in points. */
  width: number
  /** Portrait height in points. */
  height: number
}

const IN = 72
const MM = 72 / 25.4

const inches = (w: number, h: number) => ({ width: w * IN, height: h * IN })
const mm = (w: number, h: number) => ({ width: w * MM, height: h * MM })

export const PAGE_SIZES: PageSizeDef[] = [
  // --- US / ANSI ---
  { id: 'letter', label: 'Letter (8.5 × 11 in)', group: 'US', ...inches(8.5, 11) },
  { id: 'legal', label: 'Legal (8.5 × 14 in)', group: 'US', ...inches(8.5, 14) },
  { id: 'tabloid', label: 'Tabloid / Ledger (11 × 17 in)', group: 'US', ...inches(11, 17) },

  // --- ISO A ---
  { id: 'a5', label: 'A5 (148 × 210 mm)', group: 'ISO', ...mm(148, 210) },
  { id: 'a4', label: 'A4 (210 × 297 mm)', group: 'ISO', ...mm(210, 297) },
  { id: 'a3', label: 'A3 (297 × 420 mm)', group: 'ISO', ...mm(297, 420) },
  { id: 'a2', label: 'A2 (420 × 594 mm)', group: 'ISO', ...mm(420, 594) },
  { id: 'a1', label: 'A1 (594 × 841 mm)', group: 'ISO', ...mm(594, 841) },
  { id: 'a0', label: 'A0 (841 × 1189 mm)', group: 'ISO', ...mm(841, 1189) },

  // --- Engineering / architectural (blueprint) ---
  { id: 'ansi_c', label: 'ANSI C (17 × 22 in)', group: 'Blueprint', ...inches(17, 22) },
  { id: 'ansi_d', label: 'ANSI D (22 × 34 in)', group: 'Blueprint', ...inches(22, 34) },
  { id: 'ansi_e', label: 'ANSI E (34 × 44 in)', group: 'Blueprint', ...inches(34, 44) },
  { id: 'arch_a', label: 'ARCH A (9 × 12 in)', group: 'Blueprint', ...inches(9, 12) },
  { id: 'arch_b', label: 'ARCH B (12 × 18 in)', group: 'Blueprint', ...inches(12, 18) },
  { id: 'arch_c', label: 'ARCH C (18 × 24 in)', group: 'Blueprint', ...inches(18, 24) },
  { id: 'arch_d', label: 'ARCH D (24 × 36 in)', group: 'Blueprint', ...inches(24, 36) },
  { id: 'arch_e', label: 'ARCH E (36 × 48 in)', group: 'Blueprint', ...inches(36, 48) },
  { id: 'arch_e1', label: 'ARCH E1 (30 × 42 in)', group: 'Blueprint', ...inches(30, 42) },
]

export const DEFAULT_PAGE_SIZE_ID = 'letter'
export const DEFAULT_ORIENTATION: PageOrientation = 'landscape'

export function getPageSize(id: string): PageSizeDef {
  return PAGE_SIZES.find(p => p.id === id) ?? PAGE_SIZES.find(p => p.id === DEFAULT_PAGE_SIZE_ID)!
}

/** Page dimensions with orientation applied. */
export function resolvePageSize(
  id: string,
  orientation: PageOrientation,
): { width: number; height: number } {
  const def = getPageSize(id)
  return orientation === 'landscape'
    ? { width: def.height, height: def.width }
    : { width: def.width, height: def.height }
}
