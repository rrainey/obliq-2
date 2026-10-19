# FPV Quadcopter Reference Model: Plan

Status: in progress. Phase 0 (noise block) and the reference-model packaging come first.
Decisions recorded 2026-10-19.

## Goal

Ship a non-trivial, well-documented reference model with obliq-2. It should be
smaller than the Saturn IB simulation, and it should exercise subsystems,
vectors and matrices, quaternions, discrete control at a fixed rate, and
sensor noise.

The subject is a typical **5-inch FPV quadcopter**:

- one subsystem per motor/ESC/propeller
- a 6-DOF rigid frame
- sensors: a 9-DOF IMU (gyro, accelerometer, magnetometer) and a barometer
- a **Betaflight-style** flight controller (acro/rate mode first, angle mode later)

## Decisions

| Topic | Decision |
|---|---|
| Controller style | Betaflight-style behaviour, **re-implemented from documented equations and defaults**. Betaflight is GPL-3, so no code is translated. |
| Plant structure | Flightmare / agile_flight equation structure (MIT), with kingfisher 5-inch parameters (MIT), cross-checked against NeuroBEM (2021) and Kaufmann et al. (2022). |
| Estimator | Mahony explicit complementary filter on quaternions (Mahony, Hamel & Pflimlin 2008, re-implemented from the paper). |
| Sensor noise | Kalibr / RotorS IMU noise model (BSD-3 / Apache-2.0), with datasheet values for ICM-42688-P, BMP280/DPS310 and IST8310. |
| First work item | A general-purpose **Random Noise** block (Phase 0). |
| Packaging | The model JSON lives in the repo under `reference-models/`. It is **pre-imported once into a new user's store** and can always be imported manually with My Models → Import. |

## Licensing rules

- **Port with attribution:** MIT, BSD-3 and Apache-2.0 code (Flightmare, agile_flight, RotorPy, PX4, Kalibr, RotorS/PX4 Gazebo plugins, x-io Fusion).
- **Behaviour and equations only, no code:** GPL/LGPL sources (Betaflight, ArduPilot, Crazyflie, Madgwick's legacy C, Corke's MATLAB toolbox).
- **Not usable:** MathWorks Parrot Minidrone / Drone Reference App. Derivatives are licensed for use with MathWorks products only.
- **Facts with citation:** parameters taken from papers and datasheets. Do not redistribute datasets that carry no stated license (NeuroBEM, UIUC propeller DB).
- **Public domain:** WMM2025 (NOAA/BGS) magnetic field values.
- **Attribution:** the model's description and `reference-models/README.md` list every source.

## Model architecture

```
Pilot / Rates ──► Flight Controller (discrete, fixed rate) ──► Motors ×4 ──► Frame (6-DOF) ─┐
       ▲                 ▲                                                                   │
  stick inputs           └──────────── Sensors (IMU, mag, baro) ◄─────────────────────────────┘
```

**Pilot / Rates.** Stick input in [-1, 1] maps to a body-rate setpoint through Betaflight "Actual" rates:
`rate = s·center + max(0, max−center)·expo(s)`, with `expo(s) = |s|·(s⁵·e + s·(1−e))`.
Defaults: center 70 °/s, max 670 °/s, expo 0.

**Flight controller** (one subsystem, sampled at 1–4 kHz):

- **Gyro filtering:** two PT1 low-pass filters in series, at 250 Hz and 500 Hz.
- **Rate PID per axis:**
  - P, plus I with an anti-windup clamp.
  - D on the measurement, with a 150 Hz PT1 filter.
  - Feed-forward on the setpoint derivative.
  - Defaults P/I/D/FF: roll 45/80/30/120, pitch 47/84/34/125, yaw 45/80/0/120.
  - Betaflight scale factors: P 0.032029, I 0.244381, D 0.000529, FF 0.013754.
- **Mixer (quad X):** a 4×4 matrix (one Matrix Multiply), then airmode desaturation, then a clamp to [idle 0.055, 1].
- **Later (v2):** angle mode (level P 50 / I 75 / D 75, 60° angle limit), throttle PID attenuation (TPA), anti-gravity, and a dynamic notch filter.

**Estimator.**

- **Attitude:** Mahony filter.
  - Error `e = â×v̂_a + w_m·(m̂×v̂_m)`.
  - Corrected rate `ω_c = ω + Kp·e + Ki·∫e`.
  - `q̇ = ½ q ⊗ [0, ω_c]`, then normalise.
  - Gains Kp = 0.25, Ki = 0.
- **Altitude:** a barometer + accelerometer complementary filter.

**Sensors.** Each output is `y = quantize(saturate((I+S+M)·x + b + n))`, where:

- S is the scale error and M the axis misalignment;
- n is white noise with `σ = N/√Ts`;
- b is a Gauss–Markov bias, `b⁺ = e^(−Ts/τ)·b + σ_b·√(τ/2·(1−e^(−2Ts/τ)))·w`.

| Sensor | Model | Parameters |
|---|---|---|
| Gyro (ICM-42688-P) | rate + noise + bias, ±2000 dps, 16-bit | N = 2.8 mdps/√Hz (4.9e-5 rad/s/√Hz); bias τ = 1000 s (est.) |
| Accelerometer (ICM-42688-P) | specific force + noise, ±16 g | N = 65–70 µg/√Hz |
| Magnetometer (IST8310) | `A_soft·Rᵀ·m_ned + b_hard + n` | m_ned from WMM2025 at a chosen site (≈[20, 0, 45] µT, est.); noise ≈0.3–0.5 µT RMS (est.) |
| Barometer (BMP280 / DPS310) | Atmosphere(h) + noise + 20–50 ms PT1 lag, held at 50 Hz | BMP280 1.3 Pa RMS (0.2 Pa with IIR) |

**Motors** (one subsystem each):

- Rotor speed ω follows its command with a first-order lag, τ = 33 ms.
- Thrust `T = c_l·ω²`, with c_l = 1.563e-6 N/(rad/s)².
- Yaw torque `Q = κ·T`, with κ = 0.0122 m.
- Thrust is clamped at 8.5 N per motor.
- **v2:** battery and ESC, re-derived from first principles: `V = V_oc − I·R`, motor Kv, and ω_max scaling with voltage.

**Frame:** a quaternion 6-DOF rigid body.

- Mass m = 0.75 kg.
- Inertia J = diag(2.5, 2.1, 4.3)e-3 kg·m².
- Rotors at (±0.0775, ±0.10) m. The X frame is not square.
- Linear drag k_v = (0.3, 0.3, 0.15) N·s/m.
- Gravity, and a ground contact so the model can start landed (v2).
- 17 continuous states: 13 rigid-body plus 4 rotor speeds.

**Known parameter conflicts.**

- **κ:** kingfisher.yaml gives 0.022 m; c_d/c_l from Kaufmann et al. (2022) gives 0.0122 m. We use **0.0122 m** and note the alternative.
- **Thrust limit:** ω_max = 2800 rad/s would give 12.3 N, more than the 8.5 N limit. The model clamps thrust, so ω effectively tops out near 2330 rad/s.

## Phase 0: Random Noise block

A general-purpose obliq block (`random_noise`), useful well beyond this model.

- **Output:** a scalar or vector (`dataType`: `double` or `double[N]`), held for `sampleTime` seconds (zero-order hold). `sampleTime` 0 means every model step.
- **Distribution:** `gaussian` (default) or `uniform`. The uniform distribution has the same mean and variance, so its range is `mean ± √3·σ`.
- **Amplitude:** given either as `stdDev` σ, or as a noise density N with `σ = N/√Ts`. This is the IMU-datasheet convention; Ts is the sample time, or the model step when `sampleTime` is 0.
- **Determinism:**
  - A self-contained SplitMix64 generator is emitted in the generated C, seeded by the block's `seed` parameter.
  - Gaussian values use the Box–Muller transform.
  - No libc `rand()`, so WASM and native builds produce identical sequences.
- **Timing:** the generator advances once per sample, in the output phase, when `sample_tick % round(Ts/dt) == 0`, so a new value takes effect at the start of its period. A `drawn_tick` state makes the draw idempotent within a tick, because `seed_from_inputs` evaluates the algebra twice. RK4 minor stages never evaluate the block.
- **Seeding:** the seed is loaded by the block-initialization code, which hosts run through `seed_from_inputs` after `init` (as the WASM runner and `obliq-cgen` do).
- **Tests:** mean and variance, determinism and seed sensitivity, hold behaviour, vector width, density scaling, and uniform bounds. All run through native C codegen.

## Packaging and distribution

- **Location:** `reference-models/fpv-quadcopter.json` uses the standard `{ name, data }` export format, so My Models → Import accepts it unchanged. `reference-models/README.md` describes the model and lists every source.
- **Pre-import on first run:**
  - When the storage layer creates a **new** database, it imports every model in `reference-models/` as a managed model.
  - It records what it seeded under the `meta` table key `reference_models` ('pending' until seeding finishes, so an interrupted first open retries), so deleting a reference model never brings it back.
  - Existing installations are not modified; they can use Import.
  - `OBLIQ_REFERENCE_MODELS_DIR` overrides the source folder, and setting it to an empty string disables seeding (tests do this).
- **Built from a script:** the model is generated by `scripts/build-fpv-reference-model.ts`, then laid out with Tune Model Layout's algorithm. This keeps it reviewable, reproducible and easy to re-tune. The generated JSON is committed.

## Phases

0. **Random Noise block.** Implement it, add it to the library and MCP docs, and test it. ✅ Done: `__tests__/codegen/random-noise-native.test.ts`.
1. **Packaging.** Add the `reference-models/` folder, seeding on database creation, and tests. ✅ Done: `src/lib/server/storage/referenceModels.ts`, `__tests__/storage/reference-models.test.ts`.
2. **Plant.** Build the motor subsystem ×4 and the frame.
   - Verify hover equilibrium: ω ≈ 1085 rad/s per rotor, zero acceleration.
   - Verify the step responses of the motor lag.
   - Check that thrust and torque signs match the mixer convention.
3. **Flight controller (acro).** Add the rates, gyro filters, rate PID and mixer, with perfect sensors.
   - Verify a hover hold and roll/pitch/yaw rate steps that track the setpoint.
   - Verify motor saturation and airmode behaviour.
4. **Sensors and estimator.** Add the noise-driven IMU, magnetometer and barometer models, the Mahony filter and the altitude filter. Verify attitude-estimate error bounds in hover and during a manoeuvre.
5. **Angle mode and battery (v2).**

Each phase adds native-codegen tests to `__tests__/reference-models/` that fly the model for a few seconds and assert physical invariants.

## obliq gaps this exposes

1. **Random Noise block:** Phase 0 (done).
2. **Multi-rate.** Subsystem sample scope already exists. Still needed:
   - validation that each sample period is an integer multiple of `dt`;
   - an explicit rate-transition / zero-order-hold block, if the sensor → controller crossings need one.
3. **Convenience blocks:** quaternion multiply, inverse and normalise; vector min/max. Each can be built from existing blocks first and promoted to a block if the diagram gets unreadable.
4. **PID anti-windup:** a clamped discrete accumulator, built from Unit Delay + Limit.
5. **Deferred:** filters with time-varying coefficients (dynamic notch, dynamic LPF, TPA).

## Sources

- **Flightmare** (MIT): https://github.com/uzh-rpg/flightmare
- **agile_flight / kingfisher.yaml** (MIT): https://github.com/uzh-rpg/agile_flight
- **NeuroBEM:** Bauersfeld et al., RSS 2021. https://arxiv.org/abs/2106.08015
- **Kaufmann et al. 2022,** "A Benchmark Comparison of Learned Control Policies for Agile Quadrotor Flight": https://arxiv.org/abs/2202.10796
- **RotorPy** (MIT): https://github.com/spencerfolk/rotorpy
- **Betaflight** (GPL-3; behaviour reference only): https://github.com/betaflight/betaflight
- **PX4** (BSD-3): https://github.com/PX4/PX4-Autopilot
- **PX4 Gazebo IMU plugin** (Apache-2.0): https://github.com/PX4/PX4-SITL_gazebo-classic
- **Kalibr IMU noise model** (BSD-3): https://github.com/ethz-asl/kalibr/wiki/IMU-Noise-Model
- **Mahony, Hamel & Pflimlin,** "Nonlinear Complementary Filters on the Special Orthogonal Group," IEEE TAC 53(5), 2008
- **Mahony, Kumar & Corke,** "Multirotor Aerial Vehicles," IEEE RAM 2012
- **WMM2025** (public domain): https://www.ncei.noaa.gov/products/world-magnetic-model
- **Datasheets:** TDK ICM-42688-P, Bosch BMI270 and BMP280, Infineon DPS310, iSentek IST8310
