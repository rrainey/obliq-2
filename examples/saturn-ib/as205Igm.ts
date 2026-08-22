/**
 * IGM timing constants from RTW LVDC (`Saturn_IB_Stack.c` / MDL).
 *
 * Live path (Obliq): First Phase T₁ → Phase2 T₃ countdown → Add8 → HSL cutoff.
 * See `lvdcIgmPhase0.ts` / `LVDC_SFRAME_IGM_INVENTORY.md`.
 *
 * RTW:
 *   IGM Enable:     T3 >= 44 s     (`<S352>`)
 *   SMCY gate:      T3 >= 58.5 s   (`<S380>`)
 *   T_3_i IC:       116.0 s        (`<S356>` DSM)
 *   T_HSL:          5.0 s          (`<S390>/T_HSL_sec`)
 *   bCutoff:        T_3_i <= 0.04  (HSL Cutoff Timing / `<S403>`)
 *   Add8:           T3 + Gain5_k·Gain1_h  (`<S356>/Add8`)
 */

/** T3 elapsed since OECO at which LVDC Iterative Guidance Mode enables */
export const IGM_ENABLE_T3_S = 44.0

/**
 * T3 elapsed at which RTW arms SMCY (`<S380>`).
 * Retained for diagnostics; cutoff no longer uses the fixed T_go stub.
 */
export const IGM_TGO_ARM_T3_S = 58.5

/**
 * Gate SMCY/SMCZ closed-loop Chi bias.
 * false = Tier B baseline. as_zoh Gain3 still regresses Ve_y (−29% vs −12%
 * bypass); need true PIPA/specific-force quant, not thrust-only A_m.
 */
export const IGM_SMC_ENABLE = false

/**
 * SMC Gain3 Δ-source (RTW: AccelerometerQuantization − Memory × 0.625).
 * - `as_zoh`: S-frame A_m (F/m·Xb_S) — closer to PIPA accel quant
 * - `vs_zoh`: legacy V_S ZOH (regressed Ve_y when SMC on)
 * Applied even when IGM_SMC_ENABLE=false so the plant is ready to flip.
 */
export type IgmSmcDvSource = 'as_zoh' | 'vs_zoh'
export const IGM_SMC_DV_SOURCE: IgmSmcDvSource = 'as_zoh'

/** RTW Gain3 scale on (signal − ZOH) for SMCY/SMCZ */
export const IGM_SMC_GAIN3 = 0.625

/** Initial time-to-go (s) — RTW `T_3_i_sec` data-store IC */
export const IGM_T3_I_IC_S = 116.0

/** Cutoff compare threshold (s) — RTW `<S403>/Constant` */
export const IGM_CUTOFF_TGO_S = 0.04

/** HSL mode entry — RTW `<S390>/T_HSL_sec` (+ DeltaT_b; Obliq uses 5.0) */
export const IGM_T_HSL_S = 5.0

/**
 * χ-rate freeze when T3_eff ≤ this (RTW Compare ≤15).
 * Kept at 5 with cut@HSL: RTW freeze@15+cut@0.04 tumbled; freeze@5+cut@0.04
 * lofted then killed Ve_y. Restore 15 only when Chi→Ψ late window is stable.
 */
export const IGM_CHI_RATE_FREEZE_T3_S = 5.0

/** Effective Obliq cutoff threshold (raw T3); RTW is IGM_CUTOFF_TGO_S=0.04. */
export const IGM_CUTOFF_OBLIQ_T3_S = IGM_T_HSL_S

/** Gain5_k scale — RTW `(τ3−T3) * 2.3851001837481181e-4` */
export const IGM_GAIN5_K_SCALE = 2.3851001837481181e-4

/**
 * Artificial-τ Phase2 (RTW `<S392>` / `<S391>`):
 *   alpha_f = 528 / (286.9 + τ1)
 *   τ3_N = (124558.41 − alpha_f·Mdot1·286.9) / Mdot3
 *   blend over P_C ∈ [0, 35) with (P_C/35)^4; then mode 3 T3 countdown.
 */
export const IGM_TAU1_PRESET_S = 286.9
export const IGM_TAU3_PRESET_S = 262.52
export const IGM_ART_TAU_WINDOW_S = 35.0
/** Mode-2 → mode-3 when P_C >= 35 − δT */
export const IGM_ART_TAU_HOLD_S = IGM_ART_TAU_WINDOW_S - 1.6
export const IGM_MDOT1_KGPS = 243.687
export const IGM_MDOT3_KGPS = 204.129
export const IGM_ART_ALPHA_NUM = 528.0
export const IGM_ART_MASS_TERM = 124558.41

/** Precomputed α_f with τ1 = preset (constant mask) */
export const IGM_ART_ALPHA_F =
  IGM_ART_ALPHA_NUM / (IGM_TAU1_PRESET_S + IGM_TAU1_PRESET_S)

/** Precomputed τ3_N at First Phase → Phase2 handoff */
export const IGM_TAU3_N_S =
  (IGM_ART_MASS_TERM -
    IGM_ART_ALPHA_F * IGM_MDOT1_KGPS * IGM_TAU1_PRESET_S) /
  IGM_MDOT3_KGPS

/**
 * @deprecated Fixed-stub elapsed cutoff; plant now uses LVDC HSL bCutoff.
 * Kept for residual reports / older notes.
 */
export const IGM_CUTOFF_ELAPSED_S = IGM_T3_I_IC_S - IGM_CUTOFF_TGO_S

/**
 * Terminal pitch (deg) — `AS205_presettings.m` `Theta_T_deg` (=0 horizontal).
 */
export const THETA_T_DEG = 0.0

/** @deprecated Interim elev proxy — plant uses LVDC Chi_Y */
export const IGM_ELEV_CMD_PROXY_DEG = 20.0

/**
 * IGM elev tip-band fallback (Wave B/C): elev_cmd = clamp(90+Chi_Y, min, max).
 * Floor 15° avoids dive. Upper sweep (SMC off+Wave C): 30 best; 30.5/32 lofted.
 */
export const IGM_TIP_ELEV_MIN_DEG = 15.0
export const IGM_TIP_ELEV_MAX_DEG = 30.0
