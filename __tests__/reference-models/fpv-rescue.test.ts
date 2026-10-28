/**
 * FPV GPS Rescue stalled climb (docs/fpv-hud-gnss-test-plan.md, Level 2,
 * F52, the former T15): with ap_throttle_max below this quad's hover, the
 * rescue cannot climb; the 1 Hz sanity check counts each second the altitude
 * moves less than half as far as the target, and after 10 it moves ATTAIN_ALT
 * to LANDING. The same flight with the default limit climbs and turns home.
 * This needs a build option, so it is a Jest test rather than a test model
 * (those reference the shared vehicle).
 */
import {
  buildFpvModel,
  FPV,
  RESCUE_PHASE,
  type StickProfile,
} from '../../scripts/build-fpv-reference-model'
import { cleanupNativeDir, compileAndRunNative } from '../support/nativeCgen'

jest.setTimeout(600000)

const dirs: string[] = []
afterAll(() => dirs.forEach(cleanupNativeDir))

interface Row { t: number; phase: number; armed: number; alt: number }

/** Climb hard to about 130 m in angle mode, hover, then the rescue switch at 12 s (return altitude about 145 m). */
const ON = 12
const STICKS: StickProfile = {
  roll: [[0, 0]], pitch: [[0, 0]], yaw: [[0, 0]], aux: [[0, 1]], arm: [[0, 0], [0.25, 0], [0.251, 1]],
  throttle: [[0, 0], [0.5, 0], [0.6, 0.75], [3.5, 0.75], [3.6, 0.3], [6.5, 0.3], [6.6, 0.44]],
  rescue: [[0, 0], [ON - 0.001, 0], [ON, 1]],
}

let seq = 0
function run(seconds: number, apThrottleMaxUs?: number): Row[] {
  const name = `fpvresc${seq++}`
  const model = buildFpvModel({ sticks: STICKS, apThrottleMaxUs })
  const result = compileAndRunNative({
    modelName: name,
    sheets: (model.data as any).sheets,
    dt: FPV.dt,
    smokeMainBody: `
  ${name}_seed_from_inputs(&model);
  for (int i = 0; i < ${Math.round(seconds / FPV.dt)}; ++i) {
    ${name}_step(&model);
    if (i % 20 != 0) continue;
    printf("%.6f %g %g %.6f\\n", model.time - model.dt, model.outputs.rescue_phase, model.outputs.fc_armed, model.outputs.alt_est);
  }
  return 0;
`,
  })
  dirs.push(result.outDir)
  return result.stdout.trim().split('\n').map(line => {
    const v = line.trim().split(' ').map(Number)
    return { t: v[0]!, phase: v[1]!, armed: v[2]!, alt: v[3]! }
  })
}

const firstIn = (rows: Row[], phase: number) => rows.find(r => r.phase === phase)

describe('FPV GPS Rescue stalled climb', () => {
  test('below-hover throttle limit: ATTAIN_ALT stalls, LANDING after 10 checks, lands and disarms', () => {
    const rows = run(45, 1420)
    const attain = firstIn(rows, RESCUE_PHASE.attainAlt)!
    expect(attain.t).toBeGreaterThanOrEqual(ON)
    expect(attain.t).toBeLessThan(ON + 0.02)
    const landing = firstIn(rows, RESCUE_PHASE.landing)!
    // The checks run once a second from the start: the 10th is 10 s in
    expect(landing.t).toBeGreaterThan(ON + 9.99)
    expect(landing.t).toBeLessThan(ON + 10.03)
    // It sank while the target climbed
    expect(landing.alt).toBeLessThan(attain.alt - 5)
    for (const p of [RESCUE_PHASE.rotate, RESCUE_PHASE.flyHome, RESCUE_PHASE.descent, RESCUE_PHASE.abort]) {
      expect(firstIn(rows, p)).toBeUndefined()
    }
    // Disarmed on impact from LANDING (the impact returns the phase to IDLE in the same tick)
    const disarm = rows.findIndex(r => r.t > ON && r.armed === 0)
    expect(disarm).toBeGreaterThan(0)
    expect(rows.slice(0, disarm).filter(r => r.phase !== RESCUE_PHASE.idle).pop()!.phase).toBe(RESCUE_PHASE.landing)
  })

  test('default throttle limit: the same climb reaches the return altitude and rotates', () => {
    const rows = run(20)
    expect(firstIn(rows, RESCUE_PHASE.rotate)).toBeDefined()
    expect(firstIn(rows, RESCUE_PHASE.landing)).toBeUndefined()
  })
})
