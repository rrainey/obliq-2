/**
 * AS-205 S-IB pitch attitude command from TN-AP-67-158 Table 2B.
 *
 * Source: Chrysler TN-AP-67-158, Appendix B, Table 2B
 *   "S-IB Stage Pitch Attitude Command"
 * Printed p.58 (ibiblio PDF ~p.65).
 *
 * ## TN convention (Table 2B / Table 1B note)
 *
 * - χ_c measured **from inertial vertical**, **negative downrange**.
 * - χ_c = 0 at vertical; ≈ −60.83° near S-IB staging / IGM initiation.
 * - Do **not** treat these as elevation-from-horizontal without conversion.
 *
 * ## Plant open-loop program (obliq 9.x)
 *
 * 9.x rate loops use an **elevation-style** schedule for discrete dχ/dt:
 *   elev_deg = 90 + χ_c_deg
 * so elev = 90° vertical, decreasing as the vehicle pitches over
 * (elev ≈ 29.2° at χ_c = −60.83°).
 *
 * This is a **practical mapping for open-loop rate generation only**.
 * Full Apollo platform / IGM frames are out of scope here — do not invent
 * DCM conventions beyond this note without an explicit frame decision.
 *
 * Prefer TN over Simulink when residuals disagree.
 */

export interface ChiSample {
  /** Flight time from first motion (s) — Table 2B "FLIGHT TIME" */
  t_s: number
  /**
   * TN pitch attitude command χ_c (deg), negative downrange from vertical.
   * Minus signs restored on the right-hand column of Table 2B where OCR
   * often drops them; continuity matches Table 3 end pitch ≈ −60.84°.
   */
  chi_c_deg: number
}

/**
 * Digitized Table 2B (every 2 s after hold). Values hand-checked against
 * page scan for continuity and staging endpoint.
 */
export const TN_TABLE_2B_CHI_C: ChiSample[] = [
  { t_s: 0, chi_c_deg: 0 },
  { t_s: 10, chi_c_deg: 0 },
  { t_s: 12, chi_c_deg: -0.2599 },
  { t_s: 14, chi_c_deg: -0.4015 },
  { t_s: 16, chi_c_deg: -0.6125 },
  { t_s: 18, chi_c_deg: -0.8931 },
  { t_s: 20, chi_c_deg: -1.2412 },
  { t_s: 22, chi_c_deg: -1.6565 },
  { t_s: 24, chi_c_deg: -2.1379 },
  { t_s: 26, chi_c_deg: -2.6847 },
  { t_s: 28, chi_c_deg: -3.2959 },
  { t_s: 30, chi_c_deg: -3.9707 },
  { t_s: 32, chi_c_deg: -4.7081 },
  { t_s: 34, chi_c_deg: -5.5073 },
  { t_s: 36, chi_c_deg: -6.3675 },
  { t_s: 38, chi_c_deg: -7.2876 },
  { t_s: 40, chi_c_deg: -8.2669 },
  { t_s: 42, chi_c_deg: -9.3044 },
  { t_s: 44, chi_c_deg: -10.3993 },
  { t_s: 46, chi_c_deg: -11.5507 },
  { t_s: 48, chi_c_deg: -12.7023 },
  { t_s: 50, chi_c_deg: -13.8758 },
  { t_s: 52, chi_c_deg: -15.0728 },
  { t_s: 54, chi_c_deg: -16.2906 },
  { t_s: 56, chi_c_deg: -17.5264 },
  { t_s: 58, chi_c_deg: -18.7774 },
  { t_s: 60, chi_c_deg: -20.0409 },
  { t_s: 62, chi_c_deg: -21.314 },
  { t_s: 64, chi_c_deg: -22.5939 },
  { t_s: 66, chi_c_deg: -23.878 },
  { t_s: 68, chi_c_deg: -25.1633 },
  { t_s: 70, chi_c_deg: -26.4472 },
  { t_s: 72, chi_c_deg: -27.7268 },
  { t_s: 74, chi_c_deg: -28.9994 },
  { t_s: 76, chi_c_deg: -30.2622 },
  { t_s: 78, chi_c_deg: -31.5123 },
  { t_s: 80, chi_c_deg: -32.7471 },
  { t_s: 82, chi_c_deg: -33.9637 },
  { t_s: 84, chi_c_deg: -35.1594 },
  { t_s: 86, chi_c_deg: -36.3314 },
  { t_s: 88, chi_c_deg: -37.4768 },
  { t_s: 90, chi_c_deg: -38.593 },
  { t_s: 92, chi_c_deg: -39.6771 },
  { t_s: 94, chi_c_deg: -40.698 },
  { t_s: 96, chi_c_deg: -41.6961 },
  { t_s: 98, chi_c_deg: -42.6709 },
  { t_s: 100, chi_c_deg: -43.6252 },
  { t_s: 102, chi_c_deg: -44.5618 },
  { t_s: 104, chi_c_deg: -45.4834 },
  { t_s: 106, chi_c_deg: -46.3927 },
  { t_s: 108, chi_c_deg: -47.2925 },
  { t_s: 110, chi_c_deg: -48.1855 },
  { t_s: 112, chi_c_deg: -49.0744 },
  { t_s: 114, chi_c_deg: -49.962 },
  { t_s: 116, chi_c_deg: -50.8511 },
  { t_s: 118, chi_c_deg: -51.7443 },
  { t_s: 120, chi_c_deg: -52.6445 },
  { t_s: 122, chi_c_deg: -53.5543 },
  { t_s: 124, chi_c_deg: -54.4766 },
  { t_s: 126, chi_c_deg: -55.414 },
  { t_s: 128, chi_c_deg: -56.3692 },
  { t_s: 130, chi_c_deg: -57.3451 },
  { t_s: 132, chi_c_deg: -58.3444 },
  { t_s: 134, chi_c_deg: -59.3698 },
  { t_s: 136, chi_c_deg: -60.4241 },
  { t_s: 138, chi_c_deg: -60.8349 },
  // Hold post–IGM initiation for residual window (Table freezes χ_c)
  { t_s: 150, chi_c_deg: -60.8349 },
  { t_s: 180, chi_c_deg: -60.8349 }
]

/** elev_deg = 90 + χ_c (90° vertical, decreasing as χ_c goes more negative). */
export function chiCToPlantElevDeg(chi_c_deg: number): number {
  return 90 + chi_c_deg
}

/** LUT breakpoints for lookup_1d: flight time (s). */
export function table2bChiTimeBreakpoints(): number[] {
  return TN_TABLE_2B_CHI_C.map(s => s.t_s)
}

/** LUT outputs for plant elev program (deg). */
export function table2bPlantElevDeg(): number[] {
  return TN_TABLE_2B_CHI_C.map(s => chiCToPlantElevDeg(s.chi_c_deg))
}

/** LUT outputs in raw TN χ_c (deg) if a model wants native TN units. */
export function table2bChiCDeg(): number[] {
  return TN_TABLE_2B_CHI_C.map(s => s.chi_c_deg)
}

/** CSV text for as205-reference (both conventions). */
export function table2bToCsv(): string {
  const lines = [
    '# TN-AP-67-158 Table 2B — S-IB Stage Pitch Attitude Command',
    '# chi_c_deg: TN convention (0 = vertical, negative downrange)',
    '# elev_deg: plant open-loop program = 90 + chi_c_deg (90 = vertical)',
    '# source: TN-AP-67-158 printed p.58; prefer TN over Simulink',
    't_s,chi_c_deg,elev_deg,source_note'
  ]
  for (const s of TN_TABLE_2B_CHI_C) {
    const elev = chiCToPlantElevDeg(s.chi_c_deg)
    lines.push(
      `${s.t_s},${s.chi_c_deg},${elev.toFixed(4)},TN-AP-67-158 Table2B p.58`
    )
  }
  return lines.join('\n') + '\n'
}
