# FPV Quadcopter Reference Model: Plan

Status: Phases 0–5 complete.
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
- **Public domain:** WMM2025 (NOAA/BGS) coefficients, evaluated in `scripts/lib/wmm.ts`.
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
- **Thrust limit:** ω_max = 2800 rad/s would give 12.3 N, more than the 8.5 N limit. The model instead sets ω_max = √(T_max/c_l) ≈ 2332 rad/s, so full command gives exactly 8.5 N and no separate clamp is needed.

**Conventions (as built).**

- NED world frame; FRD body frame (x forward, y right, z down); scalar-first quaternion for body attitude. `quat_to_dcm` gives C_bn (NED → body).
- Motor order follows Betaflight's quad X: 0 rear-right, 1 front-right, 2 rear-left, 3 front-left. Rotor positions are x = ±0.0775 m, y = ±0.10 m.
- Front-right and rear-left props spin CCW seen from above. Their reaction torque yaws the nose right (+M_z).
- Motor command is in [0, 1], with ω_cmd = ω_max·cmd, so thrust ∝ cmd². Hover is cmd = √(mg/4/T_max) ≈ 0.4651.
- **Mixer sign:** in FRD, positive pitch (nose up, +M_y) needs more thrust at the front. That is the opposite sign to the pitch column of Betaflight's table, which uses Betaflight's own axis convention, so our mixer's pitch column is negated (`MIXER` in the builder).

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
2. **Plant.** Build the motor subsystem ×4 and the frame. ✅ Done: `scripts/build-fpv-reference-model.ts` builds `reference-models/fpv-quadcopter.json`, and `__tests__/reference-models/fpv-plant.test.ts` checks it.
   - The motor is one subsystem definition with three references. The frame uses constant allocation matrices for rotor force and moment, a quaternion integrator, and drag in body axes.
   - Verify hover equilibrium: ω ≈ 1085 rad/s per rotor, zero acceleration.
   - Verify the step responses of the motor lag.
   - Check that thrust and torque signs match the mixer convention.
3. **Flight controller (acro).** Add the rates, gyro filters, rate PID and mixer, with perfect sensors. ✅ Done: `__tests__/reference-models/fpv-acro.test.ts`.
   - **Timing:** the plant steps at 0.5 ms (2 kHz). The `FlightController` subsystem runs at 1 ms (1 kHz) through `sampleTimeSec`, so its outputs hold for two plant steps.
   - **Structure:** it contains the Rates, GyroFilters, RatePID and Mixer sheets. The PT1 filters and derivatives are discrete transfer functions, and the I term is a unit-delay accumulator.
   - **Pilot:** the `Pilot` subsystem scripts sticks from time-indexed lookup tables: a roll doublet, a pitch doublet, then a yaw step at hover throttle.
   - **Stick axes are body-rate commands in FRD:** +roll rolls right, +pitch is nose up (pull-back), +yaw is nose right.
   - **Feed-forward scaling:** Betaflight's feed-forward coefficient is `FEEDFORWARD_SCALE × F / 100`. Leaving out the /100 makes FF 100× too strong, which shows as 5× rate overshoot.
   - **Results with the default gains:**
     - Roll and pitch track 185 °/s, with about 29% overshoot for a 50 ms stick ramp (41% for an instant step), and settle in about 0.1 s.
     - Yaw has only propeller drag torque, so its loop is slow and I-dominated: about 65% overshoot and a 0.6 s ring that settles roughly 2 s after a step.
     - Adding rotor-inertia reaction torque (v2) should make yaw more realistic.
     - Airmode holds full-stick rates at zero throttle while keeping motors inside idle..full.
4. **Sensors and estimator.** ✅ Done: `__tests__/reference-models/fpv-sensors.test.ts`.
   - **Sensors subsystem:**
     - IMU at 1 kHz: gyro 2.8 mdps/√Hz, accelerometer 70 µg/√Hz; turn-on biases; 16-bit quantisation; ±2000 dps and ±16 g ranges.
     - Magnetometer at 100 Hz: C_bn·m_NED plus hard iron, 0.4 µT noise, 0.3 µT LSB.
     - Barometer at 50 Hz: ISA troposphere pressure at 500 m − z, 1.3 Pa noise, and a 30 ms lag that starts at the home pressure.
     - Each rate is its own nested sample scope; the noise sources are seeded Random Noise blocks.
   - **Site:** Tri-County Aerodrome (48TX), Texas: 33.45192° N, 96.37729° W, field elevation 790 ft (240.8 m, FAA estimate). The NED origin is on the field.
   - **Magnetic field:** WMM2025 at the site for 2026.80. North 22.891 µT, east 0.910 µT, down 42.325 µT (declination 2.28° E, inclination 61.6°).
     - It is computed by `scripts/lib/wmm.ts` from NOAA's public-domain coefficients in `scripts/data/`.
     - That evaluator matches all 100 of NOAA's WMM2025 test values.
   - **Barometer:** pressure comes from obliq's Atmosphere block, which now evaluates the U.S. Standard Atmosphere 1976 formulae. The estimator inverts the same formulae, so sensor and estimator agree exactly.
   - **Biases:** the sensor biases are representative values (est.).
   - **Mahony attitude filter:** Kp = 0.25 (Betaflight `imu_dcm_kp` 2500), Ki = 0. The accelerometer is used only while it reads 0.9–1.1 g (Betaflight's accelerometer-health check). The magnetometer correction is projected on the vertical, so it only corrects yaw.
   - **Altitude filter:** second-order complementary filter (ω = 1 rad/s, ζ = 1) of barometric altitude and the accelerometer rotated by the estimate.
   - **Control loop:** the rate PID now flies on the sensor gyro. The estimates are outputs, which angle mode will use.
   - **Results:**
     - Altitude estimate within 0.5 m through the demo's 13 m sink.
     - Attitude estimate within 2° in hover. The steady error is |gyro bias|/Kp ≈ 1.5°, since Ki = 0.
     - During the flips, the estimate drifts 6–10° toward level. A multirotor accelerometer sees thrust, not gravity, so tilted flight reads as "level"; this is the familiar FPV horizon drift. Once drag pushes |a| above 1.1 g the gate stops the correction.
     - A rotation-rate gate on the accelerometer, or an integral term, would reduce the drift.
   - **Deferred:** slow random-walk gyro bias (negligible over seconds), axis misalignment and scale errors, IMU lever arm.
5. **Angle mode, battery and rotor inertia (v2).** ✅ Done, except as noted: `fpv-angle.test.ts`, `fpv-battery.test.ts`.
   - **Rotor-inertia reaction torque:**
     - M_z += Σ sᵢ·J_r·ω̇ᵢ, with J_r = 8.5×10⁻⁶ kg·m² (est.: 5" prop about 6×10⁻⁶ plus motor bell about 2.5×10⁻⁶). Each motor outputs ω̇ = (ω_cmd − ω)/τ.
     - Yaw steps now rise to 150 °/s in 50 ms with about 8% overshoot, settling within 3% by 0.6 s. Before, it was 65% overshoot and a 2 s ring.
   - **Angle mode** on an AUX switch (fifth pilot channel):
     - The stick sets an angle target (full stick 60°), and the rate setpoint is 5 × (target − estimated angle) °/s. Yaw stays a rate command.
     - It levels from a 25°/−15° tilt within 1 s, which acro does not.
     - It holds a 30° bank by the estimate. The true bank is 0–6° steeper, because the accelerometer sees thrust and the estimate creeps toward level.
     - The demo switches to angle mode at 2.4 s.
     - The `initialEuler` build option sets the initial attitude and aligns the estimator to it.
   - **Battery:**
     - 4S 1300 mAh LiPo: a resting-voltage-versus-state-of-charge table (est.), 0.02 Ω pack resistance (est.), and state of charge integrated from current.
     - Each motor draws κTω/η (η = 0.8, est.). Motor speed at a given command scales with V/16.8 V.
     - Hover draws about 7.3 A and sags the pack to 16.65 V. The pilot's hover throttle (0.438) accounts for this.
     - The motors read the previous step's voltage. A segregated subsystem counts as direct feedthrough on every port, so feeding the current voltage made an algebraic loop. obliq broke that loop at an arbitrary block, so one motor saw a different voltage and the symmetric hover tumbled slightly.
   - **Ground contact.** The field plane is NED z = 0, and the CG rests at about 1 mm compression.
     - Spring-damper normal force (k = mg/1 mm, c = 150 N·s/m) that can push but not pull, plus viscous friction.
     - Landing-leg righting torque and damping while in contact. All values are estimates.
     - The ground force enters the body force, so the IMU reads 1 g on the ground.
     - A 2 m drop lands with about a 1 cm hop and settles.
   - **Arming** on an AUX2 switch, after Betaflight:
     - Disarmed stops the motors; armed runs them at idle.
     - Airmode, and with it the I-term, starts once throttle first exceeds 25%. Until then the I-term stays reset, so gyro bias cannot wind it up while sitting on the ground.
   - **Default demo:** take off from rest. Arm at 0.25 s, climb, hover, then in angle mode a 24° bank, an 18° forward pitch and a yaw turn.
     - The previous airborne demo is `AIRBORNE_DEMO_STICKS`, used with the `initialAltitude` build option.
   - **Layout:** model outputs and scopes moved to a second top-level sheet, **Telemetry**, fed by sheet labels from Main. Main now shows only the vehicle; run results appear on the Telemetry tab.
     - This exposed a WASM wrapper bug: scopes and outputs fed by a sheet label on another top-level sheet read a non-existent `From_*` signal. Fixed (codegen v34).
   - **Tests sheet:** 11 Assert blocks check the default demo against `DEMO_TESTS` in the builder:
     - motors stay off before arming and at least at idle after;
     - the climb, a level climb, the bank, the pitch and the yaw turn;
     - the attitude and altitude estimates against the true state;
     - the battery stays above 3.5 V per cell;
     - the quad stays upright, which stops the run on failure.

     They pass in the editor and with `npm run obliq:test -- "FPV Quadcopter"`. `__tests__/reference-models/fpv-tests-sheet.test.ts` also checks that each Assert reads the intended signal in the intended units. Other builds (custom sticks, open loop, airborne) have no Tests sheet. Separating the vehicle from these tests into its own model waits on model references (Part B of [model-testing-plan.md](model-testing-plan.md)).

Each phase adds native-codegen tests to `__tests__/reference-models/` that fly the model for a few seconds and assert physical invariants.

## obliq gaps this exposes

1. **Random Noise block:** Phase 0 (done).
2. **Multi-rate.** Subsystem sample scope already exists. Still needed:
   - validation that each sample period is an integer multiple of `dt`;
   - an explicit rate-transition / zero-order-hold block, if the sensor → controller crossings need one.
3. **Convenience blocks:** quaternion multiply, inverse and normalise; vector min/max. Each can be built from existing blocks first and promoted to a block if the diagram gets unreadable.
4. **PID anti-windup:** a clamped discrete accumulator, built from Unit Delay + Limit.
5. **Deferred:** filters with time-varying coefficients (dynamic notch, dynamic LPF, TPA).
6. **Integration accuracy (found in Phase 2, fixed):** obliq's RK4 used to be stage-accurate only for a block's own state terms, such as a transfer function's poles. An integrator fed through other blocks got one derivative per step, which is effectively forward Euler. Codegen v32 re-evaluates the algebra at each RK4 stage on the model and then restores the major-step snapshot, so discrete states, logged samples and outputs are unaffected (`__tests__/codegen/rk4-stage-evaluation.test.ts` checks fourth-order convergence). The quaternion is still renormalised in the model, because no integrator preserves |q| = 1 exactly.

7. **Algebraic loops through segregated subsystems** are broken silently at an arbitrary point. In the FPV battery loop this gave one motor a different supply voltage from the other three. A validation warning would help.

**Fixed while building the plant:**

- A shared subsystem module with no parameters referenced an undeclared `_params_t` type.
- Segregated modules' `compute_derivatives` read the major-step state instead of the RK4 stage state. It also emitted `model->states->`, which did not compile.
- Sum produced a bad `[i][j][0]` index for column-matrix inputs.
- Magnitude assumed a length of 3 and ignored the connected type. It now also accepts column vectors such as `double[4][1]`.
- UI type propagation could not type subsystem references, and it typed array-IC integrators inside feedback loops as scalars. The validation dialog also produced duplicate React keys.

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
