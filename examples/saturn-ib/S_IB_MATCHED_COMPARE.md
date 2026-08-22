# S-IB Stage (`<S9>`) — matched compare

**Date:** 2026-08-21  
**Depends on:** IC Path B + On Pad / OUT22 (`ON_PAD_MATCHED_COMPARE.md`).

## Enable / liftoff

| Signal | Meaning |
|--------|---------|
| `T_L_prime` | `sim_time >= T_L_prime_sec` |
| `bLiftoff` | Same as `T_L_prime` in RTW ExtY |
| S-IB enable | Enabled when `T_L_prime` is true |

With default **`T_L_prime_sec = 300`**, OUT11 stays **zero** until t≥300 s.  
Pad truth before enable is **OUT22** (On Pad), not OUT11.

### Batch-sim note: AGC pad-load hang

`AS-205-reference.json` sets `agc.pad_load_start_sec = 15`. Crossing that time
puts RTW `batch_sim` into a **tight CPU spin** (14 s OK, 15.05 s hangs).

For any run past ~15 s, set `"pad_load_file": "-"` (AGC still steps; uplink
skipped). Example: `/tmp/ic-matched/AS-205-reference-nopad.json`.

## First gate: pad handoff

Use config with **`T_L_prime_sec: 0`** so S-IB is enabled from t=0 and loads pad ICs:

```bash
~/src/viper/batch-sim/build-rtw/batch_sim \
  ~/src/viper/batch-sim/examples/AS-205-sib-pad.json \
  --run-time 0.05 \
  --sib-trace /tmp/ic-matched/rtw-sib.json \
  --onpad-trace /tmp/ic-matched/rtw-onpad-sibpad.json \
  --ic-trace /tmp/ic-matched/rtw-ic-sibpad.json
```

### RTW results @ t≈0.01 (`T_L_prime_sec=0`)

| Check | Residual |
|-------|----------|
| ‖Xe_SIB − Xe_OnPad‖ | **~1e-4 m** |
| ‖Ve_SIB − Ve_OnPad‖ | **~0.02 m/s** (tiny motion; bLiftoff=1 immediately) |
| lat / lon / h | **match** (~1e-11 deg / ~1e-4 m) |
| ‖Xe_SIB − Xe_IC‖ | **~4.1 m** (live GMST vs frozen `<S5>` — expected) |
| \|ω\|, α | Small nonzero (hold-down / enable dynamics) |

**Interpretation:** At enable, S-IB OUT11 is the On Pad state to engineering precision. Pad→S-IB IC handoff is clean.

## Second gate: delayed liftoff + early ascent (RTW truth)

```bash
# pad_load_file must be "-"
~/src/viper/batch-sim/build-rtw/batch_sim \
  /tmp/ic-matched/AS-205-reference-nopad.json \
  --run-time 320 \
  --sib-trace /tmp/ic-matched/rtw-sib-liftoff.json \
  --csv /tmp/ic-matched/rtw-sib-320.csv \
  --final /tmp/ic-matched/rtw-sib-320-final.json
```

| Check | Result |
|-------|--------|
| Wall | **~0.9 s** (~357× realtime) with pad-load disabled |
| `sib-trace` | **t=300.01**, `bLiftoff=1`, \|Xe\|≈6373327 m |
| OUT11 before t=300 | **zero** (CSV) |
| t=301 → 320 | h: 37→596 m; Vb: 2.3→62 m/s (airspeed) |

Same ascent window with `T_L_prime_sec=0` and `--run-time 20` matches the
t=300…320 segment to engineering precision (liftoff clock only).

## Third gate: Obliq vs RTW @ +20 s open-loop

Artifacts: `rtw-sib-ascent20-final.json` / `obliq-sib-ascent20-final.json`
(and the T_L=300 equivalents `*-sib-320-final.json`).

### OUT11 pack fix (2026-08-21)

`lib_SaturnIBObliq/src/SaturnIBPlantObliq.c` `pack_out11_from_eom` now matches RTW ExtY:

| Slot | Packing |
|------|---------|
| Xe | ECI `r_i` (unchanged; Stack comment: Sta.100 ECI) |
| LLA | Geodetic via GMST from ExtU `LaunchDate`; lon=`atan2(y,x)−GMST` |
| Ve | `quat*(v_b)` with **conjugate** q (body→ECI; matches RTW `Product_m`) |
| Vb | `Aero_AirRel_V_air_mag` (airspeed) |
| α | plant `alpha_deg` |

### Residuals after pack (@ T_L=0, t=20 s, 5% tol)

| Quantity | Residual | Status |
|----------|----------|--------|
| Xe components / \|Xe\| | **~0–22 m** | ok |
| `s1_h_m` | **~17 m** (was ~110 m spherical artifact) | ok |
| `s1_lat_deg` / `s1_lon_deg` | **~1e-4° / 0.08°** (was lon ~245° off) | ok |
| `s1_Vb_mps` | **~0.4 m/s** (was ~350) | ok |
| `s1_Ve_x/y` | **~1–2%** | ok |
| `s1_Ve_z` | **~3.8 m/s (13%)** | still FAIL @ 5% — plant/attitude |
| `s1_alpha_deg` | **~1.1°** | FAIL — aero / attitude |
| `veh_q_ECI` | O(0.05–0.5); **q0 sign flip** vs RTW | open (IC / quat convention) |

**Interpretation:** Nav pack parity for LLA / Vb / Ve is largely done. Remaining
FAIL is real open-loop plant (α, Ve_z, attitude). Hold-down (pre-`bLiftoff`
OUT11 zeros) still open for T_L=300 path.

## Children (for later slices)

| Child | Role |
|-------|------|
| Custom Variable Mass 6DoF (Quaternion) | EOM |
| H-1 Engine Cluster | Thrust / TVC |
| Aerodynamic Forces and Moments | Aero |
| Earth Gravity Model | g(ECI) |
| ECI to LLA | LLA from Xe |
| Relative Wind | α, β, V |
| Vehicle Mass Properties | m, CG, I |
| Retrorocket Motors | Sep |

## Next gates (suggested)

1. **Hold-down** — freeze Obliq EOM / OUT11 until `bLiftoff` (mirror RTW zeros).  
2. **Attitude / quat convention** — resolve q0 sign vs RTW; should also shrink Ve_z / α.  
3. Wire mdl2obliq S-IB outs → OUT11 when regenerating plant (pack adapter stays).  
4. Longer ascent / TVC open-loop after attitude parity.

## Pass bar

- [x] `--sib-trace` dumps OUT11 when S-IB enabled  
- [x] Pad handoff: OUT11 ≈ OUT22 with `T_L_prime_sec=0`  
- [x] Post-liftoff ascent window (RTW truth @ T_L=300, nopad)  
- [x] Obliq vs RTW +20 s: \|Xe\| residual documented (~17 m)  
- [x] Obliq OUT11 pack parity (lon / Ve / Vb / geodetic h) — nav fields @ 5%  
- [ ] Obliq hold-down until liftoff  
- [ ] Attitude / α / Ve_z within 5%  
