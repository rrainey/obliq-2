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
