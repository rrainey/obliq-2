/**
 * S-IVB J-2 thrust — from RTW `<S304>/Thrust vs. Time` (Saturn_IB_Stack_data.c).
 *
 * Lookup argument in Simulink: Bias = 147.26 + time_since_J2_engine_start.
 * Mass IC at StageSep: m_separation_kg = 137883.
 * Propellant mdot: −243.687 × (T / 1.010719e6)  (UnaryMinus under S-IVB mass).
 *
 * NOTE: Full Simulink uses a separate S-IVB 6DoF with IcNeedsLoading handoff.
 * Obliq interim: single EOM + host mass poke at StageSep (see SaturnIBPlantObliq.c).
 */

/** RTW `<S264>/m_separation_kg` — S-IVB+payload mass at StageSep IC */
export const SIVB_M_SEPARATION_KG = 137883.0

/**
 * RTW `<S322>/Compare` threshold — Stop Simulation when S-IVB mass+ullage
 * stack &lt; 30074 kg. Kept as J-2 **safety** backstop; primary cutoff is
 * IGM-timed bCutoff (`as205Igm.ts`).
 */
export const SIVB_MASS_STOP_KG = 30074.0

/** Bias added to time-since-J2-start for Thrust vs. Time X (RTW Constant+Bias) */
export const J2_THRUST_TIME_BIAS_S = 147.26

/**
 * Thrust vs. Time X breakpoints (s) — mission-time style after Bias.
 * First two samples are 0 thrust (engine start pad).
 */
export const J2_THRUST_TIME_S: number[] = [
  147.26, 148.58, 151.5, 151.98, 155.0, 159.18, 160.0, 180.0, 186.88, 190.0,
  200.0, 220.0, 240.0, 260.0, 280.0, 300.0, 320.0, 340.0, 360.0, 380.0, 400.0,
  420.0, 440.0, 460.0, 477.0, 480.0, 500.0, 520.0, 540.0, 560.0, 580.0, 592.91
]

/** Thrust vs. Time Y (N) — RTW ThrustvsTime_YData */
export const J2_THRUST_N: number[] = [
  0.0, 0.0, 752069.0, 870634.0, 885366.0, 1.010719e6, 1.010474e6, 1.009306e6,
  1.009198e6, 1.009388e6, 1.010028e6, 1.007947e6, 1.008703e6, 1.009688e6,
  1.006171e6, 1.008973e6, 1.009424e6, 1.008389e6, 1.008991e6, 1.007469e6,
  1.006695e6, 1.009101e6, 1.008642e6, 1.005132e6, 958467.0, 940828.0, 873262.0,
  859576.0, 847063.0, 847126.0, 852022.0, 850281.0
]

/** Nominal thrust used in RTW mdot scale (N) */
export const J2_MDOT_REF_THRUST_N = 1.010719e6

/** |mdot| at nominal thrust (kg/s) — RTW scale 243.687 */
export const J2_MDOT_AT_REF_KGPS = 243.687

/** mdot (kg/s, ≥0) from thrust (N) */
export function j2MdotFromThrustN(thrust_N: number): number {
  return J2_MDOT_AT_REF_KGPS * (thrust_N / J2_MDOT_REF_THRUST_N)
}
