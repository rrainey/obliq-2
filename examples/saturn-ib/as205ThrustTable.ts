/**
 * AS-205 S-IB total thrust vs flight time from TN-AP-67-158 Table 5.
 *
 * Source: Chrysler TN-AP-67-158, Table 5 "S-IB Stage Flight Data"
 * column THRUST (TOTAL) (N). Prefer TN over Simulink.
 *
 * Digitized for open-loop plant LUTs (order-of-magnitude fidelity to Table 5;
 * not every printed row). Pair with mdot from {@link tnSibMdotScale}.
 */

export interface ThrustSample {
  /** Flight time from first motion (s) */
  t_s: number
  /** Total vehicle thrust (N) */
  thrust_N: number
}

/**
 * Table 5 TOTAL thrust (N). End-of-boost values capture IECO/OECO tail-off.
 * t=0 is first motion (liftoff edge in 9.x maps burn timer to this).
 */
export const TN_TABLE_5_THRUST: ThrustSample[] = [
  { t_s: 0, thrust_N: 0 },
  { t_s: 0.2, thrust_N: 5.5e6 },
  { t_s: 0.5, thrust_N: 6.5e6 },
  { t_s: 2, thrust_N: 6.9e6 },
  { t_s: 5, thrust_N: 6.985e6 },
  { t_s: 10, thrust_N: 7.015e6 },
  { t_s: 15, thrust_N: 7.08e6 },
  { t_s: 20, thrust_N: 7.14e6 },
  { t_s: 25, thrust_N: 7.19e6 },
  { t_s: 30, thrust_N: 7.245e6 },
  { t_s: 35, thrust_N: 7.303e6 },
  { t_s: 40, thrust_N: 7.368e6 },
  { t_s: 45, thrust_N: 7.434e6 },
  { t_s: 50, thrust_N: 7.502e6 },
  { t_s: 55, thrust_N: 7.571e6 },
  { t_s: 60, thrust_N: 7.638e6 },
  { t_s: 65, thrust_N: 7.697e6 },
  { t_s: 70, thrust_N: 7.761e6 },
  { t_s: 75, thrust_N: 7.823e6 },
  { t_s: 78, thrust_N: 7.858e6 },
  { t_s: 80, thrust_N: 7.877e6 },
  { t_s: 85, thrust_N: 7.919e6 },
  { t_s: 90, thrust_N: 7.95e6 },
  { t_s: 95, thrust_N: 7.97e6 },
  { t_s: 100, thrust_N: 7.98e6 },
  { t_s: 105, thrust_N: 7.981e6 },
  { t_s: 110, thrust_N: 7.978e6 },
  { t_s: 115, thrust_N: 7.968e6 },
  { t_s: 120, thrust_N: 7.951e6 },
  { t_s: 125, thrust_N: 7.931e6 },
  { t_s: 130, thrust_N: 7.907e6 },
  { t_s: 135, thrust_N: 7.876e6 },
  { t_s: 137, thrust_N: 7.861e6 },
  { t_s: 140.9, thrust_N: 7.837e6 },
  { t_s: 142.88, thrust_N: 7.804e6 }, // IECO region
  { t_s: 145.88, thrust_N: 3.831e6 }, // OECO
  { t_s: 147.18, thrust_N: 3.2e5 },
  { t_s: 147.26, thrust_N: 1.2e4 },
  { t_s: 150, thrust_N: 0 },
  { t_s: 180, thrust_N: 0 }
]

/**
 * mdot ≈ T * scale, with scale chosen so Table 5 mass drop
 * (586593 → 183924 kg over ~147 s ≈ 2739 kg/s average) matches
 * typical mid-boost thrust (~7.5 MN):
 *   Isp_eff * g0 ≈ T / mdot ≈ 7.5e6 / 2739 ≈ 2740 m/s
 * so scale = 1/2740 rather than 1/(260*g0)≈1/2550 (which over-burned).
 */
export const TN_SIB_MDOT_SCALE = 1 / 2740

export function table5ThrustTimeBreakpoints(): number[] {
  return TN_TABLE_5_THRUST.map(s => s.t_s)
}

export function table5ThrustN(): number[] {
  return TN_TABLE_5_THRUST.map(s => s.thrust_N)
}
