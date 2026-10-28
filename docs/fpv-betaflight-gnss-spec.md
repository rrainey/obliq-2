# Betaflight GNSS behaviour: reference for the FPV flight controller

**Purpose.** This is the behaviour the FPV Vehicle's flight controller re-implements for GNSS estimation, GPS Rescue, Altitude Hold and Position Hold. Implementers work from this document, not from Betaflight's source.

**Licence.** Betaflight is GPL-3. This document describes behaviour, parameters and defaults in our own words. No code is copied, and the obliq model is an independent block-diagram implementation of this description.

**How it was compiled (2026-10-28).**

- **Source read:** `4.5-maintenance` @ 0455ec9, `2025.12-maintenance` @ 5b88201 and `master` @ 81e82a6, to learn behaviour only.
- **Documentation:** the official wiki pages.
- **Where docs and code disagree:** behaviour follows the code. These points are marked **[DOC≠CODE]**.

**Baseline.** This document follows **Betaflight 2025.12**, the release that added Altitude Hold and Position Hold. Differences from 4.5 are noted where they matter.

**Source paths cited:**

- `flight/position.c`
- `flight/imu.c`
- `flight/gps_rescue_multirotor.c`
- `flight/alt_hold_multirotor.c`
- `flight/pos_hold_multirotor.c`
- `flight/autopilot_multirotor.c`
- `flight/failsafe.c`
- `fc/core.c`
- `io/gps.c`
- `osd/osd_elements.c`
- `osd/osd_warnings.c`
- `pg/gps_rescue_multirotor.c`
- `pg/autopilot_multirotor.c`
- `pg/gps.c`

All are under `src/main/` at github.com/betaflight/betaflight, branch `2025.12-maintenance`. User documentation: https://betaflight.com/docs/wiki/guides/current/GPS-Rescue and https://betaflight.com/docs/wiki/guides/current/Position-Hold-2025-12.

---

## 1. Estimators

### 1.1 Altitude

**Structure and rates.**
- There is no Kalman filter. Altitude is a weighted blend of baro and GPS, followed by low-pass filters.
- The altitude task runs at 100 Hz.

**Settings.**
- `altitude_source` = DEFAULT, BARO_ONLY or GPS_ONLY (default DEFAULT).
- `altitude_prefer_baro` = 100 (range 0–100).
- `altitude_lpf` = 300, a 3.00 Hz PT2 on altitude.
- `altitude_d_lpf` = 100, a 1.00 Hz PT2 on the derivative.

**Baro.**
- Altitude comes from the standard atmosphere: `(1 − (P/101325)^0.190295) × 44330` m.
- While disarmed, the baro zero offset follows `off = 0.2·baro + 0.8·off`.
- At arming, the offset is latched. From then on, baro altitude is used relative to it.

**GPS.**
- GPS altitude is used only with a 3D fix.
- While disarmed, the latest GPS MSL altitude is stored as the GPS zero.
- If the vehicle arms without a GPS zero, the zero is taken later as `gpsAlt − baroAlt` once a fix appears.
- If the 3D fix is lost, the last GPS altitude is held and GPS trust drops to 0 at once.

**Blend** (armed, DEFAULT source, both sensors present):
1. `gpsTrust` = 1/pDOP, or 0.3 when the receiver gives no pDOP.
2. Cap `gpsTrust` at 0.9.
3. Let `d = |gpsRel − baroRel|` in metres, multiplied by `altitude_prefer_baro`/100. If `d > 1`, set `gpsTrust /= d`.
4. `alt = gpsRel·gpsTrust + baroRel·(1 − gpsTrust)`.
5. Pass `alt` through the 3 Hz PT2.

While disarmed, the filter input is held at 0, so **altitude reads 0 at arming**. The estimate is relative to the arming point.

**Vertical velocity (vario).**
- It is `(alt[k] − alt[k−1]) × 100 Hz`, then the 1 Hz PT2. It is derived from the estimate.
- GPS vertical velocity is not used.
- The OSD vario adds a ±10 cm/s deadband.

**Availability.** Altitude is available when there is a GPS 3D fix or a baro is present.

**OSD altitude.** While disarmed it shows GPS MSL altitude. While armed it shows the estimate.

### 1.2 Attitude and heading

**Filter.** A Mahony complementary filter on a quaternion.
- `imu_dcm_kp` = 2500, giving Kp = 0.25. `imu_dcm_ki` = 0.
- The accelerometer is used only when its magnitude is between 0.9 g and 1.1 g.
- Kp is 10× while disarmed. After a disarm, once the gyro has been quiet for 250 ms (< 15°/s per axis), Kp is 100× for 500 ms.

**Heading correction.** The magnetometer error and the course-over-ground (COG) error are added, rotated into the body frame, and scaled by the same Kp as the gravity error.

- **Magnetometer.** Used when a mag is present and healthy and GPS Rescue does not disable it.
  - A usable mag suppresses COG correction completely.
  - `mag_declination` (×0.1°, default 0) is applied to the mag.
- **COG.** Used only when no mag is in use, with a 3D fix and at least 5 satellites (`numSat > 4`).
  - **Snap.** The first time ground speed exceeds 1.0 m/s, the quaternion is reset: roll and pitch are kept, and yaw is set to the COG. This happens once per power-up.
  - **Course error** = sin(error) for |error| < 90°, else ±1. It is the 2D cross product of the body-x heading and the COG unit vector, multiplied by `groundspeedGain`.
  - **`groundspeedGain`** outside a rescue is the product of four factors:
    - speed factor `r²` for r = speed/(1 m/s) ≤ 1, else `min(r, 10)`;
    - yaw-stick factor `(1 − |yaw stick|)^5`, through a negative-peak detector that releases with a 2.5 s time constant;
    - roll factor `(12° − |roll|)/12°`, or 0 above 12°;
    - pitch factor `pitch/45°` when nose-down, 0 when level or nose-up.
  - During GPS Rescue, the rescue supplies the gain instead (§2.4).
- **`canUseGPSHeading`.** Reset to false at every arming.
  - `confidence += max(gain − |courseErr|, 0)·dt`, with a leak of `0.4·dt·confidence`.
  - It becomes true when confidence > 2.0.
  - It gates Position Hold when there is no mag.
- **`gps_rescue_use_mag`** (default ON with a mag).
  - If OFF, the IMU never uses the mag.
  - During the rescue FLY_HOME phase, the mag is always ignored and COG is used.

### 1.3 Horizontal position and velocity

**No estimator.** There is no horizontal position or velocity estimator and no INS fusion. Raw GPS fixes are used.

**Velocities derived from position.** Rescue and Position Hold derive velocity from successive GPS positions, not from the receiver's velocity.
- Rescue velocity toward home = `(prevDist − dist) × GPS rate`.
- Position Hold velocity = position difference × rate, PT1-filtered.

**Receiver ground speed** is used for:
- the IMU COG gain;
- the rescue gains;
- the Position Hold sanity distance;
- OSD speed.

**GPS rate.** `gps_update_rate_hz` defaults to 10.

### 1.4 Home

**When home is set.**
- Home is set **on arming only**, and only with a 3D fix and at least `gps_rescue_min_sats` satellites (default 8).
- `gps_set_home_point_once` = OFF (default): home is re-taken at every arming, and cleared while disarmed.
- If the conditions are not met at arming, there is no home for that flight. Home is not set later.

**Arming block.** When GPS Rescue is configured, either by a mode range or by `failsafe_procedure` = GPS-RESCUE, arming is blocked without fix and satellites unless one of these holds:
- `gps_rescue_allow_arming_without_fix` = ON (default OFF);
- the vehicle has already armed once since power-up.

So only the first arming after power-up is GPS-gated.

**Distance and bearing.**
- Equirectangular, using cos(home latitude).
- 2D distance. The bearing is true, 0–360°.
- Both are recomputed **on each new GPS solution** while there is a fix, and are 0 with no home.

### 1.5 Health

**Thresholds.**
- **Communication loss.** No navigation message for 2.5 s marks GPS as lost: satellites = 0, no fix.
- **DOP gates nothing.** pDOP only sets the altitude trust.
- **Fewer than 4 satellites** is "low sats" for rescue and for the OSD critical colour.
- **`gps_rescue_min_sats`** (8) governs home, the arming block and the OSD warning colour.

---

## 2. GPS Rescue (2025.12)

The rescue task runs at 100 Hz. Its control loops update on new GPS data.

### 2.1 Triggers

There are two ways in:

1. **GPS RESCUE mode switch.**
   - It starts at once while armed.
   - Switching off ends it at once.
   - Arming is blocked while the switch is on.
2. **Failsafe stage 2** with `failsafe_procedure` = GPS-RESCUE. The other procedures are AUTO-LAND and DROP; **the default is DROP**.

**Failsafe timing.**
- `failsafe_delay` = 1.5 s of stage 1. `failsafe_recovery_delay` = 0.5 s.
- **Stage 1.** Invalid channels hold their last value for 300 ms. Then roll, pitch and yaw go to centre, throttle goes to minimum, and AUX channels hold.
  - The pilot regains control at once if the link returns during stage 1.
- **Stage 2.** After a real link loss, the rescue ends only when the link is back **and** the roll, pitch or yaw stick moves more than 30% (`failsafe_stick_threshold`).
  - Control does not return automatically.
- **DROP and AUTO-LAND only.** If throttle was low for more than 10 s before the link loss, the vehicle disarms immediately. This does not apply to GPS-RESCUE.

### 2.2 Phases

| Phase | Behaviour | Exit |
|---|---|---|
| **IDLE** (not rescuing; runs always) | Tracks the flight's maximum altitude, reset while disarmed. Sets the target altitude to the current altitude. Sets `descentDistance = min(0.5·distToHome, descent_dist)`. Sets `returnAltitude` from `alt_mode`: MAX_ALT (default) = max altitude + `initial_climb`; FIXED_ALT = `return_alt`; CURRENT_ALT = max(initial_climb, current + initial_climb). | Rescue starts → INITIALIZE |
| **INITIALIZE** | Resets the velocity PID and the altitude I-term. Sets the IMU COG gain to 1. Level hold: roll and pitch limits 0. | No home → failure NO_HOME_POINT. Within 5 m and below landing altitude → ABORT. Closer than `min_start_dist` (15 m): returnAlt = max(10 m, current + initial_climb) and descentDistance = 0.5·min_start_dist. Otherwise → ATTAIN_ALT. |
| **ATTAIN_ALT** | The target altitude ramps to returnAlt at `ascend_rate` (7.5 m/s), or descends at `descend_rate` (1.5 m/s) when starting above it. If closer than min_start_dist, pitches 15° forward along the nose. | Altitude reached **and** distance > min_start_dist → ROTATE |
| **ROTATE** | Yaw authority ramps 0 → 1 over 1 s. | Heading within 30° of the home bearing → FLY_HOME, with the pitch limit = `max_angle`. **[DOC≠CODE]** The wiki says 15°. |
| **FLY_HOME** | Target velocity → `ground_speed` (7.5 m/s) with a 1 s time constant. Velocity I relax 0 → 1 with a 2 s time constant. Roll limit = 0.5·max_angle·relax. The mag is ignored and COG is used. | distance ≤ descentDistance → DESCENT |
| **DESCENT** | `proximity = clamp((dist − 0.5·landingAlt)/descentDistance, 0, 1)`. Target velocity = ground_speed·proximity·(30° − \|headingErr\|)/30°, or 0 when the error exceeds 30°. The target altitude falls at `descend_rate·k`, with k = 0.6 at ≤ 10 m rising linearly to 3.0 at ≥ 50 m. | Below landing altitude (4 m) → LANDING |
| **LANDING** | Continues the descent. | Impact: accelerometer magnitude > `disarm_threshold`/10 g (3.0 g) → disarm |
| **DO_NOTHING** | Level (rescue angles 0). Throttle stays at its last autopilot output. Impact disarm is active. | After 20 s → ABORT |
| **ABORT** | Disarm. Arming is blocked until the arm switch is cycled. | — |

### 2.3 Parameters (defaults)

| Parameter | Default |
|---|---|
| `min_start_dist` | 15 m |
| `alt_mode` | MAX_ALT |
| `initial_climb` | 10 m |
| `ascend_rate` | 7.5 m/s |
| `return_alt` | 30 m (FIXED_ALT only) |
| `ground_speed` | 7.5 m/s |
| `max_angle` | 45° |
| `roll_mix` | 150 |
| `pitch_cutoff` | 0.75 Hz |
| `imu_yaw_gain` | 10 (in m/s) |
| `descent_dist` | 20 m |
| `descend_rate` | 1.5 m/s |
| `disarm_threshold` | 30 (×0.1 g) |
| `sanity_checks` | FS_ONLY |
| `min_sats` | 8 |
| `allow_arming_without_fix` | OFF |
| `velocity_p / i / d` | 8 / 40 / 12 |
| `yaw_p` | 20 |
| `use_mag` | ON |

**Shared autopilot parameters:**

| Parameter | Default |
|---|---|
| `ap_landing_altitude_m` | 4 m |
| `ap_hover_throttle` | 1275 µs |
| `ap_throttle_min / max` | 1100 / 1700 µs |
| `ap_altitude_p / i / d / f` | 15 / 15 / 15 / 15 |

**Hard-coded constants:**
- max yaw rate 180°/s **[DOC≠CODE]** (one wiki note says 90°/s);
- allowed yaw range 30°;
- velocity I limit ±0.5 × pitch limit;
- altitude I limit ±200 µs.

### 2.4 Control

The rescue forces self-levelling (the angle-mode path) and produces three outputs:

1. **Roll and pitch angle targets,** added to the stick-derived angle targets. Pilot sticks therefore still add during a switch-started rescue.
2. **A yaw-rate setpoint** that replaces the yaw stick.
3. **A throttle** that replaces pilot throttle in the mixer. Motor stop is disabled.

**Yaw.**
- yaw rate (°/s) = heading error (°) × yaw_p/10 × yaw authority, clamped to ±180°/s.
- Heading error = IMU yaw − home bearing.

**Roll.**
- roll = −yawRate × roll_mix × clamp(1 − |yawRate|/100, 0, 1), in centidegrees.
- It is limited by the phase's roll limit. Rolling into the turn reduces sideways drift.

**Pitch.** A velocity PID, updated on each new GPS sample.
- `err = targetVel − velToHome` (cm/s).
- **P** = err × vel_p (centidegrees). With the defaults, 1 m/s of error gives 8°.
- **I** += 0.01·vel_i·err·(interval·10)·relax, then I *= itermAttenuator. It is limited to ±0.5 × the pitch limit.
- **D** = Δerr/(interval·10)·vel_d, PT1-filtered at pitch_cutoff × a phase modifier: 2 − relax in FLY_HOME, 2.5 − proximity in DESCENT.
- **Output.** The sum is limited to ±max_angle, then upsampled to 100 Hz through a 3 Hz PT3.

**IMU gain and anti-windup.**
- `ratio = |groundSpeed − velToHome| / imu_yaw_gain`.
- `itermAttenuator = 4/(ratio + 4)`.
- The IMU COG gain = forward pitch/30° (≤ 2) outside FLY_HOME. In FLY_HOME, `min(ratio, 3.5)` is added.

**Throttle.** The shared altitude controller (§3.2), aimed at the rescue's target altitude. Its feed-forward input is the target's step per 10 ms.

### 2.5 Failures and sanity checks

| Failure | Detection |
|---|---|
| GPSLOST | GPS communication lost (2.5 s without data) |
| LOWSATS | A 1 Hz counter: +1 without a fix or with fewer than 4 satellites, −1 otherwise, kept in 0–10. Reaching 10 sets LOWSATS. **[DOC≠CODE]** The wiki says "below half of minimum". |
| FLYAWAY | FLY_HOME only, 1 Hz: +1 when the distance closed in the last second is under 0.1 × the target velocity, −1 otherwise. At 30 s: with a mag in use, the mag is force-disabled and the counter reset; without one, FLYAWAY. **[DOC≠CODE]** The wiki says 15 s. |
| NO_HOME_POINT | A rescue starts without a home |

**What a failure does,** by `sanity_checks`:
- **FS_ONLY** (default): ABORT if the radio link is actually lost; otherwise DO_NOTHING.
- **ON:** always ABORT.
- **OFF:** always DO_NOTHING.

**Checks that always apply** (1 Hz):
- In ATTAIN_ALT or DESCENT, if the altitude change is less than half the target change for a cumulative 10 s → LANDING.
- In LANDING, the same test for 10 s → ABORT.

---

## 3. Altitude Hold and Position Hold (2025.12)

### 3.1 Modes

- **ALTHOLD** and **POS HOLD** are separate AUX modes. Each runs at 100 Hz.
- Both force angle mode.
- Arming is blocked while either switch is on.
- Neither engages until the throttle has been raised once after arming.
- The official guidance is to put both on the same switch.

**Alt Hold activates when** the vehicle is armed, not in GPS Rescue, the switch is on or a stage-2 failsafe is active, the accelerometer is present, altitude is available, and the throttle has been raised.

**Pos Hold** has the same conditions apart from the altitude check. Its controller also requires a 3D fix **and** either a healthy mag or (`pos_hold_without_mag` **and** `canUseGPSHeading`). Otherwise the OSD shows `POSHOLD FAIL` and nothing is controlled.

**Alt Hold throttle stick.**
- A deadband of `alt_hold_deadband` (20%) around `ap_hover_throttle`.
- Outside the band, `stickFactor` runs linearly to ±1.
- Target velocity = `stickFactor × alt_hold_climb_rate` (5 m/s).
- The target altitude integrates this velocity, but only while |current − target| < 1 s × max velocity.
- On entry, the target is the current altitude.

**Pos Hold roll and pitch sticks.**
- Beyond `pos_hold_deadband` (5%), the sticks are "active". The autopilot outputs 0, the pilot flies angle mode limited to min(angle_limit, 0.5 × ap_max_angle), and the target follows the current position.
- Yaw stays with the pilot.

**[DOC≠CODE] Parameter names.** The wiki's names differ from the code's. The code uses `ap_hover_throttle`, `alt_hold_climb_rate`, `ap_max_angle` and `ap_position_p/i/d/a/cutoff`.

### 3.2 Altitude controller

It runs at 100 Hz and is shared by Alt Hold, failsafe landing and GPS Rescue.

- **Error:** `err = target − alt` (cm).
- **P** = err × ap_altitude_p × 0.01.
- **I** += err × ap_altitude_i × 0.003 × dt, scaled by 0.1 when |err| ≥ 200 cm. It is limited to ±200 µs.
- **D** = vz (cm/s) × dBoost × ap_altitude_d × 0.01. dBoost = 1 below 5 m/s, else (3r − 2)/r with r = |vz|/5 m/s.
- **F** = ap_altitude_f × 0.01 × input. The input is the target velocity from Alt Hold, or the target step per tick from Rescue.
- **Output:** offset = (P + I − D + F + hover − 1000) / max(cos tilt, 0.5); throttle = clamp(1000 + offset, ap_throttle_min, ap_throttle_max).
- The µs value is mapped to 0–1 and replaces the mixer throttle.

### 3.3 Position controller

It runs on each new GPS sample, with separate east and north PIDs in the earth frame.

- **Error:** `dist` = the vector from the current position to the target (cm).
- **P** = dist × ap_position_p × 0.0012 (degrees).
- **I** accumulates dist·dt outside the stopping phase. I = Σ × ap_position_i × 0.0001. It leaks with a 2.5 s time constant while the sticks are active.
- **D.** Velocity = Δdist × rate, PT1 at `ap_position_cutoff`/100 Hz (0.8 Hz). D = v × ap_position_d × 0.0015.
- **A.** Acceleration = Δv × rate, PT1 again. A = acc × ap_position_a × 0.0008.
- **Defaults:** P, I, D and A = 30; `ap_max_angle` = 50°.
- **Limits:**
  - the D + A vector is limited to 35°;
  - after the sticks are released, a "stopping" phase uses D × 1.6;
  - when the velocity changes sign on an axis, that axis's target resets to the current position.
- **Output.**
  - The earth-frame sum is rotated into body pitch and roll by IMU yaw, then limited to ap_max_angle.
  - It is upsampled to 100 Hz through a 5 Hz PT3.
  - It replaces the stick angle, with the angle limit raised to 85°.
- **Sanity check.** If the distance to the target exceeds max(10 m, 2 s × ground speed at entry), Pos Hold stops and shows `POSHOLD FAIL` until it is re-entered.
- **GPS loss.** The controller stops updating and shows `POSHOLD FAIL`; the vehicle stays in angle mode. It resumes toward the original target when sensors recover. Alt Hold continues on baro.

### 3.4 Priority

1. FAILSAFE and GPS Rescue override everything.
2. GPS Rescue suppresses Alt Hold and Pos Hold.
3. Pos Hold, Alt Hold and failsafe force angle mode.
4. Alt Hold and Pos Hold can be active together.
5. A stage-2 failsafe with AUTO-LAND uses Alt Hold to descend, while Pos Hold holds position.

---

## 4. OSD

| Element | Source |
|---|---|
| GPS speed | Receiver ground speed. Shows "-" without a fix. |
| GPS satellites | Satellite count (optionally pDOP). Critical colour without a fix or below 4 satellites; warning colour below `min_sats` when rescue is configured. |
| Latitude, longitude | Position. Blinks after a fix is lost. |
| Home direction | Home bearing − IMU yaw, as an arrow. "-" without a fix or a home. |
| Home distance | Distance to home |
| Altitude, vario | The altitude estimate (GPS MSL while disarmed), and the vario |
| Heading, compass bar | IMU yaw |

**Flight-mode text**, in priority order: `!FS!` > `RESC` > `POSH` > `ALTH` > `ANGL` > `AIR` > `ACRO`.

**Warnings.**

| Warning | When it shows |
|---|---|
| `RESCUE N/A` | Blinking. Armed, rescue configured, a home set, but rescue not available: no fix or fewer than 4 satellites for 2 s. |
| `RESCUE OFF` | Blinking, for the first 3 s after arming, when rescue is configured but there is no home. |
| `POSHOLD FAIL` | Pos Hold requested, but its sensors are not OK or its sanity check has tripped. |

---

## Not verified

- The exact receiver message conditions that count as a 3D fix.
- Whether the 1.5 s stage-1 time includes the 300 ms hold.
- The Pos Hold output after a mid-hold GPS loss: the last angle may persist in the output filter.
- `master` has an unreleased Kalman filter position estimator. It is not part of this baseline.
