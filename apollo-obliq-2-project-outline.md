# The Apollo/Obliq-2 project

The goal of this project is to use the obliq-2 environment to build a drop-in replacement for an existing Simulink/RTW-based Apollo/Saturn IB launch simulation.

**Living detail:** `examples/saturn-ib/SIMULINK_STACK_MAP.md`, `examples/saturn-ib/APOLLO_OBLIQ_GAP_MATRIX.md`. Decisions below supersede the original one-line exit criteria where they conflict.

---

## Phase 1 — Translate AS-205 Simulink stack → Obliq-2

1.1 Identify gaps / missing Obliq functionality for major-subsystem + RTW I/O equivalence (not literal every Fcn/Goto).  
1.2 Verify against a complete Simulink/`batch_sim` run:  
`~/src/viper/ApolloA/reference-1000s.csv` and `reference-1000s-final.json`.  
1.3 Continue the incremental 9.x / `SIMULINK_STACK_MAP` plant port.  
1.4 Two-tier verification:
- **Tier A:** plant residual vs Simulink logged plant channels (engineering).
- **Tier B:** closed-loop `final.json` after an early RTW drop-in harness (`SATURN_STACK_BACKEND=obliq`).
1.5 **CLI tooling:** JSON model document → standalone C project (`npm run obliq:cgen`) to feed Tier B / Phase 4 without the WASM path.

**Phase 1 exit:** &lt; 0.5% difference on **primary** `final.json` fields at end of run (~1000 s) vs `reference-1000s-final.json`.

**Primary fields:** `s2_h_m`, `s2_Xe_*`, `s2_Ve_*`, `veh_q_ECI_*`, `BodyToSM_*`, event flags (`bLiftoff`, `bStageSep`, `bIECO`, `bOECO`, `bS_IVB_EngineStart`).  
Booleans must match exactly. Near-zero quantities use absolute floors.  
Out of hard gate: `wall_sec`, `realtime_ratio`, `pad_*`, FDAI cosmetics (soft notes only).

Compare: `npm run as205:compare-final -- --ref …/reference-1000s-final.json --model …/obliq-final.json`

---

## Phase 2 — NASA-TM-X-62831 launch parameters

Retune **both** Simulink/`batch_sim` and Obliq with launch / vehicle / guidance parameters from:

`~/Downloads/NASA-TM-X-62831.pdf` — *AS-205/CSM-101 Launch Vehicle Operational Trajectory, Revision I* (10 Sep 1968).

Rerun both; compare Obliq↔Simulink `final.json` with the same 0.5% primary-field gate.

**Note:** TM flight azimuth is **72° E of N** (pad orientation 100°). Current `AS-205-reference.json` uses 82.82° — do not conflate with TN-AP-67-158.

**Phase 2 exit:** &lt; 0.5% Obliq↔Simulink on primary `final.json` fields under TM params.

---

## Phase 3 — Obliq vs TM-X-62831 published trajectory

Compare Obliq (Phase 2 config) to TM trajectory listings (Tables 5–8 / Appendix C).  
Walk discrepancies early→late; correct modeling. Simulink optional diagnostic.

**Phase 3 exit:** &lt; 0.5% on all **modeled** TM outputs Obliq exposes (field map frozen after digitization).

---

## Phase 4 — Drop-in Obliq C into ApolloA / batch_sim

**Companion library (preferred):** `~/src/viper/lib_SaturnIBObliq` exposes the same `SaturnIBStack` class; `batch_sim` selects backend with `-DSATURNIB_BACKEND=rtw|obliq`. StableMember stays RTW-linked from `lib_SaturnIB`; plant is Obliq.

**Phase 4 exit:** Obliq backend is selectable/default; closed-loop gates still pass; ApolloA can link the Obliq `saturnib` target.

---

## Resources

| Path | Role |
|------|------|
| `~/src/obliq-2/` | Obliq IDE, codegen, 9.x Saturn plant, compare/cgen CLIs |
| `~/src/viper/ApolloA/` | GUI ApolloA + `reference-1000s.csv` / `final.json` golden |
| `~/src/viper/batch-sim/` | Headless closed-loop driver |
| `~/src/viper/lib_SaturnIB/` | RTW C + `SaturnIBStack` wrapper |
| `~/src/viper/dso_core/`, `dso_fs/` | Host math / ECI aero libraries |
| `~/src/viper/simulink/saturn_ib_stack.mdl` | Authoritative MDL (copy also under `obliq-2/saturn-1B/`) |
| `~/Downloads/NASA-TM-X-62831.pdf` | Phase 2 params + Phase 3 trajectory |

### RTW root contract (drop-in)

```text
ExternalInputs:  LaunchDate[6], A_z_deg, CG_LLA_deg_m[3], q_ECItoSM[4], T_L_prime_sec
ExternalOutputs: FDAI*, CM_IMU_*, OUT11[25], OUT12[24], OUT22[9],
                 veh_q_ECI[4], BodyToSM_*, bLiftoff, bStageSep, bIECO, bOECO, bS_IVB_EngineStart
Step:            200 Hz (MODEL_TIME_STEP_SEC = 0.005)
```
