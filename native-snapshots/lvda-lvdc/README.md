# LVDA_LVDC segregated_atomic snapshot

Generated as a starting point for a future Native Subsystem fork.

- Source JSON: viper/lib_SaturnIBObliq/model/saturn_ib_stack.json
- codeGenStrategy: segregated_atomic on LVDA_LVDC
- Crossing Goto/From auto-promoted to ports
- Chi_* data stores are module-local
- Includes IGM terminal Add12/Add14 Chi latch (parity with flatten)
- A/B vs flatten: bit-identical tm904/lla through t_flight 620 (2026-08-27)
- Date: 2026-08-27

Do not edit in place expecting regen to preserve changes; copy to ~/.obliq/native/lvdc/ when switching to native.
