/**
 * LVDC Chi → Ψ Transformation (MDL `LVDC Chi to Psi Transformation`).
 *
 * MDL annotations: Eqn 8.3.3 / 8.3.4 / 8.2.2.
 * Inputs (deg): platform/Body→S Euler Θ = [Θ_R, Θ_P, Θ_Y], commanded χ = [χ_R, χ_P, χ_Y].
 * Output (deg): body attitude errors Ψ = [Ψ_R, Ψ_P, Ψ_Y] for FCC.
 *
 * Algebra (1-based indices R=1,P=2,Y=3):
 *   ΔΘ = Θ − χ
 *   half = ½ · rad(Θ + χ)
 *   A3 = sin(half_Y), A2 = sin(half_R)
 *   cY = cos(half_Y), A5 = cos(half_R)
 *   A1 = cY · A5,  A4 = A2 · cY
 *   Ψ_R = ΔΘ_R + A3 · ΔΘ_P
 *   Ψ_P = A1 · ΔΘ_P + A2 · ΔΘ_Y
 *   Ψ_Y = A5 · ΔΘ_Y − A4 · ΔΘ_P
 *
 * Pure pitch (Θ=χ=0 on R/Y): Ψ_P = Θ_P − χ_P, Ψ_R = Ψ_Y = 0.
 *
 * Downstream MDL: Rate Limiter ±12 °/s → Saturate ±15.3° → Attitude Error Filters → TVC.
 */

export type Angle3Deg = readonly [number, number, number]

export interface ChiToPsiResult {
  Psi_R_deg: number
  Psi_P_deg: number
  Psi_Y_deg: number
  /** ΔΘ = Θ − χ (deg) */
  delta_deg: Angle3Deg
}

const DEG2RAD = Math.PI / 180

/** MDL Rate Limiter after Chi→Ψ */
export const CHI_TO_PSI_RATE_LIMIT_DEG_S = 12.0
/** MDL Saturate `+/- 15.3` after rate limit */
export const CHI_TO_PSI_SAT_DEG = 15.3

/**
 * Chi → Ψ (all angles in degrees).
 */
export function chiToPsiDeg(
  theta_deg: Angle3Deg,
  chi_deg: Angle3Deg
): ChiToPsiResult {
  const dR = theta_deg[0] - chi_deg[0]
  const dP = theta_deg[1] - chi_deg[1]
  const dY = theta_deg[2] - chi_deg[2]

  const halfR = 0.5 * (theta_deg[0] + chi_deg[0]) * DEG2RAD
  const halfY = 0.5 * (theta_deg[2] + chi_deg[2]) * DEG2RAD

  const A3 = Math.sin(halfY)
  const A2 = Math.sin(halfR)
  const cY = Math.cos(halfY)
  const A5 = Math.cos(halfR)
  const A1 = cY * A5
  const A4 = A2 * cY

  return {
    Psi_R_deg: dR + A3 * dP,
    Psi_P_deg: A1 * dP + A2 * dY,
    Psi_Y_deg: A5 * dY - A4 * dP,
    delta_deg: [dR, dP, dY]
  }
}

/** Clamp Ψ components to ±CHI_TO_PSI_SAT_DEG (MDL saturate). */
export function saturatePsiDeg(psi: ChiToPsiResult): ChiToPsiResult {
  const sat = (x: number) =>
    x > CHI_TO_PSI_SAT_DEG
      ? CHI_TO_PSI_SAT_DEG
      : x < -CHI_TO_PSI_SAT_DEG
        ? -CHI_TO_PSI_SAT_DEG
        : x
  return {
    Psi_R_deg: sat(psi.Psi_R_deg),
    Psi_P_deg: sat(psi.Psi_P_deg),
    Psi_Y_deg: sat(psi.Psi_Y_deg),
    delta_deg: psi.delta_deg
  }
}
