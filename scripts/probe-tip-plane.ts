/**
 * Probe pad LIO vs MES Body→S and tip-plane expectations.
 */
import { as205DefaultPadStateEci } from '../../viper/lib_SaturnIBObliq/ts/as205EciPlant'
import {
  computeBodyToSm,
  bodyToSmAtPad
} from '../../viper/lib_SaturnIBObliq/ts/as205BodyToSm'
import { AS205_PAD } from '../../viper/lib_SaturnIBObliq/ts/as205PadFrames'
import { mat3MulVec } from '../../viper/lib_SaturnIBObliq/ts/as205Mes'

const rad2deg = (r: number) => (r * 180) / Math.PI
const pad = as205DefaultPadStateEci()
const attLIO = computeBodyToSm(pad.MES, pad.C_bE)
const attMes = bodyToSmAtPad(pad.MES)

console.log('pad_roll', AS205_PAD.pad_roll_L_deg, 'A_z', AS205_PAD.A_z_deg)
console.log('ΔAz', AS205_PAD.pad_roll_L_deg - AS205_PAD.A_z_deg)

console.log('\nLIO IC (Position I):')
console.log('  Euler deg', {
  phi: rad2deg(attLIO.phi_rad).toFixed(3),
  theta: rad2deg(attLIO.theta_rad).toFixed(3),
  psi: rad2deg(attLIO.psi_rad).toFixed(3)
})
console.log('  elev deg', rad2deg(attLIO.elev_rad).toFixed(3))
console.log('  Xb_S', attLIO.X_b_S.map(x => +x.toFixed(6)))
console.log(
  '  body+Y in S',
  mat3MulVec(attLIO.C_bS, [0, 1, 0]).map(x => +x.toFixed(6))
)
console.log(
  '  body+Z in S',
  mat3MulVec(attLIO.C_bS, [0, 0, 1]).map(x => +x.toFixed(6))
)

console.log('\nB‖S (MESᵀ):')
console.log('  Euler deg', {
  phi: rad2deg(attMes.phi_rad).toFixed(3),
  theta: rad2deg(attMes.theta_rad).toFixed(3),
  psi: rad2deg(attMes.psi_rad).toFixed(3)
})
console.log('  elev deg', rad2deg(attMes.elev_rad).toFixed(3))
console.log('  Xb_S', attMes.X_b_S.map(x => +x.toFixed(6)))

// Pitch gimbal β_P>0 → F ≈ [1,0,β] body → force in S
const beta = (2 * Math.PI) / 180
const F_b: [number, number, number] = [Math.cos(beta), 0, Math.sin(beta)]
const F_S = mat3MulVec(attLIO.C_bS, F_b)
console.log('\nβ_P=+2° thrust dir in S (LIO pad):', F_S.map(x => +x.toFixed(6)))
console.log('  ⇒ tip force Y/Z ratio', (F_S[1] / F_S[2]).toFixed(4))
