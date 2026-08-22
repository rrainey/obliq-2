/**
 * Phase 1/2 final.json differ
 */

import {
  compareFinalJson,
  PRIMARY_FIELDS
} from '../examples/saturn-ib/compareFinalJson'
import * as fs from 'fs'
import * as path from 'path'

describe('compareFinalJson', () => {
  test('identical primary fields pass', () => {
    const refPath = path.join(
      process.env.HOME || '',
      'src/viper/ApolloA/reference-1000s-final.json'
    )
    if (!fs.existsSync(refPath)) {
      console.warn('skip: reference-1000s-final.json not present')
      return
    }
    const ref = JSON.parse(fs.readFileSync(refPath, 'utf8'))
    const result = compareFinalJson(ref, { ...ref })
    expect(result.passed).toBe(true)
    expect(result.failCount).toBe(0)
    expect(result.diffs.length).toBe(PRIMARY_FIELDS.length)
  })

  test('0.6% trajectory error fails gate', () => {
    const ref = {
      s2_h_m: 100000,
      s2_Xe_x_m: 1e6,
      s2_Xe_y_m: 2e6,
      s2_Xe_z_m: 3e6,
      s2_Ve_x_mps: 1000,
      s2_Ve_y_mps: -7000,
      s2_Ve_z_mps: -500,
      veh_q_ECI_q0: 0.5,
      veh_q_ECI_q1: -0.5,
      veh_q_ECI_q2: 0.5,
      veh_q_ECI_q3: -0.5,
      BodyToSM_Phi_deg: 10,
      BodyToSM_Theta_deg: 20,
      BodyToSM_Psi_deg: 30,
      bLiftoff: true,
      bStageSep: true,
      bIECO: true,
      bOECO: true,
      bS_IVB_EngineStart: true
    }
    const model = { ...ref, s2_h_m: 100000 * 1.006 }
    const result = compareFinalJson(ref, model)
    expect(result.passed).toBe(false)
    expect(result.diffs.find(d => d.field === 's2_h_m')?.kind).toBe('fail')
  })

  test('event flag mismatch fails', () => {
    const ref = {
      s2_h_m: 1,
      s2_Xe_x_m: 1,
      s2_Xe_y_m: 1,
      s2_Xe_z_m: 1,
      s2_Ve_x_mps: 1,
      s2_Ve_y_mps: 1,
      s2_Ve_z_mps: 1,
      veh_q_ECI_q0: 1,
      veh_q_ECI_q1: 0,
      veh_q_ECI_q2: 0,
      veh_q_ECI_q3: 0,
      BodyToSM_Phi_deg: 0,
      BodyToSM_Theta_deg: 0,
      BodyToSM_Psi_deg: 0,
      bLiftoff: true,
      bStageSep: true,
      bIECO: true,
      bOECO: true,
      bS_IVB_EngineStart: true
    }
    const model = { ...ref, bOECO: false }
    const result = compareFinalJson(ref, model)
    expect(result.passed).toBe(false)
    expect(result.diffs.find(d => d.field === 'bOECO')?.kind).toBe('fail')
  })
})
