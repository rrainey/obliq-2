# MDL 6DoF vs TS RHS residual

Same-input compare of the **translated** `Custom Variable Mass 6DoF (Quaternion)`
(C, mdl2obliq) against the pure oracle [`sixDofVarMassEomRhs.ts`](./sixDofVarMassEomRhs.ts).

```bash
npm run eom:mdl-vs-rhs          # emit+cgen as needed, print table
npm run eom:mdl-vs-rhs -- --gate --tol 1e-9
```

## Result (after Constant default + inport typing fixes)

| channel   | max \|Δ\|   |
|-----------|------------|
| `v_dot`   | 0          |
| `omega_dot` | ~1e-19   |
| `q_dot`   | 0          |

**PASS** at `tol=1e-9` (machine noise only).

Fixture: surface \(r=\|+X\|\), identity \(q\), nonzero \(v,\omega\), \(F\) includes \(m g_b\) (MDL Forces contract), \(M\neq0\), principal \(I\).

## Bugs the residual exposed (fixed)

1. **Quat normalize `Constant` defaulted to 0** (Simulink omits Value ⇒ **1**). Caused `q̇₀ = (0−|q|²)·q₀ = −1` at unit quat → attitude explosion in the full stack.
2. **Inport heuristics**: `I` → `double[3][3]`, `initial quaternion` → `double[4][1]`, stop `m_` matching `m_dot`.

## Interpretation

Isolated translated EOM **matches** the TS oracle for \(\dot v,\dot\omega,\dot q\). Full-stack NaN/aero runaway is therefore **outside** this 6DoF core (aero α/β/q̄, moments, force packing, etc.).

Artifact: `/tmp/mdl2obliq-eom/eom-mdl-vs-rhs.json`
