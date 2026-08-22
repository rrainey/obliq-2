# AS-205 reference trajectory tables

## Authority

**Primary:** Chrysler **TN-AP-67-158**, *AS-205 Revised Launch Vehicle Reference Trajectory*  
(public PDF e.g. [ibiblio](https://www.ibiblio.org/apollo/Documents/CHRYSLER-TN-AP-67-158%20-%20AS-205%20-%20Revised%20Launch%20Vehicle%20Reference%20Trajectory.pdf))

**Not primary:** Simulink `saturn-1B/*.mdl` — may deviate from the TN. Prefer TN when debugging.

See [`examples/saturn-ib/AS205_REFERENCE.md`](../../../examples/saturn-ib/AS205_REFERENCE.md) for policy and column mapping.

## Files

| File | Purpose |
|------|---------|
| `as205_trajectory_template.csv` | Column contract + header comments |
| `as205_trajectory_reference.csv` | **TN Table 5 S-IB** (digitized SI; see header comments) |
| `as205_trajectory_smoke.csv` | Tiny synthetic series for unit tests only (not flight data) |
| `example_model_logger_export.csv` | Multi-logger column shape for residual CLI dry-run (not flight data) |

## Residual CLI

```bash
# From repo root — dry-run (synthetic model CSV):
npm run as205:compare -- \
  --model docs/sample-models/saturn/as205-reference/example_model_logger_export.csv \
  --offset 1 --fields h_m,mass_kg,qbar_Pa --out /tmp/as205-residual.md

# After running 9.4 in the app and exporting all logger data:
npm run as205:compare -- --model ~/Downloads/saturn-9.4_data.csv --offset 1

# Obliq companion plant (batch_sim CSV; T_L′=2 → --offset 2):
#   ~/src/viper/batch-sim/build-obliq/batch_sim examples/AS-205-obliq-residual.json
npm run as205:compare -- \
  --model /tmp/obliq-residual.csv --offset 2 \
  --fields h_m,mass_kg,v_mps \
  --out examples/saturn-ib/obliq-plant-tier-a-residual.md
```

Default `--offset 1` assumes 9.x liftoff step at \(t=1\,\mathrm{s}\). TN `t_s=0` is first motion.  
`batch_sim` columns (`elapsed_sim_sec`, `s1_h_m`, `s1_Ve_*`, `s1_compare_c3`=Obliq mass) are accepted by `as205Compare`.

## Current digitization status

- **S-IB Table 5** (printed p.17+): present in `as205_trajectory_reference.csv` (~5 s steps, 0–147.26 s).  
- **S-IVB Table 6 / App. C English**: not yet.  
- Dynamic pressure: TN `KG/M2` treated as kgf/m² → Pa via ×9.80665 (see CSV header).  
- Mass continuity spot-check: Δm/Δt ≈ 2.7–2.8 t/s under boost.

## Adding / correcting TN data

1. Open TN-AP-67-158 and locate the revised reference trajectory time history.  
2. Convert units to SI (m, m/s, kg, Pa, rad).  
3. Paste rows into `as205_trajectory_reference.csv` following the template header.  
4. Put page / table IDs in `source_note`.  
5. Spot-check a few rows against the PDF before trusting residuals — **prefer TN over Simulink** when they disagree.

Use with 9.3 loggers + `examples/saturn-ib/as205Compare.ts` for residual reports (still qualitative acceptance).
