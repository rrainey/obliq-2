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
| `as205_trajectory_reference.csv` | **Filled TN tables** (add when digitized; optional until then) |
| `as205_trajectory_smoke.csv` | Tiny synthetic series for unit tests only (not flight data) |

## Adding real TN data

1. Open TN-AP-67-158 and locate the revised reference trajectory time history.  
2. Convert units to SI (m, m/s, kg, Pa, rad).  
3. Paste rows into `as205_trajectory_reference.csv` following the template header.  
4. Put page / table IDs in `source_note`.  
5. Spot-check a few rows against the PDF before trusting residuals.

Until `as205_trajectory_reference.csv` exists, comparisons against the TN are **not** automated; use qualitative plots on 9.1 / future plant models only.
