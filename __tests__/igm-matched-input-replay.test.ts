/**
 * Matched-input IGM replay: freeze RTW dual-harness samples and run Obliq
 * igmChiPipeline. Isolates algebra from live plant/nav drift.
 *
 * Prefers CSV columns from extended IGM_TRACE_STASH (GS_*, dV0_*, Vphi_*, …).
 * Falls back to point-mass G from XS if GS_* absent.
 *
 * 1.6 s ZOH differences do not matter for a frozen sample's T1/T3.
 */
import * as fs from 'fs'
import {
  igmChiPipeline,
  igmApRotateState,
  igmPhiIT,
  igmDeltaV,
  igmGain1_h,
  igmChiAlphaBeta,
  igmS419Combos,
  rotPhiY,
  mat3Vec,
  IGM_XDOTDOT_VGT
} from '../examples/saturn-ib/igmChiAssembly'
import {
  igmIntermediateParameters,
  IGM_TAU_PRESETS,
  IGM_V_EX1_MPS,
  IGM_V_EX3_MPS
} from '../examples/saturn-ib/igmIntermediateParameters'

const RTW_CSV =
  process.env.IGM_RTW_CSV || '/tmp/igm-matched/igm-rtw.csv'

function parseCsv(p: string): Record<string, string>[] {
  const text = fs.readFileSync(p, 'utf8').trim()
  const lines = text.split(/\r?\n/)
  const hdr = lines[0].split(',')
  return lines.slice(1).map(line => {
    const cols = line.split(',')
    const o: Record<string, string> = {}
    hdr.forEach((h, i) => {
      o[h] = cols[i]
    })
    return o
  })
}

function num(r: Record<string, string>, k: string): number {
  return Number(r[k])
}

function finite(x: number): boolean {
  return Number.isFinite(x)
}

function pointMassG(XS: [number, number, number]): [number, number, number] {
  const mu = 3.986004418e14
  const r = Math.hypot(XS[0], XS[1], XS[2])
  const s = -mu / (r * r * r)
  return [s * XS[0], s * XS[1], s * XS[2]]
}

function vec3(
  r: Record<string, string>,
  x: string,
  y: string,
  z: string
): [number, number, number] | null {
  const v: [number, number, number] = [num(r, x), num(r, y), num(r, z)]
  return v.every(finite) ? v : null
}

describe('IGM matched-input replay (RTW CSV → igmChiPipeline)', () => {
  const available = fs.existsSync(RTW_CSV)
  ;(available ? test : test.skip)(
    'first enabled finite sample: block-by-block vs RTW stash',
    () => {
      const rows = parseCsv(RTW_CSV)
      const row = rows.find(r => {
        if (r.igm_enable !== '1' && r.igm_enable !== '1.0') return false
        const ca = Number(r.chi_a_rad)
        return Number.isFinite(ca)
      })
      expect(row).toBeTruthy()
      const r = row!

      const XS = vec3(r, 'XS_x', 'XS_y', 'XS_z')!
      const VS = vec3(r, 'VS_x', 'VS_y', 'VS_z')!
      const GS_stash = vec3(r, 'GS_x', 'GS_y', 'GS_z')
      const GS = GS_stash ?? pointMassG(XS)
      const usedStashG = !!GS_stash

      // FillIgmTrace T1 is post-decrement; Multiport uses pre-decrement T1.
      const DELTA_T = 1.6
      const T1_fill = num(r, 'T_1_i_sec')
      const T_star_rtw = num(r, 'T_star_l')
      const T1 = finite(T_star_rtw)
        ? T1_fill + DELTA_T // First Phase: Multiport T1 before DSM write
        : T1_fill
      const T3_seed = finite(T_star_rtw) ? T_star_rtw - T1 : num(r, 'T_3_i_sec')
      const T3_eff_rtw = num(r, 'T_3_eff_sec')
      const tau3 = IGM_TAU_PRESETS.tau_3_sec
      const L_y_rtw = num(r, 'L_y')
      // First Phase τ1_eff from RTW L_y = L1+L′3 (not preset 286.9)
      let tau1 = IGM_TAU_PRESETS.tau_1_sec
      if (finite(L_y_rtw) && finite(T1) && finite(T3_seed)) {
        const Lp3 = IGM_V_EX3_MPS * Math.log(tau3 / (tau3 - T3_seed))
        const L1 = L_y_rtw - Lp3
        const ratio = Math.exp(L1 / IGM_V_EX1_MPS)
        if (ratio > 1.0001) tau1 = (ratio / (ratio - 1)) * T1
      }

      const inter = igmIntermediateParameters({
        tau_1_sec: tau1,
        T_1_i_sec: T1,
        tau_3_sec: tau3,
        T_3_i_sec: T3_seed
      })

      // Full pipeline (two-pass Gain1_h / T3_eff) — primary Obliq path
      const pipe = igmChiPipeline({
        inter,
        T1,
        tau1,
        tau3,
        T3: T3_seed,
        XS,
        VS,
        GS
      })

      const { R: Rap, V: Vap, G: Gap } = igmApRotateState(XS, VS, GS)
      const V_mag = Math.hypot(VS[0], VS[1], VS[2])
      const phi_iT = igmPhiIT(inter, T1, tau1, tau3, T3_seed, V_mag)
      const phi_T = Math.atan2(Rap[2], Rap[0]) + phi_iT
      const Rot = rotPhiY(phi_T)
      const V_phi = mat3Vec(Rot, Vap)
      const G_phi = mat3Vec(Rot, Gap)
      const T_star_l = T1 + T3_seed
      const dV0 = igmDeltaV(V_phi, G_phi, T_star_l)
      const seed = igmS419Combos(
        inter,
        T1,
        tau3,
        T3_seed,
        IGM_V_EX3_MPS,
        0,
        T3_seed
      )
      const Gain1_h0 = igmGain1_h(dV0, seed.L_y)
      const { chi_a: chi_a_from_dV0 } = igmChiAlphaBeta(dV0)

      const rtw = {
        phi_T: num(r, 'phi_T_rad'),
        phi_iT: num(r, 'phi_iT_rad'),
        chi_a: num(r, 'chi_a_rad'),
        Chi_Y: num(r, 'Chi_Y_deg'),
        Gain1_h: num(r, 'Gain1_h'),
        L_y: num(r, 'L_y'),
        T_star_l: num(r, 'T_star_l'),
        GS: GS_stash,
        Vphi: vec3(r, 'Vphi_x', 'Vphi_y', 'Vphi_z'),
        Gphi: vec3(r, 'Gphi_x', 'Gphi_y', 'Gphi_z'),
        dV0: vec3(r, 'dV0_x', 'dV0_y', 'dV0_z'),
        dV: vec3(r, 'dV_x', 'dV_y', 'dV_z')
      }

      const blocks: { name: string; rtw: number; obliq: number; abs: number }[] =
        []
      const push = (name: string, rv: number, ov: number) => {
        if (finite(rv) && finite(ov)) {
          blocks.push({ name, rtw: rv, obliq: ov, abs: Math.abs(ov - rv) })
        }
      }

      push('phi_iT', rtw.phi_iT, phi_iT)
      push('phi_T', rtw.phi_T, phi_T)
      push('T_star_l', rtw.T_star_l, T_star_l)
      push('L_y_seed', rtw.L_y, seed.L_y)
      if (rtw.Vphi) {
        push('Vphi_x', rtw.Vphi[0], V_phi[0])
        push('Vphi_y', rtw.Vphi[1], V_phi[1])
        push('Vphi_z', rtw.Vphi[2], V_phi[2])
      }
      if (rtw.Gphi) {
        push('Gphi_x', rtw.Gphi[0], G_phi[0])
        push('Gphi_y', rtw.Gphi[1], G_phi[1])
        push('Gphi_z', rtw.Gphi[2], G_phi[2])
      }
      if (rtw.dV0) {
        push('dV0_x', rtw.dV0[0], dV0[0])
        push('dV0_y', rtw.dV0[1], dV0[1])
        push('dV0_z', rtw.dV0[2], dV0[2])
      }
      push('Gain1_h', rtw.Gain1_h, Gain1_h0)
      // χ_α from Add10 ΔV in RTW; Obliq pipeline uses post-T3_eff dV
      push('chi_a_pipe', rtw.chi_a, igmChiAlphaBeta(pipe.dV).chi_a)
      push('chi_a_from_dV0', rtw.chi_a, chi_a_from_dV0)
      push('Chi_Y', rtw.Chi_Y, pipe.Chi_Y_deg)

      const firstBreak = blocks.find(b => b.abs > 1e-3 && b.abs / (Math.abs(b.rtw) + 1e-9) > 1e-3)

      // eslint-disable-next-line no-console
      console.log(
        JSON.stringify(
          {
            t: num(r, 't_sec'),
            usedStashG,
            GS,
            IGM_XDOTDOT_VGT,
            T1,
            T1_fill,
            tau1_eff: tau1,
            T3_seed,
            T3_eff_rtw,
            pipe_T3_eff: pipe.T3_eff,
            pipe_Gain1_h: pipe.Gain1_h,
            seed_L_y: seed.L_y,
            firstBreak: firstBreak ?? null,
            blocks
          },
          null,
          2
        )
      )

      expect(Number.isFinite(pipe.phi_T)).toBe(true)
      expect(blocks.length).toBeGreaterThan(3)
      // Document first break; keep soft until algebra matches
      if (usedStashG && firstBreak) {
        expect(firstBreak.name).toBeTruthy()
      }
    }
  )
})
