# AS-205 validation baseline

## Primary reference

**Document:** Chrysler TN-AP-67-158 — *AS-205 Revised Launch Vehicle Reference Trajectory*  
**Common citation:** NASA / Chrysler Corporation Space Division technical note (1967 era).  
**Public PDF (example host):** [ibiblio Apollo documents](https://www.ibiblio.org/apollo/Documents/CHRYSLER-TN-AP-67-158%20-%20AS-205%20-%20Revised%20Launch%20Vehicle%20Reference%20Trajectory.pdf)

This report defines the **launch vehicle reference trajectory** and associated **guidance presettings** for AS-205. **obliq-2 Saturn work uses this document as the golden trajectory baseline**, not the interim Simulink stack.

## Secondary references (use carefully)

| Source | Role |
|--------|------|
| TN-AP-67-158 tables | **Primary** — altitude, velocity, γ, mass, etc. vs time |
| `saturn-1B/AS205_presettings.m` | Constants / ICs for models; may lag or differ from the TN |
| `saturn-1B/*.mdl` Simulink | Development aid only — **may deviate** from TN-AP-67-158 |
| COESA atmosphere in obliq | Table approximation; not guaranteed identical to 1960s aero models |

When model output disagrees with **both** Simulink and the TN, prefer investigating against the **TN**. When Simulink and the TN disagree, **do not “fix” the obliq model to match Simulink** without an explicit decision and a note in the comparison report.

## Comparable quantities (recommended)

Map TN-AP-67-158 columns (names vary by table) to model signals:

| Quantity | Typical TN role | Preferred model signal(s) |
|----------|-----------------|---------------------------|
| Time from liftoff | Independent variable | sim time (logger) − \(t_{\mathrm{liftoff}}\) |
| Altitude (MSL / geometric) | Trajectory table | `altitude_m` (9.1) or \(\|r\| - R_E\) |
| Inertial / relative velocity | Trajectory table | \(\|v\|\) (inertial if available; else body \(\|v_b\|\) with note) |
| Flight path angle γ | Trajectory table | derived from \(v_i\) and \(r_i\) when exported |
| Mass | Propellant table | `mass` / `mass_kg` |
| Dynamic pressure q̄ | Loads | `qbar_Pa` (9.1) |
| Attitude / χ | Guidance | open-loop χ (8.8) or body rates (9.2) — **not** yet full IGM |

**Units:** Prefer SI in CSV (m, m/s, kg, Pa, rad). Convert English units from the TN once when building the reference CSV and record the conversion in the file header comment.

## Reference CSV layout

Place extracted tables under:

```text
docs/sample-models/saturn/as205-reference/
```

See that folder’s `README.md` and `as205_trajectory_template.csv`.

### Column contract (v1)

| Column | Unit | Required |
|--------|------|----------|
| `t_s` | s from liftoff | yes |
| `h_m` | m MSL (or note geometric) | yes for alt compare |
| `v_mps` | m/s | recommended |
| `gamma_rad` | rad | optional |
| `mass_kg` | kg | optional |
| `qbar_Pa` | Pa | optional |
| `source_note` | text | optional (table ID / page) |

## Comparison workflow

1. Run an obliq model (e.g. 9.1) with **Signal Logger** on the comparable channels.  
2. Export logger CSV from the app.  
3. Align time axes to **liftoff** (\(t=0\) at first motion / step edge).  
4. Run the compare utility (see `as205Compare.ts`):

```bash
# From repo root (after adding a filled reference CSV):
npx ts-node --compiler-options '{"module":"commonjs"}' -e "
const { loadTrajectoryCsv, compareTrajectories } = require('./examples/saturn-ib/as205Compare');
"
```

Or use unit tests that load both CSVs when present.

5. Report residuals: max |Δh|, |Δv|, RMS over a stated window (e.g. 0–150 s S-IB).

## Acceptance policy (current phase)

| Phase | Expectation |
|-------|-------------|
| 9.x plant / rate loop | **Qualitative** agreement only (shape of h(t), mass drop). No TN numeric pass/fail yet. |
| After aero + mass props | Quantitative windows vs TN (to be defined with extracted tables). |
| Full IGM stack | Guidance presettings from TN + trajectory tables. |

## Extracting tables from the PDF

The TN is multi-page with trajectory listings. Recommended process:

1. Download TN-AP-67-158 from a trusted host (ibiblio link above or NASA archive mirrors).  
2. Identify the **revised reference trajectory** time history tables (not only summary plots).  
3. Digitize selected rows (or full table) into `as205_trajectory_reference.csv`.  
4. Record **page numbers** and **column definitions** in `source_note` / README.  
5. Never commit OCR garbage without a human spot-check against the PDF.

## Related models

| Model | Use for |
|-------|---------|
| `saturn-9.1-open-loop-6dof-ascent` | h, mass, q̄, \|r\| vs time (plant) |
| `saturn-9.2-closed-loop-pitch-rate-damp` | rate loop only — **not** TN trajectory match |
| `saturn-8.8-chi-time-tilt` | χ program shape vs time (open-loop) |
| Future 9.3+ | Explicit TN residual report model / script |
