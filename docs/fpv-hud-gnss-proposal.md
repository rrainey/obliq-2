# FPV Vehicle: HUD signals and a GNSS receiver (proposal)

**Status:** approved. D1–D12 are decided, and the test plan is [fpv-hud-gnss-test-plan.md](fpv-hud-gnss-test-plan.md). The implementation plan is [fpv-hud-gnss-plan.md](fpv-hud-gnss-plan.md). It builds on the MSL-frame change that is in the obliq-2 working tree but not committed: Prairie Creek Park, z = 0 at 0 m MSL, field plane at z = −178.133.

**Goal:** the Unity human-in-the-loop sim draws a Betaflight-style OSD from the model's own numbers, and the model gains a basic GNSS receiver. The receiver outputs a position fix. The flight controller uses it as Betaflight 2025.12 does: in the altitude estimate, for heading without a magnetometer, for home, and in GPS Rescue, Altitude Hold and Position Hold (section 8).

## Summary of changes

| Area | Change |
|---|---|
| Frames | Model NED stays flat, and its x axis is UTM 14N grid north, as the DEM and Unity are laid out. A new input, the grid convergence γ, lets the model produce true-north quantities without any map projection inside it. |
| Sensors | A new GNSS subsystem runs at 10 Hz. It outputs a noisy fix in grid meters and MSL, true-north velocity, fix type and satellite count. |
| Vehicle inputs | Two new inputs: `grid_convergence_deg` and `gnss_env`. Both are inputs because they may change during a long run (D2). |
| Flight controller | New outputs it already computes: armed, angle mode, airmode, climb rate, altitude since arming. New outputs computed from GNSS: true heading and home distance/bearing. |
| Battery | A new `battery_mah_drawn` output (D3). |
| Unity | PROJ supplies γ and converts the fix to latitude/longitude. The camera snapshot is unchanged, and a separate OSD struct carries the new signals. |

## Notes on the earlier review

Most of the other review holds when checked against the model:

- The flight controller computes `climb_rate` but drops it. `AngleModeOn`, `armed` and `airmode` all exist inside it and are not published.
- `altitude_est` is MSL.
- Channel 6 in its middle position is acro in this vehicle.

Corrections:

1. **The geoid sign is reversed.** NGS GEOID18 at the park center gives N = **−26.103 m** (±0.043 m). Ellipsoid height is therefore 178.133 − 26.103 = **152.03 m**, about 26 m *below* NAVD88.
2. **mAh:** SOC × 1300 is the charge *remaining*. Betaflight shows mAh *drawn*, which is (1 − SOC) × capacity.
3. **Grid north is 1.2425° east of true north at the park.** Uncorrected, this means:
   - fixes up to 10.8 m off to the side at 500 m from the origin;
   - a heading 1.24° off the rendered terrain.

   Section 1 corrects it.
4. **The magnetic field does not need to vary with position.**
   - WMM2025 changes by at most 4 nT across the box and 150 m of climb, against the magnetometer's 300 nT LSB.
   - The field stays a constant computed when the model is built, now evaluated at the ellipsoid height.
5. **Mode inference.** `sticks[4]` gives the same answer as the controller today. Publishing the controller's own mode is still right, because a future failsafe, horizon mode or arming check would make them differ.

## 1. Frames and grid convergence (D1)

**Model frame.** The NED x axis is grid north. Truth outputs (`pos_ned`, `vel_ned`, `quat`, `euler`) stay in this frame, so the camera and the snapshot need no change. The model contains no map projection.

**Input `grid_convergence_deg`.**

- γ is the angle from true north to grid north, positive when grid north is east of true north.
- The Unity host gets it from PROJ's `proj_factors()` at the site origin: about 1.2425° at Prairie Creek.
- Test models feed PROJ's value as a constant.
- Fed 0, every correction below drops out, and grid is treated as true north.
- It changes by about 0.003° across the box. Feeding it per run or per frame are both fine.

**Rotations used inside the model.** A vector with true components (N_t, E_t) has grid components:

- N_g = N_t cos γ + E_t sin γ
- E_g = −N_t sin γ + E_t cos γ

The inverse rotation takes grid back to true. Headings and bearings convert as true = grid + γ.

| Where | Use of γ |
|---|---|
| Magnetometer sensor | The WMM field (true NED) is rotated into the grid frame, so the vehicle feels the correct field for how it sits on the terrain. |
| Attitude estimator reference | Uses the same grid-frame field, so `euler_est` yaw stays comparable with truth yaw. Existing Asserts and the Unity hover trim are unaffected. |
| Flight controller `heading_deg` | `euler_est` yaw + γ, which is true heading, as a real controller reports with declination configured |
| GNSS velocity | Rotated from grid to true NED |
| Home bearing | Computed in grid, then + γ |

**Site constants.** `LOCATION` keeps:

- latitude/longitude and field elevation, for the WMM evaluation;
- the geoid height N = −26.103 m, so the WMM is evaluated at the ellipsoid height.

No UTM math moves into obliq-2.

**Latitude/longitude** are produced by the Unity host with PROJ. It applies the exact inverse UTM transform to (E₀ + e, N₀ + n), where E₀ and N₀ are the origin's easting and northing from the DEM sidecar. Model meters are UTM grid meters, so PROJ also accounts for the scale factor (k = 1.000160, 8 cm at 500 m).

**Datum.** NAD83(2011) and WGS-84 differ by about 1 m here. This cut treats them as the same, which is below receiver noise.

## 2. GNSS receiver

**Placement.** A GNSS subsystem sits inside Sensors and runs at 10 Hz (`sampleTimeSec` 0.1), which is the u-blox M10 default maximum for GPS + Galileo.

- Inputs: truth `pos_ned` and `vel_ned` (grid frame), `gnss_env` and `grid_convergence_deg`.
- Outputs are held between samples.
- No latency is added beyond the 10 Hz hold.

**`gnss_env` input (D2, contents per D4).** The input is [satellites used, HDOP, VDOP, UERE scale]. Section 7 explains the choice.

- The default is [14, 0.8, 1.3, 1.0] (D5).
- The Unity IOS sets it. It is a constant at first. Later it can come from Unity's own sky-visibility raycasts against the terrain, the bridge and the trees.

**Error model.** Position error = DOP × UERE, the standard textbook relation, split into a slow and a fast part.

- Each axis has a unit-variance first-order Gauss–Markov state: x⁺ = a·x + √(1−a²)·w, with a = e^(−Ts/τ) and w a seeded Random Noise.
- The state starts from a stationary draw fixed by its seed.
- The state is multiplied by the current DOP × UERE × UERE scale, so a change in conditions takes effect at the next sample.
- Errors are applied in grid axes. The horizontal error is the same on both axes, so the result is the same as applying it in true-north axes.

| Term | Value (per axis, 1σ) |
|---|---|
| Horizontal, correlated | 1.5 m × HDOP × scale, τ = 60 s |
| Horizontal, white | 0.15 m × HDOP × scale |
| Vertical, correlated | 1.5 m × VDOP × scale, τ = 60 s |
| Vertical, white | 0.3 m × VDOP × scale |
| Velocity, horizontal, white | 0.05 m/s × HDOP × scale |
| Velocity, vertical, white | 0.10 m/s × VDOP × scale |

At HDOP 0.8, horizontal error is about 1.4 m CEP. The u-blox MAX-M10S datasheet gives 1.5 m CEP (24 h static, more than 6 satellites per system) and a velocity accuracy of 0.05 m/s.

**Fix (recommended under D4).**

| Satellites used | Fix type | Behavior |
|---|---|---|
| ≥ 4 | 3 (3D) | Full solution |
| 3 | 2 (2D) | Horizontal solution. Altitude is held at its last 3D value, as receivers do. Vertical velocity reads 0. |
| < 3 | 0 (none) | Position and velocity hold their last values |

- **Reacquisition.** After the fix is lost, a new fix is reported only once the satellite condition has held for 1 s. This models the reacquisition time receivers specify. Without it, toggling the satellite count would produce instant fixes.
- **No time-to-first-fix at t = 0.** The receiver has a fix from the start if `gnss_env` allows it.
- **Fix type codes** follow UBX (0, 2, 3), which Betaflight reads.
- **Ideal sensors.** With the builder's `sensors: 'ideal'` option, the fix is exact truth: no noise and no quantization. Fix type still follows the satellite count.

**Outputs.**

| Port | Type | Content |
|---|---|---|
| `gnss_pos` | double[3] | grid north m, grid east m, altitude m MSL; quantized to 1 cm |
| `gnss_vel_ned` | double[3] | true-north NED velocity, m/s; quantized to 1 cm/s |
| `gnss_fix` | double[3] | fix type (0, 2 or 3), satellites used, pDOP (√(HDOP² + VDOP²), read by Betaflight's altitude blend) |
| `gnss_course` | double[4] | VTG-style track and speed, computed by the receiver from its own (noisy) velocity: [track made good true °, track made good magnetic °, ground speed m/s, track valid 0/1]. The track holds its last value, and valid = 0, while ground speed is below 0.5 m/s or there is no fix, as receivers freeze heading-of-motion at low speed. Magnetic = true − the WMM declination (2.48° E, a build-time constant). Knots and km/h are display conversions for the host. |

## 3. Flight controller outputs

The flight controller gets the GNSS outputs and γ as new inputs. It uses them only for home and heading, as Betaflight does. The attitude and altitude estimators keep using the IMU, magnetometer and barometer.

| Port | Units | Source |
|---|---|---|
| `fc_armed` | 0/1 | Arming/`armed` |
| `fc_angle_mode` | 0/1 | AngleMode/`AngleModeOn`: the mode the controller actually selected |
| `fc_airmode` | 0/1 | Arming/`airmode` |
| `climb_rate_est` | m/s, up | AltitudeEstimator/`climb_rate` |
| `alt_from_home_est` | m | `altitude_est` minus its value latched on the rising edge of `armed`. `altitude_est` stays MSL. |
| `heading_deg` | °, true, 0–360 | `euler_est` yaw + γ |
| `home_valid` | 0/1 | Latched **on the arming sample only**, with a 3D fix and at least 8 satellites (Betaflight's `gps_rescue_min_sats` default). No home for that flight otherwise. Cleared on disarm. Distance and bearing update on each new fix (10 Hz). |
| `home_distance_m` | m | From the fix to home |
| `home_bearing_deg` | °, true, 0–360 | From the vehicle to home: grid bearing + γ. The OSD arrow is `home_bearing_deg − heading_deg`. |

On the main sheet, `battery_mah_drawn` = (1 − SOC) × 1300 (D3).

## 4. Where each OSD element comes from

The overlay uses the controller's estimates, the battery outputs and the GNSS fix. Truth signals are for the camera and the log.

| Betaflight OSD element | Source |
|---|---|
| Artificial horizon, sidebars | `euler_est` roll, pitch |
| Heading, compass bar | `heading_deg` |
| Altitude, vario | `alt_from_home_est`, `climb_rate_est` |
| Battery voltage, average cell | `battery_voltage`, and that divided by 4 |
| Current, mAh drawn | `battery_current`, `battery_mah_drawn` |
| Flight mode (ACRO / ANGL / AIR) | `fc_angle_mode`, `fc_airmode` |
| Armed, fly timer | `fc_armed`; Unity keeps the timer |
| Throttle % | `sticks[3]`, held by Unity |
| GPS satellites, fix | `gnss_fix` |
| GPS speed | `gnss_course[2]` (receiver ground speed) |
| GPS course / track | `gnss_course[0]`, shown only while `gnss_course[3]` = 1 |
| Latitude/longitude | `gnss_pos` converted by PROJ in the host |
| Home arrow, distance | `home_bearing_deg − heading_deg`, `home_distance_m` |
| Warnings (BATT LOW, NO GPS, …) | Derived in Unity from the signals above |

Not modeled: RSSI, link quality, the video transmitter, and radio channels 7 and 8.

## 5. Unity side (obliq-fpv-unity)

These are interface notes for the Unity plan. They are not obliq-2 work.

- **`FpvSnapshot` is unchanged.** It stays the camera-pose ABI.
- **New `FpvOsd` struct.** It is read by `fpv_sim_osd()` and sized by `fpv_osd_size()`. It carries:
  - the section 3 and GNSS outputs;
  - battery voltage, current and mAh;
  - `euler_est`;
  - latitude/longitude converted from `gnss_pos`.
- **New input setters:** `fpv_sim_set_gnss_env()` and `fpv_sim_set_grid_convergence()`.
- **PROJ** is linked into the host:
  - `proj_factors()` at the origin gives γ;
  - `proj_trans()` from EPSG:26914 to geographic coordinates converts each new fix, at 10 Hz;
  - the 1e-7° latitude/longitude quantization happens here, after the conversion.
- **Plan documents.** `plan.md` says the export has one input and no new ports. It now has three inputs.
- **Hover trim.**
  - The GNSS noise states restart with the seeds.
  - The trim holds the vehicle armed, so home and altitude-since-arm latch at the hover point.

## 6. Tests (obliq-2)

- **γ:**
  - with γ = 0, the magnetometer field, heading and GNSS velocity reduce to today's values;
  - with γ = 1.2425, `heading_deg` = truth yaw + γ at rest, within the estimator's error, and `euler_est` yaw still matches truth yaw.
- **GNSS, ideal:** the fix equals truth.
- **GNSS, modelled, over a long hover:**
  - per-axis standard deviation within ±25% of the table at the default `gnss_env`;
  - errors at lag 1 s correlated above 0.9;
  - doubling the UERE scale doubles the standard deviation.
- **Fix rules:**
  - 3 satellites gives a 2D fix with altitude held;
  - 2 satellites gives no fix, with the outputs held;
  - restoring 4 satellites gives a 3D fix after 1 s.
- **Flight controller:**
  - `alt_from_home_est` tracks height above the field;
  - `home_valid` latches when the vehicle arms and clears when it disarms;
  - `home_distance_m` and `home_bearing_deg` agree with truth, within the GNSS error.
- **Demo Flight Tests sheet:** new Asserts for GNSS near truth and the home distance.
- **Existing suites:** all eight FPV suites still pass, then the native export is regenerated for `native/model/`.

## 7. D4 research: conventions for simulating degraded GNSS

**Three levels of simulation, each with its own convention.**

1. **Signal level.** RF constellation simulators such as Spirent and Rohde & Schwarz generate the radio signal itself.
   - Inputs are per-satellite signal power and C/N0, antenna patterns, obscuration, multipath and jamming.
   - Land-mobile shadowing is conventionally a Markov model of line-of-sight and shadowed states: ITU-R P.681 (three states), or Lutz's two-state model at L-band.
   - A real receiver then decides everything else. This is out of reach and out of scope here.
2. **Measurement level.**
   - Satellite positions come from orbital parameters (IS-GPS-200).
   - An elevation mask (10° is typical; NOAA recommends 10–15°) and any obstruction remove satellites.
   - Each pseudorange gets noise, and the receiver solves for position.
   - **Satellites in use and DOP are both outputs of the geometry.** Neither drives the other.
   - Groves' textbook and its MATLAB simulation software work this way, as does MATLAB's `gnssSensor`. Its defaults are a 10° mask, 1 m pseudorange noise and 0.02 m/s range-rate noise, and it outputs HDOP and VDOP.
3. **Solution level.** UAV simulators (ArduPilot SITL, PX4 Gazebo, AirSim) add error directly to the true position.
   - ArduPilot exposes `NUMSATS`, `FIXTYPE`, `ACC`, `NOISE`, `HNSE`, `LAG_MS` (default 100 ms), `HZ` (default 5), `GLTCH`, `DISABLE` and `JAM` as parameters.
   - ArduPilot reports a constant HDOP and does not derive it from anything.
   - PX4 uses random-walk and noise-density terms.
   - AirSim decides the fix type from accuracy thresholds.
   - There is no shared standard at this level.

**Answers to the D4 questions.**

- **Is the satellite count the main driver, with DOP derived from it?**
  - No. Both come from which satellites are visible and where they are in the sky.
  - The same count can give very different DOPs. For example, eight satellites all on one side of a bridge give a poor HDOP.
  - So the count alone cannot determine DOP.
  - The conventional error relation has two factors: geometry (DOP) and measurement quality (UERE, which falls with C/N0 and multipath): σ_position = DOP × σ_UERE. This is the standard result in Kaplan & Hegarty and in Misra & Enge.
- **When is a 3D fix possible?**
  - Four unknowns (x, y, z and receiver clock) need at least 4 satellites for 3D.
  - With 3 satellites, a receiver gives a 2D fix by holding altitude.
  - Below 3 there is no fix.
  - Each extra constellation in the solution adds a clock-offset unknown, so in strict terms a GPS + Galileo fix needs one more satellite. Real receivers mostly handle this internally, and this model ignores it.
  - Receivers also refuse fixes whose PDOP or estimated accuracy exceeds configurable limits; u-blox has both.
- **Betaflight's thresholds.** Betaflight records home when it arms, and GPS Rescue requires at least `gps_rescue_min_sats` satellites, 8 by default. Some versions and guides call it `gps_min_sats`.

**Recommendation for this model.** A solution-level model, which matches UAV-simulator practice, whose inputs are the textbook factors:

- **`gnss_env` = [satellites used, HDOP, VDOP, UERE scale].** DOP carries the geometry and the UERE scale carries the signal quality: 1.0 in the open, higher under trees or with interference. These are also the quantities a receiver reports, in NMEA GGA/GSA, UBX NAV-PVT and NAV-DOP.
- **The model does not enforce agreement between the satellite count and the DOPs.** Whoever sets the inputs owns that. In practice:
  - for now, the IOS uses preset combinations, such as open sky or partly blocked;
  - later, Unity can do the measurement-level step itself: raycast toward satellite directions through the terrain and the bridge, then compute DOP from the satellites that remain.
- **Fix rules and reacquisition** as in section 2.
- **Home** requires at least 8 satellites, as Betaflight does.

## 8. Betaflight GNSS behaviour, GPS Rescue and Position Hold (D6–D12)

**Reference.** The behaviour comes from [fpv-betaflight-gnss-spec.md](fpv-betaflight-gnss-spec.md), compiled from Betaflight's source and documentation. The model re-implements that description as a block diagram, and no Betaflight code is translated.

### 8.1 What Betaflight does with GNSS

- **Altitude.** The estimate blends baro and GPS altitude.
  - GPS trust is 1/pDOP, capped at 0.9, and is reduced when the two disagree by more than 1 m.
  - A 3 Hz PT2 follows. The estimate is **zeroed at arming**.
  - The vario is the derivative of the estimate through a 1 Hz PT2. The accelerometer and GPS vertical velocity are not used.
- **Heading.**
  - A healthy magnetometer corrects yaw, and course over ground is ignored.
  - Without a mag, yaw is corrected from course over ground, after a one-time snap to the COG at 1 m/s. The gain depends on speed, sticks and attitude.
  - In GPS Rescue's fly-home phase the mag is always ignored and COG is used.
- **Horizontal.** There is no position or velocity estimator. Raw fixes are used, and the controllers derive velocity from successive positions.
- **Home.** Taken **only at arming**, and only with a 3D fix and at least 8 satellites. Distance and bearing update on each GPS solution.
- **Arming.** With GPS Rescue configured, the first arming after power-up is blocked without a fix. Arming is also blocked while a rescue, Alt Hold or Pos Hold switch is on.

### 8.2 What this means for sections 2–4

| Item | Change |
|---|---|
| `gnss_fix` | Becomes `[fix type, satellites, pDOP]`. pDOP = √(HDOP² + VDOP²), which is what Betaflight's altitude trust reads. |
| Home (`home_valid`, `home_distance_m`, `home_bearing_deg`) | Latched **on the arming sample only**. No home for the flight if the conditions are not met then. Distance and bearing update at 10 Hz on each new fix, not at 1 kHz. |
| `alt_from_home_est`, `climb_rate_est` | Replaced by Betaflight's estimator outputs, `alt_est` and `vario_est` (D9). Both are already relative to arming, which is what the OSD shows. |
| `heading_deg` | Unchanged in meaning: true heading. It is equivalent to Betaflight with `mag_declination` set to the site declination, which the model's full-vector field reference already implies. Without a mag (D10), heading comes from course over ground, which is true by construction. |
| OSD | New `fc_mode` (the flight-mode text: !FS!, RESC, POSH, ALTH, ANGL, AIR, ACRO) and `fc_warnings` (bits: RESCUE N/A, RESCUE OFF, POSHOLD FAIL, arming-blocked reasons) |

### 8.3 Flight controller additions

**Mode logic.**
- Arming becomes a state rather than a switch level. Arming is blocked by:
  - throttle not low;
  - a mode switch being on;
  - the GPS check;
  - an ABORT that has not been cleared by cycling the arm switch.
- Mode priority follows the reference: failsafe and rescue first, then Pos Hold and Alt Hold, then angle and acro.
- The holds engage only after the throttle has been raised once.

**Failsafe.**
- **Stage 1:** 1.5 s, with the sticks centred and throttle low after 300 ms.
- **Stage 2:** procedure DROP, AUTO-LAND or GPS-RESCUE (D8).
- **Recovery:** the link must be back and a stick moved more than 30%.

**Altitude estimator and controller.**
- The Betaflight blend replaces the current baro/accelerometer filter (D9).
- One shared altitude controller at 100 Hz serves Alt Hold, AUTO-LAND and Rescue.

**Alt Hold.** Throttle-stick deadband 20% around hover; target climb up to 5 m/s.

**Pos Hold.**
- East and north PIDs with an acceleration term, run on each fix, rotated by yaw, limited to 50° and smoothed through a 5 Hz PT3.
- The stick deadband is 5%, with a stopping phase.
- Sanity limit: max(10 m, 2 s × speed).
- Requires a mag, or `pos_hold_without_mag` with GPS heading established.

**GPS Rescue.**
- The full phase machine: IDLE, INITIALIZE, ATTAIN_ALT, ROTATE, FLY_HOME, DESCENT, LANDING, DO_NOTHING, ABORT.
- The velocity PID to home, yaw P and roll mix.
- Return altitude in MAX_ALT mode.
- The descent profile, and the impact disarm at 3 g.
- Sanity checks (FS_ONLY): low satellites, fly-away, no home, and the stalled climb or descent.

**Rates.**
- Rescue, holds, the altitude estimator and the altitude controller run at 100 Hz, as Betaflight's tasks do.
- GPS-driven loops step on each new fix (10 Hz).
- The rate PID stays at 1 kHz.

**Angle mode.** It gains an angle-target input. Rescue adds its angles to the stick targets, and Pos Hold replaces them. A rescue yaw-rate setpoint replaces the yaw stick, and the autopilot throttle replaces the pilot's.

**Parameters.** All are named and defaulted as in the reference, in an `FC.autopilot`, `FC.rescue` and `FC.failsafe` block in the builder.

### 8.4 Not modelled

| Item | Why |
|---|---|
| GPS communication loss (Betaflight's GPSLOST) | Our receiver never stops talking; a lost fix is LOWSATS. A later `gnss_env` flag could add it. |
| Mahony gain scheduling and the accelerometer gate | The existing attitude filter keeps its own gains; changing them would alter every current test. This could be a separate fidelity item. |
| Earth-referenced yaw, horizon mode, crash recovery, lap timer | Not needed for these modes |
| The unreleased Kalman estimator in Betaflight `master` | Not in the 2025.12 baseline |

### 8.5 Decisions D6–D12 (adopted)

| # | Question | Recommendation |
|---|---|---|
| D6 | Which Betaflight to follow? (**Adopted**) | **2025.12** (it has Alt Hold, Pos Hold and the shared autopilot), following the code where the docs disagree |
| D7 | How do mode switches and link status reach the vehicle? (**Adopted**) | `sticks` grows to **double[8]**: AUX3 = GPS Rescue switch; AUX4 = 3-position, low off, mid Alt Hold, high Alt + Pos Hold. Plus a new input **`rc_link_valid`** (1 receiving, 0 lost), which drives failsafe. Your radio's CH7 and CH8 become vehicle inputs. On radio loss the host sets `rc_link_valid` = 0 and keeps the last sticks, instead of zeroing them. |
| D8 | Failsafe procedure? | **Adopted, as a model input.** `failsafe_procedure` selects the stage-2 procedure: 0 = DROP, 1 = AUTO-LAND, 2 = GPS-RESCUE. These codes are this model's, not Betaflight's enum. The default in test models and the Unity host is 2, GPS-RESCUE, as a GPS quad is normally configured; Betaflight's own default is DROP. It is read when stage 2 begins. |
| D9 | Altitude estimator? (**Adopted**) | **Replace** the current baro/accelerometer filter with Betaflight's baro/GPS blend. `alt_est` and `vario_est` (relative to arming) replace `altitude_est`, `alt_from_home_est` and `climb_rate_est`. This breaks `altitude_est` for the Unity host (`FpvPlant`, and the trim's `hPrev`/`vPrev` states); the integration notes cover the migration. |
| D10 | Magnetometer? (**Adopted**) | A build option `magnetometer`, **default on** (the current model). Off gives the common no-mag 5-inch quad, with heading from course over ground and Pos Hold only after GPS heading is established. |
| D11 | Arming checks? (**Adopted**) | Implement Betaflight's for throttle-low, mode switches on, GPS (first arming, rescue configured) and ABORT. The test models already arm at zero throttle. The Unity hover trim must write the armed state, because arming is now latched. |
| D12 | Disturbance for Pos Hold and Rescue to fight? (**Adopted**) | A new input **`wind_ned`** (double[3], m/s, grid frame). The frame's existing linear drag acts on air-relative velocity. Default 0. Without it, Pos Hold has nothing to hold against except GPS noise. |

## Decisions

| # | Decision |
|---|---|
| D1 | **Adopted.** Grid convergence γ is a vehicle input from PROJ in the host. The magnetometer field and the estimator reference are in the grid frame. The flight controller publishes true `heading_deg`. GNSS outputs a grid fix and true-north velocity. The host converts the fix to latitude/longitude with PROJ. |
| D2 | **Adopted.** `gnss_env` and `grid_convergence_deg` are model inputs, so they can change during long runs. |
| D3 | **Adopted.** `battery_mah_drawn` is published. |
| D4 | **Adopted.** `gnss_env` = [satellites, HDOP, VDOP, UERE scale]; 3D at 4 or more satellites, 2D at 3, no fix below 3; 1 s reacquisition; home at 8 or more satellites. |
| D5 | **Adopted.** Default `gnss_env` [14, 0.8, 1.3, 1.0] and the error table in section 2, anchored to the u-blox MAX-M10S datasheet. |
| D6–D12 | **Adopted** as recommended in section 8.5, except that D8 makes the failsafe procedure a model input, `failsafe_procedure`. The radio-link input is named `rc_link_valid`. |

## Not in this cut

- Time-to-first-fix at power-on, multipath, and terrain or tree blockage. Unity can stand in for blockage through `gnss_env`.
- An ellipsoid-height output.
- A run-time WMM.
- The datum shift between NAD83(2011) and WGS-84.
- Betaflight's arming checks. The model arms with the throttle up, which Betaflight refuses to do. This is worth a separate item.
