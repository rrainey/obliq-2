# mdl2obliq (Phase 0+)

Simulink `.mdl` (R2006b / 6.x text) → Obliq-2 translator scaffolding.

**Plan:** session plan *MDL → Obliq-2 Translator (numeric drop-in first)*.  
**Hard rule:** never emit silent stubs for `UNMAPPED` blocks.

## Status

| Piece | Status |
|-------|--------|
| MDL brace parser → IR | **Done** (incl. Line `Branch` fan-out) |
| IR / coverage CLI | **Done** (`npm run mdl:ir`) |
| BlockType / SourceType catalog | Audited vs design/12 + a87a66a (`unit_delay`, `condition`, `if`, …) |
| Mapper + emitter (IC) | **Done** Phase 1 MVP — strict emit, no stubs |
| IC dual-path A vs B | **Done** — ‖ΔXe‖~57 m, Δq=0; **emit wires as-is** |
| Product Matrix(*) | **Done** → `matrix_multiply` |
| Angle Conversion IU/OU | **Done** → `deg_to_rad` etc. |
| IC emit structural gates | **Done** (6 outs, both Xe paths, Matrix Product) |
| Live plant | **Legacy** IC/EOM (mdlWire smoke tumbled — see `MDLWIRE_ELEV_TUMBLE_NOTE.md`) |
| IC numeric exec / next subsystem emit | Next |

### Catalog audit note

Gap plan `design/12` + commit `a87a66a` already added: `unit_delay` (Memory), `divide`, `sign`, `relay`, `rate_limiter`, `quantizer`, `selector`, `data_store_*`, `edge_detect`, `atmosphere`, plus existing `condition` / `if`. Coverage maps those instead of re-implementing.

## CLI

```bash
npm run mdl:ir -- saturn-1B/saturn_ib_stack.mdl
npm run mdl:ir -- saturn-1B/saturn_ib_stack.mdl --subsystem "Initial Conditions"
npm run mdl:ir -- saturn-1B/saturn_ib_stack.mdl --coverage --json /tmp/mdl-ir.json
npm run mdl:ir -- saturn-1B/saturn_ib_stack.mdl --subsystem "Initial Conditions" --emit /tmp/ic-obliq.json
```

## Layout

| Path | Role |
|------|------|
| `parseMdl.ts` | Brace parser, `findSubsystem`, `walkBlocks` |
| `coverage.ts` | Map catalog + coverage report |
| `mapper.ts` | MDL block → Obliq type (EXPAND lowers to existing blocks) |
| `emitObliq.ts` | System → Obliq ModelData JSON |
| `types.ts` | `MdlModel` IR |
| `scripts/mdl-ir.ts` | CLI |
| `__tests__/mdl2obliq-*.test.ts` | Parser + emit tests |
