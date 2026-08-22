/**
 * Saturn-IB aerodynamic forces & moments — port of
 * saturn_ib_stack.mdl subsystem "Aerodynamic Forces and Moments".
 *
 * Source tables annotated in the mdl (NASA-TM-X-53243 aborted Saturn IB
 * static aero — author note in mdl). Not TN-AP-67-158 aero tables.
 *
 * Build-up (body axes, +X forward/thrust):
 *   q̄ = ½ ρ V²
 *   M = V / a
 *   CA = CA_T(M)                         // axial force coeff (1-D)
 *   CN_α = CN(M, α_deg),  CN_β = CN(M, β_deg)  // 2-D; mdl passes **signed**
 *     deg into Lookup2D (breakpoints ≥0 ⇒ clamp for α<0 — match RTW, not |α|)
 *   F_aero = q̄ S_ref · [ −CA,  −CN_β,  −CN_α ]   // Unary Minus only (mdl)
 *   r_CP = [CP(M), 0, 0],  r_arm = r_CP − r_CG(mass)  // RTW <S122> CG LUTs
 *   M_aero = r_arm × F_aero
 *
 * α, β, q̄, Mach must use **air-relative** body velocity, not inertial v_b:
 *   v_air_E = v_E − ω_E × r_E ,  v_air_b = C_{bE}^⊤ v_air_E
 * At pad, air-relative speed ≈ 0 (atmosphere co-rotates). Using inertial v_b
 * (Earth-rate ~409 m/s horizontal with X vertical) gives α≈90° and multi-MN
 * side force — plant blow-up. See 9.6 residual after first aero port.
 *
 * α = atan2(w, u),  β = asin(clamp(v/|v_air|, −1, 1)) on v_air_b = [u,v,w]
 *
 * S_ref = 34.25 m² (mdl). CG constant for S-IB stack (CG(t) table later).
 */

/** Reference area (m²) — mdl "Referece Area (m^2)" */
export const AERO_S_REF_M2 = 34.25

/**
 * Mass breakpoints (kg) for S-IB Vehicle Mass Properties CG / I LUTs.
 * From RTW `saturn_ib_stack_rtcP.pooled50` (`<S122>/CG X|Y|Z`).
 */
export const SIB_CG_MASS_BREAKPOINTS_KG: number[] = [
  179218, 179225, 180020, 182752, 185149, 196236, 210314, 224456, 238644,
  252875, 267134, 281431, 295745, 310078, 324423, 338778, 353202, 367663,
  382121, 396580, 411038, 425426, 439815, 454204, 468588, 482967, 497330,
  511673, 525995, 540243, 554412, 568480, 582491
]

/** CG_x(m) vs mass — RTW `CGX_YData` (station frame, same as CP). */
export const SIB_CG_X_M: number[] = [
  25.144, 25.144, 25.0557, 24.7247, 24.4584, 23.3056, 22.0548, 20.999, 20.0932,
  19.3229, 18.6591, 18.0941, 17.6068, 17.1932, 16.8385, 16.5392, 16.2823,
  16.0685, 15.8906, 15.7477, 15.6373, 15.5551, 15.4957, 15.4585, 15.4409,
  15.4422, 15.4591, 15.4918, 15.5375, 15.5959, 15.6648, 15.7444, 15.8332
]

/** CG_y(m) vs mass — RTW `CGY_YData`. */
export const SIB_CG_Y_M: number[] = [
  0.0021, 0.0021, 0.0206, 0.0203, 0.0201, 0.0191, 0.0178, 0.0165, 0.0155,
  0.0147, 0.014, 0.0132, 0.0124, 0.0121, 0.0114, 0.0109, 0.0104, 0.01, 0.0097,
  0.0094, 0.0091, 0.0086, 0.0084, 0.0081, 0.0079, 0.0076, 0.0074, 0.0072,
  0.0071, 0.0069, 0.0066, 0.0065, 0.0064
]

/** CG_z(m) vs mass — RTW `CGZ_YData`. */
export const SIB_CG_Z_M: number[] = [
  -0.0079, -0.0079, -0.0079, -0.0076, -0.0076, -0.007, -0.0066, -0.0062,
  -0.0058, -0.0055, -0.0051, -0.005, -0.0046, -0.0044, -0.0043, -0.0041,
  -0.0038, -0.0037, -0.0036, -0.0034, -0.0033, -0.0032, -0.003, -0.0028,
  -0.0028, -0.0028, -0.0028, -0.0025, -0.0025, -0.0025, -0.0025, -0.0023,
  -0.0023
]

/**
 * Fallback CG at liftoff mass (~582 t) from the RTW LUT — **not** the old
 * mid-stack placeholder 22 m (that flipped CP−CG sign vs Simulink and tumbled).
 * Prefer {@link sibCgFromMassKg} when mass is known.
 * Post-separation mdl constant: 369.487*0.0254 ≈ 9.39 m (separate path).
 */
export const AERO_CG_SIB_M: [number, number, number] = [
  SIB_CG_X_M[SIB_CG_X_M.length - 1],
  SIB_CG_Y_M[SIB_CG_Y_M.length - 1],
  SIB_CG_Z_M[SIB_CG_Z_M.length - 1]
]

/** Interpolate S-IB CG (m) from vehicle mass (kg), RTW `<S122>` tables. */
export function sibCgFromMassKg(mass_kg: number): [number, number, number] {
  const xp = SIB_CG_MASS_BREAKPOINTS_KG
  const lerp = (yp: number[]) => {
    if (mass_kg <= xp[0]) return yp[0]
    if (mass_kg >= xp[xp.length - 1]) return yp[yp.length - 1]
    for (let i = 0; i < xp.length - 1; i++) {
      if (mass_kg <= xp[i + 1]) {
        const t = (mass_kg - xp[i]) / (xp[i + 1] - xp[i])
        return yp[i] + t * (yp[i + 1] - yp[i])
      }
    }
    return yp[yp.length - 1]
  }
  return [lerp(SIB_CG_X_M), lerp(SIB_CG_Y_M), lerp(SIB_CG_Z_M)]
}

/** CA_T(Mach) — axial force coefficient (mdl Lookup CA_T) */
export const CA_MACH_BREAKPOINTS = [0.0, 0.5, 0.75, 1.0, 1.25, 1.5, 6.0]
export const CA_VALUES = [1.2, 0.84, 0.74, 0.96, 1.02, 0.95, 0.48]

/** CP(Mach) along +X (m) — mdl Lookup "CP (m)" */
export const CP_MACH_BREAKPOINTS = [0.0, 0.51, 1.2, 1.54, 2.14, 6.28]
export const CP_VALUES_M = [17.95, 17.9109, 18.2259, 20.2936, 25.3718, 35.6068]

/** CN 2-D: rows = Mach, cols = |α| or |β| (deg) — mdl CN(alpha)/CN(beta) */
export const CN_MACH_BREAKPOINTS = [0, 0.2, 0.4, 1, 2, 3, 4.8]
export const CN_ANGLE_DEG_BREAKPOINTS = [0, 2, 4, 6, 8, 10, 12, 14, 15]

/**
 * CN table row-major [iMach][iAngle].
 * MATLAB reshape(v,7,9) is column-major → we un-flatten accordingly.
 */
export const CN_TABLE: number[][] = (() => {
  // Column-major list from mdl OutputValues (7 rows × 9 cols)
  const colMajor = [
    0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, // |ang|=0
    0.22, 0.22, 0.22, 0.28, 0.18, 0.14, 0.08,
    0.44, 0.44, 0.45, 0.52, 0.35, 0.3, 0.21,
    0.68, 0.68, 0.69, 0.8, 0.55, 0.52, 0.4,
    0.9, 0.9, 0.92, 1.1, 0.8, 0.8, 0.6,
    1.15, 1.15, 1.17, 1.35, 1.1, 1.18, 0.9,
    1.38, 1.38, 1.41, 1.65, 1.42, 1.5, 1.18,
    1.62, 1.62, 1.68, 1.9, 1.84, 1.9, 1.5,
    1.75, 1.75, 1.8, 2.05, 2.08, 2.15, 1.7
  ]
  const nR = 7
  const nC = 9
  const t: number[][] = []
  for (let i = 0; i < nR; i++) {
    t[i] = []
    for (let j = 0; j < nC; j++) {
      t[i][j] = colMajor[j * nR + i]
    }
  }
  return t
})()

function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x))
}

function interp1(x: number, xp: number[], yp: number[]): number {
  if (x <= xp[0]) return yp[0]
  if (x >= xp[xp.length - 1]) return yp[yp.length - 1]
  for (let i = 0; i < xp.length - 1; i++) {
    if (x <= xp[i + 1]) {
      const t = (x - xp[i]) / (xp[i + 1] - xp[i])
      return yp[i] + t * (yp[i + 1] - yp[i])
    }
  }
  return yp[yp.length - 1]
}

function interp2(
  x: number,
  y: number,
  xp: number[],
  yp: number[],
  z: number[][]
): number {
  const xc = clamp(x, xp[0], xp[xp.length - 1])
  const yc = clamp(y, yp[0], yp[yp.length - 1])
  let i0 = 0
  for (let i = 0; i < xp.length - 1; i++) {
    if (xc >= xp[i]) i0 = i
  }
  const i1 = Math.min(i0 + 1, xp.length - 1)
  let j0 = 0
  for (let j = 0; j < yp.length - 1; j++) {
    if (yc >= yp[j]) j0 = j
  }
  const j1 = Math.min(j0 + 1, yp.length - 1)
  const tx = i1 === i0 ? 0 : (xc - xp[i0]) / (xp[i1] - xp[i0])
  const ty = j1 === j0 ? 0 : (yc - yp[j0]) / (yp[j1] - yp[j0])
  const z00 = z[i0][j0]
  const z10 = z[i1][j0]
  const z01 = z[i0][j1]
  const z11 = z[i1][j1]
  return (
    z00 * (1 - tx) * (1 - ty) +
    z10 * tx * (1 - ty) +
    z01 * (1 - tx) * ty +
    z11 * tx * ty
  )
}

export interface AeroSample {
  qbar_Pa: number
  mach: number
  alpha_rad: number
  beta_rad: number
  CA: number
  CN_alpha: number
  CN_beta: number
  CP_m: number
  F_aero: [number, number, number]
  M_aero: [number, number, number]
}

/**
 * Offline evaluation of mdl aero at one body-velocity state (for tests).
 */
export function evaluateAs205Aero(opts: {
  v_b: [number, number, number]
  rho: number
  a_sound: number
  CG_m?: [number, number, number]
}): AeroSample {
  const [u, v, w] = opts.v_b
  const V = Math.hypot(u, v, w)
  const Vs = Math.max(V, 1e-6)
  const a = Math.max(opts.a_sound, 1e-6)
  const mach = V / a
  const qbar = 0.5 * opts.rho * V * V
  const alpha = Math.atan2(w, u === 0 && w === 0 ? 1e-9 : u)
  const beta = Math.asin(clamp(v / Vs, -1, 1))
  // Signed deg into CN (mdl Angle Conversion → Lookup2D; clamp for α<0)
  const aDeg = (alpha * 180) / Math.PI
  const bDeg = (beta * 180) / Math.PI
  const CA = interp1(mach, CA_MACH_BREAKPOINTS, CA_VALUES)
  const CNa = interp2(
    mach,
    aDeg,
    CN_MACH_BREAKPOINTS,
    CN_ANGLE_DEG_BREAKPOINTS,
    CN_TABLE
  )
  const CNb = interp2(
    mach,
    bDeg,
    CN_MACH_BREAKPOINTS,
    CN_ANGLE_DEG_BREAKPOINTS,
    CN_TABLE
  )
  const CP = interp1(mach, CP_MACH_BREAKPOINTS, CP_VALUES_M)
  const S = AERO_S_REF_M2
  const qS = qbar * S
  const F: [number, number, number] = [-CA * qS, -CNb * qS, -CNa * qS]
  const CG = opts.CG_m ?? AERO_CG_SIB_M
  const rx = CP - CG[0]
  const ry = 0 - CG[1]
  const rz = 0 - CG[2]
  // M = r × F
  const M: [number, number, number] = [
    ry * F[2] - rz * F[1],
    rz * F[0] - rx * F[2],
    rx * F[1] - ry * F[0]
  ]
  return {
    qbar_Pa: qbar,
    mach,
    alpha_rad: alpha,
    beta_rad: beta,
    CA,
    CN_alpha: CNa,
    CN_beta: CNb,
    CP_m: CP,
    F_aero: F,
    M_aero: M
  }
}
