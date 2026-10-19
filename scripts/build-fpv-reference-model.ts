/**
 * Builds reference-models/fpv-quadcopter.json, the FPV quadcopter reference
 * model. See docs/fpv-reference-model-plan.md for the design, parameters and
 * sources.
 *
 *   npx tsx --tsconfig tsconfig.json scripts/build-fpv-reference-model.ts [out.json]
 *
 * The model is generated rather than drawn so it stays reviewable and
 * reproducible: parameters live in one place below, and the diagram is laid
 * out with the same algorithm as Tune Model Layout.
 *
 * Conventions: NED world frame, FRD body frame (x forward, y right, z down),
 * scalar-first quaternion q (body attitude; quat_to_dcm gives C_bn, which
 * maps NED vectors into the body frame). Motors are numbered as in
 * Betaflight's quad X: 0 rear-right, 1 front-right, 2 rear-left, 3 front-left.
 */

import * as fs from 'fs'
import * as path from 'path'
import type { BlockData } from '@/components/BlockNode'
import type { WireData } from '@/components/Wire'
import type { Sheet } from '@/lib/simulationTypes'
import { tuneModelLayout, DEFAULT_TUNE_OPTIONS } from '@/lib/layout/tuneModelLayout'

// ---------------------------------------------------------------------------
// Parameters (kingfisher 5-inch, agile_flight MIT; see the plan for sources)

export const FPV = {
  mass: 0.75, // kg
  inertia: [2.5e-3, 2.1e-3, 4.3e-3], // kg m^2, principal axes
  gravity: 9.80665, // m/s^2
  /** Rotor positions in the body frame [x, y] (m), motor order RR, FR, RL, FL. */
  rotorXY: [
    [-0.0775, 0.1],
    [0.0775, 0.1],
    [-0.0775, -0.1],
    [0.0775, -0.1],
  ],
  /** Sign of each rotor's reaction torque about body z: +1 for props spinning CCW seen from above. */
  rotorYawSign: [-1, 1, 1, -1],
  thrustCoeff: 1.563e-6, // N/(rad/s)^2
  torqueToThrust: 0.0122, // m (kappa = c_d / c_l)
  motorTau: 0.033, // s
  maxThrust: 8.5, // N per motor
  linearDrag: [0.3, 0.3, 0.15], // N s/m, body axes
  dt: 0.001, // s, model step
}

/** 1/s: rate at which the quaternion state is pulled back to unit norm (Euler-stable for k·dt < 2). */
const QUAT_NORM_GAIN = 10

/** Rotor speed at full command, so that full command gives maxThrust. */
export const OMEGA_MAX = Math.sqrt(FPV.maxThrust / FPV.thrustCoeff)
/** Per-motor command that holds hover: thrust = m g / 4, and thrust ∝ command². */
export const HOVER_COMMAND = Math.sqrt((FPV.mass * FPV.gravity) / 4 / FPV.maxThrust)

// ---------------------------------------------------------------------------
// Sheet construction helpers

class SheetBuilder {
  blocks: BlockData[] = []
  connections: WireData[] = []
  constructor(readonly id: string, readonly name: string) {}

  /** Add a block; returns its id (the sheet id plus the block name). */
  add(type: string, name: string, parameters: Record<string, unknown> = {}): string {
    const id = `${this.id}__${name}`.replace(/[^A-Za-z0-9_]/g, '_')
    if (this.blocks.some(b => b.id === id)) throw new Error(`Duplicate block ${name} on ${this.name}`)
    this.blocks.push({ id, type, name, position: { x: 0, y: 0 }, parameters: { showName: true, ...parameters } } as BlockData)
    return id
  }

  wire(from: string, to: string, toPort = 0, fromPort = 0): void {
    this.connections.push({
      id: `w_${this.connections.length + 1}_${from}_${to}`.slice(0, 120),
      sourceBlockId: from,
      sourcePortIndex: fromPort,
      targetBlockId: to,
      targetPortIndex: toPort,
    })
  }

  input(name: string, dataType: string): string {
    return this.add('input_port', name, { portName: name, dataType })
  }

  output(name: string, from: string, dataType: string, fromPort = 0): string {
    const id = this.add('output_port', name, { portName: name, dataType })
    this.wire(from, id, 0, fromPort)
    return id
  }

  constant(name: string, value: unknown, dataType: string): string {
    return this.add('source', name, { signalType: 'constant', value, dataType })
  }

  sheet(): Sheet {
    return { id: this.id, name: this.name, blocks: this.blocks, connections: this.connections, extents: { width: 1200, height: 800 } }
  }
}

const subsystem = (
  inputPorts: string[],
  outputPorts: string[],
  body: SheetBuilder,
  extra: Record<string, unknown> = {}
) => ({ inputPorts, outputPorts, showPortNames: true, codeGenStrategy: 'flatten', sheets: [body.sheet()], ...extra })

/** Block sizes so port labels stay legible. */
const MOTOR_SIZE = { width: 140, height: 80 }
const FRAME_SIZE = { width: 160, height: 260 }

// ---------------------------------------------------------------------------
// Motor / ESC / propeller (one definition, referenced by the other three)

function buildMotorSheet(): SheetBuilder {
  const s = new SheetBuilder('motor', 'Motor')
  const cmd = s.input('cmd', 'double')
  const clamp = s.add('limit', 'CmdLimit', { lowerLimit: 0, upperLimit: 1 })
  s.wire(cmd, clamp)
  const omegaCmd = s.add('scale', 'OmegaMax', { gain: OMEGA_MAX })
  s.wire(clamp, omegaCmd)
  // First-order rotor-speed lag: omega / omega_cmd = 1 / (tau s + 1)
  const lag = s.add('transfer_function', 'MotorLag', { numerator: [1], denominator: [FPV.motorTau, 1] })
  s.wire(omegaCmd, lag)
  const sq = s.add('square', 'OmegaSq')
  s.wire(lag, sq)
  const thrust = s.add('scale', 'ThrustCoeff', { gain: FPV.thrustCoeff })
  s.wire(sq, thrust)
  s.output('omega', lag, 'double')
  s.output('thrust', thrust, 'double')
  return s
}

// ---------------------------------------------------------------------------
// Rigid body: 6-DOF, quaternion attitude

function buildFrameSheet(): SheetBuilder {
  const s = new SheetBuilder('frame', 'Frame')
  const { mass, inertia, gravity, rotorXY, rotorYawSign, torqueToThrust, linearDrag } = FPV
  const T = s.input('thrust', 'double[4]')

  // Rotor forces and moments from the four thrusts (allocation matrices)
  const Bf = s.constant('ThrustDirection', [[0, 0, 0, 0], [0, 0, 0, 0], [-1, -1, -1, -1]], 'double[3][4]')
  const Bm = s.constant(
    'MomentArms',
    [
      rotorXY.map(([, y]) => -y), // Mx = -y T (thrust acts along -z)
      rotorXY.map(([x]) => x), // My = x T
      rotorYawSign.map(sg => sg * torqueToThrust), // Mz = ±kappa T
    ],
    'double[3][4]'
  )
  const fThrust = s.add('matrix_multiply', 'RotorForce')
  s.wire(Bf, fThrust, 0)
  s.wire(T, fThrust, 1)
  const mRotor = s.add('matrix_multiply', 'RotorMoment')
  s.wire(Bm, mRotor, 0)
  s.wire(T, mRotor, 1)

  // Attitude. obliq integrates signals that pass through other blocks with
  // one derivative per step, so the quaternion is renormalized: everything
  // downstream uses q_n = q/|q|, and q_dot pulls the state back to unit norm.
  const q = s.add('integrator', 'q', { initialValue: [[1], [0], [0], [0]] })
  const qNorm = s.add('mag', 'qNorm')
  s.wire(q, qNorm)
  const qn = s.add('divide', 'q_n')
  s.wire(q, qn, 0)
  s.wire(qNorm, qn, 1)
  const Cbn = s.add('orientation_conversion', 'C_bn', { conversionType: 'quat_to_dcm' })
  s.wire(qn, Cbn)
  const Cnb = s.add('transpose', 'C_nb')
  s.wire(Cbn, Cnb)

  // Translation: body-axis linear drag, rotate to NED, add gravity
  const vNed = s.add('integrator', 'v_ned', { initialValue: [0, 0, 0] })
  const vBody = s.add('matrix_multiply', 'v_body')
  s.wire(Cbn, vBody, 0)
  s.wire(vNed, vBody, 1)
  const kd = s.constant('DragCoeff', linearDrag.map(k => -k), 'double[3]')
  const fDrag = s.add('multiply', 'DragForce', { numInputs: 2 })
  s.wire(vBody, fDrag, 0)
  s.wire(kd, fDrag, 1)
  const fBody = s.add('sum', 'F_body', { signs: '++', numInputs: 2 })
  s.wire(fThrust, fBody, 0)
  s.wire(fDrag, fBody, 1)
  const fNed = s.add('matrix_multiply', 'F_ned')
  s.wire(Cnb, fNed, 0)
  s.wire(fBody, fNed, 1)
  const aForce = s.add('scale', 'InvMass', { gain: 1 / mass })
  s.wire(fNed, aForce)
  const g = s.constant('Gravity', [0, 0, gravity], 'double[3]')
  const aNed = s.add('sum', 'a_ned', { signs: '++', numInputs: 2 })
  s.wire(aForce, aNed, 0)
  s.wire(g, aNed, 1)
  s.wire(aNed, vNed)
  const pNed = s.add('integrator', 'p_ned', { initialValue: [0, 0, 0] })
  s.wire(vNed, pNed)
  // Specific force in body axes (what an accelerometer measures)
  const fSpecific = s.add('scale', 'SpecificForce', { gain: 1 / mass })
  s.wire(fBody, fSpecific)

  // Rotation: J w_dot = M - w x (J w)
  const omega = s.add('integrator', 'omega_body', { initialValue: [0, 0, 0] })
  const J = s.constant('Inertia', inertia, 'double[3]')
  const Jw = s.add('multiply', 'Jw', { numInputs: 2 })
  s.wire(J, Jw, 0)
  s.wire(omega, Jw, 1)
  const gyro = s.add('cross', 'GyroTorque')
  s.wire(omega, gyro, 0)
  s.wire(Jw, gyro, 1)
  const mNet = s.add('sum', 'M_net', { signs: '+-', numInputs: 2 })
  s.wire(mRotor, mNet, 0)
  s.wire(gyro, mNet, 1)
  const wDot = s.add('divide', 'omega_dot')
  s.wire(mNet, wDot, 0)
  s.wire(J, wDot, 1)
  s.wire(wDot, omega)

  // Quaternion kinematics: q_dot = 1/2 q ⊗ [0, w]
  const pqr = s.add('demux', 'pqr', { outputCount: 3, inputDimensions: [3] })
  s.wire(omega, pqr)
  const qDot = s.add('body2quaternion_rates', 'q_dot')
  s.wire(qn, qDot, 0)
  s.wire(pqr, qDot, 1, 0)
  s.wire(pqr, qDot, 2, 1)
  s.wire(pqr, qDot, 3, 2)
  const qErr = s.add('sum', 'qNormError', { signs: '+-', numInputs: 2 })
  s.wire(qn, qErr, 0)
  s.wire(q, qErr, 1)
  const qFix = s.add('scale', 'qNormGain', { gain: QUAT_NORM_GAIN })
  s.wire(qErr, qFix)
  const qDotTotal = s.add('sum', 'q_dot_total', { signs: '++', numInputs: 2 })
  s.wire(qDot, qDotTotal, 0)
  s.wire(qFix, qDotTotal, 1)
  s.wire(qDotTotal, q)

  const euler = s.add('orientation_conversion', 'Euler', { conversionType: 'quat_to_euler' })
  s.wire(qn, euler)

  s.output('pos_ned', pNed, 'double[3]')
  s.output('vel_ned', vNed, 'double[3]')
  s.output('quat', qn, 'double[4][1]')
  s.output('euler', euler, 'double[3]')
  s.output('omega', omega, 'double[3]')
  s.output('accel', fSpecific, 'double[3]')
  return s
}

// ---------------------------------------------------------------------------
// Top level

export const MOTOR_NAMES = ['Motor_RR', 'Motor_FR', 'Motor_RL', 'Motor_FL']
const FRAME_OUTPUTS = ['pos_ned', 'vel_ned', 'quat', 'euler', 'omega', 'accel']
const FRAME_OUTPUT_TYPES = ['double[3]', 'double[3]', 'double[4][1]', 'double[3]', 'double[3]', 'double[3]']

export function buildFpvModel(opts: { motorCommand?: number[] } = {}): { name: string; data: Record<string, unknown> } {
  const main = new SheetBuilder('main', 'Main')
  const hover = Number(HOVER_COMMAND.toFixed(6))
  const cmd = main.constant('MotorCmd', opts.motorCommand ?? [hover, hover, hover, hover], 'double[4]')
  const split = main.add('demux', 'MotorCmdSplit', { outputCount: 4, inputDimensions: [4] })
  main.wire(cmd, split)

  const motorDef = buildMotorSheet()
  const motorIds = MOTOR_NAMES.map((name, i) => {
    const params =
      i === 0
        ? subsystem(['cmd'], ['omega', 'thrust'], motorDef, MOTOR_SIZE)
        : {
            ...MOTOR_SIZE,
            inputPorts: ['cmd'],
            outputPorts: ['omega', 'thrust'],
            showPortNames: true,
            isReference: true,
            referencedSubsystemId: `main__${MOTOR_NAMES[0]}`,
            codeGenStrategy: 'segregated_atomic',
            sheets: [],
          }
    const id = main.add('subsystem', name, params)
    main.wire(split, id, 0, i)
    return id
  })
  // The definition compiles as a shared module either way; say so explicitly.
  ;(main.blocks.find(b => b.id === motorIds[0])!.parameters as Record<string, unknown>).codeGenStrategy = 'segregated_atomic'

  const thrustVec = main.add('mux', 'Thrusts', { rows: 4, cols: 1, baseType: 'double', outputType: 'double[4]' })
  const omegaVec = main.add('mux', 'RotorSpeeds', { rows: 4, cols: 1, baseType: 'double', outputType: 'double[4]' })
  motorIds.forEach((id, i) => {
    main.wire(id, thrustVec, i, 1)
    main.wire(id, omegaVec, i, 0)
  })

  const frame = main.add('subsystem', 'Frame', subsystem(['thrust'], FRAME_OUTPUTS, buildFrameSheet(), FRAME_SIZE))
  main.wire(thrustVec, frame)

  FRAME_OUTPUTS.forEach((name, i) => main.output(name, frame, FRAME_OUTPUT_TYPES[i]!, i))
  main.output('motor_omega', omegaVec, 'double[4]')

  for (const [label, from, port] of [
    ['Position', frame, 0],
    ['Attitude', frame, 3],
    ['BodyRates', frame, 4],
    ['RotorSpeed', omegaVec, 0],
  ] as const) {
    const d = main.add('signal_display', label, { maxSamples: 10000 })
    main.wire(from, d, 0, port)
  }

  let sheets: Sheet[] = [main.sheet()]
  sheets = tuneModelLayout(sheets as any, null, {
    ...DEFAULT_TUNE_OPTIONS,
    cleanUpLayout: true,
    resizeSubsystems: false,
    scope: 'model',
  }).sheets as unknown as Sheet[]
  fitExtents(sheets)

  return {
    name: 'FPV Quadcopter',
    data: {
      version: '2.2',
      metadata: {
        created: '2026-10-19T00:00:00.000Z',
        description:
          '5-inch FPV quadcopter reference model (in development: plant only). ' +
          'NED world / FRD body axes, quaternion 6-DOF rigid body, four first-order motor/propeller subsystems. ' +
          'Parameters from the kingfisher model in uzh-rpg/agile_flight (MIT) and Kaufmann et al. 2022; ' +
          'equation structure after uzh-rpg/flightmare (MIT). See docs/fpv-reference-model-plan.md.',
      },
      globalSettings: {
        simulationTimeStep: FPV.dt,
        simulationDuration: 5,
        integrationAlgorithm: 'rk4',
        debugMath: false,
      },
      parameters: [],
      dataStores: [],
      sheets,
    },
  }
}

/** Grow each sheet's extents to cover its laid-out blocks. */
function fitExtents(sheets: Sheet[]): void {
  for (const sheet of sheets) {
    let w = 400, h = 300
    for (const b of sheet.blocks) {
      w = Math.max(w, (b.position?.x ?? 0) + 300)
      h = Math.max(h, (b.position?.y ?? 0) + 200)
      const inner = (b.parameters as any)?.sheets as Sheet[] | undefined
      if (inner?.length) fitExtents(inner)
    }
    sheet.extents = { width: Math.ceil(w), height: Math.ceil(h) }
  }
}

if (require.main === module) {
  const out = process.argv[2] || path.join(__dirname, '..', 'reference-models', 'fpv-quadcopter.json')
  fs.writeFileSync(out, JSON.stringify(buildFpvModel(), null, 2) + '\n')
  console.log(`Wrote ${out} (hover command ${HOVER_COMMAND.toFixed(4)}, omega_max ${OMEGA_MAX.toFixed(1)} rad/s)`)
}
