# Reference models

Example models that ship with obliq-2.

- **New installations:** every `*.json` file here is imported once, as an ordinary model, when the local store is first created (`~/.config/obliq-2`, or `$OBLIQ_HOME`). Deleting one of these models does not bring it back.
- **Existing installations:** import a file with **My Models → Import Model**. Nothing is added automatically.

Each file uses the standard export format, `{ "name": ..., "data": { "sheets": [...] } }`.

Set `OBLIQ_REFERENCE_MODELS_DIR` to seed from a different folder. Set it to an empty string to start new stores empty.

## Models

| File | Model | Status |
|---|---|---|
| `fpv-vehicle.json` | **FPV Vehicle**: 5-inch FPV quadcopter. Motors, 6-DOF frame, battery, ground contact, IMU/magnetometer/barometer, and a Betaflight-style flight controller (acro and angle modes, arming, Mahony and altitude estimators) | Complete. Its inputs are the pilot's sticks (`sticks`, double[6]), the GNSS conditions (`gnss_env`, double[4]: satellites, HDOP, VDOP, UERE scale) and the grid convergence (`grid_convergence_deg`); telemetry is its outputs. Test models feed the last two from a Conditions schedule. It is meant to be embedded by test models. See [docs/fpv-reference-model-plan.md](../docs/fpv-reference-model-plan.md). |
| `fpv-demo-flight.json` | **FPV Demo Flight**: a test model that embeds FPV Vehicle | Takes off from Prairie Creek Park, then flies a bank, a pitch and a yaw turn in angle mode. Telemetry scopes, and 11 Asserts on its Tests sheet. |
| `fpv-acro-rate-step.json` | **FPV Acro Rate Step**: a test model that embeds FPV Vehicle | A 75 deg/s roll-rate step and reversal in acro mode. 6 Asserts check the rate response, cross-axis coupling and return to level. |

The test models reference FPV Vehicle by name, so they find it after they are seeded or imported. The full validation suite is in [`test-models/fpv/`](../test-models/fpv/), which is not seeded: run it with `npm run obliq:test -- test-models/fpv/t*.json` (see [docs/fpv-hud-gnss-test-plan.md](../docs/fpv-hud-gnss-test-plan.md)). Run their Asserts from this folder with `npm run obliq:test -- reference-models/fpv-demo-flight.json reference-models/fpv-acro-rate-step.json`.

These files are generated: edit `scripts/build-fpv-reference-model.ts`, then run `npx tsx --tsconfig tsconfig.json scripts/build-fpv-reference-model.ts`. A test fails if a committed file drifts from the builder.

## Sources and licensing

Each model lists its sources in its own description. The models are re-implemented from published equations, datasheets and permissively licensed (MIT, BSD-3, Apache-2.0) references. No GPL code is translated.
