/**
 * World Magnetic Model evaluation (spherical-harmonic main field with linear
 * secular variation), following the WMM technical report's equations.
 * Used by the reference-model builders to compute the Earth field at a
 * site; checked against NOAA's WMM2025 test values.
 */

import * as fs from 'fs'
import * as path from 'path'

export interface WmmCoefficients {
  epoch: number
  name: string
  /** g[n][m], h[n][m] (nT) and their rates (nT/yr) */
  g: number[][]
  h: number[][]
  gDot: number[][]
  hDot: number[][]
  nMax: number
}

export function parseCof(text: string): WmmCoefficients {
  const lines = text.split(/\r?\n/).filter(l => l.trim() !== '')
  const [epochStr, name] = lines[0]!.trim().split(/\s+/)
  const rows = lines.slice(1).filter(l => !/^9{10,}/.test(l.trim())).map(l => l.trim().split(/\s+/).map(Number))
  const nMax = Math.max(...rows.map(r => r[0]!))
  const grid = () => Array.from({ length: nMax + 1 }, () => new Array<number>(nMax + 1).fill(0))
  const c: WmmCoefficients = { epoch: Number(epochStr), name: name!, g: grid(), h: grid(), gDot: grid(), hDot: grid(), nMax }
  for (const [n, m, g, h, gd, hd] of rows as number[][]) {
    c.g[n!]![m!] = g!
    c.h[n!]![m!] = h!
    c.gDot[n!]![m!] = gd!
    c.hDot[n!]![m!] = hd!
  }
  return c
}

export function loadWmm2025(): WmmCoefficients {
  return parseCof(fs.readFileSync(path.join(__dirname, '..', 'data', 'WMM2025.COF'), 'utf8'))
}

export interface MagneticField {
  /** North, East, Down components (nT) in the local geodetic frame */
  x: number
  y: number
  z: number
  declinationDeg: number
  inclinationDeg: number
  totalNt: number
}

const WGS84_A = 6378137.0
const WGS84_F = 1 / 298.257223563
const WGS84_E2 = WGS84_F * (2 - WGS84_F)
/** Geomagnetic reference radius (m) */
const RE = 6371200.0

/**
 * Field at geodetic latitude/longitude (deg), height above the WGS84
 * ellipsoid (m) and decimal year.
 */
export function wmmField(c: WmmCoefficients, latDeg: number, lonDeg: number, heightM: number, year: number): MagneticField {
  const dt = year - c.epoch
  const phi = (latDeg * Math.PI) / 180
  const lam = (lonDeg * Math.PI) / 180

  // Geodetic to geocentric spherical
  const sinPhi = Math.sin(phi), cosPhi = Math.cos(phi)
  const rc = WGS84_A / Math.sqrt(1 - WGS84_E2 * sinPhi * sinPhi)
  const p = (rc + heightM) * cosPhi
  const zc = (rc * (1 - WGS84_E2) + heightM) * sinPhi
  const r = Math.hypot(p, zc)
  const phiC = Math.asin(zc / r)

  // Colatitude for the Legendre recursion
  const theta = Math.PI / 2 - phiC
  const ct = Math.cos(theta), st = Math.sin(theta)
  const N = c.nMax

  // Gauss-normalized associated Legendre functions and d/dtheta, then
  // Schmidt semi-normalization factors (as in NOAA's geomag reference code)
  const P = Array.from({ length: N + 1 }, () => new Array<number>(N + 1).fill(0))
  const dP = Array.from({ length: N + 1 }, () => new Array<number>(N + 1).fill(0))
  const S = Array.from({ length: N + 1 }, () => new Array<number>(N + 1).fill(0))
  P[0]![0] = 1
  S[0]![0] = 1
  for (let n = 1; n <= N; n++) {
    S[n]![0] = (S[n - 1]![0]! * (2 * n - 1)) / n
    for (let m = 1; m <= n; m++) {
      S[n]![m] = S[n]![m - 1]! * Math.sqrt(((n - m + 1) * (m === 1 ? 2 : 1)) / (n + m))
    }
    for (let m = 0; m <= n; m++) {
      if (m === n) {
        P[n]![m] = st * P[n - 1]![m - 1]!
        dP[n]![m] = st * dP[n - 1]![m - 1]! + ct * P[n - 1]![m - 1]!
      } else if (n === 1) {
        P[n]![m] = ct * P[n - 1]![m]!
        dP[n]![m] = ct * dP[n - 1]![m]! - st * P[n - 1]![m]!
      } else {
        const k = ((n - 1) * (n - 1) - m * m) / ((2 * n - 1) * (2 * n - 3))
        P[n]![m] = ct * P[n - 1]![m]! - k * P[n - 2]![m]!
        dP[n]![m] = ct * dP[n - 1]![m]! - st * P[n - 1]![m]! - k * dP[n - 2]![m]!
      }
    }
  }

  let br = 0, bt = 0, bp = 0
  for (let n = 1; n <= N; n++) {
    const ar = Math.pow(RE / r, n + 2)
    for (let m = 0; m <= n; m++) {
      const g = (c.g[n]![m]! + dt * c.gDot[n]![m]!) * S[n]![m]!
      const h = (c.h[n]![m]! + dt * c.hDot[n]![m]!) * S[n]![m]!
      const cm = Math.cos(m * lam), sm = Math.sin(m * lam)
      br += (n + 1) * ar * (g * cm + h * sm) * P[n]![m]!
      bt -= ar * (g * cm + h * sm) * dP[n]![m]!
      bp += m * ar * (g * sm - h * cm) * P[n]![m]!
    }
  }
  bp /= st

  // Spherical (north, east, down) then rotate to geodetic
  const xs = -bt, ys = bp, zs = -br
  const d = phiC - phi
  const x = xs * Math.cos(d) - zs * Math.sin(d)
  const z = xs * Math.sin(d) + zs * Math.cos(d)
  const y = ys
  const hH = Math.hypot(x, y)
  return {
    x, y, z,
    declinationDeg: (Math.atan2(y, x) * 180) / Math.PI,
    inclinationDeg: (Math.atan2(z, hH) * 180) / Math.PI,
    totalNt: Math.hypot(hH, z),
  }
}
