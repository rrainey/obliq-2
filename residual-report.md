# Residual notes

## Last user 9.5 export (pre mass-LUT)

| Window | Δh RMS | Δm RMS |
|--------|--------|--------|
| 0–50 s | ~200 m | ~2 t |
| 50–100 s | ~1.3 km | ~10 t |
| 100–150 s | ~17 km | ~28 t |

Mass over-burned vs TN by ~34 t at staging.

## Plant update (re-import 9.4/9.5)

1. **mdot(t)** from Table 5 mass finite differences (not T/Isp)
2. **CdA = 12 m²** (was 17) for less late-ascent drag
3. Thrust still Table 5 total LUT for \(F_b\)

```bash
npm run as205:compare -- \
  --model ~/Downloads/saturn-9.5-open-loop-chi-table2b-ascent_data.csv \
  --offset 1 --fields h_m,mass_kg --out residual-report.md
```

Expect mass residual near zero if burn timer aligns; late Δh may still need pitch/force direction work (no full frames yet).
