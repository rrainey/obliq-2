# obliq-2 Change Log

## What's New in 3.8.3

Two defects in the C code generator are fixed, and the full test suite passes again. Thirty tests failed before this release. **The generated code of the FPV Vehicle does not change.** You do not have to export the model again.

- **Fixed: a Source block that uses a vector or matrix model parameter gave C code that did not compile.** The Source block reads each parameter as `PARAM_<name>`, but the model header defined that name only for scalar parameters. The compiler reported `PARAM_<name>` as undeclared. The header now defines it for vector and matrix parameters also.
- **Fixed: a `float` value that is a whole number gave an invalid literal.** The value `1` was written as `1f`, which C does not accept. It is now `1.0f`. This applied to scalar, vector and matrix `float` parameters, and to `float` initial values.
- **New test: parameter code is compiled.** `parameter-code-generation.test.ts` compiles the generated code of six parameter types with `gcc -std=c99`. A check of the text cannot find code that does not compile. The test does not run when `gcc` is not installed.
- **Tests corrected.** These tests expected the output of earlier versions of the generator. The generator was correct.
  - `source-block-parameters` and `feature3-type-propagation`: a Source block reads `PARAM_<name>`, and a literal constant is set one time in `_init`.
  - `codegen/parameter-code-generation`: the storage of a vector or matrix parameter is in the `.c` file. The header declares it as `extern`.
  - `divide-block`: the operands of a division are in parentheses.
  - `codegen/segregated-subsystem`, `codegen/subsystem-reference-codegen` and `codegen/subsystem-reference-larger-model`: the field of a subsystem instance has the parent path and the block name, for example `Blade_Blade`. The name generation does not change in this release.
  - `transfer-function-howlett-servos`: the test compared the text `3125`, but `1 / 0.00032` is `3124.9999999999995` as a `double`. It now compares the number.
- **Test harness corrected: `integration/code-generation/code-compilation`.** All models compiled and ran, but the Docker container left a build folder that `root` owned, and the test could not remove it. The container now removes that folder when it stops. The test also removes such a folder from an earlier run before it starts.
- **Removed: `uh60-import-smoke.test.ts` and `scripts/smoke-uh60-import.ts`.** They read a UH-60 rotor model from a different repository. That model is obsolete.

## What's New in 3.8.2

You can now make a PDF of a model from the command line. The PDF has the same pages as **Export as PDF…** in the editor. Each shipped reference model now has a PDF beside it.

- **New command: `npm run obliq:pdf -- model.json`.** It writes `model.pdf` beside the model. Give more than one model to write more than one PDF. The command reads a bare model or a `{ name, data }` file, as `obliq:cgen` and `obliq:layout` do.
  - The options are the options of the editor dialog: `--page-size`, `--orientation`, `--scaling 100|50|fit`, `--fit-large-sheets`, `--scope model|subsystem|sheet` with `--sheet <name, id or path>`, `--summaries`, `--truncate-block-names` and `--truncate-in-block-text`. The defaults are the defaults of the dialog.
  - `-o` names the PDF file. With more than one model, `-o` names an existing folder.
  - The editor and the command use the same code, `src/lib/export/modelPdf.ts`. The wire types come from the same type propagation, so vector and matrix wires have two or three lines.
  - A model reference resolves as for `obliq:test` and `obliq:cgen`: the model files in the same folder, by name, then the store. The PDF shows the reference as its block, as in the editor. If the command cannot find the referenced model, it stops with exit code 1.
  - The command prints diagrams only. The plot results of the editor come from a simulation run in the browser, and the command does not simulate.
  - The command prints text in place of the symbols that Helvetica does not have (`SUM` for `∑`, `INT` for `∫`). The editor draws these symbols as small images.
  - `npm run obliq:pdf -- --help` lists the options. README.md, "Command-line PDF export", has the table and examples.
- **Reproducible PDFs.** `--date <ISO 8601>`, or the `SOURCE_DATE_EPOCH` environment variable, sets the footer date and the PDF creation and modification dates. The footer then shows the date in UTC. Two runs with the same date give the same bytes, in each time zone and locale. Node 18, 20 and 22 gave the same bytes. A PDF from pdf-lib has no document ID, and the standard fonts are not embedded, so nothing else in the file changes from run to run. Without a date, the command uses the current time, as the editor does.
- **Shipped PDFs.** `reference-models/` has a PDF of each model:

  | File | Pages | Page size | Size |
  |---|---|---|---|
  | `fpv-vehicle.pdf` | 28 | ARCH E (36 × 48 in), landscape | 514 KiB |
  | `fpv-demo-flight.pdf` | 5 | Tabloid (11 × 17 in), landscape | 21 KiB |
  | `fpv-acro-rate-step.pdf` | 5 | Tabloid (11 × 17 in), landscape | 13 KiB |

  Each sheet prints at 100 %. A sheet that is larger than the page is scaled to fit (**Scale large sheets to fit the printing area**). On ARCH E, the smallest scale is 36 % (`GpsRescue`), and Main prints at 100 %. On Letter, the default page, "fit" scales `GpsRescue` to 8 %, and 100 % cuts most vehicle sheets.
  - The builder (`scripts/build-fpv-reference-model.ts`) writes the PDFs after it writes the models. Their options and date are `SHIPPED_PDF_OPTIONS` and `SHIPPED_PDF_DATE` (12 Nov 2026). The date is a constant, so a build that does not change a model does not change its PDF.
  - `__tests__/reference-models/fpv-pdfs.test.ts` fails if a PDF is missing or stale. It makes each PDF again from the committed model and compares the bytes.
  - Seeding imports only the `*.json` files of the folder. A new test shows that a PDF in the folder is not imported and does not cause an error.
- **PDF export fixes (editor and command):**
  - Long in-block text stays inside its block. An Evaluate expression breaks onto more lines. A number, such as a Gain of `1.3333333333333333`, gets a smaller font. The text is not shortened, so a search of the PDF still finds it. Before, the text went across the blocks and wires near it. This is more important now that the shipped models hide most block names. **Allow Text Truncation** still shortens the text to one line.
  - A sheet that is larger than the print area is cut at the edge of the area. Before, at 100 % it went over the footer and the page margins.
  - An Assert block prints `Assert`. Before, it printed `?`.
  - The PDF creation and modification dates are the print date. Before, pdf-lib set them from the clock.
- **Tests.** `__tests__/pdf-command.test.ts` covers the command: the page count for each scope, `--date`, the output paths, model references and the errors. `__tests__/pdf-export.test.ts` has tests for the fixes above.

## What's New in 3.8.1

The FPV Vehicle has no Telemetry sheet now. Its 41 Output Ports are on Main, each with a direct wire from the block output that computes it. **The ports, their order and the generated code do not change.** You do not have to export the model again.

- **The Telemetry sheet is removed.** Before, each vehicle output went from a Sheet Label Sink on Main to a Sheet Label Source on Telemetry, and from there to its Output Port. MAB guideline na_0011 advises against a Sheet Label Source that feeds an Output Port.
  - Removed: the Telemetry sheet, its 41 Sheet Label Sources, the 41 Sheet Label Sinks (`Tag_*`) on Main, and 82 wires. No other block, sheet or model read these labels.
  - Added: 41 Output Ports on Main and 41 wires. Each wire comes from the output that fed the `Tag_` sink of that signal.
  - The same change applies to FPV Vehicle No Mag in `test-models/fpv/`.
  - The single-file model of the builder (`buildFpvModel()`, for the native tests) also has its Output Ports and scopes on Main. The Battery scope is `BatteryVoltage`, because Battery is the name of the battery subsystem. A Sheet Label Sink stays on Main only for each of the 13 signals that its Tests sheet reads.
  - The FPV Demo Flight, FPV Acro Rate Step and the Tnn test models do not change: they keep their own Telemetry sheets of scopes.
- **What does not change, with the proof:**
  - The Input Ports and the Output Ports: the same names, order, data types and dimensions. The order comes from the order of the Output Port blocks in the model (`modelInterface()`). The builder adds them in the same order as before.
  - The generated code. `npm run obliq:cgen -- reference-models/fpv-vehicle.json --name fpv` gives the same files as for 3.8.0. Only the time stamps and the source path in `cgen-manifest.json` are different. This applies to `fpv.h`, `fpv.c` and `Motor_RR.c/h`, and also to FPV Vehicle No Mag. The flattener removed the label pairs before, so the Output Ports read the same signals.
  - Behaviour. FPV Demo Flight and FPV Acro Rate Step give the same values at each step (a hash of the inputs, outputs, signals, states and data stores after each of 10000 and 6000 steps). All Asserts pass as before: 19 and 6 in the shipped models, and the 27 test models in `test-models/fpv/`.
  - The test models need no change to their wiring.
- **The shipped and test models have new layout options.** The builder lays out `reference-models/` and `test-models/fpv/` with `SHIPPED_LAYOUT_OPTIONS`:
  - the defaults: ELK Layered, subsystem functions, mirrored return row;
  - also **Resize Subsystems** (maximum port spacing 40 px), subsystem port labels shown, and **Hide unnecessary block names** (the names of all blocks except subsystems are hidden);
  - not Tidy signal labels.

  The tests compare the files with the builder output, byte for byte, so the files always have this layout. Input Ports, Output Ports and Sheet Labels show their names inside the block, so they stay readable. Other blocks show only their symbol or their parameter, for example `INT` or `SUM`. To see the name of such a block, open it.
- **New layout rule: Output Ports beside their hosts.** On each sheet that has an Output Port, the layout also tries each Output Port beside the block output that drives it, as a satellite. On a mirrored return-row block, the Output Port is on its left. The layout keeps this result only when it has fewer crossings and no hard fault. Else the Output Ports stay in the right column. MAB guideline db_0042 permits this: Outports go on the right, but you can move them to prevent wire crossings. The command line has `--output-ports auto|column|beside` (default `auto`).
- **Fixed: a second tune changed the layout.**
  - The tune applied **Hide unnecessary block names** and **Subsystem Ports Labeling** after the layout. Thus the layout kept space for names that it then hid. The tune now applies them first.
  - With ELK, **Resize Subsystems** started from the current block positions. The fit now starts from the order of the block list. Thus the sizes do not depend on the positions.

  `npm run obliq:layout -- <file> --report` with the options of the builder now changes nothing on each shipped file.
- **Results.** FPV vehicle:

  | Value | 3.8.0 (29 sheets) | 3.8.1 (28 sheets) |
  |---|---|---|
  | Wires through blocks, overlaps, small steps | 0 | 0 |
  | Crossings | 3544 | 3257 |
  | Bends | 3570 | 3566 |
  | Straight wires | 561 | 582 |
  | Total sheet area | 139.5 Mpx | 133.4 Mpx |
  | Main sheet | 84 crossings, 2562 × 2514 px | 84 crossings, 2627 × 2088 px |

  Without the new rule, Main has 161 crossings and is 2569 × 3760 px, because 41 long wires go to the right column.
- **Costs:**
  - The rule puts crossings first. On FlightController, GpsRescue, Frame and Battery, fewer crossings come with more bends (+90, +38, +12 and +4). Five sheets are wider and less high. PosHold (+3.5 %) and Frame (+1.5 %) have a larger area.
  - The Main sheets of FPV Demo Flight and FPV Acro Rate Step are larger, because Resize Subsystems makes the Vehicle block taller. In `test-models/fpv/`, T11 and T20 have 68 crossings; they had 67.
  - Slower layout: about 5.8 s for the whole FPV vehicle; it was 3.3 s. Tidy signal labels takes about 60 s.
- **`docs/layout-engine-comparison.md`, "3.8.1 results"** gives all measurements, with the maximum port spacing (40, 50 and 60 px) and the sheets that change.

## What's New in 3.8.0

**Tune Model Layout** has a new default engine, ELK Layered. No wire goes through a block, and control loops read controller, actuator, plant, with the sensors on a mirrored row below. **The shipped FPV models have a new layout, but their blocks, wires, parameters and behaviour do not change.** Simulation and generated code are the same.

- **New default layout engine: ELK Layered** (`elkjs`). The engine of earlier releases stays available as **Classic** in the dialog and as `--engine classic`. On the 29 sheets of the FPV vehicle, ELK has:
  - 0 wires through blocks (Classic: 529) and 0 overlaps between wires of different nets (Classic: 277);
  - 3544 crossings (Classic: 5425), and 561 straight wires (Classic: 226).
- **Leaf blocks beside their ports.** Sheet Labels, constants, displays and other blocks with one wire go beside the port that they connect to, on its row. When they do not fit in one column, the layout staggers them across sub-columns. On a sheet with constants, the layout also tries the sheet with the constants as usual blocks. It keeps the result with fewer crossings. If the crossings are equal, it keeps the result with fewer bends, then shorter wires, then a smaller sheet. A sheet with only small independent parts, such as Telemetry, becomes a grid: Telemetry is 1406 × 1064 px; it was 376 × 5824 px.
- **Subsystem Function.** A subsystem and a model reference have a new property, **Subsystem Function**: Controller, Actuator, Plant, Sensor, Compensator or Other. When it is not set, the dialog suggests a value from the name, the content and the position in the loop. Simulation and code generation do not use it. The Model Builder API and the MCP server accept it as `subsystemFunction`.
- **Signal-flow order from the functions.** A control loop reads from left to right: controller, actuator, plant. Sensors and compensators are on the return path.
- **Mirrored return row and Flip Block.** With **Mirror feedback-path blocks** (on by default), the return path that a plant feeds goes on a flipped row below the forward path. To flip a block yourself, right-click it and choose **Flip Block**. A flipped block has its inputs on the right and its outputs on the left. The flip has no effect on simulation or code generation. **An earlier version of the editor ignores the flip** and draws the block unflipped.
- **Minimum subsystem height.** The layout grows a subsystem whose ports are nearer than 20 px to each other. On the FPV vehicle, FlightController grows from 180 px to 460 px.
- **Port-name clearance.** When a block shows its port names, no wire turns through the names.
- **No small steps in wires.** Each laid-out wire is straight, or its bends are at least 2 px apart. Before, 276 wires of the FPV vehicle had a step of less than 2 px, because each block position was rounded on its own. The score has a new hard metric, `microJogs`.
- **Tidy signal labels** (new, off by default). This adjustment changes the model: it replaces long wires that cross many other wires with Sheet Label pairs. Simulation and generated code do not change. On the FPV vehicle it makes 38 edits and decreases the crossings from 3538 to 3017. It is slow on large models: about 30 s for the FPV vehicle. The shipped models do not use it.
- **Hop marks and junction dots.** Where wires of two nets cross, the canvas and the PDF export draw a small hop. A dot shows where a net divides.
- **New command: `npm run obliq:layout`.** It applies the layout to a model file (`-o` or `--in-place`), or prints a layout score for each sheet (`--report`, `--json`). It has all options of the dialog. See the README, "Command-line layout".
- **The Tune Model Layout dialog shows work in progress.** After you select **Tune Now**, the dialog stays open, shows "Tuning the layout" and locks its options. It closes when the tuning is complete.
- **Fixed: block dialogs dropped parameters when you saved them.** A save removed `showName` from each block, and `width`, `height` and `sampleTimeSec` from a subsystem. The dialogs now keep these parameters and `flipped`.
- **Waypoints follow block moves.** When you move or resize a block, the editor moves the waypoints of its wires to the new port positions. If a wire cannot keep its shape, the editor removes the waypoints and draws the default shape.
- **New dependency: `elkjs` 0.12.1**, licence EPL-2.0 OR GPL-3.0-or-later. The editor loads it only when a layout uses ELK (a separate chunk of 1.49 MB, 441 kB with gzip).
- **The shipped FPV models are laid out again** with the new default (not with Tidy signal labels or Resize Subsystems). Only block positions, wire routes, subsystem heights, the flip and the sheet extents change. FPV vehicle, 29 sheets:

  | Value | 3.7.2 | 3.8.0 |
  |---|---|---|
  | Wires through blocks | 528 | 0 |
  | Overlaps | 269 | 0 |
  | Crossings | 5442 | 3544 |
  | Straight wires | 229 | 561 |
  | Bends | 3304 | 3570 |
  | Total sheet area | 120.4 Mpx | 139.5 Mpx |
  | Main sheet | 2136 × 4474 px | 2562 × 2514 px |

  The crossings of FPV Demo Flight go from 11 to 0, and of FPV Acro Rate Step from 2 to 1. The files in `test-models/fpv/` have the same new layout, with the same limits: only layout data changes.
- **Costs:**
  - More bends: 8 % more on the FPV vehicle, because a wire that goes around a block turns four times.
  - Larger sheets on some models: the total area of the FPV vehicle is 16 % larger. GpsRescue is 8510 × 6279 px; it was 9594 × 2744 px.
  - Slower layout: about 3.2 s for the whole FPV vehicle, against 0.4 s with Classic. The editor does not respond during a layout. A layout of one sheet takes at most 0.7 s (GpsRescue).
- **`docs/layout-engine-comparison.md`** gives all measurements, and `docs/layout-improvement-plan-pass-2.md` gives the plan and the deferred items.

## What's New in 3.7.2

GPS Rescue on the FPV Vehicle is steadier. Pitch was unsteady in FLY_HOME, and pitch and roll were unsteady in DESCENT and LANDING. **The ports do not change, but flight traces do.** Export the model again for each host.

- **New rescue settings.** The algorithm stays as in Betaflight, so a pilot can set the same values on a real quad.
  - `gps_rescue_velocity_p / i / d`: 4 / 30 / 4 (Betaflight: 8 / 40 / 12)
  - `gps_rescue_pitch_cutoff`: 50 (Betaflight: 75)
  - `gps_rescue_roll_mix`: 50 (Betaflight: 150)
- **Results**, the mean of seven airframes in calm air:
  - FLY_HOME pitch jitter is 0.54°; it was 1.49°.
  - DESCENT pitch and roll jitter are 1.11° and 0.29°; they were 2.28° and 0.82°.
  - LANDING pitch and roll jitter are 0.64° and 0.39°; they were 1.86° and 0.77°.
- **Costs:**
  - The largest landing distance in a 5 m/s wind is 13.6–15.0 m; it was 9.0–11.1 m. In calm air it is 4.8 m; it was 4.4 m.
  - Without a magnetometer, FLY_HOME takes longer: 11.3 s instead of 9.3 s on the baseline, and 18.0 s instead of 9.0 s at 1.15 kg.
- **Not changed:** DESCENT starts with a flare from about −16° to +9°, as in Betaflight.
- **`fpv-tuning.test.ts`** now flies the rescue on all seven airframes.
- **Test changes:**
  - T13a climbs higher, because DO_NOTHING reached the ground before ABORT. Its tilt limit is 7° (measured 5.7°), and its upright check ends at ABORT.
  - T20 runs for 66 s, and its speed limit is 10 m/s (measured 9.6 m/s).
- **`docs/fpv-hud-gnss-plan.md`, "Rescue tuning"** gives the causes and the measurements. It also records receiver Doppler velocity as a possible improvement for future flight software of our own. Betaflight does not use it, so this model does not.

## What's New in 3.7.1

The C code download and `npm run obliq:cgen` now deliver the same project, from the same code. **Generated code changes for a model with a declared data store or a name that C does not allow, if you exported it from the editor.** Export such a model again.

- **Fixed: the download lost the initial values of declared data stores.** A store declared with 5.0 started at 0, with no warning. The command line was correct.
- **Fixed: the download did not compile for some model names.** For `2nd-stage.v1`, the zip file was `2nd-stage.v1.h`, but the code included `_2nd_stage_v1.h`. The download now uses the same C-safe name as the command line.
- **Fixed: the zip's README had invalid C for a name with a space**, such as `#include "FPV Vehicle.h"` and `FPV Vehicle_t model;`. It now uses the real names and calls `seed_from_inputs`, and a test compiles and runs its example.
- **The command line now expands model references**, from the model files beside the model file by name, then from the store, as `npm run obliq:test` does. It stopped with an error before.
- **One inventory.** Both now give the model and module sources, `CMakeLists.txt`, `smoke_main.c`, `cgen-manifest.json`, `library.properties` and `README.md`. `src/lib/codegen/cProject.ts` builds them, and `__tests__/cgen-project-parity.test.ts` runs both on the same models and compares the results.
- **`smoke_main.c` compiles only under `CMakeLists.txt`.** PlatformIO compiles every source in a library's folder, so its contents are guarded by `OBLIQ_SMOKE_MAIN`. It now also calls `seed_from_inputs`.
- **`--dt` now defaults to the model's simulation step**, else 0.005. It sets only the step in `smoke_main.c` and the README.
- **Fixed: the automations API's `generateCode` action** dropped parameters and data stores, and listed segregated modules as `undefined.c`.
- **The README's "Code Generation" section documents the command line** and the inventory.

## What's New in 3.7.0

The FPV Vehicle now has Betaflight's RPM filter and dynamic notch, and airframe vibration on its IMU. At hover, the filters reduce motor activity from 30‰ to 2.45‰ of full command. **The ports and `--dt 0.0005` do not change, but flight traces do.** Export the model again for each host.

- **New block: Notch Filter.** A second-order notch whose centre frequency and depth can change on every sample. It uses a state-variable form, which stays valid when the frequency moves.
- **New block: Spectrum Peaks.** Tracks the strongest frequencies in a signal with a sliding DFT, to drive Notch Filter blocks. It re-implements the behaviour of Betaflight's dynamic notch analysis.
- **RPM filter and dynamic notch**, with Betaflight's defaults. The gyro chain is now LPF2, RPM filter, LPF1, dynamic notch.
- **The FPV controller and IMU run at 2 kHz; they ran at 1 kHz.** Betaflight turns the dynamic notch off below 2 kHz. Faster rates gave no measured benefit. The plant step stays at 500 µs.
- **Airframe vibration is on with modelled sensors.** It has three rotor harmonics, a little broadband motion and a 225 Hz frame resonance. All amplitudes grow with rotor speed squared. To turn it off, set `vibration: false` in the builder.
  - The values are estimates scaled from one public 4S 5-inch log, so use them as an order of magnitude.
  - With the log's filter settings, the model removes 14–21 times the vibration (log: 8–21 times), and its motor activity is 3.9–5.3‰ (log: 4.5–6.3‰).
- **Fixed: the attitude estimator read raw sensors.** As in Betaflight, it now reads the filtered gyro and a 25 Hz PT2 of the accelerometer. The rescue's impact check also reads the low-passed accelerometer.
- **Fixed: the MCP server's Random Noise description** still gave the density formula from before 3.6.0.
- **The rate tune stays the same, and the notch filters' lag has a cost.** Baseline roll overshoot is 18.1%; it was 16.2%. The loop first goes unstable at 8× gain; without the notch filters it does so at 14×. The worst full-battery overshoot is 24.7%, and the test limit is 25%.
- **`fpv-tuning.test.ts`** now compares the vibration source with the log, and checks that the notch filters remove at least 8 times the vibration on all seven airframes. The settling limit is now 200 ms: a step undershoots by about 5%, so this metric can jump by about 40 ms for a 1% change.
- **The model runs about 30% slower**, at about 22 times real time on the development machine.

## What's New in 3.6.0

The FPV Vehicle's IMU path now agrees with the ICM-42688-P datasheet, and one set of gains is tested across mass configurations. **The ports do not change, but flight traces do.** Export the model again for each host.

- **The Random Noise block's noise density is now one-sided.** The block uses σ = N/√(2·Ts), the datasheet convention (RMS = N·√bandwidth). It used σ = N/√Ts, and its output was √2 too high. **A saved model that uses density mode changes:** multiply its density by √2 to keep the old noise. For a two-sided value, such as an Allan-deviation coefficient (Kalibr's N), multiply by √2.
- **The FPV IMU has an anti-alias filter.** The new `ImuFrontEnd` subsystem adds noise at the plant step and applies a 2nd-order 258 Hz low-pass filter to the gyro and the accelerometer. This agrees with the datasheet and Betaflight's default. Motor noise at hover falls from 0.78‰ to 0.45‰. The filter adds about 0.87 ms of lag, and the gain at which the loop first goes unstable falls from 18× to 12×.
- **An IMU faster than the controller no longer adds noise.** As in Betaflight, `gyro_lpf2` runs on each gyro sample when `SENSORS.imu.ts` is less than `FC.ts`. The shipped rate stays at 1 kHz.
- **TPA is modelled**, with Betaflight's defaults: D only, 65% rate, 1350 µs breakpoint. The baseline hovers at 1438 µs, so D is 9% lower at hover. Roll overshoot is 16%; it was 14%.
- **Tuning across mass configurations.** Seven airframes from 0.67 kg to 1.15 kg fly with the same gains. The gains do not change. Overshoot stays below 23% on a full battery, and the loop first goes unstable at 12× gain or higher. At 20% charge, the worst measured overshoot is 25.7%, and the test limit is 30%.
  - `fpv-tuning.test.ts` enforces the limits, and `scripts/fpv-tuning-sweep.ts` prints all the tables.
  - The builder has `AIRFRAMES`, `airframeWith()`, `hoverThrottleFor()` and `withFpvVariant()` for these studies.
- **Rotor vibration is available for studies.** The `vibration` option adds rotor-synchronous motion to the IMU input. It is off in the shipped models, because RPM and dynamic notch filters are not modelled yet. A level of 1 deg/s per rotor gives about 14 times the motor noise of the sensor noise. The filters are the next work.
- **Sensor mode `'noiseless'`** keeps the IMU's filter lag and has no noise, for measurements of loop stability.
- **Corrected:** the documented roll "t90 15 ms" is measured from the end of a 50 ms stick ramp. From the start of a 1 ms stick move, t90 is about 39 ms.
- **`CLAUDE.md`** now says that sensor fidelity is a key goal of the reference model.

## What's New in 3.5.1

- **GPS Rescue start gate, documented correctly** (issue #4). A rescue that starts within 5 m of home with `alt_est` below 4 m (`ap_landing_altitude_m`) aborts and disarms at once. This applies in the air too: `alt_est` is the height above the arming point, so a hover trimmed or armed at home reads about 0. The model already did this, as Betaflight 2025.12 does. The 3.5.0 notes and the obliq-fpv-unity hand-off said that only a start on the ground aborts. A new test model, T12c, checks the abort from a 2.5 m hover near home. T12b now checks that its start, also within 5 m of home, is above 4 m, so it climbs.
- **Fixed: the Jest runner for the FPV test models skipped T12a–T12c and T13a–T13c.** Its file pattern did not accept a letter after the number. These models ran only with `npm run obliq:test`. The runner now checks that it finds every test model the builder writes.
- **`scripts/obliq-cgen.ts` records more in `cgen-manifest.json`:**
  - `inputs` and `outputs`: each port's name, C type and dimensions, from the generated header;
  - `generator`: the obliq-2 version and git commit, and `dirty` if the generator or the model differs from that commit;
  - `files`: now includes segregated subsystem modules, such as `Motor_RR.c`.

  A host can check an export against its interface from the manifest alone.
- **Dependencies:**
  - removed `@pdf-lib/fontkit` and `undici` (unused) and `@types/katex` (`katex` has its own types);
  - `lucide-react` replaced by `@tabler/icons-react`, which the rest of the app uses;
  - `dotenv` moved to devDependencies, and `@jest/globals` is declared;
  - `package-lock.json` regenerated: patch and minor updates, including Next.js 15.5.28 and React 19.3.1.
- **`CLAUDE.md`** gives coding agents two rules: write documents in ASD-STE100 Simplified Technical English where practical, and put unit suffixes on model signal names (issue #3 lists the FPV Vehicle names to change).

## What's New in 3.5.0

The FPV Vehicle becomes a Betaflight 2025.12 quad with GNSS, for hardware-in-the-loop simulation: a GNSS receiver, Betaflight's failsafe, altitude estimate, Altitude Hold, Position Hold and GPS Rescue, OSD outputs, tuned controllers, and a validation suite of 26 test models.

- **Breaking for hosts that embed the FPV Vehicle's generated C.** `sticks` has 8 channels; there are five new inputs (`gnss_env`, `grid_convergence_deg`, `rc_link_valid`, `failsafe_procedure`, `wind_ned`), which a host must write before seeding and on every step; `altitude_est` is replaced by `alt_est`; arming is latched; and a hover trim must write new states. `docs/fpv-hud-gnss-plan.md` ("Embedded model integration") lists each input, output and state.
- **The FPV vehicle is at Prairie Creek Park, Texas, and its NED origin is 0 m MSL.** It was at Tri-County Aerodrome (48TX). Altitude MSL is −z. The field plane is the terrain database's origin cell, z = −178.133 m, and the vehicle rests 1 mm into that plane. The barometer and the altitude estimate still start at the field elevation. The magnetic field is WMM2025 at the park, evaluated at the field's height above the ellipsoid.
- **The FPV Vehicle has two more inputs:** `gnss_env` (GNSS conditions: satellites, HDOP, VDOP and a UERE scale) and `grid_convergence_deg` (the angle between true north and the terrain's UTM grid north). Test models feed them from a new Conditions subsystem that schedules them over time like the Pilot's sticks.
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
- **FPV validation suite.** `test-models/fpv/` holds test models run with `npm run obliq:test -- test-models/fpv/t*.json`, with its own copy of the vehicle. T03–T05 check the GNSS receiver's error statistics, fix rules and course, T06 grid convergence, T07 arming, T08 failsafe, T09 AUTO-LAND, T16–T19 the holds and the heading without a magnetometer, T21 the altitude estimator and T22 wind. T10–T14 and T20 fly GPS rescues: by switch and by failsafe, switched off, too close, losing satellites, without a home, into a wind it cannot beat, and without a magnetometer. T23 steps through every flight mode and checks the OSD outputs. T00 checks the Tests-sheet helpers that later test models use: event latches, first-event times, running extremes, windowed mean square and correlation, values captured at an event, and gated means.

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