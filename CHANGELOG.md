# obliq-2 Change Log

## Unreleased

- **The FPV vehicle is at Prairie Creek Park, Texas, and its NED origin is 0 m MSL.** It was at Tri-County Aerodrome (48TX). Altitude MSL is −z. The field plane is the terrain database's origin cell, z = −178.133 m, and the vehicle rests 1 mm into that plane. The barometer and the altitude estimate still start at the field elevation. The magnetic field is WMM2025 at the park, evaluated at the field's height above the ellipsoid.
- **The FPV Vehicle has two more inputs:** `gnss_env` (GNSS conditions: satellites, HDOP, VDOP and a UERE scale) and `grid_convergence_deg` (the angle between true north and the terrain's UTM grid north). They prepare for the GNSS receiver. Test models feed them from a new Conditions subsystem that schedules them over time like the Pilot's sticks.
- **The FPV Vehicle uses the grid convergence.** The magnetometer reads the WMM field rotated from true north into the terrain's grid frame, and the attitude estimator's reference is rotated the same way, so its yaw stays on the grid yaw like the true state. A new output, `heading_deg`, is true heading (estimated yaw plus γ, 0–360°).
- **The FPV Vehicle has a GNSS receiver** (10 Hz, u-blox M10 class). Its error is DOP × UERE: a slowly varying part (60 s correlation) plus a fast part, scaled by the `gnss_env` inputs, giving about 1.4 m CEP in open sky. Both parts change smoothly, as a receiver's navigation filter reports them: successive fixes differ by about 2.5 cm, so speeds differenced from positions (as Betaflight's Position Hold and GPS Rescue use) carry about 0.25 m/s of noise, not 1.7 m/s. New outputs:
  - `gnss_pos`: grid north and east in metres, and altitude MSL, to 1 cm;
  - `gnss_vel_ned`: true-north velocity, to 1 cm/s;
  - `gnss_fix`: fix type, satellites and pDOP. The fix is 3D with 4 or more satellites, 2D with 3 (altitude held), and none below that, with outputs held; a lost fix returns 1 s after its satellites do;
  - `gnss_course`: track made good (true and magnetic), ground speed, and whether the track is valid. Below 0.5 m/s the track is not valid and holds.
- **The FPV flight controller publishes the values a Betaflight OSD shows:**
  - `fc_armed`, `fc_angle_mode` and `fc_airmode`;
  - home, taken from the GNSS fix only when the quad arms, and only with a 3D fix and at least 8 satellites, as Betaflight does. It is cleared on disarm;
  - `home_distance_m` and `home_bearing_deg` (true), updated on each fix;
  - `battery_mah_drawn`.

  The Demo Flight's Tests sheet checks them, with 19 Asserts.
- **FPV Vehicle: 8-channel sticks, failsafe, latched arming and wind.**
  - `sticks` has 8 channels; AUX3 is a GPS Rescue switch and AUX4 a 3-position hold switch.
  - New inputs:
    - `rc_link_valid`;
    - `failsafe_procedure` (0 drop, 1 auto-land, 2 GPS rescue);
    - `wind_ned`, which acts through the frame's drag.
  - Failsafe follows Betaflight:
    - stage 1 holds the last sticks for 0.3 s, then centres them with the throttle low, and recovers the moment the link returns;
    - stage 2 runs the procedure 1.5 s after the loss.
  - Arming follows Betaflight. It arms on the switch's rising edge, and is refused with the throttle up, with a rescue or hold switch on, on the first arming without a 3D fix and 8 satellites, or without a link. After a forced disarm the switch must be cycled.
  - New outputs: `fc_mode` (the flight-mode text), `fc_warnings` (bits) and `failsafe_stage`.
- **The FPV altitude estimate is Betaflight's.** It blends baro and GPS altitude at 100 Hz, trusting GPS by 1/pDOP and less when the two disagree, through a 3 Hz filter. Like Betaflight's, it is relative to the arming point: `alt_est` reads 0 until arming. `vario_est` is its rate of change. They replace `altitude_est`, the previous baro/accelerometer filter.
- **FPV heading from GPS course over ground,** as Betaflight does without a magnetometer. The estimate snaps once to the GPS course at 1 m/s, then follows it with Betaflight's gain schedule. `gps_heading_ok` shows when the course has established the heading. A new build option, `magnetometer: false`, gives the common quad without a magnetometer; the validation suite includes one, "FPV Vehicle No Mag".
- **FPV Altitude Hold and AUTO-LAND,** after Betaflight 2025.12.
  - Altitude Hold (AUX4 at mid) holds the altitude the quad had when it engaged; the throttle stick climbs or descends at up to 5 m/s outside a deadband around hover. It engages only after the throttle has been raised.
  - The failsafe AUTO-LAND procedure now descends under Altitude Hold, lands, and disarms 60 s into stage 2. Before, it dropped.
  - Both use Betaflight's shared altitude controller.
- **FPV Position Hold,** after Betaflight 2025.12. With AUX4 high (Altitude Hold included) the quad holds its GPS position.
  - It brakes with a stopping phase, then holds against the wind.
  - Roll or pitch beyond 5% flies it; releasing the stick holds the new point.
  - It needs a 3D fix and a magnetometer, or a GPS heading established in flight when `posHoldWithoutMag` is set. Otherwise, or if pushed past its sanity distance, it shows `POSHOLD FAIL` and keeps its last angle, as Betaflight does.
  - AUTO-LAND now holds position while it lands.
- **FPV GPS Rescue,** after Betaflight 2025.12, from the AUX3 switch or as the GPS-RESCUE failsafe procedure.
  - It climbs to the flight's maximum altitude + 10 m, turns to home, flies home at 7.5 m/s, descends from 20 m out, lands and disarms on impact.
  - Started within 15 m of home it climbs to 10 m above where it is and pitches out first; on the ground at home it aborts at once.
  - Its sanity checks are Betaflight's: too few satellites, a fly-away (first disabling the magnetometer and steering by course over ground), no home, and a stalled climb or descent. With the switch it then does nothing for 20 s before disarming; in a real link loss it disarms at once.
  - A failsafe rescue ends only when the link is back and a stick moves past 30%.
  - New outputs `rescue_active` and `rescue_phase`; `fc_mode` shows RESC, and `fc_warnings` adds RESCUE N/A and RESCUE OFF. A new build option, `apThrottleMaxUs`, sets Betaflight's `ap_throttle_max`.
- **The FPV flight controller is tuned for this quad.** Betaflight's default gains suit no quad in particular; these are tuned using Betaflight's own settings, inner loop first.
  - Rate: I-term relax, which Betaflight runs by default, was missing; with it and D 40/46, a roll step overshoots 14% instead of 29%.
  - Angle mode: level strength 80 (was 50), about 40% quicker to a new angle.
  - Altitude Hold and the rescue's climbs: P 30, D 40, F 30 (were 15). The hold no longer swings ±2 m; it holds within about 0.3 m RMS.
  - Position Hold: P 40, I 60, D 40 (were 30), settling after a stop in about a third of the time.
- **Fixed: `gps_heading_ok` now latches once established, until the next arming,** as Betaflight's `canUseGPSHeading` does. Before, it decayed in a hover.
- **Fixed: a Demux fed by a subsystem named "Conditions" (or anything containing "condition") split its vector wrongly.** It copied only the first element and set the rest to 0, with no warning. A guard for mislabelled relational outputs matched the name; it now matches "condition" only as a whole name segment. Generated code for every stored model is unchanged.
- **Fixed: with ideal sensors the FPV attitude estimate became NaN** when the accelerometer read zero (free fall at the start of an airborne run). A zero vector now gives no correction instead of 0/0.
- **FPV validation suite.** `test-models/fpv/` holds test models run with `npm run obliq:test -- test-models/fpv/t*.json`, with its own copy of the vehicle. T03–T05 check the GNSS receiver's error statistics, fix rules and course, T06 grid convergence, T07 arming, T08 failsafe and T22 wind, and later models the altitude estimator, the holds and AUTO-LAND. T10–T14 and T20 fly GPS rescues: by switch and by failsafe, switched off, too close, losing satellites, without a home, into a wind it cannot beat, and without a magnetometer. T23 steps through every flight mode and checks the OSD outputs. T00 checks the Tests-sheet helpers that later test models use: event latches, first-event times, running extremes, windowed mean square and correlation, values captured at an event, and gated means.

## What's New in 3.4.0

- **Signal Display plots are drawn with uPlot (canvas), about 6× faster.** The FPV Demo Flight's Telemetry sheet (9 scopes, 10,000 samples each) now draws in about 0.2 s instead of 1.2 s.
  - **Hover:** the legend below each plot shows the time and every value under the cursor, with a cursor line. This replaces the floating tooltip.
  - **Legend:** click an entry to hide or show that line; the y range follows.
  - **Zoom:** drag across a plot to zoom in time; double-click to reset.
  - **Tick labels:** labels carry the decimals the range needs, so a small signal is no longer labelled "0.0".
  - **Lines:** vector lines are straight between samples, no longer smoothed splines that overshot between samples.
- **Plots in Export as PDF.** A new option, **Include plot results on sheets**, draws each sheet's Signal Display plots from the last run in a column on the right of its page.
  - Plots are vector graphics, with titles, ticks, grid and legends, and stay sharp at any page size.
  - Plots are stacked in the order of their blocks on the sheet.
  - When a sheet has more plots than fit, they continue on further pages for that sheet, each showing the diagram again.
  - Long series are reduced for printing without losing peaks: the FPV Demo Flight exports in about 180 KB.
- **The block palette is 15% narrower** (290 px), leaving more room for the canvas.
- **The admin API Metrics page works.** It now gets its data: the endpoint it reads was never implemented, and only failed requests and `getModel` calls were recorded. Every Model Builder request is now recorded.
  - Its charts are drawn with uPlot: hourly calls, errors and response time, and grouped bars per action.
  - **Clear Metrics** now uses a `DELETE` request.
- **Recharts is removed**; all charts use uPlot.
- **Fixed: vector Signal Displays and Loggers fed through sheet labels were plotted wrong.** Their elements were read as one interleaved signal, which showed as a single zig-zag line. Examples are the FPV Telemetry sheet's Position, RotorSpeed and Attitude scopes. They now plot one line per element, and CSV exports of them have one column per element.
- **Fixed: wire type labels that stayed on screen.** The label shown while hovering a wire now goes away when the pointer leaves the wire onto its block, slides off a drag handle, or finishes a segment drag elsewhere.
- **Fixed: models with subsystem references saved before 3.3.0 could fail to compile** ("no member named 'Motor_FR'"). Their saved references can have empty port lists. The editor repaired those lists on loading, but code generation reads the saved model file, so the references' outputs were left unresolved. Code generation now takes a reference's ports from its definition. Opening and saving such a model also repairs the file.
## What's New in 3.3.1

- **Feedback wires come into their port from the front.** A wire running back to an earlier block, such as the FPV Vehicle's sensor readings into the Flight Controller, used to turn halfway along, so its last segment crossed the target block from behind. **Tune Model Layout** now turns each feedback wire in the gap just in front of the block it feeds, on its own staggered track, so it enters its port on a short horizontal run. The shipped FPV Vehicle is re-laid out accordingly.
- **Blocks wired alike now line up in feedback loops.** To arrange a sheet with feedback loops, the layout treats one wire in each loop as feedback. It used to pick that wire by the order it happened to visit blocks, so identically wired blocks could land on opposite sides of a loop. In the FPV Vehicle, Motor_RR sat several columns left of the other three Motors. The feedback wire is now chosen by each block's distance from the sheet's inputs, and only wires that actually close a loop are considered. Identically wired blocks share a column, and the flow reads outward from the inputs: controller, motors, power mux, then the battery voltage looping back. The shipped FPV Vehicle is re-laid out accordingly.
- **Tune Model Layout resizes subsystems modestly.** **Resize Subsystems** used to grow subsystems until each port lined up exactly with its neighbour, often up to the 1,200 px cap. The FPV Vehicle's subsystems all reached it, 8–15× their natural height. Now:
  - A resize spreads ports at most **Maximum port spacing** apart: a new field in the dialog, 40 px by default, twice the natural spacing.
  - The height is fitted once, so a grown block no longer pushes its neighbours apart and then grows again to meet them.
  - Wires to neighbours shared with another subsystem are ignored, because no size could line them all up.
  - Each resize starts from the subsystem's natural size, so the result no longer depends on earlier sizes. A block made oversized by an earlier resize (or by hand) comes back down when nothing calls for the size, and resizing twice gives the same result.

  On the FPV Vehicle, the Flight Controller and Frame now reach 280 px and Sensors 200 px. The Motors, whose neighbours are all shared, settle at their natural 100 px, including copies left at 1,200 px by the old resize.
- **Dragging stacked wire segments prefers the highlighted net.** When wire segments lie on top of each other, the one under the pointer used to be whichever wire happened to be drawn last. Highlighted wires (**Highlight Connections**) are now drawn above the others, so you can highlight the net you want, then drag its segment.

## What's New in 3.3.0

- **Assert block** (Display & Logging): a test check that records whether its input ever left bounds, differed from an expected value, or was false. See [docs/model-testing-plan.md](docs/model-testing-plan.md) for the testing features this starts.
  - It checks once per time step, inside an optional time window. Vectors and matrices are checked element by element.
  - On failure it either records and continues, or stops the simulation.
  - Generated C keeps all check code behind `OBLIQ_ASSERTS`, so exported code has no test logic unless you define it. With it defined, the model reports each Assert's result: passed, failed or not checked, plus the first failure's time and value.
  - After a run, the toolbar shows how many Asserts passed. Clicking it opens a Test Results panel listing each Assert's status and first failure; clicking a row shows the block. Assert blocks show a pass/fail mark. Marks and summary fade once you change the model.
  - A run stopped by an Assert says which one and when, and plots end there.
  - The automations API's `simulate` action, and so the MCP `run_simulation` tool, returns Assert results.
- **Model references: test a model from separate test models.** A **Model Reference** block (Hierarchy) embeds another saved model.
  - **Ports:** the block's ports are the referenced model's top-level Input and Output Ports, so a test model drives the model's real interface. Many test models can embed the same model, each with its own inputs, duration, time step, integrator and Asserts.
  - **Versions:** a reference follows the model's latest save, or is pinned to a saved version. Its badge shows which, and flags a newer version or a missing model.
  - **Editing:** edit the referenced model in its own tab (**Open Model**). When you come back, test models reload it, and wires follow port names.
  - **Building:** simulation, Generate Code, the automations API and `obliq:test` all read the referenced model when they build. Its parameters join the test model's (a clash is an error naming both). Sheet labels never connect across the boundary, and references nest.
  - **Finding models:** a reference also records the model's name, so test models find their model after being imported or seeded with new ids.
  - **Warnings:** deleting a model that others use says which ones. Exporting a model with references reminds you to export those too.
  - **APIs:** the Model Builder actions `addModelReference` and `setModelReference`, and the MCP tools `add_model_reference` and `set_model_reference`.
- **The FPV reference model is now a vehicle and its test models.** New installations get:
  - **FPV Vehicle** (sticks in, telemetry out);
  - **FPV Demo Flight**: the original demo flight, scopes and 11 Asserts, embedding the vehicle;
  - **FPV Acro Rate Step**: a roll-rate step response with 6 Asserts.

  Existing installations can import `reference-models/fpv-vehicle.json`, then the test models, which find the vehicle by name. `npm run obliq:test -- reference-models/fpv-demo-flight.json` runs from the files without importing.
- **`npm run obliq:test`**: runs models' Assert blocks from the command line.
  - Name the models by name, id or JSON file path, or use `--all` for every stored model that has Asserts.
  - Each model is built natively with the host C compiler and runs with its saved duration, time step and integrator. A stop-on-failure Assert ends the run, as in the editor.
  - It prints a summary with each failure's time and value. `--json` gives machine-readable results, and `--junit <file>` writes JUnit XML for CI.
  - Exit code 0 means every Assert passed. 1 means one failed, was not checked, or a named model has none. 2 means a model could not be found, built or run.
- **Fixed: untyped outputs of multi-sheet subsystems.** An output fed by a sheet label from another of the subsystem's sheets was reported as "Unable to determine signal type".
- **Fixed: a spurious validation error for chained sheet labels.** This happened when a sheet label was fed by a subsystem output that was itself driven by a sheet label. The generated code was correct, but a leftover wire was reported as an invalid connection.
- **Fixed: runs could be one step short.** The step count was `floor(duration / step)`, which loses a step when the division comes out just under a whole number (0.3 / 0.1 = 2.9999…). Runs now use the rounded count. Server-side runs used `ceil` and could take an extra step; they now match.

## What's New in 3.2.2

- **Fixed: subsystem references losing their ports.** Opening a subsystem definition's sheet and returning cleared the port lists of every reference to it. The references still built and ran, because code generation takes ports from the definition. The editor, though, drew them without ports, and Validate reported "Unable to determine signal type" for each of their wires. Saving kept the damage.
  - References now always take their ports from their definition, including when ports are added inside it.
  - Models saved with cleared reference ports are repaired when opened, and the next Save stores the repair.

## What's New in 3.2.1

- **Subsystem names are easier to read.** A subsystem now shows its name inside the block, in large bold text (250% of the usual block-name size) centred below its icon.
  - A subsystem you haven't resized grows to fit its name: wide enough for one line, up to 260 px, wrapping beyond that.
  - A resized subsystem keeps its size, and the name wraps inside it. Resizing won't shrink it below what the name needs.
  - Hide Name returns it to the plain icon at the original size. Other blocks keep their small name above.
  - **PDF export** matches: subsystems print the cube icon (now as vector art, not the "Subsys" stand-in) with the bold name below it inside the block.
- **Fixed: black canvas on light-mode systems.** The page background followed the operating system's light/dark preference, with the condition inverted. On a light-mode OS the canvas showed black behind white blocks, and block names were unreadable. Page colours now follow the app's own light/dark setting.

## What's New in 3.2.0

- **FPV quadcopter reference model.** A 5-inch FPV quadcopter ships in `reference-models/` and appears in My Models on new installations. Existing installations can add it with **Import Model**. It is located at Tri-County Aerodrome (48TX), Texas, and includes:
  - motor/propeller subsystems with rotor-inertia torque, a 6-DOF quaternion frame, ground contact, and a 4S LiPo battery;
  - IMU, magnetometer (WMM2025 field) and barometer models with datasheet noise;
  - a Betaflight-style flight controller: acro and angle modes, rate PID with feed-forward, airmode mixer, arming, and Mahony attitude and altitude estimators.

  The default demo arms, takes off from the field, and flies angle-mode manoeuvres. Model outputs and scopes are on its Telemetry sheet. The model is generated by `scripts/build-fpv-reference-model.ts`; see [docs/fpv-reference-model-plan.md](docs/fpv-reference-model-plan.md) for the design and sources.
- **Reference models for new installations.** Every model in `reference-models/` is imported once when a new local store is created. Existing stores are never changed. `OBLIQ_REFERENCE_MODELS_DIR` points at another folder; an empty value turns this off.
- **Random Noise block.** Seeded Gaussian or uniform white noise, scalar or vector, held for a sample period.
  - Amplitude is a standard deviation or a datasheet noise density (σ = N/√Ts).
  - The generator is built into the generated C, so native and browser builds produce identical sequences.
- **RK4 is now fourth order throughout.** Previously, any state whose derivative passed through other blocks was integrated with forward Euler even when RK4 was selected. Each RK4 stage now re-evaluates the model at the stage state and time, then restores the step's values, so logged samples and discrete states are unaffected.
  - Results of existing models shift slightly. The Saturn IB S-IB altitude moves by at most 6 m at 130 s.
  - Simulation steps cost about 4× more model evaluation.
- **Atmosphere block uses the 1976 standard's formulae.** The U.S. Standard Atmosphere 1976 is now computed from its layer formulae (valid −5 to 86 km) instead of a coarse table. The table mixed geopotential and geometric altitudes and had wrong upper values. The outputs are, in order, temperature, speed of sound, pressure and density; earlier documentation listed them wrongly.
- **Fixes:**
  - Referenced (shared) subsystems with no parameters, and transfer functions inside segregated subsystems, generated C that did not compile.
  - Segregated subsystems' RK4 stages read the step's state instead of the stage state.
  - The editor could not type subsystem references, and typed array-valued integrators in feedback loops as scalars.
  - Sum mis-indexed column matrices. Magnitude assumed three elements and now accepts column vectors such as quaternions.
  - Validation warned about subsystems with no inputs, and its dialog repeated list keys.
  - Simulation failed to compile when a scope or output on one top-level sheet was fed by a sheet label from another.
  - Generated headers now define `M_PI` for strict C99 compilers.

## What's New in 3.1.1

- **Fixed: "Open Model" sometimes needing two clicks** when running `npm run dev`. Opening the editor made the dev server compile it on demand, and custom webpack chunking (meant for production builds) forced a full page reload that cancelled the navigation. The chunking now applies to production builds only, and the dev server keeps compiled pages for an hour.

## What's New in 3.1.0

- **Sheet overview map.** When the canvas shows less than the whole sheet (zoomed in, or a sheet larger than the window), an overview of the sheet appears in the bottom-right corner with the visible region outlined. Drag in it to pan, and scroll in it to zoom.
- **Fixed: spurious "Model updated from disk" after Save.** With large models, the save could finish before the file watcher reported it, and the editor mistook its own save for an outside change and reloaded. Outside edits are still detected.
- **Fixed: wire highlight and block selection showing together.** Selecting a block now clears a "Highlight Connections" net highlight.

## What's New in 3.0.0

Version 3.0.0 makes obliq-2 a **local, single-user application** and substantially improves diagram layout.

- **Supabase replaced by SQLite and plain files.** There is no database server, cloud project or login. Models are JSON files under `~/.config/obliq-2/`, indexed by a local SQLite database (`better-sqlite3`). Each **Save** keeps a version snapshot. Existing Supabase data can be imported with `npm run migrate:supabase` (see [Migrating from the previous Supabase backend](README.md#migrating-from-the-previous-supabase-backend)).
- **Models as files you can script against.** You can link a model file that lives in another repository. When a model's file changes on disk (a script, the Model Builder API/MCP, or another tab), the editor reloads it or offers **Reload / Keep mine / Save mine as new model**. The disk version is always kept in the version history.
- **Better automatic layout.** Gotos and Froms sit next to the blocks they connect to, blocks are ordered by the wires that feed them however far back, and wire turns are routed into separate tracks instead of stacking on top of each other (see [Diagram Layout](README.md#diagram-layout)).
- **Editor refinements.**
  - A wire's vertical segment can be dragged from anywhere along it.
  - Simulation settings are saved with the model and take effect on the next run.
  - Option descriptions appear on hover, focus or click.
  - The toolbar fits on one row, with exports grouped under **Export**.
- **Dependency updates.** Next.js 15.5.27 (security fix), Jest 30, and a large reduction in `npm audit` findings.