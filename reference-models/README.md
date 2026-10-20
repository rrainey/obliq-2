# Reference models

Example models that ship with obliq-2.

- **New installations:** every `*.json` file here is imported once, as an ordinary model, when the local store is first created (`~/.config/obliq-2`, or `$OBLIQ_HOME`). Deleting one of these models does not bring it back.
- **Existing installations:** import a file with **My Models → Import Model**. Nothing is added automatically.

Each file uses the standard export format, `{ "name": ..., "data": { "sheets": [...] } }`.

Set `OBLIQ_REFERENCE_MODELS_DIR` to seed from a different folder. Set it to an empty string to start new stores empty.

## Models

| File | Model | Status |
|---|---|---|
| `fpv-quadcopter.json` | 5-inch FPV quadcopter: motors, 6-DOF frame, IMU/magnetometer/barometer, Betaflight-style flight controller | Phases 0–4 complete: plant, acro flight controller, modelled sensors and estimators. v2 (angle mode, battery) planned. See [docs/fpv-reference-model-plan.md](../docs/fpv-reference-model-plan.md). |

`fpv-quadcopter.json` is generated: edit `scripts/build-fpv-reference-model.ts`, then run `npx tsx --tsconfig tsconfig.json scripts/build-fpv-reference-model.ts`. A test fails if the committed file drifts from the builder.

## Sources and licensing

Each model lists its sources in its own description. The models are re-implemented from published equations, datasheets and permissively licensed (MIT, BSD-3, Apache-2.0) references. No GPL code is translated.
