# Residual report — 9.6 vs TN-AP-67-158

- **Export:** `saturn-9.6-chi-table2b-attitude-pd_data.csv`
- **Plant:** ECI 6DoF + H-1 TVC + aero **F** (air-rel) + **M_aero zeroed** + Body→S elev PD → β_P
- **Compare:** `--fields h_m,mass_kg,v_mps`
- **Offset:** −1 s

## Full S-IB (0–150 s) — engines + M_aero off

| Field | N | max\|Δ\| | RMS | t @ max\|Δ\| | Soft |
|-------|---|----------|-----|--------------|------|
| h_m | 35 | 3.76e4 | **1.90e4** | 145.88 s | ok |
| mass_kg | 35 | 5506 | 2870 | 140.90 s | ok |
| v_mps | 35 | 1003 | **550** | 142.88 s | **large** |

### vs prior 9.6 stages

| Metric | Body→S elev PD (free My) | **+ H-1 TVC, M_aero=0** |
|--------|--------------------------|-------------------------|
| h RMS | **4.0 km** | **19.0 km** (worse) |
| V RMS | **118 m/s** | **550 m/s** (large) |
| mass RMS | 2.87 t | **2.87 t** (identical) |
| blow-up | ~54 s tumble (pre-TVC) | **none** — full run |

## Phase windows (engines + M_aero off)

| Window | Δh RMS | ΔV RMS |
|--------|--------|--------|
| early 0–50 s | 0.77 km | **24 m/s** |
| max-q 50–100 s | 8.2 km | 272 m/s |
| late 100–150 s | 29.3 km | 843 m/s |

## Flight-file notes (same CSV)

| t (s) | h (m) | V_S (m/s) | elev° | χ_cmd° | β_P° | BodyToSM Ψ° |
|------:|------:|----------:|------:|-------:|-----:|------------:|
| 0 | 0 | 409 | 90 | 90 | 0 | 0 |
| 50 | 2352 | 438 | 76.9 | 76.7 | ≈0 | −13 |
| 100 | 8328 | 606 | 47.0 | 46.9 | ≈0 | −43 |
| 145 | 22411 | 1296 | 29.1 | 29.2 | ≈0 | −61 |

- Elev tracks Table 2B almost perfectly with **β_P ≈ 0** (PD quiet: e≈0 after rate damp).
- BodyToSM **yaw Ψ → −60°**; Euler pitch Θ only ~7° — not a clean pitch-plane program.
- q̄ high late (low altitude / long dwell in dense air) → drag spiral.

## Interpretation

1. **M_aero zero + H-1 TVC stopped the tumble** — full 0–150 s residual is valid (no NaN blow-up).
2. **Energy/altitude collapsed vs free-My elev-PD baseline.** Early V is fine; after ~50 s the vehicle under-climbs and under-speeds badly (max-q and late windows).
3. **Mass residual unchanged** — propulsion mass schedule still right; problem is force/attitude direction, not mdot.
4. **Elev-following with ~0 gimbal is a red flag:** geometric elev can fall as the stack **yaws out of plane**, so the elev PD stays quiet while the pitch plane is not actually steered by TVC. Free My used to force pure-pitch My; equal-gimbal H-1 needs β_P (and real M_aero / aero F signs) to do the same job.
5. Zeroing M_aero was a useful stability test, **not** a residual improvement. Next isolation: zero **F_aero** too, and/or command open-loop β_P from the χ program (rate→gimbal) without elev feedback, then re-enable M_aero with engines.

## Port status

| Item | Status |
|------|--------|
| I.P. + MES + ECI + live \(v_S\) | Done |
| Body→S elev PD + BodyToSM logs | Done |
| Variable-mass \(\dot{I}\omega\) | Done |
| H-1 cluster TVC (β→F,M) | **Done** — control → gimbals, no free My |
| Aero F (CA/CN/CP, air-rel) | On |
| Aero M (r×F) | **DIAGNOSTIC OFF** (`M_aero_off`) |
| Full \(I\) / mass-sched CG; oblate \(g\); FCC/IGM | Later |

Policy: **TN residual** while incomplete; **Simulink** for structural completeness. No gain-tuning as transform work.
