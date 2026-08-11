/**
 * Precomputed 1976 COESA / US Standard Atmosphere tables (SI).
 * Geometric altitude h (m) → temperature (K), pressure (Pa), density (kg/m³), speed of sound (m/s).
 *
 * Covers 0–80 km (ascent / lower thermosphere). Values above are clamped by default.
 * Source: US Standard Atmosphere 1976 (approximate layered model sampling).
 */

export interface AtmosphereTable {
  altitude_m: number[]
  temperature_K: number[]
  pressure_Pa: number[]
  density_kgpm3: number[]
  speed_of_sound_mps: number[]
}

/** Default COESA-1976 profile, ~5 km steps (plus key breakpoints) */
export const COESA_1976_TABLE: AtmosphereTable = {
  // Geometric altitudes (m)
  altitude_m: [
    0, 1000, 2000, 3000, 4000, 5000, 6000, 7000, 8000, 9000, 10000,
    11000, 12000, 14000, 16000, 18000, 20000, 22000, 24000, 26000, 28000, 30000,
    32000, 34000, 36000, 38000, 40000, 42000, 44000, 46000, 48000, 50000,
    52000, 54000, 56000, 58000, 60000, 65000, 70000, 75000, 80000
  ],
  // Temperature (K)
  temperature_K: [
    288.15, 281.65, 275.15, 268.66, 262.17, 255.68, 249.19, 242.70, 236.22, 229.73, 223.25,
    216.65, 216.65, 216.65, 216.65, 216.65, 216.65, 218.57, 220.56, 222.54, 224.53, 226.51,
    228.49, 233.74, 239.28, 244.82, 250.35, 255.88, 261.40, 266.93, 270.65, 270.65,
    268.66, 263.52, 258.02, 252.52, 247.02, 233.30, 219.58, 208.40, 198.64
  ],
  // Pressure (Pa)
  pressure_Pa: [
    101325, 89876, 79501, 70121, 61660, 54048, 47217, 41105, 35651, 30800, 26436,
    22632, 19330, 14102, 10353, 7565, 5529, 4047, 2971, 2188, 1616, 1197,
    889.0, 663.4, 498.0, 376.0, 287.1, 220.0, 170.0, 132.0, 102.9, 79.78,
    61.66, 47.29, 36.05, 27.30, 20.55, 10.81, 5.520, 2.710, 1.052
  ],
  // Density (kg/m³)
  density_kgpm3: [
    1.2250, 1.1117, 1.0066, 0.90925, 0.81935, 0.73643, 0.66011, 0.59002, 0.52579, 0.46706, 0.41351,
    0.36392, 0.31108, 0.22700, 0.16647, 0.12165, 0.088910, 0.064512, 0.046939, 0.034256, 0.025085, 0.018410,
    0.013555, 0.009887, 0.007257, 0.005366, 0.003996, 0.002995, 0.002259, 0.001714, 0.001317, 0.001027,
    0.000806, 0.000623, 0.000479, 0.000368, 0.000288, 0.000162, 0.000087, 0.000046, 0.000018
  ],
  // Speed of sound (m/s) ≈ sqrt(gamma*R*T)
  speed_of_sound_mps: [
    340.29, 336.43, 332.53, 328.58, 324.59, 320.55, 316.45, 312.31, 308.11, 303.85, 299.53,
    295.07, 295.07, 295.07, 295.07, 295.07, 295.07, 296.38, 297.72, 299.06, 300.40, 301.72,
    303.04, 306.49, 310.10, 313.67, 317.19, 320.68, 324.12, 327.53, 329.80, 329.80,
    328.58, 325.42, 322.00, 318.55, 315.07, 306.21, 297.07, 289.40, 282.54
  ]
}

/**
 * Linear interpolation helper (JS-side, for tests / validation)
 */
export function interpolate1D(
  x: number,
  xs: number[],
  ys: number[],
  clamp: boolean = true
): number {
  if (xs.length === 0) return 0
  if (x <= xs[0]) {
    if (clamp || xs.length < 2) return ys[0]
    const slope = (ys[1] - ys[0]) / (xs[1] - xs[0])
    return ys[0] + slope * (x - xs[0])
  }
  const n = xs.length
  if (x >= xs[n - 1]) {
    if (clamp || n < 2) return ys[n - 1]
    const slope = (ys[n - 1] - ys[n - 2]) / (xs[n - 1] - xs[n - 2])
    return ys[n - 1] + slope * (x - xs[n - 1])
  }
  for (let i = 0; i < n - 1; i++) {
    if (x >= xs[i] && x <= xs[i + 1]) {
      const t = (x - xs[i]) / (xs[i + 1] - xs[i])
      return ys[i] + t * (ys[i + 1] - ys[i])
    }
  }
  return ys[n - 1]
}

export function lookupAtmosphere(
  altitude_m: number,
  table: AtmosphereTable = COESA_1976_TABLE,
  clamp: boolean = true
): { temperature_K: number; pressure_Pa: number; density_kgpm3: number; speed_of_sound_mps: number } {
  return {
    temperature_K: interpolate1D(altitude_m, table.altitude_m, table.temperature_K, clamp),
    pressure_Pa: interpolate1D(altitude_m, table.altitude_m, table.pressure_Pa, clamp),
    density_kgpm3: interpolate1D(altitude_m, table.altitude_m, table.density_kgpm3, clamp),
    speed_of_sound_mps: interpolate1D(altitude_m, table.altitude_m, table.speed_of_sound_mps, clamp)
  }
}
