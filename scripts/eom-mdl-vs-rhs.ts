#!/usr/bin/env npx tsx
/**
 * Same-input residual: MDL-translated Custom Variable Mass 6DoF (C) vs
 * sixDofVarMassEomRhs (TS oracle).
 *
 * Pipeline:
 *   1. Emit 6DoF subsystem (if needed)
 *   2. Codegen + compile
 *   3. Run C probe → /tmp/.../mdl_rhs.json
 *   4. Evaluate TS eomRhs with identical state/inputs
 *   5. Print residual table (and optional --gate)
 *
 * Usage:
 *   npx --yes tsx scripts/eom-mdl-vs-rhs.ts
 *   npx --yes tsx scripts/eom-mdl-vs-rhs.ts --gate --tol 1e-6
 */

import { execSync } from 'child_process'
import * as fs from 'fs'
import * as path from 'path'
import { EOM_MDL_ADAPTER } from '../examples/saturn-ib/sixDofVarMassEom'
import {
  eomRhs,
  type EomParams,
  type EomState,
  type Vec3
} from '../examples/saturn-ib/sixDofVarMassEomRhs'

const ROOT = path.resolve(__dirname, '..')
const OUT = '/tmp/mdl2obliq-eom'
const JSON_NAME = 'custom_variable_mass_6dof_quaternion__translated.json'
const CGEN = path.join(OUT, 'cgen-resid')

/** Shared fixture (matches EOM_MDL_ADAPTER: gravity already in F if desired). */
const FIX = {
  r_i: [6378137.0, 0.0, 0.0] as Vec3,
  v_b: [10.0, -3.0, 2.0] as Vec3,
  omega_b: [0.01, -0.02, 0.03] as Vec3,
  q: [1.0, 0.0, 0.0, 0.0] as [number, number, number, number],
  m: 500000.0,
  // F already includes body gravity for forcePathGravity parity:
  // g_b ≈ (−μ/r², 0, 0) with identity quat
  F_b: [-500000.0 * (3.986004418e14 / (6378137.0 * 6378137.0)) + 1.0e5, -2.0e4, 5.0e3] as Vec3,
  M_b: [1000.0, -2000.0, 500.0] as Vec3,
  I_diag: [2.0e5, 6.0e6, 6.0e6] as Vec3,
  mdot_prop: 0.0
}

function argFlag(name: string): boolean {
  return process.argv.includes(name)
}

function argVal(name: string, fallback: string): string {
  const i = process.argv.indexOf(name)
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1]! : fallback
}

function ensureEmit(): string {
  const jsonPath = path.join(OUT, JSON_NAME)
  if (!fs.existsSync(jsonPath) || argFlag('--emit')) {
    execSync(
      `npx --yes tsx scripts/mdl-emit.ts saturn-1B/saturn_ib_stack.mdl --subsystem "Custom Variable Mass 6DoF (Quaternion)" --out ${OUT}`,
      { cwd: ROOT, stdio: 'inherit' }
    )
  }
  return jsonPath
}

function ensureCgen(jsonPath: string): void {
  if (fs.existsSync(path.join(CGEN, 'build', 'libeom6dof.a')) && !argFlag('--cgen')) {
    return
  }
  fs.mkdirSync(CGEN, { recursive: true })
  execSync(
    `npx --yes tsx scripts/obliq-cgen.ts ${JSON.stringify(jsonPath)} --out ${JSON.stringify(CGEN)} --name eom6dof --dt 0.005 --compile`,
    { cwd: ROOT, stdio: 'inherit' }
  )
}

function writeProbe(): string {
  const probePath = path.join(CGEN, 'probe_rhs.c')
  const src = `#include "eom6dof.h"
#include <stdio.h>
#include <string.h>
#include <math.h>

int main(void) {
  eom6dof_t m;
  memset(&m, 0, sizeof(m));
  eom6dof_init(&m, 0.005);

  /* Inputs */
  m.inputs.Forces[0] = ${FIX.F_b[0]};
  m.inputs.Forces[1] = ${FIX.F_b[1]};
  m.inputs.Forces[2] = ${FIX.F_b[2]};
  m.inputs.Moments[0] = ${FIX.M_b[0]};
  m.inputs.Moments[1] = ${FIX.M_b[1]};
  m.inputs.Moments[2] = ${FIX.M_b[2]};
  m.inputs.mass = ${FIX.m};
  m.inputs.m_dot = ${-FIX.mdot_prop};
  m.inputs.I_dot = 0.0;
  memset(m.inputs.I, 0, sizeof(m.inputs.I));
  m.inputs.I[0][0] = ${FIX.I_diag[0]};
  m.inputs.I[1][1] = ${FIX.I_diag[1]};
  m.inputs.I[2][2] = ${FIX.I_diag[2]};
  m.inputs.initial_quaternion[0][0] = ${FIX.q[0]};
  m.inputs.initial_quaternion[1][0] = ${FIX.q[1]};
  m.inputs.initial_quaternion[2][0] = ${FIX.q[2]};
  m.inputs.initial_quaternion[3][0] = ${FIX.q[3]};
  m.inputs.Xe_initial_m[0] = ${FIX.r_i[0]};
  m.inputs.Xe_initial_m[1] = ${FIX.r_i[1]};
  m.inputs.Xe_initial_m[2] = ${FIX.r_i[2]};
  m.inputs.Vb_0_mps[0] = ${FIX.v_b[0]};
  m.inputs.Vb_0_mps[1] = ${FIX.v_b[1]};
  m.inputs.Vb_0_mps[2] = ${FIX.v_b[2]};

  /* Copy inputs → signals, then IC reseed, then algebraics with live state */
  for (int i = 0; i < 3; i++) m.signals.Forces[i] = m.inputs.Forces[i];
  for (int i = 0; i < 3; i++) m.signals.Moments[i] = m.inputs.Moments[i];
  m.signals.mass = m.inputs.mass;
  m.signals.m_dot = m.inputs.m_dot;
  m.signals.I_dot = m.inputs.I_dot;
  memcpy(m.signals.I, m.inputs.I, sizeof(m.signals.I));
  memcpy(m.signals.initial_quaternion, m.inputs.initial_quaternion, sizeof(m.signals.initial_quaternion));
  for (int i = 0; i < 3; i++) m.signals.Xe_initial_m[i] = m.inputs.Xe_initial_m[i];
  for (int i = 0; i < 3; i++) m.signals.Vb_0_mps[i] = m.inputs.Vb_0_mps[i];

  eom6dof_evaluate_algebraic(&m);
  eom6dof_reseed_integrator_ics(&m);
  /* Force omega IC (p_q_r x(0) not wired in isolated emit) */
  m.states.p_q_r_states[0] = ${FIX.omega_b[0]};
  m.states.p_q_r_states[1] = ${FIX.omega_b[1]};
  m.states.p_q_r_states[2] = ${FIX.omega_b[2]};
  eom6dof_evaluate_algebraic(&m);

  printf("{\\n");
  printf("  \\"v_dot\\": [%.17g, %.17g, %.17g],\\n", m.signals.Sum[0], m.signals.Sum[1], m.signals.Sum[2]);
  printf("  \\"omega_dot\\": [%.17g, %.17g, %.17g],\\n",
    m.signals.Calculate_omega_dot_Product2[0],
    m.signals.Calculate_omega_dot_Product2[1],
    m.signals.Calculate_omega_dot_Product2[2]);
  printf("  \\"q_dot\\": [%.17g, %.17g, %.17g, %.17g],\\n",
    m.signals.Calculate_DCM_Euler_Angles_qdot_q0dot,
    m.signals.Calculate_DCM_Euler_Angles_qdot_q1dot,
    m.signals.Calculate_DCM_Euler_Angles_qdot_q2dot,
    m.signals.Calculate_DCM_Euler_Angles_qdot_q3dot);
  printf("  \\"Ab\\": [%.17g, %.17g, %.17g],\\n", m.signals.Product[0], m.signals.Product[1], m.signals.Product[2]);
  printf("  \\"I_pack\\": [%.17g, %.17g, %.17g, %.17g, %.17g, %.17g],\\n",
    m.signals.Determine_Force_Mass_Inertia_I_Idot[0],
    m.signals.Determine_Force_Mass_Inertia_I_Idot[1],
    m.signals.Determine_Force_Mass_Inertia_I_Idot[2],
    m.signals.Determine_Force_Mass_Inertia_I_Idot[3],
    m.signals.Determine_Force_Mass_Inertia_I_Idot[4],
    m.signals.Determine_Force_Mass_Inertia_I_Idot[5]);
  printf("  \\"v_b\\": [%.17g, %.17g, %.17g],\\n", m.signals.ub_vb_wb[0], m.signals.ub_vb_wb[1], m.signals.ub_vb_wb[2]);
  printf("  \\"omega_b\\": [%.17g, %.17g, %.17g]\\n", m.signals.p_q_r[0], m.signals.p_q_r[1], m.signals.p_q_r[2]);
  printf("}\\n");
  return 0;
}
`
  fs.writeFileSync(probePath, src)
  return probePath
}

function runProbe(probePath: string): any {
  const bin = path.join(CGEN, 'probe_rhs')
  execSync(
    `gcc -O2 -o ${bin} ${probePath} ${path.join(CGEN, 'eom6dof.c')} -lm -I${CGEN}`,
    { stdio: 'inherit' }
  )
  const out = execSync(bin, { encoding: 'utf8' })
  const jsonPath = path.join(CGEN, 'mdl_rhs.json')
  fs.writeFileSync(jsonPath, out)
  return JSON.parse(out)
}

function tsOracle(): ReturnType<typeof eomRhs> {
  const state: EomState = {
    r_i: FIX.r_i,
    v_b: FIX.v_b,
    omega_b: FIX.omega_b,
    q: FIX.q,
    m: FIX.m
  }
  // MDL Forces already include gravity ⇒ pass F as F_b with forcePathGravity
  // but ZERO extra g by using forcePathGravity and F = F_aug already.
  // eomRhs with forcePathGravity does F_aug = F_b + m*g_b.
  // So for parity we must either:
  //   (a) use legacy mode with F_non_grav and let oracle add g, or
  //   (b) use forcePathGravity with F_b = F_aug - m*g_b
  // FIX.F_b is already F_aug (includes m*g). Use a custom path:
  // Compare MDL Sum to oracle with forcePathGravity=false and F_b = F_aug - wait.
  //
  // MDL: v̇ = F/m − ω×v  where F is Forces inport (parent's F_aug).
  // Oracle forcePathGravity: v̇ = (F_b + m g_b)/m − ω×v
  // Oracle legacy: v̇ = F_b/m − ω×v + g_b
  //
  // For MDL isolated: v̇ = F_in/m − ω×v  (no extra g).
  // So oracle should use F_b = FIX.F_b and physics that does NOT add g again.
  // Easiest: legacy with F_b = FIX.F_b - m*g_b, OR add a noGravity flag.
  // Here: compute g_b and pass F_non_grav to legacy... simpler to use
  // forcePathGravity:false and F_b such that F_b/m + g_b = F_aug/m
  // i.e. F_b = F_aug - m*g_b.
  const g = -(3.986004418e14) / (6378137.0 * 6378137.0)
  const F_non_grav: Vec3 = [
    FIX.F_b[0] - FIX.m * g,
    FIX.F_b[1],
    FIX.F_b[2]
  ]
  // Wait — FIX.F_b already = m*g_body_x + thrust = m*(-|g|) + 1e5 along x
  // with identity quat g_b = (g,0,0) where g=-|g|.
  // So F_aug = FIX.F_b. MDL: v̇ = F_aug/m − ω×v.
  // Oracle forcePathGravity with F_b = F_aug - m*g_b = thrust-only:
  const F_thrust: Vec3 = [1.0e5, -2.0e4, 5.0e3]
  const params: EomParams = {
    mu: 3.986004418e14,
    I_ref: FIX.I_diag,
    m_ref: FIX.m,
    physics: { ...EOM_MDL_ADAPTER, forcePathGravity: true, zeroIdot: true }
  }
  return eomRhs(state, { F_b: F_thrust, M_b: FIX.M_b, mdot_prop: FIX.mdot_prop }, params)
}

function residual(
  a: number[],
  b: number[],
  name: string
): { name: string; abs: number[]; rel: number[]; maxAbs: number } {
  const abs = a.map((x, i) => Math.abs(x - b[i]!))
  const rel = a.map((x, i) => {
    const den = Math.max(Math.abs(b[i]!), 1e-12)
    return Math.abs(x - b[i]!) / den
  })
  return { name, abs, rel, maxAbs: Math.max(...abs) }
}

function main(): void {
  const tol = Number(argVal('--tol', '1e-6'))
  const gate = argFlag('--gate')

  console.log('=== EOM MDL (C) vs TS RHS residual ===')
  const jsonPath = ensureEmit()
  ensureCgen(jsonPath)
  const probe = writeProbe()
  const mdl = runProbe(probe)
  const ts = tsOracle()

  const rows = [
    residual(mdl.v_dot, ts.v_dot, 'v_dot'),
    residual(mdl.omega_dot, ts.omega_dot, 'omega_dot'),
    residual(mdl.q_dot, ts.q_dot, 'q_dot')
  ]

  console.log('\nFixture: r=|+X| surface, identity q, nonzero v/ω, F_aug includes m·g, M≠0, I=diag')
  console.log('\n| channel | MDL | TS | |Δ| | rel |')
  console.log('|---------|-----|----|-----|-----|')
  for (const r of rows) {
    const mdlArr = r.name === 'v_dot' ? mdl.v_dot : r.name === 'omega_dot' ? mdl.omega_dot : mdl.q_dot
    const tsArr = r.name === 'v_dot' ? ts.v_dot : r.name === 'omega_dot' ? ts.omega_dot : ts.q_dot
    for (let i = 0; i < mdlArr.length; i++) {
      console.log(
        `| ${r.name}[${i}] | ${mdlArr[i].toExponential(6)} | ${tsArr[i].toExponential(6)} | ${r.abs[i]!.toExponential(3)} | ${r.rel[i]!.toExponential(3)} |`
      )
    }
  }

  const maxAbs = Math.max(...rows.map(r => r.maxAbs))
  console.log(`\nmax|Δ| = ${maxAbs.toExponential(6)}  (tol=${tol})`)
  console.log(`I_pack diag = [${mdl.I_pack.slice(0, 3).join(', ')}]`)

  const report = {
    fixture: FIX,
    mdl,
    ts: {
      v_dot: ts.v_dot,
      omega_dot: ts.omega_dot,
      q_dot: ts.q_dot
    },
    maxAbs,
    tol,
    pass: maxAbs <= tol
  }
  const reportPath = path.join(OUT, 'eom-mdl-vs-rhs.json')
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2))
  console.log(`Wrote ${reportPath}`)

  if (gate && maxAbs > tol) {
    console.error('FAIL: residual exceeds --tol')
    process.exit(1)
  }
  console.log(maxAbs <= tol ? 'PASS' : 'CHECK (residuals above tol — investigate)')
}

main()
