/**
 * AS-205 / Saturn-IB workspace constants used by MDL Constant and Compare blocks.
 * Sourced from saturn-1B/AS205_presettings.m (and common MATLAB builtins).
 *
 * Values are C-ready literal strings so conditions can embed them directly
 * (or they can be emitted as model #define parameters).
 */

export const WORKSPACE_CONST_NUMBERS: Record<string, number> = {
  // AS205_presettings.m
  i_deg: 28.89597,
  lambda_0_deg: 102.329,
  V_T_mps: 7780.976,
  Xdotdot_VGT_mps2: -9.251,
  R_T_m: 6570774.0,
  Theta_T_deg: 0.0,
  A_z_deg: 82.82,
  phi_L_deg: 28.521963,
  phi_L_prime_deg: 28.360795,
  lambda_L_deg: -80.561141,
  R_L_m: 6373385.0,
  pad_roll_L_deg: 100.0,
  epsilon_2_sec: 15.0,
  epsilon_prime_sec: 3.0,
  BN_1_sec: 14.4,
  T3_FM_sec: 6.08,
  T3_IGM_sec: 30.0,
  DeltaV_b_mps: 7.2381,
  V_GRD_mps: 150.0,
  T_HSL_sec: 5.0,
  // Common Earth / physics
  mu_earth: 3.986004418e14,
  R_earth_m: 6371000.0,
  // MDL Fcn masks sometimes use omega_E_rps as ω/π (see as205InitialPosition)
  omega_E_rps: 2.321e-5
}

/** C expression for a bare identifier (pi → M_PI, BN_1_sec → 14.4, …). */
export function resolveWorkspaceExpr(raw: string): string {
  const t = raw.trim()
  if (!t) return '0'
  if (t === 'pi' || t === 'PI') return 'M_PI'
  if (t === '-pi' || t === '-PI') return '(-M_PI)'
  if (Object.prototype.hasOwnProperty.call(WORKSPACE_CONST_NUMBERS, t)) {
    return String(WORKSPACE_CONST_NUMBERS[t])
  }
  // Unary minus on a known name: -epsilon_2_sec
  if (t.startsWith('-')) {
    const base = t.slice(1).trim()
    if (Object.prototype.hasOwnProperty.call(WORKSPACE_CONST_NUMBERS, base)) {
      return String(-WORKSPACE_CONST_NUMBERS[base])
    }
  }
  // Already numeric
  if (/^-?[0-9]+(\.[0-9]+)?([eE][-+]?[0-9]+)?$/.test(t)) return t
  // Unknown symbol — leave as-is (may become a #define if emitted as parameter)
  return t
}

/** Resolve a Constant Value string to a finite number when possible. */
export function resolveWorkspaceNumber(raw: string): number | undefined {
  const t = raw.trim()
  if (t === 'pi' || t === 'PI') return Math.PI
  if (t === '-pi' || t === '-PI') return -Math.PI
  if (Object.prototype.hasOwnProperty.call(WORKSPACE_CONST_NUMBERS, t)) {
    return WORKSPACE_CONST_NUMBERS[t]
  }
  if (t.startsWith('-')) {
    const base = t.slice(1).trim()
    if (Object.prototype.hasOwnProperty.call(WORKSPACE_CONST_NUMBERS, base)) {
      return -WORKSPACE_CONST_NUMBERS[base]
    }
  }
  const n = Number(t)
  return Number.isFinite(n) ? n : undefined
}

/** Model-parameter records for emit (scalar doubles). */
export function as205ModelParameters(): Array<{
  name: string
  dataType: string
  defaultValue: string
  signalType: string
  value: number
}> {
  return Object.entries(WORKSPACE_CONST_NUMBERS).map(([name, value]) => ({
    name,
    dataType: 'double',
    defaultValue: String(value),
    signalType: 'double',
    value
  }))
}
