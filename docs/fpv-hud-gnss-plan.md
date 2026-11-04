# FPV Vehicle: HUD signals and GNSS receiver (implementation plan)

**Design:** [fpv-hud-gnss-proposal.md](fpv-hud-gnss-proposal.md). D1–D5 are decided there, and this plan does not reopen them.

**Scope:**
- Phases 0–6 are obliq-2 work. All model changes are made in `scripts/build-fpv-reference-model.ts`, and the shipped JSON is regenerated from it.
- Phase 7 is the Unity side, in obliq-fpv-unity. It is listed so the two repos agree on the interface.
- No obliq codegen or block changes are expected. Every block used already exists: Random Noise, Unit Delay (vector initial values), Evaluate (`sin`, `cos`, `atan2`, `fmod`), If, Quantizer, Selector, Mux/Demux, and subsystems with their own sample time.

**Test harness:** the FPV suites in `__tests__/reference-models/` build a model with `buildFpvModel(...)`, compile it natively (`compileAndRunNative`) and read its outputs. The baseline is 9 suites and 55 tests passing.

**Testing:** [fpv-hud-gnss-test-plan.md](fpv-hud-gnss-test-plan.md) traces every feature to obliq test models (Assert blocks, `npm run obliq:test`) and, where needed, Jest native suites. Each phase writes its own tests (test plan, section 5), and a phase is done only when they pass. The per-phase test lists below are summaries; the test plan governs.

## Phase 0: Prerequisites (done 2026-10-28)

1. Commit the MSL-frame change that is in the working tree but not committed: Prairie Creek Park, z = 0 at 0 m MSL. Its CHANGELOG bullet sits under the released "What's New in 3.4.0". Move it to a new "## Unreleased" section first.
2. Record the baselines:
   - the FPV suites (9 suites, 55 tests);
   - the full Jest suite (30 known failures);
   - `tsc` (140 errors).

**Done when** the frame change is committed and the baselines are recorded.

## Phase 1: Site constants and the new vehicle inputs (done 2026-10-28)

1. **`LOCATION` additions:**
   - `geoidHeightM: -26.103` (NGS GEOID18).
   - `gridConvergenceDeg: 1.2425`. This is the default for test models. Its comment says the Unity host supplies PROJ's value at run time, and that this constant should match the DEM sidecar once Phase 7 writes γ there.
   - `utmZone: 14`, recorded for documentation only.
2. **WMM at the ellipsoid height.** `SITE_FIELD` is evaluated at `elevationM + geoidHeightM`, a change of about 0.6 nT. Update the expected field in `fpv-sensors.test.ts` and the plan document.
3. **Vehicle inputs,** in this order: `sticks` (double[6], unchanged at index 0), `gnss_env` (double[4]) and `grid_convergence_deg` (double).
   - `vehicleOnly` builds expose them as Input Ports.
   - Other builds (the Pilot demo and the test builds) feed them from a new **Conditions** subsystem.
   - Conditions is a lookup-table schedule like Pilot, with constant defaults [14, 0.8, 1.3, 1.0] and `LOCATION.gridConvergenceDeg`.
4. **Builder options:**
   - `gnssEnv?: GnssEnvProfile`: time tables for satellites, HDOP, VDOP and UERE scale, the same shape as `StickProfile`;
   - `gridConvergenceDeg?: number`.
5. **`buildFpvTestModel`:**
   - adds a Conditions subsystem wired to the Vehicle block's new ports;
   - `FpvTestSpec` gains optional `gnssEnv` and `gridConvergenceDeg`.

   Wires to the Model Reference block use `iface.inputs.indexOf(name)`, so the port order lives in one place.
6. Nothing reads the new inputs yet.

**Done when:**
- the FPV suites pass, and outputs are unchanged apart from the WMM height;
- the regenerated `fpv-vehicle.json` shows three inputs;
- the Demo Flight and Acro Rate Step models compile against it.

## Phase 2: Grid convergence in the magnetometer and the estimator (done 2026-10-28)

1. **Helper `rotateTrueToGrid(s, vec3, gamma)`.** It splits the vector, then computes:
   - N_g = N cos γ + E sin γ
   - E_g = −N sin γ + E cos γ

   The down component passes through, and the result is muxed back. γ is in degrees, converted inside the Evaluate. A matching `rotateGridToTrue` is used for GNSS velocity in Phase 3.
2. **Routing γ:**
   - Sensors gains a `grid_convergence_deg` input and passes it to Magnetometer.
   - FlightController gains a `grid_convergence_deg` input and passes it to AttitudeEstimator.
3. **Magnetometer:** the `EarthField` constant (true NED) goes through `rotateTrueToGrid` before `FieldInBody`.
4. **AttitudeEstimator:** the `FieldDirectionNED` constant goes through the same rotation. The reference therefore stays in the grid frame, and `euler_est` yaw stays comparable with truth.
5. **New FlightController output `heading_deg`** = `fmod(yaw_est·180/π + γ + 360, 360)`. It is appended to `FC_OUTPUTS`, so the existing port indices are kept.

**Tests** (extend `fpv-sensors.test.ts`):
- With γ = 0, magnetometer, estimate and heading samples match a γ = 0 build of Phase 1. Exact equality is expected, because cos 0 = 1 and sin 0 = 0; allow 1e-12.
- With γ = 1.2425, at rest:
  - the ideal magnetometer equals C_bn × R(γ) × field;
  - `euler_est` yaw tracks truth yaw as it does today;
  - `heading_deg` = truth yaw + γ, within the estimator's existing tolerance.

**Done when** both tests pass and the eight FPV suites are unchanged.

## Phase 3: The GNSS receiver (done 2026-10-28)

`buildGnssSheet(ideal)` is a subsystem inside Sensors with `sampleTimeSec: 0.1`. Name it `GNSS`, and use the block names listed in [Embedded model integration](#embedded-model-integration-for-the-obliq-fpv-unity-agent): the host refers to their generated C state names.

**Inputs:** `pos_ned` and `vel_ned` (truth, grid frame; Sensors gains a `vel_ned` input from Frame output 1), `gnss_env` and `grid_convergence_deg`.

**Constants** in a new `SENSORS.gnss` block:

```
ts: 0.1, tau: 60, smoothTau: 5, fastTau: 0.5,
uere: { hCorr: 1.5, hFast: 0.15, vCorr: 1.5, vFast: 0.3 },     // m per unit DOP
vel: { h: 0.05, v: 0.10 },                                      // m/s per unit DOP
reacquireS: 1.0, quantPos: 0.01, quantVel: 0.01,
seeds: { corr: 120, fast: 121, vel: 122 }
```

As built in Phase 3 the fast term was white (`hWhite`, `vWhite`) and the slow term first-order. Both were reshaped after Phase 12; see [GNSS error spectrum](#gnss-error-spectrum-done-2026-10-28). Items 1–2 below describe the Phase 3 build.

**Error model:**
1. **Gauss–Markov states** for three axes (n, e, d), unit variance:
   - a = e^(−0.1/60) = 0.998335 and b = √(1 − a²) = 0.057685;
   - a Unit Delay `GmPrev` (double[3]) holds the state;
   - an Evaluate computes x⁺ = a·x + b·w, where w is a unit Random Noise (double[3], seed 120).
   - The Unit Delay's initial value is a stationary N(0,1) draw. The builder makes it with a small seeded generator (mulberry32 + Box–Muller), so it is reproducible and needs nothing at run time.
2. **White terms:** unit Random Noise (double[3], seed 121) for position and (double[3], seed 122) for velocity.
3. **Scaling:** an Evaluate per axis turns the unit terms into meters with the current `gnss_env`: horizontal axes × HDOP × scale, vertical × VDOP × scale, using the table above.
4. **Measured position:** truth `pos_ned` + error. Altitude MSL = −(d + e_d).
5. **Measured velocity:** truth `vel_ned` + white error, then `rotateGridToTrue` with γ.
6. **Quantization:** 1 cm and 1 cm/s.

**Fix logic,** all at 10 Hz:
- `SatsOk = sats ≥ 3 && hdop > 0`.
- Reacquisition counter `c⁺ = SatsOk ? min(c + 1, 10) : 0`, held in a Unit Delay whose initial value is 10. The receiver therefore has a fix at t = 0, with no time-to-first-fix.
- `fix = (c⁺ ≥ 10) ? (sats ≥ 4 ? 3 : 2) : 0`.
- **Hold:** a Unit Delay holds the last output [n, e, alt, vn, ve, vd]. The new output is:
  - fix 3: the new solution;
  - fix 2: the new n, e, vn, ve, with alt held and vd = 0;
  - fix 0: everything held.

  This is one Evaluate per component, or an If on the packed vector.
- `gnss_fix` = [fix, sats, pDOP], with pDOP = √(HDOP² + VDOP²). The satellite count is echoed from the input. Betaflight's altitude blend reads pDOP (Phase 9).

**Course and ground speed** (VTG). These are computed from the receiver's output velocity, after noise and the rotation to true north, so they carry the receiver's errors:
- ground speed = hypot(vn, ve);
- `TrackValid` = fix > 0 && ground speed ≥ `SENSORS.gnss.trackMinSpeed` (0.5 m/s);
- track true = `TrackValid ? fmod(atan2(ve, vn)·180/π + 360, 360) : TrackPrev`, held in a Unit Delay `TrackPrev` whose initial value is 0;
- track magnetic = `fmod(track true − SITE_FIELD.declinationDeg + 360, 360)`.

`gnss_course` = [track true, track magnetic, ground speed, `TrackValid`].

**Ideal mode:** no noise and no quantization, so position is truth n, e, −d and velocity is rotated truth. The fix logic still applies.

**Sensors outputs:** `gnss_pos` (double[3]), `gnss_vel_ned` (double[3]), `gnss_fix` (double[3]), `gnss_course` (double[4]). They are published as vehicle outputs on the Telemetry sheet.

**Tests:** a new `__tests__/reference-models/fpv-gnss.test.ts`.
- Ideal: the fix equals truth (n, e, −d) at every 10 Hz sample, and velocity equals rotated truth.
- A long run at the default `gnss_env` (native run; samples at 10 Hz). As built: T03, 3000 s at rest, so the statistics have about 25 correlation times; see the test plan:
  - per-axis standard deviation of horizontal error within ±25% of √(1.5² + 0.15²) × 0.8, and of vertical error within ±25% of √(1.5² + 0.3²) × 1.3;
  - lag-10 (1 s) autocorrelation of the horizontal error above 0.9;
  - velocity error standard deviation within ±25% of 0.05 × 0.8.
- Scaling: with the UERE scale at 2, the standard deviations double, within ±25%.
- A fix schedule of 14 → 3 → 2 → 14 satellites:
  - 2D while 3 satellites, with altitude held and vd = 0;
  - no fix while 2, with every output held;
  - 3D again exactly 1.0 s after 14 returns.
- Course:
  - in a hover at the default `gnss_env`, `TrackValid` stays 0 and the track holds;
  - in steady forward flight above 3 m/s, the track matches the truth track (atan2 of the true-north truth velocity) within 3°;
  - magnetic = true − 2.48°.
- Determinism: two runs with the same seeds give identical output.

**Done when** `fpv-gnss.test.ts` passes, the other suites are unchanged, and the hover-run time is acceptable. If 600 s is slow natively, use 300 s with a wider tolerance.

## Phase 4: Flight controller outputs and home (done 2026-10-28)

**As built:** `alt_from_home_est` and `climb_rate_est` were not built here. D9 replaces the altitude filter they would read with Betaflight's arming-relative estimator in Phase 9, whose outputs `alt_est` and `vario_est` take their place. The home latch's `ArmedPrev` sits inside the Home subsystem.

FlightController gains inputs `gnss_pos` and `gnss_fix`; it got `grid_convergence_deg` in Phase 2. New outputs are appended to `FC_OUTPUTS`. Use the block names listed in [Embedded model integration](#embedded-model-integration-for-the-obliq-fpv-unity-agent).

1. **Already computed, now published:**
   - Arming `armed` → `fc_armed`, and `airmode` → `fc_airmode`;
   - AngleMode gains an output `angle_mode` from `AngleModeOn` → `fc_angle_mode`;
   - AltitudeEstimator `climb_rate` → `climb_rate_est`.
2. **`alt_from_home_est`:**
   - an `ArmedPrev` Unit Delay detects the rising edge of `armed`;
   - `HomeAltitude` latches `altitude_est` at that edge, with initial value `LOCATION.elevationM + altitude0`, so the output reads about 0 before the first arm;
   - output = `altitude_est − HomeAltitude`.
3. **Home subsystem.** Home behaves as Betaflight's does ([spec §1.4](fpv-betaflight-gnss-spec.md)):
   - **Latch:** home = [n, e] from `gnss_pos` **on the arming sample only** (the rising edge of `armed`), if fix = 3 and satellites ≥ `FC.homeMinSats` (8). If the conditions are not met then, there is no home for that flight.
   - **Valid flag:** `home_valid` is held in a Unit Delay and cleared when disarmed (`gps_set_home_point_once` = OFF).
   - **Rate:** distance and bearing are computed in a 10 Hz sample-time subsystem aligned with the receiver, so they update on each new fix and hold between fixes.
   - **Distance:** d = home − current, `home_distance_m` = hypot(dn, de).
   - **Bearing:** `home_bearing_deg` = `fmod(atan2(de, dn)·180/π + γ + 360, 360)`.
   - Both read 0 while home is not valid.
4. **Main sheet:** `battery_mah_drawn` = (1 − SOC) × `BATTERY.capacityAh` × 1000, from Battery output 2.
5. **Publish** `fc_armed`, `fc_angle_mode`, `fc_airmode`, `climb_rate_est`, `alt_from_home_est`, `heading_deg`, `home_valid`, `home_distance_m`, `home_bearing_deg` and `battery_mah_drawn`, with the GNSS outputs from Phase 3.

**Tests:** a new `__tests__/reference-models/fpv-osd.test.ts` using the demo and airborne profiles.
- The flag outputs equal the stick-derived values: armed = sticks[5] > 0.5, angle = sticks[4] > 0.5. `fc_airmode` latches at 25% throttle after arming.
- `climb_rate_est` tracks −v_d within the altitude filter's tolerance.
- `alt_from_home_est` is about 0 at arming and then tracks height above the field (0.5 m, as `AltitudeEstimateTracks`).
- `home_valid`:
  - rises on the arming sample when the satellite count is at least 8;
  - stays 0 for the whole flight when the vehicle arms with 7 satellites, even after the count rises to 14;
  - clears on disarm.
- After the demo flight's displacement, `home_distance_m` and `home_bearing_deg` match truth home geometry (grid bearing + γ), within the GNSS error: 4 m and, beyond 10 m out, 20°.
- `battery_mah_drawn` = (1 − SOC) × 1300 exactly.

**Done when** `fpv-osd.test.ts` passes and the other suites are unchanged.

## Phase 5: Test models and the Tests sheet

The validation models T03–T23 are written by the phases that implement their features, into `test-models/fpv/`. This phase finishes the **shipped** set in `reference-models/`: T01 Demo Flight, T02 Acro Rate Step, T04 GNSS Conditions, T10 Failsafe Rescue, T11 GPS Rescue Switch and T17 Position Hold, each shipped as "FPV <Feature>". The items below cover the original two models and GNSS Conditions.

1. **Demo Flight:**
   - **Displays:** GNSS position (`gnss_pos`) and Home (`home_distance_m`).
   - **Tests sheet Asserts:**
     - `GnssTracksTruth`: horizontal fix within 6 m of truth, about 4σ at HDOP 0.8;
     - `HomeSetOnArm`: `home_valid` is 1 from arming + 0.01 s;
     - `HomeDistanceTracks`: within 6 m of the truth distance;
     - `AltFromHomeTracks`: within 0.5 m of height above the field.
2. **New shipped test model, FPV GNSS Conditions.**
   - It hovers in angle mode while its Conditions schedule steps through open sky (14 satellites, HDOP 0.8), partly blocked (7 satellites, HDOP 2.5, UERE scale 1.5), 3 satellites, 2 satellites, and back to open sky.
   - Asserts check the fix types, the reacquisition time, and that `home_valid` stays latched through the loss of fix, as Betaflight keeps home.
   - It is the example of a time-varying vehicle input (D2).
3. Add it to `SHIPPED_FPV_MODELS` and to `fpv-tests-sheet.test.ts`, which runs every shipped test model's Asserts.
4. Regenerate `reference-models/*.json` with the builder.

**Done when** `npm run obliq:test -- reference-models/fpv-demo-flight.json reference-models/fpv-acro-rate-step.json reference-models/fpv-gnss-conditions.json` passes, and the models open and run in the editor.

## Phase 6: Documentation, export and release

1. **`docs/fpv-reference-model-plan.md`:** a new section covering:
   - the GNSS receiver;
   - grid convergence;
   - the OSD outputs;
   - the input list;
   - the seeds.
2. **`reference-models/README.md`** and the README's Reference Models bullet: the three inputs, and the new test model.
3. **CHANGELOG "## Unreleased":** the FPV Vehicle's new inputs, GNSS receiver, OSD outputs and true heading, the new test model, and WMM at ellipsoid height.
4. **Export manifest:** `scripts/obliq-cgen.ts` adds `inputs` and `outputs` arrays to `cgen-manifest.json`, giving each port's name, C type and dimensions. An integrating agent can then check the export against the interface table without reading the header. This is a small, general obliq-2 change with its own test.
5. **Interface test.** Generate `FPV_Vehicle.h` and check that it contains every input, output and state name in the [Embedded model integration](#embedded-model-integration-for-the-obliq-fpv-unity-agent) tables, with the stated types. The tables then cannot drift from the model.
6. **Native export for Unity:** `npx tsx scripts/obliq-cgen.ts reference-models/fpv-vehicle.json --out <obliq-fpv-unity>/native/model --name FPV_Vehicle`. This is run by whoever owns that repo; obliq-2 only documents the command.
7. **Release:** 3.5.0 when you call it.

**Done when** the docs match the model, the full Jest suite and `tsc` are at their baselines, and the export compiles.

## Phase 7: Unity side (obliq-fpv-unity)

This is listed for interface agreement. It is implemented in that repo. The host-side details are in [Embedded model integration](#embedded-model-integration-for-the-obliq-fpv-unity-agent).

1. **Terrain pipeline:** `build_terrain.py` writes `grid_convergence_deg` and `scale_factor` into `prairie-creek-1km.json`, from PROJ (pyproj `get_factors`, or rasterio's bundled PROJ). obliq-2's `LOCATION.gridConvergenceDeg` is then updated to match, with a test comparing them.
2. **Host:**
   - link libproj;
   - at start-up, compute γ with `proj_factors()` at the origin's easting and northing;
   - new setters `fpv_sim_set_gnss_env(double[4])` and `fpv_sim_set_grid_convergence(double)` write the new model inputs;
   - `proj_trans()` from EPSG:26914 to geographic coordinates converts each new `gnss_pos` to latitude/longitude, which are then quantized to 1e-7°.
3. **New `FpvOsd` struct,** read by `fpv_sim_osd()` and sized by `fpv_osd_size()`. It carries:
   - the Phase 3–4 outputs;
   - `battery_voltage`, `battery_current`, `battery_mah_drawn`;
   - `euler_est`;
   - the converted latitude/longitude.

   `FpvSnapshot` is unchanged.
4. **IOS:** presets for `gnss_env` (open sky, partly blocked, lost).
5. **Plan documents:** `plan.md` now has three vehicle inputs. Phase 4b notes that home and altitude-since-arm latch at the trim point, and that the GNSS noise states restart with the seeds.
6. **HUD:** the overlay, drawn from the OSD signal table in the proposal (section 4).
7. **Later:** satellite visibility at measurement level, driving `gnss_env` from the scene.
   - Port Groves' `Satellite_positions_and_velocities` and the elevation-mask logic from `Generate_GNSS_measurements`. Source: [zbai/MATLAB-Groves](https://github.com/zbai/MATLAB-Groves), BSD; keep its copyright and licence notice.
   - Raycast toward each satellite against the terrain, the bridge and the trees.
   - Compute HDOP and VDOP from the unit vectors of the satellites that remain, using (Gᵀ G)⁻¹, and set the UERE scale from the signal blockage.
   - The model does not change.

## Phases 8–13: Betaflight GNSS behaviour, GPS Rescue and Position Hold

**Status:** approved (D6–D12 in [proposal section 8](fpv-hud-gnss-proposal.md#8-betaflight-gnss-behaviour-gps-rescue-and-position-hold-d6d12)). Every feature is validated by [fpv-hud-gnss-test-plan.md](fpv-hud-gnss-test-plan.md).

**Behaviour reference:** [fpv-betaflight-gnss-spec.md](fpv-betaflight-gnss-spec.md). Parameter names and defaults come from it, in new `FC.failsafe`, `FC.autopilot`, `FC.rescue` and `FC.posHold` blocks.

**Ordering.** These phases run after Phase 4 and before Phase 5, so the test models and documentation cover the finished controller. Phase 5 then also adds the test models listed in Phase 13.

**Rates.** Rescue, the holds, the altitude estimator and the altitude controller sit in 100 Hz sample-time subsystems inside FlightController. GPS-driven pieces sit in 10 Hz subsystems aligned with the receiver, so they step on each new fix. The rate PID runs at `FC.ts`. The 100 Hz and 10 Hz rates are exact multiples of the 2 kHz plant step.

**State machines.** obliq has no state-machine block. The rescue phase, the failsafe stage, the arming latch and the counters are numeric states in Unit Delays, with transitions in Evaluate blocks (C99 conditional expressions). Each machine is one subsystem, with its state and transition logic named after the reference's phases, so the generated C reads against the spec.

### Phase 8: Inputs, arming and mode logic (D7, D8, D11, D12) (done 2026-10-28)

**As built:**
- **Interim stage 2.** Until AUTO-LAND (Phase 10) and GPS Rescue (Phase 12) exist, every procedure disarms in stage 2, like DROP. The recovery rules already follow the procedure: DROP needs only the link back for 0.5 s; the others also need a stick moved more than 30%.
- **Airborne starts.** Builds with `initialAltitude` > 0 start armed, with the arm switch and "ever armed" set, because latched arming would refuse a start at hover throttle.
- **AUX4 thresholds:** below 0.25 off, 0.25–0.75 Alt Hold, above 0.75 Alt + Pos Hold.
- **New outputs:**
  - `fc_mode`: codes in `FC_MODE`; 0 ACRO, 1 AIR, 2 ANGL, 4 ALTH, 5 POSH, 6 RESC, 7 !FS!. Phases 10–12 add ALTH, POSH and RESC.
  - `fc_warnings`: a sum of `FC_WARNING` bits. The arming bits are 8 throttle, 16 mode switch, 32 GPS, 64 RX loss and 128 cycle the arm switch; they show only while disarmed. 1 RESCUE N/A, 2 RESCUE OFF and 4 POSHOLD FAIL come later.
  - `failsafe_stage`: 0, 1 or 2.
- **The throttle-low rule:** with more than 10 s of low throttle before a loss, DROP and AUTO-LAND disarm at once.
- **Failsafe goes first.** It passes processed sticks (`sticks_fs`) to everything else in the flight controller.

1. **Inputs.**
   - `sticks` grows to double[8]: [roll, pitch, yaw, throttle, AUX1 angle, AUX2 arm, AUX3 rescue, AUX4 hold (3-position)].
   - New `rc_link_valid` (double, 1 = the radio link is valid).
   - New `failsafe_procedure` (double: 0 = DROP, 1 = AUTO-LAND, 2 = GPS-RESCUE), read when stage 2 begins.
   - New `wind_ned` (double[3], m/s, grid).
   - Pilot and Conditions supply defaults in non-vehicle builds: AUX3/AUX4 = 0, link valid, procedure 2 (GPS-RESCUE), wind 0. Each input can also follow a time schedule, so test models can drive it.
   - **GPS Rescue is always "configured" in this vehicle**, because AUX3 is a GPS RESCUE mode range. Betaflight's first-arming GPS check therefore always applies: a test that must arm with fewer than 8 satellites arms once with a fix first, or sets the build option `FC.rescue.allowArmingWithoutFix`, which defaults to OFF.
2. **Wind.** The Frame's drag uses air-relative velocity: v_ned − wind, rotated to body axes.
3. **Arming subsystem.** It becomes a latch:
   - it arms on the arm switch's rising edge when no blocking flag is set;
   - the blocking flags are throttle not low, a rescue or hold switch on, the GPS check, and an uncleared ABORT;
   - it disarms on switch off, an impact disarm or ABORT.

   `fc_warnings` carries the blocking flags.
4. **Failsafe subsystem.**
   - **Stage 1:** last sticks for 300 ms, then centred sticks and throttle low until 1.5 s.
   - **Stage 2:** the configured procedure.
   - **Recovery:** link back for 0.5 s, plus a stick moved more than 30% after stage 2.
   - **DROP:** disarm.
   - **AUTO-LAND:** Alt Hold descent at the reference's rate, and Pos Hold if available. It lands, then disarms after `failsafe_landing_time`.
   - **GPS-RESCUE:** starts the rescue.
5. **Mode priority.** One Evaluate produces the active mode and `fc_mode`: !FS!, RESC, POSH, ALTH, ANGL, AIR, ACRO. Holds and rescue force angle mode.
6. **Tests.**
   - Arming refused with throttle up, with a hold or rescue switch on, and on the first arming without a fix when rescue is configured.
   - The stage-1 and stage-2 timings.
   - Recovery requires stick movement.
   - Wind 3 m/s north drifts a hovering acro vehicle north.
   - The existing suites pass with `sticks` widened. Their profiles arm at zero throttle.

### Phase 9: Estimators (D9, D10)

**9a, altitude (done 2026-10-28). As built:**
- The estimator is Betaflight's blend at 100 Hz (`ESTIMATOR.altitude`). It uses Betaflight's own pressure-altitude formula; the estimate is relative to the arming point, so the offset from the standard atmosphere cancels.
- `alt_est` and `vario_est` replace `altitude_est`. Flight-controller outputs are now published by port name.
- Airborne starts set the baro offset to the start altitude, and take the GPS zero against baro at the first fix.
- **Tolerances:**
  - `alt_est` is checked within 1.5 m, not 0.5 m. Betaflight's blend weights GPS 0.65 at pDOP 1.5, and the GPS vertical white noise (0.39 m) is in both the fix and the zero taken at arming. The 10 Hz fix and the 3 Hz PT2 also lag a climb by about 0.3 m. Measured worst errors: 0.96 m at pDOP 1.5, 0.57 m at pDOP 6, 0.26 m on baro alone.
  - `vario_est` carries the GPS steps (±1.5 m/s), so T21 checks its RMS: 0.42 m/s with GPS (limit 1.0), 0.15 m/s on baro (limit 0.3).

**9b, heading (done 2026-10-28). As built:**
- **Course-over-ground correction in the attitude estimator (`ESTIMATOR.cog`):** used only without a magnetometer, with a 3D fix and more than 4 satellites. It starts with a one-time snap of yaw to the course at 1 m/s, then follows Betaflight's gain schedule (speed, the yaw stick through a negative-peak detector, roll, nose-down pitch).
- **`gps_heading_ok`** is Betaflight's `canUseGPSHeading` confidence, reset at arming.
- **Magnetometer disable.** It is a `mag_disable` input to the estimator, fed a constant 0 until Phase 12 drives it from the rescue's fly-home phase.
- **The `magnetometer: false` build** ("FPV Vehicle No Mag"): no Magnetometer subsystem, `mag` reads 0, and the estimate starts at yaw 0 (power-up). In the validation suite it starts facing 60°.
- **Course versus heading.** The course correction aligns heading with the ground track, as Betaflight's does. With sideslip, about 4° at 10 m/s from the hover's tilt bias, the estimated yaw differs from the true yaw by that much. T19 therefore checks heading against the course (2°, from 10 s, after the gain schedule converges) and against the true yaw (8°).

1. **Altitude.** The Betaflight blend replaces the AltitudeEstimator internals:
   - a baro zero that smooths while disarmed and latches at arming;
   - a GPS zero;
   - trust from pDOP, with the disagreement reduction;
   - a 3 Hz PT2;
   - the vario through a 1 Hz PT2.

   Outputs `alt_est` and `vario_est` (relative to arming) replace `altitude_est`, `alt_from_home_est` and `climb_rate_est`. Update `AltitudeEstimateTracks` to compare against height above the arming point.
2. **Heading.**
   - Course-over-ground correction in AttitudeEstimator, after the reference: the snap at 1 m/s, the gain schedule, and `canUseGPSHeading`.
   - The mag is used when `FPV.magnetometer` is on and the rescue does not disable it.
   - The builder option `magnetometer: false` removes the mag sensor and its correction.
3. **Tests.**
   - The altitude blend against a hand computation at fixed pDOPs.
   - The baro-only fallback after loss of fix.
   - Without a mag, the yaw estimate snaps to the course at 1 m/s and then converges.
   - With a mag, the course has no effect outside FLY_HOME.

### Phase 10: Altitude controller and Alt Hold (done 2026-10-28)

**As built:**
- **AltHold subsystem (100 Hz):** throttle-raised latch, activation, target, and the controller (`FC.autopilot`). Its throttle (µs) is converted to stick units, (µs − 1000) / 1000, and replaces the throttle that Rates and AngleMode see. It also forces angle mode. Arming keeps the pilot's own sticks.
- **`ap_hover_throttle`** is this quad's hover, about 1440 µs. Betaflight's default 1275 is a per-quad setting.
- **AUTO-LAND** now runs Altitude Hold in stage 2 and disarms after the 60 s landing time. GPS-RESCUE still drops until Phase 12.
- **New outputs:** `alt_hold_active`; `fc_mode` shows ALTH.
- **With Betaflight's default gains (P, I, D, F = 15) the hold is underdamped on this quad.** It overshoots about 2 m on entry and swings ±1.7 m with an 8 s period. P works out to about 0.6 m/s² per metre and damping to about 0.4, reduced further by the vario's lag. T16 checks ±3 m. (Tuned after Phase 12; see [Controller tuning](#controller-tuning-done-2026-10-28).)
- **The AUTO-LAND descent factor** follows Betaflight's code: × the 5 m/s climb rate, so 5 m/s near the ground. A comment in Betaflight's own source still assumes 1 m/s. In practice the descent runs below target (measured about 3.8 m/s), because the target only moves within 5 m of the altitude.
- **The 1100 and 1700 µs throttle limits** were never reached in testing (measured 1255–1638 µs). That includes a 36° banked full-stick climb and an AUTO-LAND arresting a 10 m/s sink.

1. **Shared altitude controller,** at 100 Hz: P, I (with the 200 cm rule), D with boost, feed-forward, the tilt compensation, and limits.
2. **Alt Hold:** the throttle-stick deadband, the target-climb integration, entry at the current altitude, and engaging only after the throttle has been raised.
3. **Tests:**
   - holds within 0.5 m for 10 s at hover;
   - climbs at 5 m/s at full stick;
   - recovers from a 1 m step.

### Phase 11: Position Hold (done 2026-10-28)

**As built:**
- **PosHold (100 Hz)** handles engagement, the sensors check, the stick deadband, the control-OK latch and the 5 Hz PT3 upsampling.
- **PositionControl (10 Hz, on each fix)** has per-axis P, I, D and A terms with PT1 filters, the stopping phase (D × 1.6), the per-axis target reset when the velocity reverses, the I leak while the sticks are active, the 35° D + A limit, the rotation into body roll and pitch by the estimated grid yaw, and the sanity distance.
- **AngleMode** takes the autopilot's angle, or the pilot's while the sticks are active, capped at 25° (half of `ap_max_angle`), as `pid.c` does.
- **When the controller stops** (sensors not OK, or the sanity check failed), its last angle is held, as in Betaflight.
- **AUTO-LAND** now also runs Pos Hold.
- **Build option `posHoldWithoutMag`** (Betaflight `pos_hold_without_mag`, default off). The no-magnetometer test vehicle turns it on.
- **Fixed from 9b:** `gps_heading_ok` latches once established, until the next arming, as `canUseGPSHeading` does. Without the latch, a no-magnetometer Pos Hold lost its heading once the quad stopped.
- **New outputs:** `pos_hold_active`; `fc_mode` shows POSH; `fc_warnings` adds POSHOLD FAIL (4).
- **Measured holds:** within 1.4 m in a 3 m/s wind (T17), 3.1 m without a magnetometer (T19), and an AUTO-LAND touchdown within 1.9 m of where the drift was arrested (T09).

1. **Position controller,** on each fix: east and north P, I, D and A terms; the D + A limit; the stopping phase; the sign-change reset; rotation by yaw; the 50° limit; the 5 Hz PT3.
2. **Pos Hold mode:** the stick deadband, pilot-override angle limits, the sanity limit, and the mag / GPS-heading requirement (`POSHOLD FAIL`).
3. **Tests:**
   - with 3 m/s wind, holds within 3 m (with GNSS noise) for 30 s;
   - stick override moves the target;
   - without a mag, refuses until GPS heading is established;
   - a fix loss shows `POSHOLD FAIL`.

### Phase 12: GPS Rescue (done 2026-10-28)

**As built:**
- **GpsRescue (100 Hz)** follows `gps_rescue_multirotor.c` tick by tick: start, sensor update, the phase switch, the sanity checks (1 Hz), then the controls. Its outputs are in this model's conventions: pitch positive nose-up, yaw rate positive nose-right (Betaflight's rescue pitch is nose-down, its yaw left).
- **The shared altitude controller** takes the rescue's target, per-tick step (as feed-forward), run and reset. AngleMode takes the rescue's angles, the yaw setpoint its yaw rate, and the estimator its COG gain and magnetometer disable.
- **A new fix** is a 10 Hz receiver solution with a 3D fix, as Betaflight's GPS stamp. Without one the velocity PID holds. Without this gate, a satellite loss in FLY_HOME let the stale PID fly the quad 200 m away in 9 s.
- **Task boundaries.** The 100 Hz autopilot and rescue outputs reach the controller's loop one controller sample later (`…Task` unit delays), as in Betaflight's scheduler, and the rescue's disarm request is delayed one sample. This keeps the generator from breaking algebraic loops in the wrong place: without it, the phase machine read its failure before the phase switch had run, and the rescue stuck in FLY_HOME. The 12 remaining loop warnings are the 4 motor false loops (×3) that were there before.
- **Failsafe:** GPS-RESCUE no longer drops in stage 2; DROP and AUTO-LAND keep their rules. A stage-2 rescue on the ground at home aborts and disarms on its next tick (`fpv-failsafe`). So does any rescue that starts within 5 m of home below 4 m on `alt_est`, in the air too (T12c; added in 3.5.1 for issue #4).
- **Build option `apThrottleMaxUs`** (Betaflight `ap_throttle_max`) for the stalled-climb test.
- **New outputs:** `rescue_active`, `rescue_phase`; `fc_mode` shows RESC; `fc_warnings` adds RESCUE N/A (1) and RESCUE OFF (2).
- **Measured** (T11): ATTAIN_ALT overshoots the return altitude by about 5 m (the 7.5 m/s ramp and the altitude controller's lag) and settles about 4 s into FLY_HOME; FLY_HOME averaged 6.8 m/s against 7.5 at Betaflight's rescue gains (7.5 m/s now: see [Rescue tuning](#rescue-tuning)), with a noisy pitch, because the velocity to home is the 10 Hz difference of GNSS distances (σ about 1.7 m/s); touchdown 1.4 m from home. The quad's top airspeed at the 45° rescue pitch limit is about 22 m/s, so T14's fly-away needs a 25 m/s wind.
- **Faithful but surprising:** DO_NOTHING holds the last throttle and yaw rate, so after a fly-away the quad climbs and turns for 20 s before ABORT; and with no home and no earlier autopilot use, its throttle is 0.

1. **Phase machine and control:**
   - the IDLE bookkeeping (maximum altitude, return altitude, descent distance);
   - every phase transition in the reference;
   - the velocity PID with I relax and attenuation;
   - yaw P with authority ramp and roll mix;
   - the 3 Hz PT3 upsampling;
   - the descent profile;
   - the 3 g impact disarm.
2. **Sanity checks:** LOWSATS, FLYAWAY (mag force-disable first), NO_HOME_POINT, and the stalled climb or descent, with the FS_ONLY policy (needs `rc_link_valid`).
3. **IMU coupling:** COG in FLY_HOME, and the rescue's COG gain.
4. **Tests:**
   - fly out 80 m east at 20 m, switch rescue on: it climbs to max altitude + 10 m, rotates, flies home at about 7.5 m/s, descends and lands within 5 m of home, and disarms on impact;
   - link loss with GPS-RESCUE runs the same sequence after stage 1;
   - starting within 15 m: climbs, pitches out to 15 m, returns;
   - satellites dropped to 2 mid-rescue: LOWSATS after 10 s gives DO_NOTHING (switch) or ABORT (link lost);
   - no home: `RESCUE OFF` warning, and the failure path.

### Controller tuning (done 2026-10-28)

Phases 8–12 used Betaflight's default gains. They are firmware defaults for an unknown quad, so they were tuned for this one, inner loop first, as a pilot would: only Betaflight configuration values change, never the algorithms. Each loop was measured in a native harness, with ideal sensors where the GNSS noise hid the dynamics.

| Loop | Setting | Default → tuned | Effect |
|---|---|---|---|
| Rate | `iterm_relax` | (missing) → RP, setpoint, 15 Hz | A fidelity fix: Betaflight runs it by default. The I-term no longer winds up while the gyro lags a stick move. A 124 deg/s roll step overshot 29%; 20% with relax. |
| Rate | D (roll, pitch) | 30, 34 → 40, 46, D-max off | Betaflight's `d_max` values as a fixed D: 14% overshoot, t90 15 ms after the end of a 50 ms stick ramp (before TPA and the IMU filter: see [Tuning across mass configurations](#tuning-across-mass-configurations)), tracking within 0.3 deg/s. P, I, FF and yaw stay at the defaults (yaw: 7%, t90 74 ms). |
| Angle | level P (`angle_p`) | 50 → 80 | A 15° step reaches 90% in 0.28 s instead of 0.46 s; no overshoot up to 220, so ample margin. |
| Altitude | `ap_altitude_p/i/d/f` | 15/15/15/15 → 30/15/40/30 | Damped (ζ ≈ 0.4 before): after a climb, 0.6 m overshoot settling in 1.6 s (was 2.1 m, 8.5 s); hover RMS 0.3 m (1.35 m). D acts on vertical speed and opposes steady climbs; F 30 offsets most of it, so a full-stick climb runs at about 4.5 m/s of the 5 m/s target. F = D would track the stick fully but overshoots 1.6 m on release. |
| Position | `ap_position_p/i/d/a` | 30/30/30/30 → 40/60/40/30 | With ideal sensors a stop settles within 1 m in 1.2 s (was 3.7 s) and a wind step is absorbed faster. With GNSS the true-position hold is about 0.4 m RMS for any of the gains tried: the GNSS error sets it. |
| Rescue | `gps_rescue_velocity_p/i/d` | 8/40/12 → 4/30/4 | See [Rescue tuning](#rescue-tuning). In this first tuning the gains stayed at 8/40/12: I 80 brought FLY_HOME to 7.46 m/s with ideal sensors (7.25), but with GNSS the gain is lost in the noise of the velocity to home, and T20 then overspeeds. |

**Not modelled, noted:** Betaflight's angle-mode feed-forward (on stick motion), D-max's dynamic boost and anti-gravity. The first two shape pilot stick response only. TPA was on this list; it is now modelled.

**GNSS noise limited the outer loops.** Position Hold's D and the rescue's velocity to home difference 10 Hz positions, and the receiver model's white position noise (0.12 m per axis at HDOP 0.8) gave about 1.7 m/s of velocity noise: Position Hold's tilt swung to 15–20° in a 3 m/s wind, and the rescue's FLY_HOME pitch jittered about 8°. Fixed in the GNSS model, not the gains: see [GNSS error spectrum](#gnss-error-spectrum-done-2026-10-28).

### Rescue tuning

Pitch was unsteady in FLY_HOME, and pitch and roll were unsteady in DESCENT and LANDING. These settings reduce this. The algorithm stays as in Betaflight, and the same values can go on a real quad.

| Setting | Betaflight | This model |
|---|---|---|
| `gps_rescue_velocity_p/i/d` | 8 / 40 / 12 | 4 / 30 / 4 |
| `gps_rescue_pitch_cutoff` | 75 (0.75 Hz) | 50 (0.5 Hz) |
| `gps_rescue_roll_mix` | 150 | 50 |

**Causes**, measured with each noise source removed:

- **Pitch:** the velocity to home is a 10 Hz difference of GNSS positions, and its noise goes to the velocity PID. Without the GNSS fast noise, FLY_HOME pitch jitter falls from 1.37° to 0.18°. Vibration has no effect. The fast noise is an estimate ([GNSS error spectrum](#gnss-error-spectrum-done-2026-10-28)).
- **Roll:** the quad moves slowly at about 2.5 m from home, where GNSS noise is a large bearing error. With `yaw_p` 20 and `roll_mix` 150, 1° of bearing error commanded 3° of roll.
- **Not changed:** DESCENT starts with a flare, from about −16° to +9°, as the target speed falls. This occurs with ideal sensors too.

**Results.** Each value is the mean over seven airframes and three noise seeds, in calm air, with the highest airframe mean in parentheses. Jitter is the SD about a 1 s moving mean of the true attitude.

| Measure | Betaflight's values | This model |
|---|---|---|
| FLY_HOME pitch jitter (°) | 1.49 (1.60) | 0.54 (0.57) |
| FLY_HOME pitch rate, RMS (deg/s) | 13 (13) | 4 (5) |
| DESCENT pitch jitter, with the flare (°) | 2.28 (2.37) | 1.11 (1.16) |
| DESCENT roll jitter (°) | 0.82 (0.85) | 0.29 (0.32) |
| LANDING pitch jitter (°) | 1.86 (2.14) | 0.64 (0.71) |
| LANDING roll jitter (°) | 0.77 (0.86) | 0.39 (0.41) |

**Costs.** The largest landing distances are from 21 flights in each wind condition. Lower gains hold position less firmly.

| Largest landing distance (m) | Betaflight's values | This model |
|---|---|---|
| Calm | 4.4 | 4.8 |
| 5 m/s wind, against the return | 9.0 | 13.6 |
| 5 m/s wind, across the return | 11.1 | 15.0 |
| 6 m/s gust in FLY_HOME | 4.5 | 4.8 |

- **Without a magnetometer:** roll into the turn reduces sideways drift while the heading settles, so the lower `roll_mix` makes the return slower. FLY_HOME takes 11.3 s on the baseline (it took 9.3 s) and 18.0 s on `allUp` (it took 9.0 s). Peak tilt on the baseline falls from 52° to 40°. T20 measures 9.6 m/s of mean ground speed. All five airframes flown landed and disarmed.
- **T13a:** DO_NOTHING holds the last throttle, and the quad sinks. With these values it reached the ground before ABORT, so T13a now climbs higher. This changes the test only. It had 0.3 m of height left at ABORT with Betaflight's values.

`fpv-tuning.test.ts` flies the rescue on every airframe in calm air.

**Possible later improvement (not implemented).** The velocity PID could use the receiver's Doppler velocity, projected on the bearing to home, in place of the difference of positions. A prototype with Betaflight's gains gave 0.31° of FLY_HOME pitch jitter and almost no loss of landing accuracy in wind (9.5 m against 9.0 m in the 5 m/s headwind, on four airframes). This departs from Betaflight's algorithm, so it does not apply while this model represents Betaflight. It is an item for flight software of our own, if that work starts.

### GNSS error spectrum (done 2026-10-28)

**Problem.** Position Hold's D term and the rescue's velocity to home both difference successive 10 Hz positions. The Phase 3 receiver added independent white noise (0.12 m per horizontal axis at HDOP 0.8) to every fix, so successive fixes differed by about 17 cm: about 1.7 m/s of noise in any differenced speed. Its first-order slow error added random steps of 6.9 cm. In a 3 m/s wind, Position Hold's tilt swung to 15–20° (8° with ideal sensors), and the rescue's FLY_HOME pitch jittered 8° (0.1° ideal).

**What open sources say.** No published measurement of a small receiver's epoch-to-epoch jitter was found, but every open model agrees on its character:
- **Groves' MATLAB software** (*Principles of GNSS, Inertial, and Multisensor Integrated Navigation Systems*, 2nd ed.; [zbai/MATLAB-Groves](https://github.com/zbai/MATLAB-Groves)) simulates the raw measurements: per-epoch code-tracking noise of 1 m (`code_track_err_SD`) and range-rate noise of 0.02 m/s (`rate_track_err_SD`), with the signal-in-space, ionosphere and troposphere errors as slow biases (`Initialize_GNSS_biases`). A single-epoch least-squares fix (`GNSS_Demo_1`) passes the code noise straight through; the receiver's navigation processor is his GNSS Kalman filter (`GNSS_Demo_2`, `GNSS_Demo_3`; acceleration PSD 10 m²/s³ for a car, 0.01 stationary), which smooths it with the range rates. That filter, run at 10 Hz on one axis with his noise values at DOP 0.8, leaves 6–11 cm of residual error, but smooth: successive fixes differ by 0.9–2.9 cm (0.09–0.29 m/s when differenced) for acceleration PSDs of 1–10 m²/s³.
- **MATLAB `gpsSensor`** has no white position term: a first-order Gauss–Markov process (1.6 m, decay factor 0.999 per sample) and 0.1 m/s velocity noise.
- **PX4's Gazebo GPS plugin** (`gazebo_gps_plugin`) has a negligible white term (2 × 10⁻⁴ m/√Hz) and a 60 s correlated error.
- **u-blox** describes its dynamic platform models as filtering noisy readings into smoother output, without figures.

So the white term's size (about 0.1 m) was reasonable, but a receiver reports it filtered, not white.

**Change.** The error sizes T03 checks are unchanged (per-axis σ, 60 s correlation, velocity noise); only how fast the error varies changes:
- **Fast term** (`hFast`, `vFast`, was `hWhite`, `vWhite`): unit noise through two poles at `fastTau` = 0.5 s, renormalised to unit variance, standing for the navigation filter's residual. Successive fixes differ by about 2.4 cm (0.24 m/s), within the range the Groves-style filter gives for airborne dynamics.
- **Slow term:** the 60 s Gauss–Markov state through a second pole at `smoothTau` = 5 s, renormalised, so it drifts smoothly (0.7 cm per fix) instead of in random steps.
- **T03** adds `FixToFixStepMatches`: the RMS change of the north error between fixes within ±10% of the value predicted from the constants (2.51 cm; measured 2.53 cm).

**Effect** (same flights, before → after): rescue FLY_HOME pitch jitter 8.3° → 2.1° SD, and its mean speed 6.9 → 7.2 m/s (7.25 with ideal sensors); Position Hold's peak tilt in a 3 m/s wind 16.6° → 11.8°, and a stop settles within 1 m in 2.7 s instead of 6.4 s with half the overshoot.

### IMU signal path (ICM-42688-P)

The first IMU model did not agree with the datasheet (DS-000347, Rev 1.6). The density value was correct, but the path was not. Motor noise was about 1.7 times too high at the 1 kHz rate used then. It was much higher when the IMU ran faster than the controller. These items changed:

- **Noise density is one-sided.** The datasheet gives 2.8 mdps/√Hz and 0.028 dps RMS in 100 Hz, which is RMS = N·√bandwidth. The Random Noise block now uses σ = N/√(2·Ts). Before, it used σ = N/√Ts, which is the Kalibr form for a two-sided density, and its output was √2 too high.
- **Anti-alias filter.** The new `ImuFrontEnd` subsystem adds noise to rate and specific force at the plant step. It then applies a 2nd-order Butterworth low-pass filter at 258 Hz. This is the datasheet's `GYRO_AAF_DELT` 6 and Betaflight's `gyro_hardware_lpf` NORMAL. The datasheet gives order and bandwidth; the Butterworth shape is an assumption. RMS gyro noise is 0.046 dps before quantization, and the filter adds about 0.87 ms of lag.
- **Output registers.** The `IMU` subsystem applies bias, 16-bit quantization and range at the output data rate.
- **IMU faster than the controller.** The shipped model has equal rates. Betaflight runs `gyro_lpf2` on each gyro sample as its downsample filter. A `GyroDownsample` subsystem does this when `SENSORS.imu.ts` is less than `FC.ts`. At equal rates the model has no such subsystem, and LPF2 stays in `GyroFilters`.

**Not modelled:** the datasheet's UI filter (Betaflight sets it to low latency), noise above the plant step's Nyquist frequency, and bias drift. The datasheet gives the density only at 10 Hz. The model assumes that the density is flat above 10 Hz.

**Sensor modes.** `sensors: 'noiseless'` keeps the filter and has no noise, bias or quantization. Use it to measure the stability of the loop. `'ideal'` has no filter either.

### Notch filters and vibration

The model now has Betaflight's full gyro chain and an airframe vibration source. Motor activity at hover falls from 30‰ with no notch filters to 2.45‰ with both filters.

**Gyro chain.** The order is LPF2, RPM filter, LPF1, dynamic notch. These agree with Betaflight's defaults:

- **RPM filter:** 3 harmonics of each motor on all axes, Q 5. A notch fades out over 50 Hz above 100 Hz. Rotor speed goes through a 150 Hz PT1, as telemetry does. It uses the new Notch Filter block.
- **Dynamic notch:** 3 notches on each axis, Q 3, 100–600 Hz. The new Spectrum Peaks block finds their frequencies. It runs a 72-sample sliding DFT on the signal after LPF1.
- **Rate:** Betaflight turns the dynamic notch off below 2 kHz, so the controller and the IMU now run at 2 kHz. The plant step does not change, so a host steps the model at the same rate.
- **Attitude estimator:** it now reads the filtered gyro and a 25 Hz PT2 of the accelerometer, as in Betaflight. It read the raw signals before. Vibration showed this error in T19.

**Not modelled:** Betaflight updates its notches over several loops, and the model updates them on each sample. D-term notches and the dynamic gyro and D-term low-pass filters are also not modelled. `gyro_dps` here has the fixed 250 Hz and 500 Hz low-pass filters, with a fixed 150 Hz filter on D.

**Vibration source.** `SENSORS.vibration` adds these items to the rate and specific force at the plant step, before the anti-alias filter. It is on with `'modelled'` sensors. All amplitudes grow with rotor speed squared.

- **Rotor harmonics:** 2, 3 and 1 deg/s per rotor at 1×, 2× and 3× rotor speed, at a rotor speed of 175 Hz.
- **Broadband motion:** 0.03 deg/s/√Hz.
- **Frame resonance:** 225 Hz, Q 8, gain 2.
- **Axis shares:** 1, 0.75 and 0.5 on roll, pitch and yaw.
- **Accelerometer:** 0.1 m/s² per deg/s. This value is an estimate with no log data.

**Source of the values.** They are estimates scaled from one public log: Oscar Liang's 4S 5-inch practice log (Betaflight 4.3.1, raw gyro in the debug fields). A peak stays near 222–234 Hz at different throttles, so the model treats it as a frame resonance. The log has no rotor speed. It removes 8–21 times the vibration with only a 750 Hz low-pass filter, so most of its vibration is in narrow lines.

| Above 80 Hz | Log | Model |
|---|---|---|
| Raw gyro RMS, roll, rotor speed about 175 Hz (deg/s) | 4.0 | 3.4 |
| Raw gyro RMS, roll, rotor speed about 220 Hz (deg/s) | 8.7–11 | 8.0–9.7 |
| Attenuation, with the log's filter settings | 8–21 times | 14–21 times |
| Motor SD, with the log's filter settings (‰) | 4.5–6.3 | 3.9–5.3 |

The log's rate gains and D-term filters differ from the model's, and its flight is not a steady hover. Use these values as an order of magnitude, and replace them with a log from this quad when one is available. The filter-setting rows were not used to set the vibration values. The model's own filter settings are heavier, which gives 2.45‰ at hover.

### Tuning across mass configurations

One set of gains must fly all the mass configurations in `AIRFRAMES`. `__tests__/reference-models/fpv-tuning.test.ts` enforces the limits. `scripts/fpv-tuning-sweep.ts` prints the numbers. Masses and positions are estimates from typical parts.

All values use the same gains, with TPA, the IMU filter and the notch filters in the loop, on a full battery. The input is a 124 deg/s step from a 1 ms stick move. t90 and settling time start at the stick move. "Unstable at gain" is the first value on the test grid at which P, I and D together cause a sustained oscillation. These runs have no vibration, so the dynamic notches stay at their start frequencies.

| Airframe | Mass (kg) | Thrust/weight | Hover (µs) | Overshoot roll / pitch / yaw (%) | t90 roll / pitch (ms) | Settling to 5%, roll / pitch (ms) | Unstable at gain, roll / pitch | Motor SD with vibration (‰) |
|---|---|---|---|---|---|---|---|---|
| `smallerPack` (−80 g) | 0.67 | 5.17 | 1410 | 17.4 / 15.5 / 7.7 | 37.0 / 38.5 | 102 / 110 | 8 / 8 | 2.20 |
| `baseline` | 0.75 | 4.62 | 1438 | 18.1 / 16.4 / 7.9 | 36.5 / 38.5 | 100 / 109 | 8 / 8 | 2.45 |
| `frontCamera` (60 g) | 0.81 | 4.28 | 1458 | 18.8 / 19.8 / 8.8 | 35.5 / 41.5 | 96 / 120 | 8 / 8 | 2.59 |
| `largerPack` (+90 g) | 0.84 | 4.13 | 1468 | 18.8 / 17.5 / 8.2 | 36.5 / 39.0 | 99 / 109 | 8 / 8 | 2.73 |
| `frontSensor` (150 g) | 0.90 | 3.85 | 1487 | 19.6 / 24.7 / 10.4 | 34.5 / 48.0 | 94 / 140 | 8 / 12 | 2.71 |
| `bellyLoad` (250 g) | 1.00 | 3.47 | 1518 | 21.1 / 20.9 / 9.2 | 37.5 / 41.5 | 103 / 118 | 10 / 10 | 3.18 |
| `allUp` (all except `frontSensor`) | 1.15 | 3.01 | 1562 | 23.5 / 24.5 / 10.4 | 37.0 / 45.0 | 154 / 183 | 10 / 12 | 3.55 |

**Settling time.** A step undershoots by about 5% after its peak. On `allUp` the undershoot is 5.2%, so the settling time jumps. Without notch filters the undershoot is 4.2%. The metric finds large changes only.

**Why the change is small.** Thrust is proportional to command squared, so a heavier quad has more authority per unit of command at its hover point. This cancels much of the added inertia.

**Other conditions**, roll / pitch:

| Condition | `smallerPack` overshoot (%) | `baseline` overshoot (%) | `allUp` overshoot (%) | Lowest unstable gain |
|---|---|---|---|---|
| Motor lag 20 ms | 6.5 / 6.9 | 6.6 / 7.0 | 9.8 / 12.1 | 5 |
| Motor lag 50 ms | 30.6 / 28.2 | 31.2 / 29.3 | 36.9 / 38.1 | 10 |
| 20% charge | 20.7 / 18.8 | 21.4 / 19.8 | 27.0 / 27.5 | 8 |
| No TPA | 15.9 / 14.2 | 15.8 / 14.5 | 17.8 / 20.5 | 6 |
| No notch filters | 15.5 / 14.2 | 16.0 / 15.0 | 20.1 / 22.3 | 14 |

**IMU and controller rate.** The rates below use the baseline airframe. The motor lag sets the step response, so rates above 2 kHz do not change it much.

| IMU / controller / plant step | Roll overshoot (%) | Unstable at gain | Motor SD with vibration (‰) |
|---|---|---|---|
| 1k / 1k / 500 µs (no dynamic notch) | 17.3 | 8 | 3.84 |
| 2k / 2k / 500 µs (shipped) | 18.1 | 8 | 2.45 |
| 4k / 4k / 125 µs | 18.5 | 8 | 2.42 |
| 8k / 4k / 125 µs | 18.5 | 8 | 2.45 |
| 8k / 8k / 125 µs | 18.4 | 8 | 2.49 |

**Filter contributions**, baseline airframe with vibration:

| Filters | Motor SD (‰) |
|---|---|
| None | 30.33 |
| Dynamic notch only | 5.16 |
| RPM only | 4.06 |
| RPM and dynamic notch | 2.45 |

**Decisions:**

- **Gains stay at D 40/46.** All corners are in the limits. The notch filters' lag increases baseline roll overshoot from 16.0% to 18.1%. They reduce the lowest unstable gain from 14 to 8 at the shipped rate.
- **The IMU and controller run at 2 kHz.** This is the slowest rate with the dynamic notch. Faster rates give no measured benefit, and a 125 µs plant step costs a host about 3.5 times the CPU time.
- **Gain margin is not yet a real limit.** The plant has no frame flex, ESC delay or prop wash, so its margins are higher than a real quad's. The vibration source excites the gyro, but it does not model the loop gain of a flexible frame.

**Limits** (in the test): overshoot below 25% on roll and pitch and below 12% on yaw, and below 30% on roll and pitch at 20% charge; t90 below 55 ms on roll and pitch and below 100 ms on yaw; settling below 200 ms on roll and pitch; stable at 4 times the loop gain with motor lag 20, 33 and 50 ms; motor SD from sensor noise below 0.6‰ and with vibration below 5‰; notch filters remove at least 8 times the vibration on every airframe.

**Not tested:** Altitude Hold and the other outer loops across airframes. `ap_hover_throttle` stays at 1438 µs, and `allUp` needs 1562 µs on a full battery. This difference is 124 µs of the 200 µs altitude I limit. A low battery uses more.

### Phase 13: OSD outputs and test models

**Status (2026-10-28):** T23 is done (`fc_mode` priority, the airmode latch, the rescue overriding the holds, RESCUE N/A, mAh drawn). The rest of this phase — the OSD output set, the integration tables and the matrix review — moves to Phase 6, after the obliq-fpv-unity handoff, for the second agent.

1. **Outputs:**
   - `fc_mode` (code and text order as in the spec);
   - `fc_warnings` (bits: RESCUE N/A, RESCUE OFF, POSHOLD FAIL, arming-blocked reasons);
   - `rescue_phase`;
   - `failsafe_stage`.

   Plus the [embedded model integration](#embedded-model-integration-for-the-obliq-fpv-unity-agent) tables for all Phase 8–12 inputs, outputs and states.
2. **Test models for Phase 5:**
   - **FPV GPS Rescue:** the switch-triggered return of Phase 12.
   - **FPV Failsafe Rescue:** a link-loss return.
   - **FPV Position Hold:** a wind hover with stick override.

   Each has Asserts on the sequence.

## Embedded model integration (for the obliq-fpv-unity agent)

This section is written so it can be read on its own. It covers what a host needs to embed the revised `FPV_Vehicle` export. That host is `native/src/fpv_sim.c`, `fpv_host.c`, `fpv_trim.c` and the Unity plugin. The current host already handles the 2 kHz step, RK4 and the `sticks` input. Only what changes is listed here.

### 1. Inputs: write all three, before seeding and on every step

The generated `FPV_Vehicle_inputs_t` becomes:

| Field | C type | Units and meaning | Typical value |
|---|---|---|---|
| `sticks` | `double[6]` | unchanged: [roll, pitch, yaw, throttle, AUX1 angle, AUX2 arm] | — |
| `gnss_env` | `double[4]` | [satellites used, HDOP, VDOP, UERE scale] | [14, 0.8, 1.3, 1.0] |
| `grid_convergence_deg` | `double` | γ in degrees, positive when grid north is east of true north | +1.2425 at Prairie Creek |

- **Zero inputs mean no GNSS.** The inputs struct starts at zero, and `gnss_env` = 0 means 0 satellites, so there is no fix for the whole run. γ = 0 silently treats grid north as true north. The host must write both new inputs:
  - before `FPV_Vehicle_seed_from_inputs()`, which evaluates the model's equations from `model->inputs`;
  - on every step, as `fpv_sim_step` does for `sticks`.

  Extend `fpv_sim_reset`, `fpv_sim_create` and `fpv_sim_impose_level_hover` the same way. Keep the last values in `FpvSim`, so a reset or a clone carries them.
- **Threading.** The IOS sets `gnss_env` from the UI thread. Hand it to the model thread the same way the sticks are handed over; never write `model->inputs` from another thread.
- **When changes take effect.**
  - `gnss_env` changes take effect at the next 10 Hz GNSS sample.
  - γ changes take effect at the next magnetometer sample (100 Hz) and the next flight controller sample (2 kHz).
- **Satellite count** is compared numerically: ≥ 3 for 2D, ≥ 4 for 3D, ≥ 8 for home. Integers are expected. HDOP ≤ 0 means no fix.

### 2. New outputs

These are appended to `FPV_Vehicle_outputs_t`. Existing fields keep their names, types and meaning. Read fields by name and never by offset, because the struct grows.

| Field | C type | Units, frame | Updates at | When invalid |
|---|---|---|---|---|
| `gnss_pos` | `double[3]` | [grid north m, grid east m, altitude m MSL], NED origin, 1 cm | 10 Hz | Holds the last fix |
| `gnss_vel_ned` | `double[3]` | **true**-north NED, m/s, 1 cm/s | 10 Hz | Holds the last fix (2D: down = 0) |
| `gnss_fix` | `double[3]` | [fix type 0/2/3 (UBX), satellites, pDOP] | 10 Hz | fix type 0 |
| `gnss_course` | `double[4]` | [track true °, track magnetic °, ground speed m/s, track valid 0/1] | 10 Hz | track held, valid = 0 (below 0.5 m/s or no fix) |
| `gps_heading_ok` | `double` | 1 once GPS course has established the heading (Betaflight `canUseGPSHeading`); reset at arming; only rises without a magnetometer | 2 kHz | 0 |
| `fc_armed`, `fc_angle_mode`, `fc_airmode` | `double` | 0 or 1 | 2 kHz | — |
| `vario_est` (Phase 9) | `double` | m/s, positive up: the derivative of `alt_est` through a 1 Hz PT2 | 100 Hz | — |
| `alt_est` (Phase 9) | `double` | m, relative to the arming point (Betaflight's estimate) | 100 Hz | 0 while disarmed |
| `heading_deg` | `double` | true heading, 0–360 | 2 kHz | — |
| `home_valid` | `double` | 0 or 1; set only on the arming sample | 2 kHz | 0 |
| `home_distance_m`, `home_bearing_deg` | `double` | m; true bearing from the vehicle to home, 0–360 | 10 Hz (on each fix) | 0 while `home_valid` = 0 |
| `battery_mah_drawn` | `double` | mAh drawn from the 1300 mAh pack | 2 kHz | — |

- Flags are doubles, not ints.
- **Frames:**
  - Truth outputs (`pos_ned`, `vel_ned`, `quat`, `euler`) are in the grid frame, which is the Unity frame.
  - `euler_est` yaw is grid yaw.
  - `heading_deg`, `home_bearing_deg` and `gnss_vel_ned` are true north.
  - The OSD arrow is `home_bearing_deg − heading_deg`.
- Fill `FpvOsd` from `model->outputs` on the model thread, in the same step and the same critical section as `FpvSnapshot`, so the HUD and the camera agree.
- Use only `double` fields in `FpvOsd`, laid out sequentially in C#. A trailing `uint64_t` such as `step` must keep the same alignment on both sides.

### 3. Latitude/longitude with PROJ

- **Coordinate systems.** Take the source coordinate system from the DEM sidecar's `crs` WKT. Do not hard-code an EPSG code: the 1 m DEM's exact NAD83 realization is recorded there. The target is NAD83(2011) geographic, EPSG:6318. Treating it as WGS-84 is within about 1 m (proposal, section 1).
- **Conversion.** Easting = `origin_easting_m` + `gnss_pos[1]`, northing = `origin_northing_m` + `gnss_pos[0]`. Altitude is `gnss_pos[2]` as is (MSL), with no geoid applied.
- **Axis order.** EPSG geographic coordinate systems are latitude-first in PROJ. Use `proj_normalize_for_visualization()` or read the outputs in that order. A swapped pair puts the vehicle in Antarctica, which at least fails visibly.
- **The sign of γ.** Compute it with `proj_factors()` at the origin's easting and northing. PROJ reports meridian convergence in radians with its own sign convention. Convert to degrees and **check the sign against +1.2425**; negate it if it comes back negative.
- **Checks:**
  - the origin's easting/northing converts back to the sidecar's `origin_lat_deg` and `origin_lon_deg` within 1e-8°;
  - a point 500 m grid-north of the origin has a longitude **greater** than the origin's, by about 10.8 m (about +1.16e-4°). If it is smaller, the sign of γ is wrong.
- Quantize latitude/longitude to 1e-7° after the conversion.

### 4. Hover trim (`fpv_sim_impose_level_hover`)

New model states are named in the generated C as `<subsystem path>_<block>_state`. Noise sources are `<path>_<block>_rng`, `_value` and `_drawn_tick`. Phases 3 and 4 use these block names:

| State (generated name) | Holds | Trim action |
|---|---|---|
| `Sensors_ImuFrontEnd_GyroAntiAlias_*`, `Sensors_ImuFrontEnd_AccelAntiAlias_*` | The IMU's anti-alias filters | Leave. They start at 0 and settle within about 5 ms. |
| `Sensors_ImuFrontEnd_rotor_phase_rad`, `Sensors_ImuFrontEnd_FrameResonance_*`, `Sensors_ImuFrontEnd_BroadbandNoise_dps_*` | The vibration source | Leave. |
| `FlightController_GyroFilters_*` (notch states, Spectrum Peaks states, rotor speed filter) | The RPM filter and the dynamic notch | Leave. The rotor speed filter settles within about 5 ms, and the dynamic notches take about 100 ms (est., not measured) to find their peaks. |
| `FlightController_AccelLPF_*` | The accelerometer's 25 Hz PT2 | Leave. It starts at 0, so the estimator does not use the accelerometer for about 50 ms. |
| `Sensors_GNSS_GmPrev_state` [3] | Correlated GNSS error, unit variance | Leave. `_init` sets it to its seeded stationary draw. |
| `Sensors_GNSS_GmSmoothPrev_state` [3] | The slow error after its 5 s smoothing pole (unnormalised) | Leave. `_init` sets it to match the seeded draw. |
| `Sensors_GNSS_FastPrev_state`, `Sensors_GNSS_FastSmoothPrev_state` [3] | The fast (navigation-filter residual) error's two poles | Leave at 0; it settles within about 2 s. |
| `Sensors_GNSS_FixCountPrev_state` | Reacquisition counter: samples with the satellite condition met, capped at 11 (a fix needs more than 10) | Leave. It starts at 11, a fix from t = 0. |
| `Sensors_GNSS_HoldPrev_state` [6] | Last fix [n, e, alt, vn, ve, vd] | **Write** [north, east, msl, 0, 0, 0]. Otherwise a start without a fix reports the compiled rest position at the origin. |
| `Sensors_GNSS_TrackPrev_state` | Last valid track, true ° | Leave at 0. A hover has no valid track, and OSD consumers must check the valid flag. |
| `Sensors_GNSS_*Noise_rng/_value/_drawn_tick` | Noise generators | Leave. A reset re-seeds them. |
| `FlightController_Home_ArmedPrev_state` | `armed` on the previous controller sample | **Leave at 0.** An armed hover then latches home on its first step. (Phase 8's latched arming adds its own states; see section 7.) |
| `FlightController_Home_HomePrev_state` [2], `FlightController_Home_HomeValidPrev_state` | Home position, valid flag | Leave at 0. Home latches at the hover point on the first armed step with 8 or more satellites. |

- `FlightController_AttitudeEstimator_qPrev_state` stays identity for a nose-north hover. The estimator's reference is in the grid frame (D1), so the trim needs no γ.
- Keep the existing rule: restart `time` and `sample_tick` at 0 and never change them otherwise.
  - Every rate is gated on `sample_tick % (Ts/dt) == 0`, so GNSS samples on tick 0 and every 200 ticks after.
  - `dt` must stay 0.0005 s.
- The trim cost function scores the true state, so the GNSS states do not affect the search.

### 5. Determinism, copies and resets

- All generator state (SplitMix64 per noise block) is inside `FPV_Vehicle_t`.
  - `fpv_sim_copy` and `fpv_sim_clone` duplicate the noise streams exactly, so a clone and its original produce the same GNSS errors from then on.
  - `fpv_sim_reset` re-seeds them.
- The model struct grows by a few hundred bytes, which `fpv_sim_model_bytes()` reports. The added work per step is well under 1%.
- None of the model constants the host duplicates change in this plan:
  - motor idle 0.055, span 0.945, 16.8 V, gain, 1/τ;
  - the barometer field pressure 99203.341 Pa.

### 6. Checking the export

- **Manifest.** Phase 6 makes `cgen-manifest.json` list every input and output with its C type and dimensions. Check it against the tables above before wiring.
- **Header.** The host refers to fields by name, so a stale header fails to compile. That is the intended guard.
- **Acceptance in `fpv_driver`:**
  1. At rest, with the default inputs, `gnss_fix` = [3, 14, 1.526] from the first 10 Hz sample.
  2. `heading_deg` ≈ γ for a nose-north rest.
  3. `gnss_pos` is within 6 m of [0, 0, 178.132].
  4. Arm with at least 8 satellites, and `home_valid` = 1 on the arming sample. After Phase 9, `alt_est` ≈ 0.
  5. With `gnss_env` set to 2 satellites, `gnss_fix[0]` = 0 and `gnss_pos` holds. Back at 14 satellites, the fix returns 3D after 1.0 s.
  6. The latitude/longitude checks in item 3 pass.

### 7. Changes from Phases 8–13

- **Inputs.**
  - `sticks` becomes `double[8]`. The radio map adds CH7 = AUX3 (GPS Rescue) and CH8 = AUX4 (3-position: off, Alt Hold, Alt + Pos Hold), and `fpv_sim_set_sticks` takes 8 values.
  - New `rc_link_valid` (`double`): on radio loss the host sets `rc_link_valid` = 0 and **keeps the last sticks**. It no longer publishes zero sticks, because the flight controller's failsafe now decides what happens.
  - New `failsafe_procedure` (`double`: 0 DROP, 1 AUTO-LAND, 2 GPS-RESCUE). The host sets 2 by default and lets the IOS change it.
  - New `wind_ned` (`double[3]`, m/s, grid frame), from the IOS.
- **Arming is latched** (D11). It no longer follows `sticks[5]` level by level. It arms on the switch's rising edge when nothing blocks it, and needs the switch cycled after a forced disarm.
  - The hover trim holds the vehicle armed at hover throttle, which arming would refuse. It must write `FlightController_Arming_ArmedPrev_state` = 1, `FlightController_Arming_ArmSwitchPrev_state` = 1 and `FlightController_Arming_EverArmedPrev_state` = 1, and leave `FlightController_Home_ArmedPrev_state` at 0, so home still latches on the first step.
  - Also write `FlightController_AltHold_ThrottleRaisedPrev_state` = 1 (Betaflight's `wasThrottleRaised`), so Alt Hold and Pos Hold can engage from a trimmed hover.
  - Leave the failsafe states (`FlightController_Failsafe_*`) at their initial values; a reset restores them.
- **The radio map's arm switch** is still AUX2 (CH5). With latched arming, a radio powered up with the switch already on will not arm until the switch is cycled, as on Betaflight.
- **Altitude estimate** (D9).
  - `altitude_est` is removed. `FpvPlant.altitude_est_m` reads `alt_est` (relative to arming) instead; MSL truth stays −`pos_d`.
  - The trim's writes to `AltitudeEstimator_hPrev` and `vPrev` no longer apply. For a hover start it must write:
    - `FlightController_AltitudeEstimator_BaroOffsetPrev_state` = Betaflight's pressure altitude at the hover pressure, (1 − (P/101325)^0.190295) × 44330, with P the standard pressure at the hover's MSL altitude;
    - `FlightController_AltitudeEstimator_GpsZeroValidPrev_state` = 0, so the GPS zero is taken against baro at the first fix.
  - Leave the filter states (`AltitudeLpfStage1/2Prev`, `AltitudeLast`, `VarioLpfStage1/2Prev`) at 0; the trim's armed start then reads `alt_est` ≈ 0 at the hover point.
- **The OSD struct** gains `fc_mode`, `fc_warnings`, `rescue_phase` and `failsafe_stage`.
- **GPS Rescue (Phase 12)** adds the outputs `rescue_active` and `rescue_phase`, and states under `FlightController_GpsRescue_*` plus the task-boundary delays `FlightController_*Task` (AltHoldActive, AutopilotThrottle, RescueActive, RescueAngle, RescueYawRate, RescueMagDisable, RescueCogGain, PosHold…). The hover trim needs no writes for them: their initial values (rescue idle, autopilot off) are right for a trimmed hover, and a reset restores them.

## Order and checkpoints

Phases 0 → 1 → 2 → 3 → 4 → 8 → 9 → 10 → 11 → 12 → 13 → 5 → 6 run in order. Each phase ends with the FPV suites green and is committed separately. Phase 7 can start on the interface once Phase 4 has fixed the output names. It needs the Phase 6 export to run.

| After | Check |
|---|---|
| Phase 1 | Three inputs. Outputs unchanged apart from the 0.6 nT field change. |
| Phase 2 | γ = 0 reproduces Phase 1 exactly. `heading_deg` is true. |
| Phase 3 | GNSS statistics and fix rules pass. |
| Phase 4 | OSD outputs and home pass. |
| Phase 8 | Arming, failsafe timing and wind tests pass. Existing suites green with 8-channel sticks. |
| Phase 9 | Altitude blend and COG heading tests pass. Existing estimator Asserts updated to the arming-relative altitude. |
| Phase 10 | Alt Hold holds and climbs as specified. |
| Phase 11 | Pos Hold holds against wind and fails safe on fix loss. |
| Phase 12 | Rescue returns and lands, from the switch and from link loss. Sanity paths pass. |
| Phase 13 | OSD mode and warning outputs. The integration tables are complete. |
| Phase 5 | All shipped test models pass `obliq:test`. |
| Phase 6 | Docs, CHANGELOG, Jest and `tsc` at their baselines. The export compiles. |

## Risks

- **Model reference with three inputs.** The Model Reference path has only been used with a single input. Phase 1 covers it before anything depends on it. If it breaks, it is a codegen fix in obliq-2 with its own test.
- **Long native GNSS run.** The 600 s run is about 1.2 M plant steps. If it is too slow for the suite, use 300 s with a wider tolerance, or a dedicated `openLoop` + GNSS-only build.
- **Controller size.** Phases 8–12 roughly double the flight controller's block count, with several numeric state machines. Watch compile time, WASM size and editor responsiveness after Phase 10. If the editor suffers, split the rescue and the holds into their own segregated subsystems.
- **Fidelity checks.** The reference is a paraphrase of Betaflight behaviour, not Betaflight. If closer agreement is needed later, Betaflight's SITL target could fly the same scenarios for comparison.
- **Assert tolerances on noisy GNSS.** The thresholds are about 4σ, and the seeds are fixed, so a run is deterministic. A seed change can still move a pass/fail edge. Tolerances are therefore set from the statistics, not from one run.
