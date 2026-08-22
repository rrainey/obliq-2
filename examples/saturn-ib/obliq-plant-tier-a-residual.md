# Tier A residual — Obliq companion plant vs TN-AP-67-158

**Date:** 2026-08-18  
**Plant:** elev PD + **M_aero ON** after polarity fixes  
- `Chi_Table2B_ElevPd`: Table 2B + Body→S elev PD + R-damp  
- Air-rel F&M (RTW CG/CN); H-1 CG(mass); `|V_S|` via MES  
- Liftoff hold-down  

**Run:** `AS-205-obliq-residual.json` — 150 s, `T_L′=2`  
**Oracle:** TN Table 5  

## Headline (full S-IB 0–150 s)

| Field | N | max\|Δ\| | RMS | Soft |
|-------|---|----------|-----|------|
| h_m | 35 | 8.80e3 | **3671** | ok |
| mass_kg | 35 | 3135 | **835** | ok |
| v_mps (\|V_S\|) | 35 | 192 | **132** | **ok** |

### Spot checks

| t_rel | Obliq h | TN h | Obliq \|V_S\| | TN V | elev cmd/meas |
|------:|--------:|-----:|-------------:|-----:|---------------|
| 0 | ~0 | 30 | 409 | 409 | 90/90 |
| 50 | 4649 | 4280 | — | 500 | ~77.3/77.5 |
| 100 | 24644 | 23110 | — | 1099 | ~47.3/47.5 |
| 148 | ~52.0 km | ~61.3 km | ~2166 | ~2325 | 29.2/29.2 |

### Stability

| Metric | Value |
|--------|--------|
| NaN | **none** |
| max \|ω_y\| | **0.012 rad/s** |
| max \|ω_z\| | **0.0015 rad/s** |
| elev track | **tight** (cmd≈meas all burn) |

## Elev PD + M_on tumble isolation

Logged `elev_cmd` / `elev_meas` / `β_P` / `β_Y` into BodyToSM/FDAI slots.

| Finding | Evidence | Fix |
|---------|----------|-----|
| **Elev PD error sign** vs H-1 | Rate-only uses β_P\<0 to tip downrange; `e=meas−cmd` drove +feedback after undershoot | `e = cmd − meas` |
| **Yaw damp sign** vs H-1 `Mz` | `Mz≈−T·CGx·β_Y` needs `β_Y∝+R` for `Mz∝−R`; `β_Y=−Kd·R` grew \|ω_z\| then α blow-up ~t=70 | `β_Y = +Kd_lat·R` |

Same sign fixes applied to **9.6 WASM** (`sixDofVarMassEom`) for H-1 polarity consistency.

## Config ladder

| Config | h RMS | V RMS | Stable? |
|--------|-------|-------|---------|
| Rate-only χ + M on | ~6.3 km | ~248 | yes |
| Elev PD + M off | ~19 km | ~564 | yes (under-climb) |
| Elev PD + M on (wrong signs) | — | — | tumble |
| **Elev PD + M on (fixed signs)** | **~3.7 km** | **~132** | **yes** |

## Reproduce

```bash
cd ~/src/obliq-2 && npm run obliq:regen-saturnib-plant
cmake --build ~/src/viper/batch-sim/build-obliq -j
~/src/viper/batch-sim/build-obliq/batch_sim \
  ~/src/viper/batch-sim/examples/AS-205-obliq-residual.json
npm run as205:compare -- --model /tmp/obliq-residual.csv --offset 2 \
  --fields h_m,mass_kg,v_mps
```

## Next

1. Tier B closed-loop vs `reference-1000s-final.json`  
2. Regen 9.6 sample JSON; optional longer residual / BodyToSM packing cleanup  
3. Mass-sched full \(I\) / ECF LLA when chasing sub-km h
