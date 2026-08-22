/**
 * RTW `<S356>/SMCY` — closed-loop Chi_Y bias (pirad state → radians).
 *
 * Enable: T3_event ≥ 58.5 ∧ ¬HSL (Obliq: T3_i > 5).
 * Update (1.6 s): Gain3 = (signal − ZOH)*0.625 — RTW uses accel quant;
 * Obliq default `IGM_SMC_DV_SOURCE=as_zoh` (A_m). Chi_Y += SMCY_rad.
 *
 * See Saturn_IB_Stack.c `<S397>` / `<S427>/Gain3` / LVDC_SFRAME_IGM_INVENTORY.md.
 */

import type { SliceBlock, SliceWire } from './sliceModels'
import {
  IGM_SMC_ENABLE,
  IGM_SMC_GAIN3,
  IGM_TGO_ARM_T3_S,
  IGM_T_HSL_S
} from './as205Igm'

/** RTW `<S427>/Gain3`: (accel_quant − Memory) * 0.625 */
export function smcGain3Delta(
  current: number,
  zohPrev: number,
  gain = IGM_SMC_GAIN3
): number {
  return (current - zohPrev) * gain
}

let _id = 0
const nid = (p: string) => `smcy_${p}_${++_id}`
export function resetSmcyIds() {
  _id = 0
}

function B(
  type: string,
  name: string,
  x: number,
  y: number,
  parameters: Record<string, unknown> = {}
): SliceBlock {
  return { id: nid(type), name, type, position: { x, y }, parameters }
}

function W(
  from: SliceBlock,
  to: SliceBlock,
  fromPort = 0,
  toPort = 0
): SliceWire {
  return {
    id: nid('w'),
    sourceBlockId: from.id,
    sourcePortIndex: fromPort,
    targetBlockId: to.id,
    targetPortIndex: toPort
  }
}

/** RTW SMCG (Y-Axis) ≈ δT/π */
export const IGM_SMCG = 5.0929581789406508e-1
/** Discrete update gain on pirad state */
export const IGM_SMCY_STEP = 0.03
const DELTA_T = 1.6
const PI = 3.141592653589793

/**
 * Append SMCY Y-bias chain onto an existing LVDC block/wire list.
 * Mutates `blocks` / `wires`. Returns Chi_Y (with SMCY) and SMCY_rad blocks.
 */
export function appendIgmSmcyY(
  blocks: SliceBlock[],
  wires: SliceWire[],
  args: {
    t3Event: SliceBlock
    T3i: SliceBlock
    chiYRawDeg: SliceBlock
    /** Demux of ΔV source (V_S or A_m); ports 0=x 2=z for SMCY */
    dvDemux: SliceBlock
    x: number
    y: number
  }
): { SMCY_rad: SliceBlock; Chi_Y_deg: SliceBlock } {
  const push = (b: SliceBlock) => {
    blocks.push(b)
    return b
  }
  const { t3Event, T3i, chiYRawDeg, dvDemux, x, y } = args

  const en = push(
    B('evaluate', 'SMCY_enable', x, y, {
      numInputs: 2,
      // T3_event≥58.5 ∧ T3_i>5 ∧ IGM_SMC_ENABLE
      expression: IGM_SMC_ENABLE
        ? `in(0)>=${IGM_TGO_ARM_T3_S}&&in(1)>${IGM_T_HSL_S}?1.0:0.0`
        : '0.0'
    })
  )
  wires.push({
    id: nid('w'),
    sourceBlockId: t3Event.id,
    sourcePortIndex: 0,
    targetBlockId: en.id,
    targetPortIndex: 0
  })
  wires.push({
    id: nid('w'),
    sourceBlockId: T3i.id,
    sourcePortIndex: 0,
    targetBlockId: en.id,
    targetPortIndex: 1
  })

  // Gain3: (signal − ZOH) * 0.625 @ 1.6 s (RTW accel quant path)
  const Ax_z = push(
    B('unit_delay', 'SMCY_dv_x_zoh', x + 160, y, {
      initialValue: 0,
      sampleInterval: DELTA_T,
      dataType: 'double'
    })
  )
  const Az_z = push(
    B('unit_delay', 'SMCY_dv_z_zoh', x + 160, y + 60, {
      initialValue: 0,
      sampleInterval: DELTA_T,
      dataType: 'double'
    })
  )
  wires.push({
    id: nid('w'),
    sourceBlockId: dvDemux.id,
    sourcePortIndex: 0,
    targetBlockId: Ax_z.id,
    targetPortIndex: 0
  })
  wires.push({
    id: nid('w'),
    sourceBlockId: dvDemux.id,
    sourcePortIndex: 2,
    targetBlockId: Az_z.id,
    targetPortIndex: 0
  })

  const Gx = push(
    B('evaluate', 'SMCY_Gain3_x', x + 320, y, {
      numInputs: 2,
      expression: `(in(0)-in(1))*${IGM_SMC_GAIN3}`
    })
  )
  const Gz = push(
    B('evaluate', 'SMCY_Gain3_z', x + 320, y + 60, {
      numInputs: 2,
      expression: `(in(0)-in(1))*${IGM_SMC_GAIN3}`
    })
  )
  wires.push({
    id: nid('w'),
    sourceBlockId: dvDemux.id,
    sourcePortIndex: 0,
    targetBlockId: Gx.id,
    targetPortIndex: 0
  })
  wires.push({
    id: nid('w'),
    sourceBlockId: Ax_z.id,
    sourcePortIndex: 0,
    targetBlockId: Gx.id,
    targetPortIndex: 1
  })
  wires.push({
    id: nid('w'),
    sourceBlockId: dvDemux.id,
    sourcePortIndex: 2,
    targetBlockId: Gz.id,
    targetPortIndex: 0
  })
  wires.push({
    id: nid('w'),
    sourceBlockId: Az_z.id,
    sourcePortIndex: 0,
    targetBlockId: Gz.id,
    targetPortIndex: 1
  })

  // Chi_Y feedback in radians (delayed full commanded Chi)
  const chiY_rad = push(
    B('evaluate', 'SMCY_Chi_Y_rad', x + 160, y + 140, {
      numInputs: 1,
      expression: `in(0)*${PI}/180.0`
    })
  )
  // Will wire from Chi_Y_with_SMCY after it's created — use raw for first sample
  // Actually wire from final Chi_Y_deg to close loop with delay
  const chi_last = push(
    B('unit_delay', 'SMCY_Chi_y_last', x + 320, y + 140, {
      initialValue: 0,
      sampleInterval: DELTA_T,
      dataType: 'double'
    })
  )
  const chi_last2 = push(
    B('unit_delay', 'SMCY_Chi_y_last2', x + 480, y + 140, {
      initialValue: 0,
      sampleInterval: DELTA_T,
      dataType: 'double'
    })
  )
  wires.push({
    id: nid('w'),
    sourceBlockId: chi_last.id,
    sourcePortIndex: 0,
    targetBlockId: chi_last2.id,
    targetPortIndex: 0
  })

  const smcy_z = push(
    B('unit_delay', 'SMCY_pirad_z', x + 320, y + 200, {
      initialValue: 0,
      sampleInterval: DELTA_T,
      dataType: 'double'
    })
  )

  // u = clamp(0.5*(χ_last+χ_last2) − smcy, ±1.4)
  const smcy_u = push(
    B('evaluate', 'SMCY_tan_arg', x + 480, y + 60, {
      numInputs: 3,
      expression:
        '0.5*(in(0)+in(1))-in(2)>1.4?1.4:(0.5*(in(0)+in(1))-in(2)<-1.4?-1.4:0.5*(in(0)+in(1))-in(2))'
    })
  )
  wires.push({
    id: nid('w'),
    sourceBlockId: chi_last.id,
    sourcePortIndex: 0,
    targetBlockId: smcy_u.id,
    targetPortIndex: 0
  })
  wires.push({
    id: nid('w'),
    sourceBlockId: chi_last2.id,
    sourcePortIndex: 0,
    targetBlockId: smcy_u.id,
    targetPortIndex: 1
  })
  wires.push({
    id: nid('w'),
    sourceBlockId: smcy_z.id,
    sourcePortIndex: 0,
    targetBlockId: smcy_u.id,
    targetPortIndex: 2
  })

  // Sum2_g = [(tan(u)*Gx+Gz)*SMCG/(Gx−tan(u)*Gz)]*0.03 + smcy; else hold/0
  const smcy_next = push(
    B('evaluate', 'SMCY_pirad_next', x + 640, y + 60, {
      numInputs: 5,
      // in0=u, in1=smcy_z, in2=Gx, in3=Gz, in4=en
      expression:
        `in(4)<0.5?0.0:` +
        `((in(2)-tan(in(0))*in(3)>1e-6||in(2)-tan(in(0))*in(3)<-1e-6)?` +
        `((tan(in(0))*in(2)+in(3))*${IGM_SMCG}/(in(2)-tan(in(0))*in(3))*${IGM_SMCY_STEP}+in(1))` +
        `:in(1))`
    })
  )
  wires.push({
    id: nid('w'),
    sourceBlockId: smcy_u.id,
    sourcePortIndex: 0,
    targetBlockId: smcy_next.id,
    targetPortIndex: 0
  })
  wires.push({
    id: nid('w'),
    sourceBlockId: smcy_z.id,
    sourcePortIndex: 0,
    targetBlockId: smcy_next.id,
    targetPortIndex: 1
  })
  wires.push({
    id: nid('w'),
    sourceBlockId: Gx.id,
    sourcePortIndex: 0,
    targetBlockId: smcy_next.id,
    targetPortIndex: 2
  })
  wires.push({
    id: nid('w'),
    sourceBlockId: Gz.id,
    sourcePortIndex: 0,
    targetBlockId: smcy_next.id,
    targetPortIndex: 3
  })
  wires.push({
    id: nid('w'),
    sourceBlockId: en.id,
    sourcePortIndex: 0,
    targetBlockId: smcy_next.id,
    targetPortIndex: 4
  })
  // Clamp pirad state to ±0.15 (~±27° after *π) before storing
  const smcy_clamped = push(
    B('evaluate', 'SMCY_pirad_clamped', x + 800, y + 60, {
      numInputs: 1,
      expression: 'in(0)>0.15?0.15:(in(0)<-0.15?-0.15:in(0))'
    })
  )
  wires.push({
    id: nid('w'),
    sourceBlockId: smcy_next.id,
    sourcePortIndex: 0,
    targetBlockId: smcy_clamped.id,
    targetPortIndex: 0
  })
  wires.push({
    id: nid('w'),
    sourceBlockId: smcy_clamped.id,
    sourcePortIndex: 0,
    targetBlockId: smcy_z.id,
    targetPortIndex: 0
  })

  // Output previous pirad state * π = radians (ZOH of update)
  const SMCY_rad = push(
    B('evaluate', 'SMCY_rad', x + 800, y + 200, {
      numInputs: 1,
      expression: `in(0)*${PI}`
    })
  )
  wires.push({
    id: nid('w'),
    sourceBlockId: smcy_z.id,
    sourcePortIndex: 0,
    targetBlockId: SMCY_rad.id,
    targetPortIndex: 0
  })

  const Chi_Y_deg = push(
    B('evaluate', 'Chi_Y_deg_SMCY', x + 680, y + 80, {
      numInputs: 2,
      expression: `in(0)+in(1)*180.0/${PI}`
    })
  )
  wires.push({
    id: nid('w'),
    sourceBlockId: chiYRawDeg.id,
    sourcePortIndex: 0,
    targetBlockId: Chi_Y_deg.id,
    targetPortIndex: 0
  })
  wires.push({
    id: nid('w'),
    sourceBlockId: SMCY_rad.id,
    sourcePortIndex: 0,
    targetBlockId: Chi_Y_deg.id,
    targetPortIndex: 1
  })

  // Close Chi feedback: Chi_Y_deg → rad → chi_last
  wires.push({
    id: nid('w'),
    sourceBlockId: Chi_Y_deg.id,
    sourcePortIndex: 0,
    targetBlockId: chiY_rad.id,
    targetPortIndex: 0
  })
  wires.push({
    id: nid('w'),
    sourceBlockId: chiY_rad.id,
    sourcePortIndex: 0,
    targetBlockId: chi_last.id,
    targetPortIndex: 0
  })

  return { SMCY_rad, Chi_Y_deg }
}

/**
 * RTW `<S398>/SMCZ` — closed-loop Chi_Z bias.
 * Sum3 = (sin(u) − Gy/|G|)*SMCG/cos(u)*0.03 + smcz; SMCZ_rad = Sum3*π.
 */
export function appendIgmSmczZ(
  blocks: SliceBlock[],
  wires: SliceWire[],
  args: {
    t3Event: SliceBlock
    T3i: SliceBlock
    chiZRawDeg: SliceBlock
    /** Demux of ΔV source (V_S or A_m); ports 0,1,2 */
    dvDemux: SliceBlock
    x: number
    y: number
  }
): { SMCZ_rad: SliceBlock; Chi_Z_deg: SliceBlock } {
  const push = (b: SliceBlock) => {
    blocks.push(b)
    return b
  }
  const { t3Event, T3i, chiZRawDeg, dvDemux, x, y } = args

  const en = push(
    B('evaluate', 'SMCZ_enable', x, y, {
      numInputs: 2,
      // T3_event≥58.5 ∧ T3_i>5 ∧ IGM_SMC_ENABLE
      expression: IGM_SMC_ENABLE
        ? `in(0)>=${IGM_TGO_ARM_T3_S}&&in(1)>${IGM_T_HSL_S}?1.0:0.0`
        : '0.0'
    })
  )
  wires.push(W(t3Event, en, 0, 0), W(T3i, en, 0, 1))

  const Ax_z = push(
    B('unit_delay', 'SMCZ_dv_x_zoh', x + 160, y, {
      initialValue: 0,
      sampleInterval: DELTA_T,
      dataType: 'double'
    })
  )
  const Ay_z = push(
    B('unit_delay', 'SMCZ_dv_y_zoh', x + 160, y + 50, {
      initialValue: 0,
      sampleInterval: DELTA_T,
      dataType: 'double'
    })
  )
  const Az_z = push(
    B('unit_delay', 'SMCZ_dv_z_zoh', x + 160, y + 100, {
      initialValue: 0,
      sampleInterval: DELTA_T,
      dataType: 'double'
    })
  )
  wires.push(
    W(dvDemux, Ax_z, 0, 0),
    W(dvDemux, Ay_z, 1, 0),
    W(dvDemux, Az_z, 2, 0)
  )

  const Gx = push(
    B('evaluate', 'SMCZ_Gain3_x', x + 320, y, {
      numInputs: 2,
      expression: `(in(0)-in(1))*${IGM_SMC_GAIN3}`
    })
  )
  const Gy = push(
    B('evaluate', 'SMCZ_Gain3_y', x + 320, y + 50, {
      numInputs: 2,
      expression: `(in(0)-in(1))*${IGM_SMC_GAIN3}`
    })
  )
  const Gz = push(
    B('evaluate', 'SMCZ_Gain3_z', x + 320, y + 100, {
      numInputs: 2,
      expression: `(in(0)-in(1))*${IGM_SMC_GAIN3}`
    })
  )
  wires.push(
    W(dvDemux, Gx, 0, 0),
    W(Ax_z, Gx, 0, 1),
    W(dvDemux, Gy, 1, 0),
    W(Ay_z, Gy, 0, 1),
    W(dvDemux, Gz, 2, 0),
    W(Az_z, Gz, 0, 1)
  )

  const Gmag = push(
    B('evaluate', 'SMCZ_Gain3_mag', x + 480, y + 50, {
      numInputs: 3,
      expression:
        'sqrt(in(0)*in(0)+in(1)*in(1)+in(2)*in(2))<1e-9?1e-9:sqrt(in(0)*in(0)+in(1)*in(1)+in(2)*in(2))'
    })
  )
  wires.push(W(Gx, Gmag, 0, 0), W(Gy, Gmag, 0, 1), W(Gz, Gmag, 0, 2))

  const chiZ_rad = push(
    B('evaluate', 'SMCZ_Chi_Z_rad', x + 160, y + 160, {
      numInputs: 1,
      expression: `in(0)*${PI}/180.0`
    })
  )
  const chi_last = push(
    B('unit_delay', 'SMCZ_Chi_z_last', x + 320, y + 160, {
      initialValue: 0,
      sampleInterval: DELTA_T,
      dataType: 'double'
    })
  )
  const chi_last2 = push(
    B('unit_delay', 'SMCZ_Chi_z_last2', x + 480, y + 160, {
      initialValue: 0,
      sampleInterval: DELTA_T,
      dataType: 'double'
    })
  )
  wires.push(W(chi_last, chi_last2))

  const smcz_z = push(
    B('unit_delay', 'SMCZ_pirad_z', x + 320, y + 220, {
      initialValue: 0,
      sampleInterval: DELTA_T,
      dataType: 'double'
    })
  )

  // u = clamp(0.5*(χ0+χ1)−smcz, ±1.4)
  const smcz_u = push(
    B('evaluate', 'SMCZ_arg', x + 480, y + 220, {
      numInputs: 3,
      expression:
        '0.5*(in(0)+in(1))-in(2)>1.4?1.4:(0.5*(in(0)+in(1))-in(2)<-1.4?-1.4:0.5*(in(0)+in(1))-in(2))'
    })
  )
  wires.push(
    W(chi_last, smcz_u, 0, 0),
    W(chi_last2, smcz_u, 0, 1),
    W(smcz_z, smcz_u, 0, 2)
  )

  // (sin(u) − Gy/|G|) * SMCG / cos(u) * 0.03 + smcz
  const smcz_next = push(
    B('evaluate', 'SMCZ_pirad_next', x + 640, y + 100, {
      numInputs: 5,
      // in0=u, in1=smcz, in2=Gy, in3=Gmag, in4=en
      expression:
        `in(4)<0.5?0.0:` +
        `((cos(in(0))>1e-6||cos(in(0))<-1e-6)?` +
        `((sin(in(0))-in(2)/in(3))*${IGM_SMCG}/cos(in(0))*${IGM_SMCY_STEP}+in(1))` +
        `:in(1))`
    })
  )
  wires.push(
    W(smcz_u, smcz_next, 0, 0),
    W(smcz_z, smcz_next, 0, 1),
    W(Gy, smcz_next, 0, 2),
    W(Gmag, smcz_next, 0, 3),
    W(en, smcz_next, 0, 4)
  )

  const smcz_clamped = push(
    B('evaluate', 'SMCZ_pirad_clamped', x + 800, y + 100, {
      numInputs: 1,
      expression: 'in(0)>0.15?0.15:(in(0)<-0.15?-0.15:in(0))'
    })
  )
  wires.push(W(smcz_next, smcz_clamped), W(smcz_clamped, smcz_z))

  const SMCZ_rad = push(
    B('evaluate', 'SMCZ_rad', x + 800, y + 220, {
      numInputs: 1,
      expression: `in(0)*${PI}`
    })
  )
  wires.push(W(smcz_z, SMCZ_rad))

  const Chi_Z_deg = push(
    B('evaluate', 'Chi_Z_deg_SMCZ', x + 800, y + 40, {
      numInputs: 2,
      // sat ±45 after adding SMCZ
      expression:
        `((in(0)+in(1)*180.0/${PI})>45.0?45.0:((in(0)+in(1)*180.0/${PI})<-45.0?-45.0:(in(0)+in(1)*180.0/${PI})))`
    })
  )
  wires.push(W(chiZRawDeg, Chi_Z_deg, 0, 0), W(SMCZ_rad, Chi_Z_deg, 0, 1))

  wires.push(W(Chi_Z_deg, chiZ_rad), W(chiZ_rad, chi_last))

  return { SMCZ_rad, Chi_Z_deg }
}
