# Residual report — 9.6 vs TN-AP-67-158

- **Export:** `saturn-9.6-chi-table2b-attitude-pd_data.csv`
- **Compare:** `npm run as205:compare -- --model … --fields h_m,mass_kg`
- **Offset:** −1 s (sim → liftoff frame)
- **Plant IC:** Simulink Initial Position Eqns 3.4.3–4 (`as205InitialPosition.ts`) — \(R_S\) with \(\delta\phi\) offset, \(|V_S|\approx 408.97\,\mathrm{m/s}\)

## Full S-IB (0–150 s) — post–Initial Position reimport

| Field | N | max\|Δ\| | RMS | t @ max\|Δ\| | Soft |
|-------|---|----------|-----|--------------|------|
| h_m | 35 | **2.112e4** | **8527** | 147.26 s | ok |
| mass_kg | 35 | 5506 | 2870 | 140.90 s | ok |

### vs prior pads

| Metric | Zero \(v_0\) pad | S-frame + Earth rate | **Simulink Initial Position** (now) |
|--------|------------------|----------------------|-------------------------------------|
| h RMS (0–150 s) | ~21 km | ~8.55 km | **~8.53 km** (unchanged) |
| h max\|Δ\| @ late | ~47 km | ~21 km | **~21 km** |
| mass RMS | ~2.9 t | ~2.9 t | **~2.9 t** |

Transverse \(R_S\) from \(\phi_L-\phi_L'\) does **not** change frame-light residuals (altitude uses \(|r|-R_L\); pad energy already matched).

## Phase windows

| Window | Δh RMS | Δm RMS | Notes |
|--------|--------|--------|-------|
| early 0–50 s | **0.67 km** | ~2.8 t | Healthy; slight high mid-window |
| max-q 50–100 s | ~4.7 km | ~2.9 t | Model climbs **above** TN |
| late 100–150 s | ~12.8 km | ~2.9 t | Model **short** of TN by staging |

## Spot checks (from prior true-9.6 export; elev tracking still good)

| t (s) | h model | h TN (approx) | Notes |
|------:|--------:|--------------:|-------|
| 50 | ~5.7 km | ~4.3 km | High |
| 100 | ~28 km | ~23 km | High |
| 147 | ~40 km | ~61 km | Low at staging |

## Interpretation

1. **Initial Position port is correct and inert for \(h\)/mass** — same energy pad as previous Earth-rate IC; \(\delta\phi\) transverse \(R_S\) is second-order for altitude.
2. **Mass plant remains good** (~2.9 t RMS; ~403 t burned ≈ TN class).
3. **Shape issue unchanged:** steep early climb vs TN through max-q, then underperforms after ~120 s.
4. Remaining gap is **not** pad \(R_S/V_S\) formulas — next leverage is **frame/dynamics pipeline** (MES + ECI 6DoF like Simulink) and/or guidance/aero plane, not more pad tuning.

## Recommended next (translation sequence)

1. ~~Residual focus on \(h\), mass~~  
2. ~~Port Initial Position (S)~~  
3. ~~**Port MES**~~ — **done** (`as205Mes.ts`)  
4. ~~**ECI 6DoF**~~ — **done** (`as205EciPlant.ts` + 9.4–9.6); reimport before residual  
5. Body→SM / LVDC S-frame nav; live \(v_S\) export

Policy: **TN-AP-67-158 is authoritative** for trajectory residual (same doc used to validate Simulink). Simulink uses TN site/guidance with **Apollo 7 actual LaunchDate** for MES/Θ_E only — intentional; see `AS205_REFERENCE.md`.
