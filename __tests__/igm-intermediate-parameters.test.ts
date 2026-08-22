import {
  igmIntermediateParameters,
  IGM_TAU_PRESETS,
  IGM_V_EX1_MPS,
  IGM_V_EX3_MPS,
  chiYDegFromXbS,
  elevCmdDegFromChiY
} from '../examples/saturn-ib/igmIntermediateParameters'
import {
  igmS419Combos,
  igmChiYZFromUnitVector,
  igmChiPipeline,
  igmApRotateState,
  igmS420Product15,
  igmChiAlphaBeta,
  igmPhiIT,
  igmDeltaV,
  igmGain1_h,
  igmGain5_k,
  rotPhiY,
  IGM_V_T_MPS,
  IGM_AP_DCM,
  IGM_AP_DCM_T,
  IGM_PHI_IT_SCALE,
  mat3Vec
} from '../examples/saturn-ib/igmChiAssembly'

describe('igmIntermediateParameters (MDL S388 / EDD 4.4.20–28)', () => {
  test('finite outputs for representative τ/T', () => {
    const o = igmIntermediateParameters(IGM_TAU_PRESETS)
    for (const v of Object.values(o)) {
      expect(Number.isFinite(v)).toBe(true)
    }
  })

  test('L1 = V_ex1 * log(τ/(τ−T))', () => {
    const { tau_1_sec: tau, T_1_i_sec: T } = IGM_TAU_PRESETS
    const o = igmIntermediateParameters(IGM_TAU_PRESETS)
    expect(o.L1).toBeCloseTo(IGM_V_EX1_MPS * Math.log(tau / (tau - T)), 6)
  })

  test('J1 / S1 identities', () => {
    const { tau_1_sec: tau, T_1_i_sec: T } = IGM_TAU_PRESETS
    const o = igmIntermediateParameters(IGM_TAU_PRESETS)
    expect(o.J1).toBeCloseTo(o.L1 * tau - T * IGM_V_EX1_MPS, 6)
    expect(o.S1).toBeCloseTo(o.L1 * T - o.J1, 6)
  })

  test('singular when T≥τ', () => {
    const o = igmIntermediateParameters({
      ...IGM_TAU_PRESETS,
      T_1_i_sec: 286.9
    })
    expect(o.L1).toBe(Number.NEGATIVE_INFINITY)
  })

  test('interim Chi_Y from Xb_S + elev map', () => {
    // Vertical +X_S ⇒ atan2(0,1)=0 ⇒ Chi_Y=0 ⇒ elev=90
    expect(chiYDegFromXbS([1, 0, 0])).toBeCloseTo(0, 6)
    expect(elevCmdDegFromChiY(0)).toBe(90)
    // Tip downrange +Z_S component → negative Chi_Y
    expect(chiYDegFromXbS([0.5, 0, 0.5])).toBeLessThan(0)
  })

  test('igmPhiIT matches published formula and IGM_PHI_IT_SCALE', () => {
    const inter = igmIntermediateParameters(IGM_TAU_PRESETS)
    const T1 = IGM_TAU_PRESETS.T_1_i_sec
    const tau1 = IGM_TAU_PRESETS.tau_1_sec
    const tau3 = IGM_TAU_PRESETS.tau_3_sec
    const T3 = IGM_TAU_PRESETS.T_3_i_sec
    const V_mag = 3500
    const T_star = T1 + T3
    const L_prime_y = inter.L1 + inter.L_prime_3
    const term1 = V_mag * T_star - inter.J_prime_3 + L_prime_y * T3
    const massTerm = (tau1 - T1) * inter.L1 + (tau3 - T3) * inter.L_prime_3
    const term2 =
      massTerm * (1.8 / IGM_V_EX3_MPS) * (L_prime_y + V_mag - IGM_V_T_MPS)
    const expectPhi = (term1 - term2 + inter.S1) * IGM_PHI_IT_SCALE
    expect(igmPhiIT(inter, T1, tau1, tau3, T3, V_mag)).toBeCloseTo(expectPhi, 12)
    expect(Math.abs(expectPhi)).toBeGreaterThan(0.01)
  })

  test('S419 live Gain1_h / T3_eff differs from seed and Add11 identity', () => {
    const inter = igmIntermediateParameters(IGM_TAU_PRESETS)
    const T1 = IGM_TAU_PRESETS.T_1_i_sec
    const tau3 = IGM_TAU_PRESETS.tau_3_sec
    const T3 = IGM_TAU_PRESETS.T_3_i_sec
    const Gain1_h = 4000
    const T3_eff = T3 + igmGain5_k(tau3, T3) * Gain1_h
    const live = igmS419Combos(
      inter,
      T1,
      tau3,
      T3,
      IGM_V_EX3_MPS,
      Gain1_h,
      T3_eff
    )
    const seed = igmS419Combos(inter, T1, tau3, T3, IGM_V_EX3_MPS, 0, T3)
    expect(live.L_y).toBeCloseTo(inter.L1 + inter.L_prime_3 + Gain1_h, 9)
    expect(live.L_y).not.toBeCloseTo(seed.L_y, 3)
    expect(live.J_3).toBeCloseTo(T3_eff * Gain1_h + inter.J_prime_3, 6)
  })

  test('plant-equivalent Wave A.1 algebra: ΔV uses G_S (not A_m)', () => {
    const T1 = 200
    const T3 = 116
    const tau1 = 286.9
    const tau3 = 262.52
    const XS: [number, number, number] = [6.5e6, 1e4, 2e5]
    const VS: [number, number, number] = [3000, 20, 1500]
    // Point-mass G_S = −μ r/|r|³ (MDL Product10 path)
    const mu = 3.986004418e14
    const rMag = Math.hypot(XS[0], XS[1], XS[2])
    const GS: [number, number, number] = [
      (-mu * XS[0]) / (rMag * rMag * rMag),
      (-mu * XS[1]) / (rMag * rMag * rMag),
      (-mu * XS[2]) / (rMag * rMag * rMag)
    ]
    const inter = igmIntermediateParameters({
      tau_1_sec: tau1,
      T_1_i_sec: T1,
      tau_3_sec: tau3,
      T_3_i_sec: T3
    })
    const { R: Rap, V: Vap, G: Gap } = igmApRotateState(XS, VS, GS)
    const V_mag = Math.hypot(VS[0], VS[1], VS[2])
    const phi_iT = igmPhiIT(inter, T1, tau1, tau3, T3, V_mag)
    const phi_T = Math.atan2(Rap[2], Rap[0]) + phi_iT
    const Rot = rotPhiY(phi_T)
    const R = mat3Vec(Rot, Rap)
    const V = mat3Vec(Rot, Vap)
    const G = mat3Vec(Rot, Gap)
    const seed = igmS419Combos(inter, T1, tau3, T3, IGM_V_EX3_MPS, 0, T3)
    const dV0 = igmDeltaV(V, G, T1 + T3)
    const Gain1_h = igmGain1_h(dV0, seed.L_y)
    const T3_eff = T3 + igmGain5_k(tau3, T3) * Gain1_h
    const s419 = igmS419Combos(
      inter,
      T1,
      tau3,
      T3,
      IGM_V_EX3_MPS,
      Gain1_h,
      T3_eff
    )
    const dV = igmDeltaV(V, G, T1 + T3_eff)
    const out = igmS420Product15({
      inter,
      s419,
      T1,
      tau1,
      tau3,
      T3_eff,
      R,
      V,
      G,
      dV,
      phi_T
    })
    expect(Number.isFinite(out.Chi_Y_deg)).toBe(true)
    expect(Number.isFinite(out.chi_a_cmd)).toBe(true)
    expect(Math.hypot(dV[0], dV[1], dV[2])).toBeGreaterThan(100)
  })

  test('S419 combos: L_y = L_prime_y when Gain1_h=0', () => {
    const inter = igmIntermediateParameters(IGM_TAU_PRESETS)
    const c = igmS419Combos(
      inter,
      IGM_TAU_PRESETS.T_1_i_sec,
      IGM_TAU_PRESETS.tau_3_sec,
      IGM_TAU_PRESETS.T_3_i_sec,
      IGM_V_EX3_MPS,
      0,
      IGM_TAU_PRESETS.T_3_i_sec
    )
    expect(c.L_y).toBeCloseTo(inter.L_prime_y, 6)
    expect(Number.isFinite(c.L_over_J)).toBe(true)
  })

  test('terminal Chi_Y/Z from unit vector', () => {
    const { Chi_Y_deg, Chi_Z_deg } = igmChiYZFromUnitVector([1, 0, 0])
    expect(Chi_Y_deg).toBeCloseTo(0, 6)
    expect(Chi_Z_deg).toBeCloseTo(0, 6)
    const tip = igmChiYZFromUnitVector([0.6, 0.1, 0.8])
    expect(tip.Chi_Z_deg).toBeLessThanOrEqual(45)
    expect(tip.Chi_Z_deg).toBeGreaterThanOrEqual(-45)
  })

  test('AP DCM has unit rows (RTW ConstB, not corrupted mask)', () => {
    for (const row of IGM_AP_DCM) {
      const n = Math.hypot(row[0], row[1], row[2])
      expect(n).toBeCloseTo(1, 9)
    }
  })

  test('AP rotate + Chi pipeline finite (S420 Product15)', () => {
    const inter = igmIntermediateParameters(IGM_TAU_PRESETS)
    const XS: [number, number, number] = [6.5e6, 0, 1e5]
    const VS: [number, number, number] = [500, 0, 3000]
    const GS: [number, number, number] = [-9, 0, -1]
    const { V } = igmApRotateState(XS, VS, GS)
    expect(V.some(x => Number.isFinite(x))).toBe(true)
    const pipe = igmChiPipeline({
      inter,
      T1: IGM_TAU_PRESETS.T_1_i_sec,
      tau1: IGM_TAU_PRESETS.tau_1_sec,
      tau3: IGM_TAU_PRESETS.tau_3_sec,
      T3: IGM_TAU_PRESETS.T_3_i_sec,
      XS,
      VS,
      GS
    })
    expect(Number.isFinite(pipe.Chi_Y_deg)).toBe(true)
    expect(Number.isFinite(pipe.Chi_Z_deg)).toBe(true)
    expect(Number.isFinite(pipe.elev_cmd_deg)).toBe(true)
    expect(Number.isFinite(pipe.s420.K_p)).toBe(true)
    expect(Number.isFinite(pipe.s420.DeltaX_V)).toBe(true)
    expect(pipe.T3_eff).not.toBe(IGM_TAU_PRESETS.T_3_i_sec) // corrected
    expect(Math.abs(pipe.dV[2])).toBeGreaterThan(0) // toward V_T~7781
    expect(IGM_V_T_MPS).toBe(7780.976)
    // Product15 v is APᵀ·v_cmd (MDL Math Function5)
    const vCheck = mat3Vec(IGM_AP_DCM_T, pipe.s420.v_cmd)
    expect(vCheck[0]).toBeCloseTo(pipe.s420.v[0], 9)
    expect(pipe.Chi_Z_deg).toBeLessThanOrEqual(45)
    expect(pipe.Chi_Z_deg).toBeGreaterThanOrEqual(-45)
  })

  test('S420 freezes chi-rates when T3_eff ≤ 15', () => {
    const inter = igmIntermediateParameters({
      ...IGM_TAU_PRESETS,
      T_3_i_sec: 10
    })
    const s419 = igmS419Combos(
      inter,
      200,
      262.52,
      10,
      IGM_V_EX3_MPS,
      0,
      10
    )
    const dV: [number, number, number] = [100, 10, 2000]
    const { chi_a, chi_b } = igmChiAlphaBeta(dV)
    expect(Number.isFinite(chi_a)).toBe(true)
    expect(Number.isFinite(chi_b)).toBe(true)
    const out = igmS420Product15({
      inter,
      s419,
      T1: 200,
      tau1: 286.9,
      tau3: 262.52,
      T3_eff: 10,
      R: [6.5e6, 0, 1e5],
      V: [500, 0, 3000],
      G: [-9, 0, -1],
      dV,
      phi_T: 0.1
    })
    // freeze ⇒ sw rates 0 ⇒ chi_a_cmd = chi_a - phi_T - π/2
    expect(out.chi_a_cmd).toBeCloseTo(chi_a - 0.1 - Math.PI / 2, 9)
    expect(out.chi_b_cmd).toBeCloseTo(chi_b, 9)
  })
})
