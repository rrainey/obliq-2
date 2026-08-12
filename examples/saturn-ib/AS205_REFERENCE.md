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

1. Run **9.4** (or 9.3) with Signal Loggers on altitude, mass, \(q̄\) (and optionally \(V\)).  
2. In the app, export **all logged data** CSV (multi-column: `time`, `log_altitude`, …).  
   Single-logger `time,value` files are not enough for multi-field residuals.  
3. Align sim time to **liftoff**: 9.x models use a liftoff step at \(t\approx 1\,\mathrm{s}\); residual CLI defaults `--offset 1`.  
4. Run the residual CLI:

```bash
# Dry-run with synthetic logger-shaped CSV (not flight data):
npm run as205:compare -- \
  --model docs/sample-models/saturn/as205-reference/example_model_logger_export.csv \
  --offset 1 --tmin 0 --tmax 150 --tol 2 \
  --fields h_m,mass_kg,qbar_Pa \
  --out /tmp/as205-residual.md

# Real 9.4 export:
npm run as205:compare -- \
  --model path/to/saturn-9.4_data.csv \
  --offset 1 --out residual-report.md
```

Programmatic API: `examples/saturn-ib/as205Compare.ts`  
(`loadTrajectoryCsv`, `compareTrajectories`, `compareCsvTexts`, `formatCompareReport`).

5. Interpret residuals: max |Δh|, |Δm|, RMS over a stated window (e.g. 0–150 s S-IB).  
   Soft flags in the report are **diagnostic only** — not pass/fail gates for 9.x.

## Acceptance policy (current phase)

| Phase | Expectation |
|-------|-------------|
| 9.1 / 9.2 plant / rate loop | **Qualitative** agreement only (shape of h(t), mass drop). |
| 9.3 + Table 5 CSV | Residual **reports** enabled; still no hard pass/fail gates. Prefer h, mass first. |
| After aero tables + mass props + χ program | Quantitative windows vs TN (to be defined). |
| Full IGM stack | Guidance presettings from TN + trajectory tables. |

**Frame caveat:** TN Table 5 velocity is **space-fixed** (~409 m/s at first motion from Earth rotation). 9.x demos integrate body \(v_b\) from near rest. Compare \(h(t)\) and \(m(t)\) before chasing \(\|v\|\) residuals.

## Digitized tables (repo)

| File | Content |
|------|---------|
| `as205_trajectory_reference.csv` | **Table 5 S-IB** (t=0…147.26 s), SI, ~5 s steps + event times |
| `as205_trajectory_template.csv` | Column contract |
| `as205_trajectory_smoke.csv` | Synthetic unit-test series only |

S-IVB Table 6 and Appendix C English listings are **not** fully digitized yet.

### Dynamic pressure unit note

TN Table 5 column header is **DYNAMIC PRESSURE (KG/M2)**. Values at max-q (~3254) are treated as **kgf/m²** and converted with \(q_{\mathrm{Pa}} = q_{\mathrm{TN}}\times 9.80665\) (~31.9 kPa ≈ 666 psf). If a later audit shows the TN intended N/m² already, re-scale the CSV and re-run residuals — do not retune the plant to a wrong unit.

## Extracting more tables from the PDF

The TN is multi-page with trajectory listings. Recommended process:

1. Download TN-AP-67-158 from a trusted host (ibiblio link above or NASA archive mirrors).  
2. Identify the **revised reference trajectory** time history tables (not only summary plots).  
3. Digitize selected rows (or full table) into `as205_trajectory_reference.csv`.  
4. Record **page numbers** and **column definitions** in `source_note` / README.  
5. Never commit OCR garbage without a human spot-check against the PDF (mass continuity \(\dot m\sim 2.7\,\mathrm{t/s}\) is a good check).

## Related models

| Model | Use for |
|-------|---------|
| `saturn-9.1-open-loop-6dof-ascent` | h, mass, q̄, \|r\| vs time (plant, no aero force) |
| `saturn-9.2-closed-loop-pitch-rate-damp` | rate loop only — **not** TN trajectory match |
| `saturn-9.3-open-loop-6dof-ascent-aero` | plant + constant-CdA drag (no pitch program) |
| `saturn-9.4-open-loop-chi-6dof-ascent` | TN-class plant + simplified χ elev program |
| `saturn-9.5-open-loop-chi-table2b-ascent` | **primary residual candidate**: Table 2B χ_c → elev + rate loop |
| `as205-reference/as205_table2b_chi.csv` | Digitized Table 2B (χ_c and elev) |
| `saturn-8.8-chi-time-tilt` | χ program shape alone (no plant) |
| Future 9.6+ | Attitude-error loop (needs explicit frame decision); residual pass/fail gates |

### Table 2B pitch convention (practical)

- TN **χ_c**: deg from **inertial vertical**, **negative downrange** (0 at pad vertical).  
- Plant elev used for open-loop \(Q_{\mathrm{cmd}}\): **elev = 90 + χ_c**.  
- Full platform / IGM frame transforms are **not** implemented here.
