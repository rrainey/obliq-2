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
ts: 0.1, tau: 60,
uere: { hCorr: 1.5, hWhite: 0.15, vCorr: 1.5, vWhite: 0.3 },   // m per unit DOP
vel: { h: 0.05, v: 0.10 },                                      // m/s per unit DOP
reacquireS: 1.0, quantPos: 0.01, quantVel: 0.01,
seeds: { corr: 120, white: 121, vel: 122 }
```

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

**Rates.** Rescue, the holds, the altitude estimator and the altitude controller sit in 100 Hz sample-time subsystems inside FlightController. GPS-driven pieces sit in 10 Hz subsystems aligned with the receiver, so they step on each new fix. The rate PID stays at 1 kHz. The 100 Hz and 10 Hz rates are exact multiples of the 2 kHz plant step.

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
- **With Betaflight's default gains (P, I, D, F = 15) the hold is underdamped on this quad.** It overshoots about 2 m on entry and swings ±1.7 m with an 8 s period. P works out to about 0.6 m/s² per metre and damping to about 0.4, reduced further by the vario's lag. T16 checks ±3 m.
- **The AUTO-LAND descent factor** follows Betaflight's code: × the 5 m/s climb rate, so 5 m/s near the ground. A comment in Betaflight's own source still assumes 1 m/s. In practice the descent runs below target (measured about 3.8 m/s), because the target only moves within 5 m of the altitude.
- **The 1100 and 1700 µs throttle limits** were never reached in testing (measured 1255–1638 µs). That includes a 36° banked full-stick climb and an AUTO-LAND arresting a 10 m/s sink.

1. **Shared altitude controller,** at 100 Hz: P, I (with the 200 cm rule), D with boost, feed-forward, the tilt compensation, and limits.
2. **Alt Hold:** the throttle-stick deadband, the target-climb integration, entry at the current altitude, and engaging only after the throttle has been raised.
3. **Tests:**
   - holds within 0.5 m for 10 s at hover;
   - climbs at 5 m/s at full stick;
   - recovers from a 1 m step.

### Phase 11: Position Hold

1. **Position controller,** on each fix: east and north P, I, D and A terms; the D + A limit; the stopping phase; the sign-change reset; rotation by yaw; the 50° limit; the 5 Hz PT3.
2. **Pos Hold mode:** the stick deadband, pilot-override angle limits, the sanity limit, and the mag / GPS-heading requirement (`POSHOLD FAIL`).
3. **Tests:**
   - with 3 m/s wind, holds within 3 m (with GNSS noise) for 30 s;
   - stick override moves the target;
   - without a mag, refuses until GPS heading is established;
   - a fix loss shows `POSHOLD FAIL`.

### Phase 12: GPS Rescue

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

### Phase 13: OSD outputs and test models

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
  - γ changes take effect at the next magnetometer sample (100 Hz) and the next flight controller sample (1 kHz).
- **Satellite count** is compared numerically: ≥ 3 for 2D, ≥ 4 for 3D, ≥ 8 for home. Integers are expected. HDOP ≤ 0 means no fix.

### 2. New outputs

These are appended to `FPV_Vehicle_outputs_t`. Existing fields keep their names, types and meaning. Read fields by name and never by offset, because the struct grows.

| Field | C type | Units, frame | Updates at | When invalid |
|---|---|---|---|---|
| `gnss_pos` | `double[3]` | [grid north m, grid east m, altitude m MSL], NED origin, 1 cm | 10 Hz | Holds the last fix |
| `gnss_vel_ned` | `double[3]` | **true**-north NED, m/s, 1 cm/s | 10 Hz | Holds the last fix (2D: down = 0) |
| `gnss_fix` | `double[3]` | [fix type 0/2/3 (UBX), satellites, pDOP] | 10 Hz | fix type 0 |
| `gnss_course` | `double[4]` | [track true °, track magnetic °, ground speed m/s, track valid 0/1] | 10 Hz | track held, valid = 0 (below 0.5 m/s or no fix) |
| `gps_heading_ok` | `double` | 1 once GPS course has established the heading (Betaflight `canUseGPSHeading`); reset at arming; only rises without a magnetometer | 1 kHz | 0 |
| `fc_armed`, `fc_angle_mode`, `fc_airmode` | `double` | 0 or 1 | 1 kHz | — |
| `vario_est` (Phase 9) | `double` | m/s, positive up: the derivative of `alt_est` through a 1 Hz PT2 | 100 Hz | — |
| `alt_est` (Phase 9) | `double` | m, relative to the arming point (Betaflight's estimate) | 100 Hz | 0 while disarmed |
| `heading_deg` | `double` | true heading, 0–360 | 1 kHz | — |
| `home_valid` | `double` | 0 or 1; set only on the arming sample | 1 kHz | 0 |
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
| `Sensors_GNSS_GmPrev_state` [3] | Correlated GNSS error, unit variance | Leave. `_init` sets it to its seeded stationary draw. |
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
  - Also write `FlightController_AltHold_ThrottleRaisedPrev_state` = 1 (Betaflight's `wasThrottleRaised`), so Alt Hold can engage from a trimmed hover.
  - Leave the failsafe states (`FlightController_Failsafe_*`) at their initial values; a reset restores them.
- **The radio map's arm switch** is still AUX2 (CH5). With latched arming, a radio powered up with the switch already on will not arm until the switch is cycled, as on Betaflight.
- **Altitude estimate** (D9).
  - `altitude_est` is removed. `FpvPlant.altitude_est_m` reads `alt_est` (relative to arming) instead; MSL truth stays −`pos_d`.
  - The trim's writes to `AltitudeEstimator_hPrev` and `vPrev` no longer apply. For a hover start it must write:
    - `FlightController_AltitudeEstimator_BaroOffsetPrev_state` = Betaflight's pressure altitude at the hover pressure, (1 − (P/101325)^0.190295) × 44330, with P the standard pressure at the hover's MSL altitude;
    - `FlightController_AltitudeEstimator_GpsZeroValidPrev_state` = 0, so the GPS zero is taken against baro at the first fix.
  - Leave the filter states (`AltitudeLpfStage1/2Prev`, `AltitudeLast`, `VarioLpfStage1/2Prev`) at 0; the trim's armed start then reads `alt_est` ≈ 0 at the hover point.
- **The OSD struct** gains `fc_mode`, `fc_warnings`, `rescue_phase` and `failsafe_stage`.

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
