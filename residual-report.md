# Trajectory comparison notes (9.x vs TN-AP-67-158)

## 9.5 residual snapshot (prior export)

| Field | N | max\|Δ\| | RMS | Soft |
|-------|---|----------|-----|------|
| h_m | 35 | 2.51e4 | 1.09e4 | ok |
| mass_kg | 35 | 3.42e4 | 1.85e4 | ok |

**Phase windows (same export):**

| Window | Δh RMS | Δm RMS |
|--------|--------|--------|
| early boost 0–50 s | ~200 m | ~2 t |
| max-q 50–100 s | ~1.3 km | ~10 t |
| late S-IB 100–150 s | ~17 km | ~28 t |

Early plant is healthy; late under-altitude + over-burn (~34 t too light at staging).

## Plant fix in repo (re-import 9.4/9.5)

1. Denser **Table 5 thrust** LUT — `examples/saturn-ib/as205ThrustTable.ts`  
2. **mdot scale 1/2740** (was 1/2550) so Δm matches TN mass drop  
3. Residual CLI **phase windows** always printed  

```bash
# After re-run + export:
npm run as205:compare -- \
  --model ~/Downloads/saturn-9.5-open-loop-chi-table2b-ascent_data.csv \
  --offset 1 --fields h_m,mass_kg \
  --out residual-report.md
```

Policy: **TN primary**; Simulink secondary. No full platform-frame work in this step.
