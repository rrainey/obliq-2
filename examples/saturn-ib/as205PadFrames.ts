/**
 * AS-205 pad geometry: S-frame (plumbline) at GRR / liftoff.
 *
 * Sources:
 * - saturn-1B/AS205_presettings.m (LC-34 site, azimuth, R_L)
 * - satinstunitibm §2: S-system X_S = local up (anti-gravity), Z_S = downrange
 * - TN “Space frame” ≈ EDD S (working assumption; space-fixed at GRR ⇒ inertial).
 * - Classical ECI = E-system (Simulink world); ECI→S is fixed after T_GRR/epoch.
 * - Validate with TN h, mass, q̄ until S-component outputs match Simulink ECI→S.
 *
 * 9.x plant integrates r,v in an S-like triad, with B‖S at t=0 (identity quat).
 */

/** AS-205 / LC-34 constants from AS205_presettings.m */
export const AS205_PAD = {
  /** Launch azimuth, deg east of north */
  A_z_deg: 82.82,
  /** Geodetic latitude (deg) */
  phi_L_deg: 28.521963,
  /** Geocentric latitude (deg) */
  phi_L_prime_deg: 28.360795,
  /** Longitude east positive (deg) */
  lambda_L_deg: -80.561141,
  /** Geocentric radius to pad / platform (m) */
  R_L_m: 6373385.0,
  /**
   * Vehicle roll at launch (Position I), deg east of true north.
   * Not applied to q0 in v1 (B‖S); reserved for fin/IU alignment.
   */
  pad_roll_L_deg: 100.0
} as const

/** Mean Earth rotation rate (rad/s), IAU-ish */
export const OMEGA_EARTH = 7.292115e-5

export type Vec3 = [number, number, number]

export interface PadStateS {
  /** Position in S (m): ≈ [R_L, 0, 0] */
  r0_S: Vec3
  /** Inertial (space-fixed) velocity in S (m/s) — Earth rate at pad */
  v0_S: Vec3
  /** |v0_S| (m/s); TN Table 5 first-motion space-fixed V ≈ 409 m/s */
  v0_mag: number
  /** Unit axes of S expressed in ECEF (for diagnostics) */
  X_S_ecef: Vec3
  Y_S_ecef: Vec3
  Z_S_ecef: Vec3
  notes: string[]
}

function deg2rad(d: number): number {
  return (d * Math.PI) / 180
}

function norm(v: Vec3): number {
  return Math.hypot(v[0], v[1], v[2])
}

function normalize(v: Vec3): Vec3 {
  const n = norm(v)
  if (n < 1e-15) return [0, 0, 0]
  return [v[0] / n, v[1] / n, v[2] / n]
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0]
  ]
}

function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
}

function scale(v: Vec3, s: number): Vec3 {
  return [v[0] * s, v[1] * s, v[2] * s]
}

/**
 * Build S-frame pad state for plant IC.
 *
 * Intermediate ECEF (ITRS-like): X through equator/Greenwich, Z north.
 * S axes:
 *   X_S = local up (geodetic)
 *   Z_S = downrange (azimuth east of north)
 *   Y_S = Z_S × X_S  (right-handed)
 *
 * At t=0 in plant coordinates we store vectors **already in S**, so
 * r0 = [R_L, 0, 0], v0 = components of Earth-rate velocity in S.
 */
export function buildAs205PadStateS(
  opts: Partial<typeof AS205_PAD> = {}
): PadStateS {
  const p = { ...AS205_PAD, ...opts }
  const notes: string[] = [
    'Integration frame: S (plumbline space-fixed at GRR), not demo radial triad',
    'TN inertial listings assumed E; S↔E is constant after GRR (epoch not applied here)',
    'B‖S at t=0 (identity quaternion); pad_roll not applied to q0 in v1'
  ]

  const phi = deg2rad(p.phi_L_deg) // geodetic for local up
  const phiC = deg2rad(p.phi_L_prime_deg) // geocentric for |r| direction
  const lam = deg2rad(p.lambda_L_deg)
  const az = deg2rad(p.A_z_deg)
  const R = p.R_L_m

  // Geocentric position (ECEF)
  const r_ecef: Vec3 = [
    R * Math.cos(phiC) * Math.cos(lam),
    R * Math.cos(phiC) * Math.sin(lam),
    R * Math.sin(phiC)
  ]

  // Local ENU (geodetic) unit vectors in ECEF
  const east: Vec3 = [-Math.sin(lam), Math.cos(lam), 0]
  const north: Vec3 = [
    -Math.sin(phi) * Math.cos(lam),
    -Math.sin(phi) * Math.sin(lam),
    Math.cos(phi)
  ]
  const up: Vec3 = [
    Math.cos(phi) * Math.cos(lam),
    Math.cos(phi) * Math.sin(lam),
    Math.sin(phi)
  ]

  // S-frame in ECEF
  const X_S = normalize(up) // plumbline ≈ geodetic up
  const Z_S = normalize([
    Math.sin(az) * east[0] + Math.cos(az) * north[0],
    Math.sin(az) * east[1] + Math.cos(az) * north[1],
    Math.sin(az) * east[2] + Math.cos(az) * north[2]
  ])
  const Y_S = normalize(cross(Z_S, X_S)) // RH: Y = Z × X

  // Earth angular velocity in ECEF (Z north)
  const w_ecef: Vec3 = [0, 0, OMEGA_EARTH]
  const v_ecef = cross(w_ecef, r_ecef)

  // Express r and v in S (at pad, r should be ≈ R * X_S; use exact projection)
  const r0_S: Vec3 = [dot(r_ecef, X_S), dot(r_ecef, Y_S), dot(r_ecef, Z_S)]
  // Prefer exact pad placement on +X_S for clean altitude IC
  const r0_plant: Vec3 = [R, 0, 0]
  const v0_S: Vec3 = [dot(v_ecef, X_S), dot(v_ecef, Y_S), dot(v_ecef, Z_S)]

  notes.push(
    `|r| pad = ${R} m; |v_earth| = ${norm(v_ecef).toFixed(2)} m/s (TN V≈409 at first motion)`
  )
  notes.push(
    `v0_S ≈ [${v0_S.map(x => x.toFixed(2)).join(', ')}] m/s (body = S at t=0)`
  )

  // Sanity: X,Y,Z orthonormal RH
  const det =
    dot(X_S, cross(Y_S, Z_S)) // should be +1
  if (Math.abs(det - 1) > 1e-6) {
    notes.push(`WARNING: S basis det=${det} (expected ≈1)`)
  }

  void r0_S // diagnostic only; plant uses r0_plant

  return {
    r0_S: r0_plant,
    v0_S,
    v0_mag: norm(v0_S),
    X_S_ecef: X_S,
    Y_S_ecef: Y_S,
    Z_S_ecef: Z_S,
    notes
  }
}

/** Default pad state for AS-205 LC-34. */
export function as205DefaultPadStateS(): PadStateS {
  return buildAs205PadStateS()
}
