/**
 * Builds the FPV quadcopter reference models in reference-models/: the
 * vehicle (fpv-vehicle.json) and test models that embed it with a model
 * reference (fpv-demo-flight.json, fpv-acro-rate-step.json). See
 * docs/fpv-reference-model-plan.md for the design, parameters and sources.
 *
 *   npx tsx --tsconfig tsconfig.json scripts/build-fpv-reference-model.ts [out-dir]
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
import { ussa1976, USSA1976 } from '@/lib/atmosphere/ussa1976'
import { loadWmm2025, wmmField } from './lib/wmm'
import { modelInterface } from '@/lib/modelReferences'

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
  /** kg m², spinning part of one motor + 5" propeller (est.: prop ~6e-6, bell ~2.5e-6) */
  rotorInertia: 8.5e-6,
  /** Electrical efficiency from battery to shaft power (motor and ESC, est.) */
  driveEfficiency: 0.8,
  /**
   * Ground contact at the field plane (NED z = 0 is the CG height when resting).
   * Spring-damper normal force (1 mm static compression), viscous friction, and a
   * righting torque from the landing legs (all est.).
   */
  ground: {
    stiffness: (0.75 * 9.80665) / 0.001, // N/m
    damping: 150, // N s/m (about critical)
    friction: 20, // N s/m, horizontal
    tiltStiffness: 75, // N m/rad
    tiltDamping: 1.0, // N m s/rad
    yawDamping: 0.5, // N m s/rad
  },
  dt: 0.0005, // s, model (plant) step: 2 kHz
}

/**
 * Betaflight-style flight controller. Behaviour and default values follow
 * Betaflight 4.x documentation (GPL-3; no code is translated). Gains are the
 * firmware's integer values; the scale factors convert them to its internal
 * units (rates in deg/s, PID sum in per-mille of motor range).
 */
export const FC = {
  /** Controller (PID loop) period: 1 kHz. Must be a multiple of FPV.dt. */
  ts: 0.001,
  /** Rates ("Actual"): center sensitivity, max rate (deg/s), expo; roll, pitch, yaw. */
  rates: { center: [70, 70, 70], max: [670, 670, 670], expo: [0, 0, 0] },
  /**
   * P, I, D, FF per axis [roll, pitch, yaw]. Betaflight's defaults, except D: tuned
   * for this quad to Betaflight's d_max values (40/46) with D-max disabled (d_max = D).
   * With I-term relax, a 124 deg/s roll step overshoots 14% (t90 15 ms); default D gave 20%.
   */
  pid: { p: [45, 47, 45], i: [80, 84, 80], d: [40, 46, 0], ff: [120, 125, 120] },
  /** Per-unit scale of each gain. Betaflight's FF coefficient is FEEDFORWARD_SCALE * (F / 100). */
  scale: { p: 0.032029, i: 0.244381, d: 0.000529, ff: 0.013754 / 100 },
  itermLimit: 400,
  /**
   * I-term relax (iterm_relax RP, type SETPOINT, cutoff 15): on roll and pitch the I
   * error is scaled by max(0, 1 − |setpoint − PT1(setpoint)| / threshold), the
   * threshold 40 deg/s (× 0.2 in angle mode), so I does not wind up while the
   * setpoint moves faster than the quad can follow.
   */
  itermRelax: { cutoffHz: 15, thresholdDps: 40, angleModeFactor: 0.2 },
  pidSumLimit: [500, 500, 400],
  /** PID sum is per-mille of the motor range. */
  mixerScaling: 1000,
  gyroLpfHz: [250, 500],
  dtermLpfHz: 150,
  /** Digital idle: lowest motor output while armed. */
  motorIdle: 0.055,
  /**
   * Angle (self-level) mode: full stick = angleLimitDeg; rate setpoint = gain * angle error (deg/s per deg).
   * Gain 8 (angle P 80, tuned; Betaflight 50): a 15° step reaches 90% in 0.28 s instead of 0.46 s, with no overshoot up to 22.
   */
  angle: { limitDeg: 60, gain: 8 },
  /** Airmode (and the I-term) starts once throttle first exceeds this after arming (airmode_start_throttle_percent 25). */
  airmodeStartThrottle: 0.25,
  /** Satellites needed to take home at arming (Betaflight gps_rescue_min_sats). */
  homeMinSats: 8,
  /** Throttle below this is "low" for arming (Betaflight min_check 1050 µs). */
  minCheck: 0.05,
  /**
   * The GPS arming check (rescue is always configured: AUX3 is a GPS RESCUE
   * mode range) is skipped when true (gps_rescue_allow_arming_without_fix).
   */
  allowArmingWithoutFix: false,
  /** Failsafe, after Betaflight (docs/fpv-betaflight-gnss-spec.md §2.1). */
  failsafe: {
    /** s invalid channels hold their last value before going to failsafe values */
    holdS: 0.3,
    /** s from link loss to stage 2 (failsafe_delay) */
    delayS: 1.5,
    /** s of valid link needed to recover (failsafe_recovery_delay) */
    recoveryS: 0.5,
    /** roll/pitch/yaw deflection that ends a stage-2 procedure after recovery (failsafe_stick_threshold) */
    stickThreshold: 0.3,
    /** s of low throttle before a loss after which DROP and AUTO-LAND disarm at once (failsafe_throttle_low_delay) */
    throttleLowDelayS: 10,
    /** s an AUTO-LAND runs before it disarms (failsafe_landing_time) */
    landingTimeS: 60,
  },
  /**
   * The shared autopilot altitude controller and Altitude Hold, after Betaflight
   * 2025.12 (docs/fpv-betaflight-gnss-spec.md §3). Throttle in µs (1000–2000).
   */
  autopilot: {
    /** s: the autopilot task, 100 Hz */
    ts: 0.01,
    /** ap_hover_throttle: this quad's hover (Betaflight's default 1275 is a per-quad setting) */
    get hoverUs() {
      return Math.round(1000 + 1000 * HOVER_THROTTLE)
    },
    throttleMinUs: 1100,
    throttleMaxUs: 1700,
    /**
     * ap_altitude_p / i / d / f (scaled ×0.01, ×0.003, ×0.01, ×0.01 per cm). Tuned for
     * this quad from Betaflight's 15/15/15/15, which left the hold underdamped (ζ ≈ 0.4:
     * 2.1 m overshoot after a climb, 1.35 m RMS in a hover): P 30, D 40 give 0.3 m RMS.
     * D acts on the vertical speed, so in a steady climb it opposes the motion; F 30
     * offsets most of it (the climb reaches the stick's rate) for a 0.8 m overshoot on release.
     */
    p: 30, i: 15, d: 40, f: 30,
    /** µs: altitude I limit; cm: the error above which I accumulates at 0.1× */
    iLimitUs: 200,
    iRelaxCm: 200,
    /** cm/s: D boost starts at this vertical speed, rising toward 3× */
    dBoostStartCmS: 500,
    /** alt_hold_climb_rate × 10 cm/s (50 → 5 m/s) and alt_hold_deadband (fraction of travel either side of hover) */
    climbRateCmS: 500,
    deadband: 0.2,
  },
  /** Position Hold, after Betaflight 2025.12 (docs/fpv-betaflight-gnss-spec.md §3.3). */
  posHold: {
    /**
     * ap_position_p / i / d / a (scaled ×0.0012, ×0.0001, ×0.0015, ×0.0008 per cm). Tuned
     * for this quad from Betaflight's 30/30/30/30: with ideal sensors a stop settles within
     * 1 m in 1.2 s instead of 3.7 s; with GNSS the hold is limited by the GNSS error either way.
     */
    p: 40, i: 60, d: 40, a: 30,
    /** Hz: velocity and acceleration PT1 (ap_position_cutoff 80) */
    cutoffHz: 0.8,
    /** deg: ap_max_angle; the angle target in Pos Hold is limited to half of it (pid.c) */
    maxAngleDeg: 50,
    /** deg: limit on the D + A vector */
    daLimitDeg: 35,
    /** D boost while stopping */
    stoppingDBoost: 1.6,
    /** s: I-term leak time constant while the sticks are active */
    iLeakS: 2.5,
    /** pos_hold_deadband: roll/pitch deflection that hands control to the pilot */
    deadband: 0.05,
    /** pos_hold_without_mag (default off) */
    withoutMag: false,
    /** Hz: PT3 upsampling of the angle at 100 Hz */
    upsampleHz: 5,
    /** cm: sanity distance minimum; max(min, 2 s × ground speed) */
    sanityMinCm: 1000,
  },
  /** GPS Rescue, after Betaflight 2025.12 (docs/fpv-betaflight-gnss-spec.md §2). */
  rescue: {
    /** s: the rescue task, 100 Hz */
    ts: 0.01,
    minStartDistM: 15,
    initialClimbM: 10,
    /** cm/s */
    ascendRateCmS: 750,
    descendRateCmS: 150,
    groundSpeedCmS: 750,
    maxAngleDeg: 45,
    rollMix: 150,
    /** Hz: velocity D cutoff (pitch_cutoff 75); the pitch PT3 upsampling runs at 4× */
    pitchCutoffHz: 0.75,
    /** m/s: normalises the groundspeed error ratio */
    imuYawGainMs: 10,
    descentDistM: 20,
    /** g: impact disarm (disarm_threshold 30 × 0.1) */
    disarmThresholdG: 3.0,
    velP: 8, velI: 40, velD: 12,
    yawP: 20,
    /** ap_landing_altitude_m */
    landingAltitudeM: 4,
    maxYawRateDps: 180,
    allowedYawRangeDeg: 30,
    useMag: true,
    /** gps_rescue_sanity_checks: 0 OFF, 1 ON, 2 FS_ONLY (default) */
    sanityChecks: 2,
  },
}

/** GPS Rescue phase codes (the rescue_phase output). */
export const RESCUE_PHASE = { idle: 0, initialize: 1, attainAlt: 2, rotate: 3, flyHome: 4, descent: 5, landing: 6, doNothing: 7, abort: 8 }
/** GPS Rescue failure codes. */
export const RESCUE_FAILURE = { healthy: 0, flyaway: 1, gpsLost: 2, lowSats: 3, noHomePoint: 4 }

/** Betaflight's PT1 gain: ω / (ω + 1), ω = 2π f dT. */
/** Variance of y⁺ = c·y + (1 − c)·x when x is a unit-variance AR(1) with coefficient a. */
export const lpfVariance = (a: number, c: number) => ((1 - c) ** 2 * (1 + a * c)) / ((1 - c * c) * (1 - a * c))

export const pt1Gain = (cutoffHz: number, ts: number) => {
  const w = 2 * Math.PI * cutoffHz * ts
  return w / (w + 1)
}

/** fc_warnings bits (flags the OSD shows; arming bits only while disarmed). */
export const FC_WARNING = {
  rescueNA: 1,
  rescueOff: 2,
  posHoldFail: 4,
  armThrottle: 8,
  armModeSwitch: 16,
  armGps: 32,
  armRxLoss: 64,
  armSwitchCycle: 128,
}

/** fc_mode codes, in Betaflight's flight-mode text priority (higher wins). */
export const FC_MODE = { acro: 0, air: 1, angle: 2, altHold: 4, posHold: 5, rescue: 6, failsafe: 7 }

/**
 * Prairie Creek Park, Texas. The 1 km terrain database is centered here.
 * elevationM is the NAVD88 height of the DEM cell that contains the park
 * center (environment/dem/prairie-creek-1km.json in obliq-fpv-unity), rounded
 * to a millimeter. z = 0 is 0 m MSL in this vehicle and in that database, so
 * the field plane is z = −elevationM and altitude MSL is −z.
 */
export const LOCATION = {
  name: 'Prairie Creek Park, Texas',
  latitudeDeg: 32.98562480100526,
  longitudeDeg: -96.71872529973575,
  /** m NAVD88 of the origin DEM cell; the field plane is NED z = −elevationM */
  elevationM: 178.133,
  /** Decimal year for the magnetic field (2026-10-20) */
  epoch: 2026.8,
  /**
   * Geoid height N (m) at the park center, NGS GEOID18 (±0.043 m): the
   * ellipsoid is 26.1 m below NAVD88 here, so ellipsoid height = H + N.
   */
  geoidHeightM: -26.103,
  /** UTM zone of the terrain database's grid (NAD83 / UTM 14N) */
  utmZone: 14,
  /**
   * Grid convergence γ (deg) at the park center: the angle from true north to
   * UTM 14N grid north, positive when grid north is east of true north. The
   * model's x axis is grid north. This is the default for test models; the
   * Unity host supplies PROJ's value at run time (the DEM sidecar records it).
   */
  gridConvergenceDeg: 1.2425,
}

/**
 * WMM2025 field at the site, true NED, µT, evaluated at the field's height
 * above the ellipsoid (elevation + geoid height). Across the 1 km terrain box
 * and 150 m of climb the field changes by at most 4 nT, far below the
 * magnetometer's 0.3 µT LSB, so it is a constant.
 */
export const SITE_FIELD = (() => {
  const f = wmmField(loadWmm2025(), LOCATION.latitudeDeg, LOCATION.longitudeDeg, LOCATION.elevationM + LOCATION.geoidHeightM, LOCATION.epoch)
  return { ned: [f.x, f.y, f.z].map(v => Number((v / 1000).toFixed(3))), declinationDeg: f.declinationDeg, inclinationDeg: f.inclinationDeg }
})()

/**
 * Sensor models. Noise values are datasheet figures (TDK ICM-42688-P, iSentek
 * IST8310, Bosch BMP280); turn-on biases and the magnetic field are
 * representative values (est.), not measurements.
 */
export const SENSORS = {
  imu: { ts: 0.001 },
  gyro: {
    /** rad/s/√Hz (2.8 mdps/√Hz) */
    density: 2.8e-3 * (Math.PI / 180),
    /** rad/s, turn-on bias (est. ~0.1–0.3 dps) */
    bias: [0.3, -0.2, 0.1].map(d => d * (Math.PI / 180)),
    /** ±2000 dps, 16-bit */
    range: 2000 * (Math.PI / 180),
    lsb: (4000 / 65536) * (Math.PI / 180),
    seed: 101,
  },
  accel: {
    /** m/s²/√Hz (70 µg/√Hz) */
    density: 70e-6 * 9.80665,
    /** m/s², turn-on bias (est. ~2–5 mg) */
    bias: [0.02, -0.03, 0.05],
    /** ±16 g, 16-bit */
    range: 16 * 9.80665,
    lsb: (32 * 9.80665) / 65536,
    seed: 102,
  },
  mag: {
    ts: 0.01,
    /** µT in NED at the site (WMM2025) */
    field: SITE_FIELD.ned,
    /** µT hard-iron offset (est.) */
    hardIron: [3.0, -2.0, 1.0],
    /** µT RMS */
    noise: 0.4,
    lsb: 0.3,
    seed: 103,
  },
  baro: {
    ts: 0.02,
    /**
     * m above MSL at the NED origin. The origin is 0 m MSL. The field is
     * LOCATION.elevationM, at z = −elevationM, not at this altitude.
     */
    homeAltitude: 0,
    /** Pa RMS */
    noise: 1.3,
    /** s, first-order sensor/filter lag */
    lag: 0.03,
    seed: 104,
  },
  /**
   * GNSS receiver (u-blox M10 class; docs/fpv-hud-gnss-proposal.md §2). Errors
   * are DOP × UERE: a first-order Gauss–Markov part (τ) plus white noise per
   * axis, scaled each sample by the current HDOP/VDOP and UERE scale.
   */
  gnss: {
    /** s: 10 Hz, the M10's default maximum for GPS + Galileo */
    ts: 0.1,
    /** s, correlation time of the slow error */
    tau: 60,
    /**
     * s: the slow error is smoothed by a second pole, so it changes smoothly
     * (0.7 cm per fix at 1.2 m) instead of in first-order random steps
     */
    smoothTau: 5,
    /**
     * s: the fast error is the residual of the receiver's navigation filter, not
     * white: unit noise through two poles at this time constant, so successive
     * 10 Hz fixes differ by about 2.4 cm at 0.12 m (a Groves-style code and
     * range-rate filter gives 1–3 cm; docs/fpv-hud-gnss-plan.md, GNSS error spectrum)
     */
    fastTau: 0.5,
    /** m per unit DOP, 1σ per axis: the slow (correlated) and fast (filter residual) errors */
    uere: { hCorr: 1.5, hFast: 0.15, vCorr: 1.5, vFast: 0.3 },
    /** m/s per unit DOP, 1σ per axis */
    vel: { h: 0.05, v: 0.1 },
    /** s a lost fix needs its satellite condition back before it is reported again */
    reacquireS: 1.0,
    /** m and m/s output resolution */
    quantPos: 0.01,
    quantVel: 0.01,
    /** m/s: below this ground speed the track is not valid and holds */
    trackMinSpeed: 0.5,
    seeds: { corr: 120, fast: 121, vel: 122 },
  },
}

/**
 * Deterministic N(0,1) draws for the builder (mulberry32 + Box–Muller), used
 * for values fixed at build time such as a Gauss–Markov state's stationary
 * starting value. Not the model's run-time generator.
 */
export function builderGaussians(seed: number, count: number): number[] {
  let a = seed >>> 0
  const uniform = () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  const out: number[] = []
  while (out.length < count) {
    const u1 = 1 - uniform()
    const u2 = uniform()
    out.push(Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2))
  }
  return out
}

/** Standard-atmosphere pressure (Pa) at geometric altitude z (m): what the Atmosphere block computes. */
export const standardPressure = (z: number) => ussa1976(z).pressure_Pa

/** Estimators (in the flight controller, at FC.ts). */
export const ESTIMATOR = {
  /** Mahony proportional gain, 1/s (Betaflight imu_dcm_kp 2500 / 10000). */
  mahonyKp: 0.25,
  /**
   * Altitude, after Betaflight 2025.12 (docs/fpv-betaflight-gnss-spec.md §1.1):
   * a 100 Hz blend of baro and GPS altitude, relative to the arming point.
   */
  altitude: {
    ts: 0.01,
    /** Hz: altitude_lpf 300 and altitude_d_lpf 100, each a PT2 */
    lpfHz: 3.0,
    varioLpfHz: 1.0,
    /** altitude_prefer_baro (0–100) */
    preferBaro: 100,
    /** GPS trust cap, and the trust when the receiver gives no pDOP */
    maxGpsTrust: 0.9,
    noPdopTrust: 0.3,
    /** Baro zero offset smoothing while disarmed: off = a·baro + (1 − a)·off */
    zeroSmoothing: 0.2,
  },
  /** Yaw from GPS course over ground, after Betaflight imu.c (docs/fpv-betaflight-gnss-spec.md §1.2). */
  cog: {
    /** m/s: the one-time snap to the course */
    snapSpeed: 1.0,
    /** Satellites must exceed this (GPS_MIN_SAT_COUNT) */
    minSatsExclusive: 4,
    /** m/s: speed factor r = speed / this; r² below 1, else min(r, maxSpeedFactor) */
    speedRef: 1.0,
    maxSpeedFactor: 10,
    /** Yaw-stick factor (1 − |yaw|)^5 through a negative-peak detector releasing with this time constant (s) */
    yawReleaseS: 2.5,
    /** deg: roll factor (limit − |roll|)/limit; pitch factor nose-down pitch / pitchFullDeg */
    rollLimitDeg: 12,
    pitchFullDeg: 45,
    /** canUseGPSHeading: confidence leak (1/s) and threshold */
    confidenceLeak: 0.4,
    confidenceThreshold: 2.0,
  },
}

/** Betaflight's pressure altitude (m): (1 − (P/101325)^0.190295) × 44330. */
export const betaflightBaroAltitude = (pa: number) => (1 - Math.pow(pa / 101325, 0.190295)) * 44330

/** PT2 gain per stage for a cutoff (Hz) at a sample interval, as Betaflight's pt2 (cutoff corrected for two stages). */
export function pt2Gain(cutoffHz: number, ts: number): number {
  const corrected = cutoffHz * 1.553773974 // 1 / sqrt(2^(1/2) − 1)
  const rc = 1 / (2 * Math.PI * corrected)
  return ts / (rc + ts)
}

/**
 * Quad-X mixer [roll, pitch, yaw] per motor (RR, FR, RL, FL), in FRD axes:
 * +roll raises the left motors, +pitch (nose up) the front motors, +yaw (nose
 * right) the CCW props. Betaflight's own table uses its pitch sign convention,
 * so its pitch column is the negative of this one.
 */
export const MIXER = [
  [-1, -1, -1],
  [-1, 1, 1],
  [1, -1, 1],
  [1, 1, -1],
]

/** 1/s: rate at which the quaternion state is pulled back to unit norm (Euler-stable for k·dt < 2). */
const QUAT_NORM_GAIN = 10

/**
 * 4S LiPo pack. Open-circuit voltage per cell versus state of charge is a
 * typical resting-voltage curve for hobby LiPo cells (est.); resistance is
 * the whole pack's (est. for a 1300 mAh 4S racing pack).
 */
export const BATTERY = {
  cells: 4,
  capacityAh: 1.3,
  resistanceOhm: 0.02,
  initialSoc: 1.0,
  ocvPerCell: [
    [0, 3.27], [0.05, 3.61], [0.1, 3.69], [0.2, 3.74], [0.3, 3.77], [0.4, 3.79],
    [0.5, 3.82], [0.6, 3.87], [0.7, 3.92], [0.8, 3.98], [0.9, 4.06], [1.0, 4.2],
  ] as Array<[number, number]>,
  /** V at which the motors reach OMEGA_MAX at full command (a full pack, unloaded) */
  referenceVoltage: 16.8,
}

/** Rotor speed at full command, so that full command gives maxThrust. */
export const OMEGA_MAX = Math.sqrt(FPV.maxThrust / FPV.thrustCoeff)
/** Per-motor command that holds hover: thrust = m g / 4, and thrust ∝ command². */
export const HOVER_COMMAND = Math.sqrt((FPV.mass * FPV.gravity) / 4 / FPV.maxThrust)
/** Throttle stick that gives the hover command through idle + (1 - idle)·throttle. */
/**
 * Pack terminal voltage while hovering on a full battery: each motor draws
 * kappa T w / eta at hover thrust and speed, and V = OCV - I R.
 */
export const HOVER_VOLTAGE = (() => {
  const thrust = (FPV.mass * FPV.gravity) / 4
  const omega = Math.sqrt(thrust / FPV.thrustCoeff)
  const power = (4 * FPV.torqueToThrust * thrust * omega) / FPV.driveEfficiency
  const ocv = BATTERY.cells * BATTERY.ocvPerCell[BATTERY.ocvPerCell.length - 1]![1]
  let v = ocv
  for (let i = 0; i < 20; i++) v = ocv - (power / v) * BATTERY.resistanceOhm
  return v
})()
/** Throttle stick that holds hover on a full pack: idle + (1 - idle)·throttle = hover command at that voltage. */
export const HOVER_THROTTLE = (HOVER_COMMAND * (BATTERY.referenceVoltage / HOVER_VOLTAGE) - FC.motorIdle) / (1 - FC.motorIdle)

/** Piecewise-linear stick inputs over time: [time s, value] pairs per axis. */
export interface StickProfile {
  roll: Array<[number, number]>
  pitch: Array<[number, number]>
  yaw: Array<[number, number]>
  throttle: Array<[number, number]>
  /** AUX1 switch: above 0.5 selects angle (self-level) mode; default acro. */
  aux?: Array<[number, number]>
  /** AUX2 arm switch: above 0.5 is armed; default armed from the start. */
  arm?: Array<[number, number]>
  /** AUX3 GPS Rescue switch: above 0.5 is on; default off. */
  rescue?: Array<[number, number]>
  /** AUX4 hold switch (3-position): below 0.25 off, 0.25–0.75 Alt Hold, above 0.75 Alt + Pos Hold; default off. */
  hold?: Array<[number, number]>
}

/** A piecewise-linear schedule ([time s, value] pairs), or a constant. */
export type Schedule = number | Array<[number, number]>

/** GNSS conditions over time: the receiver's satellites used, HDOP, VDOP and UERE scale. */
export interface GnssEnvProfile {
  satellites?: Schedule
  hdop?: Schedule
  vdop?: Schedule
  uereScale?: Schedule
}

/** Open sky: the receiver's default conditions (u-blox M10 class, multi-GNSS). */
export const DEFAULT_GNSS_ENV = { satellites: 14, hdop: 0.8, vdop: 1.3, uereScale: 1.0 }

/**
 * The vehicle's inputs other than the sticks, over time. Test models feed
 * them from a Conditions subsystem; the Unity host sets them directly.
 */
export interface ConditionsProfile {
  gnssEnv?: GnssEnvProfile
  /** Grid convergence γ (deg); default LOCATION.gridConvergenceDeg */
  gridConvergenceDeg?: Schedule
  /** Radio link valid (1) or lost (0); default 1 */
  rcLinkValid?: Schedule
  /** Failsafe stage-2 procedure: 0 DROP, 1 AUTO-LAND, 2 GPS-RESCUE (this model's codes); default 2 */
  failsafeProcedure?: Schedule
  /** Wind, grid NED (m/s, the air's velocity); default calm */
  wind?: { north?: Schedule; east?: Schedule; down?: Schedule }
}

/** Failsafe procedure codes for the failsafe_procedure input. */
export const FAILSAFE_PROCEDURE = { drop: 0, autoLand: 1, gpsRescue: 2 }

/** The vehicle's Input Ports, in port order, with their types. */
export const VEHICLE_INPUTS: Array<[string, string]> = [
  ['sticks', 'double[8]'],
  ['gnss_env', 'double[4]'],
  ['grid_convergence_deg', 'double'],
  ['rc_link_valid', 'double'],
  ['failsafe_procedure', 'double'],
  ['wind_ned', 'double[3]'],
]

/**
 * Default demo: take off from rest on the field. Armed at 0.25 s, climb on
 * 0.55 throttle, hover, then in angle mode a 24 deg bank, an 18 deg
 * nose-down pitch (flying forward) and a yaw turn.
 */
export const DEMO_STICKS: StickProfile = {
  roll: [[0, 0], [2.0, 0], [2.1, 0.4], [2.8, 0.4], [2.9, 0]],
  pitch: [[0, 0], [3.1, 0], [3.2, -0.3], [3.8, -0.3], [3.9, 0]],
  yaw: [[0, 0], [4.1, 0], [4.15, 0.5], [4.6, 0.5], [4.65, 0]],
  throttle: [[0, 0], [0.5, 0], [0.6, 0.55], [1.1, 0.55], [1.3, Number(HOVER_THROTTLE.toFixed(4))]],
  aux: [[0, 1]],
  arm: [[0, 0], [0.25, 0], [0.251, 1]],
}

/**
 * Pass/fail limits for the default demo flight, checked by the Assert blocks
 * on the Tests sheet. Windows sit inside each manoeuvre's hold, after it has
 * settled; limits leave a margin of a degree or two around the flown values.
 */
export const DEMO_TESTS = {
  /** Motors stay off until the arm switch (0.25 s); after it, at least idle */
  armTime: 0.25,
  /** Height above the field from 1.5 s (1.45 m flown) */
  climbFrom: 1.5,
  minHeightM: 1.0,
  /** Roll and pitch while climbing on the throttle alone */
  levelWindow: [0.6, 2.0] as [number, number],
  levelDeg: 2,
  /** Angle mode: 0.4 roll stick held 2.1–2.8 s commands a 24 deg bank */
  bankWindow: [2.6, 2.8] as [number, number],
  bankDeg: [22, 26.5] as [number, number],
  /** −0.3 pitch stick held 3.2–3.8 s commands 18 deg nose-down */
  pitchWindow: [3.6, 3.8] as [number, number],
  pitchDeg: [-19.5, -15.5] as [number, number],
  /** The yaw stick (4.15–4.6 s) turns the heading about 90 deg */
  yawFrom: 4.7,
  yawDeg: [80, 100] as [number, number],
  /** The estimators against the true state, over the whole flight */
  attitudeEstimateDeg: 5,
  /**
   * alt_est against height above the arming point (about 4σ): the blend weights GPS 0.65 at pDOP 1.5,
   * whose vertical white noise (0.39 m) is in both the fix and the zero taken at arming, and the
   * 10 Hz fix and 3 Hz PT2 lag a 2.5 m/s climb by about 0.3 m.
   */
  altitudeEstimateM: 1.5,
  /** 3.5 V per cell under load */
  minBatteryV: 4 * 3.5,
  /** Roll or pitch beyond this ends the run (stop on failure) */
  uprightDeg: 60,
  /** GNSS horizontal fix error, and home distance error (about 4σ at HDOP 0.8) */
  gnssHorizontalM: 6,
}

/**
 * Airborne demo (start at altitude, armed) at hover throttle: in acro, a roll
 * doublet and a yaw step; then angle mode from 2.4 s: a 30 deg bank held and
 * released, then an 18 deg pitch.
 */
export const AIRBORNE_DEMO_STICKS: StickProfile = {
  roll: [[0, 0], [0.5, 0], [0.55, 0.5], [1.0, 0.5], [1.05, -0.5], [1.5, -0.5], [1.55, 0], [2.6, 0], [2.65, 0.5], [3.4, 0.5], [3.45, 0]],
  pitch: [[0, 0], [3.9, 0], [3.95, 0.3], [4.5, 0.3], [4.55, 0]],
  yaw: [[0, 0], [1.8, 0], [1.85, 0.5], [2.2, 0.5], [2.25, 0]],
  throttle: [[0, Number(HOVER_THROTTLE.toFixed(4))]],
  aux: [[0, 0], [2.4, 0], [2.401, 1]],
}

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

/**
 * Tests-sheet helpers: turn events and statistics into signals that Assert
 * blocks can check (docs/fpv-hud-gnss-test-plan.md, section 2.2). Inputs are
 * scalars; select vector elements first. `ts` is the accumulation interval
 * (0 = every model step).
 */
export class TestHelpers {
  private clockId: string | null = null
  constructor(private readonly s: SheetBuilder) {}

  /** The sheet's clock (one per sheet). */
  clock(): string {
    return (this.clockId ??= this.s.add('clock', 'Time'))
  }

  private feedback(name: string, initialValue: number, ts: number, expression: string, inputs: string[]): string {
    const prev = this.s.add('unit_delay', `${name}Prev`, { initialValue, sampleInterval: ts })
    const ev = this.s.add('evaluate', name, { numInputs: inputs.length + 1, expression })
    inputs.forEach((id, i) => this.s.wire(id, ev, i))
    this.s.wire(prev, ev, inputs.length)
    this.s.wire(ev, prev)
    return ev
  }

  /** 1 once x has ever exceeded 0.5, else 0. */
  latch(name: string, x: string): string {
    return this.feedback(name, 0, 0, '(in(0) > 0.5 || in(1) > 0.5) ? 1.0 : 0.0', [x])
  }

  /** The time x first exceeded 0.5, held; −1 until then. */
  firstTime(name: string, x: string): string {
    return this.feedback(name, -1, 0, '(in(2) < 0.0 && in(0) > 0.5) ? in(1) : in(2)', [x, this.clock()])
  }

  /** Running maximum of x. */
  runMax(name: string, x: string): string {
    return this.feedback(name, -1e30, 0, 'fmax(in(0), in(1))', [x])
  }

  /** Running minimum of x. */
  runMin(name: string, x: string): string {
    return this.feedback(name, 1e30, 0, 'fmin(in(0), in(1))', [x])
  }

  /** x until time t, then held at its value there. */
  heldAt(name: string, x: string, t: number): string {
    return this.feedback(name, 0, 0, `(in(1) <= ${t}) ? in(0) : in(2)`, [x, this.clock()])
  }

  /** x at the first sample trigger exceeds 0.5, held; 0 until then. */
  heldWhen(name: string, x: string, trigger: string): string {
    const seenPrev = this.s.add('unit_delay', `${name}SeenBefore`, { initialValue: 0, sampleInterval: 0 })
    this.s.wire(this.latch(`${name}Seen`, trigger), seenPrev)
    return this.feedback(name, 0, 0, '(in(1) > 0.5 && in(2) < 0.5) ? in(0) : in(3)', [x, trigger, seenPrev])
  }

  /** Mean of x over the samples (every ts) where gate exceeds 0.5; 0 before any. */
  meanWhile(name: string, x: string, gate: string, ts = 0): string {
    const sum = this.accumulate(`${name}Sum`, gate, ts, 'in(0)', [x])
    const one = this.s.constant(`${name}One`, 1, 'double')
    const count = this.accumulate(`${name}Count`, gate, ts, 'in(0)', [one])
    const out = this.s.add('evaluate', name, { numInputs: 2, expression: '(in(1) > 0.0) ? in(0) / in(1) : 0.0' })
    this.s.wire(sum, out, 0)
    this.s.wire(count, out, 1)
    return out
  }

  /** 1 when the clock is in [t0, t1), else 0. */
  private gate(name: string, t0: number, t1: number): string {
    const g = this.s.add('evaluate', name, { numInputs: 1, expression: `(in(0) >= ${t0} && in(0) < ${t1}) ? 1.0 : 0.0` })
    this.s.wire(this.clock(), g)
    return g
  }

  /** Accumulate term (an expression in in(0)…) while the gate is open, every ts. */
  private accumulate(name: string, gate: string, ts: number, term: string, inputs: string[]): string {
    const n = inputs.length
    return this.feedback(name, 0, ts, `(in(${n}) > 0.5) ? in(${n + 1}) + (${term}) : in(${n + 1})`, [...inputs, gate])
  }

  /** Mean of x² over [t0, t1), sampled every ts; held after t1 (0 before any sample). */
  windowMeanSquare(name: string, x: string, t0: number, t1: number, ts = 0): string {
    const g = this.gate(`${name}Window`, t0, t1)
    const sum = this.accumulate(`${name}Sum`, g, ts, 'in(0) * in(0)', [x])
    const one = this.s.constant(`${name}One`, 1, 'double')
    const count = this.accumulate(`${name}Count`, g, ts, 'in(0)', [one])
    const out = this.s.add('evaluate', name, { numInputs: 2, expression: '(in(1) > 0.0) ? in(0) / in(1) : 0.0' })
    this.s.wire(sum, out, 0)
    this.s.wire(count, out, 1)
    return out
  }

  /**
   * Normalised correlation of x with x delayed by `lag` samples of ts, over
   * [t0, t1): Σ x·x₋ / √(Σ x² · Σ x₋²). Held after t1.
   */
  windowCorr(name: string, x: string, lag: number, ts: number, t0: number, t1: number): string {
    let delayed = x
    for (let i = 1; i <= lag; i++) {
      const d = this.s.add('unit_delay', `${name}Lag${i}`, { initialValue: 0, sampleInterval: ts })
      this.s.wire(delayed, d)
      delayed = d
    }
    const g = this.gate(`${name}Window`, t0 + lag * ts, t1)
    const sab = this.accumulate(`${name}Sab`, g, ts, 'in(0) * in(1)', [x, delayed])
    const saa = this.accumulate(`${name}Saa`, g, ts, 'in(0) * in(0)', [x])
    const sbb = this.accumulate(`${name}Sbb`, g, ts, 'in(0) * in(0)', [delayed])
    const out = this.s.add('evaluate', name, { numInputs: 3, expression: '(in(1) > 0.0 && in(2) > 0.0) ? in(0) / sqrt(in(1) * in(2)) : 0.0' })
    this.s.wire(sab, out, 0)
    this.s.wire(saa, out, 1)
    this.s.wire(sbb, out, 2)
    return out
  }

  /** 1 once a phase signal has equalled k. */
  phaseVisited(name: string, phase: string, k: number): string {
    const eq = this.s.add('evaluate', `${name}Now`, { numInputs: 1, expression: `(fabs(in(0) - ${k}) < 0.5) ? 1.0 : 0.0` })
    this.s.wire(phase, eq)
    return this.latch(name, eq)
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
const FC_SIZE = { width: 220, height: 180 }
const SENSORS_SIZE = { width: 170, height: 150 }
const FC_OUTPUTS = ['motors', 'setpoint', 'gyro_dps', 'euler_est', 'quat_est', 'heading_deg', 'fc_armed', 'fc_angle_mode', 'fc_airmode', 'home_valid', 'home_distance_m', 'home_bearing_deg', 'fc_mode', 'fc_warnings', 'failsafe_stage', 'alt_est', 'vario_est', 'gps_heading_ok', 'alt_hold_active', 'pos_hold_active', 'rescue_active', 'rescue_phase']

// ---------------------------------------------------------------------------
// Motor / ESC / propeller (one definition, referenced by the other three)

function buildMotorSheet(): SheetBuilder {
  const s = new SheetBuilder('motor', 'Motor')
  const cmd = s.input('cmd', 'double')
  const volts = s.input('voltage', 'double')
  const clamp = s.add('limit', 'CmdLimit', { lowerLimit: 0, upperLimit: 1 })
  s.wire(cmd, clamp)
  // The ESC's speed at a given command scales with supply voltage
  const cmdV = s.add('multiply', 'CmdTimesVoltage', { numInputs: 2 })
  s.wire(clamp, cmdV, 0)
  s.wire(volts, cmdV, 1)
  const omegaCmd = s.add('scale', 'OmegaMax', { gain: OMEGA_MAX / BATTERY.referenceVoltage })
  s.wire(cmdV, omegaCmd)
  // First-order rotor-speed lag: omega / omega_cmd = 1 / (tau s + 1)
  const lag = s.add('transfer_function', 'MotorLag', { numerator: [1], denominator: [FPV.motorTau, 1] })
  s.wire(omegaCmd, lag)
  const sq = s.add('square', 'OmegaSq')
  s.wire(lag, sq)
  const thrust = s.add('scale', 'ThrustCoeff', { gain: FPV.thrustCoeff })
  s.wire(sq, thrust)
  // Rotor angular acceleration, (omega_cmd - omega) / tau: its reaction torque yaws the frame
  const err = s.add('sum', 'SpeedError', { signs: '+-', numInputs: 2 })
  s.wire(omegaCmd, err, 0)
  s.wire(lag, err, 1)
  const accel = s.add('scale', 'InvTau', { gain: 1 / FPV.motorTau })
  s.wire(err, accel)
  // Electrical power drawn: shaft power Q w = kappa T w, over the drive efficiency
  const tw = s.add('multiply', 'ThrustTimesSpeed', { numInputs: 2 })
  s.wire(thrust, tw, 0)
  s.wire(lag, tw, 1)
  const power = s.add('scale', 'ElectricalPower', { gain: FPV.torqueToThrust / FPV.driveEfficiency })
  s.wire(tw, power)
  s.output('omega', lag, 'double')
  s.output('thrust', thrust, 'double')
  s.output('omega_dot', accel, 'double')
  s.output('power', power, 'double')
  return s
}

// ---------------------------------------------------------------------------
// Battery: open-circuit voltage from state of charge, internal resistance

function buildBatterySheet(): SheetBuilder {
  const s = new SheetBuilder('battery', 'Battery')
  const power = s.input('motor_power', 'double[4]')
  const b = BATTERY
  const total = s.add('sum', 'TotalPower', { signs: '+', numInputs: 1 })
  s.wire(power, total)
  // Current from the previous step's terminal voltage (breaks the V-I loop)
  const ocv0 = b.cells * b.ocvPerCell[b.ocvPerCell.length - 1]![1]
  const vPrev = s.add('unit_delay', 'VoltagePrev', { initialValue: ocv0, sampleInterval: 0 })
  const current = s.add('divide', 'Current')
  s.wire(total, current, 0)
  s.wire(vPrev, current, 1)
  const drain = s.add('scale', 'ChargeRate', { gain: -1 / (3600 * b.capacityAh) })
  s.wire(current, drain)
  const soc = s.add('integrator', 'StateOfCharge', { initialValue: b.initialSoc, useLimits: true, lowerLimit: 0, upperLimit: 1 })
  s.wire(drain, soc)
  const ocvCell = s.add('lookup_1d', 'CellOCV', {
    inputValues: b.ocvPerCell.map(p => p[0]),
    outputValues: b.ocvPerCell.map(p => p[1]),
    extrapolation: 'clamp',
  })
  s.wire(soc, ocvCell)
  const v = s.add('evaluate', 'TerminalVoltage', { numInputs: 2, expression: `${b.cells} * in(0) - ${b.resistanceOhm} * in(1)` })
  s.wire(ocvCell, v, 0)
  s.wire(current, v, 1)
  s.wire(v, vPrev)
  // The motors read the previous step's voltage: a segregated subsystem counts
  // as direct feedthrough, so feeding them the current one would close an
  // algebraic loop (motor power -> current -> voltage -> motor speed)
  s.output('voltage', vPrev, 'double')
  s.output('current', current, 'double')
  s.output('soc', soc, 'double')
  return s
}

// ---------------------------------------------------------------------------
// Rigid body: 6-DOF, quaternion attitude

/** Scalar-first quaternion (as a 4x1 column) for ZYX Euler angles in degrees. */
export function eulerToQuat([rollDeg, pitchDeg, yawDeg]: number[]): number[][] {
  const [r, p, y] = [rollDeg!, pitchDeg!, yawDeg!].map(d => (d * Math.PI) / 360)
  const [cr, sr, cp, sp, cy, sy] = [Math.cos(r!), Math.sin(r!), Math.cos(p!), Math.sin(p!), Math.cos(y!), Math.sin(y!)]
  return [[cr * cp * cy + sr * sp * sy], [sr * cp * cy - cr * sp * sy], [cr * sp * cy + sr * cp * sy], [cr * cp * sy - sr * sp * cy]]
}

/** CG height above its resting position: NED z where the vehicle sits on the ground. */
export const GROUND_REST_Z = (0.75 * 9.80665) / ((0.75 * 9.80665) / 0.001)

function buildFrameSheet(
  initialOmega: number[] = [0, 0, 0],
  initialQuat: number[][] = [[1], [0], [0], [0]],
  initialPos: number[] = [0, 0, 0]
): SheetBuilder {
  const s = new SheetBuilder('frame', 'Frame')
  const { mass, inertia, gravity, rotorXY, rotorYawSign, torqueToThrust, linearDrag } = FPV
  const T = s.input('thrust', 'double[4]')
  const rotorAccel = s.input('rotor_accel', 'double[4]')
  const wind = s.input('wind_ned', 'double[3]')

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
  // Speeding up a rotor takes torque from the frame: M_z = sum(s_i J_r w_dot_i),
  // with the same sign as that rotor's drag torque
  const Bi = s.constant('RotorInertiaTorque', [[0, 0, 0, 0], [0, 0, 0, 0], rotorYawSign.map(sg => sg * FPV.rotorInertia)], 'double[3][4]')
  const mInertia = s.add('matrix_multiply', 'RotorReactionMoment')
  s.wire(Bi, mInertia, 0)
  s.wire(rotorAccel, mInertia, 1)

  // Attitude. Numerical integration does not preserve |q| = 1 exactly, so the
  // quaternion is renormalized: everything downstream uses q_n = q/|q|, and
  // q_dot pulls the state back to unit norm.
  const q = s.add('integrator', 'q', { initialValue: initialQuat })
  const qNorm = s.add('mag', 'qNorm')
  s.wire(q, qNorm)
  const qn = s.add('divide', 'q_n')
  s.wire(q, qn, 0)
  s.wire(qNorm, qn, 1)
  const Cbn = s.add('orientation_conversion', 'C_bn', { conversionType: 'quat_to_dcm' })
  s.wire(qn, Cbn)
  const Cnb = s.add('transpose', 'C_nb')
  s.wire(Cbn, Cnb)

  // Translation: body-axis linear drag on the velocity through the air
  // (ground velocity minus wind), rotate to NED, add gravity
  const vNed = s.add('integrator', 'v_ned', { initialValue: [0, 0, 0] })
  const vAir = s.add('sum', 'v_air', { signs: '+-', numInputs: 2 })
  s.wire(vNed, vAir, 0)
  s.wire(wind, vAir, 1)
  const vBody = s.add('matrix_multiply', 'v_body')
  s.wire(Cbn, vBody, 0)
  s.wire(vAir, vBody, 1)
  const kd = s.constant('DragCoeff', linearDrag.map(k => -k), 'double[3]')
  const fDrag = s.add('multiply', 'DragForce', { numInputs: 2 })
  s.wire(vBody, fDrag, 0)
  s.wire(kd, fDrag, 1)
  const fBody = s.add('sum', 'F_body', { signs: '+++', numInputs: 3 })
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
  const pNed = s.add('integrator', 'p_ned', { initialValue: initialPos })
  s.wire(vNed, pNed)

  // Ground contact (field plane at z = −elevationM): pushes up, never pulls;
  // friction on horizontal motion; enters F_body so the accelerometer feels it too.
  // Penetration is how far z is below the plane (positive down).
  const gc = FPV.ground
  const penetration = `(in(0) - (${-LOCATION.elevationM}))`
  const pos = s.add('demux', 'PosSplit', { outputCount: 3, inputDimensions: [3] })
  s.wire(pNed, pos)
  const vel = s.add('demux', 'VelSplit', { outputCount: 3, inputDimensions: [3] })
  s.wire(vNed, vel)
  const fGround = s.add('mux', 'GroundForceNED', { rows: 3, cols: 1, baseType: 'double', outputType: 'double[3]' })
  ;['GroundFrictionN', 'GroundFrictionE'].forEach((name, k) => {
    const f = s.add('evaluate', name, { numInputs: 2, expression: `(${penetration} > 0.0) ? ${-gc.friction} * in(1) : 0.0` })
    s.wire(pos, f, 0, 2)
    s.wire(vel, f, 1, k)
    s.wire(f, fGround, k)
  })
  const fN = s.add('evaluate', 'GroundNormal', {
    numInputs: 2,
    expression: `(${penetration} > 0.0) ? fmin(0.0, -(${gc.stiffness} * ${penetration} + ${gc.damping} * in(1))) : 0.0`,
  })
  s.wire(pos, fN, 0, 2)
  s.wire(vel, fN, 1, 2)
  s.wire(fN, fGround, 2)
  const fGroundBody = s.add('matrix_multiply', 'GroundForceBody')
  s.wire(Cbn, fGroundBody, 0)
  s.wire(fGround, fGroundBody, 1)
  s.wire(fGroundBody, fBody, 2)
  const contact = s.add('evaluate', 'OnGround', { numInputs: 1, expression: `(${penetration} > 0.0) ? 1.0 : 0.0` })
  s.wire(pos, contact, 0, 2)
  // Specific force in body axes (what an accelerometer measures)
  const fSpecific = s.add('scale', 'SpecificForce', { gain: 1 / mass })
  s.wire(fBody, fSpecific)

  // Rotation: J w_dot = M - w x (J w)
  const omega = s.add('integrator', 'omega_body', { initialValue: initialOmega })
  const J = s.constant('Inertia', inertia, 'double[3]')
  const Jw = s.add('multiply', 'Jw', { numInputs: 2 })
  s.wire(J, Jw, 0)
  s.wire(omega, Jw, 1)
  const gyro = s.add('cross', 'GyroTorque')
  s.wire(omega, gyro, 0)
  s.wire(Jw, gyro, 1)
  // Landing legs: right the frame toward level and damp rotation while in contact
  const downRef = s.constant('DownNED', [0, 0, 1], 'double[3]')
  const downBody = s.add('matrix_multiply', 'DownInBody')
  s.wire(Cbn, downBody, 0)
  s.wire(downRef, downBody, 1)
  const bodyZ = s.constant('BodyZ', [0, 0, 1], 'double[3]')
  const tilt = s.add('cross', 'Tilt')
  s.wire(downBody, tilt, 0)
  s.wire(bodyZ, tilt, 1)
  const kTilt = s.constant('LegStiffness', [-gc.tiltStiffness, -gc.tiltStiffness, 0], 'double[3]')
  const mSpring = s.add('multiply', 'LegSpringMoment', { numInputs: 2 })
  s.wire(kTilt, mSpring, 0)
  s.wire(tilt, mSpring, 1)
  const cTilt = s.constant('LegDamping', [-gc.tiltDamping, -gc.tiltDamping, -gc.yawDamping], 'double[3]')
  const mDamp = s.add('multiply', 'LegDampingMoment', { numInputs: 2 })
  s.wire(cTilt, mDamp, 0)
  s.wire(omega, mDamp, 1)
  const mLegs = s.add('sum', 'LegMoment', { signs: '++', numInputs: 2 })
  s.wire(mSpring, mLegs, 0)
  s.wire(mDamp, mLegs, 1)
  const mGround = s.add('multiply', 'GroundMoment', { numInputs: 2 })
  s.wire(mLegs, mGround, 0)
  s.wire(contact, mGround, 1)

  const mNet = s.add('sum', 'M_net', { signs: '+-++', numInputs: 4 })
  s.wire(mRotor, mNet, 0)
  s.wire(gyro, mNet, 1)
  s.wire(mInertia, mNet, 2)
  s.wire(mGround, mNet, 3)
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
// Pilot: scripted sticks [roll, pitch, yaw, throttle]

function buildPilotSheet(sticks: StickProfile): SheetBuilder {
  const s = new SheetBuilder('pilot', 'Pilot')
  const clock = s.add('clock', 'Time')
  const mux = s.add('mux', 'Sticks', { rows: 8, cols: 1, baseType: 'double', outputType: 'double[8]' })
  const axes: Array<[keyof StickProfile, string]> = [['roll', 'RollStick'], ['pitch', 'PitchStick'], ['yaw', 'YawStick'], ['throttle', 'ThrottleStick'], ['aux', 'AngleModeSwitch'], ['arm', 'ArmSwitch'], ['rescue', 'RescueSwitch'], ['hold', 'HoldSwitch']]
  axes.forEach(([axis, name], i) => {
    const raw = sticks[axis] ?? [[0, axis === 'arm' ? 1 : 0]]
    const pts = raw.length > 1 ? raw : [raw[0]!, [raw[0]![0] + 1, raw[0]![1]] as [number, number]]
    const lut = s.add('lookup_1d', name, {
      inputValues: pts.map(p => p[0]),
      outputValues: pts.map(p => p[1]),
      extrapolation: 'clamp',
    })
    s.wire(clock, lut)
    s.wire(lut, mux, i)
  })
  s.output('sticks', mux, 'double[8]')
  return s
}

/** A scheduled value: a constant, or a clamped lookup on the clock. */
function scheduled(s: SheetBuilder, clock: () => string, name: string, sched: Schedule): string {
  if (typeof sched === 'number') return s.constant(name, sched, 'double')
  const pts = sched.length > 1 ? sched : [sched[0]!, [sched[0]![0] + 1, sched[0]![1]] as [number, number]]
  const lut = s.add('lookup_1d', name, {
    inputValues: pts.map(p => p[0]),
    outputValues: pts.map(p => p[1]),
    extrapolation: 'clamp',
  })
  s.wire(clock(), lut)
  return lut
}

/** Conditions: the vehicle's non-pilot inputs, scheduled over time (defaults when not given). */
function buildConditionsSheet(c: ConditionsProfile = {}): SheetBuilder {
  const s = new SheetBuilder('conditions', 'Conditions')
  let clockId: string | null = null
  const clock = () => (clockId ??= s.add('clock', 'Time'))
  const env = { ...DEFAULT_GNSS_ENV, ...(c.gnssEnv ?? {}) }
  const mux = s.add('mux', 'GnssEnv', { rows: 4, cols: 1, baseType: 'double', outputType: 'double[4]' })
  ;([['satellites', 'Satellites'], ['hdop', 'HDOP'], ['vdop', 'VDOP'], ['uereScale', 'UereScale']] as const).forEach(([key, name], i) => {
    s.wire(scheduled(s, clock, name, env[key]), mux, i)
  })
  s.output('gnss_env', mux, 'double[4]')
  const gamma = scheduled(s, clock, 'GridConvergence', c.gridConvergenceDeg ?? LOCATION.gridConvergenceDeg)
  s.output('grid_convergence_deg', gamma, 'double')
  s.output('rc_link_valid', scheduled(s, clock, 'RcLinkValid', c.rcLinkValid ?? 1), 'double')
  s.output('failsafe_procedure', scheduled(s, clock, 'FailsafeProcedure', c.failsafeProcedure ?? FAILSAFE_PROCEDURE.gpsRescue), 'double')
  const wind = s.add('mux', 'Wind', { rows: 3, cols: 1, baseType: 'double', outputType: 'double[3]' })
  ;(['north', 'east', 'down'] as const).forEach((axis, k) => s.wire(scheduled(s, clock, `Wind${axis[0]!.toUpperCase()}${axis.slice(1)}`, c.wind?.[axis] ?? 0), wind, k))
  s.output('wind_ned', wind, 'double[3]')
  return s
}


// ---------------------------------------------------------------------------
// Sensors (read the true plant state; ideal = no noise, bias or quantization)

function noise(s: SheetBuilder, name: string, width: number, params: Record<string, unknown>): string {
  return s.add('random_noise', name, { distribution: 'gaussian', mean: 0, sampleTime: 0, dataType: width > 1 ? `double[${width}]` : 'double', ...params })
}

/** y = clamp(quantize(x + bias + noise)), or y = x when ideal. */
function corrupt(
  s: SheetBuilder,
  prefix: string,
  x: string,
  width: number,
  opts: { bias?: number[]; noise: Record<string, unknown>; lsb: number; range?: number },
  ideal: boolean
): string {
  if (ideal) return x
  const parts = [x]
  if (opts.bias) parts.push(s.constant(`${prefix}Bias`, opts.bias, `double[${width}]`))
  parts.push(noise(s, `${prefix}Noise`, width, opts.noise))
  const sum = s.add('sum', `${prefix}Sum`, { signs: '+'.repeat(parts.length), numInputs: parts.length })
  parts.forEach((id, i) => s.wire(id, sum, i))
  const q = s.add('quantizer', `${prefix}Quantize`, { quantum: opts.lsb })
  s.wire(sum, q)
  if (opts.range === undefined) return q
  const lim = s.add('limit', `${prefix}Range`, { lowerLimit: -opts.range, upperLimit: opts.range })
  s.wire(q, lim)
  return lim
}

function buildImuSheet(ideal: boolean): SheetBuilder {
  const s = new SheetBuilder('imu', 'IMU')
  const w = s.input('omega', 'double[3]')
  const f = s.input('specific_force', 'double[3]')
  const g = SENSORS.gyro, a = SENSORS.accel
  const gyro = corrupt(s, 'Gyro', w, 3, { bias: g.bias, noise: { amplitudeMode: 'density', noiseDensity: g.density, seed: g.seed }, lsb: g.lsb, range: g.range }, ideal)
  const acc = corrupt(s, 'Accel', f, 3, { bias: a.bias, noise: { amplitudeMode: 'density', noiseDensity: a.density, seed: a.seed }, lsb: a.lsb, range: a.range }, ideal)
  s.output('gyro', gyro, 'double[3]')
  s.output('accel', acc, 'double[3]')
  return s
}

/**
 * Rotate a NED vector between true north and grid north by the grid
 * convergence γ (deg, grid north east of true north is positive):
 * true→grid  N_g = N cos γ + E sin γ,  E_g = −N sin γ + E cos γ;
 * grid→true  the inverse. Down is unchanged. At γ = 0 the result is exact.
 */
function rotateNorthEast(s: SheetBuilder, name: string, vec: string, gammaDeg: string, toGrid: boolean): string {
  const split = s.add('demux', `${name}Split`, { outputCount: 3, inputDimensions: [3] })
  s.wire(vec, split)
  const r = `(${Math.PI / 180} * in(2))`
  // in(0) N, in(1) E, in(2) γ
  const [nExpr, eExpr] = toGrid
    ? [`in(0) * cos(${r}) + in(1) * sin(${r})`, `-in(0) * sin(${r}) + in(1) * cos(${r})`]
    : [`in(0) * cos(${r}) - in(1) * sin(${r})`, `in(0) * sin(${r}) + in(1) * cos(${r})`]
  const n = s.add('evaluate', `${name}N`, { numInputs: 3, expression: nExpr })
  const e = s.add('evaluate', `${name}E`, { numInputs: 3, expression: eExpr })
  for (const ev of [n, e]) {
    s.wire(split, ev, 0, 0)
    s.wire(split, ev, 1, 1)
    s.wire(gammaDeg, ev, 2)
  }
  const out = s.add('mux', name, { rows: 3, cols: 1, baseType: 'double', outputType: 'double[3]' })
  s.wire(n, out, 0)
  s.wire(e, out, 1)
  s.wire(split, out, 2, 2)
  return out
}

function buildMagSheet(ideal: boolean): SheetBuilder {
  const s = new SheetBuilder('magn', 'Magnetometer')
  const q = s.input('quat', 'double[4][1]')
  const gamma = s.input('grid_convergence_deg', 'double')
  const m = SENSORS.mag
  const cbn = s.add('orientation_conversion', 'C_bn', { conversionType: 'quat_to_dcm' })
  s.wire(q, cbn)
  // The WMM field is in true NED; the vehicle's frame is grid NED
  const fieldTrue = s.constant('EarthField', m.field, 'double[3]')
  const field = rotateNorthEast(s, 'EarthFieldGrid', fieldTrue, gamma, true)
  const body = s.add('matrix_multiply', 'FieldInBody')
  s.wire(cbn, body, 0)
  s.wire(field, body, 1)
  const out = corrupt(s, 'Mag', body, 3, { bias: m.hardIron, noise: { stdDev: m.noise, seed: m.seed }, lsb: m.lsb }, ideal)
  s.output('mag', out, 'double[3]')
  return s
}

function buildBaroSheet(ideal: boolean, altitude0: number): SheetBuilder {
  const s = new SheetBuilder('baro', 'Barometer')
  const pos = s.input('pos_ned', 'double[3]')
  const b = SENSORS.baro
  const down = s.add('selector', 'Down', { indices: [2] })
  s.wire(pos, down)
  // Geometric altitude above MSL. z = 0 is 0 m MSL, so this is −down.
  const alt = s.add('evaluate', 'AltitudeMSL', { numInputs: 1, expression: `${b.homeAltitude} - in(0)` })
  s.wire(down, alt)
  const atm = s.add('atmosphere', 'Atmosphere', { model: 'coesa1976', extrapolation: 'clamp' })
  s.wire(alt, atm)
  const p = atm
  const pPort = 2 // Atmosphere outputs: T, a, P, rho
  if (ideal) {
    s.output('pressure', p, 'double', pPort)
    return s
  }
  const n = noise(s, 'BaroNoise', 1, { stdDev: b.noise, seed: b.seed })
  const sum = s.add('sum', 'BaroSum', { signs: '++', numInputs: 2 })
  s.wire(p, sum, 0, pPort)
  s.wire(n, sum, 1)
  // First-order lag y += a (u - y), starting at the home pressure so the
  // sensor does not power up reading vacuum
  const a = b.ts / (b.lag + b.ts)
  const prev = s.add('unit_delay', 'BaroPrev', { initialValue: Number(standardPressure(LOCATION.elevationM + altitude0).toFixed(3)), sampleInterval: b.ts })
  const lag = s.add('evaluate', 'BaroLag', { numInputs: 2, expression: `in(1) + ${a} * (in(0) - in(1))` })
  s.wire(sum, lag, 0)
  s.wire(prev, lag, 1)
  s.wire(lag, prev)
  s.output('pressure', lag, 'double')
  return s
}

/**
 * GNSS receiver at 10 Hz (docs/fpv-hud-gnss-plan.md, Phase 3). Truth comes in
 * on the grid frame; the fix is reported as grid north/east metres and MSL
 * altitude, velocity in true NED, with fix type, satellites, pDOP, and a
 * VTG-style course computed from the receiver's own velocity.
 */
function buildGnssSheet(ideal: boolean, altitude0: number): SheetBuilder {
  const g = SENSORS.gnss
  const s = new SheetBuilder('gnss', 'GNSS')
  const pos = s.input('pos_ned', 'double[3]')
  const vel = s.input('vel_ned', 'double[3]')
  const env = s.input('gnss_env', 'double[4]')
  const gamma = s.input('grid_convergence_deg', 'double')
  const R2D = 180 / Math.PI

  const envSplit = s.add('demux', 'EnvSplit', { outputCount: 4, inputDimensions: [4] })
  s.wire(env, envSplit)
  // [0] satellites, [1] HDOP, [2] VDOP, [3] UERE scale
  const posSplit = s.add('demux', 'TruthPos', { outputCount: 3, inputDimensions: [3] })
  s.wire(pos, posSplit)

  // Measured position [n, e, altitude MSL] and velocity (grid frame, before rotation)
  let measPos: string
  let measVelGrid: string
  if (ideal) {
    const alt = s.add('evaluate', 'AltitudeMSL', { numInputs: 1, expression: '-in(0)' })
    s.wire(posSplit, alt, 0, 2)
    measPos = s.add('mux', 'Position', { rows: 3, cols: 1, baseType: 'double', outputType: 'double[3]' })
    s.wire(posSplit, measPos, 0, 0)
    s.wire(posSplit, measPos, 1, 1)
    s.wire(alt, measPos, 2)
    measVelGrid = vel
  } else {
    // Unit-variance Gauss–Markov state per axis: x⁺ = a·x + √(1−a²)·w
    const a = Math.exp(-g.ts / g.tau)
    const b = Math.sqrt(1 - a * a)
    const x0 = builderGaussians(g.seeds.corr, 3).map(v => Number(v.toFixed(6)))
    const gmPrev = s.add('unit_delay', 'GmPrev', { initialValue: x0, sampleInterval: g.ts })
    const gmDecay = s.add('scale', 'GmDecay', { gain: a })
    s.wire(gmPrev, gmDecay)
    const gmDrive = s.add('scale', 'GmDrive', { gain: b })
    s.wire(noise(s, 'GmNoise', 3, { stdDev: 1, seed: g.seeds.corr }), gmDrive)
    const gm = s.add('sum', 'GmState', { signs: '++', numInputs: 2 })
    s.wire(gmDecay, gm, 0)
    s.wire(gmDrive, gm, 1)
    s.wire(gm, gmPrev)
    /** y⁺ = c·y + (1 − c)·u, scaled to unit variance for an input u that is a unit-variance AR(1) with coefficient a */
    const smooth = (name: string, u: string, a: number, c: number, init: number[]) => {
      const k = 1 / Math.sqrt(lpfVariance(a, c))
      const prev = s.add('unit_delay', `${name}Prev`, { initialValue: init.map(v => Number((v / k).toFixed(6))), sampleInterval: g.ts })
      const decay = s.add('scale', `${name}Decay`, { gain: c })
      s.wire(prev, decay)
      const drive = s.add('scale', `${name}Drive`, { gain: 1 - c })
      s.wire(u, drive)
      const y = s.add('sum', name, { signs: '++', numInputs: 2 })
      s.wire(decay, y, 0)
      s.wire(drive, y, 1)
      s.wire(y, prev)
      const out = s.add('scale', `${name}Unit`, { gain: k })
      s.wire(y, out)
      return out
    }
    // Slow: the Gauss–Markov state through a second pole (smooth, still unit variance and 60 s correlated)
    const gmSplit = s.add('demux', 'GmSplit', { outputCount: 3, inputDimensions: [3] })
    s.wire(smooth('GmSmooth', gm, a, Math.exp(-g.ts / g.smoothTau), x0), gmSplit)
    // Fast: the receiver's navigation-filter residual, unit noise through two poles at fastTau
    const d = Math.exp(-g.ts / g.fastTau)
    const fastPrev = s.add('unit_delay', 'FastPrev', { initialValue: [0, 0, 0], sampleInterval: g.ts })
    const fastDecay = s.add('scale', 'FastDecay', { gain: d })
    s.wire(fastPrev, fastDecay)
    const fastDrive = s.add('scale', 'FastDrive', { gain: Math.sqrt(1 - d * d) })
    s.wire(noise(s, 'PosNoise', 3, { stdDev: 1, seed: g.seeds.fast }), fastDrive)
    const fast1 = s.add('sum', 'FastState', { signs: '++', numInputs: 2 })
    s.wire(fastDecay, fast1, 0)
    s.wire(fastDrive, fast1, 1)
    s.wire(fast1, fastPrev)
    const fastSplit = s.add('demux', 'FastSplit', { outputCount: 3, inputDimensions: [3] })
    s.wire(smooth('FastSmooth', fast1, d, d, [0, 0, 0]), fastSplit)
    const velNoiseSplit = s.add('demux', 'VelNoiseSplit', { outputCount: 3, inputDimensions: [3] })
    s.wire(noise(s, 'VelNoise', 3, { stdDev: 1, seed: g.seeds.vel }), velNoiseSplit)

    // Position: truth + (corr·slow + fast·residual)·DOP·scale per axis; altitude = −(d + e_d)
    const posOut = s.add('mux', 'PositionRaw', { rows: 3, cols: 1, baseType: 'double', outputType: 'double[3]' })
    ;(['North', 'East', 'Down'] as const).forEach((axis, k) => {
      const vertical = k === 2
      const corr = vertical ? g.uere.vCorr : g.uere.hCorr
      const fast = vertical ? g.uere.vFast : g.uere.hFast
      // in(0) truth, in(1) slow state, in(2) fast state, in(3) DOP, in(4) scale
      const expr = `(${corr} * in(1) + ${fast} * in(2)) * in(3) * in(4)`
      const ev = s.add('evaluate', `Pos${axis}`, { numInputs: 5, expression: vertical ? `-(in(0) + ${expr})` : `in(0) + ${expr}` })
      s.wire(posSplit, ev, 0, k)
      s.wire(gmSplit, ev, 1, k)
      s.wire(fastSplit, ev, 2, k)
      s.wire(envSplit, ev, 3, vertical ? 2 : 1)
      s.wire(envSplit, ev, 4, 3)
      s.wire(ev, posOut, k)
    })
    measPos = s.add('quantizer', 'PositionQuantize', { quantum: g.quantPos })
    s.wire(posOut, measPos)

    // Velocity: truth + white·σ·DOP·scale per axis
    const velSplit = s.add('demux', 'TruthVel', { outputCount: 3, inputDimensions: [3] })
    s.wire(vel, velSplit)
    measVelGrid = s.add('mux', 'VelocityRaw', { rows: 3, cols: 1, baseType: 'double', outputType: 'double[3]' })
    ;(['North', 'East', 'Down'] as const).forEach((axis, k) => {
      const vertical = k === 2
      const ev = s.add('evaluate', `Vel${axis}`, { numInputs: 4, expression: `in(0) + ${vertical ? g.vel.v : g.vel.h} * in(1) * in(2) * in(3)` })
      s.wire(velSplit, ev, 0, k)
      s.wire(velNoiseSplit, ev, 1, k)
      s.wire(envSplit, ev, 2, vertical ? 2 : 1)
      s.wire(envSplit, ev, 3, 3)
      s.wire(ev, measVelGrid, k)
    })
  }
  // Receivers report velocity relative to true north
  let measVel = rotateNorthEast(s, 'VelocityTrue', measVelGrid, gamma, false)
  if (!ideal) {
    const q = s.add('quantizer', 'VelocityQuantize', { quantum: g.quantVel })
    s.wire(measVel, q)
    measVel = q
  }

  // Fix: a counter of samples with the satellite condition met; a lost fix
  // comes back reacquireS after the condition returns (no fix needs N + 1)
  const n = Math.round(g.reacquireS / g.ts)
  const countPrev = s.add('unit_delay', 'FixCountPrev', { initialValue: n + 1, sampleInterval: g.ts })
  const count = s.add('evaluate', 'FixCount', { numInputs: 3, expression: `(in(0) >= 3.0 && in(1) > 0.0) ? fmin(in(2) + 1.0, ${n + 1}.0) : 0.0` })
  s.wire(envSplit, count, 0, 0)
  s.wire(envSplit, count, 1, 1)
  s.wire(countPrev, count, 2)
  s.wire(count, countPrev)
  const fix = s.add('evaluate', 'FixType', { numInputs: 2, expression: `(in(1) > ${n}.0) ? ((in(0) >= 4.0) ? 3.0 : 2.0) : 0.0` })
  s.wire(envSplit, fix, 0, 0)
  s.wire(count, fix, 1)

  // Hold: [n, e, alt, vn, ve, vd]. 3D: new; 2D: altitude held, vd = 0; none: all held
  const msl0 = altitude0 > 0 ? LOCATION.elevationM + altitude0 : LOCATION.elevationM - GROUND_REST_Z
  const holdPrev = s.add('unit_delay', 'HoldPrev', { initialValue: [0, 0, Number(msl0.toFixed(6)), 0, 0, 0], sampleInterval: g.ts })
  const prevSplit = s.add('demux', 'HoldSplit', { outputCount: 6, inputDimensions: [6] })
  s.wire(holdPrev, prevSplit)
  const newPos = s.add('demux', 'NewPos', { outputCount: 3, inputDimensions: [3] })
  s.wire(measPos, newPos)
  const newVel = s.add('demux', 'NewVel', { outputCount: 3, inputDimensions: [3] })
  s.wire(measVel, newVel)
  const held = s.add('mux', 'Held', { rows: 6, cols: 1, baseType: 'double', outputType: 'double[6]' })
  const fields = ['N', 'E', 'Alt', 'VN', 'VE', 'VD']
  fields.forEach((f, k) => {
    // in(0) new, in(1) previous, in(2) fix type
    const expr =
      f === 'Alt' ? '(in(2) > 2.5) ? in(0) : in(1)'
      : f === 'VD' ? '(in(2) > 2.5) ? in(0) : ((in(2) > 1.5) ? 0.0 : in(1))'
      : '(in(2) > 1.5) ? in(0) : in(1)'
    const ev = s.add('evaluate', `Hold${f}`, { numInputs: 3, expression: expr })
    if (k < 3) s.wire(newPos, ev, 0, k)
    else s.wire(newVel, ev, 0, k - 3)
    s.wire(prevSplit, ev, 1, k)
    s.wire(fix, ev, 2)
    s.wire(ev, held, k)
  })
  s.wire(held, holdPrev)
  const heldSplit = s.add('demux', 'HeldSplit', { outputCount: 6, inputDimensions: [6] })
  s.wire(held, heldSplit)
  const posOutput = s.add('mux', 'GnssPos', { rows: 3, cols: 1, baseType: 'double', outputType: 'double[3]' })
  const velOutput = s.add('mux', 'GnssVel', { rows: 3, cols: 1, baseType: 'double', outputType: 'double[3]' })
  for (let k = 0; k < 3; k++) {
    s.wire(heldSplit, posOutput, k, k)
    s.wire(heldSplit, velOutput, k, k + 3)
  }

  // [fix type, satellites, pDOP]
  const pdop = s.add('evaluate', 'PDOP', { numInputs: 2, expression: 'sqrt(in(0) * in(0) + in(1) * in(1))' })
  s.wire(envSplit, pdop, 0, 1)
  s.wire(envSplit, pdop, 1, 2)
  const fixOut = s.add('mux', 'GnssFix', { rows: 3, cols: 1, baseType: 'double', outputType: 'double[3]' })
  s.wire(fix, fixOut, 0)
  s.wire(envSplit, fixOut, 1, 0)
  s.wire(pdop, fixOut, 2)

  // Course (VTG) from the reported velocity: track true/magnetic, ground speed, valid
  const speed = s.add('evaluate', 'GroundSpeed', { numInputs: 2, expression: 'sqrt(in(0) * in(0) + in(1) * in(1))' })
  s.wire(heldSplit, speed, 0, 3)
  s.wire(heldSplit, speed, 1, 4)
  const valid = s.add('evaluate', 'TrackValid', { numInputs: 2, expression: `(in(0) > 0.5 && in(1) >= ${g.trackMinSpeed}) ? 1.0 : 0.0` })
  s.wire(fix, valid, 0)
  s.wire(speed, valid, 1)
  const trackPrev = s.add('unit_delay', 'TrackPrev', { initialValue: 0, sampleInterval: g.ts })
  const track = s.add('evaluate', 'TrackTrue', { numInputs: 4, expression: `(in(2) > 0.5) ? fmod(atan2(in(1), in(0)) * ${R2D} + 360.0, 360.0) : in(3)` })
  s.wire(heldSplit, track, 0, 3)
  s.wire(heldSplit, track, 1, 4)
  s.wire(valid, track, 2)
  s.wire(trackPrev, track, 3)
  s.wire(track, trackPrev)
  const trackMag = s.add('evaluate', 'TrackMagnetic', { numInputs: 1, expression: `fmod(in(0) - ${SITE_FIELD.declinationDeg} + 360.0, 360.0)` })
  s.wire(track, trackMag)
  const course = s.add('mux', 'GnssCourse', { rows: 4, cols: 1, baseType: 'double', outputType: 'double[4]' })
  s.wire(track, course, 0)
  s.wire(trackMag, course, 1)
  s.wire(speed, course, 2)
  s.wire(valid, course, 3)

  s.output('gnss_pos', posOutput, 'double[3]')
  s.output('gnss_vel_ned', velOutput, 'double[3]')
  s.output('gnss_fix', fixOut, 'double[3]')
  s.output('gnss_course', course, 'double[4]')
  return s
}

function buildSensorsSheet(ideal: boolean, altitude0: number, magnetometer = true): SheetBuilder {
  const s = new SheetBuilder('sensors', 'Sensors')
  const pos = s.input('pos_ned', 'double[3]')
  const quat = s.input('quat', 'double[4][1]')
  const omega = s.input('omega', 'double[3]')
  const force = s.input('specific_force', 'double[3]')
  const gamma = s.input('grid_convergence_deg', 'double')
  const vel = s.input('vel_ned', 'double[3]')
  const env = s.input('gnss_env', 'double[4]')
  const imu = s.add('subsystem', 'IMU', { ...subsystem(['omega', 'specific_force'], ['gyro', 'accel'], buildImuSheet(ideal)), sampleTimeSec: SENSORS.imu.ts })
  s.wire(omega, imu, 0)
  s.wire(force, imu, 1)
  // Without a magnetometer the output reads 0 (the estimator does not use it)
  let mag: string
  if (magnetometer) {
    mag = s.add('subsystem', 'Magnetometer', { ...subsystem(['quat', 'grid_convergence_deg'], ['mag'], buildMagSheet(ideal)), sampleTimeSec: SENSORS.mag.ts })
    s.wire(quat, mag, 0)
    s.wire(gamma, mag, 1)
  } else {
    mag = s.constant('NoMagnetometer', [0, 0, 0], 'double[3]')
  }
  const baro = s.add('subsystem', 'Barometer', { ...subsystem(['pos_ned'], ['pressure'], buildBaroSheet(ideal, altitude0)), sampleTimeSec: SENSORS.baro.ts })
  s.wire(pos, baro)
  s.output('gyro', imu, 'double[3]', 0)
  s.output('accel', imu, 'double[3]', 1)
  s.output('mag', mag, 'double[3]')
  s.output('pressure', baro, 'double')
  const gnss = s.add('subsystem', 'GNSS', {
    ...subsystem(['pos_ned', 'vel_ned', 'gnss_env', 'grid_convergence_deg'], GNSS_OUTPUTS, buildGnssSheet(ideal, altitude0)),
    sampleTimeSec: SENSORS.gnss.ts,
  })
  s.wire(pos, gnss, 0)
  s.wire(vel, gnss, 1)
  s.wire(env, gnss, 2)
  s.wire(gamma, gnss, 3)
  GNSS_OUTPUTS.forEach((name, k) => s.output(name, gnss, GNSS_OUTPUT_TYPES[k]!, k))
  return s
}

/** The GNSS receiver's outputs (Sensors outputs 4–7, published as vehicle outputs). */
const GNSS_OUTPUTS = ['gnss_pos', 'gnss_vel_ned', 'gnss_fix', 'gnss_course']
const GNSS_OUTPUT_TYPES = ['double[3]', 'double[3]', 'double[3]', 'double[4]']

// ---------------------------------------------------------------------------
// Estimators

/** Normalize a vector or column vector: v / |v|. Returns the unit vector and the magnitude block. */
function normalizeWithNorm(s: SheetBuilder, name: string, v: string): { unit: string; norm: string } {
  const norm = s.add('mag', `${name}Norm`)
  s.wire(v, norm)
  // A zero vector (an ideal accelerometer in free fall) gives a zero unit
  // vector, so no correction, instead of 0/0 = NaN latching into the state.
  // For any non-negligible norm this is the norm itself, bit for bit.
  const safe = s.add('evaluate', `${name}NormSafe`, { numInputs: 1, expression: 'fmax(in(0), 1e-9)' })
  s.wire(norm, safe)
  const unit = s.add('divide', name)
  s.wire(v, unit, 0)
  s.wire(safe, unit, 1)
  return { unit, norm }
}

const normalize = (s: SheetBuilder, name: string, v: string) => normalizeWithNorm(s, name, v).unit

/**
 * Mahony explicit complementary filter (Mahony, Hamel & Pflimlin 2008):
 * w_c = w_gyro + Kp (a x v_a + ((m x v_m) . v_a) v_a), q+ = norm(q + Ts/2 q ⊗ [0, w_c]).
 * The magnetometer correction is projected on the estimated vertical so it
 * only corrects yaw. A multirotor's accelerometer mostly sees thrust along
 * body -z, so tilted flight pulls the estimate toward level; that drift (the
 * familiar FPV horizon drift) is real behaviour, not a modelling error.
 */
function buildAttitudeEstimatorSheet(initialQuat: number[][], magnetometer: boolean): SheetBuilder {
  const s = new SheetBuilder('att', 'AttitudeEstimator')
  const gyro = s.input('gyro', 'double[3]')
  const acc = s.input('accel', 'double[3]')
  const mag = s.input('mag', 'double[3]')
  const gamma = s.input('grid_convergence_deg', 'double')
  const course = s.input('gnss_course', 'double[4]')
  const fix = s.input('gnss_fix', 'double[3]')
  const yawStick = s.input('yaw_stick', 'double')
  const armed = s.input('armed', 'double')
  const magDisable = s.input('mag_disable', 'double')
  const rescueActive = s.input('rescue_active', 'double')
  const rescueCogGain = s.input('rescue_cog_gain', 'double')
  const qPrev = s.add('unit_delay', 'qPrev', { initialValue: initialQuat, sampleInterval: FC.ts })
  const cbn = s.add('orientation_conversion', 'C_bn', { conversionType: 'quat_to_dcm' })
  s.wire(qPrev, cbn)

  // Gravity: the accelerometer measures "up" (specific force opposes gravity)
  const upRef = s.constant('UpNED', [0, 0, -1], 'double[3]')
  const upEst = s.add('matrix_multiply', 'UpEstimated')
  s.wire(cbn, upEst, 0)
  s.wire(upRef, upEst, 1)
  const { unit: upMeas, norm: accNorm } = normalizeWithNorm(s, 'UpMeasured', acc)
  const eAccRaw = s.add('cross', 'AccelError')
  s.wire(upMeas, eAccRaw, 0)
  s.wire(upEst, eAccRaw, 1)
  // As in Betaflight, trust the accelerometer only while it reads about 1 g
  const g = FPV.gravity
  const accOk = s.add('evaluate', 'AccelHealthy', {
    numInputs: 1,
    expression: `(in(0) > ${(0.9 * g).toFixed(5)} && in(0) < ${(1.1 * g).toFixed(5)}) ? 1.0 : 0.0`,
  })
  s.wire(accNorm, accOk)
  const eAcc = s.add('multiply', 'AccelErrorGated', { numInputs: 2 })
  s.wire(eAccRaw, eAcc, 0)
  s.wire(accOk, eAcc, 1)

  // Heading: compare measured and predicted field directions, yaw part only
  const m = SENSORS.mag.field
  const mn = Math.hypot(...m)
  // The reference is the same field in the grid frame, so the estimate's yaw
  // is grid yaw like the true state's (heading_deg adds γ for true heading)
  const fieldRefTrue = s.constant('FieldDirectionNED', m.map(x => x / mn), 'double[3]')
  const fieldRef = rotateNorthEast(s, 'FieldDirectionGrid', fieldRefTrue, gamma, true)
  const fieldEst = s.add('matrix_multiply', 'FieldEstimated')
  s.wire(cbn, fieldEst, 0)
  s.wire(fieldRef, fieldEst, 1)
  const fieldMeas = normalize(s, 'FieldMeasured', mag)
  const eMag = s.add('cross', 'MagError')
  s.wire(fieldMeas, eMag, 0)
  s.wire(fieldEst, eMag, 1)
  const yawPart = s.add('dot', 'MagErrorAlongUp')
  s.wire(eMag, yawPart, 0)
  s.wire(upEst, yawPart, 1)
  const eYaw = s.add('multiply', 'MagYawError', { numInputs: 2 })
  s.wire(upEst, eYaw, 0)
  s.wire(yawPart, eYaw, 1)

  // The magnetometer is used when fitted and not disabled (GPS Rescue's fly-home phase, Phase 12)
  const magUsed = s.add('evaluate', 'MagUsed', { numInputs: 1, expression: `(${magnetometer ? 1 : 0} > 0 && in(0) < 0.5) ? 1.0 : 0.0` })
  s.wire(magDisable, magUsed)
  const eYawUsed = s.add('multiply', 'MagYawErrorUsed', { numInputs: 2 })
  s.wire(eYaw, eYawUsed, 0)
  s.wire(magUsed, eYawUsed, 1)

  // Course over ground (docs/fpv-betaflight-gnss-spec.md §1.2): only without the magnetometer,
  // with a 3D fix and more than 4 satellites. A one-time snap to the course, then a gain schedule.
  const C = ESTIMATOR.cog
  const D2R = Math.PI / 180, R2D = 180 / Math.PI
  const ts = FC.ts
  const crs = s.add('demux', 'CourseSplit', { outputCount: 4, inputDimensions: [4] })
  s.wire(course, crs)
  const fixSplit = s.add('demux', 'FixSplit', { outputCount: 3, inputDimensions: [3] })
  s.wire(fix, fixSplit)
  const eulerPrev = s.add('orientation_conversion', 'EulerPrev', { conversionType: 'quat_to_euler' })
  s.wire(qPrev, eulerPrev)
  const ePrev = s.add('demux', 'EulerPrevSplit', { outputCount: 3, inputDimensions: [3] })
  s.wire(eulerPrev, ePrev)
  const cogAllowed = s.add('evaluate', 'CogAllowed', { numInputs: 3, expression: `(in(0) < 0.5 && in(1) > 2.5 && in(2) > ${C.minSatsExclusive}.0) ? 1.0 : 0.0` })
  s.wire(magUsed, cogAllowed, 0)
  s.wire(fixSplit, cogAllowed, 1, 0)
  s.wire(fixSplit, cogAllowed, 2, 1)
  // The course in the grid frame (rad): true track − γ
  const cogGrid = s.add('evaluate', 'CourseGrid', { numInputs: 2, expression: `(in(0) - in(1)) * ${D2R}` })
  s.wire(crs, cogGrid, 0, 0)
  s.wire(gamma, cogGrid, 1)
  const snapDonePrev = s.add('unit_delay', 'CogSnapDonePrev', { initialValue: 0, sampleInterval: ts })
  // in(0) allowed, in(1) snapped before, in(2) ground speed, in(3) track valid
  const snapNow = s.add('evaluate', 'CogSnapNow', { numInputs: 4, expression: `(in(0) > 0.5 && in(1) < 0.5 && in(2) > ${C.snapSpeed} && in(3) > 0.5) ? 1.0 : 0.0` })
  s.wire(cogAllowed, snapNow, 0)
  s.wire(snapDonePrev, snapNow, 1)
  s.wire(crs, snapNow, 2, 2)
  s.wire(crs, snapNow, 3, 3)
  const snapDone = s.add('evaluate', 'CogSnapDone', { numInputs: 2, expression: 'fmax(in(0), in(1))' })
  s.wire(snapNow, snapDone, 0)
  s.wire(snapDonePrev, snapDone, 1)
  s.wire(snapDone, snapDonePrev)
  // Course error: sin(error) within ±90°, else ±1 (error = course − estimated yaw)
  const courseErr = s.add('evaluate', 'CourseError', {
    numInputs: 2,
    expression: `(fabs(atan2(sin(in(0) - in(1)), cos(in(0) - in(1)))) < ${Math.PI / 2}) ? sin(in(0) - in(1)) : ((atan2(sin(in(0) - in(1)), cos(in(0) - in(1))) > 0.0) ? 1.0 : -1.0)`,
  })
  s.wire(cogGrid, courseErr, 0)
  s.wire(ePrev, courseErr, 1, 2)
  // Gain: speed × yaw stick (negative-peak, released over yawReleaseS) × roll × nose-down pitch
  const speedF = s.add('evaluate', 'CogSpeedFactor', { numInputs: 1, expression: `(in(0) / ${C.speedRef} <= 1.0) ? (in(0) / ${C.speedRef}) * (in(0) / ${C.speedRef}) : fmin(in(0) / ${C.speedRef}, ${C.maxSpeedFactor}.0)` })
  s.wire(crs, speedF, 0, 2)
  const kRel = ts / (C.yawReleaseS + ts)
  const yawPrev = s.add('unit_delay', 'CogYawFactorPrev', { initialValue: 1, sampleInterval: ts })
  const yawF = s.add('evaluate', 'CogYawFactor', { numInputs: 2, expression: `(pow(1.0 - fabs(in(0)), 5.0) < in(1)) ? pow(1.0 - fabs(in(0)), 5.0) : in(1) + ${kRel} * (pow(1.0 - fabs(in(0)), 5.0) - in(1))` })
  s.wire(yawStick, yawF, 0)
  s.wire(yawPrev, yawF, 1)
  s.wire(yawF, yawPrev)
  const attF = s.add('evaluate', 'CogAttitudeFactor', {
    numInputs: 2,
    expression: `((fabs(in(0)) * ${R2D} < ${C.rollLimitDeg}.0) ? (${C.rollLimitDeg}.0 - fabs(in(0)) * ${R2D}) / ${C.rollLimitDeg}.0 : 0.0) * ((in(1) < 0.0) ? -in(1) * ${R2D} / ${C.pitchFullDeg}.0 : 0.0)`,
  })
  s.wire(ePrev, attF, 0, 0)
  s.wire(ePrev, attF, 1, 1)
  // in(0) allowed, in(1) snapped, in(2) speed, in(3) yaw, in(4) attitude, in(5) rescue active, in(6) rescue gain
  // (during GPS Rescue the rescue supplies the gain)
  const gain = s.add('evaluate', 'CogGain', { numInputs: 7, expression: '(in(0) > 0.5 && in(1) > 0.5) ? ((in(5) > 0.5) ? in(6) : in(2) * in(3) * in(4)) : 0.0' })
  s.wire(cogAllowed, gain, 0)
  s.wire(snapDonePrev, gain, 1)
  s.wire(speedF, gain, 2)
  s.wire(yawF, gain, 3)
  s.wire(attF, gain, 4)
  s.wire(rescueActive, gain, 5)
  s.wire(rescueCogGain, gain, 6)
  // Correction about the earth's down axis (in the body: −up), turning the estimate toward the course
  const cogScale = s.add('evaluate', 'CogErrorScale', { numInputs: 2, expression: '-in(0) * in(1)' })
  s.wire(courseErr, cogScale, 0)
  s.wire(gain, cogScale, 1)
  const eCog = s.add('multiply', 'CogError', { numInputs: 2 })
  s.wire(upEst, eCog, 0)
  s.wire(cogScale, eCog, 1)
  // canUseGPSHeading: until established, confidence += max(gain − |error|, 0)·dt, leaking;
  // once above the threshold it latches (imu.c stops updating it) until the next arming
  const armedPrev = s.add('unit_delay', 'ArmedPrev', { initialValue: 0, sampleInterval: ts })
  s.wire(armed, armedPrev)
  const okPrev = s.add('unit_delay', 'GpsHeadingOkPrev', { initialValue: 0, sampleInterval: ts })
  const confPrev = s.add('unit_delay', 'CogConfidencePrev', { initialValue: 0, sampleInterval: ts })
  // in(0) armed, in(1) armed before, in(2) gain, in(3) error, in(4) established before, in(5) confidence before
  const conf = s.add('evaluate', 'CogConfidence', {
    numInputs: 6,
    expression: `(in(0) > 0.5 && in(1) < 0.5) ? 0.0 : ((in(4) > 0.5) ? in(5) : in(5) + ${ts} * (fmax(in(2) - fabs(in(3)), 0.0) - ${C.confidenceLeak} * in(5)))`,
  })
  ;[armed, armedPrev, gain, courseErr, okPrev, confPrev].forEach((x, k2) => s.wire(x, conf, k2))
  s.wire(conf, confPrev)
  const headingOk = s.add('evaluate', 'GpsHeadingOk', {
    numInputs: 4,
    expression: `(in(0) > 0.5 && in(1) < 0.5) ? 0.0 : ((in(2) > 0.5 || in(3) > ${C.confidenceThreshold}) ? 1.0 : 0.0)`,
  })
  ;[armed, armedPrev, okPrev, conf].forEach((x, k2) => s.wire(x, headingOk, k2))
  s.wire(headingOk, okPrev)

  const err = s.add('sum', 'Error', { signs: '+++', numInputs: 3 })
  s.wire(eAcc, err, 0)
  s.wire(eYawUsed, err, 1)
  s.wire(eCog, err, 2)
  const kp = s.add('scale', 'Kp', { gain: ESTIMATOR.mahonyKp })
  s.wire(err, kp)
  const wc = s.add('sum', 'CorrectedRate', { signs: '++', numInputs: 2 })
  s.wire(gyro, wc, 0)
  s.wire(kp, wc, 1)

  const pqr = s.add('demux', 'pqr', { outputCount: 3, inputDimensions: [3] })
  s.wire(wc, pqr)
  const qDot = s.add('body2quaternion_rates', 'q_dot')
  s.wire(qPrev, qDot, 0)
  s.wire(pqr, qDot, 1, 0)
  s.wire(pqr, qDot, 2, 1)
  s.wire(pqr, qDot, 3, 2)
  const step = s.add('scale', 'Ts', { gain: FC.ts })
  s.wire(qDot, step)
  const qSum = s.add('sum', 'qIntegrate', { signs: '++', numInputs: 2 })
  s.wire(qPrev, qSum, 0)
  s.wire(step, qSum, 1)
  const qIntegrated = normalize(s, 'qNormalized', qSum)
  // The snap: keep roll and pitch, take yaw from the course
  const snapEuler = s.add('mux', 'CogSnapEuler', { rows: 3, cols: 1, baseType: 'double', outputType: 'double[3]' })
  s.wire(ePrev, snapEuler, 0, 0)
  s.wire(ePrev, snapEuler, 1, 1)
  s.wire(cogGrid, snapEuler, 2)
  const qSnap = s.add('orientation_conversion', 'CogSnapQuat', { conversionType: 'euler_to_quat' })
  s.wire(snapEuler, qSnap)
  const q = s.add('if', 'q')
  s.wire(qIntegrated, q, 0)
  s.wire(snapNow, q, 1)
  s.wire(qSnap, q, 2)
  s.wire(q, qPrev)

  const euler = s.add('orientation_conversion', 'Euler', { conversionType: 'quat_to_euler' })
  s.wire(q, euler)
  s.output('quat', q, 'double[4][1]')
  s.output('euler', euler, 'double[3]')
  s.output('gps_heading_ok', headingOk, 'double')
  return s
}

/**
 * Altitude estimate after Betaflight 2025.12 (docs/fpv-betaflight-gnss-spec.md
 * §1.1), at 100 Hz. Baro altitude is zeroed by an offset that smooths while
 * disarmed and latches at arming; GPS altitude (3D fix only) is zeroed while
 * disarmed, or against baro when a fix first comes after arming. Armed, the
 * blend trusts GPS 1/pDOP (≤ 0.9), less when the two disagree by over 1 m;
 * disarmed its input is 0. A 3 Hz PT2 gives alt_est, and the derivative
 * through a 1 Hz PT2 gives vario_est. `startArmed` begins armed at altitude0.
 */
function buildAltitudeEstimatorSheet(altitude0: number, startArmed: boolean): SheetBuilder {
  const A = ESTIMATOR.altitude
  const ts = A.ts
  const s = new SheetBuilder('alt', 'AltitudeEstimator')
  const p = s.input('pressure', 'double')
  const gnssPos = s.input('gnss_pos', 'double[3]')
  const gnssFix = s.input('gnss_fix', 'double[3]')
  const armed = s.input('armed', 'double')
  const fixSplit = s.add('demux', 'FixSplit', { outputCount: 3, inputDimensions: [3] })
  s.wire(gnssFix, fixSplit)
  const gpsAlt = s.add('selector', 'GpsAltitude', { indices: [2] })
  s.wire(gnssPos, gpsAlt)
  const fix3 = s.add('evaluate', 'Fix3D', { numInputs: 1, expression: '(in(0) > 2.5) ? 1.0 : 0.0' })
  s.wire(fixSplit, fix3, 0, 0)
  /** prev → Evaluate([inputs…, prev]) → prev */
  const state = (name: string, init: number, expression: string, inputs: string[]) => {
    const prev = s.add('unit_delay', `${name}Prev`, { initialValue: init, sampleInterval: ts })
    const ev = s.add('evaluate', name, { numInputs: inputs.length + 1, expression })
    inputs.forEach((x, k) => s.wire(x, ev, k))
    s.wire(prev, ev, inputs.length)
    s.wire(ev, prev)
    return ev
  }

  // Baro: Betaflight's pressure altitude, zeroed by a smoothed offset latched at arming
  const baro = s.add('evaluate', 'BaroAltitude', { numInputs: 1, expression: `(1.0 - pow(in(0) / 101325.0, 0.190295)) * 44330.0` })
  s.wire(p, baro)
  const off0 = betaflightBaroAltitude(standardPressure(LOCATION.elevationM + altitude0))
  const baroOff = state('BaroOffset', Number(off0.toFixed(6)), `(in(1) > 0.5) ? in(2) : ${A.zeroSmoothing} * in(0) + ${1 - A.zeroSmoothing} * in(2)`, [baro, armed])
  const baroRel = s.add('evaluate', 'BaroRelative', { numInputs: 2, expression: 'in(0) - in(1)' })
  s.wire(baro, baroRel, 0)
  s.wire(baroOff, baroRel, 1)

  // GPS zero: tracked while disarmed with a fix; after an arming without one, set against baro at the first fix
  // in(0) GPS altitude, in(1) 3D fix, in(2) armed, in(3) baro relative, in(4) zero valid before, in(5) zero before
  const zeroValidPrev = s.add('unit_delay', 'GpsZeroValidPrev', { initialValue: 0, sampleInterval: ts })
  const zero = state('GpsZero', 0,
    '(in(1) > 0.5 && in(2) < 0.5) ? in(0) : ((in(1) > 0.5 && in(2) > 0.5 && in(4) < 0.5) ? in(0) - in(3) : in(5))',
    [gpsAlt, fix3, armed, baroRel, zeroValidPrev])
  const zeroValid = s.add('evaluate', 'GpsZeroValid', { numInputs: 2, expression: 'fmax(in(0), in(1))' })
  s.wire(fix3, zeroValid, 0)
  s.wire(zeroValidPrev, zeroValid, 1)
  s.wire(zeroValid, zeroValidPrev)
  const gpsRel = s.add('evaluate', 'GpsRelative', { numInputs: 2, expression: 'in(0) - in(1)' })
  s.wire(gpsAlt, gpsRel, 0)
  s.wire(zero, gpsRel, 1)

  // Trust: 1/pDOP (≤ cap; fixed without pDOP), divided by the disagreement over 1 m; 0 without a fix
  // in(0) 3D fix, in(1) zero valid, in(2) pDOP, in(3) GPS rel, in(4) baro rel
  const trust = s.add('evaluate', 'GpsTrust', {
    numInputs: 5,
    expression:
      `(in(0) > 0.5 && in(1) > 0.5) ? (fmin((in(2) > 0.0) ? 1.0 / in(2) : ${A.noPdopTrust}, ${A.maxGpsTrust})` +
      ` / fmax(1.0, fabs(in(3) - in(4)) * ${A.preferBaro / 100})) : 0.0`,
  })
  s.wire(fix3, trust, 0)
  s.wire(zeroValid, trust, 1)
  s.wire(fixSplit, trust, 2, 2)
  s.wire(gpsRel, trust, 3)
  s.wire(baroRel, trust, 4)
  // Blend; held at 0 while disarmed, so the estimate reads 0 at arming
  const raw = s.add('evaluate', 'AltitudeBlend', { numInputs: 4, expression: '(in(0) > 0.5) ? in(1) * in(2) + in(3) * (1.0 - in(2)) : 0.0' })
  s.wire(armed, raw, 0)
  s.wire(gpsRel, raw, 1)
  s.wire(trust, raw, 2)
  s.wire(baroRel, raw, 3)

  /** Two cascaded PT1 stages with Betaflight's PT2 cutoff correction. */
  const pt2 = (name: string, x: string, hz: number) => {
    const k = pt2Gain(hz, ts)
    const a = state(`${name}Stage1`, 0, `in(1) + ${k} * (in(0) - in(1))`, [x])
    return state(`${name}Stage2`, 0, `in(1) + ${k} * (in(0) - in(1))`, [a])
  }
  const alt = pt2('AltitudeLpf', raw, A.lpfHz)
  const altPrev = s.add('unit_delay', 'AltitudeLast', { initialValue: 0, sampleInterval: ts })
  s.wire(alt, altPrev)
  const deriv = s.add('evaluate', 'AltitudeRate', { numInputs: 2, expression: `(in(0) - in(1)) / ${ts}` })
  s.wire(alt, deriv, 0)
  s.wire(altPrev, deriv, 1)
  const vario = pt2('VarioLpf', deriv, A.varioLpfHz)
  void startArmed
  s.output('alt_est', alt, 'double')
  s.output('vario_est', vario, 'double')
  return s
}

// ---------------------------------------------------------------------------
// Flight controller (acro), all at FC.ts

/** PT1 low-pass as a discrete transfer function: y[k] = a u[k] + (1 - a) y[k-1]. */
function pt1(s: SheetBuilder, name: string, hz: number): string {
  const a = pt1Gain(hz, FC.ts)
  return s.add('discrete_transform', name, { numerator: [a, 0], denominator: [1, -(1 - a)], sampleInterval: FC.ts })
}

/** Backward difference (u[k] - u[k-1]) / Ts. */
function derivative(s: SheetBuilder, name: string): string {
  return s.add('discrete_transform', name, { numerator: [1, -1], denominator: [FC.ts, 0], sampleInterval: FC.ts })
}

const perAxis = (gains: number[], scale: number) => gains.map(g => g * scale)

function buildRatesSheet(): SheetBuilder {
  const s = new SheetBuilder('rates', 'Rates')
  const sticks = s.input('sticks', 'double[8]')
  const split = s.add('demux', 'StickSplit', { outputCount: 8, inputDimensions: [8] })
  s.wire(sticks, split)
  const setpoint = s.add('mux', 'Setpoint', { rows: 3, cols: 1, baseType: 'double', outputType: 'double[3]' })
  ;['Roll', 'Pitch', 'Yaw'].forEach((axis, i) => {
    const c = FC.rates.center[i]!, m = FC.rates.max[i]!, e = FC.rates.expo[i]!
    // Betaflight "Actual" rates: center*s + max(0, max - center) * |s| * (s^5 e + s (1 - e))
    const expr = `${c} * in(0) + ${Math.max(0, m - c)} * fabs(in(0)) * (pow(in(0), 5) * ${e} + in(0) * ${1 - e})`
    const ev = s.add('evaluate', `${axis}Rate`, { numInputs: 1, expression: expr })
    s.wire(split, ev, 0, i)
    s.wire(ev, setpoint, i)
  })
  s.output('setpoint', setpoint, 'double[3]')
  s.output('throttle', split, 'double', 3)
  return s
}

/**
 * Angle (self-level) mode, after Betaflight's: the roll and pitch sticks set
 * an angle target (full stick = angleLimitDeg) and the rate setpoint becomes
 * gain * (target - estimated angle); yaw keeps the acro rate. The AUX switch
 * selects between this and the acro setpoint.
 */
function buildAngleModeSheet(): SheetBuilder {
  const s = new SheetBuilder('angle', 'AngleMode')
  const sticks = s.input('sticks', 'double[8]')
  const euler = s.input('euler_est', 'double[3]')
  const acro = s.input('acro_setpoint', 'double[3]')
  const posActive = s.input('pos_hold_active', 'double')
  const apInControl = s.input('autopilot_in_control', 'double')
  const apAngle = s.input('autopilot_angle', 'double[2]')
  const apSplit = s.add('demux', 'AutopilotAngleSplit', { outputCount: 2, inputDimensions: [2] })
  s.wire(apAngle, apSplit)
  const rescueAngle = s.input('rescue_angle', 'double[2]')
  const rescueSplit = s.add('demux', 'RescueAngleSplit', { outputCount: 2, inputDimensions: [2] })
  s.wire(rescueAngle, rescueSplit)
  const split = s.add('demux', 'StickSplit', { outputCount: 8, inputDimensions: [8] })
  s.wire(sticks, split)
  const est = s.add('demux', 'AttitudeSplit', { outputCount: 3, inputDimensions: [3] })
  s.wire(euler, est)
  const acroSplit = s.add('demux', 'AcroSplit', { outputCount: 3, inputDimensions: [3] })
  s.wire(acro, acroSplit)
  const level = s.add('mux', 'LevelSetpoint', { rows: 3, cols: 1, baseType: 'double', outputType: 'double[3]' })
  const { limitDeg, gain } = FC.angle
  // Position Hold (pid.c): the autopilot's angle, or the pilot's while the sticks are active,
  // limited to half of ap_max_angle
  const half = 0.5 * FC.posHold.maxAngleDeg
  ;['Roll', 'Pitch'].forEach((axis, i) => {
    // in(0) stick, in(1) estimated angle (rad), in(2) Pos Hold, in(3) autopilot in control, in(4) autopilot angle (deg),
    // in(5) GPS Rescue angle (deg), added to the stick's target as in pid.c
    const target = `((in(2) > 0.5) ? fmin(fmax((in(3) > 0.5) ? in(4) : ${limitDeg} * in(0) + in(5), -${half}), ${half}) : fmin(fmax(${limitDeg} * in(0) + in(5), -${limitDeg}.0), ${limitDeg}.0))`
    const ev = s.add('evaluate', `${axis}Level`, {
      numInputs: 6,
      expression: `${gain} * (${target} - in(1) * ${180 / Math.PI})`,
    })
    s.wire(split, ev, 0, i)
    s.wire(est, ev, 1, i)
    s.wire(posActive, ev, 2)
    s.wire(apInControl, ev, 3)
    s.wire(apSplit, ev, 4, i)
    s.wire(rescueSplit, ev, 5, i)
    s.wire(ev, level, i)
  })
  s.wire(acroSplit, level, 2, 2)
  const on = s.add('evaluate', 'AngleModeOn', { numInputs: 1, expression: 'in(0) > 0.5' })
  s.wire(split, on, 0, 4)
  const select = s.add('if', 'ModeSelect')
  s.wire(acro, select, 0)
  s.wire(on, select, 1)
  s.wire(level, select, 2)
  s.output('setpoint', select, 'double[3]')
  const modeFlag = s.add('evaluate', 'AngleModeFlag', { numInputs: 1, expression: '(in(0) > 0.5) ? 1.0 : 0.0' })
  s.wire(on, modeFlag)
  s.output('angle_mode', modeFlag, 'double')
  return s
}

function buildGyroFilterSheet(): SheetBuilder {
  const s = new SheetBuilder('gyro', 'GyroFilters')
  const gyro = s.input('gyro', 'double[3]')
  const deg = s.add('scale', 'RadToDeg', { gain: 180 / Math.PI })
  s.wire(gyro, deg)
  const lpf1 = pt1(s, 'GyroLPF1', FC.gyroLpfHz[0]!)
  s.wire(deg, lpf1)
  const lpf2 = pt1(s, 'GyroLPF2', FC.gyroLpfHz[1]!)
  s.wire(lpf1, lpf2)
  s.output('gyro_dps', lpf2, 'double[3]')
  return s
}

function buildRatePidSheet(): SheetBuilder {
  const s = new SheetBuilder('pid', 'RatePID')
  const sp = s.input('setpoint', 'double[3]')
  const gyro = s.input('gyro_dps', 'double[3]')

  const err = s.add('sum', 'RateError', { signs: '+-', numInputs: 2 })
  s.wire(sp, err, 0)
  s.wire(gyro, err, 1)

  // I-term relax on roll and pitch: the I error scaled down while the setpoint moves fast
  const R = FC.itermRelax
  const angleMode = s.input('angle_mode', 'double')
  const spLpf = pt1(s, 'ItermRelaxLPF', R.cutoffHz)
  s.wire(sp, spLpf)
  const spSplit = s.add('demux', 'SetpointSplit', { outputCount: 3, inputDimensions: [3] })
  s.wire(sp, spSplit)
  const lpfSplit = s.add('demux', 'SetpointLpfSplit', { outputCount: 3, inputDimensions: [3] })
  s.wire(spLpf, lpfSplit)
  const relax = s.add('mux', 'ItermRelaxFactor', { rows: 3, cols: 1, baseType: 'double', outputType: 'double[3]' })
  for (let k = 0; k < 2; k++) {
    const f = namedEval(s, `ItermRelax${'RP'[k]}`, { sp: [spSplit, k], lpf: [lpfSplit, k], am: angleMode },
      `fmax(0.0, 1.0 - fabs({sp} - {lpf}) / (({am} > 0.5) ? ${R.thresholdDps * R.angleModeFactor} : ${R.thresholdDps}.0))`)
    s.wire(f, relax, k)
  }
  s.wire(s.constant('ItermRelaxYaw', 1, 'double'), relax, 2)
  const iErr = s.add('multiply', 'ItermError', { numInputs: 2 })
  s.wire(err, iErr, 0)
  s.wire(relax, iErr, 1)

  // P
  const kp = s.constant('Kp', perAxis(FC.pid.p, FC.scale.p), 'double[3]')
  const pTerm = s.add('multiply', 'P', { numInputs: 2 })
  s.wire(kp, pTerm, 0)
  s.wire(err, pTerm, 1)

  // I: accumulate Ki * error * Ts, clamped to ±itermLimit
  const ki = s.constant('KiTs', perAxis(FC.pid.i, FC.scale.i * FC.ts), 'double[3]')
  const iInc = s.add('multiply', 'IIncrement', { numInputs: 2 })
  s.wire(ki, iInc, 0)
  s.wire(iErr, iInc, 1)
  const iEnable = s.input('iterm_enable', 'double')
  const iPrev = s.add('unit_delay', 'IPrev', { initialValue: [0, 0, 0], sampleInterval: FC.ts })
  const iSum = s.add('sum', 'IAccumulate', { signs: '++', numInputs: 2 })
  s.wire(iPrev, iSum, 0)
  s.wire(iInc, iSum, 1)
  // Held at zero until airmode starts, so it cannot wind up on the ground
  const iGated = s.add('multiply', 'IReset', { numInputs: 2 })
  s.wire(iSum, iGated, 0)
  s.wire(iEnable, iGated, 1)
  const iTerm = s.add('limit', 'I', { lowerLimit: -FC.itermLimit, upperLimit: FC.itermLimit })
  s.wire(iGated, iTerm)
  s.wire(iTerm, iPrev)

  // D on measurement: filter the gyro, differentiate, -Kd
  const dLpf = pt1(s, 'DtermLPF', FC.dtermLpfHz)
  s.wire(gyro, dLpf)
  const dGyro = derivative(s, 'GyroRateOfChange')
  s.wire(dLpf, dGyro)
  const kd = s.constant('Kd', perAxis(FC.pid.d, -FC.scale.d), 'double[3]')
  const dTerm = s.add('multiply', 'D', { numInputs: 2 })
  s.wire(kd, dTerm, 0)
  s.wire(dGyro, dTerm, 1)

  // Feed-forward on the setpoint rate of change
  const dSp = derivative(s, 'SetpointRateOfChange')
  s.wire(sp, dSp)
  const kff = s.constant('Kff', perAxis(FC.pid.ff, FC.scale.ff), 'double[3]')
  const ffTerm = s.add('multiply', 'FF', { numInputs: 2 })
  s.wire(kff, ffTerm, 0)
  s.wire(dSp, ffTerm, 1)

  const pidSum = s.add('sum', 'PIDSum', { signs: '++++', numInputs: 4 })
  ;[pTerm, iTerm, dTerm, ffTerm].forEach((id, i) => s.wire(id, pidSum, i))
  const hi = s.constant('PIDSumMax', FC.pidSumLimit, 'double[3]')
  const lo = s.constant('PIDSumMin', FC.pidSumLimit.map(v => -v), 'double[3]')
  const sat = s.add('saturation_dynamic', 'PIDSumLimit')
  s.wire(hi, sat, 0)
  s.wire(pidSum, sat, 1)
  s.wire(lo, sat, 2)
  const scaled = s.add('scale', 'MixerScaling', { gain: 1 / FC.mixerScaling })
  s.wire(sat, scaled)
  s.output('pid', scaled, 'double[3]')
  return s
}

function buildMixerSheet(): SheetBuilder {
  const s = new SheetBuilder('mixer', 'Mixer')
  const pid = s.input('pid', 'double[3]')
  const thr = s.input('throttle', 'double')
  const M = s.constant('MixerTable', MIXER, 'double[4][3]')
  const mix = s.add('matrix_multiply', 'MotorMix')
  s.wire(M, mix, 0)
  s.wire(pid, mix, 1)

  // Airmode: scale the mix into range, then shift throttle to keep it there
  const split = s.add('demux', 'MixSplit', { outputCount: 4, inputDimensions: [4] })
  s.wire(mix, split)
  const mixMax = s.add('evaluate', 'MixMax', { numInputs: 4, expression: 'fmax(fmax(in(0), in(1)), fmax(in(2), in(3)))' })
  const mixMin = s.add('evaluate', 'MixMin', { numInputs: 4, expression: 'fmin(fmin(in(0), in(1)), fmin(in(2), in(3)))' })
  for (let i = 0; i < 4; i++) {
    s.wire(split, mixMax, i, i)
    s.wire(split, mixMin, i, i)
  }
  const range = s.add('evaluate', 'MixRange', { numInputs: 2, expression: 'fmax(1.0, in(0) - in(1))' })
  s.wire(mixMax, range, 0)
  s.wire(mixMin, range, 1)
  const mixN = s.add('divide', 'MixNormalized')
  s.wire(mix, mixN, 0)
  s.wire(range, mixN, 1)
  // range > 1: mix was normalized, centre throttle; else keep throttle inside [-min, 1 - max]
  const thrA = s.add('evaluate', 'AirmodeThrottle', {
    numInputs: 4,
    expression: '(in(3) > 1.0) ? 0.5 : fmin(fmax(in(0), -in(2)), 1.0 - in(1))',
  })
  s.wire(thr, thrA, 0)
  s.wire(mixMax, thrA, 1)
  s.wire(mixMin, thrA, 2)
  const rawRange = s.add('evaluate', 'MixSpread', { numInputs: 2, expression: 'in(0) - in(1)' })
  s.wire(mixMax, rawRange, 0)
  s.wire(mixMin, rawRange, 1)
  s.wire(rawRange, thrA, 3)

  const motor = s.add('sum', 'ThrottlePlusMix', { signs: '++', numInputs: 2 })
  s.wire(mixN, motor, 0)
  s.wire(thrA, motor, 1)
  const clamp = s.add('limit', 'MotorRange', { lowerLimit: 0, upperLimit: 1 })
  s.wire(motor, clamp)
  const span = s.add('scale', 'IdleToFull', { gain: 1 - FC.motorIdle })
  s.wire(clamp, span)
  const idle = s.constant('MotorIdle', FC.motorIdle, 'double')
  const out = s.add('sum', 'MotorOutput', { signs: '++', numInputs: 2 })
  s.wire(span, out, 0)
  s.wire(idle, out, 1)
  s.output('motors', out, 'double[4]')
  return s
}

/**
 * Failsafe, after Betaflight (docs/fpv-betaflight-gnss-spec.md §2.1). On link
 * loss the last sticks hold for holdS, then roll/pitch/yaw centre and throttle
 * goes low with the AUX switches held (stage 1); delayS after the loss stage 2
 * runs the failsafe procedure. Stage 1 ends the moment the link returns;
 * stage 2 needs recoveryS of valid link and, except after DROP, a stick moved
 * beyond stickThreshold. DROP disarms at stage 2; AUTO-LAND descends under
 * Altitude Hold and disarms after landingTimeS; GPS-RESCUE runs GPS Rescue.
 */
function buildFailsafeSheet(): SheetBuilder {
  const f = FC.failsafe
  const ts = FC.ts
  const s = new SheetBuilder('failsafe', 'Failsafe')
  const sticks = s.input('sticks', 'double[8]')
  const link = s.input('rc_link_valid', 'double')
  const procedure = s.input('failsafe_procedure', 'double')
  const split = s.add('demux', 'StickSplit', { outputCount: 8, inputDimensions: [8] })
  s.wire(sticks, split)
  const linkOk = s.add('evaluate', 'LinkOk', { numInputs: 1, expression: '(in(0) > 0.5) ? 1.0 : 0.0' })
  s.wire(link, linkOk)
  /** A Unit Delay fed back through an Evaluate of [inputs..., previous]. */
  const state = (name: string, init: number, expression: string, inputs: string[]) => {
    const prev = s.add('unit_delay', `${name}Prev`, { initialValue: init, sampleInterval: ts })
    const ev = s.add('evaluate', name, { numInputs: inputs.length + 1, expression })
    inputs.forEach((x, k) => s.wire(x, ev, k))
    s.wire(prev, ev, inputs.length)
    s.wire(ev, prev)
    return ev
  }
  const lost = state('LostTime', 0, `(in(0) > 0.5) ? 0.0 : in(1) + ${ts}`, [linkOk])
  const valid = state('ValidTime', 0, `(in(0) > 0.5) ? fmin(in(1) + ${ts}, 1000.0) : 0.0`, [linkOk])
  const moved = s.add('evaluate', 'SticksMoved', { numInputs: 3, expression: `(fmax(fabs(in(0)), fmax(fabs(in(1)), fabs(in(2)))) > ${f.stickThreshold}) ? 1.0 : 0.0` })
  for (let k = 0; k < 3; k++) s.wire(split, moved, k, k)
  // Stage 2: entered delayS after the loss; ends after recoveryS of valid link,
  // and (except after DROP) a stick moved beyond the threshold
  const stage2Prev = s.add('unit_delay', 'Stage2Prev', { initialValue: 0, sampleInterval: ts })
  const procPrev = s.add('unit_delay', 'ProcedurePrev', { initialValue: FAILSAFE_PROCEDURE.drop, sampleInterval: ts })
  // in(0) link, in(1) lost, in(2) valid time, in(3) latched procedure, in(4) moved, in(5) stage 2 before
  const stage2 = s.add('evaluate', 'Stage2', {
    numInputs: 6,
    expression:
      `(in(5) > 0.5) ? ((in(2) >= ${f.recoveryS} && (fabs(in(3) - ${FAILSAFE_PROCEDURE.drop}) < 0.5 || in(4) > 0.5)) ? 0.0 : 1.0)` +
      ` : ((in(0) < 0.5 && in(1) >= ${f.delayS - 1e-9}) ? 1.0 : 0.0)`,
  })
  ;[linkOk, lost, valid, procPrev, moved, stage2Prev].forEach((x, k) => s.wire(x, stage2, k))
  s.wire(stage2, stage2Prev)
  // The procedure is read when stage 2 begins
  const procLatched = s.add('evaluate', 'Procedure', { numInputs: 4, expression: '(in(0) > 0.5 && in(1) < 0.5) ? in(2) : in(3)' })
  ;[stage2, stage2Prev, procedure, procPrev].forEach((x, k) => s.wire(x, procLatched, k))
  s.wire(procLatched, procPrev)
  const stage = s.add('evaluate', 'Stage', { numInputs: 2, expression: '(in(1) > 0.5) ? 2.0 : ((in(0) > 0.5) ? 0.0 : 1.0)' })
  s.wire(linkOk, stage, 0)
  s.wire(stage2, stage, 1)
  // Time at low throttle while the link is valid; frozen during a loss
  const lowPrev = s.add('unit_delay', 'ThrottleLowTimePrev', { initialValue: 0, sampleInterval: ts })
  const low = s.add('evaluate', 'ThrottleLowTime', {
    numInputs: 3,
    expression: `(in(0) > 0.5) ? ((in(1) < ${FC.minCheck}) ? fmin(in(2) + ${ts}, 1000.0) : 0.0) : in(2)`,
  })
  s.wire(linkOk, low, 0)
  s.wire(split, low, 1, 3)
  s.wire(lowPrev, low, 2)
  s.wire(low, lowPrev)
  // Time in stage 2 (for AUTO-LAND's landing time)
  const s2TimePrev = s.add('unit_delay', 'Stage2TimePrev', { initialValue: 0, sampleInterval: ts })
  const s2Time = s.add('evaluate', 'Stage2Time', { numInputs: 2, expression: `(in(0) > 0.5) ? fmin(in(1) + ${ts}, 1000.0) : 0.0` })
  s.wire(stage2, s2Time, 0)
  s.wire(s2TimePrev, s2Time, 1)
  s.wire(s2Time, s2TimePrev)
  // Disarm: stage 2 with DROP; AUTO-LAND after its landing
  // time; or a loss after long low throttle with DROP or AUTO-LAND
  const { drop, autoLand, gpsRescue } = FAILSAFE_PROCEDURE
  // in(0) stage 2, in(1) link, in(2) low-throttle time, in(3) live procedure, in(4) latched procedure, in(5) stage-2 time
  const disarm = s.add('evaluate', 'DisarmRequest', {
    numInputs: 6,
    expression:
      `((in(0) > 0.5 && fabs(in(4) - ${drop}) < 0.5)` +
      ` || (in(0) > 0.5 && fabs(in(4) - ${autoLand}) < 0.5 && in(5) >= ${f.landingTimeS - 1e-9})` +
      ` || (in(1) < 0.5 && in(2) > ${f.throttleLowDelayS} && fabs(in(3) - ${gpsRescue}) > 0.5)) ? 1.0 : 0.0`,
  })
  ;[stage2, linkOk, low, procedure, procLatched, s2Time].forEach((x, k) => s.wire(x, disarm, k))
  // Sticks the controller sees: live; held for holdS after a loss; then failsafe values
  const lastPrev = s.add('unit_delay', 'LastValidPrev', { initialValue: [0, 0, 0, 0, 0, 0, 0, 0], sampleInterval: ts })
  const last = s.add('if', 'LastValid')
  s.wire(lastPrev, last, 0)
  s.wire(linkOk, last, 1)
  s.wire(sticks, last, 2)
  s.wire(last, lastPrev)
  const lastSplit = s.add('demux', 'LastSplit', { outputCount: 8, inputDimensions: [8] })
  s.wire(last, lastSplit)
  const fsValues = s.add('mux', 'FailsafeSticks', { rows: 8, cols: 1, baseType: 'double', outputType: 'double[8]' })
  const zero = s.constant('Centre', 0, 'double')
  for (let k = 0; k < 4; k++) s.wire(zero, fsValues, k)
  for (let k = 4; k < 8; k++) s.wire(lastSplit, fsValues, k, k)
  const holding = s.add('evaluate', 'Holding', { numInputs: 1, expression: `(in(0) < ${f.holdS}) ? 1.0 : 0.0` })
  s.wire(lost, holding)
  const lossSticks = s.add('if', 'LossSticks')
  s.wire(fsValues, lossSticks, 0)
  s.wire(holding, lossSticks, 1)
  s.wire(last, lossSticks, 2)
  const out = s.add('if', 'SticksOut')
  s.wire(lossSticks, out, 0)
  s.wire(linkOk, out, 1)
  s.wire(sticks, out, 2)
  s.output('sticks_fs', out, 'double[8]')
  s.output('stage', stage, 'double')
  s.output('disarm_request', disarm, 'double')
  s.output('procedure', procLatched, 'double')
  return s
}

/**
 * Arming, after Betaflight: arms on the arm switch's rising edge when nothing
 * blocks it (throttle low, rescue and hold switches off, the GPS check on the
 * first arming, link valid), and disarms on switch off or a disarm request.
 * After a forced disarm the switch must be cycled. Airmode (and the I-term)
 * starts once throttle first exceeds airmodeStartThrottle after arming, and
 * stays on until disarmed. `startArmed` begins armed (airborne starts).
 */
function buildArmingSheet(startArmed: boolean): SheetBuilder {
  const s = new SheetBuilder('arming', 'Arming')
  const sticks = s.input('sticks', 'double[8]')
  const fix = s.input('gnss_fix', 'double[3]')
  const request = s.input('disarm_request', 'double')
  const link = s.input('rc_link_valid', 'double')
  const split = s.add('demux', 'StickSplit', { outputCount: 8, inputDimensions: [8] })
  s.wire(sticks, split)
  const fixSplit = s.add('demux', 'FixSplit', { outputCount: 3, inputDimensions: [3] })
  s.wire(fix, fixSplit)
  const init = startArmed ? 1 : 0
  const switchPrev = s.add('unit_delay', 'ArmSwitchPrev', { initialValue: init, sampleInterval: FC.ts })
  s.wire(split, switchPrev, 0, 5)
  const everPrev = s.add('unit_delay', 'EverArmedPrev', { initialValue: init, sampleInterval: FC.ts })
  const W = FC_WARNING
  // in(0) throttle, in(1) rescue, in(2) hold, in(3) ever armed, in(4) fix type, in(5) satellites, in(6) link
  const blocks = s.add('evaluate', 'ArmingBlocks', {
    numInputs: 7,
    expression:
      `((in(0) >= ${FC.minCheck}) ? ${W.armThrottle}.0 : 0.0)` +
      ` + ((in(1) > 0.5 || in(2) > 0.25) ? ${W.armModeSwitch}.0 : 0.0)` +
      ` + ((in(3) > 0.5 || ${FC.allowArmingWithoutFix ? 1 : 0} > 0 || (in(4) > 2.5 && in(5) >= ${FC.homeMinSats}.0)) ? 0.0 : ${W.armGps}.0)` +
      ` + ((in(6) > 0.5) ? 0.0 : ${W.armRxLoss}.0)`,
  })
  s.wire(split, blocks, 0, 3)
  s.wire(split, blocks, 1, 6)
  s.wire(split, blocks, 2, 7)
  s.wire(everPrev, blocks, 3)
  s.wire(fixSplit, blocks, 4, 0)
  s.wire(fixSplit, blocks, 5, 1)
  s.wire(link, blocks, 6)
  const armedPrev = s.add('unit_delay', 'ArmedPrev', { initialValue: init, sampleInterval: FC.ts })
  // in(0) switch, in(1) switch before, in(2) blocks, in(3) request, in(4) armed before
  const armed = s.add('evaluate', 'Armed', {
    numInputs: 5,
    expression: '(in(4) > 0.5) ? ((in(0) > 0.5 && in(3) < 0.5) ? 1.0 : 0.0) : ((in(0) > 0.5 && in(1) < 0.5 && in(2) < 0.5 && in(3) < 0.5) ? 1.0 : 0.0)',
  })
  s.wire(split, armed, 0, 5)
  s.wire(switchPrev, armed, 1)
  s.wire(blocks, armed, 2)
  s.wire(request, armed, 3)
  s.wire(armedPrev, armed, 4)
  s.wire(armed, armedPrev)
  const ever = s.add('evaluate', 'EverArmed', { numInputs: 2, expression: 'fmax(in(0), in(1))' })
  s.wire(armed, ever, 0)
  s.wire(everPrev, ever, 1)
  s.wire(ever, everPrev)
  // Warnings while disarmed: the blocks, or "cycle the arm switch" when it is on but nothing else blocks
  const warnings = s.add('evaluate', 'ArmingWarnings', {
    numInputs: 3,
    expression: `(in(0) > 0.5) ? 0.0 : (in(1) + ((in(2) > 0.5 && in(1) < 0.5) ? ${W.armSwitchCycle}.0 : 0.0))`,
  })
  s.wire(armed, warnings, 0)
  s.wire(blocks, warnings, 1)
  s.wire(split, warnings, 2, 5)

  const latchPrev = s.add('unit_delay', 'AirmodePrev', { initialValue: 0, sampleInterval: FC.ts })
  // in(0) armed, in(1) throttle, in(2) latched previously
  const latch = s.add('evaluate', 'AirmodeActive', {
    numInputs: 3,
    expression: `(in(0) > 0.5 && (in(2) > 0.5 || in(1) > ${FC.airmodeStartThrottle})) ? 1.0 : 0.0`,
  })
  s.wire(armed, latch, 0)
  s.wire(split, latch, 1, 3)
  s.wire(latchPrev, latch, 2)
  s.wire(latch, latchPrev)
  s.output('armed', armed, 'double')
  s.output('airmode', latch, 'double')
  s.output('warnings', warnings, 'double')
  return s
}

/**
 * Home, after Betaflight (docs/fpv-betaflight-gnss-spec.md §1.4): latched
 * from the GNSS fix on the arming sample only, with a 3D fix and at least
 * FC.homeMinSats satellites, and cleared on disarm. Distance and bearing
 * update on each new fix (a 10 Hz child aligned with the receiver).
 */
function buildHomeSheet(): SheetBuilder {
  const s = new SheetBuilder('home', 'Home')
  const armed = s.input('armed', 'double')
  const pos = s.input('gnss_pos', 'double[3]')
  const fix = s.input('gnss_fix', 'double[3]')
  const gamma = s.input('grid_convergence_deg', 'double')
  const fixSplit = s.add('demux', 'FixSplit', { outputCount: 3, inputDimensions: [3] })
  s.wire(fix, fixSplit)
  const posSplit = s.add('demux', 'PosSplit', { outputCount: 3, inputDimensions: [3] })
  s.wire(pos, posSplit)

  const armedPrev = s.add('unit_delay', 'ArmedPrev', { initialValue: 0, sampleInterval: FC.ts })
  s.wire(armed, armedPrev)
  // in(0) armed, in(1) armed before, in(2) fix type, in(3) satellites
  const latchNow = s.add('evaluate', 'LatchNow', {
    numInputs: 4,
    expression: `(in(0) > 0.5 && in(1) < 0.5 && in(2) > 2.5 && in(3) >= ${FC.homeMinSats}.0) ? 1.0 : 0.0`,
  })
  s.wire(armed, latchNow, 0)
  s.wire(armedPrev, latchNow, 1)
  s.wire(fixSplit, latchNow, 2, 0)
  s.wire(fixSplit, latchNow, 3, 1)
  const validPrev = s.add('unit_delay', 'HomeValidPrev', { initialValue: 0, sampleInterval: FC.ts })
  const valid = s.add('evaluate', 'HomeValid', { numInputs: 3, expression: '(in(0) > 0.5) ? fmax(in(1), in(2)) : 0.0' })
  s.wire(armed, valid, 0)
  s.wire(latchNow, valid, 1)
  s.wire(validPrev, valid, 2)
  s.wire(valid, validPrev)
  const homePrev = s.add('unit_delay', 'HomePrev', { initialValue: [0, 0], sampleInterval: FC.ts })
  const homeSplit = s.add('demux', 'HomePrevSplit', { outputCount: 2, inputDimensions: [2] })
  s.wire(homePrev, homeSplit)
  const home = s.add('mux', 'HomePosition', { rows: 2, cols: 1, baseType: 'double', outputType: 'double[2]' })
  ;['North', 'East'].forEach((axis, k) => {
    const ev = s.add('evaluate', `Home${axis}`, { numInputs: 3, expression: '(in(0) > 0.5) ? in(1) : in(2)' })
    s.wire(latchNow, ev, 0)
    s.wire(posSplit, ev, 1, k)
    s.wire(homeSplit, ev, 2, k)
    s.wire(ev, home, k)
  })
  s.wire(home, homePrev)

  const vector = s.add('subsystem', 'HomeVector', {
    ...subsystem(['home', 'valid', 'gnss_pos', 'grid_convergence_deg'], ['distance', 'bearing'], buildHomeVectorSheet()),
    sampleTimeSec: SENSORS.gnss.ts,
  })
  s.wire(home, vector, 0)
  s.wire(valid, vector, 1)
  s.wire(pos, vector, 2)
  s.wire(gamma, vector, 3)
  s.output('home_valid', valid, 'double')
  s.output('home_distance_m', vector, 'double', 0)
  s.output('home_bearing_deg', vector, 'double', 1)
  return s
}

/** Distance and true bearing from the vehicle to home, on each fix; 0 without a home. */
function buildHomeVectorSheet(): SheetBuilder {
  const s = new SheetBuilder('homevec', 'HomeVector')
  const home = s.input('home', 'double[2]')
  const valid = s.input('valid', 'double')
  const pos = s.input('gnss_pos', 'double[3]')
  const gamma = s.input('grid_convergence_deg', 'double')
  const homeSplit = s.add('demux', 'HomeSplit', { outputCount: 2, inputDimensions: [2] })
  s.wire(home, homeSplit)
  const posSplit = s.add('demux', 'PosSplit', { outputCount: 3, inputDimensions: [3] })
  s.wire(pos, posSplit)
  // in(0) valid, in(1) home n, in(2) home e, in(3) n, in(4) e [, in(5) γ]
  const wireAll = (ev: string) => {
    s.wire(valid, ev, 0)
    s.wire(homeSplit, ev, 1, 0)
    s.wire(homeSplit, ev, 2, 1)
    s.wire(posSplit, ev, 3, 0)
    s.wire(posSplit, ev, 4, 1)
  }
  const distance = s.add('evaluate', 'Distance', { numInputs: 5, expression: '(in(0) > 0.5) ? sqrt((in(1) - in(3)) * (in(1) - in(3)) + (in(2) - in(4)) * (in(2) - in(4))) : 0.0' })
  wireAll(distance)
  const bearing = s.add('evaluate', 'BearingTrue', {
    numInputs: 6,
    expression: `(in(0) > 0.5) ? fmod(atan2(in(2) - in(4), in(1) - in(3)) * ${180 / Math.PI} + in(5) + 720.0, 360.0) : 0.0`,
  })
  wireAll(bearing)
  s.wire(gamma, bearing, 5)
  s.output('distance', distance, 'double')
  s.output('bearing', bearing, 'double')
  return s
}

/**
 * Altitude Hold and the shared altitude controller, after Betaflight 2025.12
 * (docs/fpv-betaflight-gnss-spec.md §3.1–3.2), at 100 Hz. Active when armed,
 * not in GPS Rescue, the throttle has been raised since arming, and AUX4 is at
 * mid or high, or a failsafe AUTO-LAND is running. On entry the target is the
 * current altitude; the throttle stick moves it outside a deadband around
 * hover (not at low throttle); AUTO-LAND descends faster when higher. The
 * controller's throttle (µs) is returned in stick units, (µs − 1000) / 1000.
 */
function buildAltHoldSheet(startArmed: boolean, throttleMaxUs = FC.autopilot.throttleMaxUs): SheetBuilder {
  const A = FC.autopilot
  const ts = A.ts
  const s = new SheetBuilder('althold', 'AltHold')
  const sticks = s.input('sticks', 'double[8]')
  const armed = s.input('armed', 'double')
  const stage = s.input('failsafe_stage', 'double')
  const procedure = s.input('failsafe_procedure', 'double')
  const alt = s.input('alt_est', 'double')
  const vario = s.input('vario_est', 'double')
  const euler = s.input('euler_est', 'double[3]')
  const rescue = s.input('rescue_active', 'double')
  // GPS Rescue drives the same controller with its own target and per-tick step
  const rescueTarget = s.input('rescue_target_cm', 'double')
  const rescueStep = s.input('rescue_step_cm', 'double')
  const rescueRun = s.input('rescue_run', 'double')
  const rescueReset = s.input('rescue_reset', 'double')
  const split = s.add('demux', 'StickSplit', { outputCount: 8, inputDimensions: [8] })
  s.wire(sticks, split)
  const att = s.add('demux', 'AttitudeSplit', { outputCount: 3, inputDimensions: [3] })
  s.wire(euler, att)
  const state = (name: string, init: number, expression: string, inputs: string[]) => {
    const prev = s.add('unit_delay', `${name}Prev`, { initialValue: init, sampleInterval: ts })
    const ev = s.add('evaluate', name, { numInputs: inputs.length + 1, expression })
    inputs.forEach((x, k) => s.wire(x, ev, k))
    s.wire(prev, ev, inputs.length)
    s.wire(ev, prev)
    return ev
  }
  // wasThrottleRaised: since arming, the throttle has been above low
  const raisedPrev = s.add('unit_delay', 'ThrottleRaisedPrev', { initialValue: startArmed ? 1 : 0, sampleInterval: ts })
  const raised = s.add('evaluate', 'ThrottleRaised', { numInputs: 3, expression: `(in(0) > 0.5) ? fmax(in(2), (in(1) >= ${FC.minCheck}) ? 1.0 : 0.0) : 0.0` })
  s.wire(armed, raised, 0)
  s.wire(split, raised, 1, 3)
  s.wire(raisedPrev, raised, 2)
  s.wire(raised, raisedPrev)
  // in(0) armed, in(1) rescue, in(2) raised, in(3) AUX4, in(4) stage, in(5) procedure
  const active = s.add('evaluate', 'Active', {
    numInputs: 6,
    expression: `(in(0) > 0.5 && in(1) < 0.5 && in(2) > 0.5 && (in(3) > 0.25 || (in(4) > 1.5 && fabs(in(5) - ${FAILSAFE_PROCEDURE.autoLand}) < 0.5))) ? 1.0 : 0.0`,
  })
  ;[armed, rescue, raised].forEach((x, k) => s.wire(x, active, k))
  s.wire(split, active, 3, 7)
  s.wire(stage, active, 4)
  s.wire(procedure, active, 5)
  const activePrev = s.add('unit_delay', 'ActivePrev', { initialValue: 0, sampleInterval: ts })
  s.wire(active, activePrev)
  const altCm = s.add('evaluate', 'AltitudeCm', { numInputs: 1, expression: 'in(0) * 100.0' })
  s.wire(alt, altCm)
  // Stick factor: outside the deadband around hover (not at low throttle); AUTO-LAND descends, faster when higher
  const hover = A.hoverUs
  const low = hover - A.deadband * (hover - 1000), high = hover + A.deadband * (2000 - hover)
  const us = '(1000.0 + 1000.0 * in(0))'
  const stickFactor = s.add('evaluate', 'StickFactor', {
    numInputs: 3,
    // in(0) throttle stick, in(1) failsafe stage, in(2) altitude cm
    expression:
      `(in(1) > 1.5) ? -(0.9 + fmin(fmax(in(2) / 2000.0, 0.1), 9.0)) : ` +
      `((in(0) < ${FC.minCheck}) ? 0.0 : ((${us} < ${low}) ? (${us} - 1000.0) / ${low - 1000} - 1.0 : ((${us} > ${high}) ? (${us} - ${high}) / ${2000 - high} : 0.0)))`,
  })
  s.wire(split, stickFactor, 0, 3)
  s.wire(stage, stickFactor, 1)
  s.wire(altCm, stickFactor, 2)
  const targetVel = s.add('evaluate', 'TargetVelocity', { numInputs: 1, expression: `in(0) * ${A.climbRateCmS}` })
  s.wire(stickFactor, targetVel)
  // Target altitude (cm): the current altitude on entry; moved by the target velocity while within 1 s of travel
  // in(0) active, in(1) active before, in(2) altitude, in(3) target velocity, in(4) target before
  const target = state('TargetCm', 0,
    `(in(0) > 0.5 && in(1) < 0.5) ? in(2) : ((fabs(in(2) - in(4)) < ${A.climbRateCmS}) ? in(4) + in(3) * ${ts} : in(4))`,
    [active, activePrev, altCm, targetVel])
  const running = namedEval(s, 'ControllerRunning', { a: active, r: rescueRun }, '({a} > 0.5 || {r} > 0.5) ? 1.0 : 0.0')
  const err = namedEval(s, 'AltitudeErrorCm', { r: rescueRun, rt: rescueTarget, t: target, a: altCm }, '(({r} > 0.5) ? {rt} : {t}) - {a}')
  // F's input: Alt Hold's target velocity (cm/s), or the rescue's target step per tick (cm), as in Betaflight
  const fInput = namedEval(s, 'FeedforwardInput', { r: rescueRun, st: rescueStep, v: targetVel }, '({r} > 0.5) ? {st} : {v}')
  // I: reset on Alt Hold entry or at a rescue's start; 0.1× above iRelaxCm; limited; held when not running
  const iTerm = state('ITerm', 0,
    `(in(0) > 0.5 && in(1) < 0.5) || in(4) > 0.5 ? 0.0 : ((in(3) > 0.5) ? fmin(fmax(in(5) + in(2) * ${A.i * 0.003} * ((fabs(in(2)) < ${A.iRelaxCm}) ? 1.0 : 0.1) * ${ts}, -${A.iLimitUs}), ${A.iLimitUs}) : in(5))`,
    [active, activePrev, err, running, rescueReset])
  // Throttle (µs): (P + I − D·boost + F + hover offset) / max(cos tilt, 0.5), limited; then stick units
  // in(0) error, in(1) I, in(2) vario m/s, in(3) target velocity, in(4) roll, in(5) pitch
  const vz = '(in(2) * 100.0)'
  const boost = `((fabs(${vz}) > ${A.dBoostStartCmS}) ? (3.0 * fabs(${vz}) / ${A.dBoostStartCmS} - 2.0) / (fabs(${vz}) / ${A.dBoostStartCmS}) : 1.0)`
  const throttleRaw = s.add('evaluate', 'ThrottleCommand', {
    numInputs: 6,
    expression:
      `(fmin(fmax(1000.0 + (in(0) * ${A.p * 0.01} + in(1) - ${vz} * ${boost} * ${A.d * 0.01} + in(3) * ${A.f * 0.01} + ${hover - 1000})` +
      ` / fmax(cos(in(4)) * cos(in(5)), 0.5), ${A.throttleMinUs}), ${throttleMaxUs}) - 1000.0) / 1000.0`,
  })
  s.wire(err, throttleRaw, 0)
  s.wire(iTerm, throttleRaw, 1)
  s.wire(vario, throttleRaw, 2)
  s.wire(fInput, throttleRaw, 3)
  s.wire(att, throttleRaw, 4, 0)
  s.wire(att, throttleRaw, 5, 1)
  // Held when the controller is not running (Betaflight's throttleOut keeps its last value)
  const throttle = state('Throttle', 0, '(in(0) > 0.5) ? in(1) : in(2)', [running, throttleRaw])
  s.output('active', active, 'double')
  s.output('throttle', throttle, 'double')
  s.output('throttle_raised', raised, 'double')
  return s
}

/**
 * Betaflight's position controller (autopilot_multirotor.c positionControl),
 * stepping on each GNSS fix (10 Hz). Per grid axis: P on the distance to the
 * target, I outside the stopping phase, D on the PT1-filtered velocity from
 * successive positions (× 1.6 while stopping), A on its filtered derivative;
 * the D + A vector limited to 35°. While the sticks are active the output is
 * 0, the target follows the vehicle and I leaks; after they centre, each axis
 * stops when its velocity reverses and its target resets there. The sum is
 * rotated into body roll and pitch by the estimated yaw and limited to
 * ap_max_angle. Farther than the sanity distance, it fails (and holds its output).
 */
function buildPositionControlSheet(): SheetBuilder {
  const H = FC.posHold
  const ts = SENSORS.gnss.ts
  const freq = 1 / ts
  const kp = H.p * 0.0012, ki = H.i * 0.0001, kd = H.d * 0.0015, ka = H.a * 0.0008
  const kva = pt1Gain(H.cutoffHz, ts)
  const leak = 1 - ts / (ts + H.iLeakS)
  const s = new SheetBuilder('posctl', 'PositionControl')
  const enabled = s.input('enabled', 'double')
  const run = s.input('run', 'double')
  const pos = s.input('gnss_pos', 'double[3]')
  const speed = s.input('ground_speed', 'double')
  const sticksActive = s.input('sticks_active', 'double')
  const yaw = s.input('yaw_est', 'double')
  const posSplit = s.add('demux', 'PosSplit', { outputCount: 3, inputDimensions: [3] })
  s.wire(pos, posSplit)
  const delay = (name: string, init: number | number[]) => s.add('unit_delay', `${name}Prev`, { initialValue: init, sampleInterval: ts })
  const ev = (name: string, expression: string, inputs: Array<string | [string, number]>) => {
    const id = s.add('evaluate', name, { numInputs: inputs.length, expression })
    inputs.forEach((x, k) => (Array.isArray(x) ? s.wire(x[0], id, k, x[1]) : s.wire(x, id, k)))
    return id
  }
  const enabledPrev = delay('Enabled', 0)
  s.wire(enabled, enabledPrev)
  const entering = ev('Entering', '(in(0) > 0.5 && in(1) < 0.5) ? 1.0 : 0.0', [enabled, enabledPrev])
  const gsCm = ev('GroundSpeedCm', 'in(0) * 100.0', [speed])
  const sanityPrev = delay('Sanity', H.sanityMinCm)
  const sanity0 = ev('Sanity0', `(in(0) > 0.5) ? fmax(${H.sanityMinCm}.0, 2.0 * in(1)) : in(2)`, [entering, gsCm, sanityPrev])

  // Per axis (0 north, 1 east, grid): states, and the values at this sample after an entry reset
  const axes = ['North', 'East'].map((name, k) => {
    const target = delay(`${name}Target`, 0), stop = delay(`${name}Stopping`, 1), integ = delay(`${name}Integral`, 0)
    const vf = delay(`${name}Velocity`, 0), af = delay(`${name}Acceleration`, 0)
    const prevD = delay(`${name}LastDistance`, 0), prevVf = delay(`${name}LastVelocity`, 0)
    const p_k: [string, number] = [posSplit, k]
    return {
      name, k, target, stop, integ, vf, af, prevD, prevVf, pos: p_k,
      tgt0: ev(`${name}Target0`, '(in(0) > 0.5) ? in(1) : in(2)', [entering, p_k, target]),
      stop0: ev(`${name}Stopping0`, '(in(0) > 0.5) ? 1.0 : in(1)', [entering, stop]),
      integ0: ev(`${name}Integral0`, '(in(0) > 0.5) ? 0.0 : in(1)', [entering, integ]),
      vf0: ev(`${name}Velocity0`, '(in(0) > 0.5) ? 0.0 : in(1)', [entering, vf]),
      af0: ev(`${name}Acceleration0`, '(in(0) > 0.5) ? 0.0 : in(1)', [entering, af]),
    }
  })
  // Distance to the target (cm), and the sanity check
  const dist = axes.map(a => ev(`${a.name}DistanceCm`, '(in(0) - in(1)) * 100.0', [a.tgt0, a.pos]))
  const fail = ev('SanityFail', '(in(0) > 0.5 && sqrt(in(1) * in(1) + in(2) * in(2)) > in(3)) ? 1.0 : 0.0', [run, dist[0]!, dist[1]!, sanity0])
  const ok = ev('Update', '(in(0) > 0.5 && in(1) < 0.5) ? 1.0 : 0.0', [run, fail])

  const terms = axes.map((a, i) => {
    const d = dist[i]!
    const integC = ev(`${a.name}IntegralSum`, `in(1) + ((in(2) > 0.5) ? 0.0 : in(0) * ${ts})`, [d, a.integ0, a.stop0])
    const vel = ev(`${a.name}VelocityRaw`, `(in(0) - in(1)) * ${freq}`, [d, a.prevD])
    const vf = ev(`${a.name}VelocityFiltered`, `in(1) + ${kva} * (in(0) - in(1))`, [vel, a.vf0])
    const acc = ev(`${a.name}AccelerationRaw`, `(in(0) - in(1)) * ${freq}`, [vf, a.prevVf])
    const af = ev(`${a.name}AccelerationFiltered`, `in(1) + ${kva} * (in(0) - in(1))`, [acc, a.af0])
    // Stopping: after the sticks centre, until the velocity reverses
    const stoppedNow = ev(`${a.name}StoppedNow`, '(in(0) < 0.5 && in(1) > 0.5 && in(2) * in(3) < 0.0) ? 1.0 : 0.0', [sticksActive, a.stop0, vel, vf])
    const dTerm = ev(`${a.name}D`, `in(0) * ${kd} * ((in(1) < 0.5 && in(2) > 0.5) ? ${H.stoppingDBoost} : 1.0)`, [vf, sticksActive, a.stop0])
    const daTerm = ev(`${a.name}DA`, `in(0) + in(1) * ${ka}`, [dTerm, af])
    const pi = ev(`${a.name}PI`, `in(0) * ${kp} + in(1) * ${ki}`, [d, integC])
    // Next states (written only on an update; otherwise the entry-reset values stand)
    const stopN = ev(`${a.name}StoppingNext`, '(in(0) > 0.5) ? 1.0 : ((in(1) > 0.5) ? 0.0 : in(2))', [sticksActive, stoppedNow, a.stop0])
    const integN = ev(`${a.name}IntegralNext`, `(in(0) > 0.5) ? in(1) * ${leak} : in(1)`, [sticksActive, integC])
    const prevDN = ev(`${a.name}LastDistanceNext`, '(in(0) > 0.5 || in(1) > 0.5) ? 0.0 : in(2)', [sticksActive, stoppedNow, d])
    const tgtN = ev(`${a.name}TargetNext`, '(in(0) > 0.5 || in(1) > 0.5) ? in(2) : in(3)', [sticksActive, stoppedNow, a.pos, a.tgt0])
    return { a, d, vf, af, stoppedNow, daTerm, pi, stopN, integN, prevDN, tgtN }
  })
  // D + A limited as a vector, then the earth-frame sum
  const daScale = ev('DAScale', `(sqrt(in(0) * in(0) + in(1) * in(1)) > ${H.daLimitDeg}) ? ${H.daLimitDeg} / sqrt(in(0) * in(0) + in(1) * in(1)) : 1.0`, [terms[0]!.daTerm, terms[1]!.daTerm])
  const sum = terms.map(t => ev(`${t.a.name}Sum`, 'in(0) + in(1) * in(2)', [t.pi, t.daTerm, daScale]))
  // Rotate to body (ENU: x east, y north; angle = yaw − 90°), roll = −y_body, forward = x_body; limit; our pitch = −forward
  const rot = `(in(2) - ${Math.PI / 2})`
  const bx = `(in(1) * cos(${rot}) - in(0) * sin(${rot}))`
  const by = `(in(1) * sin(${rot}) + in(0) * cos(${rot}))`
  const mag = `sqrt(${bx} * ${bx} + ${by} * ${by})`
  const limit = `((${mag} > ${H.maxAngleDeg}) ? ${H.maxAngleDeg} / ${mag} : 1.0)`
  // in(0) north sum, in(1) east sum, in(2) yaw, in(3) sticks active
  const rollCmd = ev('RollCommand', `(in(3) > 0.5) ? 0.0 : -${by} * ${limit}`, [sum[0]!, sum[1]!, yaw, sticksActive])
  const pitchCmd = ev('PitchCommand', `(in(3) > 0.5) ? 0.0 : -${bx} * ${limit}`, [sum[0]!, sum[1]!, yaw, sticksActive])
  const anglesPrev = delay('Angles', [0, 0])
  const anglesSplit = s.add('demux', 'AnglesPrevSplit', { outputCount: 2, inputDimensions: [2] })
  s.wire(anglesPrev, anglesSplit)
  const angles = s.add('mux', 'Angles', { rows: 2, cols: 1, baseType: 'double', outputType: 'double[2]' })
  ;[rollCmd, pitchCmd].forEach((c, k) => s.wire(ev(`AngleOut${k}`, '(in(0) > 0.5) ? in(1) : in(2)', [ok, c, [anglesSplit, k]]), angles, k))
  s.wire(angles, anglesPrev)

  // State writes on an update; otherwise keep the (entry-reset) values
  const keep = (next: string, held: string, name: string) => ev(name, '(in(0) > 0.5) ? in(1) : in(2)', [ok, next, held])
  for (const t of terms) {
    const a = t.a
    s.wire(keep(t.tgtN, a.tgt0, `${a.name}TargetWrite`), a.target)
    s.wire(keep(t.stopN, a.stop0, `${a.name}StoppingWrite`), a.stop)
    s.wire(keep(t.integN, a.integ0, `${a.name}IntegralWrite`), a.integ)
    s.wire(keep(t.vf, a.vf0, `${a.name}VelocityWrite`), a.vf)
    s.wire(keep(t.af, a.af0, `${a.name}AccelerationWrite`), a.af)
    s.wire(keep(t.prevDN, a.prevD, `${a.name}LastDistanceWrite`), a.prevD)
    s.wire(keep(t.vf, a.prevVf, `${a.name}LastVelocityWrite`), a.prevVf)
  }
  // Sanity distance: follows 2 s of travel while the sticks are active; 20 m once both axes have stopped
  // (the code's sanityCheckDistance(1000) = max(1000, 2 × 1000))
  const sanityN = ev('SanityNext',
    `(in(0) > 0.5) ? fmax(${H.sanityMinCm}.0, 2.0 * in(1)) : (((in(2) > 0.5 || in(3) > 0.5) && in(4) < 0.5 && in(5) < 0.5) ? ${Math.max(H.sanityMinCm, 2 * 1000)}.0 : in(6))`,
    [sticksActive, gsCm, terms[0]!.stoppedNow, terms[1]!.stoppedNow, terms[0]!.stopN, terms[1]!.stopN, sanity0])
  s.wire(keep(sanityN, sanity0, 'SanityWrite'), sanityPrev)
  s.output('angles', angles, 'double[2]')
  s.output('sanity_fail', fail, 'double')
  return s
}

/**
 * Position Hold, after Betaflight 2025.12 (docs/fpv-betaflight-gnss-spec.md
 * §3.1, §3.3), at 100 Hz. Active when armed, not in GPS Rescue, the throttle
 * raised, and AUX4 high or a failsafe AUTO-LAND. The controller runs only with
 * a 3D fix and either a magnetometer or (without-mag allowed and) GPS heading,
 * and only until its sanity check fails (POSHOLD FAIL); otherwise its angle
 * holds. Roll or pitch beyond the deadband hands control to the pilot (not
 * during failsafe). The angle is upsampled to 100 Hz through a 5 Hz PT3.
 */
function buildPosHoldSheet(magnetometer: boolean, withoutMag: boolean): SheetBuilder {
  const H = FC.posHold
  const ts = FC.autopilot.ts
  const s = new SheetBuilder('poshold', 'PosHold')
  const sticks = s.input('sticks', 'double[8]')
  const armed = s.input('armed', 'double')
  const stage = s.input('failsafe_stage', 'double')
  const procedure = s.input('failsafe_procedure', 'double')
  const raised = s.input('throttle_raised', 'double')
  const gnssPos = s.input('gnss_pos', 'double[3]')
  const gnssFix = s.input('gnss_fix', 'double[3]')
  const course = s.input('gnss_course', 'double[4]')
  const euler = s.input('euler_est', 'double[3]')
  const headingOk = s.input('gps_heading_ok', 'double')
  const rescue = s.input('rescue_active', 'double')
  const split = s.add('demux', 'StickSplit', { outputCount: 8, inputDimensions: [8] })
  s.wire(sticks, split)
  const ev = (name: string, expression: string, inputs: Array<string | [string, number]>) => {
    const id = s.add('evaluate', name, { numInputs: inputs.length, expression })
    inputs.forEach((x, k) => (Array.isArray(x) ? s.wire(x[0], id, k, x[1]) : s.wire(x, id, k)))
    return id
  }
  const delay = (name: string, init: number) => s.add('unit_delay', `${name}Prev`, { initialValue: init, sampleInterval: ts })
  const fixSplit = s.add('demux', 'FixSplit', { outputCount: 3, inputDimensions: [3] })
  s.wire(gnssFix, fixSplit)
  const crs = s.add('demux', 'CourseSplit', { outputCount: 4, inputDimensions: [4] })
  s.wire(course, crs)
  const att = s.add('demux', 'AttitudeSplit', { outputCount: 3, inputDimensions: [3] })
  s.wire(euler, att)

  const requested = ev('Requested',
    `(in(0) > 0.5 && in(1) < 0.5 && in(2) > 0.5 && (in(3) > 0.75 || (in(4) > 1.5 && fabs(in(5) - ${FAILSAFE_PROCEDURE.autoLand}) < 0.5))) ? 1.0 : 0.0`,
    [armed, rescue, raised, [split, 7], stage, procedure])
  const reqPrev = delay('Requested', 0)
  s.wire(requested, reqPrev)
  const entering = ev('Entering', '(in(0) > 0.5 && in(1) < 0.5) ? 1.0 : 0.0', [requested, reqPrev])
  const sensorsOk = ev('SensorsOk', `(in(0) > 2.5 && (${magnetometer ? 1 : 0} > 0 || (${withoutMag ? 1 : 0} > 0 && in(1) > 0.5))) ? 1.0 : 0.0`, [[fixSplit, 0], headingOk])
  const okPrev = delay('ControlOk', 0)
  // Runs when requested, control still OK (or just entered) and the sensors are OK
  const run = ev('Run', '(in(0) > 0.5 && (in(1) > 0.5 || in(2) > 0.5) && in(3) > 0.5) ? 1.0 : 0.0', [requested, entering, okPrev, sensorsOk])
  // Sticks: deflection beyond the deadband, checked only while running and not in failsafe
  const saPrev = delay('SticksActive', 0)
  const sticksActive = ev('SticksActive',
    `(in(0) > 0.5 && in(1) < 1.5) ? ((fabs(in(2)) > ${H.deadband} || fabs(in(3)) > ${H.deadband}) ? 1.0 : 0.0) : ((in(4) > 0.5) ? 0.0 : in(5))`,
    [run, stage, [split, 0], [split, 1], entering, saPrev])
  s.wire(sticksActive, saPrev)
  const ctl = s.add('subsystem', 'PositionControl', {
    ...subsystem(['enabled', 'run', 'gnss_pos', 'ground_speed', 'sticks_active', 'yaw_est'], ['angles', 'sanity_fail'], buildPositionControlSheet()),
    sampleTimeSec: SENSORS.gnss.ts,
  })
  s.wire(requested, ctl, 0)
  s.wire(run, ctl, 1)
  s.wire(gnssPos, ctl, 2)
  s.wire(crs, ctl, 3, 2)
  s.wire(sticksActive, ctl, 4)
  s.wire(att, ctl, 5, 2)
  // Control OK until the sanity check fails; re-armed on entry
  const ok = ev('ControlOk', '(in(0) > 0.5) ? ((in(1) > 0.5) ? 1.0 : ((in(2) > 0.5 && !(in(3) > 0.5 && in(4) > 0.5)) ? 1.0 : 0.0)) : 0.0',
    [requested, entering, okPrev, run, [ctl, 1]])
  s.wire(ok, okPrev)
  const fail = ev('PosHoldFail', '(in(0) > 0.5 && (in(1) < 0.5 || in(2) < 0.5)) ? 1.0 : 0.0', [requested, ok, sensorsOk])
  // Upsampling: a 5 Hz PT3 at 100 Hz, updated while running, cleared on entry, otherwise held
  const k3 = pt1Gain(H.upsampleHz * 1.961459177, ts)
  const angleSplit = s.add('demux', 'AngleSplit', { outputCount: 2, inputDimensions: [2] })
  s.wire(ctl, angleSplit, 0, 0)
  const out = s.add('mux', 'AutopilotAngle', { rows: 2, cols: 1, baseType: 'double', outputType: 'double[2]' })
  for (let k = 0; k < 2; k++) {
    let x: string | [string, number] = [angleSplit, k]
    for (let st = 1; st <= 3; st++) {
      const prev = delay(`Upsample${k}Stage${st}`, 0)
      const y = ev(`Upsample${k}Stage${st}`, `(in(1) > 0.5) ? 0.0 : ((in(2) > 0.5) ? in(3) + ${k3} * (in(0) - in(3)) : in(3))`, [x, entering, run, prev])
      s.wire(y, prev)
      x = y
    }
    s.wire(x as string, out, k)
  }
  s.output('active', requested, 'double')
  s.output('in_control', ev('InControl', '(in(0) > 0.5) ? 0.0 : 1.0', [sticksActive]), 'double')
  s.output('angle', out, 'double[2]')
  s.output('fail', fail, 'double')
  return s
}

/** A source for named-input Evaluates: a block id, or [block id, output port]. */
type Src = string | [string, number]

/**
 * An Evaluate whose expression names its inputs: `{name}` in the body
 * becomes in(k) for the k-th entry of `vars`. Keeps long state-machine
 * expressions readable against the behaviour reference.
 */
function namedEval(s: SheetBuilder, name: string, vars: Record<string, Src>, body: string): string {
  const keys = Object.keys(vars)
  const expression = body.replace(/\{(\w+)\}/g, (_, k: string) => {
    const i = keys.indexOf(k)
    if (i < 0) throw new Error(`${name}: no input {${k}}`)
    return `in(${i})`
  })
  const id = s.add('evaluate', name, { numInputs: keys.length, expression })
  keys.forEach((k, i) => {
    const src = vars[k]!
    if (Array.isArray(src)) s.wire(src[0], id, i, src[1])
    else s.wire(src, id, i)
  })
  return id
}

/**
 * GPS Rescue, after Betaflight 2025.12 gps_rescue_multirotor.c
 * (docs/fpv-betaflight-gnss-spec.md §2), at 100 Hz. Each tick, in the code's
 * order: start (IDLE → INITIALIZE); the sensor update (on a new fix: distance
 * and velocity to home, the IMU course gain and the velocity I attenuation);
 * the phase machine; the sanity checks (failures, and once a second fly-away,
 * low satellites and stalled climb or descent); then the controls — the
 * shared altitude controller's target, yaw P with roll mixed in, and the
 * velocity PID (on a new fix) upsampled through a 3 Hz PT3 for pitch.
 * Outputs follow this model's conventions: pitch positive nose-up, yaw rate
 * positive nose-right (Betaflight's rescue pitch is nose-down, its yaw left).
 */
function buildGpsRescueSheet(magnetometer: boolean): SheetBuilder {
  const R = FC.rescue
  const ts = R.ts
  const P = RESCUE_PHASE
  const F = RESCUE_FAILURE
  const s = new SheetBuilder('rescue', 'GpsRescue')
  const sticks = s.input('sticks', 'double[8]')
  const armed = s.input('armed', 'double')
  const stage = s.input('failsafe_stage', 'double')
  const procedure = s.input('failsafe_procedure', 'double')
  const link = s.input('rc_link_valid', 'double')
  const heading = s.input('heading_deg', 'double')
  const homeValid = s.input('home_valid', 'double')
  const dist = s.input('home_distance_m', 'double')
  const bearing = s.input('home_bearing_deg', 'double')
  const alt = s.input('alt_est', 'double')
  const course = s.input('gnss_course', 'double[4]')
  const fix = s.input('gnss_fix', 'double[3]')
  const accel = s.input('accel', 'double[3]')
  const E = (name: string, vars: Record<string, Src>, body: string) => namedEval(s, name, vars, body)
  const delay = (name: string, init: number) => s.add('unit_delay', `${name}Prev`, { initialValue: init, sampleInterval: ts })
  const is = (v: string, phase: number) => `(fabs(${v} - ${phase}.0) < 0.5)`
  const split = s.add('demux', 'StickSplit', { outputCount: 8, inputDimensions: [8] })
  s.wire(sticks, split)
  const crs = s.add('demux', 'CourseSplit', { outputCount: 4, inputDimensions: [4] })
  s.wire(course, crs)
  const fixS = s.add('demux', 'FixSplit', { outputCount: 3, inputDimensions: [3] })
  s.wire(fix, fixS)
  const t = s.add('clock', 'Time')
  // A receiver solution with a 3D fix (Betaflight's GPS stamp advances only with GPS_FIX)
  const ng = E('NewFix', { t, fx: [fixS, 0] }, `(fmod({t} + 0.005, ${SENSORS.gnss.ts}) < 0.01 && {fx} > 2.5) ? 1.0 : 0.0`)
  const altCm = E('AltitudeCm', { a: alt }, '{a} * 100.0')
  const distCm = E('DistanceCm', { d: dist }, '{d} * 100.0')
  const gsCm = E('GroundSpeedCm', { g: [crs, 2] }, '{g} * 100.0')

  // ---- start
  const req = E('Requested', { armed, aux3: [split, 6], stage, proc: procedure },
    `({armed} > 0.5 && ({aux3} > 0.5 || ({stage} > 1.5 && fabs({proc} - ${FAILSAFE_PROCEDURE.gpsRescue}) < 0.5))) ? 1.0 : 0.0`)
  const phasePrev = delay('Phase', P.idle)
  const p0 = E('Phase0', { req, pp: phasePrev }, `({req} < 0.5) ? ${P.idle}.0 : (${is('{pp}', P.idle)} ? ${P.initialize}.0 : {pp})`)
  const start = E('Start', { req, pp: phasePrev }, `({req} > 0.5 && ${is('{pp}', P.idle)}) ? 1.0 : 0.0`)

  // ---- sensor update
  const err = E('ErrorAngle', { h: heading, b: bearing }, 'fmod({h} - {b} + 540.0, 360.0) - 180.0')
  const lastDist = delay('LastDistance', 0)
  const velPrev = delay('VelocityToHome', 0)
  const vel = E('VelocityToHome', { ng, d: distCm, pd: lastDist, v: velPrev }, `({ng} > 0.5) ? ({pd} - {d}) * ${1 / SENSORS.gnss.ts} : {v}`)
  s.wire(vel, velPrev)
  s.wire(E('LastDistanceNext', { ng, d: distCm, pd: lastDist }, '({ng} > 0.5) ? {d} : {pd}'), lastDist)
  const gsRatio = E('GroundspeedErrorRatio', { g: gsCm, v: vel }, `fabs({g} - {v}) / ${R.imuYawGainMs * 100}.0`)
  const pitchOutPrev = delay('PitchOut', 0) // Betaflight sign, centidegrees
  const cogGainPrev = delay('ImuCogGain', 0)
  const cogGain = E('ImuCogGain', { ng, start, p0, r: gsRatio, po: pitchOutPrev, g: cogGainPrev },
    `({ng} > 0.5) ? ((({po} > 0.0) ? fmin({po} / 3000.0, 2.0) : 0.0) + (${is('{p0}', P.flyHome)} ? fmin({r}, 3.5) : 0.0)) : (({start} > 0.5) ? 1.0 : {g})`)
  s.wire(cogGain, cogGainPrev)

  // ---- phase machine (values after the switch on p0)
  const st = (name: string, init: number) => ({ prev: delay(name, init), name })
  const maxAlt = st('MaxAltitudeCm', 0), ret = st('ReturnAltitudeCm', 0), dd = st('DescentDistanceM', R.descentDistM)
  const target = st('TargetAltitudeCm', 0), stepS = st('TargetStepCm', 0), retLow = st('ReturnAltitudeLow', 1)
  const yawAtt = st('YawAttenuator', 0), tv = st('TargetVelocityCmS', 0), initVelLow = st('InitialVelocityLow', 1)
  const relax = st('ItermRelax', 0), cutMod = st('CutoffModifier', 1), pitchLim = st('PitchLimitDeg', 0)
  const rollLim = st('RollLimitDeg', 0), atten = st('ItermAttenuator', 1), secFail = st('SecondsFailing', 0)
  const failure = st('Failure', F.healthy)
  const v = { p0, ng, armed, home: homeValid, dist, distCm, altCm, vel, err } as Record<string, Src>
  const L = R.landingAltitudeM * 100
  const initGo = E('InitGo', { p0, home: homeValid, dist, altCm }, `(${is('{p0}', P.initialize)} && {home} > 0.5 && !({dist} < 5.0 && {altCm} < ${L}.0)) ? 1.0 : 0.0`)
  const tooClose = E('TooClose', { dist }, `({dist} < ${R.minStartDistM}.0) ? 1.0 : 0.0`)
  const inDescend = E('Descending', { p0 }, `(${is('{p0}', P.descent)} || ${is('{p0}', P.landing)}) ? 1.0 : 0.0`)
  const prox = E('ProximityToLanding', { dist, ddp: dd.prev }, `fmin(fmax(({dist} - ${0.5 * R.landingAltitudeM}) / {ddp}, 0.0), 1.0)`)
  const stillAway = E('StillAway', { rl: retLow.prev, altCm, rp: ret.prev }, '((({rl} > 0.5) ? 1.0 : 0.0) == (({altCm} < {rp}) ? 1.0 : 0.0)) ? 1.0 : 0.0')

  const maxAltN = E('MaxAltitudeNext', { ...v, m: maxAlt.prev }, `${is('{p0}', P.idle)} ? (({armed} > 0.5) ? fmax({altCm}, {m}) : 0.0) : {m}`)
  const idleUpd = E('IdleUpdate', { p0, ng, armed }, `(${is('{p0}', P.idle)} && {ng} > 0.5 && {armed} > 0.5) ? 1.0 : 0.0`)
  const retN = E('ReturnAltitudeNext', { iu: idleUpd, ig: initGo, tc: tooClose, m: maxAltN, altCm, r: ret.prev },
    `({iu} > 0.5) ? {m} + ${R.initialClimbM * 100}.0 : (({ig} > 0.5 && {tc} > 0.5) ? fmax(1000.0, {altCm} + ${R.initialClimbM * 100}.0) : {r})`)
  const ddN = E('DescentDistanceNext', { iu: idleUpd, ig: initGo, tc: tooClose, dist, d: dd.prev },
    `({iu} > 0.5) ? fmin(0.5 * {dist}, ${R.descentDistM}.0) : (({ig} > 0.5 && {tc} > 0.5) ? ${0.5 * R.minStartDistM} : {d})`)
  // descend(): the step grows with altitude, 0.6× at ≤ 10 m to 3.0× at ≥ 50 m
  const stepMag = E('DescendStepCm', { tp: target.prev }, `${ts} * ${R.descendRateCmS}.0 * (0.6 + (fmin(fmax({tp}, 1000.0), 5000.0) - 1000.0) / 4000.0 * 2.4)`)
  const stepA = E('AttainStepCm', { rl: retLow.prev }, `(({rl} > 0.5) ? ${R.ascendRateCmS}.0 : -${R.descendRateCmS}.0) * ${ts}`)
  const targetN = E('TargetAltitudeNext', { iu: idleUpd, p0, sa: stillAway, sA: stepA, de: inDescend, sm: stepMag, altCm, tp: target.prev, rp: ret.prev },
    `({iu} > 0.5) ? {altCm} : (${is('{p0}', P.attainAlt)} ? (({sa} > 0.5) ? {tp} + {sA} : {rp}) : (({de} > 0.5) ? {tp} - {sm} : {tp}))`)
  const stepN = E('TargetStepNext', { ig: initGo, p0, sa: stillAway, sA: stepA, de: inDescend, sm: stepMag, sp: stepS.prev },
    `({ig} > 0.5) ? 0.0 : (${is('{p0}', P.attainAlt)} ? (({sa} > 0.5) ? {sA} : 0.0) : (({de} > 0.5) ? -{sm} : {sp}))`)
  const retLowN = E('ReturnAltitudeLowNext', { ig: initGo, altCm, r: retN, rl: retLow.prev }, '({ig} > 0.5) ? (({altCm} < {r}) ? 1.0 : 0.0) : {rl}')
  const absErr = E('AbsErrorAngle', { e: err }, 'fabs({e})')
  const yawAttN = E('YawAttenuatorNext', { ig: initGo, p0, de: inDescend, y: yawAtt.prev },
    `({ig} > 0.5) ? 0.0 : ((${is('{p0}', P.rotate)} || ${is('{p0}', P.flyHome)}) ? (({y} < 1.0) ? {y} + ${ts} : {y}) : (({de} > 0.5) ? 1.0 : {y}))`)
  const gsT = R.groundSpeedCmS
  const tvDescend = E('DescendVelocity', { pr: prox, ae: absErr }, `({ae} > ${R.allowedYawRangeDeg}.0) ? 0.0 : ${gsT}.0 * {pr} * (${R.allowedYawRangeDeg}.0 - {ae}) / ${R.allowedYawRangeDeg}.0`)
  const tvN = E('TargetVelocityNext', { ig: initGo, p0, ng, de: inDescend, vel, ivl: initVelLow.prev, tvp: tv.prev, td: tvDescend },
    `({ig} > 0.5 || ${is('{p0}', P.attainAlt)} || ${is('{p0}', P.rotate)}) ? {vel} : (${is('{p0}', P.flyHome)} ? ((((({ivl} > 0.5) ? 1.0 : 0.0) == (({tvp} < ${gsT}.0) ? 1.0 : 0.0))) ? {tvp} + ${ts} * (${gsT}.0 - {tvp}) : {tvp}) : (({de} > 0.5 && {ng} > 0.5) ? {td} : {tvp}))`)
  const ivlN = E('InitialVelocityLowNext', { p0, vel, i: initVelLow.prev }, `${is('{p0}', P.rotate)} ? (({vel} < ${gsT}.0) ? 1.0 : 0.0) : {i}`)
  const relaxN = E('ItermRelaxNext', { ig: initGo, p0, r: relax.prev }, `({ig} > 0.5) ? 0.0 : (${is('{p0}', P.flyHome)} ? {r} + ${0.5 * ts} * (1.0 - {r}) : {r})`)
  const cutN = E('CutoffModifierNext', { ig: initGo, p0, ng, de: inDescend, rn: relaxN, pr: prox, c: cutMod.prev },
    `({ig} > 0.5) ? 1.0 : (${is('{p0}', P.flyHome)} ? 2.0 - {rn} : (({de} > 0.5 && {ng} > 0.5) ? 2.5 - {pr} : {c}))`)
  const pitchLimN = E('PitchLimitNext', { ig: initGo, p0, ng, de: inDescend, ae: absErr, pl: pitchLim.prev },
    `({ig} > 0.5) ? 0.0 : ((${is('{p0}', P.rotate)} && {ae} < ${R.allowedYawRangeDeg}.0) || ((${is('{p0}', P.flyHome)} || {de} > 0.5) && {ng} > 0.5)) ? ${R.maxAngleDeg}.0 : {pl}`)
  const rollLimN = E('RollLimitNext', { ig: initGo, p0, ng, de: inDescend, rn: relaxN, dist, ddp: dd.prev, rl: rollLim.prev },
    `({ig} > 0.5) ? 0.0 : ((${is('{p0}', P.flyHome)} && {ng} > 0.5) ? ${0.5 * R.maxAngleDeg} * {rn} : (({de} > 0.5 && {ng} > 0.5) ? ${0.5 * R.maxAngleDeg} * fmin(fmax({dist} / {ddp}, 0.0), 1.0) : {rl}))`)
  const attenBase = E('ItermAttenuatorSensor', { ng, r: gsRatio, a: atten.prev }, '({ng} > 0.5) ? 4.0 / ({r} + 4.0) : {a}')
  const attenN = E('ItermAttenuatorNext', { ig: initGo, de: inDescend, ng, pr: prox, b: attenBase },
    '({ig} > 0.5) ? 1.0 : (({de} > 0.5 && {ng} > 0.5) ? fmin({pr}, {b}) : {b})')
  // Impact: the accelerometer's magnitude (Betaflight acc.accMagnitude, in g)
  const accelNorm = s.add('mag', 'AccelNorm')
  s.wire(accel, accelNorm)
  const accelMagG = E('AccelMagnitudeG', { a: accelNorm }, `{a} / ${FPV.gravity}`)
  const impactNow = E('ImpactNow', { m: accelMagG }, `({m} > ${R.disarmThresholdG}) ? 1.0 : 0.0`)
  const p1 = E('Phase1', { p0, home: homeValid, ig: initGo, sa: stillAway, dist, ae: absErr, ng, ddp: dd.prev, altCm, imp: impactNow },
    `${is('{p0}', P.idle)} ? ${P.idle}.0 : ` +
    `${is('{p0}', P.initialize)} ? (({home} < 0.5) ? ${P.initialize}.0 : (({ig} > 0.5) ? ${P.attainAlt}.0 : ${P.abort}.0)) : ` +
    `${is('{p0}', P.attainAlt)} ? (({sa} < 0.5 && {dist} > ${R.minStartDistM}.0) ? ${P.rotate}.0 : ${P.attainAlt}.0) : ` +
    `${is('{p0}', P.rotate)} ? (({ae} < ${R.allowedYawRangeDeg}.0) ? ${P.flyHome}.0 : ${P.rotate}.0) : ` +
    `${is('{p0}', P.flyHome)} ? (({ng} > 0.5 && {dist} <= {ddp}) ? ${P.descent}.0 : ${P.flyHome}.0) : ` +
    `${is('{p0}', P.descent)} ? (({altCm} < ${L}.0) ? ${P.landing}.0 : ${P.descent}.0) : ` +
    `${is('{p0}', P.landing)} ? (({imp} > 0.5) ? ${P.idle}.0 : ${P.landing}.0) : ` +
    `${is('{p0}', P.doNothing)} ? (({imp} > 0.5) ? ${P.idle}.0 : ${P.doNothing}.0) : ${P.idle}.0`)
  const secSwitch = E('SecondsFailingSwitch', { ig: initGo, p0, ae: absErr, ng, dist, ddp: dd.prev, altCm, sf: secFail.prev },
    `({ig} > 0.5 || ${is('{p0}', P.abort)} || (${is('{p0}', P.rotate)} && {ae} < ${R.allowedYawRangeDeg}.0) || (${is('{p0}', P.flyHome)} && {ng} > 0.5 && {dist} <= {ddp}) || (${is('{p0}', P.descent)} && {altCm} < ${L}.0)) ? 0.0 : {sf}`)
  const failSwitch = E('FailureSwitch', { p0, home: homeValid, f: failure.prev }, `(${is('{p0}', P.initialize)} && {home} < 0.5) ? ${F.noHomePoint}.0 : {f}`)
  const disarm = E('DisarmRequest', { p0, imp: impactNow }, `((${is('{p0}', P.landing)} || ${is('{p0}', P.doNothing)}) && {imp} > 0.5) || ${is('{p0}', P.abort)} ? 1.0 : 0.0`)

  // ---- sanity checks (on p1)
  const lastCheck = delay('LastCheck', 0), prevAltS = delay('SanityAltitudeCm', 0), prevTgtS = delay('SanityTargetCm', 0)
  const prevDistS = delay('SanityDistanceCm', 0), lowSats = delay('SecondsLowSats', 0), nothing = delay('SecondsDoingNothing', 0)
  const magForce = delay('MagForceDisable', 0)
  const sInit = E('SanityInit', { p0, p1 }, `(${is('{p0}', P.initialize)} || ${is('{p1}', P.initialize)}) ? 1.0 : 0.0`)
  const lc0 = E('LastCheck0', { i: sInit, t, l: lastCheck }, '({i} > 0.5) ? {t} : {l}')
  const pa0 = E('SanityAltitude0', { i: sInit, altCm, p: prevAltS }, '({i} > 0.5) ? {altCm} : {p}')
  const pt0 = E('SanityTarget0', { i: sInit, tn: targetN, p: prevTgtS }, '({i} > 0.5) ? {tn} : {p}')
  const pd0 = E('SanityDistance0', { i: sInit, d: distCm, p: prevDistS }, '({i} > 0.5) ? {d} : {p}')
  const ls0 = E('LowSats0', { i: sInit, l: lowSats }, '({i} > 0.5) ? 0.0 : {l}')
  const dn0 = E('DoingNothing0', { i: sInit, n: nothing }, '({i} > 0.5) ? 0.0 : {n}')
  const policy = R.sanityChecks
  const pA = E('PhaseAfterFailure', { p1, f: failSwitch, link },
    `${is('{p1}', P.idle)} ? ${P.idle}.0 : (({f} > 0.5) ? (${policy === 1 ? `${P.abort}.0` : policy === 2 ? `(({link} < 0.5) ? ${P.abort}.0 : ${P.doNothing}.0)` : `${P.doNothing}.0`}) : {p1})`)
  const due = E('SanityDue', { p1, t, l: lc0 }, `(!${is('{p1}', P.idle)} && {t} - {l} >= ${1 - 1e-6}) ? 1.0 : 0.0`)
  const vHome = E('SanityVelocityToHome', { pd: pd0, d: distCm }, '{pd} - {d}')
  const secFly = E('SecondsFailingFly', { due, pA, sf: secSwitch, vh: vHome, tv: tvN },
    `({due} > 0.5 && ${is('{pA}', P.flyHome)}) ? fmin(fmax({sf} + (({vh} < 0.1 * {tv}) ? 1.0 : -1.0), 0.0), 30.0) : {sf}`)
  const mfN = E('MagForceDisableNext', { due, pA, sfy: secFly, m: magForce },
    `({due} > 0.5 && ${is('{pA}', P.flyHome)} && {sfy} >= 30.0 && ${magnetometer && R.useMag ? 1 : 0} > 0 && {m} < 0.5) ? 1.0 : {m}`)
  s.wire(mfN, magForce)
  const lsN = E('LowSatsNext', { due, l: ls0, fx: [fixS, 0], sats: [fixS, 1] },
    `({due} > 0.5) ? fmin(fmax({l} + (({fx} < 2.5 || {sats} < 4.0) ? 1.0 : -1.0), 0.0), 10.0) : {l}`)
  const ratio = E('AltitudeChangeRatio', { altCm, pa: pa0, tn: targetN, pt: pt0 }, '({altCm} - {pa}) / ({tn} - {pt})')
  const secStall = E('SecondsFailingStall', { due, pA, sfy: secFly, r: ratio },
    `({due} > 0.5 && (${is('{pA}', P.landing)} || ${is('{pA}', P.attainAlt)} || ${is('{pA}', P.descent)})) ? fmin(fmax({sfy} + (({r} > 0.5) ? -1.0 : 1.0), 0.0), 10.0) : {sfy}`)
  const dnN = E('DoingNothingNext', { due, pA, n: dn0 }, `({due} > 0.5 && ${is('{pA}', P.doNothing)}) ? fmin({n} + 1.0, 20.0) : {n}`)
  const p2 = E('Phase2', { due, pA, ss: secStall, dn: dnN },
    `({due} > 0.5 && ${is('{pA}', P.landing)} && {ss} >= 10.0) ? ${P.abort}.0 : ` +
    `(({due} > 0.5 && (${is('{pA}', P.attainAlt)} || ${is('{pA}', P.descent)}) && {ss} >= 10.0) ? ${P.landing}.0 : ` +
    `(({due} > 0.5 && ${is('{pA}', P.doNothing)} && {dn} >= 20.0) ? ${P.abort}.0 : {pA}))`)
  const secFinal = E('SecondsFailingNext', { due, pA, sfy: secFly, ss: secStall, mfn: mfN, m: magForce },
    `({due} > 0.5 && ${is('{pA}', P.flyHome)} && {sfy} >= 30.0 && {mfn} > 0.5 && {m} < 0.5) ? 0.0 : ` +
    `(({due} > 0.5 && (${is('{pA}', P.attainAlt)} || ${is('{pA}', P.descent)}) && {ss} >= 10.0) ? 0.0 : {ss})`)
  const failN = E('FailureNext', { p1, pA, due, sfy: secFly, mfn: mfN, m: magForce, ln: lsN, f: failSwitch },
    `${is('{p1}', P.idle)} ? ${F.healthy}.0 : ((({due} > 0.5 && ${is('{pA}', P.flyHome)} && {sfy} >= 30.0 && !({mfn} > 0.5 && {m} < 0.5)) ? ${F.flyaway}.0 : ` +
    `(({due} > 0.5 && {ln} >= 10.0) ? ${F.lowSats}.0 : {f})))`)
  s.wire(E('LastCheckNext', { due, t, l: lc0 }, '({due} > 0.5) ? {t} : {l}'), lastCheck)
  s.wire(E('SanityAltitudeNext', { due, altCm, p: pa0 }, '({due} > 0.5) ? {altCm} : {p}'), prevAltS)
  s.wire(E('SanityTargetNext', { due, tn: targetN, p: pt0 }, '({due} > 0.5) ? {tn} : {p}'), prevTgtS)
  s.wire(E('SanityDistanceNext', { due, pA, d: distCm, p: pd0 }, `({due} > 0.5 && ${is('{pA}', P.flyHome)}) ? {d} : {p}`), prevDistS)
  s.wire(lsN, lowSats)
  s.wire(dnN, nothing)
  s.wire(p2, phasePrev)
  // Intent state writes
  ;([[maxAlt, maxAltN], [ret, retN], [dd, ddN], [target, targetN], [stepS, stepN], [retLow, retLowN], [yawAtt, yawAttN], [tv, tvN],
    [initVelLow, ivlN], [relax, relaxN], [cutMod, cutN], [pitchLim, pitchLimN], [rollLim, rollLimN], [atten, attenN],
    [secFail, secFinal], [failure, failN]] as Array<[{ prev: string }, string]>).forEach(([st_, n]) => s.wire(n, st_.prev))

  // ---- controls (on p2)
  const run = E('Running', { p2 }, `(!${is('{p2}', P.idle)} && !${is('{p2}', P.initialize)} && !${is('{p2}', P.doNothing)}) ? 1.0 : 0.0`)
  const yawPrev = delay('YawRate', 0)
  const yaw = E('YawRate', { run, e: err, ya: yawAttN, y: yawPrev },
    `({run} > 0.5) ? fmin(fmax({e} * ${R.yawP}.0 * {ya} / 10.0, -${R.maxYawRateDps}.0), ${R.maxYawRateDps}.0) : {y}`)
  s.wire(yaw, yawPrev)
  const rollPrev = delay('RollCdeg', 0)
  const roll = E('RollCdeg', { run, p2, y: yaw, rl: rollLimN, r: rollPrev },
    `({run} > 0.5) ? fmin(fmax(-{y} * ${R.rollMix}.0 * fmin(fmax(1.0 - fabs({y}) * 0.01, 0.0), 1.0), -100.0 * {rl}), 100.0 * {rl}) : (${is('{p2}', P.initialize)} ? {r} : 0.0)`)
  s.wire(roll, rollPrev)
  // Velocity PID on a new fix (the interval normalisation factor is 1 at 10 Hz)
  const upd = E('VelocityUpdate', { run, ng }, '({run} > 0.5 && {ng} > 0.5) ? 1.0 : 0.0')
  const velErr = E('VelocityError', { tv: tvN, v: vel }, '{tv} - {v}')
  const prevErr = delay('LastVelocityError', 0), velI = delay('VelocityI', 0), dLpf = delay('VelocityDFiltered', 0), pitchAdj = delay('PitchAdjustment', 0)
  const prevErr0 = E('LastVelocityError0', { start, p: prevErr }, '({start} > 0.5) ? 0.0 : {p}')
  const velI0 = E('VelocityI0', { start, i: velI }, '({start} > 0.5) ? 0.0 : {i}')
  const velIN = E('VelocityINext', { upd, i: velI0, e: velErr, rx: relaxN, at: attenN, pl: pitchLimN },
    `({upd} > 0.5) ? fmin(fmax(({i} + ${0.01 * R.velI} * {e} * {rx}) * {at}, -50.0 * {pl}), 50.0 * {pl}) : {i}`)
  s.wire(velIN, velI)
  const dRaw = E('VelocityD', { e: velErr, pe: prevErr0 }, `({e} - {pe}) * ${R.velD}.0`)
  const dN = E('VelocityDFilteredNext', { upd, d: dRaw, f: dLpf, cm: cutN },
    `({upd} > 0.5) ? {f} + (2.0 * ${Math.PI} * ${R.pitchCutoffHz} * {cm} * ${SENSORS.gnss.ts}) / (2.0 * ${Math.PI} * ${R.pitchCutoffHz} * {cm} * ${SENSORS.gnss.ts} + 1.0) * ({d} - {f}) : {f}`)
  s.wire(dN, dLpf)
  s.wire(E('LastVelocityErrorNext', { upd, e: velErr, p: prevErr0 }, '({upd} > 0.5) ? {e} : {p}'), prevErr)
  const adjCalc = E('PitchAdjustmentNext', { upd, e: velErr, i: velIN, d: dN, pl: pitchLimN, pa: pitchAdj, p2, dist },
    `(${is('{p2}', P.attainAlt)} && {dist} < ${R.minStartDistM}.0) ? 1500.0 : (({upd} > 0.5) ? fmin(fmax({e} * ${R.velP}.0 + {i} + {d}, -100.0 * {pl}), 100.0 * {pl}) : {pa})`)
  s.wire(adjCalc, pitchAdj)
  // 3 Hz PT3 upsampling while running (its state persists across rescues, as in Betaflight)
  const k3 = pt1Gain(4 * R.pitchCutoffHz * 1.961459177, ts)
  let x: string = adjCalc
  for (let k = 1; k <= 3; k++) {
    const prev = delay(`PitchUpsample${k}`, 0)
    const y = E(`PitchUpsample${k}`, { run, x, p: prev }, `({run} > 0.5) ? {p} + ${k3} * ({x} - {p}) : {p}`)
    s.wire(y, prev)
    x = y
  }
  const pitchOut = E('PitchOut', { run, p2, f: x, po: pitchOutPrev }, `({run} > 0.5) ? {f} : (${is('{p2}', P.initialize)} ? {po} : 0.0)`)
  s.wire(pitchOut, pitchOutPrev)

  // ---- warnings: RESCUE N/A (home set, but no fix or under 4 satellites for 2 s, at 1 Hz) and RESCUE OFF (no home, 3 s after arming)
  const naCheck = delay('AvailableCheck', 0), naLow = delay('AvailableLowSats', 0), naNoFix = delay('AvailableNoFix', 0)
  const naDue = E('AvailableDue', { t, l: naCheck }, `({t} - {l} >= ${1 - 1e-6}) ? 1.0 : 0.0`)
  s.wire(E('AvailableCheckNext', { naDue, t, l: naCheck }, '({naDue} > 0.5) ? {t} : {l}'), naCheck)
  const naLowN = E('AvailableLowSatsNext', { naDue, l: naLow, sats: [fixS, 1] }, '({naDue} > 0.5) ? fmin(fmax({l} + (({sats} < 4.0) ? 1.0 : -1.0), 0.0), 2.0) : {l}')
  s.wire(naLowN, naLow)
  const naNoFixN = E('AvailableNoFixNext', { naDue, nf: naNoFix, fx: [fixS, 0] }, '({naDue} > 0.5) ? (({fx} < 2.5) ? 1.0 : 0.0) : {nf}')
  s.wire(naNoFixN, naNoFix)
  const armedPrev = delay('Armed', 0), armTime = delay('ArmTime', 0)
  s.wire(armed, armedPrev)
  const armT = E('ArmTime', { armed, ap: armedPrev, t, at: armTime }, '({armed} > 0.5 && {ap} < 0.5) ? {t} : {at}')
  s.wire(armT, armTime)
  const warnings = E('Warnings', { armed, home: homeValid, lo: naLowN, nf: naNoFixN, t, at: armT },
    `(({armed} > 0.5 && {home} > 0.5 && ({nf} > 0.5 || {lo} >= 2.0)) ? ${FC_WARNING.rescueNA}.0 : 0.0)` +
    ` + (({armed} > 0.5 && {home} < 0.5 && {t} - {at} < 3.0) ? ${FC_WARNING.rescueOff}.0 : 0.0)`)

  const magDisable = E('MagDisable', { p2, m: mfN }, `(${R.useMag ? 1 : 0} > 0 && !${is('{p2}', P.flyHome)} && {m} < 0.5) ? 0.0 : 1.0`)
  s.output('active', req, 'double')
  s.output('phase', p2, 'double')
  const angle = s.add('mux', 'RescueAngle', { rows: 2, cols: 1, baseType: 'double', outputType: 'double[2]' })
  s.wire(E('RollDeg', { r: roll }, '{r} / 100.0'), angle, 0)
  s.wire(E('PitchDeg', { p: pitchOut }, '-{p} / 100.0'), angle, 1)
  s.output('angle', angle, 'double[2]')
  s.output('yaw_rate', E('YawRateOut', { y: yaw }, '-{y}'), 'double')
  s.output('alt_target_cm', targetN, 'double')
  s.output('alt_step_cm', stepN, 'double')
  s.output('alt_run', run, 'double')
  s.output('alt_reset', start, 'double')
  s.output('disarm_request', disarm, 'double')
  s.output('mag_disable', magDisable, 'double')
  s.output('cog_gain', cogGain, 'double')
  s.output('warnings', warnings, 'double')
  s.output('failure', failN, 'double')
  return s
}

/** GPS Rescue's output ports, in order; wired by name. */
const RESCUE_OUTPUTS = ['active', 'phase', 'angle', 'yaw_rate', 'alt_target_cm', 'alt_step_cm', 'alt_run', 'alt_reset', 'disarm_request', 'mag_disable', 'cog_gain', 'warnings', 'failure']
const rOut = (name: string) => {
  const k = RESCUE_OUTPUTS.indexOf(name)
  if (k < 0) throw new Error(`GpsRescue has no output ${name}`)
  return k
}

function buildFlightControllerSheet(
  initialQuat: number[][], altitude0: number, magnetometer: boolean,
  posHoldWithoutMag = FC.posHold.withoutMag, apThrottleMaxUs = FC.autopilot.throttleMaxUs
): SheetBuilder {
  const s = new SheetBuilder('fc', 'FlightController')
  const rawSticks = s.input('sticks', 'double[8]')
  /**
   * A task boundary: the 100 Hz autopilot and rescue tasks write values that
   * later controller and IMU loops read, so their outputs reach the 1 kHz path
   * one controller sample later, as in Betaflight's scheduler. This also keeps
   * the 1 kHz loop from forming algebraic loops through the motors.
   */
  const fromTask = (name: string, src: string, port: number, init: number | number[] = 0): [string, number] => {
    const id = s.add('unit_delay', `${name}Task`, { initialValue: init, sampleInterval: FC.ts })
    s.wire(src, id, 0, port)
    return [id, 0]
  }
  const gyro = s.input('gyro', 'double[3]')
  const acc = s.input('accel', 'double[3]')
  const mag = s.input('mag', 'double[3]')
  const pressure = s.input('pressure', 'double')
  const gamma = s.input('grid_convergence_deg', 'double')
  const gnssPos = s.input('gnss_pos', 'double[3]')
  const gnssFix = s.input('gnss_fix', 'double[3]')
  const link = s.input('rc_link_valid', 'double')
  const procedure = s.input('failsafe_procedure', 'double')
  const gnssCourse = s.input('gnss_course', 'double[4]')

  // Failsafe first: everything below reads the sticks it passes on
  const failsafe = s.add('subsystem', 'Failsafe', subsystem(['sticks', 'rc_link_valid', 'failsafe_procedure'], ['sticks_fs', 'stage', 'disarm_request', 'procedure'], buildFailsafeSheet()))
  s.wire(rawSticks, failsafe, 0)
  s.wire(link, failsafe, 1)
  s.wire(procedure, failsafe, 2)
  const sticks = failsafe
  // What Rates and AngleMode see: Altitude Hold replaces the throttle and forces angle mode
  const altHoldId = `${s.id}__AltHold`
  const fsSplit = s.add('demux', 'FailsafeStickSplit', { outputCount: 8, inputDimensions: [8] })
  s.wire(sticks, fsSplit)
  const apSticks = s.add('mux', 'AutopilotSticks', { rows: 8, cols: 1, baseType: 'double', outputType: 'double[8]' })
  for (let k = 0; k < 8; k++) {
    if (k === 3) {
      // Alt Hold or GPS Rescue: the autopilot's throttle
      const thr = s.add('evaluate', 'ThrottleCommand', { numInputs: 4, expression: '(in(0) > 0.5 || in(3) > 0.5) ? in(1) : in(2)' })
      const hActive = fromTask('AltHoldActive', altHoldId, 0)
      const rActive = fromTask('RescueActive', `${s.id}__GpsRescue`, rOut('active'))
      s.wire(hActive[0], thr, 0)
      s.wire(fromTask('AutopilotThrottle', altHoldId, 1)[0], thr, 1)
      s.wire(fsSplit, thr, 2, 3)
      s.wire(rActive[0], thr, 3)
      s.wire(thr, apSticks, 3)
    } else if (k === 4) {
      const ang = s.add('evaluate', 'AngleModeCommand', { numInputs: 3, expression: '(in(0) > 0.5 || in(2) > 0.5) ? 1.0 : in(1)' })
      s.wire(`${s.id}__AltHoldActiveTask`, ang, 0)
      s.wire(fsSplit, ang, 1, 4)
      s.wire(`${s.id}__RescueActiveTask`, ang, 2)
      s.wire(ang, apSticks, 4)
    } else {
      s.wire(fsSplit, apSticks, k, k)
    }
  }

  // Estimators
  const att = s.add('subsystem', 'AttitudeEstimator', subsystem(
    ['gyro', 'accel', 'mag', 'grid_convergence_deg', 'gnss_course', 'gnss_fix', 'yaw_stick', 'armed', 'mag_disable', 'rescue_active', 'rescue_cog_gain'],
    ['quat', 'euler', 'gps_heading_ok'],
    buildAttitudeEstimatorSheet(initialQuat, magnetometer)))
  s.wire(gyro, att, 0)
  s.wire(acc, att, 1)
  s.wire(mag, att, 2)
  s.wire(gamma, att, 3)
  s.wire(gnssCourse, att, 4)
  s.wire(gnssFix, att, 5)
  s.wire(s.add('selector', 'YawStick', { indices: [2] }), att, 6)
  const rescueId = `${s.id}__GpsRescue`
  // GPS Rescue disables the magnetometer in its fly-home phase, and supplies the course gain
  s.wire(fromTask('RescueMagDisable', rescueId, rOut('mag_disable'))[0], att, 8)
  s.wire(`${s.id}__RescueActiveTask`, att, 9)
  s.wire(fromTask('RescueCogGain', rescueId, rOut('cog_gain'))[0], att, 10)

  // Setpoint: acro rates, or angle mode on the AUX switch
  const rates = s.add('subsystem', 'Rates', subsystem(['sticks'], ['setpoint', 'throttle'], buildRatesSheet()))
  s.wire(apSticks, rates)
  const angle = s.add('subsystem', 'AngleMode', subsystem(
    ['sticks', 'euler_est', 'acro_setpoint', 'pos_hold_active', 'autopilot_in_control', 'autopilot_angle', 'rescue_angle'], ['setpoint', 'angle_mode'], buildAngleModeSheet()))
  s.wire(apSticks, angle, 0)
  s.wire(att, angle, 1, 1)
  s.wire(rates, angle, 2, 0)
  const posHoldId = `${s.id}__PosHold`
  s.wire(fromTask('PosHoldActive', posHoldId, 0)[0], angle, 3)
  s.wire(fromTask('PosHoldInControl', posHoldId, 1, 1)[0], angle, 4)
  s.wire(fromTask('PosHoldAngle', posHoldId, 2, [0, 0])[0], angle, 5)
  s.wire(fromTask('RescueAngle', `${s.id}__GpsRescue`, rOut('angle'), [0, 0])[0], angle, 6)
  // GPS Rescue's yaw rate replaces the yaw setpoint (rc.c)
  const spSplit = s.add('demux', 'SetpointSplit', { outputCount: 3, inputDimensions: [3] })
  s.wire(angle, spSplit, 0, 0)
  const setpoint = s.add('mux', 'SetpointCommand', { rows: 3, cols: 1, baseType: 'double', outputType: 'double[3]' })
  s.wire(spSplit, setpoint, 0, 0)
  s.wire(spSplit, setpoint, 1, 1)
  const yawCmd = s.add('evaluate', 'YawSetpointCommand', { numInputs: 3, expression: '(in(0) > 0.5) ? in(1) : in(2)' })
  s.wire(`${s.id}__RescueActiveTask`, yawCmd, 0)
  s.wire(fromTask('RescueYawRate', `${s.id}__GpsRescue`, rOut('yaw_rate'))[0], yawCmd, 1)
  s.wire(spSplit, yawCmd, 2, 2)
  s.wire(yawCmd, setpoint, 2)

  // Rate loop and mixer
  const filt = s.add('subsystem', 'GyroFilters', subsystem(['gyro'], ['gyro_dps'], buildGyroFilterSheet()))
  s.wire(gyro, filt)
  const arming = s.add('subsystem', 'Arming', subsystem(['sticks', 'gnss_fix', 'disarm_request', 'rc_link_valid'], ['armed', 'airmode', 'warnings'], buildArmingSheet(altitude0 > 0)))
  s.wire(sticks, arming, 0)
  s.wire(gnssFix, arming, 1)
  // Disarm requests: failsafe (DROP, AUTO-LAND's landing time, the throttle-low rule) and GPS Rescue (impact, ABORT)
  const disarmReq = s.add('evaluate', 'DisarmRequest', { numInputs: 2, expression: '(in(0) > 0.5 || in(1) > 0.5) ? 1.0 : 0.0' })
  s.wire(failsafe, disarmReq, 0, 2)
  // The rescue's disarm (impact, ABORT) reaches arming on the next controller sample, as a
  // disarm() from the rescue task is seen by the next step; this also keeps the rescue (which
  // reads armed) out of an algebraic loop with arming
  const rescueDisarmPrev = s.add('unit_delay', 'RescueDisarmPrev', { initialValue: 0, sampleInterval: FC.ts })
  s.wire(`${s.id}__GpsRescue`, rescueDisarmPrev, 0, rOut('disarm_request'))
  s.wire(rescueDisarmPrev, disarmReq, 1)
  s.wire(disarmReq, arming, 2)
  s.wire(link, arming, 3)
  s.wire(arming, att, 7, 0)
  s.wire(sticks, `${s.id}__YawStick`)
  // Altitude: Betaflight's baro/GPS blend at 100 Hz, relative to the arming point
  const alt = s.add('subsystem', 'AltitudeEstimator', {
    ...subsystem(['pressure', 'gnss_pos', 'gnss_fix', 'armed'], ['alt_est', 'vario_est'], buildAltitudeEstimatorSheet(altitude0, altitude0 > 0)),
    sampleTimeSec: ESTIMATOR.altitude.ts,
  })
  s.wire(pressure, alt, 0)
  s.wire(gnssPos, alt, 1)
  s.wire(gnssFix, alt, 2)
  s.wire(arming, alt, 3, 0)
  // Altitude Hold and the altitude controller (100 Hz); GPS Rescue (Phase 12) suppresses it
  const altHold = s.add('subsystem', 'AltHold', {
    ...subsystem(['sticks', 'armed', 'failsafe_stage', 'failsafe_procedure', 'alt_est', 'vario_est', 'euler_est', 'rescue_active',
      'rescue_target_cm', 'rescue_step_cm', 'rescue_run', 'rescue_reset'],
      ['active', 'throttle', 'throttle_raised'], buildAltHoldSheet(altitude0 > 0, apThrottleMaxUs)),
    sampleTimeSec: FC.autopilot.ts,
  })
  if (altHold !== altHoldId) throw new Error('AltHold id')
  s.wire(sticks, altHold, 0)
  s.wire(arming, altHold, 1, 0)
  s.wire(failsafe, altHold, 2, 1)
  s.wire(failsafe, altHold, 3, 3)
  s.wire(alt, altHold, 4, 0)
  s.wire(alt, altHold, 5, 1)
  s.wire(att, altHold, 6, 1)
  // GPS Rescue (100 Hz): drives the shared altitude controller, angles, yaw and the IMU
  const rescue = s.add('subsystem', 'GpsRescue', {
    ...subsystem(['sticks', 'armed', 'failsafe_stage', 'failsafe_procedure', 'rc_link_valid', 'heading_deg', 'home_valid', 'home_distance_m',
      'home_bearing_deg', 'alt_est', 'gnss_course', 'gnss_fix', 'accel'],
    RESCUE_OUTPUTS,
    buildGpsRescueSheet(magnetometer)),
    sampleTimeSec: FC.rescue.ts,
  })
  if (rescue !== `${s.id}__GpsRescue`) throw new Error('GpsRescue id')
  s.wire(sticks, rescue, 0)
  s.wire(arming, rescue, 1, 0)
  s.wire(failsafe, rescue, 2, 1)
  s.wire(failsafe, rescue, 3, 3)
  s.wire(link, rescue, 4)
  s.wire(`${s.id}__HeadingTrue`, rescue, 5)
  s.wire(`${s.id}__Home`, rescue, 6, 0)
  s.wire(`${s.id}__Home`, rescue, 7, 1)
  s.wire(`${s.id}__Home`, rescue, 8, 2)
  s.wire(alt, rescue, 9, 0)
  s.wire(gnssCourse, rescue, 10)
  s.wire(gnssFix, rescue, 11)
  s.wire(acc, rescue, 12)
  const rescueActive: [string, number] = [rescue, rOut('active')]
  s.wire(rescue, altHold, 7, rOut('active'))
  s.wire(rescue, altHold, 8, rOut('alt_target_cm'))
  s.wire(rescue, altHold, 9, rOut('alt_step_cm'))
  s.wire(rescue, altHold, 10, rOut('alt_run'))
  s.wire(rescue, altHold, 11, rOut('alt_reset'))
  // Position Hold (100 Hz, its controller on each fix); also forces angle mode through Alt Hold's switch rules
  const posHold = s.add('subsystem', 'PosHold', {
    ...subsystem(['sticks', 'armed', 'failsafe_stage', 'failsafe_procedure', 'throttle_raised', 'gnss_pos', 'gnss_fix', 'gnss_course', 'euler_est', 'gps_heading_ok', 'rescue_active'],
      ['active', 'in_control', 'angle', 'fail'], buildPosHoldSheet(magnetometer, posHoldWithoutMag)),
    sampleTimeSec: FC.autopilot.ts,
  })
  if (posHold !== posHoldId) throw new Error('PosHold id')
  s.wire(sticks, posHold, 0)
  s.wire(arming, posHold, 1, 0)
  s.wire(failsafe, posHold, 2, 1)
  s.wire(failsafe, posHold, 3, 3)
  s.wire(altHold, posHold, 4, 2)
  s.wire(gnssPos, posHold, 5)
  s.wire(gnssFix, posHold, 6)
  s.wire(gnssCourse, posHold, 7)
  s.wire(att, posHold, 8, 1)
  s.wire(att, posHold, 9, 2)
  s.wire(rescueActive[0], posHold, 10, rescueActive[1])
  const pid = s.add('subsystem', 'RatePID', subsystem(['setpoint', 'gyro_dps', 'iterm_enable', 'angle_mode'], ['pid'], buildRatePidSheet()))
  s.wire(setpoint, pid, 0)
  s.wire(filt, pid, 1, 0)
  s.wire(arming, pid, 2, 1)
  s.wire(angle, pid, 3, 1)
  const mixer = s.add('subsystem', 'Mixer', subsystem(['pid', 'throttle'], ['motors'], buildMixerSheet()))
  s.wire(pid, mixer, 0, 0)
  s.wire(rates, mixer, 1, 1)
  // Disarmed: motors stopped
  const motors = s.add('multiply', 'MotorsArmed', { numInputs: 2 })
  s.wire(mixer, motors, 0)
  s.wire(arming, motors, 1, 0)

  s.output('motors', motors, 'double[4]')
  s.output('setpoint', setpoint, 'double[3]')
  s.output('gyro_dps', filt, 'double[3]')
  s.output('euler_est', att, 'double[3]', 1)
  s.output('quat_est', att, 'double[4][1]', 0)
  // True heading: the estimate's grid yaw plus the grid convergence, 0–360°
  const yawEst = s.add('selector', 'YawEstimate', { indices: [2] })
  s.wire(att, yawEst, 0, 1)
  const heading = s.add('evaluate', 'HeadingTrue', { numInputs: 2, expression: `fmod(in(0) * ${180 / Math.PI} + in(1) + 720.0, 360.0)` })
  s.wire(yawEst, heading, 0)
  s.wire(gamma, heading, 1)
  s.output('heading_deg', heading, 'double')

  // Home (from GNSS, as Betaflight) and the flight-mode flags
  const home = s.add('subsystem', 'Home', subsystem(['armed', 'gnss_pos', 'gnss_fix', 'grid_convergence_deg'], ['home_valid', 'home_distance_m', 'home_bearing_deg'], buildHomeSheet()))
  s.wire(arming, home, 0, 0)
  s.wire(gnssPos, home, 1)
  s.wire(gnssFix, home, 2)
  s.wire(gamma, home, 3)
  s.output('fc_armed', arming, 'double', 0)
  s.output('fc_angle_mode', angle, 'double', 1)
  s.output('fc_airmode', arming, 'double', 1)
  s.output('home_valid', home, 'double', 0)
  s.output('home_distance_m', home, 'double', 1)
  s.output('home_bearing_deg', home, 'double', 2)
  // Flight-mode text code (FC_MODE), in Betaflight's priority order
  const mode = s.add('evaluate', 'FlightMode', {
    numInputs: 6,
    expression: `(in(0) > 0.5) ? ${FC_MODE.failsafe}.0 : ((in(5) > 0.5) ? ${FC_MODE.rescue}.0 : ((in(4) > 0.5) ? ${FC_MODE.posHold}.0 : ((in(3) > 0.5) ? ${FC_MODE.altHold}.0 : ((in(1) > 0.5) ? ${FC_MODE.angle}.0 : ((in(2) > 0.5) ? ${FC_MODE.air}.0 : ${FC_MODE.acro}.0)))))`,
  })
  s.wire(`${s.id}__GpsRescue`, mode, 5, rOut('active'))
  s.wire(failsafe, mode, 0, 1)
  s.wire(angle, mode, 1, 1)
  s.wire(arming, mode, 2, 1)
  s.wire(altHold, mode, 3, 0)
  s.wire(posHold, mode, 4, 0)
  s.output('fc_mode', mode, 'double')
  // Warnings: arming reasons (while disarmed) and POSHOLD FAIL
  const warnings = s.add('evaluate', 'Warnings', { numInputs: 3, expression: `in(0) + ((in(1) > 0.5) ? ${FC_WARNING.posHoldFail}.0 : 0.0) + in(2)` })
  s.wire(arming, warnings, 0, 2)
  s.wire(posHold, warnings, 1, 3)
  s.wire(`${s.id}__GpsRescue`, warnings, 2, rOut('warnings'))
  s.output('fc_warnings', warnings, 'double')
  s.output('failsafe_stage', failsafe, 'double', 1)
  s.output('alt_est', alt, 'double', 0)
  s.output('vario_est', alt, 'double', 1)
  s.output('gps_heading_ok', att, 'double', 2)
  s.output('alt_hold_active', altHold, 'double', 0)
  s.output('pos_hold_active', posHold, 'double', 0)
  s.output('rescue_active', `${s.id}__GpsRescue`, 'double', rOut('active'))
  s.output('rescue_phase', `${s.id}__GpsRescue`, 'double', rOut('phase'))
  return s
}

// ---------------------------------------------------------------------------
// Top level

export const MOTOR_NAMES = ['Motor_RR', 'Motor_FR', 'Motor_RL', 'Motor_FL']
const MOTOR_OUTPUTS = ['omega', 'thrust', 'omega_dot', 'power']
const FRAME_OUTPUTS = ['pos_ned', 'vel_ned', 'quat', 'euler', 'omega', 'accel']
const FRAME_OUTPUT_TYPES = ['double[3]', 'double[3]', 'double[4][1]', 'double[3]', 'double[3]', 'double[3]']

/** The vehicle model's name; test models reference it by this name. */
export const FPV_VEHICLE_NAME = 'FPV Vehicle'

export interface FpvModelOptions {
  /**
   * The vehicle alone, for embedding with a model reference: the pilot's
   * sticks come in on a top-level Input Port "sticks" (double[8]) and the
   * Telemetry sheet holds only the Output Ports (no scopes, no Tests sheet).
   */
  vehicleOnly?: boolean
  /** Plant only: a constant motor command (default hover) instead of pilot and flight controller. */
  openLoop?: boolean
  motorCommand?: number[]
  sticks?: StickProfile
  /** Initial body rates (rad/s), e.g. to test disturbance rejection. */
  initialOmega?: number[]
  /** 'ideal' sensors report the true state exactly (no noise, bias or quantization). */
  sensors?: 'modelled' | 'ideal'
  /**
   * Initial attitude, ZYX Euler degrees [roll, pitch, yaw]. The attitude
   * estimator starts aligned to it (as if it had converged before take-off).
   */
  initialEuler?: number[]
  /** Initial height (m) above the field; 0 (default) starts at rest on the ground. */
  initialAltitude?: number
  /** Scheduled GNSS conditions and grid convergence (builds with a Pilot; vehicleOnly takes them as inputs) */
  conditions?: ConditionsProfile
  /**
   * A magnetometer is fitted (default true). Without one the mag output reads
   * 0, the attitude estimate starts at yaw 0 (as after power-up) and heading
   * comes from GPS course over ground, as in Betaflight.
   */
  magnetometer?: boolean
  /**
   * Betaflight pos_hold_without_mag (default off, as Betaflight): allow
   * Position Hold without a magnetometer once GPS heading is established.
   */
  posHoldWithoutMag?: boolean
  /** Betaflight ap_throttle_max (µs, default FC.autopilot.throttleMaxUs): the altitude controller's upper limit. */
  apThrottleMaxUs?: number
}

/** The vehicle model without a magnetometer (validation suite). */
export const FPV_VEHICLE_NO_MAG_NAME = 'FPV Vehicle No Mag'

export function buildFpvModel(opts: FpvModelOptions = {}): { name: string; data: Record<string, unknown> } {
  const main = new SheetBuilder('main', 'Main')
  // Model outputs and scopes live on their own top-level sheet, fed by sheet
  // labels, so the main diagram stays about the vehicle
  const telemetry = new SheetBuilder('telemetry', 'Telemetry')
  const published = new Map<string, string>()
  const publish = (name: string, from: string, dataType: string, port = 0) => {
    const tag = main.add('sheet_label_sink', `Tag_${name}`, { signalName: name })
    main.wire(from, tag, 0, port)
    const src = telemetry.add('sheet_label_source', `From_${name}`, { signalName: name })
    telemetry.output(name, src, dataType)
    published.set(name, src)
  }
  const initialQuat = eulerToQuat(opts.initialEuler ?? [0, 0, 0])
  const magnetometer = opts.magnetometer ?? true
  const altitude0 = Math.max(0, opts.initialAltitude ?? 0)
  const split = main.add('demux', 'MotorCmdSplit', { outputCount: 4, inputDimensions: [4] })
  let fc: string | null = null
  /** Where each non-stick vehicle input comes from: [block id, port] */
  const conditionSource = new Map<string, [string, number]>()
  const wireCondition = (name: string, to: string, toPort: number) => {
    const src = conditionSource.get(name)
    if (src) main.wire(src[0], to, toPort, src[1])
  }
  // Input Port order is the vehicle's interface: sticks first, then the rest
  const sticksPort = opts.vehicleOnly && !opts.openLoop ? main.input('sticks', 'double[8]') : null
  // The vehicle's other inputs (GNSS conditions, grid convergence, link,
  // failsafe procedure, wind): Input Ports on the vehicle, or a Conditions schedule
  if (opts.vehicleOnly) {
    for (const [name, type] of VEHICLE_INPUTS.slice(1)) conditionSource.set(name, [main.input(name, type), 0])
  } else {
    const names = VEHICLE_INPUTS.slice(1).map(([n]) => n)
    const cond = main.add('subsystem', 'Conditions', subsystem([], names, buildConditionsSheet(opts.conditions)))
    names.forEach((n, k) => conditionSource.set(n, [cond, k]))
  }
  if (opts.openLoop) {
    const hover = Number(HOVER_COMMAND.toFixed(6))
    const cmd = main.constant('MotorCmd', opts.motorCommand ?? [hover, hover, hover, hover], 'double[4]')
    main.wire(cmd, split)
  } else {
    const pilot = sticksPort
      ? sticksPort
      : main.add('subsystem', 'Pilot', subsystem([], ['sticks'], buildPilotSheet(opts.sticks ?? DEMO_STICKS)))

    fc = main.add('subsystem', 'FlightController', {
      ...subsystem(['sticks', 'gyro', 'accel', 'mag', 'pressure', 'grid_convergence_deg', 'gnss_pos', 'gnss_fix', 'rc_link_valid', 'failsafe_procedure', 'gnss_course'], FC_OUTPUTS,
        buildFlightControllerSheet(magnetometer ? initialQuat : eulerToQuat([...(opts.initialEuler ?? [0, 0, 0]).slice(0, 2), 0]), altitude0, magnetometer, opts.posHoldWithoutMag ?? FC.posHold.withoutMag, opts.apThrottleMaxUs), FC_SIZE),
      sampleTimeSec: FC.ts,
    })
    main.wire(pilot, fc, 0)
    main.wire(fc, split, 0, 0)
  }

  const motorDef = buildMotorSheet()
  const motorIds = MOTOR_NAMES.map((name, i) => {
    const params =
      i === 0
        ? subsystem(['cmd', 'voltage'], MOTOR_OUTPUTS, motorDef, MOTOR_SIZE)
        : {
            ...MOTOR_SIZE,
            inputPorts: ['cmd', 'voltage'],
            outputPorts: MOTOR_OUTPUTS,
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
  const accelVec = main.add('mux', 'RotorAccelerations', { rows: 4, cols: 1, baseType: 'double', outputType: 'double[4]' })
  const powerVec = main.add('mux', 'MotorPower', { rows: 4, cols: 1, baseType: 'double', outputType: 'double[4]' })
  motorIds.forEach((id, i) => {
    main.wire(id, thrustVec, i, 1)
    main.wire(id, omegaVec, i, 0)
    main.wire(id, accelVec, i, 2)
    main.wire(id, powerVec, i, 3)
  })
  // Supply: the battery model, or (open loop) a fixed reference voltage
  let supply: string
  if (opts.openLoop) {
    supply = main.constant('SupplyVoltage', BATTERY.referenceVoltage, 'double')
  } else {
    supply = main.add('subsystem', 'Battery', subsystem(['motor_power'], ['voltage', 'current', 'soc'], buildBatterySheet()))
    main.wire(powerVec, supply)
    publish('battery_voltage', supply, 'double', 0)
    publish('battery_current', supply, 'double', 1)
    publish('battery_soc', supply, 'double', 2)
    // Charge drawn, as Betaflight's mAh counter: (1 − SOC) × capacity
    const mah = main.add('evaluate', 'MahDrawn', { numInputs: 1, expression: `(1.0 - in(0)) * ${BATTERY.capacityAh * 1000}` })
    main.wire(supply, mah, 0, 2)
    publish('battery_mah_drawn', mah, 'double')
  }
  motorIds.forEach(id => main.wire(supply, id, 1, 0))

  const z0 = altitude0 > 0 ? -LOCATION.elevationM - altitude0 : -LOCATION.elevationM + GROUND_REST_Z
  const frame = main.add('subsystem', 'Frame', subsystem(['thrust', 'rotor_accel', 'wind_ned'], FRAME_OUTPUTS, buildFrameSheet(opts.initialOmega, initialQuat, [0, 0, z0]), FRAME_SIZE))
  main.wire(thrustVec, frame, 0)
  main.wire(accelVec, frame, 1)
  wireCondition('wind_ned', frame, 2)
  if (fc) {
    const sensors = main.add('subsystem', 'Sensors', subsystem(
      ['pos_ned', 'quat', 'omega', 'specific_force', 'grid_convergence_deg', 'vel_ned', 'gnss_env'], ['gyro', 'accel', 'mag', 'pressure', ...GNSS_OUTPUTS],
      buildSensorsSheet(opts.sensors === 'ideal', altitude0, magnetometer), SENSORS_SIZE))
    main.wire(frame, sensors, 0, 0)
    main.wire(frame, sensors, 1, 2)
    main.wire(frame, sensors, 2, 4)
    main.wire(frame, sensors, 3, 5)
    wireCondition('grid_convergence_deg', sensors, 4)
    main.wire(frame, sensors, 5, 1)
    wireCondition('gnss_env', sensors, 6)
    for (let i = 0; i < 4; i++) main.wire(sensors, fc, i + 1, i)
    wireCondition('grid_convergence_deg', fc, 5)
    main.wire(sensors, fc, 6, 4)
    main.wire(sensors, fc, 7, 6)
    wireCondition('rc_link_valid', fc, 8)
    wireCondition('failsafe_procedure', fc, 9)
    main.wire(sensors, fc, 10, 7)
    publish('imu_gyro', sensors, 'double[3]', 0)
    publish('imu_accel', sensors, 'double[3]', 1)
    publish('mag', sensors, 'double[3]', 2)
    publish('pressure', sensors, 'double', 3)
    GNSS_OUTPUTS.forEach((name, k) => publish(name, sensors, GNSS_OUTPUT_TYPES[k]!, 4 + k))
  }

  FRAME_OUTPUTS.forEach((name, i) => publish(name, frame, FRAME_OUTPUT_TYPES[i]!, i))
  publish('motor_omega', omegaVec, 'double[4]')
  if (fc) {
    // Flight-controller outputs, published under their port names
    const fcOut = (name: string) => FC_OUTPUTS.indexOf(name)
    publish('motor_cmd', fc, 'double[4]', fcOut('motors'))
    publish('rate_setpoint', fc, 'double[3]', fcOut('setpoint'))
    publish('gyro_dps', fc, 'double[3]', fcOut('gyro_dps'))
    publish('euler_est', fc, 'double[3]', fcOut('euler_est'))
    publish('quat_est', fc, 'double[4][1]', fcOut('quat_est'))
    for (const name of ['heading_deg', 'fc_armed', 'fc_angle_mode', 'fc_airmode', 'home_valid', 'home_distance_m', 'home_bearing_deg', 'fc_mode', 'fc_warnings', 'failsafe_stage', 'alt_est', 'vario_est', 'gps_heading_ok', 'alt_hold_active', 'pos_hold_active', 'rescue_active', 'rescue_phase']) {
      publish(name, fc, 'double', fcOut(name))
    }
  }

  // Scopes, on the Telemetry sheet
  const displays: Array<[string, string]> = [
    ['Position', 'pos_ned'],
    ['Attitude', 'euler'],
    ['RotorSpeed', 'motor_omega'],
  ]
  if (fc) {
    displays.push(['RateSetpoint', 'rate_setpoint'], ['GyroRate', 'gyro_dps'], ['MotorCommand', 'motor_cmd'],
      ['AttitudeEstimate', 'euler_est'], ['AltitudeEstimate', 'alt_est'], ['Battery', 'battery_voltage'])
  } else {
    displays.push(['BodyRates', 'omega'])
  }
  if (!opts.vehicleOnly) {
    for (const [label, signal] of displays) {
      const d = telemetry.add('signal_display', label, { maxSamples: 10000 })
      telemetry.wire(published.get(signal)!, d)
    }
  }

  // The default demo flight carries its pass/fail checks on a Tests sheet
  const isDefaultDemo =
    !!fc && !opts.vehicleOnly && opts.sticks === undefined && !opts.initialAltitude && !opts.initialEuler && !opts.initialOmega
  let sheets: Sheet[] = [main.sheet(), telemetry.sheet()]
  if (isDefaultDemo) sheets.push(buildTestsSheet().sheet())
  sheets = tuneModelLayout(sheets as any, null, {
    ...DEFAULT_TUNE_OPTIONS,
    cleanUpLayout: true,
    resizeSubsystems: false,
    scope: 'model',
  }).sheets as unknown as Sheet[]
  fitExtents(sheets)

  const model = {
    name: 'FPV Quadcopter',
    data: {
      version: '2.2',
      metadata: {
        created: '2026-10-19T00:00:00.000Z',
        description:
          '5-inch FPV quadcopter reference model. ' +
          'NED world / FRD body axes, quaternion 6-DOF rigid body, four first-order motor/propeller subsystems, ' +
          'and a Betaflight-style acro flight controller at 1 kHz (rates, gyro PT1 filters, rate PID with feed-forward, ' +
          'quad-X mixer with airmode) re-implemented from documented behaviour and defaults. ' +
          `Site: ${LOCATION.name}, ${LOCATION.latitudeDeg} N ${-LOCATION.longitudeDeg} W, elevation ${LOCATION.elevationM.toFixed(1)} m; ` +
          `WMM2025 field (${LOCATION.epoch}) N/E/D ${SITE_FIELD.ned.join(' / ')} uT. ` +
          'Sensors: IMU (gyro, accelerometer) at 1 kHz, magnetometer at 100 Hz and barometer at 50 Hz with datasheet noise, ' +
          'bias, quantization and range; the controller flies on the sensor gyro and runs a Mahony attitude filter and a ' +
          'baro/accelerometer altitude filter. ' +
          'Motors draw from a 4S LiPo battery model (state of charge, internal resistance; speed scales with voltage) and ' +
          'their rotor-acceleration reaction torque is included. ' +
          'Ground contact (spring-damper legs) and Betaflight-style arming: the Pilot subsystem arms at 0.25 s, takes off ' +
          'from rest on the field, hovers, then in angle (self-level) mode flies a 24 deg bank, an 18 deg forward pitch and a ' +
          'yaw turn. Model outputs and scopes are on the Telemetry sheet (run results show there). ' +
          'Assert blocks on the Tests sheet check the flight: arming, the climb, each manoeuvre, the estimators and the ' +
          'battery (npm run obliq:test -- "FPV Quadcopter"). ' +
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
  if (opts.vehicleOnly) {
    model.name = magnetometer ? FPV_VEHICLE_NAME : FPV_VEHICLE_NO_MAG_NAME
    model.data.metadata.description =
      '5-inch FPV quadcopter vehicle, for embedding in test models with a Model Reference block. ' +
      'Frame and 6-DOF body, four motor/propeller subsystems, 4S battery, IMU/magnetometer/barometer models, ground contact ' +
      `and a Betaflight-style flight controller (acro and angle modes, arming, Mahony and altitude estimators) at ${LOCATION.name}. ` +
      'Inputs: sticks = [roll, pitch, yaw, throttle, AUX1 angle mode, AUX2 arm, AUX3 GPS rescue, AUX4 hold (3-position)] (double[8], sticks -1..1, throttle 0..1, switches above 0.5 on); ' +
      'gnss_env = [satellites, HDOP, VDOP, UERE scale]; grid_convergence_deg; rc_link_valid; failsafe_procedure (0 drop, 1 auto-land, 2 GPS rescue); wind_ned (m/s). ' +
      'Outputs (Telemetry sheet): the true state, sensor readings, motor commands and speeds, rate setpoints, estimates and battery. ' +
      'Test models such as "FPV Demo Flight" drive it and check it with Assert blocks. Built by scripts/build-fpv-reference-model.ts; ' +
      'see docs/fpv-reference-model-plan.md.'
  }
  return model
}

// ---------------------------------------------------------------------------
// Test models: a Pilot and the FPV Vehicle (by model reference), with scopes
// on a Telemetry sheet and Assert blocks on a Tests sheet

export interface FpvTestSpec {
  name: string
  description: string
  sticks: StickProfile
  /** Simulated seconds */
  duration: number
  /** Telemetry scopes: [label, vehicle output] */
  displays: Array<[string, string]>
  /** The Tests sheet (Assert blocks reading vehicle outputs through sheet labels) */
  tests: () => SheetBuilder
  /** GNSS conditions and grid convergence over time (defaults: open sky, the site's γ) */
  conditions?: ConditionsProfile
  /** The vehicle model to reference by name (default FPV_VEHICLE_NAME) */
  vehicleName?: string
}

/**
 * A test model that embeds the vehicle. The reference records the vehicle's
 * name, so it resolves after the models are imported or seeded (new ids).
 */
export function buildFpvTestModel(spec: FpvTestSpec): { name: string; data: Record<string, unknown> } {
  const vehicle = buildFpvModel({ vehicleOnly: true })
  const iface = modelInterface(vehicle.data as any)

  const telemetry = new SheetBuilder('telemetry', 'Telemetry')
  for (const [label, signal] of spec.displays) {
    const src = telemetry.add('sheet_label_source', `From_${signal}`, { signalName: signal })
    const d = telemetry.add('signal_display', label, { maxSamples: 10000 })
    telemetry.wire(src, d)
  }
  const tests = spec.tests()

  // Publish from the vehicle every output the other sheets read
  const used = new Set<string>()
  for (const sheet of [telemetry, tests]) {
    for (const b of sheet.blocks) {
      if (b.type === 'sheet_label_source') used.add(String(b.parameters?.signalName))
    }
  }
  const main = new SheetBuilder('main', 'Main')
  const pilot = main.add('subsystem', 'Pilot', subsystem([], ['sticks'], buildPilotSheet(spec.sticks)))
  const vehicleBlock = main.add('subsystem', 'Vehicle', {
    showPortNames: true,
    sheets: [],
    inputPorts: iface.inputs,
    outputPorts: iface.outputs,
    modelRef: { modelId: FPV_VEHICLE_REF_ID, version: null, name: spec.vehicleName ?? FPV_VEHICLE_NAME },
    modelRefName: spec.vehicleName ?? FPV_VEHICLE_NAME,
  })
  main.wire(pilot, vehicleBlock, iface.inputs.indexOf('sticks'))
  // Every other vehicle input comes from the Conditions schedule, by name
  const condOutputs = VEHICLE_INPUTS.slice(1).map(([n]) => n)
  const conditions = main.add('subsystem', 'Conditions', subsystem([], condOutputs, buildConditionsSheet(spec.conditions)))
  for (const name of iface.inputs) {
    if (name === 'sticks') continue
    const k = condOutputs.indexOf(name)
    if (k < 0) throw new Error(`${spec.name}: no Conditions output for vehicle input ${name}`)
    main.wire(conditions, vehicleBlock, iface.inputs.indexOf(name), k)
  }
  for (const signal of iface.outputs) {
    if (!used.has(signal)) continue
    const tag = main.add('sheet_label_sink', `Tag_${signal}`, { signalName: signal })
    main.wire(vehicleBlock, tag, 0, iface.outputs.indexOf(signal))
  }
  const missing = [...used].filter(sig => !iface.outputs.includes(sig))
  if (missing.length) throw new Error(`${spec.name}: the vehicle has no output ${missing.join(', ')}`)

  let sheets: Sheet[] = [main.sheet(), telemetry.sheet(), tests.sheet()]
  sheets = tuneModelLayout(sheets as any, null, {
    ...DEFAULT_TUNE_OPTIONS,
    cleanUpLayout: true,
    resizeSubsystems: false,
    scope: 'model',
  }).sheets as unknown as Sheet[]
  fitExtents(sheets)
  return {
    name: spec.name,
    data: {
      version: '2.2',
      metadata: { created: '2026-10-21T00:00:00.000Z', description: spec.description },
      globalSettings: { simulationTimeStep: FPV.dt, simulationDuration: spec.duration, integrationAlgorithm: 'rk4', debugMath: false },
      parameters: [],
      dataStores: [],
      sheets,
    },
  }
}

/**
 * Placeholder id for the vehicle in shipped test models. No store has it, so
 * the reference falls back to the model named FPV_VEHICLE_NAME (and the
 * editor then records that model's real id).
 */
export const FPV_VEHICLE_REF_ID = 'reference-model:fpv-vehicle'

const DEMO_DISPLAYS: Array<[string, string]> = [
  ['Position', 'pos_ned'], ['Attitude', 'euler'], ['RotorSpeed', 'motor_omega'], ['RateSetpoint', 'rate_setpoint'],
  ['GyroRate', 'gyro_dps'], ['MotorCommand', 'motor_cmd'], ['AttitudeEstimate', 'euler_est'],
  ['AltitudeEstimate', 'alt_est'], ['Battery', 'battery_voltage'],
]

/** The default demo flight as a test model: the original FPV model's Pilot, scopes and Tests sheet. */
export function buildFpvDemoFlightModel() {
  return buildFpvTestModel({
    name: 'FPV Demo Flight',
    description:
      'Test model for the FPV Vehicle: the Pilot arms at 0.25 s, takes off from the field, hovers, then in angle mode flies a ' +
      '24 deg bank, an 18 deg forward pitch and a yaw turn. The Vehicle block is a Model Reference to "FPV Vehicle". ' +
      'Scopes are on the Telemetry sheet; Assert blocks on the Tests sheet check arming, the climb, each manoeuvre, ' +
      'the estimators and the battery (npm run obliq:test -- "FPV Demo Flight").',
    sticks: DEMO_STICKS,
    duration: 5,
    displays: DEMO_DISPLAYS,
    tests: buildTestsSheet,
  })
}

/**
 * Acro rate step: take off as in the demo, then in acro mode a 0.3 roll stick
 * step (75 deg/s) held 0.23 s, reversed for 0.23 s to roll back, and released.
 */
export const ACRO_STEP_STICKS: StickProfile = {
  roll: [[0, 0], [2.0, 0], [2.02, 0.3], [2.25, 0.3], [2.27, -0.3], [2.5, -0.3], [2.52, 0]],
  pitch: [[0, 0]],
  yaw: [[0, 0]],
  throttle: DEMO_STICKS.throttle,
  aux: [[0, 0]],
  arm: DEMO_STICKS.arm,
}

/** Limits for the acro rate step (deg/s and deg), around the flown response. */
export const ACRO_STEP_TESTS = {
  /** After the overshoot, roll rate within this of the 75 deg/s setpoint */
  rateTrackDps: 10,
  rollRightWindow: [2.14, 2.25] as [number, number],
  rollLeftWindow: [2.42, 2.5] as [number, number],
  /** Peak roll rate while stepping (the reversal swings 150 deg/s) */
  peakDps: 140,
  stepWindow: [2.0, 2.6] as [number, number],
  /** Pitch and yaw rates stay quiet during a pure roll step */
  crossAxisDps: 5,
  /** Back within this of level once the stick is released */
  levelFrom: 2.7,
  levelDeg: 3,
  uprightDeg: 60,
}

function buildAcroStepTestsSheet(): SheetBuilder {
  const t = ACRO_STEP_TESTS
  const s = new SheetBuilder('tests', 'Tests')
  const R2D = Number((180 / Math.PI).toFixed(4))
  const from = (signal: string) => s.add('sheet_label_source', `From_${signal}`, { signalName: signal })
  const pick = (name: string, src: string, indices: number[]) => {
    const id = s.add('selector', name, { indices })
    s.wire(src, id)
    return id
  }
  const check = (name: string, input: string, params: Record<string, unknown>, expected?: string) => {
    const id = s.add('assert', name, { mode: 'bounds', checkFrom: 0, checkUntil: null, onFailure: 'record', ...params })
    s.wire(input, id, 0)
    if (expected) s.wire(expected, id, 1)
  }
  const gyro = from('gyro_dps')
  const setpoint = from('rate_setpoint')
  const eulerDeg = s.add('scale', 'EulerDeg', { gain: R2D })
  s.wire(from('euler'), eulerDeg)
  const rollRate = pick('RollRate', gyro, [0])
  const rollSetpoint = pick('RollRateSetpoint', setpoint, [0])
  const pitchYawRate = pick('PitchYawRate', gyro, [1, 2])
  const rollPitch = pick('RollPitch', eulerDeg, [0, 1])

  const track = { mode: 'near', absTol: t.rateTrackDps, relTol: 0 }
  check('RollRateTracksRight', rollRate, { ...track, checkFrom: t.rollRightWindow[0], checkUntil: t.rollRightWindow[1] }, rollSetpoint)
  check('RollRateTracksLeft', rollRate, { ...track, checkFrom: t.rollLeftWindow[0], checkUntil: t.rollLeftWindow[1] }, rollSetpoint)
  check('RollRatePeakBounded', rollRate, { lower: -t.peakDps, upper: t.peakDps, checkFrom: t.stepWindow[0], checkUntil: t.stepWindow[1] })
  check('PitchYawQuiet', pitchYawRate, { lower: -t.crossAxisDps, upper: t.crossAxisDps, checkFrom: t.stepWindow[0], checkUntil: t.stepWindow[1] })
  check('ReturnsLevel', pick('Roll', eulerDeg, [0]), { lower: -t.levelDeg, upper: t.levelDeg, checkFrom: t.levelFrom })
  check('StaysUpright', rollPitch, { lower: -t.uprightDeg, upper: t.uprightDeg, onFailure: 'stop' })
  return s
}

/** A focused test model: the acro roll-rate step response. */
export function buildFpvAcroRateStepModel() {
  return buildFpvTestModel({
    name: 'FPV Acro Rate Step',
    description:
      'Test model for the FPV Vehicle: after take-off, in acro mode, a 75 deg/s roll-rate step and its reversal. ' +
      'Assert blocks on the Tests sheet check that the roll rate settles on its setpoint, the overshoot is bounded, ' +
      'pitch and yaw stay quiet, and the quad returns level. The Vehicle block is a Model Reference to "FPV Vehicle" ' +
      '(npm run obliq:test -- "FPV Acro Rate Step").',
    sticks: ACRO_STEP_STICKS,
    duration: 3,
    displays: [['GyroRate', 'gyro_dps'], ['RateSetpoint', 'rate_setpoint'], ['Attitude', 'euler'], ['MotorCommand', 'motor_cmd']],
    tests: buildAcroStepTestsSheet,
  })
}

/** The FPV files shipped in reference-models/: [file name, model]. */
export function SHIPPED_FPV_MODELS(): Array<[string, { name: string; data: Record<string, unknown> }]> {
  return [
    ['fpv-vehicle.json', buildFpvModel({ vehicleOnly: true })],
    ['fpv-demo-flight.json', buildFpvDemoFlightModel()],
    ['fpv-acro-rate-step.json', buildFpvAcroRateStepModel()],
  ]
}

/**
 * T00: the Tests-sheet helpers checked on signals with known answers (a
 * ramp, a 0.5 Hz sine, unit Gaussian noise), so the test infrastructure is
 * itself tested. No vehicle.
 */
export function buildFpvHelpersTestModel(): { name: string; data: Record<string, unknown> } {
  const s = new SheetBuilder('tests', 'Tests')
  const h = new TestHelpers(s)
  const t = h.clock()
  const check = (name: string, input: string, lower: number, upper: number, from = 0, until: number | null = null) => {
    const id = s.add('assert', name, { mode: 'bounds', lower, upper, checkFrom: from, checkUntil: until, onFailure: 'record' })
    s.wire(input, id)
  }
  const after2 = s.add('evaluate', 'After2s', { numInputs: 1, expression: '(in(0) > 2.0) ? 1.0 : 0.0' })
  s.wire(t, after2)
  const sine = s.add('evaluate', 'Sine', { numInputs: 1, expression: `sin(${Math.PI} * in(0))` })
  s.wire(t, sine)
  const noise = s.add('random_noise', 'UnitNoise', { distribution: 'gaussian', mean: 0, stdDev: 1, seed: 7, sampleTime: 0, dataType: 'double' })
  const phase = s.add('evaluate', 'WholeSeconds', { numInputs: 1, expression: 'floor(in(0))' })
  s.wire(t, phase)

  const latched = h.latch('LatchAfter2s', after2)
  check('LatchOffBefore', latched, 0, 0, 0, 1.99)
  check('LatchOnAfter', latched, 1, 1, 2.01)
  const first = h.firstTime('FirstAfter2s', after2)
  check('FirstTimeUnsetBefore', first, -1, -1, 0, 1.99)
  check('FirstTimeRecorded', first, 2.0, 2.0011, 2.01)
  check('RunningMax', h.runMax('SineMax', sine), 0.999, 1.0, 1.6)
  check('RunningMin', h.runMin('SineMin', sine), -1.0, -0.999, 1.6)
  check('HeldAt3s', h.heldAt('ClockAt3s', t, 3), 2.999, 3.0, 3.01)
  // Two whole periods: mean of sin² is 1/2
  check('SineMeanSquare', h.windowMeanSquare('SineMS', sine, 1, 5), 0.499, 0.501, 5.01)
  // 8000 unit-variance samples: the estimate's standard deviation is 0.016
  check('NoiseMeanSquare', h.windowMeanSquare('NoiseMS', noise, 1, 5), 0.95, 1.05, 5.01)
  // A half-period lag (1 s) inverts the sine; a quarter period (0.5 s) is uncorrelated
  check('CorrHalfPeriod', h.windowCorr('SineCorr1s', sine, 10, 0.1, 1, 5.5), -1.0, -0.98, 5.51)
  check('CorrQuarterPeriod', h.windowCorr('SineCorr05s', sine, 5, 0.1, 1, 5.5), -0.05, 0.05, 5.51)
  const visited = h.phaseVisited('Visited3', phase, 3)
  check('PhaseNotYetVisited', visited, 0, 0, 0, 2.99)
  check('PhaseVisited', visited, 1, 1, 3.01)
  // sin(π·t) captured when the clock first passes 2.5 s: 1
  const after2_5 = s.add('evaluate', 'After2_5s', { numInputs: 1, expression: '(in(0) >= 2.5) ? 1.0 : 0.0' })
  s.wire(t, after2_5)
  const sineAt = h.heldWhen('SineWhenPast2_5', sine, after2_5)
  check('HeldWhenUnsetBefore', sineAt, 0, 0, 0, 2.49)
  check('HeldWhenCaptured', sineAt, 0.9999, 1.0, 2.51)
  // Mean of sin over the samples where it is positive (whole half-periods in 0–4 s): 2/π
  const positive = s.add('evaluate', 'SinePositive', { numInputs: 2, expression: '(in(0) > 0.0 && in(1) < 4.0) ? 1.0 : 0.0' })
  s.wire(sine, positive, 0)
  s.wire(t, positive, 1)
  check('MeanWhileGated', h.meanWhile('SineMeanPositive', sine, positive), 2 / Math.PI - 0.001, 2 / Math.PI + 0.001, 4.01)

  let sheets: Sheet[] = [s.sheet()]
  sheets = tuneModelLayout(sheets as any, null, { ...DEFAULT_TUNE_OPTIONS, cleanUpLayout: true, resizeSubsystems: false, scope: 'model' }).sheets as unknown as Sheet[]
  fitExtents(sheets)
  return {
    name: 'FPV T00 Test Helpers',
    data: {
      version: '2.2',
      metadata: {
        created: '2026-10-28T00:00:00.000Z',
        description:
          'Checks the Tests-sheet helpers used by the FPV test models (latch, first-event time, running extremes, ' +
          'value held at a time, windowed mean square and lag correlation, phase visited) on a ramp, a 0.5 Hz sine ' +
          'and unit Gaussian noise. See docs/fpv-hud-gnss-test-plan.md.',
      },
      globalSettings: { simulationTimeStep: FPV.dt, simulationDuration: 6, integrationAlgorithm: 'rk4', debugMath: false },
      parameters: [],
      dataStores: [],
      sheets,
    },
  }
}

/** Sticks for T06: the demo take-off in angle mode, then a yaw turn of about 90°. */
export const GRID_TEST_STICKS: StickProfile = {
  roll: [[0, 0]],
  pitch: [[0, 0]],
  yaw: [[0, 0], [3.0, 0], [3.05, 0.5], [3.5, 0.5], [3.55, 0]],
  throttle: DEMO_STICKS.throttle,
  aux: [[0, 1]],
  arm: DEMO_STICKS.arm,
}

/** T06 limits (deg) and the γ step time (s). */
export const GRID_TEST = { gammaStepTime: 6, headingDeg: 0.01, estimateDeg: 3, turnedDeg: 60, duration: 10 }

/**
 * T06 Tests sheet: heading is the estimate's grid yaw plus γ (exactly: the
 * arithmetic is checked to 0.01°), it follows a change of γ, and the estimate
 * stays on the true grid yaw (3°, the estimator's error during the turn).
 */
function buildGridConvergenceTestsSheet(): SheetBuilder {
  const t = GRID_TEST
  const s = new SheetBuilder('tests', 'Tests')
  const R2D = 180 / Math.PI
  const from = (signal: string) => s.add('sheet_label_source', `From_${signal}`, { signalName: signal })
  const pick = (name: string, src: string, indices: number[]) => {
    const id = s.add('selector', name, { indices })
    s.wire(src, id)
    return id
  }
  const check = (name: string, input: string, params: Record<string, unknown>) => {
    const id = s.add('assert', name, { mode: 'bounds', checkFrom: 0, checkUntil: null, onFailure: 'record', ...params })
    s.wire(input, id, 0)
  }
  const euler = from('euler')
  const yawTrue = pick('YawTrue', euler, [2])
  const yawEst = pick('YawEstimate', from('euler_est'), [2])
  const heading = from('heading_deg')
  /** wrap(a − b·R2D − offset) to ±180° */
  const angleError = (name: string, a: string, b: string, aScale: number, offsetDeg: number) => {
    const id = s.add('evaluate', name, { numInputs: 2, expression: `fmod(in(0) * ${aScale} - in(1) * ${R2D} - ${offsetDeg} + 540.0, 360.0) - 180.0` })
    s.wire(a, id, 0)
    s.wire(b, id, 1)
    return id
  }
  const yawTrueDeg = s.add('scale', 'YawTrueDeg', { gain: R2D })
  s.wire(yawTrue, yawTrueDeg)
  check('YawTurnHappened', yawTrueDeg, { lower: t.turnedDeg, upper: null, checkFrom: 4.0 })
  check('HeadingIsEstimatePlusGamma', angleError('HeadingErrorSite', heading, yawEst, 1, LOCATION.gridConvergenceDeg),
    { lower: -t.headingDeg, upper: t.headingDeg, checkFrom: 0.01, checkUntil: t.gammaStepTime - 0.01 })
  check('HeadingFollowsGammaZero', angleError('HeadingErrorZero', heading, yawEst, 1, 0),
    { lower: -t.headingDeg, upper: t.headingDeg, checkFrom: t.gammaStepTime + 0.01 })
  check('EstimateOnGridYaw', angleError('EstimateYawError', yawEst, yawTrue, R2D, 0),
    { lower: -t.estimateDeg, upper: t.estimateDeg, checkFrom: 0.5 })
  const rollPitch = s.add('scale', 'RollPitchDeg', { gain: R2D })
  s.wire(pick('RollPitch', euler, [0, 1]), rollPitch)
  check('StaysUpright', rollPitch, { lower: -60, upper: 60, onFailure: 'stop' })
  return s
}

/** T06: grid convergence. */
export function buildFpvGridConvergenceTestModel() {
  return buildFpvTestModel({
    name: 'FPV T06 Grid Convergence',
    description:
      'Validation test for grid convergence (docs/fpv-hud-gnss-test-plan.md, T06): take off in angle mode, turn about 90° ' +
      `in yaw, and switch γ from ${LOCATION.gridConvergenceDeg}° to 0 at ${GRID_TEST.gammaStepTime} s. heading_deg is the ` +
      'grid yaw plus γ, the attitude estimate stays on grid yaw, and heading follows the change of γ.',
    sticks: GRID_TEST_STICKS,
    duration: GRID_TEST.duration,
    displays: [['Attitude', 'euler'], ['AttitudeEstimate', 'euler_est'], ['Heading', 'heading_deg']],
    tests: buildGridConvergenceTestsSheet,
    conditions: { gridConvergenceDeg: [[0, LOCATION.gridConvergenceDeg], [GRID_TEST.gammaStepTime, LOCATION.gridConvergenceDeg], [GRID_TEST.gammaStepTime + 0.001, 0]] },
  })
}

/**
 * Scaffolding for validation Tests sheets: one sheet label per vehicle
 * signal, element pickers, Evaluate expressions and Assert blocks.
 */
function testsSheet() {
  const s = new SheetBuilder('tests', 'Tests')
  const h = new TestHelpers(s)
  const labels = new Map<string, string>()
  const from = (signal: string) => {
    let id = labels.get(signal)
    if (!id) {
      id = s.add('sheet_label_source', `From_${signal}`, { signalName: signal })
      labels.set(signal, id)
    }
    return id
  }
  const pick = (name: string, src: string, indices: number[]) => {
    const id = s.add('selector', name, { indices })
    s.wire(src, id)
    return id
  }
  const expr = (name: string, expression: string, inputs: string[]) => {
    const id = s.add('evaluate', name, { numInputs: inputs.length, expression })
    inputs.forEach((x, i) => s.wire(x, id, i))
    return id
  }
  const check = (name: string, input: string, lower: number | null, upper: number | null, from_ = 0, until: number | null = null, onFailure = 'record') => {
    const id = s.add('assert', name, { mode: 'bounds', lower, upper, checkFrom: from_, checkUntil: until, onFailure })
    s.wire(input, id, 0)
  }
  const upright = () => {
    const deg = s.add('scale', 'RollPitchDeg', { gain: 180 / Math.PI })
    s.wire(pick('RollPitch', from('euler'), [0, 1]), deg)
    check('StaysUpright', deg, -60, 60, 0, null, 'stop')
  }
  /** 1 when the given fc_warnings bit is set. */
  const bit = (name: string, warnings: string, value: number) => expr(name, `fmod(floor(in(0) / ${value}.0 + 1e-9), 2.0)`, [warnings])
  return { s, h, from, pick, expr, check, upright, bit }
}

/** Disarmed at rest on the field. */
export const REST_STICKS: StickProfile = { roll: [[0, 0]], pitch: [[0, 0]], yaw: [[0, 0]], throttle: [[0, 0]], arm: [[0, 0]] }

/** Expected per-axis 1σ of the GNSS errors at the default conditions (position includes nothing else; velocity adds quantization). */
export const GNSS_SIGMA = (() => {
  const g = SENSORS.gnss, e = DEFAULT_GNSS_ENV
  const qv = g.quantVel / Math.sqrt(12)
  return {
    horizontal: Math.hypot(g.uere.hCorr, g.uere.hFast) * e.hdop * e.uereScale,
    vertical: Math.hypot(g.uere.vCorr, g.uere.vFast) * e.vdop * e.uereScale,
    velHorizontal: Math.hypot(g.vel.h * e.hdop * e.uereScale, qv),
    velVertical: Math.hypot(g.vel.v * e.vdop * e.uereScale, qv),
    /**
     * RMS change of a horizontal error between successive fixes: each term is a two-pole
     * process (poles p₁, p₂) with lag-1 correlation (p₁ + p₂)/(1 + p₁p₂), so its step has
     * variance 2(1 − ρ); plus the 1 cm quantization of both fixes
     */
    stepHorizontal: (() => {
      const stepVar = (p1: number, p2: number) => 2 * (1 - (p1 + p2) / (1 + p1 * p2))
      const slow = Math.exp(-g.ts / g.tau), smooth = Math.exp(-g.ts / g.smoothTau), fast = Math.exp(-g.ts / g.fastTau)
      const units = g.uere.hCorr ** 2 * stepVar(slow, smooth) + g.uere.hFast ** 2 * stepVar(fast, fast)
      return Math.sqrt(units * (e.hdop * e.uereScale) ** 2 + 2 * g.quantPos ** 2 / 12)
    })(),
  }
})()

/**
 * T03 window and tolerances: the position RMS within ±30% (about 25 correlation times), velocity (white)
 * within ±10%, the fix-to-fix change within ±10% (30 000 steps, smooth over about 1 s).
 */
export const GNSS_STATS_TEST = { duration: 3000, window: [10, 2990] as [number, number], posTol: 0.3, velTol: 0.1, stepTol: 0.1, minCorr1s: 0.9 }

/** T03: GNSS error statistics, disarmed at rest (the fix is all error). */
export function buildFpvGnssStatisticsTestModel() {
  const t = GNSS_STATS_TEST
  const sig = GNSS_SIGMA
  const tests = () => {
    const { s, h, from, pick, expr, check, upright } = testsSheet()
    const g = from('gnss_pos'), p = from('pos_ned'), gv = from('gnss_vel_ned'), v = from('vel_ned')
    const err = (name: string, k: number, alt: boolean) =>
      expr(name, alt ? 'in(0) + in(1)' : 'in(0) - in(1)', [pick(`${name}Fix`, g, [k]), pick(`${name}Truth`, p, [k])])
    const errs: Array<[string, string, number, number]> = [
      ['North', err('ErrNorth', 0, false), sig.horizontal, t.posTol],
      ['East', err('ErrEast', 1, false), sig.horizontal, t.posTol],
      ['Altitude', err('ErrAltitude', 2, true), sig.vertical, t.posTol],
      ['VelNorth', expr('ErrVelNorth', 'in(0) - in(1)', [pick('VelNorthFix', gv, [0]), pick('VelNorthTruth', v, [0])]), sig.velHorizontal, t.velTol],
      ['VelDown', expr('ErrVelDown', 'in(0) - in(1)', [pick('VelDownFix', gv, [2]), pick('VelDownTruth', v, [2])]), sig.velVertical, t.velTol],
    ]
    const [w0, w1] = t.window
    for (const [name, e, sigma, tol] of errs) {
      const ms = h.windowMeanSquare(`MS${name}`, e, w0, w1, SENSORS.gnss.ts)
      check(`RMS${name}MatchesSigma`, ms, ((1 - tol) * sigma) ** 2, ((1 + tol) * sigma) ** 2, w1 + 1)
    }
    check('ErrorCorrelated1s', h.windowCorr('CorrNorth1s', errs[0]![1], Math.round(1 / SENSORS.gnss.ts), SENSORS.gnss.ts, w0, w1), t.minCorr1s, 1, w1 + 1)
    // Smooth, as a receiver's navigation filter reports it: successive fixes differ by centimetres
    const errPrev = s.add('unit_delay', 'ErrNorthPrevFix', { initialValue: 0, sampleInterval: SENSORS.gnss.ts })
    s.wire(errs[0]![1], errPrev)
    const stepMs = h.windowMeanSquare('MSStepNorth', expr('StepNorth', 'in(0) - in(1)', [errs[0]![1], errPrev]), w0, w1, SENSORS.gnss.ts)
    check('FixToFixStepMatches', stepMs, ((1 - t.stepTol) * sig.stepHorizontal) ** 2, ((1 + t.stepTol) * sig.stepHorizontal) ** 2, w1 + 1)
    // Reported to the centimetre
    const offGrid = expr('NorthOffGrid', `fabs(in(0) / ${SENSORS.gnss.quantPos} - round(in(0) / ${SENSORS.gnss.quantPos}))`, [pick('NorthFix', g, [0])])
    check('PositionOnCentimetreGrid', offGrid, 0, 1e-6)
    check('Fix3DThroughout', pick('FixType', from('gnss_fix'), [0]), 3, 3)
    upright()
    return s
  }
  return buildFpvTestModel({
    name: 'FPV T03 GNSS Statistics',
    description:
      `Validation test for the GNSS error model (docs/fpv-hud-gnss-test-plan.md, T03): ${t.duration} s disarmed at rest in open sky. ` +
      'Per-axis RMS position and velocity errors match DOP × UERE, the slow error is correlated over 1 s, successive fixes differ ' +
      'by the filtered amount (about 2.5 cm), the fix is on the ' +
      'centimetre grid and stays 3D. Exact DOP and UERE-scale scaling is checked in __tests__/reference-models/fpv-gnss.test.ts.',
    sticks: REST_STICKS,
    duration: t.duration,
    displays: [['GnssPosition', 'gnss_pos'], ['GnssVelocity', 'gnss_vel_ned']],
    tests,
  })
}

/** T04 schedule: satellites 14 → 3 at 8 s → 2 at 14 s → 14 at 20 s; reacquisition 1 s. */
export const GNSS_CONDITIONS_TEST = { to2D: 8, toNone: 14, back: 20, duration: 24 }

/** A step schedule: value v0 until t, then v1 (the change is visible at t). */
const step = (pairs: Array<[number, number]>): Array<[number, number]> => {
  const out: Array<[number, number]> = [[0, pairs[0]![1]]]
  for (let i = 1; i < pairs.length; i++) out.push([pairs[i]![0] - 0.001, pairs[i - 1]![1]], [pairs[i]![0], pairs[i]![1]])
  return out
}

/** Hover sticks: the demo take-off in angle mode, then hold. */
export const HOVER_STICKS: StickProfile = {
  roll: [[0, 0]], pitch: [[0, 0]], yaw: [[0, 0]], throttle: DEMO_STICKS.throttle, aux: [[0, 1]], arm: DEMO_STICKS.arm,
}

/** T04: GNSS fix rules — 3D, 2D (altitude and vd held), none (all held), and 1 s reacquisition. */
export function buildFpvGnssConditionsTestModel() {
  const t = GNSS_CONDITIONS_TEST
  const reacq = SENSORS.gnss.reacquireS
  const tests = () => {
    const { s, h, from, pick, expr, check, upright } = testsSheet()
    const g = from('gnss_pos'), gv = from('gnss_vel_ned'), fix = from('gnss_fix')
    const fixType = pick('FixType', fix, [0])
    const e = 0.05 // window margin around each change (half a GNSS sample)
    check('Fix3DBefore', fixType, 3, 3, 0, t.to2D - e)
    check('Fix2DWithThreeSatellites', fixType, 2, 2, t.to2D + e, t.toNone - e)
    check('NoFixWithTwoSatellites', fixType, 0, 0, t.toNone + e, t.back + reacq - e)
    check('Fix3DAfterReacquisition', fixType, 3, 3, t.back + reacq + e)
    const back = expr('Fix3DAfterReturn', `(in(1) > ${t.back} && in(0) > 2.5) ? 1.0 : 0.0`, [fixType, h.clock()])
    check('ReacquiredAfter1s', h.firstTime('FirstFixAfterReturn', back), t.back + reacq - e, t.back + reacq + e, t.back + reacq + 0.5)
    // 2D: altitude held and vertical velocity zero, while north still updates
    const alt = pick('FixAltitude', g, [2])
    const held = (name: string, x: string, at: number) => expr(`${name}Change`, 'in(0) - in(1)', [x, h.heldAt(`${name}At`, x, at)])
    check('AltitudeHeldIn2D', held('Altitude2D', alt, t.to2D + e), 0, 0, t.to2D + e, t.toNone - e)
    check('VerticalVelocityZeroIn2D', pick('FixVelDown', gv, [2]), 0, 0, t.to2D + e, t.toNone - e)
    // No fix: every output holds
    ;(['North', 'East', 'Altitude'] as const).forEach((axis, k) => {
      check(`${axis}HeldWithoutFix`, held(`${axis}None`, k === 2 ? alt : pick(`Fix${axis}`, g, [k]), t.toNone + e), 0, 0, t.toNone + e, t.back + reacq - e)
    })
    check('VelocityHeldWithoutFix', held('VelNorthNone', pick('FixVelNorth', gv, [0]), t.toNone + e), 0, 0, t.toNone + e, t.back + reacq - e)
    check('SatellitesReported', pick('Satellites', fix, [1]), 2, 2, t.toNone + e, t.back - e)
    check('PdopReported', expr('PdopError', `in(0) - ${Math.hypot(DEFAULT_GNSS_ENV.hdop, DEFAULT_GNSS_ENV.vdop)}`, [pick('Pdop', fix, [2])]), -1e-9, 1e-9)
    upright()
    return s
  }
  return buildFpvTestModel({
    name: 'FPV T04 GNSS Conditions',
    description:
      'Validation test for the GNSS fix rules (docs/fpv-hud-gnss-test-plan.md, T04): hovering while the satellites go ' +
      `14 → 3 at ${t.to2D} s → 2 at ${t.toNone} s → 14 at ${t.back} s. The fix is 3D, then 2D with altitude and vertical ` +
      `velocity held, then none with every output held, and 3D again ${reacq} s after the satellites return.`,
    sticks: HOVER_STICKS,
    duration: t.duration,
    displays: [['GnssFix', 'gnss_fix'], ['GnssPosition', 'gnss_pos']],
    tests,
    conditions: { gnssEnv: { satellites: step([[0, 14], [t.to2D, 3], [t.toNone, 2], [t.back, 14]]) } },
  })
}

/** T05 sticks: take off, hover, then pitch forward in angle mode (about 18°) toward grid north. */
export const COURSE_STICKS: StickProfile = (() => {
  const hov = Number(HOVER_THROTTLE.toFixed(4))
  return {
    roll: [[0, 0]], yaw: [[0, 0]], aux: [[0, 1]], arm: DEMO_STICKS.arm,
    throttle: [[0, 0], [0.5, 0], [0.6, 0.6], [1.2, 0.6], [1.3, hov], [4.0, hov], [4.1, hov + 0.035]],
    pitch: [[0, 0], [4.0, 0], [4.1, -0.25]],
  }
})()

/**
 * T05 windows (s) and limits. The fix holds for up to 0.1 s while the vehicle
 * accelerates (up to about 2.5 m/s²), so ground speed lags truth by up to
 * 0.25 m/s by design; the 0.5 m/s limit is that plus 4σ of velocity noise.
 */
export const GNSS_COURSE_TEST = { hover: [0.5, 3.5] as [number, number], flight: [6, 12] as [number, number], trackDeg: 3, speedMs: 0.5, duration: 12 }

/** T05: the receiver's course (VTG) — invalid and held in a hover, true track and ground speed in flight, magnetic track. */
export function buildFpvGnssCourseTestModel() {
  const t = GNSS_COURSE_TEST
  const R2D = 180 / Math.PI
  const tests = () => {
    const { s, h, from, pick, expr, check, upright } = testsSheet()
    const course = from('gnss_course'), v = from('vel_ned')
    const track = pick('Track', course, [0]), trackMag = pick('TrackMagnetic', course, [1])
    const speed = pick('GroundSpeed', course, [2]), valid = pick('TrackValid', course, [3])
    const [h0, h1] = t.hover, [f0, f1] = t.flight
    check('TrackInvalidInHover', valid, 0, 0, h0, h1)
    check('TrackHeldInHover', expr('TrackChange', 'in(0) - in(1)', [track, h.heldAt('TrackAtHover', track, h0)]), 0, 0, h0, h1)
    check('TrackValidInFlight', valid, 1, 1, f0, f1)
    const vn = pick('TruthVelNorth', v, [0]), ve = pick('TruthVelEast', v, [1])
    // Truth track over the ground, true north: grid track + γ (this model's conditions use the site's γ)
    const trackErr = expr('TrackError', `fmod(in(0) - (atan2(in(2), in(1)) * ${R2D} + ${LOCATION.gridConvergenceDeg}) + 540.0, 360.0) - 180.0`, [track, vn, ve])
    check('TrackMatchesTruth', trackErr, -t.trackDeg, t.trackDeg, f0, f1)
    check('GroundSpeedMatchesTruth', expr('SpeedError', 'in(0) - sqrt(in(1) * in(1) + in(2) * in(2))', [speed, vn, ve]), -t.speedMs, t.speedMs, f0, f1)
    check('MagneticIsTrueMinusDeclination',
      expr('MagneticError', `fmod(in(0) - in(1) + ${SITE_FIELD.declinationDeg} + 540.0, 360.0) - 180.0`, [trackMag, track]), -1e-9, 1e-9)
    upright()
    return s
  }
  return buildFpvTestModel({
    name: 'FPV T05 GNSS Course',
    description:
      'Validation test for the GNSS course and ground speed (docs/fpv-hud-gnss-test-plan.md, T05): in a hover the track is ' +
      'not valid and holds; in forward flight above 3 m/s the true track matches the truth (grid track + γ) within 3° and the ' +
      'ground speed within 0.5 m/s (the 10 Hz hold lags an accelerating vehicle); the magnetic track is the true track minus the WMM declination.',
    sticks: COURSE_STICKS,
    duration: t.duration,
    displays: [['GnssCourse', 'gnss_course'], ['Velocity', 'vel_ned']],
    tests,
  })
}

/** A switch schedule: on (1) during each [from, to) window, otherwise off. */
const windows = (...spans: Array<[number, number]>): Array<[number, number]> => {
  const out: Array<[number, number]> = [[0, 0]]
  for (const [a, b] of spans) out.push([a - 0.001, 0], [a, 1], [b - 0.001, 1], [b, 0])
  return out
}

/** T07 timeline (s): each arming attempt and what should block it. */
export const ARMING_TEST = {
  throttleHigh: [0.5, 0.9] as [number, number],
  rescueOn: [1.5, 2.0] as [number, number], rescueArm: [1.7, 1.9] as [number, number],
  holdOn: [2.2, 2.7] as [number, number], holdArm: [2.4, 2.6] as [number, number],
  fewSats: [3.0, 3.2] as [number, number],
  armed: [3.6, 4.0] as [number, number],
  rearm: 4.4,
  linkLost: [5.0, 7.0] as [number, number],
  cycleOff: 8.0, cycleOn: 8.3,
  duration: 9,
}

/** T07: arming checks — throttle, mode switches, the first-arming GPS check, re-arm, and the switch cycle after a forced disarm. */
export function buildFpvArmingChecksTestModel() {
  const t = ARMING_TEST
  const W = FC_WARNING
  const sticks: StickProfile = {
    roll: [[0, 0]], pitch: [[0, 0]], yaw: [[0, 0]], aux: [[0, 1]],
    throttle: [[0, 0], [0.4, 0], [0.401, 0.3], [0.95, 0.3], [0.951, 0]],
    arm: windows([0.5, 0.9], [t.rescueArm[0], t.rescueArm[1]], [t.holdArm[0], t.holdArm[1]], [t.fewSats[0], t.fewSats[1]], [t.armed[0], t.armed[1]], [t.rearm, t.cycleOff], [t.cycleOn, t.duration + 1]),
    rescue: windows(t.rescueOn),
    hold: windows(t.holdOn).map(([time, v]) => [time, v * 0.5] as [number, number]),
  }
  const tests = () => {
    const { s, h, from, expr, check, bit } = testsSheet()
    const armed = from('fc_armed'), warnings = from('fc_warnings'), home = from('home_valid'), stage = from('failsafe_stage')
    const e = 0.05
    check('RefusedWithThrottleUp', armed, 0, 0, t.throttleHigh[0], t.throttleHigh[1])
    check('ThrottleWarning', bit('WarnThrottle', warnings, W.armThrottle), 1, 1, t.throttleHigh[0] + e, t.throttleHigh[1] - e)
    check('RefusedWithRescueSwitch', armed, 0, 0, t.rescueArm[0], t.rescueArm[1])
    const modeBit = bit('WarnModeSwitch', warnings, W.armModeSwitch)
    check('RescueSwitchWarning', modeBit, 1, 1, t.rescueArm[0] + e, t.rescueArm[1] - e)
    check('RefusedWithHoldSwitch', armed, 0, 0, t.holdArm[0], t.holdArm[1])
    check('HoldSwitchWarning', modeBit, 1, 1, t.holdArm[0] + e, t.holdArm[1] - e)
    check('RefusedFirstArmingWithoutGps', armed, 0, 0, t.fewSats[0], t.fewSats[1])
    check('GpsWarning', bit('WarnGps', warnings, W.armGps), 1, 1, t.fewSats[0] + e, t.fewSats[1] - e)
    check('ArmsWithGps', armed, 1, 1, t.armed[0] + e, t.armed[1] - e)
    check('HomeOnArming', home, 1, 1, t.armed[0] + e, t.armed[1] - e)
    check('ReArmsWithoutGps', armed, 1, 1, t.rearm + e, t.linkLost[0] + FC.failsafe.delayS - e)
    check('NoHomeOnReArmWithoutGps', home, 0, 0, t.rearm + e, t.linkLost[0] + FC.failsafe.delayS - e)
    check('RescueOffWithoutHome', bit('WarnRescueOff', warnings, W.rescueOff), 1, 1, t.rearm + e, t.linkLost[0] + FC.failsafe.delayS - e)
    const stage2At = t.linkLost[0] + FC.failsafe.delayS
    check('DroppedInStage2', armed, 0, 0, stage2At + e, t.cycleOn - e)
    check('RxLossWarning', bit('WarnRxLoss', warnings, W.armRxLoss), 1, 1, stage2At + e, t.linkLost[1] - e)
    check('SwitchCycleWarning', bit('WarnCycle', warnings, W.armSwitchCycle), 1, 1, t.linkLost[1] + e, t.cycleOff - e)
    check('FailsafeEndsAfterRecovery', stage, 0, 0, t.linkLost[1] + FC.failsafe.recoveryS + e)
    check('ReArmsAfterSwitchCycle', armed, 1, 1, t.cycleOn + e)
    void s; void h; void expr
    return s
  }
  return buildFpvTestModel({
    name: 'FPV T07 Arming Checks',
    description:
      'Validation test for arming (docs/fpv-hud-gnss-test-plan.md, T07): on the ground, arming is refused with the throttle up, ' +
      'with the rescue or hold switch on, and on the first arming with 7 satellites; it succeeds with 14 (home taken), and a re-arm ' +
      'with 7 succeeds without a home (RESCUE OFF). A DROP failsafe disarms, and arming then needs the switch cycled. fc_warnings shows each reason.',
    sticks,
    duration: t.duration,
    displays: [['Armed', 'fc_armed'], ['Warnings', 'fc_warnings'], ['FailsafeStage', 'failsafe_stage']],
    tests,
    conditions: {
      gnssEnv: { satellites: [[0, 7], [3.399, 7], [3.4, 14], [4.099, 14], [4.1, 7]] },
      rcLinkValid: [[0, 1], [t.linkLost[0] - 0.001, 1], [t.linkLost[0], 0], [t.linkLost[1] - 0.001, 0], [t.linkLost[1], 1]],
      failsafeProcedure: FAILSAFE_PROCEDURE.drop,
    },
  })
}

/** T08 timeline (s): climb, a 1 s link loss (stage 1 only), then a loss that reaches stage 2. */
export const FAILSAFE_DROP_TEST = { shortLoss: [5, 6] as [number, number], loss: 9, duration: 11 }

/** Climb to a safe height and hover (angle mode): the T05 take-off without the pitch. */
export const CLIMB_STICKS: StickProfile = (() => {
  const hov = Number(HOVER_THROTTLE.toFixed(4))
  return {
    roll: [[0, 0]], pitch: [[0, 0]], yaw: [[0, 0]], aux: [[0, 1]], arm: DEMO_STICKS.arm,
    throttle: [[0, 0], [0.5, 0], [0.6, 0.6], [1.2, 0.6], [1.3, hov]],
  }
})()

/** T08: failsafe with DROP — stage 1 holds then centres the sticks and recovers at once; stage 2 at exactly delayS disarms. */
export function buildFpvFailsafeDropTestModel() {
  const t = FAILSAFE_DROP_TEST
  const f = FC.failsafe
  const tests = () => {
    const { s, h, from, pick, expr, check, upright } = testsSheet()
    const stage = from('failsafe_stage'), armed = from('fc_armed'), mode = from('fc_mode')
    const motorsMax = expr('MotorMax', 'fmax(fmax(in(0), in(1)), fmax(in(2), in(3)))', [0, 1, 2, 3].map(k => pick(`Motor${k}`, from('motor_cmd'), [k])))
    const e = 0.05
    const [a, b] = t.shortLoss
    check('Stage0BeforeLoss', stage, 0, 0, 0, a - e)
    check('Stage1DuringShortLoss', stage, 1, 1, a + e, b - e)
    check('FailsafeModeShown', mode, FC_MODE.failsafe, FC_MODE.failsafe, a + e, b - e)
    // Sticks held for holdS (motors still near hover), then throttle low
    check('SticksHeldAtFirst', motorsMax, 0.35, 1, a + 0.01, a + f.holdS - 0.02)
    check('ThrottleLowAfterHold', motorsMax, 0, 0.3, a + f.holdS + 0.1, b - e)
    check('RecoversAtOnce', stage, 0, 0, b + e, t.loss - e)
    check('StaysArmedThroughShortLoss', armed, 1, 1, 1.0, t.loss)
    const stage2 = expr('InStage2', '(in(0) > 1.5) ? 1.0 : 0.0', [stage])
    check('Stage2AfterDelay', h.firstTime('Stage2Time', stage2), t.loss + f.delayS - 0.002, t.loss + f.delayS + 0.002, t.loss + f.delayS + 0.1)
    check('DisarmedInStage2', armed, 0, 0, t.loss + f.delayS + 0.002)
    void s; void upright
    const deg = s.add('scale', 'RollPitchDeg', { gain: 180 / Math.PI })
    s.wire(pick('RollPitch', from('euler'), [0, 1]), deg)
    check('StaysUpright', deg, -60, 60, 0, t.loss + f.delayS, 'stop')
    return s
  }
  return buildFpvTestModel({
    name: 'FPV T08 Failsafe Drop',
    description:
      'Validation test for failsafe with the DROP procedure (docs/fpv-hud-gnss-test-plan.md, T08): after a climb the link is lost ' +
      `for 1 s at ${t.shortLoss[0]} s — stage 1, sticks held for ${f.holdS} s then throttle low, control back at once — and lost again ` +
      `at ${t.loss} s: stage 2 exactly ${f.delayS} s later, and the quad disarms.`,
    sticks: CLIMB_STICKS,
    duration: t.duration,
    displays: [['FailsafeStage', 'failsafe_stage'], ['MotorCommand', 'motor_cmd'], ['Position', 'pos_ned']],
    tests,
    conditions: {
      rcLinkValid: [[0, 1], [t.shortLoss[0] - 0.001, 1], [t.shortLoss[0], 0], [t.shortLoss[1] - 0.001, 0], [t.shortLoss[1], 1], [t.loss - 0.001, 1], [t.loss, 0]],
      failsafeProcedure: FAILSAFE_PROCEDURE.drop,
    },
  })
}

/** T22: wind — a level hover drifts with a north wind toward the wind's speed. */
export const WIND_TEST = { start: 3, speed: 3, duration: 15 }

export function buildFpvWindTestModel() {
  const t = WIND_TEST
  const tests = () => {
    const { s, from, pick, check, upright } = testsSheet()
    const vn = pick('VelNorth', from('vel_ned'), [0])
    check('CalmBeforeWind', vn, -0.5, 0.5, 0, t.start)
    // Linear drag: the air-relative velocity decays with m/c ≈ 2.5 s, so after 10 s the drift is
    // within 2% of the wind. Angle mode holds the estimated level, and the estimate's small tilt
    // error leaves a steady push of about 0.25 m/s even in calm air, hence ±15%.
    check('DriftsWithWind', vn, 0.85 * t.speed, 1.15 * t.speed, t.start + 10)
    upright()
    return s
  }
  return buildFpvTestModel({
    name: 'FPV T22 Wind',
    description:
      `Validation test for the wind input (docs/fpv-hud-gnss-test-plan.md, T22): hovering level in angle mode, a ${t.speed} m/s ` +
      `north wind from ${t.start} s carries the quad north; with linear drag its ground speed approaches the wind's.`,
    sticks: CLIMB_STICKS,
    duration: t.duration,
    displays: [['Velocity', 'vel_ned'], ['Position', 'pos_ned']],
    tests,
    conditions: { wind: { north: [[0, 0], [t.start - 0.001, 0], [t.start, t.speed]] } },
  })
}

/** T21 schedule (s): pDOP 1.5, then 6, then no fix, then the fix back. */
/**
 * The vario differentiates an estimate that carries 10 Hz GPS steps, so with
 * GPS it is noisy (±1.5 m/s; Betaflight's OSD gives it a deadband): checked
 * as an RMS. On baro alone it is far quieter.
 */
export const ALTITUDE_TEST = { highPdop: 10, noFix: 20, fixBack: 25, duration: 30, varioRmsWithGps: 1.0, varioRmsOnBaro: 0.3, varioFrom: 3 }

/** T21: the altitude estimate — 0 until arming, tracking at low and high pDOP and on baro alone, and the vario. */
export function buildFpvAltitudeEstimatorTestModel() {
  const t = ALTITUDE_TEST
  const tol = DEMO_TESTS.altitudeEstimateM
  const highVdop = Math.sqrt(36 - DEFAULT_GNSS_ENV.hdop ** 2) // pDOP 6
  const tests = () => {
    const { s, h, from, pick, expr, check, upright } = testsSheet()
    const alt = from('alt_est')
    const height = expr('HeightAboveArming', `-in(0) - ${LOCATION.elevationM - GROUND_REST_Z}`, [pick('Down', from('pos_ned'), [2])])
    const err = expr('AltitudeError', 'in(0) - in(1)', [alt, height])
    const arm = DEMO_TESTS.armTime
    check('ZeroUntilArming', alt, 0, 0, 0, arm - 0.01)
    check('TracksAtLowPdop', err, -tol, tol, 0, t.highPdop)
    check('TracksAtHighPdop', err, -tol, tol, t.highPdop, t.noFix)
    check('TracksOnBaroWithoutFix', err, -tol, tol, t.noFix, t.fixBack + SENSORS.gnss.reacquireS)
    check('TracksWithFixBack', err, -tol, tol, t.fixBack + SENSORS.gnss.reacquireS)
    const climb = expr('ClimbRate', '-in(0)', [pick('VelDown', from('vel_ned'), [2])])
    const varioErr = expr('VarioError', 'in(0) - in(1)', [from('vario_est'), climb])
    check('VarioRmsWithGps', h.windowMeanSquare('VarioMSGps', varioErr, t.varioFrom, t.noFix), 0, t.varioRmsWithGps ** 2, t.noFix + 0.1)
    // From 1 s after the fix is lost (the PT2s forget the GPS steps) until it returns
    check('VarioRmsOnBaro', h.windowMeanSquare('VarioMSBaro', varioErr, t.noFix + 1, t.fixBack), 0, t.varioRmsOnBaro ** 2, t.fixBack + 0.1)
    upright()
    return s
  }
  return buildFpvTestModel({
    name: 'FPV T21 Altitude Estimator',
    description:
      'Validation test for the Betaflight altitude estimate (docs/fpv-hud-gnss-test-plan.md, T21): alt_est is 0 until arming and ' +
      `then tracks the height above the arming point within ${tol} m while climbing at pDOP 1.5, at pDOP 6 from ${t.highPdop} s, ` +
      `on baro alone without a fix from ${t.noFix} s, and with the fix back from ${t.fixBack} s; vario_est follows the climb rate.`,
    sticks: CLIMB_STICKS,
    duration: t.duration,
    displays: [['AltitudeEstimate', 'alt_est'], ['Vario', 'vario_est'], ['Position', 'pos_ned']],
    tests,
    conditions: {
      gnssEnv: {
        vdop: step([[0, DEFAULT_GNSS_ENV.vdop], [t.highPdop, highVdop], [t.noFix, DEFAULT_GNSS_ENV.vdop]]),
        satellites: step([[0, 14], [t.noFix, 2], [t.fixBack, 14]]),
      },
    },
  })
}

/**
 * The no-magnetometer vehicle for the validation suite: it starts facing
 * NO_MAG_START_YAW_DEG (grid) while its attitude estimate starts at yaw 0, as
 * after a power-up without a magnetometer, and has pos_hold_without_mag on.
 */
export const NO_MAG_START_YAW_DEG = 60
export function buildFpvNoMagVehicle() {
  return buildFpvModel({ vehicleOnly: true, magnetometer: false, posHoldWithoutMag: true, initialEuler: [0, 0, NO_MAG_START_YAW_DEG] })
}

/**
 * T19 windows and limits. Course over ground aligns the heading with the
 * ground track; the true yaw differs by the sideslip (the hover's small tilt
 * bias gives about 4° at 10 m/s), as on a real quad.
 */
export const NO_MAG_TEST = {
  still: 4, converged: 10, courseDeg: 2, truthDeg: 9, headingOkFrom: 8.5,
  /** Pos Hold requested before GPS heading (refused), and after the forward flight (holds) */
  earlyHold: [2, 3.5] as [number, number], hold: 12, holdM: 5, settled: 16, duration: 22,
}

/** T19: heading without a magnetometer — from 0 before motion, snapped and converged to the course in flight. */
export function buildFpvNoMagHeadingTestModel() {
  const t = NO_MAG_TEST
  const R2D = 180 / Math.PI
  const tests = () => {
    const { s, h, from, pick, expr, check, upright } = testsSheet()
    const yawEst = expr('YawEstimateDeg', `in(0) * ${R2D}`, [pick('YawEstimate', from('euler_est'), [2])])
    const yawTrue = expr('YawTrueDeg', `in(0) * ${R2D}`, [pick('YawTrue', from('euler'), [2])])
    const wrapDiff = (name: string, a: string, b: string) => expr(name, 'fmod(in(0) - in(1) + 540.0, 360.0) - 180.0', [a, b])
    check('EstimateStartsAtZero', yawEst, -1, 1, 0, t.still)
    check('GpsHeadingNotYet', from('gps_heading_ok'), 0, 0, 0, t.still)
    // In forward flight, before Pos Hold stops the quad (a hover has no meaningful course)
    check('HeadingFollowsCourse', wrapDiff('HeadingMinusTrack', from('heading_deg'), pick('Track', from('gnss_course'), [0])), -t.courseDeg, t.courseDeg, t.converged, t.hold)
    check('EstimateNearTrueYaw', wrapDiff('EstimateYawError', yawEst, yawTrue), -t.truthDeg, t.truthDeg, t.converged)
    check('GpsHeadingEstablished', from('gps_heading_ok'), 1, 1, t.headingOkFrom)
    // Pos Hold without a magnetometer: refused (POSHOLD FAIL) before GPS heading; holds after
    const fail = expr('PosHoldFailBit', `fmod(floor(in(0) / ${FC_WARNING.posHoldFail}.0 + 1e-9), 2.0)`, [from('fc_warnings')])
    check('PosHoldRefusedBeforeHeading', fail, 1, 1, t.earlyHold[0] + 0.02, t.earlyHold[1] - 0.02)
    check('PosHoldOkAfterHeading', fail, 0, 0, t.hold + 0.02)
    const pos = from('pos_ned')
    const north = pick('North', pos, [0]), east = pick('East', pos, [1])
    const dev = expr('HoldDeviation', 'sqrt((in(0) - in(2)) * (in(0) - in(2)) + (in(1) - in(3)) * (in(1) - in(3)))',
      [north, east, h.heldAt('NorthAtSettle', north, t.settled), h.heldAt('EastAtSettle', east, t.settled)])
    check('PosHoldHoldsAfterHeading', dev, 0, t.holdM, t.settled, t.duration)
    upright()
    return s
  }
  return buildFpvTestModel({
    name: 'FPV T19 No-Mag Heading',
    description:
      'Validation test for heading without a magnetometer (docs/fpv-hud-gnss-test-plan.md, T19): the vehicle faces ' +
      `${NO_MAG_START_YAW_DEG}° with its estimate at 0°. Flying forward, the estimate snaps to the GPS course at 1 m/s and ` +
      `converges on it (heading within ${t.courseDeg}° of the track, the true yaw within ${t.truthDeg}° allowing for sideslip), ` +
      'and GPS heading becomes established. Position Hold (pos_hold_without_mag on) is refused before that and holds after.',
    sticks: {
      ...COURSE_STICKS,
      // Release the pitch stick when Pos Hold takes over
      pitch: [...COURSE_STICKS.pitch, [NO_MAG_TEST.hold - 0.001, -0.25], [NO_MAG_TEST.hold, 0]],
      hold: [[0, 0], [NO_MAG_TEST.earlyHold[0] - 0.001, 0], [NO_MAG_TEST.earlyHold[0], 1], [NO_MAG_TEST.earlyHold[1], 1],
        [NO_MAG_TEST.earlyHold[1] + 0.001, 0], [NO_MAG_TEST.hold - 0.001, 0], [NO_MAG_TEST.hold, 1]],
    },
    duration: t.duration,
    displays: [['Heading', 'heading_deg'], ['GnssCourse', 'gnss_course'], ['Attitude', 'euler']],
    tests,
    vehicleName: FPV_VEHICLE_NO_MAG_NAME,
  })
}

/**
 * T16 timeline (s) and limits. With Betaflight's default altitude gains
 * (P, I, D, F 15) this quad's hold is underdamped: about 2 m of overshoot on
 * entry and a ±1.7 m swing with an 8 s period (P is about 0.6 m/s² per metre,
 * damping about 0.4 before the vario's lag). Betaflight users tune ap_altitude_*.
 */
export const ALT_HOLD_TEST = {
  earlySwitch: [0.5, 0.9] as [number, number],
  engage: 4, fullStick: [14, 17] as [number, number], end: 22,
  /** climb 2–3 s into full stick: the tuned controller lags the 5 m/s target a little (D opposes the climb; measured 4.35–4.5) */
  holdM: 3, holdVzMs: 1.5, climbMs: [4.0, 6.0] as [number, number],
}

/** T16: Altitude Hold — not before the throttle is raised; holds; climbs at full stick; holds at low stick. */
export function buildFpvAltHoldTestModel() {
  const t = ALT_HOLD_TEST
  const hov = Number(HOVER_THROTTLE.toFixed(4))
  const sticks: StickProfile = {
    roll: [[0, 0]], pitch: [[0, 0]], yaw: [[0, 0]], aux: [[0, 1]], arm: DEMO_STICKS.arm,
    throttle: [[0, 0], [1.0, 0], [1.001, 0.6], [1.6, 0.6], [1.601, hov], [t.fullStick[0], hov], [t.fullStick[0] + 0.001, 1.0], [t.fullStick[1], 1.0], [t.fullStick[1] + 0.001, 0]],
    hold: [[0, 0], [t.earlySwitch[0] - 0.001, 0], [t.earlySwitch[0], 0.5], [t.earlySwitch[1], 0.5], [t.earlySwitch[1] + 0.001, 0], [t.engage - 0.001, 0], [t.engage, 0.5]],
  }
  const tests = () => {
    const { s, h, from, pick, expr, check, upright } = testsSheet()
    const active = from('alt_hold_active')
    const height = expr('HeightAboveArming', `-in(0) - ${LOCATION.elevationM - GROUND_REST_Z}`, [pick('Down', from('pos_ned'), [2])])
    const climb = expr('ClimbRate', '-in(0)', [pick('VelDown', from('vel_ned'), [2])])
    check('NotBeforeThrottleRaised', active, 0, 0, t.earlySwitch[0], t.earlySwitch[1])
    check('EngagesWithSwitch', active, 1, 1, t.engage + 0.02)
    check('ModeIsAltHold', from('fc_mode'), FC_MODE.altHold, FC_MODE.altHold, t.engage + 0.02)
    const held = expr('HoldDeviation', 'in(0) - in(1)', [height, h.heldAt('EntryHeight', height, t.engage)])
    check('HoldsNearEntryAltitude', held, -t.holdM, t.holdM, t.engage, t.fullStick[0])
    check('HoldSettles', climb, -t.holdVzMs, t.holdVzMs, t.engage + 2, t.fullStick[0])
    check('ClimbsAtFullStick', climb, t.climbMs[0], t.climbMs[1], t.fullStick[0] + 2, t.fullStick[1])
    check('HoldsAtLowStick', climb, -t.holdVzMs, null, t.fullStick[1] + 2, t.end)
    upright()
    return s
  }
  return buildFpvTestModel({
    name: 'FPV T16 Altitude Hold',
    description:
      'Validation test for Altitude Hold (docs/fpv-hud-gnss-test-plan.md, T16): AUX4 at mid before the throttle is raised does ' +
      `not engage; after a climb it engages at ${t.engage} s and holds near the entry altitude with the stick at hover; full ` +
      'stick climbs at about 5 m/s; low stick stops the target moving and the quad holds. Default Betaflight gains, so the hold ' +
      'is underdamped (about ±2 m).',
    sticks,
    duration: t.end,
    displays: [['AltitudeEstimate', 'alt_est'], ['Position', 'pos_ned'], ['AltHold', 'alt_hold_active']],
    tests,
  })
}

/**
 * T09 timeline (s) and limits. Stage 1's throttle-low second and a half drops
 * the quad several metres before AUTO-LAND's Altitude Hold arrests it. The
 * descent then runs below Betaflight's target speed (the target only moves
 * within 5 m of the altitude, and the throttle floor is 1100 µs), so the check
 * is a controlled descent, not the target profile.
 */
export const AUTO_LAND_TEST = {
  loss: 10, wind: 3, arrested: 12.5, landedBy: 15,
  /**
   * The first second after the arrest dips to 1.85 m/s. Betaflight's target descent is
   * (0.9 + alt / 20 m) × 5 m/s, about 9 m/s at 18 m; the tuned controller reaches 6.0 m/s of it.
   */
  descentMs: [1.5, 6] as [number, number], maxSinkMs: 7, end: 75, driftM: 5,
}

/** T09: failsafe AUTO-LAND — Altitude Hold descends, lands, and disarms after the landing time. */
export function buildFpvAutoLandTestModel() {
  const t = AUTO_LAND_TEST
  const f = FC.failsafe
  const stage2 = t.loss + f.delayS
  const disarmAt = stage2 + f.landingTimeS
  const tests = () => {
    const { s, h, from, pick, expr, check } = testsSheet()
    const stage = from('failsafe_stage'), armed = from('fc_armed')
    const height = expr('HeightAboveArming', `-in(0) - ${LOCATION.elevationM - GROUND_REST_Z}`, [pick('Down', from('pos_ned'), [2])])
    const sink = pick('VelDown', from('vel_ned'), [2])
    check('Stage2AfterDelay', h.firstTime('Stage2Time', expr('InStage2', '(in(0) > 1.5) ? 1.0 : 0.0', [stage])), stage2 - 0.002, stage2 + 0.002, stage2 + 0.1)
    check('AltHoldLands', from('alt_hold_active'), 1, 1, stage2 + 0.02, disarmAt - 0.02)
    check('FailsafeModeShown', from('fc_mode'), FC_MODE.failsafe, FC_MODE.failsafe, t.loss + 0.02, disarmAt - 0.02)
    check('ControlledDescent', sink, t.descentMs[0], t.descentMs[1], t.arrested, t.arrested + 1)
    check('NoFasterThanMaxSink', sink, null, t.maxSinkMs, t.arrested, disarmAt)
    check('OnTheGround', height, -0.1, 0.3, t.landedBy, disarmAt)
    check('ArmedUntilLandingTime', armed, 1, 1, 1, disarmAt - 0.01)
    check('DisarmedAfterLandingTime', armed, 0, 0, disarmAt + 0.01)
    // Pos Hold runs during the landing: after it brakes the stage-1 drift, the quad lands near where it stopped
    check('PosHoldDuringLanding', from('pos_hold_active'), 1, 1, stage2 + 0.02, disarmAt - 0.02)
    const north = pick('North', from('pos_ned'), [0]), east = pick('East', from('pos_ned'), [1])
    const drift = expr('LandingDrift', 'sqrt((in(0) - in(2)) * (in(0) - in(2)) + (in(1) - in(3)) * (in(1) - in(3)))',
      [north, east, h.heldAt('NorthAtArrest', north, t.arrested), h.heldAt('EastAtArrest', east, t.arrested)])
    check('LandsNearArrestPoint', drift, 0, t.driftM, t.arrested, disarmAt)
    const deg = s.add('scale', 'RollPitchDeg', { gain: 180 / Math.PI })
    s.wire(pick('RollPitch', from('euler'), [0, 1]), deg)
    check('StaysUpright', deg, -60, 60, 0, disarmAt, 'stop')
    return s
  }
  return buildFpvTestModel({
    name: 'FPV T09 Failsafe Auto-Land',
    description:
      'Validation test for failsafe AUTO-LAND (docs/fpv-hud-gnss-test-plan.md, T09): after a climb, in a ' +
      `${t.wind} m/s north wind, the link is lost at ${t.loss} s. Stage 2 at ${stage2} s runs Altitude Hold, which arrests the ` +
      `stage-1 drop, descends under control and lands within ${t.driftM} m of where it was arrested, Position Hold holding against the wind; the quad disarms ${f.landingTimeS} s into stage 2.`,
    sticks: CLIMB_STICKS,
    duration: t.end,
    displays: [['Position', 'pos_ned'], ['FailsafeStage', 'failsafe_stage'], ['AltHold', 'alt_hold_active']],
    tests,
    conditions: {
      rcLinkValid: [[0, 1], [t.loss - 0.001, 1], [t.loss, 0]],
      failsafeProcedure: FAILSAFE_PROCEDURE.autoLand,
      wind: { north: t.wind },
    },
  })
}

/** T17 timeline (s) and limits: a 3 m/s wind from the north; stick override; a loss of fix. */
export const POS_HOLD_TEST = {
  engage: 5, held: [10, 25] as [number, number], roll: [25, 28] as [number, number], moveM: 5,
  reheld: [35, 44] as [number, number], noFix: [45, 50] as [number, number], resumed: [56, 60] as [number, number],
  holdM: 3, wind: -3,
}

/** T17: Position Hold — holds against wind, stick override and a new hold point, POSHOLD FAIL while the fix is lost, resume. */
export function buildFpvPosHoldTestModel() {
  const t = POS_HOLD_TEST
  const reacq = SENSORS.gnss.reacquireS
  const tests = () => {
    const { s, h, from, pick, expr, check, upright, bit } = testsSheet()
    const pos = from('pos_ned')
    const north = pick('North', pos, [0]), east = pick('East', pos, [1])
    const devFrom = (name: string, at: number) => expr(name, 'sqrt((in(0) - in(2)) * (in(0) - in(2)) + (in(1) - in(3)) * (in(1) - in(3)))',
      [north, east, h.heldAt(`${name}North`, north, at), h.heldAt(`${name}East`, east, at)])
    check('Engaged', from('pos_hold_active'), 1, 1, t.engage + 0.02)
    check('ModeIsPosHold', from('fc_mode'), FC_MODE.posHold, FC_MODE.posHold, t.engage + 0.02)
    check('HoldsAgainstWind', devFrom('Hold1', t.held[0]), 0, t.holdM, t.held[0], t.held[1])
    check('StickMovesIt', expr('EastMoved', 'in(0) - in(1)', [east, h.heldAt('EastBeforeStick', east, t.roll[0])]), t.moveM, null, t.roll[1], t.roll[1] + 0.5)
    check('HoldsNewPoint', devFrom('Hold2', t.reheld[0]), 0, t.holdM, t.reheld[0], t.reheld[1])
    const fail = bit('FailBit', from('fc_warnings'), FC_WARNING.posHoldFail)
    check('PosHoldFailWithoutFix', fail, 1, 1, t.noFix[0] + 0.02, t.noFix[1] + reacq - 0.02)
    check('NoFailBeforeLoss', fail, 0, 0, t.engage + 0.02, t.noFix[0] - 0.02)
    check('ResumesTowardTarget', devFrom('Hold3', t.reheld[1]), 0, t.holdM, t.resumed[0], t.resumed[1])
    upright()
    return s
  }
  return buildFpvTestModel({
    name: 'FPV T17 Position Hold',
    description:
      'Validation test for Position Hold (docs/fpv-hud-gnss-test-plan.md, T17): in a 3 m/s wind from the north, AUX4 high ' +
      `at ${t.engage} s stops the drift and holds; a 30% roll stick (${t.roll[0]}–${t.roll[1]} s) moves the quad and it holds the ` +
      `new point; with the fix lost (${t.noFix[0]}–${t.noFix[1]} s) it shows POSHOLD FAIL and holds its last angle, then returns.`,
    sticks: { ...CLIMB_STICKS, roll: [[0, 0], [t.roll[0] - 0.001, 0], [t.roll[0], 0.3], [t.roll[1], 0.3], [t.roll[1] + 0.001, 0]], hold: [[0, 0], [t.engage - 0.001, 0], [t.engage, 1]] },
    duration: t.resumed[1],
    displays: [['Position', 'pos_ned'], ['Mode', 'fc_mode'], ['Warnings', 'fc_warnings']],
    tests,
    conditions: {
      wind: { north: t.wind },
      gnssEnv: { satellites: step([[0, 14], [t.noFix[0], 2], [t.noFix[1], 14]]) },
    },
  })
}

/** T18: a 12 m/s gust overpowers the 25° angle limit; past the sanity distance Pos Hold fails and stays failed. */
export const POS_HOLD_SANITY_TEST = { engage: 5, gust: 10, gustMs: -12, failBy: 25, duration: 30 }

export function buildFpvPosHoldSanityTestModel() {
  const t = POS_HOLD_SANITY_TEST
  const tests = () => {
    const { s, from, check, upright, bit, h } = testsSheet()
    const fail = bit('FailBit', from('fc_warnings'), FC_WARNING.posHoldFail)
    check('HoldsBeforeGust', fail, 0, 0, t.engage + 0.02, t.gust)
    check('FailsAfterGust', h.latch('FailedOnce', fail), 1, 1, t.failBy)
    // Latched until re-entry: still failed at the end though the controller has not been re-armed
    check('StaysFailed', fail, 1, 1, t.failBy, t.duration)
    upright()
    return s
  }
  return buildFpvTestModel({
    name: 'FPV T18 Position Hold Sanity',
    description:
      'Validation test for the Position Hold sanity check (docs/fpv-hud-gnss-test-plan.md, T18): holding from ' +
      `${t.engage} s, a ${-t.gustMs} m/s gust from ${t.gust} s overpowers the 25° angle limit; once the quad is farther than ` +
      'the sanity distance, POSHOLD FAIL shows and stays until Pos Hold is re-entered.',
    sticks: { ...CLIMB_STICKS, hold: [[0, 0], [t.engage - 0.001, 0], [t.engage, 1]] },
    duration: t.duration,
    displays: [['Position', 'pos_ned'], ['Warnings', 'fc_warnings']],
    tests,
    conditions: { wind: { north: [[0, 0], [t.gust - 0.001, 0], [t.gust, t.gustMs]] } },
  })
}

// ---------------------------------------------------------------------------
// GPS Rescue test models (T10–T14, T20)

/** The rescue fly-out: climb, Alt Hold from 6 s, then a 35% roll east for 8 s, about 80 m east at about 14 m. */
export const RESCUE_FLYOUT = { holdOn: 6, roll: [7, 15] as [number, number], rollStick: 0.35 }

/** Fly-out sticks with the rescue switch schedule; the hold switch goes off at holdOff (default: stays on). */
export function rescueFlyoutSticks(rescue: Array<[number, number]>, holdOff?: number): StickProfile {
  const f = RESCUE_FLYOUT
  const hold: Array<[number, number]> = holdOff === undefined
    ? [[0, 0], [f.holdOn - 0.001, 0], [f.holdOn, 0.5]]
    : [[0, 0], [f.holdOn - 0.001, 0], [f.holdOn, 0.5], [holdOff - 0.001, 0.5], [holdOff, 0]]
  return {
    ...CLIMB_STICKS,
    roll: [[0, 0], [f.roll[0], 0], [f.roll[0] + 0.2, f.rollStick], [f.roll[1], f.rollStick], [f.roll[1] + 0.2, 0]],
    hold,
    rescue,
  }
}

/**
 * Rescue checks on a Tests sheet: the phase signal, 1 while in phase k, and
 * the time phase k was first entered (−1 until then).
 */
function rescuePhases(ctx: ReturnType<typeof testsSheet>) {
  const { h, from, expr } = ctx
  const phase = from('rescue_phase')
  const names = Object.fromEntries(Object.entries(RESCUE_PHASE).map(([k, v]) => [v, k[0]!.toUpperCase() + k.slice(1)]))
  const isCache = new Map<number, string>(), firstCache = new Map<number, string>()
  const is = (k: number) => {
    if (!isCache.has(k)) isCache.set(k, expr(`In${names[k]}`, `(fabs(in(0) - ${k}.0) < 0.5) ? 1.0 : 0.0`, [phase]))
    return isCache.get(k)!
  }
  const first = (k: number) => {
    if (!firstCache.has(k)) firstCache.set(k, h.firstTime(`First${names[k]}`, is(k)))
    return firstCache.get(k)!
  }
  /** 1 when the phases were each entered, in this order. */
  const inOrder = (name: string, ks: number[]) => {
    const terms = ks.map((_, i) => (i === 0 ? 'in(0) > 0.0' : `in(${i}) > in(${i - 1})`))
    return expr(name, `(${terms.join(' && ')}) ? 1.0 : 0.0`, ks.map(first))
  }
  return { phase, is, first, inOrder }
}

/**
 * The return checks shared by T11, T20 and T12b: the phases in order to
 * LANDING, never ABORT, RESC while active, the return altitude in FLY_HOME,
 * the heading on entering FLY_HOME, the ground speed, the descent distance,
 * touchdown near home and the impact disarm.
 */
function rescueReturnChecks(ctx: ReturnType<typeof testsSheet>, o: {
  on: number; duration: number; returnAltM: string; descentDistM: number; flyHomeSettleS: number; speed?: [number, number]
}) {
  const { h, from, pick, expr, check } = ctx
  const P = RESCUE_PHASE
  const T = RESCUE_RETURN_TEST
  const { is, first, inOrder } = rescuePhases(ctx)
  const end = o.duration - 0.5
  check('StartsAtSwitch', first(P.attainAlt), o.on - 0.001, o.on + 0.02, o.on + 0.05)
  check('PhasesInOrder', inOrder('PhaseOrder', [P.attainAlt, P.rotate, P.flyHome, P.descent, P.landing]), 1, 1, end)
  check('NeverAborts', h.phaseVisited('Aborted', from('rescue_phase'), P.abort), 0, 0)
  check('ModeIsRescueWhileActive', expr('ModeWhileActive', `(in(0) > 0.5 && fabs(in(1) - ${FC_MODE.rescue}.0) > 0.5) ? 0.0 : 1.0`,
    [from('rescue_active'), from('fc_mode')]), 1, 1)
  const t = h.clock()
  const settled = expr('FlyHomeSettled', `(in(0) > 0.5 && in(2) - in(1) > ${o.flyHomeSettleS}) ? 1.0 : 0.0`, [is(P.flyHome), first(P.flyHome), t])
  // The mean shows the return altitude; the swing about it is the altitude controller's (underdamped with Betaflight's gains, as T16)
  const altErr = expr('ReturnAltitudeError', '(in(0) > 0.5) ? in(1) - in(2) : 0.0', [settled, from('alt_est'), o.returnAltM])
  check('ReturnAltitude', h.meanWhile('ReturnAltitudeMeanError', altErr, settled), -T.altitudeM, T.altitudeM, end)
  check('ReturnAltitudeSwing', altErr, -T.swingM, T.swingM)
  const headingErr = expr('HeadingToHomeError', 'fmod(in(0) - in(1) + 540.0, 360.0) - 180.0', [from('heading_deg'), from('home_bearing_deg')])
  check('HeadingOnFlyHome', h.heldWhen('HeadingErrorOnFlyHome', headingErr, is(P.flyHome)), -T.headingDeg, T.headingDeg, end)
  if (o.speed) {
    const gs = pick('GroundSpeed', from('gnss_course'), [2])
    check('FlyHomeSpeed', h.meanWhile('FlyHomeMeanSpeed', gs, settled), o.speed[0], o.speed[1], end)
  }
  check('DescentDistance', h.heldWhen('DistanceOnDescent', from('home_distance_m'), is(P.descent)),
    o.descentDistM - T.descentDistM, o.descentDistM + 0.01, end)
  // Home is where it armed (0.25 s); touchdown is the final resting place
  const pos = from('pos_ned')
  const north = pick('North', pos, [0]), east = pick('East', pos, [1])
  const fromHome = expr('DistanceFromHome', 'sqrt((in(0) - in(2)) * (in(0) - in(2)) + (in(1) - in(3)) * (in(1) - in(3)))',
    [north, east, h.heldAt('HomeNorth', north, 0.3), h.heldAt('HomeEast', east, 0.3)])
  check('LandsNearHome', fromHome, 0, T.landM, end)
  check('DisarmedOnImpact', from('fc_armed'), 0, 0, end)
  return { is, first }
}

/** Return-check limits (m, deg). */
/** (The heading is checked a sample after ROTATE hands over below 30°; the speed limits cover T11 and T20, measured 6.8 and 8.8 m/s.) */
export const RESCUE_RETURN_TEST = { altitudeM: 1.5, swingM: 3, headingDeg: 32, descentDistM: 1, landM: 5 }

/** T11 / T20: rescue switch at 20 s, about 82 m east; FLY_HOME settles 4.5 s after entry (ATTAIN_ALT overshoots). */
export const RESCUE_SWITCH_TEST = { on: 20, flyHomeSettleS: 4.5, speed: [6, 9.5] as [number, number], duration: 60, noMagDuration: 62 }

function buildRescueSwitchTestModel(noMag: boolean) {
  const t = RESCUE_SWITCH_TEST
  const duration = noMag ? t.noMagDuration : t.duration
  const tests = () => {
    const ctx = testsSheet()
    const { s, h, from, expr, upright } = ctx
    const alt = from('alt_est')
    // Betaflight's MAX_ALT return altitude: the highest alt_est before the rescue, plus initial_climb
    const ret = expr('ReturnAltitudeM', `in(0) + ${FC.rescue.initialClimbM}.0`, [h.heldAt('MaxAltitudeAtSwitch', h.runMax('MaxAltitude', alt), t.on)])
    rescueReturnChecks(ctx, { on: t.on, duration, returnAltM: ret, descentDistM: FC.rescue.descentDistM, flyHomeSettleS: t.flyHomeSettleS, speed: t.speed })
    upright()
    return s
  }
  return buildFpvTestModel({
    name: noMag ? 'FPV T20 No-Mag Rescue' : 'FPV T11 GPS Rescue Switch',
    description:
      `Validation test for GPS Rescue${noMag ? ' without a magnetometer' : ''} (docs/fpv-hud-gnss-test-plan.md, ${noMag ? 'T20' : 'T11'}): fly out about ` +
      `80 m east at about 14 m, then the rescue switch at ${t.on} s. The rescue climbs to the maximum altitude + ${FC.rescue.initialClimbM} m, ` +
      `rotates to home, flies home at about 7.5 m/s, starts its descent ${FC.rescue.descentDistM} m out, lands within ` +
      `${RESCUE_RETURN_TEST.landM} m of home and disarms on impact.` +
      (noMag ? ' Heading comes from GPS course over ground.' : ''),
    sticks: rescueFlyoutSticks(windows([t.on, duration + 1]), t.on),
    duration,
    displays: [['Position', 'pos_ned'], ['RescuePhase', 'rescue_phase'], ['Altitude', 'alt_est'], ['HomeDistance', 'home_distance_m']],
    tests,
    vehicleName: noMag ? FPV_VEHICLE_NO_MAG_NAME : undefined,
  })
}

/** T11: GPS Rescue by switch. */
export function buildFpvRescueSwitchTestModel() {
  return buildRescueSwitchTestModel(false)
}

/** T20: GPS Rescue by switch on the vehicle without a magnetometer. */
export function buildFpvNoMagRescueTestModel() {
  return buildRescueSwitchTestModel(true)
}

/** T10 timeline (s): link lost; link back with centred sticks; a 40% roll stick. */
export const FAILSAFE_RESCUE_TEST = { loss: 25, linkBack: 40, stick: 45, duration: 50 }

/** T10: failsafe GPS-RESCUE — stage 2 starts the rescue; the link alone does not end it; stick movement does. */
export function buildFpvFailsafeRescueTestModel() {
  const t = FAILSAFE_RESCUE_TEST
  const stage2 = t.loss + FC.failsafe.delayS
  const e = 0.05
  const tests = () => {
    const ctx = testsSheet()
    const { s, from, check, upright } = ctx
    const P = RESCUE_PHASE
    const { first, inOrder } = rescuePhases(ctx)
    const active = from('rescue_active'), stage = from('failsafe_stage')
    check('NoRescueBeforeStage2', active, 0, 0, 0, stage2 - e)
    check('Stage1', stage, 1, 1, t.loss + e, stage2 - e)
    check('Stage2', stage, 2, 2, stage2 + e, t.stick - e)
    check('RescueFromStage2', first(P.attainAlt), stage2 - 0.001, stage2 + 0.02, stage2 + e)
    check('LinkBackDoesNotEndIt', active, 1, 1, stage2 + e, t.stick - e)
    check('ModeIsFailsafe', from('fc_mode'), FC_MODE.failsafe, FC_MODE.failsafe, t.loss + e, t.stick - e)
    check('PhasesInOrder', inOrder('PhaseOrder', [P.attainAlt, P.rotate, P.flyHome, P.descent]), 1, 1, t.stick - e)
    check('StickMovementEndsIt', active, 0, 0, t.stick + e)
    check('FailsafeEnded', stage, 0, 0, t.stick + e)
    check('StaysArmed', from('fc_armed'), 1, 1, 0.3)
    upright()
    return s
  }
  return buildFpvTestModel({
    name: 'FPV T10 Failsafe Rescue',
    description:
      'Validation test for the GPS-RESCUE failsafe procedure (docs/fpv-hud-gnss-test-plan.md, T10): about 70 m out, the link is lost at ' +
      `${t.loss} s. Stage 2 at ${stage2} s starts GPS Rescue (mode !FS!); the link coming back at ${t.linkBack} s with centred sticks ` +
      `does not end it; a 40% roll stick at ${t.stick} s does, and the pilot has control again.`,
    sticks: { ...rescueFlyoutSticks([[0, 0]]), roll: [...rescueFlyoutSticks([[0, 0]]).roll, [t.stick - 0.001, 0], [t.stick, 0.4], [t.stick + 0.5, 0.4], [t.stick + 0.501, 0]] },
    duration: t.duration,
    displays: [['Position', 'pos_ned'], ['RescuePhase', 'rescue_phase'], ['FailsafeStage', 'failsafe_stage'], ['Mode', 'fc_mode']],
    tests,
    conditions: { rcLinkValid: step([[0, 1], [t.loss, 0], [t.linkBack, 1]]), failsafeProcedure: FAILSAFE_PROCEDURE.gpsRescue },
  })
}

/** T12a timeline (s): rescue switch on about 40 m out, off 2 s later in ATTAIN_ALT. */
export const RESCUE_SWITCH_OFF_TEST = { on: 13.5, off: 15.5, duration: 20 }

/** T12a: switching the rescue off ends it at once; the pilot has angle mode back. */
export function buildFpvRescueSwitchOffTestModel() {
  const t = RESCUE_SWITCH_OFF_TEST
  const e = 0.05
  const tests = () => {
    const ctx = testsSheet()
    const { s, from, check, upright } = ctx
    const { is } = rescuePhases(ctx)
    const active = from('rescue_active')
    check('ActiveWhileOn', active, 1, 1, t.on + e, t.off - e)
    check('ClimbingWhenOff', is(RESCUE_PHASE.attainAlt), 1, 1, t.on + e, t.off - e)
    check('EndsAtOnce', active, 0, 0, t.off + e)
    check('PhaseIdleAfter', from('rescue_phase'), RESCUE_PHASE.idle, RESCUE_PHASE.idle, t.off + e)
    check('PilotHasAngleMode', from('fc_mode'), FC_MODE.angle, FC_MODE.angle, t.off + e)
    check('StaysArmed', from('fc_armed'), 1, 1, 0.3)
    upright()
    return s
  }
  return buildFpvTestModel({
    name: 'FPV T12a Rescue Switch Off',
    description:
      'Validation test for ending GPS Rescue by switch (docs/fpv-hud-gnss-test-plan.md, T12a): the rescue switch goes on about 40 m out at ' +
      `${t.on} s and off at ${t.off} s, while it is still climbing. The rescue ends at once and the pilot flies in angle mode.`,
    sticks: rescueFlyoutSticks(windows([t.on, t.off]), t.on),
    duration: t.duration,
    displays: [['RescuePhase', 'rescue_phase'], ['Mode', 'fc_mode'], ['Altitude', 'alt_est']],
    tests,
  })
}

/** T12b: a 25% roll stick for 1 s drifts the quad about 5 m east; the rescue starts at 12 s, inside min_start_dist. */
export const RESCUE_TOO_CLOSE_TEST = { roll: [7, 8] as [number, number], on: 12, flyHomeSettleS: 7.5, duration: 55 }

/** T12b: a too-close start climbs to max(10 m, current + 10 m), pitches out beyond 15 m, then returns and lands. */
export function buildFpvRescueTooCloseTestModel() {
  const t = RESCUE_TOO_CLOSE_TEST
  const R = FC.rescue
  const tests = () => {
    const ctx = testsSheet()
    const { s, h, from, expr, check, upright } = ctx
    check('StartsTooClose', h.heldAt('DistanceAtSwitch', from('home_distance_m'), t.on), 0, R.minStartDistM - 0.01, t.on + 0.01)
    // Inside 5 m of home too, but above the landing altitude, so it climbs (T12c is the other side of that gate)
    const altAtSwitch = h.heldAt('AltitudeAtSwitch', from('alt_est'), t.on)
    check('StartsAboveLandingAltitude', altAtSwitch, R.landingAltitudeM, null, t.on + 0.01)
    const ret = expr('ReturnAltitudeM', `fmax(10.0, in(0) + ${R.initialClimbM}.0)`, [altAtSwitch])
    const { is } = rescueReturnChecks(ctx, { on: t.on, duration: t.duration, returnAltM: ret, descentDistM: 0.5 * R.minStartDistM, flyHomeSettleS: t.flyHomeSettleS })
    check('PitchesOutBeyondMinStart', h.heldWhen('DistanceOnRotate', from('home_distance_m'), is(RESCUE_PHASE.rotate)), R.minStartDistM, null, t.duration - 0.5)
    upright()
    return s
  }
  return buildFpvTestModel({
    name: 'FPV T12b Rescue Too Close',
    description:
      'Validation test for a GPS Rescue started inside min_start_dist (docs/fpv-hud-gnss-test-plan.md, T12b): about 5 m from home at ' +
      `${t.on} s, the rescue climbs to max(10 m, current + 10 m) while pitching 15° forward, turns home once beyond ` +
      `${R.minStartDistM} m, starts its descent ${0.5 * R.minStartDistM} m out, lands near home and disarms on impact.`,
    sticks: { ...rescueFlyoutSticks(windows([t.on, t.duration + 1]), t.on), roll: [[0, 0], [t.roll[0], 0], [t.roll[0] + 0.2, 0.25], [t.roll[1] + 0.2, 0.25], [t.roll[1] + 0.4, 0]] },
    duration: t.duration,
    displays: [['Position', 'pos_ned'], ['RescuePhase', 'rescue_phase'], ['Altitude', 'alt_est'], ['HomeDistance', 'home_distance_m']],
    tests,
  })
}

/** T12c: a short climb, Alt Hold at about 2.5 m from 2 s; the rescue switch at 6 s, about 1 m from home. */
export const RESCUE_LOW_AT_HOME_TEST = { holdOn: 2, on: 6, duration: 8 }

/**
 * T12c: a rescue started within 5 m of home and below ap_landing_altitude_m
 * (4 m on alt_est, which is height above the arming point) aborts and disarms
 * at once, in the air as on the ground. Betaflight's INITIALIZE does this for
 * safety (gps_rescue_multirotor.c: distance < 5 m && isBelowLandingAltitude()).
 * T12b is the other side of the gate: inside 5 m but above 4 m, it climbs.
 */
export function buildFpvRescueLowAtHomeTestModel() {
  const t = RESCUE_LOW_AT_HOME_TEST
  const R = FC.rescue
  const hov = Number(HOVER_THROTTLE.toFixed(4))
  const tests = () => {
    const ctx = testsSheet()
    const { s, h, from, check } = ctx
    const { first } = rescuePhases(ctx)
    check('StartsWithin5mOfHome', h.heldAt('DistanceAtSwitch', from('home_distance_m'), t.on), 0, 4.99, t.on + 0.01)
    check('StartsBelowLandingAltitude', h.heldAt('AltitudeAtSwitch', from('alt_est'), t.on), 0.5, R.landingAltitudeM - 0.01, t.on + 0.01)
    check('ArmedInTheAirBefore', from('fc_armed'), 1, 1, t.holdOn, t.on - 0.01)
    check('AbortsAtOnce', first(RESCUE_PHASE.abort), t.on - 0.001, t.on + 0.02, t.on + 0.05)
    check('NeverClimbs', h.phaseVisited('Climbed', from('rescue_phase'), RESCUE_PHASE.attainAlt), 0, 0)
    check('Disarmed', from('fc_armed'), 0, 0, t.on + 0.05)
    return s
  }
  return buildFpvTestModel({
    name: 'FPV T12c Rescue Low At Home',
    description:
      'Validation test for the GPS Rescue start gate (docs/fpv-hud-gnss-test-plan.md, T12c): Alt Hold at about 2.5 m, about 1 m ' +
      `from home, then the rescue switch at ${t.on} s. Within 5 m of home and below the ${R.landingAltitudeM} m landing altitude ` +
      '(alt_est, height above the arming point), Betaflight aborts and disarms at once, in the air as on the ground.',
    sticks: {
      roll: [[0, 0]], pitch: [[0, 0]], yaw: [[0, 0]], aux: [[0, 1]], arm: DEMO_STICKS.arm,
      throttle: [[0, 0], [0.5, 0], [0.6, 0.6], [0.9, 0.6], [1.0, hov]],
      hold: step([[0, 0], [t.holdOn, 0.5]]),
      rescue: windows([t.on, t.duration + 1]),
    },
    duration: t.duration,
    displays: [['RescuePhase', 'rescue_phase'], ['Altitude', 'alt_est'], ['HomeDistance', 'home_distance_m'], ['Armed', 'fc_armed']],
    tests,
  })
}

/** T13 timelines (s): satellites to 2 two seconds into FLY_HOME; LOWSATS needs 10 s of 1 Hz checks. */
export const RESCUE_SANITY_TEST = {
  on: 20, lowSats: 27, failBy: [35.5, 37] as [number, number], durationA: 60,
  linkLost: 19, durationB: 40,
  rearm: 1.5, holdOn: 4, onC: 6, durationC: 12,
}

/** T13a / T13b: satellites lost in FLY_HOME, with the rescue from the switch (DO_NOTHING, then ABORT) or from failsafe (ABORT). */
function buildRescueLowSatsTestModel(linkLost: boolean) {
  const t = RESCUE_SANITY_TEST
  const P = RESCUE_PHASE
  const duration = linkLost ? t.durationB : t.durationA
  const tests = () => {
    const ctx = testsSheet()
    const { s, h, from, pick, expr, check, bit, upright } = ctx
    const { is, first } = rescuePhases(ctx)
    check('InFlyHomeAtSatelliteLoss', h.heldAt('PhaseAtLoss', from('rescue_phase'), t.lowSats), P.flyHome, P.flyHome, t.lowSats + 0.01)
    check('RescueNotAvailable', bit('WarnRescueNA', from('fc_warnings'), FC_WARNING.rescueNA), 1, 1, t.lowSats + 3, t.failBy[0])
    if (linkLost) {
      check('NoDoNothingWithLinkLost', h.phaseVisited('DidNothing', from('rescue_phase'), P.doNothing), 0, 0)
      check('AbortsOnLowSats', first(P.abort), t.failBy[0], t.failBy[1], t.failBy[1])
      check('Disarmed', from('fc_armed'), 0, 0, t.failBy[1] + 0.05)
    } else {
      check('DoNothingOnLowSats', first(P.doNothing), t.failBy[0], t.failBy[1], t.failBy[1])
      check('AbortAfter20s', expr('DoNothingDuration', 'in(1) - in(0)', [first(P.doNothing), first(P.abort)]), 19.98, 20.02, duration - 0.5)
      // Level: the rescue's angles are 0 (the true attitude, 2 s after entry)
      const levelGate = expr('DoNothingSettled', '(in(0) > 0.5 && in(2) - in(1) > 2.0) ? 1.0 : 0.0', [is(P.doNothing), first(P.doNothing), h.clock()])
      const tiltDeg = expr('TiltDeg', `(in(0) > 0.5) ? fmax(fabs(in(1)), fabs(in(2))) * ${180 / Math.PI} : 0.0`,
        [levelGate, pick('Roll', from('euler'), [0]), pick('Pitch', from('euler'), [1])])
      check('LevelInDoNothing', tiltDeg, 0, RESCUE_SANITY_TEST_TILT_DEG)
      check('DisarmedByAbort', from('fc_armed'), 0, 0, t.failBy[1] + 20.05)
    }
    upright()
    return s
  }
  return buildFpvTestModel({
    name: linkLost ? 'FPV T13b Rescue Low Sats Failsafe' : 'FPV T13a Rescue Low Sats',
    description:
      `Validation test for the GPS Rescue LOWSATS check (docs/fpv-hud-gnss-test-plan.md, ${linkLost ? 'T13b' : 'T13a'}): ` +
      (linkLost ? `the link is lost at ${t.linkLost} s (GPS-RESCUE procedure)` : `the rescue switch goes on at ${t.on} s`) +
      `; satellites drop to 2 at ${t.lowSats} s, in FLY_HOME. After 10 s of 1 Hz checks the rescue fails with LOWSATS: ` +
      (linkLost ? 'with the link lost the FS_ONLY policy aborts and disarms at once.' : 'the switch-started rescue does nothing (level, last throttle) for 20 s, then aborts and disarms.'),
    sticks: rescueFlyoutSticks(linkLost ? [[0, 0]] : windows([t.on, duration + 1]), linkLost ? t.linkLost : t.on),
    duration,
    displays: [['Position', 'pos_ned'], ['RescuePhase', 'rescue_phase'], ['Warnings', 'fc_warnings'], ['Altitude', 'alt_est']],
    tests,
    conditions: {
      gnssEnv: { satellites: step([[0, 14], [t.lowSats, 2]]) },
      ...(linkLost ? { rcLinkValid: step([[0, 1], [t.linkLost, 0]]), failsafeProcedure: FAILSAFE_PROCEDURE.gpsRescue } : {}),
    },
  })
}

/** T13a's limit on roll and pitch (deg) once DO_NOTHING has levelled the quad. */
export const RESCUE_SANITY_TEST_TILT_DEG = 5

export function buildFpvRescueLowSatsTestModel() {
  return buildRescueLowSatsTestModel(false)
}

export function buildFpvRescueLowSatsFailsafeTestModel() {
  return buildRescueLowSatsTestModel(true)
}

/**
 * T13c: re-armed with 7 satellites (no home), RESCUE OFF shows; the rescue
 * switch then fails with NO_HOME_POINT and does nothing: Betaflight holds
 * the autopilot's last throttle, here Alt Hold's while it was still settling
 * (below hover), so the quad sinks and disarms on impact.
 */
export function buildFpvRescueNoHomeTestModel() {
  const t = RESCUE_SANITY_TEST
  const P = RESCUE_PHASE
  const e = 0.05
  const tests = () => {
    const ctx = testsSheet()
    const { s, h, from, check, bit } = ctx
    const { first } = rescuePhases(ctx)
    const off = bit('WarnRescueOff', from('fc_warnings'), FC_WARNING.rescueOff)
    check('NoHomeOnReArm', from('home_valid'), 0, 0, t.rearm + e)
    check('RescueOffAfterArming', off, 1, 1, t.rearm + e, t.rearm + 3 - e)
    check('RescueOffClears', off, 0, 0, t.rearm + 3 + e)
    check('DoNothingAtOnce', first(P.doNothing), t.onC - 0.001, t.onC + 0.02, t.onC + e)
    check('NeverClimbs', h.phaseVisited('Climbed', from('rescue_phase'), P.attainAlt), 0, 0)
    check('NeverAborts', h.phaseVisited('Aborted', from('rescue_phase'), P.abort), 0, 0)
    check('DisarmedOnImpact', from('fc_armed'), 0, 0, t.durationC - 0.5)
    return s
  }
  return buildFpvTestModel({
    name: 'FPV T13c Rescue No Home',
    description:
      'Validation test for GPS Rescue without a home (docs/fpv-hud-gnss-test-plan.md, T13c): armed with 14 satellites, disarmed, then ' +
      `re-armed at ${t.rearm} s with 7 (no home; RESCUE OFF for 3 s). Alt Hold from ${t.holdOn} s; the rescue switch at ${t.onC} s fails ` +
      'with NO_HOME_POINT and does nothing, holding the last autopilot throttle, so the quad sinks and disarms on impact.',
    sticks: {
      roll: [[0, 0]], pitch: [[0, 0]], yaw: [[0, 0]], aux: [[0, 1]],
      arm: windows([0.25, 1.0], [t.rearm, t.durationC + 1]),
      throttle: [[0, 0], [2.0, 0], [2.1, 0.6], [2.7, 0.6], [2.8, 0.42]],
      hold: [[0, 0], [t.holdOn - 0.001, 0], [t.holdOn, 0.5]],
      rescue: windows([t.onC, t.durationC + 1]),
    },
    duration: t.durationC,
    displays: [['RescuePhase', 'rescue_phase'], ['Warnings', 'fc_warnings'], ['Altitude', 'alt_est']],
    tests,
    conditions: { gnssEnv: { satellites: step([[0, 14], [0.8, 7]]) } },
  })
}

/**
 * T14 timeline (s): rescue switch about 30 m out; a 25 m/s wind from the west
 * (faster than the quad flies at the 45° rescue pitch limit, about 22 m/s)
 * from FLY_HOME. 30 s without progress force-disables the mag and resets the
 * count; 30 s more gives FLYAWAY.
 */
export const RESCUE_FLYAWAY_TEST = { on: 12.5, wind: [16.5, 17.5] as [number, number], windMs: 25, flyawayS: [58, 61] as [number, number], duration: 100 }

/** T14: GPS Rescue fly-away into a wind it cannot beat. */
export function buildFpvRescueFlyawayTestModel() {
  const t = RESCUE_FLYAWAY_TEST
  const P = RESCUE_PHASE
  const tests = () => {
    const ctx = testsSheet()
    const { s, from, expr, check } = ctx
    const { first } = rescuePhases(ctx)
    check('FlyingHomeIntoWind', first(P.flyHome), t.on, t.wind[1], t.wind[1])
    check('FlyawayAfter60s', expr('FlyHomeDuration', 'in(1) - in(0)', [first(P.flyHome), first(P.doNothing)]), t.flyawayS[0], t.flyawayS[1], t.duration - 0.5)
    check('AbortAfter20s', expr('DoNothingDuration', 'in(1) - in(0)', [first(P.doNothing), first(P.abort)]), 19.98, 20.02, t.duration - 0.5)
    check('Disarmed', from('fc_armed'), 0, 0, t.duration - 0.5)
    return s
  }
  return buildFpvTestModel({
    name: 'FPV T14 Rescue Fly-away',
    description:
      'Validation test for the GPS Rescue fly-away check (docs/fpv-hud-gnss-test-plan.md, T14): the rescue switch at ' +
      `${t.on} s; from FLY_HOME a ${t.windMs} m/s wind from the west carries the quad away faster than it can fly. After 30 s without ` +
      'progress the magnetometer is force-disabled and the count restarts; 30 s later the rescue fails with FLYAWAY, does nothing ' +
      'for 20 s, then aborts and disarms.',
    sticks: rescueFlyoutSticks(windows([t.on, t.duration + 1]), t.on),
    duration: t.duration,
    displays: [['Position', 'pos_ned'], ['RescuePhase', 'rescue_phase'], ['HomeDistance', 'home_distance_m']],
    tests,
    conditions: { wind: { east: [[0, 0], [t.wind[0], 0], [t.wind[1], t.windMs]] } },
  })
}

/** T23 timeline (s): each mode in turn, a satellite loss in ANGL, and a link loss last. */
export const OSD_TEST = {
  arm: 0.25, airmodeAt: [0.7, 0.8] as [number, number], angle: 3, lowSats: [4, 7.5] as [number, number],
  altHold: 9, posHold: 11, rescue: [13, 15] as [number, number], linkLost: 17, duration: 20,
}

/**
 * T23: OSD outputs — fc_mode in Betaflight's priority order through ACRO, AIR,
 * ANGL, ALTH, POSH, RESC (which overrides the holds) and !FS!; the airmode
 * latch; RESCUE N/A; mAh drawn against the state of charge.
 */
export function buildFpvOsdTestModel() {
  const t = OSD_TEST
  const M = FC_MODE
  const e = 0.05
  const hov = Number(HOVER_THROTTLE.toFixed(4))
  const tests = () => {
    const { s, from, expr, check, bit, upright } = testsSheet()
    const mode = from('fc_mode'), air = from('fc_airmode')
    check('ModeAcro', mode, M.acro, M.acro, t.arm + e, t.airmodeAt[0])
    check('ModeAir', mode, M.air, M.air, t.airmodeAt[1], t.angle - e)
    check('ModeAngle', mode, M.angle, M.angle, t.angle + e, t.altHold - e)
    check('ModeAltHold', mode, M.altHold, M.altHold, t.altHold + e, t.posHold - e)
    check('ModePosHold', mode, M.posHold, M.posHold, t.posHold + e, t.rescue[0] - e)
    check('ModeRescue', mode, M.rescue, M.rescue, t.rescue[0] + e, t.rescue[1] - e)
    check('ModePosHoldAfterRescue', mode, M.posHold, M.posHold, t.rescue[1] + e, t.linkLost - e)
    check('ModeFailsafe', mode, M.failsafe, M.failsafe, t.linkLost + e)
    check('AirmodeOffAtLowThrottle', air, 0, 0, t.arm + e, t.airmodeAt[0])
    check('AirmodeLatched', air, 1, 1, t.airmodeAt[1])
    // The rescue suppresses both holds while their switch stays high
    check('RescueOverridesAltHold', from('alt_hold_active'), 0, 0, t.rescue[0] + e, t.rescue[1] - e)
    check('RescueOverridesPosHold', from('pos_hold_active'), 0, 0, t.rescue[0] + e, t.rescue[1] - e)
    check('HoldsResumeAfterRescue', from('pos_hold_active'), 1, 1, t.rescue[1] + 0.1, t.linkLost - e)
    // RESCUE N/A: armed with a home and no fix at a 1 Hz check (or under 4 satellites for two checks, which needs
    // a 3D fix with 3 satellites: this receiver never gives one); clear once the fix is back
    const na = bit('WarnRescueNA', from('fc_warnings'), FC_WARNING.rescueNA)
    check('RescueAvailableBefore', na, 0, 0, t.arm + e, t.lowSats[0] - e)
    check('RescueNotAvailable', na, 1, 1, t.lowSats[0] + 1.05, t.lowSats[1] - e)
    check('RescueAvailableAgain', na, 0, 0, t.lowSats[1] + SENSORS.gnss.reacquireS + 1.1, t.rescue[0] - e)
    check('MahDrawnMatchesSoc', expr('MahDrawnError', `in(0) - (1.0 - in(1)) * ${BATTERY.capacityAh * 1000}`,
      [from('battery_mah_drawn'), from('battery_soc')]), -1e-9, 1e-9)
    upright()
    return s
  }
  return buildFpvTestModel({
    name: 'FPV T23 OSD Outputs',
    description:
      'Validation test for the flight controller OSD outputs (docs/fpv-hud-gnss-test-plan.md, T23): armed in acro, the throttle ' +
      'latches airmode, then angle mode, Alt Hold, Pos Hold, the rescue switch (which overrides both holds) and a link loss; ' +
      'fc_mode follows Betaflight\'s priority (!FS! > RESC > POSH > ALTH > ANGL > AIR > ACRO). Satellites drop to 2 in angle ' +
      'mode (no fix: RESCUE N/A), and mAh drawn matches the state of charge throughout.',
    sticks: {
      roll: [[0, 0]], pitch: [[0, 0]], yaw: [[0, 0]],
      throttle: [[0, 0], [t.airmodeAt[0], 0], [t.airmodeAt[1], 0.6], [1.4, 0.6], [1.5, hov]],
      aux: step([[0, 0], [t.angle, 1]]),
      arm: [[0, 0], [t.arm, 0], [t.arm + 0.001, 1]],
      hold: step([[0, 0], [t.altHold, 0.5], [t.posHold, 1]]),
      rescue: windows(t.rescue),
    },
    duration: t.duration,
    displays: [['Mode', 'fc_mode'], ['Warnings', 'fc_warnings'], ['Airmode', 'fc_airmode'], ['Position', 'pos_ned']],
    tests,
    conditions: {
      gnssEnv: { satellites: step([[0, 14], [t.lowSats[0], 2], [t.lowSats[1], 14]]) },
      rcLinkValid: step([[0, 1], [t.linkLost, 0]]),
    },
  })
}

/** A test model renamed for the validation suite ("FPV Tnn …"). */
const renamed = (model: { name: string; data: Record<string, unknown> }, name: string) => ({ ...model, name })

/**
 * The validation suite written to test-models/fpv/ (docs/fpv-hud-gnss-test-plan.md):
 * its own copy of the vehicle, so the folder runs on its own with
 * `npm run obliq:test -- test-models/fpv/*.json`, and the Tnn test models.
 */
export function TEST_FPV_MODELS(): Array<[string, { name: string; data: Record<string, unknown> }]> {
  return [
    ['fpv-vehicle.json', buildFpvModel({ vehicleOnly: true })],
    ['fpv-vehicle-no-mag.json', buildFpvNoMagVehicle()],
    ['t00-test-helpers.json', buildFpvHelpersTestModel()],
    ['t01-demo-flight.json', renamed(buildFpvDemoFlightModel(), 'FPV T01 Demo Flight')],
    ['t02-acro-rate-step.json', renamed(buildFpvAcroRateStepModel(), 'FPV T02 Acro Rate Step')],
    ['t03-gnss-statistics.json', buildFpvGnssStatisticsTestModel()],
    ['t04-gnss-conditions.json', buildFpvGnssConditionsTestModel()],
    ['t05-gnss-course.json', buildFpvGnssCourseTestModel()],
    ['t06-grid-convergence.json', buildFpvGridConvergenceTestModel()],
    ['t07-arming-checks.json', buildFpvArmingChecksTestModel()],
    ['t08-failsafe-drop.json', buildFpvFailsafeDropTestModel()],
    ['t09-failsafe-auto-land.json', buildFpvAutoLandTestModel()],
    ['t10-failsafe-rescue.json', buildFpvFailsafeRescueTestModel()],
    ['t11-gps-rescue-switch.json', buildFpvRescueSwitchTestModel()],
    ['t12a-rescue-switch-off.json', buildFpvRescueSwitchOffTestModel()],
    ['t12b-rescue-too-close.json', buildFpvRescueTooCloseTestModel()],
    ['t12c-rescue-low-at-home.json', buildFpvRescueLowAtHomeTestModel()],
    ['t13a-rescue-low-sats.json', buildFpvRescueLowSatsTestModel()],
    ['t13b-rescue-low-sats-failsafe.json', buildFpvRescueLowSatsFailsafeTestModel()],
    ['t13c-rescue-no-home.json', buildFpvRescueNoHomeTestModel()],
    ['t14-rescue-flyaway.json', buildFpvRescueFlyawayTestModel()],
    ['t16-altitude-hold.json', buildFpvAltHoldTestModel()],
    ['t17-position-hold.json', buildFpvPosHoldTestModel()],
    ['t18-position-hold-sanity.json', buildFpvPosHoldSanityTestModel()],
    ['t19-no-mag-heading.json', buildFpvNoMagHeadingTestModel()],
    ['t20-no-mag-rescue.json', buildFpvNoMagRescueTestModel()],
    ['t21-altitude-estimator.json', buildFpvAltitudeEstimatorTestModel()],
    ['t22-wind.json', buildFpvWindTestModel()],
    ['t23-osd-outputs.json', buildFpvOsdTestModel()],
  ]
}

/** Grow each sheet's extents to cover its laid-out blocks. */
/**
 * The Tests sheet: Assert blocks that check the default demo flight against
 * DEMO_TESTS, fed by sheet labels from Main like the Telemetry sheet.
 */
function buildTestsSheet(): SheetBuilder {
  const t = DEMO_TESTS
  const s = new SheetBuilder('tests', 'Tests')
  // Rounded so the Scale blocks stay readable; 4e-7 relative error is far
  // inside every limit
  const R2D = Number((180 / Math.PI).toFixed(4))
  const from = (signal: string) => s.add('sheet_label_source', `From_${signal}`, { signalName: signal })
  const pick = (name: string, src: string, indices: number[]) => {
    const id = s.add('selector', name, { indices })
    s.wire(src, id)
    return id
  }
  const check = (name: string, input: string, params: Record<string, unknown>, expected?: string) => {
    const id = s.add('assert', name, { mode: 'bounds', checkFrom: 0, checkUntil: null, onFailure: 'record', ...params })
    s.wire(input, id, 0)
    if (expected) s.wire(expected, id, 1)
  }

  const motorCmd = from('motor_cmd')
  const pos = from('pos_ned')
  const euler = from('euler')
  const eulerDeg = s.add('scale', 'EulerDeg', { gain: R2D })
  s.wire(euler, eulerDeg)
  const eulerEstDeg = s.add('scale', 'EulerEstimateDeg', { gain: R2D })
  s.wire(from('euler_est'), eulerEstDeg)
  const rollPitch = pick('RollPitch', eulerDeg, [0, 1])
  const down = pick('Down', pos, [2])
  const height = s.add('evaluate', 'HeightAboveField', { numInputs: 1, expression: `-${LOCATION.elevationM} - in(0)` })
  s.wire(down, height)
  // Height above the arming point (the vehicle armed at rest on the field), what alt_est reports
  const heightAboveArming = s.add('evaluate', 'HeightAboveArming', { numInputs: 1, expression: `-in(0) - ${LOCATION.elevationM - GROUND_REST_Z}` })
  s.wire(down, heightAboveArming)

  check('DisarmedMotorsOff', motorCmd, { lower: 0, upper: 0, checkUntil: t.armTime - 0.01 })
  check('ArmedMotorsAtIdle', motorCmd, { lower: FC.motorIdle - 1e-9, upper: 1, checkFrom: t.armTime + 0.05 })
  check('ClimbsAfterTakeoff', height, { lower: t.minHeightM, upper: null, checkFrom: t.climbFrom })
  check('LevelClimb', rollPitch, { lower: -t.levelDeg, upper: t.levelDeg, checkFrom: t.levelWindow[0], checkUntil: t.levelWindow[1] })
  check('BankFollowsStick', pick('Roll', eulerDeg, [0]), { lower: t.bankDeg[0], upper: t.bankDeg[1], checkFrom: t.bankWindow[0], checkUntil: t.bankWindow[1] })
  check('PitchFollowsStick', pick('Pitch', eulerDeg, [1]), { lower: t.pitchDeg[0], upper: t.pitchDeg[1], checkFrom: t.pitchWindow[0], checkUntil: t.pitchWindow[1] })
  check('YawTurnCompletes', pick('Yaw', eulerDeg, [2]), { lower: t.yawDeg[0], upper: t.yawDeg[1], checkFrom: t.yawFrom })
  check('AttitudeEstimateTracks', eulerEstDeg, { mode: 'near', absTol: t.attitudeEstimateDeg, relTol: 0 }, eulerDeg)
  check('AltEstTracks', from('alt_est'), { mode: 'near', absTol: t.altitudeEstimateM, relTol: 0 }, heightAboveArming)
  check('BatteryAboveCutoff', from('battery_voltage'), { lower: t.minBatteryV, upper: null })
  check('StaysUpright', rollPitch, { lower: -t.uprightDeg, upper: t.uprightDeg, onFailure: 'stop' })

  // OSD signals (docs/fpv-hud-gnss-test-plan.md, T01): flags, home, GNSS, mAh
  const armed = from('fc_armed')
  check('ArmedFlagOffBeforeArming', armed, { lower: 0, upper: 0, checkUntil: t.armTime - 0.01 })
  check('ArmedFlagOnAfterArming', armed, { lower: 1, upper: 1, checkFrom: t.armTime + 0.01 })
  check('ModeIsAngle', from('fc_angle_mode'), { lower: 1, upper: 1 })
  const homeValid = from('home_valid')
  check('HomeUnsetBeforeArming', homeValid, { lower: 0, upper: 0, checkUntil: t.armTime - 0.01 })
  check('HomeSetOnArm', homeValid, { lower: 1, upper: 1, checkFrom: t.armTime + 0.01 })
  const gnss = from('gnss_pos')
  const horizontal = (name: string, a: string, b: string) => {
    const id = s.add('evaluate', name, { numInputs: 4, expression: 'sqrt((in(0) - in(2)) * (in(0) - in(2)) + (in(1) - in(3)) * (in(1) - in(3)))' })
    s.wire(pick(`${name}A0`, a, [0]), id, 0)
    s.wire(pick(`${name}A1`, a, [1]), id, 1)
    s.wire(pick(`${name}B0`, b, [0]), id, 2)
    s.wire(pick(`${name}B1`, b, [1]), id, 3)
    return id
  }
  check('GnssTracksTruth', horizontal('GnssHorizontalError', gnss, pos), { lower: 0, upper: t.gnssHorizontalM })
  // The vehicle armed at rest at the origin, so the true distance home is |n, e|
  const trueDistance = s.add('evaluate', 'TrueDistanceHome', { numInputs: 2, expression: 'sqrt(in(0) * in(0) + in(1) * in(1))' })
  s.wire(pick('TruthNorth', pos, [0]), trueDistance, 0)
  s.wire(pick('TruthEast', pos, [1]), trueDistance, 1)
  const distanceError = s.add('evaluate', 'HomeDistanceError', { numInputs: 2, expression: 'in(0) - in(1)' })
  s.wire(from('home_distance_m'), distanceError, 0)
  s.wire(trueDistance, distanceError, 1)
  check('HomeDistanceTracks', distanceError, { lower: -t.gnssHorizontalM, upper: t.gnssHorizontalM, checkFrom: t.armTime + SENSORS.gnss.ts + 0.01 })
  const mahError = s.add('evaluate', 'MahDrawnError', { numInputs: 2, expression: `in(0) - (1.0 - in(1)) * ${BATTERY.capacityAh * 1000}` })
  s.wire(from('battery_mah_drawn'), mahError, 0)
  s.wire(from('battery_soc'), mahError, 1)
  check('MahDrawnMatchesSoc', mahError, { lower: -1e-9, upper: 1e-9 })
  return s
}

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
  // Shipped reference models (the vehicle and the test models that embed
  // it), then the validation suite: [reference dir] [test-models dir]
  const write = (dir: string, models: Array<[string, { name: string; data: Record<string, unknown> }]>) => {
    fs.mkdirSync(dir, { recursive: true })
    for (const [file, model] of models) {
      fs.writeFileSync(path.join(dir, file), JSON.stringify(model, null, 2) + '\n')
      console.log(`Wrote ${path.join(dir, file)}`)
    }
  }
  write(process.argv[2] || path.join(__dirname, '..', 'reference-models'), SHIPPED_FPV_MODELS())
  write(process.argv[3] || path.join(__dirname, '..', 'test-models', 'fpv'), TEST_FPV_MODELS())
  console.log(`(hover command ${HOVER_COMMAND.toFixed(4)}, omega_max ${OMEGA_MAX.toFixed(1)} rad/s)`)
}
