/**
 * The FPV rate loop's response across mass configurations, motor lag and IMU rates.
 * Prints Markdown tables. Run: npx tsx scripts/fpv-tuning-sweep.ts (Node 22; about 7 min).
 * Limits are in __tests__/reference-models/fpv-tuning.test.ts.
 */

import { AIRFRAMES, hoverThrottleFor, type FpvVariant } from './build-fpv-reference-model'
import { firstUnstableGain, hoverMotorNoise, rateStep } from './lib/fpv-tuning'

const f1 = (x: number) => x.toFixed(1)
const gain = (x: number) => (x === Infinity ? '>40' : String(x))

const log = console.log
// The code generator logs as it runs: only this script's tables go to stdout
console.log = () => {}

log('| Airframe | Mass (kg) | T/W | Hover (µs) | Overshoot R/P/Y (%) | t90 R/P/Y (ms) | Settle R/P/Y (ms) | Unstable at gain × R/P | Motor noise SD (‰) |')
log('|---|---|---|---|---|---|---|---|---|')
for (const [name, airframe] of Object.entries(AIRFRAMES)) {
  const v: FpvVariant = { airframe }
  const steps = [0, 1, 2].map(a => rateStep(v, a))
  const u = firstUnstableGain(v)
  const hoverUs = 1000 + 1000 * hoverThrottleFor(airframe.mass, 1)
  log(`| ${name} | ${airframe.mass.toFixed(2)} | ${((4 * 8.5) / (airframe.mass * 9.80665)).toFixed(2)} | ${hoverUs.toFixed(0)} | ${steps.map(s => f1(s.overshootPct)).join(' / ')} | ${steps.map(s => f1(s.t90Ms)).join(' / ')} | ${steps.map(s => s.settle5Ms.toFixed(0)).join(' / ')} | ${gain(u[0]!)} / ${gain(u[1]!)} | ${hoverMotorNoise(v).sdPermille.toFixed(2)} |`)
}

log('\n| Airframe, motor lag or battery | Overshoot R/P (%) | Unstable at gain × R/P |')
log('|---|---|---|')
for (const name of ['smallerPack', 'baseline', 'allUp']) {
  for (const [label, extra] of [['lag 20 ms', { motorTau: 0.02 }], ['lag 50 ms', { motorTau: 0.05 }], ['20% charge', { initialSoc: 0.2 }], ['no TPA', { tpaRatePct: 0 }]] as Array<[string, FpvVariant]>) {
    const v: FpvVariant = { airframe: AIRFRAMES[name], ...extra }
    const u = firstUnstableGain(v)
    log(`| ${name}, ${label} | ${f1(rateStep(v, 0).overshootPct)} / ${f1(rateStep(v, 1).overshootPct)} | ${gain(u[0]!)} / ${gain(u[1]!)} |`)
  }
}

log('\n| IMU / FC / plant step | Overshoot R/P (%) | t90 R (ms) | Unstable at gain × R/P | Motor noise SD (‰) |')
log('|---|---|---|---|---|')
const RATES: Array<[string, FpvVariant]> = [
  ['1k / 1k / 500 µs', {}],
  ['1k / 1k / 125 µs', { dt: 0.000125 }],
  ['2k / 1k / 500 µs', { imuTs: 0.0005 }],
  ['2k / 2k / 500 µs', { imuTs: 0.0005, fcTs: 0.0005 }],
  ['4k / 4k / 125 µs', { imuTs: 0.00025, fcTs: 0.00025, dt: 0.000125 }],
  ['8k / 1k / 125 µs', { imuTs: 0.000125, dt: 0.000125 }],
  ['8k / 4k / 125 µs', { imuTs: 0.000125, fcTs: 0.00025, dt: 0.000125 }],
  ['8k / 8k / 125 µs', { imuTs: 0.000125, fcTs: 0.000125, dt: 0.000125 }],
]
for (const [label, v] of RATES) {
  const roll = rateStep(v, 0), pitch = rateStep(v, 1)
  const u = firstUnstableGain(v)
  log(`| ${label} | ${f1(roll.overshootPct)} / ${f1(pitch.overshootPct)} | ${f1(roll.t90Ms)} | ${gain(u[0]!)} / ${gain(u[1]!)} | ${hoverMotorNoise(v).sdPermille.toFixed(2)} |`)
}

log('\n| Rotor vibration on the gyro, per rotor (deg/s) | Motor SD (‰) | Motor travel (full ranges/s) |')
log('|---|---|---|')
for (const dps of [0, 1, 5, 20]) {
  const n = hoverMotorNoise({}, { gyroDps: dps, accelMps2: dps * 0.1 })
  log(`| ${dps} | ${n.sdPermille.toFixed(2)} | ${n.travelPerS.toFixed(2)} |`)
}
