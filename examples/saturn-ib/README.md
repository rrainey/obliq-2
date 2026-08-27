# Saturn-IB examples (moved)

Saturn-IB Obliq migration artifacts now live in the Viper vehicle library:

**`~/src/viper/lib_SaturnIBObliq/`**

| Path | Contents |
|------|----------|
| `model/` | Obliq JSON models, AS-205 reference CSV |
| `docs/` | RTW disparity, IGM notes, harness docs |
| `ts/` | Plant / IGM / AS-205 TypeScript helpers |
| `artifacts/` | Diagnose CSVs and similar |
| `plant/` | Obliq-generated C plant for ApolloA |

Converter tooling is the peer package **`~/src/mdl2obliq`**.

## Ground-track plot (Mercator)

Compare TM-X-62831 geodetic path vs the current stack sim:

```bash
# 1) Sim LLA CSV (from /tmp/verify-lambda0-119-cgen build tree)
cd /tmp/verify-lambda0-119-cgen/build && make lla_probe && ./lla_probe > /tmp/lla_probe.csv

# 2) Plot
python3 scripts/plot_as205_groundtrack.py \
  --tm ~/src/viper/lib_SaturnIBObliq/model/as205-reference/tm_x_62831_geodetic.csv \
  --sim /tmp/lla_probe.csv \
  --out examples/saturn-ib/as205_groundtrack_mercator.png
```

Output: `as205_groundtrack_mercator.png` (western Atlantic zoom). Sim longitude is pad-aligned by default to remove the ~1.25° Earth-rotation drift from the 300 s GRR hold.
