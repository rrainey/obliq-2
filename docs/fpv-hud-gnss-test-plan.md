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
- **behaviour that needs a build option** the test models cannot set, because they reference the shared vehicle: the rescue's stalled climb needs `ap_throttle_max` lowered (`fpv-rescue`, formerly T15);
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
| `heldWhen(x, trigger)` | `latch(trigger)` + Unit Delays | x sampled at the first sample the trigger is true, held; 0 until then |
| `meanWhile(x, gate)` | Sum and count accumulators, gated by a signal | Mean of x over the samples where the gate is true |
| `phaseVisited(phase, k)` | `latch(phase == k)` | 1 once rescue phase k is reached |

**Event checks** become Asserts on these signals. For example: `firstTime(fix == 3)` lies in [t₀ + 0.95, t₀ + 1.05], and `phaseVisited(FLY_HOME)` = 1 at the end. Statistical checks become an Assert on the held window result after t1.

## 3. Test models

Durations are simulated seconds. The default conditions are `gnss_env` [14, 0.8, 1.3, 1.0], γ 1.2425, link valid, procedure GPS-RESCUE and no wind, unless a model says otherwise. **Shipped** marks models also written to `reference-models/`.

| Model | Duration | Scenario | Asserts (summary) |
|---|---|---|---|
| **T00 Test Helpers** | 6 s | No vehicle: a ramp, a 0.5 Hz sine and unit Gaussian noise | Each helper in section 2.2 against its known answer (latch, first time 2.0 s, max 1 and min −1, value held at 3 s, mean square 0.5 and 1 ± 0.05, correlation −1 at half a period and 0 at a quarter, phase visited, the sine held when the clock passes 2.5 s, the mean of the positive half-periods 2/π). The Jest runner also sets impossible limits on every Assert, to show none passes vacuously. |
| **T01 Demo Flight** (Shipped; existing, extended) | 5 s | The current demo flight | Existing 11. Added in Phase 4 (19 in all): `ArmedFlagOffBeforeArming`, `ArmedFlagOnAfterArming`, `ModeIsAngle`, `HomeUnsetBeforeArming`, `HomeSetOnArm`, `GnssTracksTruth` (horizontal < 6 m), `HomeDistanceTracks` (< 6 m), `MahDrawnMatchesSoc`. Phase 9 replaced `AltitudeEstimateTracks` with `AltEstTracks` (within 1.5 m of the height above the arming point). |
| **T02 Acro Rate Step** (Shipped; existing) | 3 s | Unchanged | Existing 6, with the 8-channel sticks |
| **T03 GNSS Statistics** | 3000 s | Disarmed at rest in open sky, so the fix is all error. One window, 10–2990 s | North, east and altitude RMS within ±30% of the specified σ: with τ = 60 s the window holds about 25 independent samples, so RMS varies by about ±10% (1σ). Velocity RMS within ±10% (white noise, 30 000 samples); 1 s correlation of the north error > 0.9; the RMS change of the north error between successive fixes within ±10% of the value the constants predict (2.51 cm; measured 2.53), so the fix is smooth, as a receiver's navigation filter reports it, not white (see the plan, GNSS error spectrum); position on the 1 cm grid; fix 3D throughout. Scaling with UERE scale, HDOP and VDOP is checked exactly in Jest (F08), because windows short enough for one run cannot measure a ratio to ±25%. |
| **T04 GNSS Conditions** (Shipped) | 30 s | Hover; satellites 14 → 3 (t = 8) → 2 (t = 14) → 14 (t = 20) | Fix 3 / 2 / 0 / 3 in their windows; altitude held and vd = 0 while 2D; all outputs held while 0; `firstTime(fix == 3 after t = 20)` ∈ [20.95, 21.05]; pDOP = √(HDOP² + VDOP²); `home_valid` stays 1 throughout |
| **T05 GNSS Course** | 12 s | Take-off and hover, then forward flight in angle mode, reaching 4–10 m/s toward grid north | Track valid = 0 and track held in the hover; in flight, valid = 1 and the true track within 3° of the truth (grid track + γ); magnetic = true − 2.48°; ground speed within 0.5 m/s of truth (the 10 Hz hold lags an accelerating vehicle by up to 0.25 m/s) |
| **T06 Grid Convergence** | 10 s | Angle-mode take-off, then a yaw turn of about 90°; γ 1.2425, then γ 0 from t = 6 | `heading_deg` = estimate yaw + γ within 0.01° (catches a missing or wrong-signed γ); after the change, heading = estimate yaw within 0.01°; `euler_est` yaw within 3° of truth yaw (the estimator's error during the turn); the turn exceeds 60° |
| **T07 Arming Checks** | 9 s | On the ground, arm attempts in this order: with throttle up; with the rescue switch on; with the hold switch at mid; first arming with 7 satellites; with 14 (succeeds); disarm; 7 satellites, re-arm (succeeds, no home); a DROP failsafe disarms; arming without cycling the switch; switch cycled | Each refused attempt: `fc_armed` stays 0 and its `fc_warnings` bit is set (throttle, mode switch, GPS); the 14-satellite arming succeeds with a home; the re-arm succeeds with `home_valid` = 0; stage 2 disarms, with the RX-loss bit set while the link is lost; then the cycle-switch bit, until the switch is cycled and it re-arms. `RESCUE OFF` shows after the no-home re-arm (Phase 12). ABORT is in T13 and `fpv-failsafe` (a stage-2 rescue on the ground at home aborts and disarms on its next tick). |
| **T08 Failsafe Drop** | 11 s | Climb, procedure DROP; link lost at t = 5 for 1 s (recovers in stage 1); lost again at t = 9 | First loss: stage 1 and `fc_mode` !FS!; motors near hover for the 0.3 s hold, then throttle low; stage 0 the moment the link returns, still armed; second loss: the first stage-2 sample within 2 ms of 10.5 s; disarmed from then |
| **T09 Failsafe Auto-Land** | 75 s | Climb to about 18 m in a 3 m/s north wind; procedure AUTO-LAND; link lost at t = 10 | Stage 2 within 2 ms of 11.5 s; Alt Hold active and `fc_mode` !FS! until disarm; after the stage-1 drop is arrested, a controlled descent of 1.5–6 m/s and never faster than 7 m/s (measured up to 6.4); on the ground from 15 s; armed until, and disarmed from, 60 s into stage 2. Betaflight's target descent is about 9 m/s at this height and the controller lags it, so the descent is not checked against the profile. Phase 11 adds Pos Hold and the drift limit. |
| **T10 Failsafe Rescue** (Shipped) | 50 s | The rescue fly-out (climb, Alt Hold from 6 s, a 35% roll east for 8 s: about 80 m east at about 14 m); procedure GPS-RESCUE; link lost at t = 25; back at t = 40 with centred sticks; a 40% roll stick at t = 45 | Stage 1 from 25 s, stage 2 and the rescue (ATTAIN_ALT) at 26.5 s, `fc_mode` !FS! throughout; the link returning does **not** end it; the stick does, at 45 s, with stage 0 and the pilot in control; ATTAIN_ALT, ROTATE, FLY_HOME and DESCENT in order by then; armed throughout |
| **T11 GPS Rescue Switch** (Shipped) | 60 s | The rescue fly-out; rescue switch on at t = 20 (about 82 m out), left on | Starts (ATTAIN_ALT) at 20 s; ATTAIN_ALT, ROTATE, FLY_HOME, DESCENT, LANDING in order, never ABORT; RESC while active; in FLY_HOME from 4.5 s after entry, the mean altitude within 1.5 m of the maximum altitude + 10 m (measured 0.0 m) and within 3 m at every sample (measured 0.3 m; 3 m covers the untuned controller's swing); heading within 32° of the home bearing on entering FLY_HOME (ROTATE hands over below 30°); mean ground speed 6–9.5 m/s (measured 7.2; the 10 Hz velocity to home is a difference of GNSS distances); DESCENT at 19–20 m (19.7); touchdown within 5 m of home (1.8 m); disarmed by impact. INITIALIZE passes to ATTAIN_ALT in the start tick, as in Betaflight, so it is not seen. |
| **T12a Rescue Switch Off** | 20 s | The rescue fly-out with the hold off; rescue switch on at t = 13.5 (about 40 m out), off at t = 15.5 | Active and climbing (ATTAIN_ALT) while on; inactive, IDLE and ANGL from 15.5 s; armed |
| **T12b Rescue Too Close** | 55 s | Climb, Alt Hold, a 25% roll for 1 s (about 5 m east); rescue switch at t = 12 | Under 15 m at the switch (4.8 m); the T11 sequence and checks with return altitude max(10 m, current + 10 m) (mean measured +0.4 m, swing 0.6 m, from 7.5 s into FLY_HOME, after the larger overshoot of the pitched climb), DESCENT at 7.5 m (7.1 m) and touchdown within 5 m (2.0 m); pitched out to 15 m or more before ROTATE (15.4 m) |
| **T13a Rescue Low Sats** | 60 s | The rescue fly-out; rescue switch at t = 20; satellites → 2 at t = 27, in FLY_HOME | `RESCUE N/A` while the satellites are low; LOWSATS after ten 1 Hz checks gives DO_NOTHING at 35.5–37 s (measured 36.0); level (roll and pitch under 5°) from 2 s in; ABORT 20 s later (19.99 s: the checks' phase) and disarmed |
| **T13b Rescue Low Sats Failsafe** | 40 s | As T13a, but the link is lost at t = 19 (procedure GPS-RESCUE), which starts the rescue at 20.5 s | Never DO_NOTHING: with the link lost the FS_ONLY policy aborts at once, at 35.5–37 s (36.5), and disarms |
| **T13c Rescue No Home** | 12 s | Armed with 14 satellites, disarmed, satellites → 7, re-armed at 1.5 s (no home); climb; Alt Hold from 4 s; rescue switch at t = 6 | No home; `RESCUE OFF` for the 3 s after arming, then clear; NO_HOME_POINT gives DO_NOTHING at once, never ATTAIN_ALT or ABORT; Betaflight holds the autopilot's last throttle, here Alt Hold's while still settling (below hover), so the quad sinks and disarms on impact |
| **T14 Rescue Fly-away** | 100 s | The rescue fly-out; rescue switch at t = 12.5 (about 30 m out); from FLY_HOME (16.5–17.5 s) a 25 m/s wind from the west, faster than the quad flies at the 45° rescue pitch limit (about 22 m/s; a 9 m/s or even 20 m/s head wind only slows it) | FLY_HOME by 17.5 s; FLYAWAY gives DO_NOTHING 58–61 s after FLY_HOME began (measured 59.3): 30 s without progress force-disable the mag and reset the count, then 30 s more; ABORT 20 s later; disarmed. In DO_NOTHING Betaflight holds the last throttle and yaw rate, so the quad climbs and turns. |
| **T15 Rescue Stalled Climb** → Level 2 `fpv-rescue` | 45 s | Climb to about 130 m, hover, rescue switch at t = 12 with `ap_throttle_max` 1420 µs, below this quad's hover. A test model cannot set the build option; with the limit just above hover (1480 µs) the climb is slow but still makes its target in 5 s, and a downdraft cannot stall it (the vertical drag is 0.15 N·s/m) | ATTAIN_ALT at 12 s; LANDING on the tenth 1 Hz check (22.0 s), the altitude having fallen; never ROTATE, FLY_HOME, DESCENT or ABORT; disarmed on impact from LANDING. With the default limit the same flight rotates. |
| **T16 Altitude Hold** | 22 s | AUX4 mid at 0.5 s before the throttle is raised; a climb; AUX4 mid at 4 s with the stick at hover; full stick 14–17 s; low stick after | Not engaged before the throttle is raised; engaged and ALTH from 4 s; within 3 m of the entry altitude and \|vz\| < 1.5 m/s from 6 s (measured 0.85 m); 4.0–6.0 m/s 2–3 s into full stick (measured up to 5.3; the tuned controller lags the 5 m/s target a little at first); not sinking faster than 1.5 m/s at low stick (0.6). Betaflight's default gains left this quad's hold underdamped (±2 m, 5.45–5.72 m/s overspeed); the tuned gains are in the plan. |
| **T17 Position Hold** (Shipped) | 60 s | Climb; 3 m/s wind from the north; AUX4 high at t = 5; roll stick 30% from t = 25 to 28; released; GPS lost (2 satellites) from t = 45 to 50 | Engaged and POSH from 5 s; within 3 m of its 10 s position over 10–25 s (measured 1.4 m); the stick moves it more than 5 m east; within 3 m of a new point over 35–44 s (1.7 m); `POSHOLD FAIL` from 45 s until the fix returns, and not before; back within 3 m of the 44 s point over 56–60 s (2.2 m). The GNSS error, not the controller, sets these figures: with ideal sensors the tuned hold stays within 0.3 m. |
| **T18 Position Hold Sanity** | 30 s | Pos Hold from 5 s, then a 12 m/s gust from the north from 10 s, beyond what the 25° angle limit can hold | No `POSHOLD FAIL` before the gust; once the quad passes the sanity distance it fails, and it is still failed at the end, because it is latched until re-entry |
| **T19 No-Mag Heading** (vehicle without mag, `pos_hold_without_mag` on, facing 60° with the estimate at 0°) | 22 s | Take off, hover, then fly forward in angle mode on a straight course | The estimate stays at 0° before motion; `gps_heading_ok` is 0, then 1 by 8.5 s; from 10 s heading is within 2° of the course and the estimated yaw within 9° of the true yaw (sideslip; measured 8.6°). The exact snap is in `fpv-estimators`. Pos Hold requested at 2–3.5 s is refused (`POSHOLD FAIL`); requested at 12 s with GPS heading established, it holds within 5 m from 16 s (measured 0.8 m), the latched heading staying valid in the hover. |
| **T20 No-Mag Rescue** (vehicle without mag) | 62 s | As T11 on the vehicle without a magnetometer (its fly-out heads north-east, the vehicle facing 60°) | The T11 checks: mean altitude +0.2 m (swing 0.8 m), ground speed 9.1 m/s, DESCENT at 19.5 m, touchdown 1.7 m from home |
| **T21 Altitude Estimator** | 30 s | Climb; pDOP 1.5, then 6 from 10 s, no fix from 20 s, the fix back at 25 s | `alt_est` = 0 until arming; then within 1.5 m of the height above the arming point in each phase (measured worst 0.85, 0.39 and 0.26 m, and 0.57 m with the fix back); `vario_est` RMS error within 1.0 m/s with GPS and 0.3 m/s on baro alone (measured 0.33 and 0.15). The trust is 0 without a fix in `fpv-estimators`. |
| **T22 Wind** | 15 s | Angle-mode hover after a climb (no position control); wind 3 m/s north from t = 3 | North velocity within ±0.5 m/s before the wind; from t = 13, within ±15% of the wind speed. Drag balances at the wind's speed; the margin covers the hover's drift of about 0.25 m/s from the estimator's tilt error. |
| **T23 OSD Outputs** | 20 s | Armed in acro at 0.25 s with the throttle low; throttle to 60% at 0.7–0.8 s; angle mode at 3 s; satellites → 2 at 4–7.5 s; AUX4 mid at 9 s, high at 11 s; rescue switch 13–15 s; link lost at 17 s (GPS-RESCUE) | `fc_mode` in each window: ACRO, AIR (airmode latched), ANGL, ALTH, POSH, RESC, POSH again, !FS! through stages 1 and 2 (the priority !FS! > RESC > POSH > ALTH > ANGL > AIR > ACRO); `fc_airmode` 0 at low throttle, then latched; Alt Hold and Pos Hold inactive while the rescue runs, Pos Hold back after it; `RESCUE N/A` from the first 1 Hz check without a fix until the fix is back (the two-check rule for under 4 satellites needs a 3D fix with 3, which this receiver never gives); `battery_mah_drawn` = (1 − SOC) × 1300 throughout |

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
| F07 | Time correlation and smoothness of GNSS error | T03 (1 s correlation; fix-to-fix step) | — | — |
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
| F21 | `fc_warnings` (RESCUE N/A, RESCUE OFF, POSHOLD FAIL, arming reasons) | T07, T13a, T13c, T17, T23 | — | — |
| F22 | 8-channel sticks and mode switches | T07, T11, T16, T17 | — | — |
| F23 | Arming latch and blocks | T07 | — | — |
| F24 | Failsafe stage 1 and instant recovery | T08 | — | — |
| F24a | Throttle-low disarm on loss (DROP, AUTO-LAND only) | — | `fpv-failsafe` | — |
| F25 | `failsafe_procedure` input: DROP, AUTO-LAND, GPS-RESCUE | T08, T09, T10 | — | — |
| F26 | Stage-2 recovery needs link and stick movement | T10 | `fpv-failsafe`: DROP needs only 0.5 s of link; AUTO-LAND also a stick past 30% | — |
| F27 | `rc_link_valid` input | T08–T10, T13b | — | — |
| F28 | Wind input | T22, T09, T14, T17 | — | — |
| F29 | Altitude blend, trust and zero at arming | T21, T01 | `fpv-estimators`: trust and blend formulas at every 100 Hz sample, and both PT2s against an independent computation | — |
| F30 | Baro fallback on fix loss | T21 | — | — |
| F31 | Vario | T21 | — | — |
| F32 | Course snap and course-over-ground yaw correction | T19 | `fpv-estimators`: one snap, at the first sample above 1 m/s, to exactly the grid course; no correction before it | — |
| F33 | `canUseGPSHeading` gating | T19 | — | — |
| F34 | A healthy mag suppresses course correction; mag ignored in FLY_HOME | T06, T11, T14 | `fpv-estimators`: with a mag the course path never engages | — |
| F35 | `magnetometer: false` build | T19, T20 | `fpv-estimators`: no Magnetometer subsystem; `mag` reads 0 | — |
| F36 | Altitude controller (P, I, D, F, tilt, limits) | T16, T09, T11 | `fpv-autopilot`: the formula at every 100 Hz sample, in a hold and in an AUTO-LAND; the limits were not reached (1255–1638 µs) | — |
| F37 | Alt Hold deadband, climb rate, engagement rules | T16 | `fpv-autopilot`: stick factor, target movement rule, I reset on entry | — |
| F38 | Pos Hold against wind | T17 | — | — |
| F39 | Pos Hold stick override, target reset, stopping | T17 | — | — |
| F40 | Pos Hold sanity limit | T18 | — | — |
| F41 | Pos Hold needs a mag or GPS heading; `POSHOLD FAIL` and resume | T17, T19 | — | — |
| F42 | Rescue trigger by switch, and exit | T11, T12a | — | — |
| F43 | Rescue trigger by failsafe | T10 | — | — |
| F44 | Return altitude (MAX_ALT) and ATTAIN_ALT | T11, T12b, T20 | — | — |
| F45 | Too-close start | T12b | — | — |
| F46 | ROTATE threshold and yaw ramp | T11 | — | — |
| F47 | FLY_HOME velocity PID and roll limit | T11 | — | — |
| F48 | DESCENT profile and LANDING impact disarm | T11, T12b, T20 | — | — |
| F49 | LOWSATS | T13a, T13b | — | — |
| F50 | FLYAWAY with mag force-disable | T14 | — | — |
| F51 | NO_HOME_POINT | T13c | — | — |
| F52 | Stalled climb or descent | — | `fpv-rescue`: LANDING on the tenth check with `ap_throttle_max` below hover; none with the default | — |
| F53 | Sanity policy FS_ONLY (DO_NOTHING vs ABORT) | T13a, T13b | — | — |
| F54 | DO_NOTHING → ABORT after 20 s | T13a, T14 | — | — |
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
| 9 | T21, T19 (heading parts), the no-mag vehicle, L2 for F29 and F35 | 9a: T21 and `fpv-estimators` (done); 9b: T19 and the heading tests in `fpv-estimators` (done) |
| 10 | T16, T09, and `fpv-autopilot` (Level 2: the throttle formula, I-term, stick factor, AUTO-LAND factor and target, by hand at every sample) | T16, T09 (done) |
| 11 | T17, T18, T19 (Pos Hold parts), T09 drift | T17–T19, T09 (done) |
| 12 | T10–T14 (T12 and T13 as separate models a/b/c), T20, `fpv-rescue` (formerly T15), T07 `RESCUE OFF` | T10–T14, T20, `fpv-rescue` (done) |
| 13 | T23 | T23 (done). The full matrix review and L2 F56/F57 move to Phase 6, with the OSD outputs. |
| 6 | The Level 3 list handed to obliq-fpv-unity | Full Jest and `tsc` at their baselines |

## 6. Reporting

- `obliq:test` prints each Assert's checks, failures, first failure time and worst violation. `--junit` writes a CI report.
- A failing Assert names the property, the model and the time, so a failure points at its feature through this matrix.
- **Run time.** T03 (900 s) and the 60–90 s scenario runs dominate. The `fpv-test-models` Jest suite runs them in one `obliq:test` invocation with the native compiler, and its timeout is sized for that. If the suite becomes too slow for every CI run, T03 can be tagged for a nightly run, but it stays in the matrix.
