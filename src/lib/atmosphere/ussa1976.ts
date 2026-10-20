/**
 * U.S. Standard Atmosphere 1976 (identical to the ICAO/ISO standard
 * atmosphere below 32 km), from its defining formulae rather than a table.
 *
 * Valid for geometric altitudes from -5 km to 86 km. Below 86 km the model is
 * hydrostatic with a constant mean molecular weight, defined by seven layers
 * of linear molecular-scale temperature in geopotential altitude:
 *
 *   H = r0 z / (r0 + z)                              geopotential altitude
 *   T = Tb + Lb (H - Hb)
 *   P = Pb (Tb / T)^(g0 M0 / (R* Lb))                Lb != 0
 *   P = Pb exp(-g0 M0 (H - Hb) / (R* Tb))            Lb == 0
 *   rho = P M0 / (R* T),   a = sqrt(gamma R* T / M0)
 *
 * T is the molecular-scale temperature, which equals the kinetic temperature
 * below 80 km (and differs by less than 0.03% up to 86 km).
 *
 * Reference: U.S. Standard Atmosphere, 1976, NOAA-S/T 76-1562, Tables 1 and 4.
 */

export const USSA1976 = {
  /** m/s², standard gravity */
  g0: 9.80665,
  /** J/(mol·K), gas constant as used by the 1976 standard */
  Rstar: 8.31432,
  /** kg/mol, mean molecular weight of air below 86 km */
  M0: 0.0289644,
  /** m, effective Earth radius for geopotential altitude */
  r0: 6356766,
  gamma: 1.4,
  /** Geometric altitude range of the formulae (m) */
  zMin: -5000,
  zMax: 86000,
  /** Layer bases: geopotential altitude Hb (m'), temperature Tb (K), lapse rate Lb (K/m') */
  layers: [
    { Hb: 0, Tb: 288.15, Lb: -0.0065 },
    { Hb: 11000, Tb: 216.65, Lb: 0 },
    { Hb: 20000, Tb: 216.65, Lb: 0.001 },
    { Hb: 32000, Tb: 228.65, Lb: 0.0028 },
    { Hb: 47000, Tb: 270.65, Lb: 0 },
    { Hb: 51000, Tb: 270.65, Lb: -0.0028 },
    { Hb: 71000, Tb: 214.65, Lb: -0.002 },
  ],
  /** Pa, sea-level pressure */
  P0: 101325,
} as const

/** Exponent g0 M0 / R* (K/m') used by the pressure formulae. */
const GMR = (USSA1976.g0 * USSA1976.M0) / USSA1976.Rstar

/** Base pressure of each layer, derived from P0 by the layer formulae. */
export const LAYER_BASE_PRESSURES: readonly number[] = (() => {
  const p: number[] = [USSA1976.P0]
  const L = USSA1976.layers
  for (let i = 0; i < L.length - 1; i++) {
    const { Hb, Tb, Lb } = L[i]!
    const dH = L[i + 1]!.Hb - Hb
    const T = Tb + Lb * dH
    p.push(Lb === 0 ? p[i]! * Math.exp((-GMR * dH) / Tb) : p[i]! * Math.pow(Tb / T, GMR / Lb))
  }
  return p
})()

export interface AtmosphereState {
  temperature_K: number
  pressure_Pa: number
  density_kgpm3: number
  speed_of_sound_mps: number
}

export const geopotentialAltitude = (z: number) => (USSA1976.r0 * z) / (USSA1976.r0 + z)

/**
 * Atmosphere at geometric altitude z (m). Outside [-5 km, 86 km] the altitude
 * is clamped, or with `extrapolate` the end layers' formulae are continued.
 */
export function ussa1976(z: number, opts: { extrapolate?: boolean } = {}): AtmosphereState {
  const zz = opts.extrapolate ? z : Math.min(USSA1976.zMax, Math.max(USSA1976.zMin, z))
  const H = geopotentialAltitude(zz)
  const L = USSA1976.layers
  let b = 0
  while (b < L.length - 1 && H >= L[b + 1]!.Hb) b++
  const { Hb, Tb, Lb } = L[b]!
  const dH = H - Hb
  const T = Tb + Lb * dH
  const P = Lb === 0
    ? LAYER_BASE_PRESSURES[b]! * Math.exp((-GMR * dH) / Tb)
    : LAYER_BASE_PRESSURES[b]! * Math.pow(Tb / T, GMR / Lb)
  return {
    temperature_K: T,
    pressure_Pa: P,
    density_kgpm3: (P * USSA1976.M0) / (USSA1976.Rstar * T),
    speed_of_sound_mps: Math.sqrt((USSA1976.gamma * USSA1976.Rstar * T) / USSA1976.M0),
  }
}

/**
 * Geometric altitude (m) at which the standard atmosphere has pressure p (Pa):
 * the inverse used by a barometric altimeter. Valid below 86 km.
 */
export function ussa1976PressureAltitude(p: number): number {
  const L = USSA1976.layers
  let b = 0
  while (b < L.length - 1 && p <= LAYER_BASE_PRESSURES[b + 1]!) b++
  const { Hb, Tb, Lb } = L[b]!
  const pb = LAYER_BASE_PRESSURES[b]!
  const H = Lb === 0
    ? Hb - (Tb / GMR) * Math.log(p / pb)
    : Hb + (Tb / Lb) * (Math.pow(p / pb, -Lb / GMR) - 1)
  return (USSA1976.r0 * H) / (USSA1976.r0 - H)
}
