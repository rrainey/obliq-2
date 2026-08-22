/**
 * S-IB H-1 engine cluster + TVC — ported from saturn_ib_stack.mdl
 * "H-1 Engine Cluster" / Engine 1–8.
 *
 * Layout (mount positions relative to Sta. 100, m — mdl masks):
 *   Outer (gimballed) engines 1–4 at Y,Z = ±1.704 m, X = 0
 *   Inner (fixed tilt) engines 5–8 simplified as fixed +X at smaller radius
 *
 * Physics (each engine):
 *   Thrust T_i along nozzle axis (vehicle force = +T in body when undeflected)
 *   Gimbal: pitch/yaw deflections δp, δy (rad) tip the thrust vector
 *   F_i = T_i * unit thrust direction in body
 *   M_i = (r_mount − r_CG) × F_i
 *   F_engines = Σ F_i ,  M_engines = Σ M_i
 *
 * Control interface (replaces free My actuator):
 *   beta_P_deg, beta_Y_deg — cluster pitch/yaw gimbal commands (deg)
 *   Mapped equally to outer engines; inner engines fixed (neutral cant only).
 *
 * Thrust: use total vehicle thrust T_total and split 8 ways, or pass per-engine.
 * Default single-engine H-1 table in mdl ~0.86–1.0 MN; ×8 ≈ 6.9–8 MN class.
 */

import type { Vec3 } from './as205PadFrames'

/** Outer engine mount YZ (m), X=0 — mdl Engine 1–4 */
export const H1_OUTER_MOUNTS: Array<{
  id: number
  /** Mount position [X,Y,Z] m (Sta. 100 frame) */
  r_m: Vec3
  /** Mount roll rotation about X (deg) */
  mpr_deg: number
}> = [
  { id: 1, r_m: [0.0, -1.704, 1.704], mpr_deg: 0 },
  { id: 2, r_m: [0.0, -1.704, -1.704], mpr_deg: -90 },
  { id: 3, r_m: [0.0, 1.704, -1.704], mpr_deg: -180 },
  { id: 4, r_m: [0.0, 1.704, 1.704], mpr_deg: -270 }
]

/** Inner fixed engines — mdl Engine 5 uses [0,0,0.81]; others on ring */
export const H1_INNER_MOUNTS: Array<{ id: number; r_m: Vec3 }> = [
  { id: 5, r_m: [0.0, 0.0, 0.81] },
  { id: 6, r_m: [0.0, 0.81, 0.0] },
  { id: 7, r_m: [0.0, 0.0, -0.81] },
  { id: 8, r_m: [0.0, -0.81, 0.0] }
]

/** Gimbal angle limit (deg) — typical H-1 / mdl limit blocks ~±8° */
export const H1_GIMBAL_LIMIT_DEG = 8.0

/** Per-engine thrust scale (mdl Engine 1: 899475/859000) */
export const H1_THRUST_SCALE = 899475.0 / 859000.0

/** Single H-1 vacuum-ish thrust vs burn time (s) from mdl "Thrust vs. Time" */
export const H1_THRUST_TIME_S = [0, 20, 40, 60, 80, 100, 120, 140]
export const H1_THRUST_N = [
  859000, 895819, 923597, 956249, 984994, 997243, 993749, 979176
].map(t => t * H1_THRUST_SCALE)

/** Default CG for moment arm (same frame as mounts); refine with mass table later */
/**
 * Liftoff CG for H-1 lever arms: RTW `<S122>/CG X` at ~582 t.
 * Y/Z held at 0 for the equal-outer-gimbal plant idealization (RTW Y/Z ~cm).
 */
export const H1_DEFAULT_CG_M: Vec3 = [15.8332, 0.0, 0.0]

export interface EngineClusterResult {
  F_N: Vec3
  M_Nm: Vec3
  /** Per outer engine thrust used (N) */
  T_outer_N: number
  /** Per inner engine thrust used (N) */
  T_inner_N: number
  beta_P_rad: number
  beta_Y_rad: number
  notes: string[]
}

function deg2rad(d: number): number {
  return (d * Math.PI) / 180
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x))
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0]
  ]
}

function add3(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
}

function sub3(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
}

function scale3(a: Vec3, s: number): Vec3 {
  return [a[0] * s, a[1] * s, a[2] * s]
}

/**
 * Thrust direction in body axes for a gimballed engine.
 * Undeflected: +X (forward / vehicle acceleration).
 * δp = pitch gimbal (rad): tips thrust toward +Z (downrange body when B‖S).
 * δy = yaw gimbal (rad): tips thrust toward +Y.
 *
 * Small-angle / sequential rotation: F = T * [c_p c_y, s_y, s_p c_y]
 * (jet aft; vehicle force opposite jet → +X when δ=0).
 */
export function thrustDirectionBody(
  beta_P_rad: number,
  beta_Y_rad: number
): Vec3 {
  const cp = Math.cos(beta_P_rad)
  const sp = Math.sin(beta_P_rad)
  const cy = Math.cos(beta_Y_rad)
  const sy = Math.sin(beta_Y_rad)
  // Normalize not required for small angles; exact for this parametrization
  return [cp * cy, sy, sp * cy]
}

/**
 * Force and moment from one engine.
 * r_mount and r_CG in same body-fixed station frame (m).
 */
export function singleEngineFM(
  T_N: number,
  r_mount: Vec3,
  r_CG: Vec3,
  beta_P_rad: number,
  beta_Y_rad: number
): { F: Vec3; M: Vec3 } {
  const u = thrustDirectionBody(beta_P_rad, beta_Y_rad)
  const F = scale3(u, T_N)
  const r = sub3(r_mount, r_CG)
  const M = cross(r, F)
  return { F, M }
}

/**
 * Cluster F,M for given total thrust and gimbal commands.
 * Outer engines share beta_P / beta_Y; inner engines fixed (δ=0).
 * Thrust split equally 8 ways by default.
 */
export function computeH1ClusterForcesMoments(opts: {
  /** Total vehicle thrust (N) — e.g. TN Table 5 or 8×H-1 */
  T_total_N: number
  /** Pitch gimbal command (deg), limited */
  beta_P_deg?: number
  /** Yaw gimbal command (deg), limited */
  beta_Y_deg?: number
  /** CG [X,Y,Z] m */
  CG_m?: Vec3
  /** If true, only outer 4 engines produce thrust (IECO style) */
  outerOnly?: boolean
}): EngineClusterResult {
  const lim = H1_GIMBAL_LIMIT_DEG
  const bp = deg2rad(clamp(opts.beta_P_deg ?? 0, -lim, lim))
  const by = deg2rad(clamp(opts.beta_Y_deg ?? 0, -lim, lim))
  const CG = opts.CG_m ?? H1_DEFAULT_CG_M
  const n = opts.outerOnly ? 4 : 8
  const T_each = opts.T_total_N / n

  let F: Vec3 = [0, 0, 0]
  let M: Vec3 = [0, 0, 0]

  for (const eng of H1_OUTER_MOUNTS) {
    const fm = singleEngineFM(T_each, eng.r_m, CG, bp, by)
    F = add3(F, fm.F)
    M = add3(M, fm.M)
  }
  if (!opts.outerOnly) {
    for (const eng of H1_INNER_MOUNTS) {
      const fm = singleEngineFM(T_each, eng.r_m, CG, 0, 0)
      F = add3(F, fm.F)
      M = add3(M, fm.M)
    }
  }

  return {
    F_N: F,
    M_Nm: M,
    T_outer_N: T_each,
    T_inner_N: opts.outerOnly ? 0 : T_each,
    beta_P_rad: bp,
    beta_Y_rad: by,
    notes: [
      'H-1 cluster: 4 outer gimballed + 4 inner fixed (unless outerOnly)',
      `β_P=${((bp * 180) / Math.PI).toFixed(3)}°, β_Y=${((by * 180) / Math.PI).toFixed(3)}° (lim ±${lim}°)`,
      'F,M about CG; mounts from saturn_ib_stack H-1 Engine Cluster masks'
    ]
  }
}

/**
 * Linearized pitch moment gain ≈ dMy/dβ_P at β=0 (N·m/rad) for PD scaling.
 * My ≈ (X_mount − X_CG) * (−T * β_P) for small β with Fz = T*β_P... 
 * With F = T[1, 0, β_P], r = [xm−xc, ym, zm], My = rz*Fx − rx*Fz ≈ −rx * T * β_P
 * rx = xm − xc < 0 if engines aft of CG → My / β_P = −rx * T > 0 if rx < 0.
 */
export function pitchGimbalMomentGain(
  T_total_N: number,
  CG_m: Vec3 = H1_DEFAULT_CG_M
): number {
  // Finite difference
  const a = computeH1ClusterForcesMoments({
    T_total_N,
    beta_P_deg: 0.1,
    CG_m
  })
  const b = computeH1ClusterForcesMoments({
    T_total_N,
    beta_P_deg: -0.1,
    CG_m
  })
  const dMy = a.M_Nm[1] - b.M_Nm[1]
  const dBeta = deg2rad(0.2)
  return dMy / dBeta
}
