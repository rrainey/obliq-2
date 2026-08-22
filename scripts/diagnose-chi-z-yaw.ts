#!/usr/bin/env npx tsx
/**
 * Offline Chi_Z / geometric yaw diagnosis → CSV (no plant closed-loop).
 *
 * Usage:
 *   npx --yes tsx scripts/diagnose-chi-z-yaw.ts \
 *     [--out examples/saturn-ib/chi-z-yaw-diagnose.csv]
 */

import * as fs from 'fs'
import * as path from 'path'
import { igmChiYZFromUnitVector } from '../examples/saturn-ib/igmChiAssembly'
import { chiToPsiDeg } from '../examples/saturn-ib/igmChiToPsi'

const RAD2DEG = 180 / Math.PI

function asinDeg(y: number): number {
  const c = y > 1 ? 1 : y < -1 ? -1 : y
  return Math.asin(c) * RAD2DEG
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name)
  return i >= 0 ? process.argv[i + 1] : undefined
}

const outPath =
  arg('--out') ??
  path.join('examples/saturn-ib', 'chi-z-yaw-diagnose.csv')

const rows: string[] = [
  [
    'vy',
    'vx',
    'Chi_Y_deg',
    'Chi_Z_deg',
    'asin_vy_deg',
    'Chi_Z_minus_asin',
    'Psi_Y_jump_deg',
    'beta_Y_deg_if_Kp20',
    'beta_Y_deg_if_Kp2'
  ].join(',')
]

for (let i = 0; i <= 40; i++) {
  const vy = -0.95 + (1.9 * i) / 40
  const vx = Math.sqrt(Math.max(1e-12, 1 - vy * vy))
  const { Chi_Y_deg, Chi_Z_deg } = igmChiYZFromUnitVector([vx, vy, 0])
  const a = asinDeg(vy)
  // IGM-on jump: meas yaw ~0, cmd = Chi_Z
  const jump = chiToPsiDeg([0, -60, 0], [0, -60, Chi_Z_deg])
  const b20 = -20 * ((jump.Psi_Y_deg * Math.PI) / 180)
  const b2 = -2 * ((jump.Psi_Y_deg * Math.PI) / 180)
  rows.push(
    [
      vy.toFixed(6),
      vx.toFixed(6),
      Chi_Y_deg.toFixed(6),
      Chi_Z_deg.toFixed(6),
      a.toFixed(6),
      (Chi_Z_deg - a).toFixed(12),
      jump.Psi_Y_deg.toFixed(6),
      b20.toFixed(4),
      b2.toFixed(4)
    ].join(',')
  )
}

// Coupled tip+yaw sample block
rows.push('')
rows.push('# coupled samples: Theta=[0,thP,thY] Chi=[0,chiP,chiZ]')
rows.push(
  [
    'thP',
    'thY',
    'chiP',
    'chiZ',
    'Psi_R',
    'Psi_P',
    'Psi_Y',
    'finite'
  ].join(',')
)
const cases: [number, number, number, number][] = [
  [0, 0, 0, 0],
  [-60, 0, -60, 0],
  [-60, 0, -60, 15],
  [-60, 5, -60, 15],
  [-40, 10, -55, 20],
  [-75, -5, -60, -30],
  [-60, 0, -60, 45]
]
for (const [thP, thY, chiP, chiZ] of cases) {
  const p = chiToPsiDeg([0, thP, thY], [0, chiP, chiZ])
  const ok =
    Number.isFinite(p.Psi_R_deg) &&
    Number.isFinite(p.Psi_P_deg) &&
    Number.isFinite(p.Psi_Y_deg)
  rows.push(
    [
      thP,
      thY,
      chiP,
      chiZ,
      p.Psi_R_deg.toFixed(6),
      p.Psi_P_deg.toFixed(6),
      p.Psi_Y_deg.toFixed(6),
      ok ? 1 : 0
    ].join(',')
  )
}

fs.mkdirSync(path.dirname(outPath), { recursive: true })
fs.writeFileSync(outPath, rows.join('\n') + '\n')
console.log(`Wrote ${outPath} (${rows.length} lines)`)
console.log(
  'Findings:\n' +
    '  1) Chi_Z ≡ sat(asin(vy), ±45) — raw asin exceeds ±45 when |vy|>√½.\n' +
    '  2) Unsaturated Θ_Y=asin(Xb_y) vs sat Chi_Z ⇒ permanent Ψ_Y bias (closed-loop NaN root).\n' +
    '  3) IGM-on Chi_Z jump with Θ_Y≈0 ⇒ |Ψ_Y|≈|Chi_Z| ⇒ β_Y saturates at Kp=20.\n' +
    'Retry yaw with Θ_Y=sat(asin(Xb_y),±45) + soft Kp before full enable.'
)
