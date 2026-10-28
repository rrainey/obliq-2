# FPV Vehicle: HUD signals, GNSS, GPS Rescue and Position Hold (test plan)

**Scope:** every feature in [fpv-hud-gnss-proposal.md](fpv-hud-gnss-proposal.md) (decisions D1–D12), implemented by [fpv-hud-gnss-plan.md](fpv-hud-gnss-plan.md). Betaflight behaviour comes from [fpv-betaflight-gnss-spec.md](fpv-betaflight-gnss-spec.md).

**Rule.** Every feature has at least one Assert in an obliq test model, run with `npm run obliq:test`. Jest native tests supplement the obliq tests only where a check cannot be expressed inside a model (section 1.2). The matrix in section 4 traces each feature to its tests. A feature without a row there is not done.

## 1. Test levels

### 1.1 Level 1: obliq test models (primary)

- **Location.** Test models are built by `scripts/build-fpv-reference-model.ts` into **`test-models/fpv/`**, a folder of their own that is committed but not seeded into My Models.
- **Vehicles.** The folder also holds its own copies of the vehicle: `fpv-vehicle.json` (with magnetometer) and `fpv-vehicle-no-mag.json` (`magnetometer: false`, named "FPV Vehicle No Mag"). `obliq:test` resolves a Model Reference from sibling files first, so the folder runs on its own.
- **Shipped test models.** The ones listed under Shipped in section 3 are also written to `reference-models/`, as examples for users.
- **Running.** `npm run obliq:test -- test-models/fpv/t*.json --junit test-results/fpv-models.xml`. Pass only the `t*.json` test models: the vehicle files have no Asserts, and `obliq:test` fails a model with none. The test models still resolve the vehicle from the folder.
- **Jest gate.** The Jest suite `__tests__/reference-models/fpv-test-models.test.ts` runs the same command over every file in the folder. It fails on any failed or missing Assert, so CI covers Level 1.

### 1.2 Level 2: Jest native suites (supplementary)

Only for checks that cannot live in a model:
- **exact equality between two builds:** γ = 0 against the Phase 1 build; ideal GNSS against truth, bit for bit;
- **determinism across two runs;**
- **hand-computed references** for the altitude blend;
- **the generated C interface:** header names and types, and the export manifest.

These suites compile with `compileAndRunNative`, as the existing FPV suites do.

### 1.3 Level 3: host acceptance (obliq-fpv-unity)

These are the `fpv_driver` checks in the plan's [Embedded model integration](fpv-hud-gnss-plan.md#embedded-model-integration-for-the-obliq-fpv-unity-agent) section, item 6. They are run in that repo. They are listed here so that every interface feature has an owner.

## 2. How the test models are built

### 2.1 Structure

Each test model has three sheets:

- **Main.**
  - The **Vehicle** is a Model Reference to the vehicle.
  - **Pilot** schedules the 8 sticks.
  - **Conditions** schedules `gnss_env`, `grid_convergence_deg`, `rc_link_valid`, `failsafe_procedure` and `wind_ned`, using the same time-table form as the sticks.
  - Tags publish the outputs that the Tests sheet reads.
- **Telemetry:** scopes for the signals under test.
- **Tests:** Assert blocks, plus the helper blocks in section 2.2. Every model also has `StaysUpright` with `onFailure: 'stop'`, so a crash ends the run with a clear failure.

**Naming.** Test models are named **"FPV Tnn Feature"**. Assert names state the property, for example `FixReturns3DAfter1s`.

**Determinism.** The noise seeds are fixed, so every run is the same. Tolerances are set from the specified statistics and the controllers' limits, not by fitting to one run, so changing a seed is not expected to flip a result.

### 2.2 Helper blocks for the Tests sheet

Assert checks a signal against bounds or an expected signal over a time window. Event-order and statistical properties are turned into signals first, using small helpers that the builder adds to Tests sheets:

| Helper | Blocks | Output |
|---|---|---|
| `latch(x)` | Unit Delay + Evaluate `max(in, prev)` | 1 once `x` has ever been true |
| `firstTime(x)` | Clock + Unit Delay; holds the clock value at the first true sample | Time of the first event, or −1 if none |
| `runMax(x)`, `runMin(x)` | Unit Delay + Evaluate | Running extreme |
| `windowMeanSquare(x, t0, t1)` | Clock gate + sum and count accumulators | Mean of x² over [t0, t1], held after t1 |
| `windowCorr(x, lagSamples, t0, t1)` | A delay chain at 10 Hz + accumulators | Normalised lag correlation over the window |
| `heldAt(x, t)` | Clock gate + Unit Delay | x sampled at time t, held |
| `phaseVisited(phase, k)` | `latch(phase == k)` | 1 once rescue phase k is reached |

**Event checks** become Asserts on these signals. For example: `firstTime(fix == 3)` lies in [t₀ + 0.95, t₀ + 1.05], and `phaseVisited(FLY_HOME)` = 1 at the end. Statistical checks become an Assert on the held window result after t1.

## 3. Test models

Durations are simulated seconds. The default conditions are `gnss_env` [14, 0.8, 1.3, 1.0], γ 1.2425, link valid, procedure GPS-RESCUE and no wind, unless a model says otherwise. **Shipped** marks models also written to `reference-models/`.

| Model | Duration | Scenario | Asserts (summary) |
|---|---|---|---|
| **T00 Test Helpers** | 6 s | No vehicle: a ramp, a 0.5 Hz sine and unit Gaussian noise | Each helper in section 2.2 against its known answer (latch, first time 2.0 s, max 1 and min −1, value held at 3 s, mean square 0.5 and 1 ± 0.05, correlation −1 at half a period and 0 at a quarter, phase visited). The Jest runner also sets impossible limits on every Assert, to show none passes vacuously. |
| **T01 Demo Flight** (Shipped; existing, extended) | 5 s | The current demo flight | Existing 11. Added in Phase 4 (19 in all): `ArmedFlagOffBeforeArming`, `ArmedFlagOnAfterArming`, `ModeIsAngle`, `HomeUnsetBeforeArming`, `HomeSetOnArm`, `GnssTracksTruth` (horizontal < 6 m), `HomeDistanceTracks` (< 6 m), `MahDrawnMatchesSoc`. Phase 9 adds `AltEstTracks` (< 0.5 m of height above the arming point). |
| **T02 Acro Rate Step** (Shipped; existing) | 3 s | Unchanged | Existing 6, with the 8-channel sticks |
| **T03 GNSS Statistics** | 3000 s | Disarmed at rest in open sky, so the fix is all error. One window, 10–2990 s | North, east and altitude RMS within ±30% of the specified σ: with τ = 60 s the window holds about 25 independent samples, so RMS varies by about ±10% (1σ). Velocity RMS within ±10% (white noise, 30 000 samples); 1 s correlation of the north error > 0.9; position on the 1 cm grid; fix 3D throughout. Scaling with UERE scale, HDOP and VDOP is checked exactly in Jest (F08), because windows short enough for one run cannot measure a ratio to ±25%. |
| **T04 GNSS Conditions** (Shipped) | 30 s | Hover; satellites 14 → 3 (t = 8) → 2 (t = 14) → 14 (t = 20) | Fix 3 / 2 / 0 / 3 in their windows; altitude held and vd = 0 while 2D; all outputs held while 0; `firstTime(fix == 3 after t = 20)` ∈ [20.95, 21.05]; pDOP = √(HDOP² + VDOP²); `home_valid` stays 1 throughout |
| **T05 GNSS Course** | 12 s | Take-off and hover, then forward flight in angle mode, reaching 4–10 m/s toward grid north | Track valid = 0 and track held in the hover; in flight, valid = 1 and the true track within 3° of the truth (grid track + γ); magnetic = true − 2.48°; ground speed within 0.5 m/s of truth (the 10 Hz hold lags an accelerating vehicle by up to 0.25 m/s) |
| **T06 Grid Convergence** | 10 s | Angle-mode take-off, then a yaw turn of about 90°; γ 1.2425, then γ 0 from t = 6 | `heading_deg` = estimate yaw + γ within 0.01° (catches a missing or wrong-signed γ); after the change, heading = estimate yaw within 0.01°; `euler_est` yaw within 3° of truth yaw (the estimator's error during the turn); the turn exceeds 60° |
| **T07 Arming Checks** | 9 s | On the ground, arm attempts in this order: with throttle up; with the rescue switch on; with the hold switch at mid; first arming with 7 satellites; with 14 (succeeds); disarm; 7 satellites, re-arm (succeeds, no home); a DROP failsafe disarms; arming without cycling the switch; switch cycled | Each refused attempt: `fc_armed` stays 0 and its `fc_warnings` bit is set (throttle, mode switch, GPS); the 14-satellite arming succeeds with a home; the re-arm succeeds with `home_valid` = 0; stage 2 disarms, with the RX-loss bit set while the link is lost; then the cycle-switch bit, until the switch is cycled and it re-arms. Phase 12 adds `RESCUE OFF` after the no-home re-arm, and ABORT. |
| **T08 Failsafe Drop** | 11 s | Climb, procedure DROP; link lost at t = 5 for 1 s (recovers in stage 1); lost again at t = 9 | First loss: stage 1 and `fc_mode` !FS!; motors near hover for the 0.3 s hold, then throttle low; stage 0 the moment the link returns, still armed; second loss: the first stage-2 sample within 2 ms of 10.5 s; disarmed from then |
| **T09 Failsafe Auto-Land** | 75 s | Hover at 15 m with 3 m/s wind; procedure AUTO-LAND; link lost at t = 5 | Stage 2 at 6.5 s; mode ALTH + POSH; descent rate within the reference profile ±20%; horizontal drift < 5 m; on the ground before 60 s; disarmed by `failsafe_landing_time` |
| **T10 Failsafe Rescue** (Shipped) | 90 s | Fly out to about 80 m east at 20 m; procedure GPS-RESCUE; link lost at t = 25; link back at t = 40 with sticks centred; sticks pushed 40% at t = 45 | Stage 2 at 26.5 s, rescue starts; the link returning with centred sticks does **not** end it; stick movement > 30% does; between those times the phases follow the T11 sequence |
| **T11 GPS Rescue Switch** (Shipped) | 80 s | Fly out to about 80 m east at 20 m (maximum 22 m); rescue switch on at t = 25; left on | Phases visited in order (INITIALIZE, ATTAIN_ALT, ROTATE, FLY_HOME, DESCENT, LANDING); return altitude = maximum altitude + 10 m ± 1 m; heading within 30° of the home bearing at the switch to FLY_HOME; ground speed 7.5 ± 1 m/s in steady FLY_HOME; DESCENT begins within 1 m of descentDistance; touchdown within 5 m of home; disarmed by impact; mode text RESC throughout |
| **T12 Rescue Switch Off and Too Close** | 40 s | (a) Rescue on at 40 m out, off at ATTAIN_ALT + 2 s. (b) A second flight starting 8 m from home | (a) The rescue ends at once and the pilot has control (mode ANGL). (b) Climbs to max(10 m, current + 10 m), pitches out beyond 15 m, then returns and lands |
| **T13 Rescue Sanity** | 3 × 60 s runs | (a) Switch rescue; satellites → 2 at FLY_HOME + 2 s. (b) As (a) with the link lost (procedure GPS-RESCUE). (c) Re-armed without a home, then rescue switch on | (a) LOWSATS after 10 s gives DO_NOTHING (level, last throttle), ABORT and disarm 20 s later. (b) LOWSATS gives ABORT at once (FS_ONLY with the link lost). (c) NO_HOME_POINT gives DO_NOTHING; `RESCUE OFF` was shown after arming |
| **T14 Rescue Fly-away** | 80 s | Rescue switch on at 60 m out, into a 9 m/s head wind (faster than the 7.5 m/s return) | After 30 s of FLY_HOME without progress the mag is force-disabled (the course takes over) and the counter resets; after a further 30 s, FLYAWAY gives DO_NOTHING |
| **T15 Rescue Stalled Climb** | 40 s | Rescue with the throttle limit (`ap_throttle_max`) lowered so the climb cannot meet its target | After a cumulative 10 s of insufficient climb, the rescue moves to LANDING |
| **T16 Altitude Hold** | 40 s | Hover in angle mode; AUX4 mid at t = 5 (before raising throttle on a fresh arming, then after); throttle at hover for 10 s; full stick for 3 s; low stick | Does not engage before the throttle has been raised; holds ±0.5 m for 10 s; climbs at 5 ± 0.5 m/s; throttle in the deadband holds; mode ALTH |
| **T17 Position Hold** (Shipped) | 60 s | Hover; 3 m/s wind from the north; AUX4 high at t = 5; roll stick 30% from t = 25 to 28; released; GPS lost (2 satellites) from t = 45 to 50 | Holds within 3 m of the entry point for 15 s; stick override moves the vehicle and the target follows it; after release, stops and holds a new point within 3 m; `POSHOLD FAIL` while the fix is lost; resumes toward its target afterwards; mode POSH + ALTH |
| **T18 Position Hold Sanity** | 30 s | Pos Hold, then a sudden 12 m/s wind gust from t = 10 | Distance to target exceeds max(10 m, 2 s × speed), so `POSHOLD FAIL` and no further control until re-entry |
| **T19 No-Mag Heading** (vehicle without mag) | 60 s | Arm; hover; pitch forward to 3 m/s for 20 s on a straight course; Pos Hold before and after | `heading_deg` snaps to the course when ground speed first passes 1 m/s (within 5°); yaw then converges within 5° of truth; Pos Hold shows `POSHOLD FAIL` before GPS heading is established and holds after |
| **T20 No-Mag Rescue** (vehicle without mag) | 80 s | As T11 without a mag | Same sequence and landing tolerance as T11 |
| **T21 Altitude Estimator** | 60 s | Climb and hover profile; pDOP schedule 1.5 → 6 → 1.5; fix lost from t = 40 to 50 | `alt_est` = 0 at the arming sample; tracks height above the arming point within 0.5 m at pDOP 1.5 and within 1.5 m at pDOP 6; follows the baro alone while the fix is lost (GPS weight 0); `vario_est` within 0.3 m/s of −vd in steady climb |
| **T22 Wind** | 15 s | Angle-mode hover after a climb (no position control); wind 3 m/s north from t = 3 | North velocity within ±0.5 m/s before the wind; from t = 13, within ±15% of the wind speed. Drag balances at the wind's speed; the margin covers the hover's drift of about 0.25 m/s from the estimator's tilt error. |
| **T23 OSD Outputs** | 20 s | Arm, angle, acro with airmode, hold, rescue, failsafe, in sequence | `fc_mode` follows the priority order (!FS! > RESC > POSH > ALTH > ANGL > AIR > ACRO); `fc_airmode` latches at 25% throttle; `battery_mah_drawn` = (1 − SOC) × 1300; `RESCUE N/A` after 2 s with fewer than 4 satellites while armed with a home |

## 4. Traceability matrix

**L1** means test models and their Asserts; **L2** means Jest native suites; **L3** means host acceptance.

| ID | Feature | L1 | L2 | L3 |
|---|---|---|---|---|
| F01 | WMM at the ellipsoid height | — | `fpv-sensors` field value | — |
| F02 | γ rotates the magnetometer field and the estimator reference | T06 | `fpv-sensors`: ideal mag = C_bn R(γ) field to 1e-9; after 5 s the estimate is within 0.2° of truth yaw, which a reference left in true north fails (checked by planting that bug) | — |
| F03 | `heading_deg` is true heading | T06, T19 | — | check 2 |
| F04 | γ = 0 reproduces the unrotated behaviour | — | `fpv-sensors`: at γ = 0 the ideal mag is C_bn·field to 1e-9 and heading equals the estimate's yaw | — |
| F05 | Ideal GNSS equals truth | — | `fpv-gnss` exact | — |
| F06 | GNSS position and velocity error statistics | T03 | — | — |
| F07 | Time correlation of GNSS error | T03 | — | — |
| F08 | UERE scale and DOP scaling | — | `fpv-gnss`: same seeds at scale 2, HDOP 1.6 and VDOP 2.6 give exactly 2× the errors on the scaled axes, sample by sample | — |
| F09 | Fix rules: 3D, 2D and none | T04 | — | check 5 |
| F10 | 2D altitude hold and vd = 0; outputs held without a fix | T04 | — | check 5 |
| F11 | 1 s reacquisition | T04 | — | check 5 |
| F12 | pDOP output | T04, T21 | — | check 1 |
| F13 | Course, ground speed, track validity and magnetic track | T05 | — | — |
| F14 | Quantization | T03 (values on the 1 cm grid) | — | — |
| F15 | Determinism | — | `fpv-gnss` two identical runs | — |
| F16 | Flight controller flags | T01, T23 | `fpv-osd`: armed and angle follow the sticks at every controller sample; airmode latches at 25% throttle | — |
| F17 | mAh drawn | T01, T23 | — | — |
| F18 | Home only at arming with 8 or more satellites; cleared on disarm | T01, T07 | `fpv-osd`: 7 satellites at arming gives no home all flight; disarm clears; re-arm re-takes | check 4 |
| F19 | Home distance and bearing at 10 Hz | T01, T11 | `fpv-osd`: changes only on fixes; within 4 m and 20° of true geometry beyond 10 m | — |
| F20 | `fc_mode` priority | T23 | — | — |
| F21 | `fc_warnings` (RESCUE N/A, RESCUE OFF, POSHOLD FAIL, arming reasons) | T07, T13, T17, T23 | — | — |
| F22 | 8-channel sticks and mode switches | T07, T11, T16, T17 | — | — |
| F23 | Arming latch and blocks | T07 | — | — |
| F24 | Failsafe stage 1 and instant recovery | T08 | — | — |
| F24a | Throttle-low disarm on loss (DROP, AUTO-LAND only) | — | `fpv-failsafe` | — |
| F25 | `failsafe_procedure` input: DROP, AUTO-LAND, GPS-RESCUE | T08, T09, T10 | — | — |
| F26 | Stage-2 recovery needs link and stick movement | T10 | `fpv-failsafe`: DROP needs only 0.5 s of link; AUTO-LAND also a stick past 30% | — |
| F27 | `rc_link_valid` input | T08–T10, T13 | — | — |
| F28 | Wind input | T22, T09, T14, T17 | — | — |
| F29 | Altitude blend, trust and zero at arming | T21 | `fpv-estimators` hand computation | — |
| F30 | Baro fallback on fix loss | T21 | — | — |
| F31 | Vario | T21 | — | — |
| F32 | Course snap and course-over-ground yaw correction | T19 | — | — |
| F33 | `canUseGPSHeading` gating | T19 | — | — |
| F34 | A healthy mag suppresses course correction; mag ignored in FLY_HOME | T06, T11, T14 | — | — |
| F35 | `magnetometer: false` build | T19, T20 | `fpv-estimators` build check | — |
| F36 | Altitude controller (P, I, D, F, tilt, limits) | T16, T11 | — | — |
| F37 | Alt Hold deadband, climb rate, engagement rules | T16 | — | — |
| F38 | Pos Hold against wind | T17 | — | — |
| F39 | Pos Hold stick override, target reset, stopping | T17 | — | — |
| F40 | Pos Hold sanity limit | T18 | — | — |
| F41 | Pos Hold needs a mag or GPS heading; `POSHOLD FAIL` and resume | T17, T19 | — | — |
| F42 | Rescue trigger by switch, and exit | T11, T12 | — | — |
| F43 | Rescue trigger by failsafe | T10 | — | — |
| F44 | Return altitude (MAX_ALT) and ATTAIN_ALT | T11 | — | — |
| F45 | Too-close start | T12 | — | — |
| F46 | ROTATE threshold and yaw ramp | T11 | — | — |
| F47 | FLY_HOME velocity PID and roll limit | T11 | — | — |
| F48 | DESCENT profile and LANDING impact disarm | T11, T20 | — | — |
| F49 | LOWSATS | T13 | — | — |
| F50 | FLYAWAY with mag force-disable | T14 | — | — |
| F51 | NO_HOME_POINT | T13 | — | — |
| F52 | Stalled climb or descent | T15 | — | — |
| F53 | Sanity policy FS_ONLY (DO_NOTHING vs ABORT) | T13 | — | — |
| F54 | DO_NOTHING → ABORT after 20 s | T13 | — | — |
| F55 | Rescue overrides the holds | T23 | — | — |
| F56 | Generated C interface (inputs, outputs, state names and types) | — | `fpv-interface` header check | build |
| F57 | Export manifest lists inputs and outputs | — | `obliq-cgen` manifest test | — |
| F58 | Latitude/longitude conversion (PROJ) | — | — | check 6 |
| F59 | Existing behaviour unchanged (regression) | T01, T02 | all existing FPV suites | — |

## 5. When each test is written

Each implementation phase writes the tests for its features, and the phase is done when they pass. Tests are not left to the end.

| Phase | Writes | Must pass |
|---|---|---|
| 1 | `test-models/fpv/` folder, `fpv-test-models` Jest runner, the Conditions schedules, the helpers in section 2.2 and T00 | T00, T01, T02, F01 (done) |
| 2 | T06, L2 for F02 and F04 | T06 (done) |
| 3 | T03, T04, T05, L2 for F05, F08 and F15 | T03–T05 (done) |
| 4 | T01 additions, F16–F19, and `fpv-osd` (Level 2: flags against the sticks, home only at arming with 8+ satellites, cleared and re-taken, distance and bearing on each fix and against true geometry) | T01 (done) |
| 8 | T07, T08, T22, the inputs used by T09/T10, and `fpv-failsafe` (Level 2: the throttle-low disarm, and stage-2 recovery by procedure) | T07, T08, T22 (done) |
| 9 | T21, T19 (heading parts), the no-mag vehicle, L2 for F29 and F35 | T21, T19 (first part) |
| 10 | T16, T09 | T16, T09 |
| 11 | T17, T18, T19 (Pos Hold parts) | T17–T19 |
| 12 | T10–T15, T20 | T10–T15, T20 |
| 13 | T23, the full matrix review, L2 F56/F57 | All of Level 1 and Level 2 |
| 6 | The Level 3 list handed to obliq-fpv-unity | Full Jest and `tsc` at their baselines |

## 6. Reporting

- `obliq:test` prints each Assert's checks, failures, first failure time and worst violation. `--junit` writes a CI report.
- A failing Assert names the property, the model and the time, so a failure points at its feature through this matrix.
- **Run time.** T03 (900 s) and the 60–90 s scenario runs dominate. The `fpv-test-models` Jest suite runs them in one `obliq:test` invocation with the native compiler, and its timeout is sized for that. If the suite becomes too slow for every CI run, T03 can be tagged for a nightly run, but it stays in the matrix.
