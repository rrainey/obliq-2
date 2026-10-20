# Data for the reference-model builders

| File | Source | License |
|---|---|---|
| `WMM2025.COF` | NOAA NCEI / BGS World Magnetic Model 2025 coefficients ([download](https://www.ncei.noaa.gov/sites/default/files/2024-12/WMM2025COF.zip)) | Public domain (U.S. Government work) |
| `WMM2025_TestValues.txt` | NOAA NCEI WMM2025 test values (same archive) | Public domain |

`scripts/lib/wmm.ts` evaluates the model, and `__tests__/reference-models/wmm.test.ts` checks it against the test values.
