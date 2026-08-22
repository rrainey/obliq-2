# Saturn_IB_Stack hierarchy (Simulink ↔ Obliq)

Source MDL: `saturn-1B/saturn_ib_stack.mdl`  
Obliq builder: `saturnIbObliqPlant.ts` → `lib_SaturnIBObliq` plant

Status: **real** = numerics from existing 9.x ports · **stub** = named box, defined I/O, zero/passthrough

## Top-level (`Saturn_IB_Stack`)

| Simulink name | Obliq status | Notes |
|---------------|--------------|-------|
| Body to ECI | **partial** | Exposes `veh_q_ECI` from S-IB q |
| CM_ISS | stub | Stable member / gimbal angles later |
| Earth's Rotation | stub | ω_E constant available in pad frames |
| Initial Conditions | **partial** | MES + pad IC constants |
| MES Transform | stub | Duplicate root path; IC owns live MES |
| On Pad | **partial** | OUT22 matched (Path B); see `ON_PAD_MATCHED_COMPARE.md` |
| S-IB Stage | **partial** | Pad handoff OUT11≈OUT22 with `T_L_prime_sec=0`; see `S_IB_MATCHED_COMPARE.md` |
| S-IVB Stage | stub | Enable wired to `bStageSep`; no J-2 EOM yet (post-sep freeze) |
| Saturn Instrument Unit (IU) | **partial** | Live `bLiftoff`; hold-down gate. Guidance: `Chi_Table2B_ElevPd`. Root hosts RTW T2/T3 IECO/OECO/StageSep/S-IVB events. |

## S-IB Stage

| Simulink name | Obliq status |
|---------------|--------------|
| Custom Variable Mass 6DoF (Quaternion) | **real** as root `EOM_6DoF_VarMass` (+ named stub in S-IB shell). Enable=`bLiftoff` hold-down. Flatten ID uniquify fixed `source_N` collisions. |
| H-1 Engine Cluster | **real** as root `H1_Engine_Cluster` (β_P/β_Y → F/M; CG_x(mass) from RTW `<S122>`; + named stub in S-IB shell). |
| Aerodynamic Forces and Moments | **partial** as root `Aero_AirRel` (air-rel F&M live; RTW mass-sched CG; CN signed→Unary Minus). Named stub in S-IB shell. |
| Earth Gravity Model | stub (g still inside EOM) |
| Relative Wind | stub |
| Vehicle Mass Properties | stub |
| ECI to LLA | stub |
| Retrorocket Motors | stub |

## S-IVB Stage (stubs)

APS modules, J-2 Engine, 6DoF, Aero, Gravity, Ullage, Mass Properties, …

## IU (stubs except liftoff)

FCC, LVDA/LVDC (χ, IGM, S-frame nav), gyros, accelerometers, ST-124M, …

## Host OUT11 / veh_q

`SaturnIBPlantObliq.c` packs root `r_i`, `v_b`, `omega_b`, `q_bE` into RTW `OUT11` + `veh_q_ECI`.
LLA is spherical from `|r_i|`; `Xe` is ECI proxy until ECF / ECI→LLA leaves land.

## Regenerating

```bash
cd ~/src/obliq-2 && npm run obliq:regen-saturnib-plant
cmake --build ~/src/viper/batch-sim/build-obliq
./build-obliq/batch_sim examples/AS-205-obliq-spike.json --run-time 30
```
