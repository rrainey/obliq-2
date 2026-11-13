# Reference models

Example models that ship with obliq-2.

- **New installations:** every `*.json` file here is imported once, as an ordinary model, when the local store is first created (`~/.config/obliq-2`, or `$OBLIQ_HOME`). Deleting one of these models does not bring it back.
- **Existing installations:** import a file with **My Models → Import Model**. Nothing is added automatically.

Each file uses the standard export format, `{ "name": ..., "data": { "sheets": [...] } }`.

Set `OBLIQ_REFERENCE_MODELS_DIR` to seed from a different folder. Set it to an empty string to start new stores empty.

## Models

| File | Model | Status |
|---|---|---|
| `fpv-vehicle.json` | **FPV Vehicle**: 5-inch FPV quadcopter. Motors, 6-DOF frame, battery, ground contact, IMU/magnetometer/barometer, and a Betaflight-style flight controller (acro and angle modes, arming, Mahony and altitude estimators) | Complete. Its inputs are the pilot's sticks (`sticks`, double[8]: roll, pitch, yaw, throttle, AUX1 angle, AUX2 arm, AUX3 GPS rescue, AUX4 hold), the GNSS conditions (`gnss_env`, double[4]: satellites, HDOP, VDOP, UERE scale), the grid convergence (`grid_convergence_deg`), the radio link (`rc_link_valid`), the failsafe procedure (`failsafe_procedure`: 0 drop, 1 auto-land, 2 GPS rescue) and the wind (`wind_ned`, m/s). Its 41 outputs (true state, sensor readings, commands, estimates, flight-controller flags, battery) are Output Ports on its one sheet, Main. Test models feed all but the sticks from a Conditions schedule. It is meant to be embedded by test models. See [docs/fpv-reference-model-plan.md](../docs/fpv-reference-model-plan.md). |
| `fpv-demo-flight.json` | **FPV Demo Flight**: a test model that embeds FPV Vehicle | Takes off from Prairie Creek Park, then flies a bank, a pitch and a yaw turn in angle mode. Telemetry scopes, and 19 Asserts on its Tests sheet. |
| `fpv-acro-rate-step.json` | **FPV Acro Rate Step**: a test model that embeds FPV Vehicle | A 75 deg/s roll-rate step and reversal in acro mode. 6 Asserts check the rate response, cross-axis coupling and return to level. |

The test models reference FPV Vehicle by name, so they find it after they are seeded or imported. The full validation suite is in [`test-models/fpv/`](../test-models/fpv/), which is not seeded: run it with `npm run obliq:test -- test-models/fpv/t*.json` (see [docs/fpv-hud-gnss-test-plan.md](../docs/fpv-hud-gnss-test-plan.md)). Run their Asserts from this folder with `npm run obliq:test -- reference-models/fpv-demo-flight.json reference-models/fpv-acro-rate-step.json`.

These files are generated: edit `scripts/build-fpv-reference-model.ts`, then run `npx tsx --tsconfig tsconfig.json scripts/build-fpv-reference-model.ts`. A test fails if the content of a committed file is different from the builder's output. The builder lays out these three files with **Tune Model Layout**: ELK Layered, with subsystem functions and the mirrored return row (the defaults), and also **Resize Subsystems** (maximum port spacing 40 px), subsystem port labels shown, and the names of all blocks except subsystems hidden. It does not use Tidy signal labels. These options are `SHIPPED_LAYOUT_OPTIONS` in the builder. The builder gives the files in `test-models/fpv/` the same layout. A test compares each file with the builder output, byte for byte, so the files on disk always have this layout.

## PDFs

Each model has a PDF of its diagrams beside it: `fpv-vehicle.pdf` (28 pages), `fpv-demo-flight.pdf` (5 pages) and `fpv-acro-rate-step.pdf` (5 pages). Each PDF has one page for each sheet, with the subsystem sheets in the order of the model. A model reference, such as the `Vehicle` block of the test models, shows as its block. Its sheets are in `fpv-vehicle.pdf`.

- `fpv-vehicle.pdf` uses ARCH E pages (36 × 48 in, landscape). The large sheets are scaled to fit the page, down to 36 % for `GpsRescue`. The other sheets print at 100 %. To read a dense sheet, zoom in: the PDF is vector graphics.
- The test models use Tabloid pages (11 × 17 in, landscape), with the same scaling rule.
- The footer date is 12 Nov 2026, 00:00 UTC. It is the date of the release that added the PDFs, not the date of the build.

The builder writes the PDFs after it writes the models, with `npm run obliq:pdf` code. The options and the date are `SHIPPED_PDF_OPTIONS` and `SHIPPED_PDF_DATE` in `scripts/build-fpv-reference-model.ts`. To make the PDFs again, run the builder (see above). Do not edit a PDF by hand. The test `__tests__/reference-models/fpv-pdfs.test.ts` fails if a PDF is missing, or if it is not the same, byte for byte, as the output of the builder.

Only `*.json` files are seeded. The PDFs and this README stay in the folder.

## Sources and licensing

Each model lists its sources in its own description. The models are re-implemented from published equations, datasheets and permissively licensed (MIT, BSD-3, Apache-2.0) references. No GPL code is translated.
