# Residual notes (TN-AP-67-158 primary)

## 9.5 after mass-LUT + CdA=12 (user export)

| Field | N | max\|Δ\| | RMS |
|-------|---|----------|-----|
| h_m | 35 | 2.70e4 | 1.15e4 |
| mass_kg | 35 | 5.5e3 | 2.87e3 |

### Phase windows

| Window | Δh RMS | Δm RMS |
|--------|--------|--------|
| 0–50 s | ~103 m | ~2.8 t |
| 50–100 s | ~1.1 km | ~2.9 t |
| 100–150 s | ~18 km | ~2.9 t |

**Mass is fixed** (burned ~403 t ≈ TN). Late altitude still short (~34 km vs TN ~61 km at staging).

## 9.6 (next to try)

Body-pitch attitude PD so elev tracks Table 2B more tightly than rate-only 9.5:

- Import `saturn-9.6-chi-table2b-attitude-pd.json`
- Watch `disp_theta` / `log_theta` follow `disp_chi` (elev cmd)
- Residual as usual on h_m, mass_kg

No platform frames — θ̂ = ∫Q only.
