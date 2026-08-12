# Trajectory comparison — 9.4 vs TN-AP-67-158

- **Reference:** `docs/sample-models/saturn/as205-reference/as205_trajectory_reference.csv` (TN Table 5, S-IB)
- **Model export:** `~/Downloads/saturn-9.4-open-loop-chi-6dof-ascent_data.csv`
- **CLI settings (typical):** `--offset 1 --fields h_m,mass_kg,qbar_Pa --tmin 0 --tmax 150`

> Baseline policy: **TN-AP-67-158 is authoritative**; Simulink may disagree.  
> Soft flags are diagnostic only — not pass/fail gates for 9.x.

---

## Automated residual summary

| Field | N | max\|Δ\| | RMS | t @ max\|Δ\| (s) | Soft flag |
|-------|---|----------|-----|------------------|-----------|
| h_m | 8 | 1.084e+5 | 1.001e+5 | 147.26 | **large** |
| mass_kg | 8 | 3.563e+5 | 3.442e+5 | 145.88 | **large** |
| qbar_Pa | 8 | 1.881e+5 | 1.808e+5 | 147.26 | **large** |

- Model times shifted by −1 s (sim → liftoff frame).
- Only **8** TN points paired — not a full S-IB residual.

---

## What the CSV actually contains

| Property | Value | Implication |
|----------|-------|-------------|
| Rows | 1000 | Matches default logger `maxSamples = 1000` |
| `dt` | 0.05 s | 1000 × 0.05 = **50 s** of history |
| Sim time range | **130.00 → 179.95 s** | Early boost **missing** (circular buffer wrapped) |
| Liftoff-frame time | **129 → 179 s** (with `--offset 1`) | Overlaps only late S-IB / post-staging TN samples |

**Conclusion (instrumentation):** The residual is **not** a full-ascent score. It only sees the **last 50 s** of a 180 s run. Max-q (~78 s) and most of boost are gone from the export.

---

## Spot-check pairings (liftoff frame, late flight)

| t_TN (s) | h_TN (m) | h_model (m) | Δh (m) | m_TN (kg) | m_model (kg) | Δm (kg) |
|----------|----------|-------------|--------|-----------|--------------|---------|
| 130 | 45 490 | ≈ −39 375 | ≈ −85 000 | 224 983 | ≈ 544 800 | ≈ +320 000 |
| 137 | 51 970 | ≈ −42 450 | ≈ −94 000 | 205 799 | ≈ 542 500 | ≈ +337 000 |
| 147.26 | 61 260 | ≈ −47 190 | ≈ −108 000 | 183 924 | ≈ 540 000 | ≈ +356 000 |

TN at staging: climbing through ~61 km, mass ~184 t.  
Model at same clock: **negative altitude** (~−47 km), mass still ~**540 t**.

---

## Diagnosis (prefer TN; do not “fix” to Simulink)

### 1. Logger buffer too short (export artifact)

- Default `signal_logger` / `signal_display` buffer: **1000 samples**.
- At dt = 0.05 s → **50 s** ring buffer.
- For 180 s 9.4 runs you only keep t ∈ [130, 180].

**Effect on residual:** N=8, no early/mid trajectory, no max-q comparison.

**Mitigation:**

- Set logger (and display) `maxSamples` ≥ `ceil(duration/dt)` (e.g. **4000** for 180 s @ 0.05 s), or  
- Downsample (log every N steps) and keep 1000 samples over full run, or  
- Shorten duration for a focused residual window.

Until the full time history is in the CSV, residual RMS is **not** a plant score for S-IB.

### 2. Altitude is unphysical (plant)

Model `log_altitude` is **negative and becoming more negative** (−39 km → −64 km).

Altitude is \(h = |r| - R_E\) with \(R_E = 6\,371\,000\,\mathrm{m}\). Negative \(h\) means \(|r| < R_E\) (below the spherical surface).

TN is still climbing (~45–61 km MSL in this window).

**Likely drivers (in order of suspicion):**

1. **Thrust scale far below S-IB**  
   - 9.x thrust table peaks ~**0.89 MN**.  
   - TN Table 5 thrust is ~**7 MN** class.  
   - \(\dot m \approx T/2550\) then only ~350 kg/s vs TN ~2.7–2.8 t/s.  
   - Mass at t≈130 s: model still ~545 t from 590 t start (~45 t burned); TN already ~225 t vehicle mass.  
   → Gravity wins once χ tilts thrust off radial → trajectory falls “into the Earth.”

2. **Open-loop χ + rate loop** without enough thrust cannot hold an ascent trajectory; pitch-over with weak thrust amplifies the sink.

3. **Frame / IC notes (secondary):** pad IC \(r_0 \approx R_E + 50\,\mathrm{m}\), \(v_b=0\), identity quat, thrust on body \(+X\). That is fine for a radial lift-off **if** \(F_x \gg mg\). With under-thrust + tilt, failure mode matches the CSV.

**Do not** retune χ or CdA to chase Simulink if TN and Simulink disagree. Fix thrust/mass history against **TN Table 5** first.

### 3. Mass residual is huge for the same reason

| Quantity | TN ~t=147 s | Model ~t=147 s |
|----------|-------------|----------------|
| Mass | ~184 000 kg | ~540 000 kg |

Almost no propellant has been spent relative to TN. Residual \(\Delta m \sim +3.5\times 10^5\,\mathrm{kg}\) is consistent with **under-thrust / under-burn**, not a logger mapping error (`log_mass` is present and finite).

### 4. Dynamic pressure residual is not meaningful yet

Model \(q̄\) ~ 1.7–2.4×10⁵ Pa at negative altitude (dense atmosphere + high speed from fall).  
TN at staging \(q̄\) ~ 500 Pa (thin air).

Until \(h(t)\) and \(V(t)\) are in the right ballpark, **do not** use \(q̄\) residuals to tune CdA.

### 5. What *is* working

- CSV export path (multi-column: `time`, `log_*`, `disp_*`).
- χ program still active in the late window (`log_chi` ~ 32° → 28°).
- Pitch rate small (`log_Q` ~ −0.003 rad/s) — rate loop not the main altitude failure.
- Mass slowly decreasing while residual thrust/mdot still present — burn path is wired, just scaled wrong.

---

## Recommended next actions (TN-first)

| Priority | Action | Why |
|----------|--------|-----|
| P0 | Raise logger/display `maxSamples` (or log interval) so export covers **0–150+ s** | Residual must see boost + max-q |
| P0 | Scale 9.4 thrust table toward **~7e6 N** and mdot toward **~T/(Isp g₀)** with Isp ~255–260 s | Match TN mass/altitude *shape* order of magnitude |
| P1 | Align m0 with TN first-motion mass (~586 593 kg) | Cleaner Δm |
| P1 | Re-export full history; re-run `npm run as205:compare` on **h_m, mass_kg** only for 0–150 s | Valid plant residual |
| P2 | Then tune CdA / χ table vs TN q̄ and γ | Only after h,m are not “large” for wrong reasons |
| — | Avoid matching Simulink if it disagrees with TN | Your standing policy |

### Re-run residual (after P0)

```bash
npm run as205:compare -- \
  --model ~/Downloads/saturn-9.4-open-loop-chi-6dof-ascent_data.csv \
  --offset 1 \
  --tmin 0 --tmax 150 --tol 1 \
  --fields h_m,mass_kg \
  --out residual-report.md
```

Expect **N ≫ 8** and early times present when the buffer no longer wraps away boost.

---

## Bottom line

The soft-flagged “large” residuals are **real signals of plant under-thrust / trajectory collapse**, but the **N=8 score is also an export window artifact** (50 s ring buffer).  

Treat this run as:

1. **Instrumentation issue** → fix sample budget before trusting RMS.  
2. **Plant issue** → negative altitude + ~540 t at TN staging time → thrust/mdot scale vs TN Table 5, not a CSV mapping bug.

### Implemented (follow-up)

P0 fixes landed on **9.4** (`buildSixDofOpenLoopChiAscent`):

1. **Logger/display `maxSamples ≈ 3800`** so a 180 s @ 0.05 s run does not wrap away boost.  
2. **Thrust table ~7 MN class** (TN Table 5 order of magnitude) with \(\dot m = T/2550\).  
3. **\(m_0 = m_{\mathrm{ref}} = 586593\,\mathrm{kg}\)** (TN first-motion mass).

Re-import the updated fixture, re-run 180 s, re-export CSV, then:

```bash
npm run as205:compare -- \
  --model ~/Downloads/saturn-9.4-open-loop-chi-6dof-ascent_data.csv \
  --offset 1 --tmin 0 --tmax 150 --fields h_m,mass_kg \
  --out residual-report.md
```

Expect **N ≫ 8**, positive altitude during boost, and mass much closer to TN shape (still not a hard pass/fail).
