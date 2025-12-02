# Integrator Block: Limits and Saturation Optimization

## Overview

The Integrator block includes an optional **saturation limiting** feature with intelligent optimization that reduces unnecessary computation when the integrator reaches its configured limits.

## Feature Description

### Configurable Limits

Each Integrator block can optionally configure:
- **Upper Limit**: Maximum allowed value for the integrated state
- **Lower Limit**: Minimum allowed value for the integrated state
- **Element-wise application**: For vector/matrix signals, limits apply to each element independently

### Saturation Behavior

When limits are enabled:

1. **Post-Integration Clamping**: After each integration step, the computed value is clamped to `[lowerLimit, upperLimit]`

2. **Initial Value Clamping**: If the initial value (or parametric reference) exceeds the limits, it is clamped at initialization

3. **Reset Value Clamping**: When a rising-edge Reset signal occurs, the restored initial value is clamped if necessary

## Optimization Strategy

### The Problem

Without optimization, the integrator would:
1. Compute the integration: `state = state + derivative * dt`
2. Check if result exceeds limits
3. Clamp to limit
4. Repeat next timestep with same wasteful computation

This is inefficient when the integrator is "stuck" at a saturation limit.

### The Solution

**Skip integration when output is predictable:**

```
IF (current_state >= upperLimit AND derivative > 0):
    SKIP integration (output would exceed upper limit anyway)

IF (current_state <= lowerLimit AND derivative < 0):
    SKIP integration (output would fall below lower limit anyway)
```

### Benefits

- **Reduced computation**: No unnecessary floating-point operations
- **Exact saturation**: Output stays precisely at limit (no numerical drift)
- **Automatic resumption**: Integration resumes when derivative reverses direction

### Example Scenario

```
Integrator configured with:
- Upper Limit: 10.0
- Lower Limit: -10.0
- Initial Value: 0.0

Time series:
t=0.0:  state=0.0,   derivative=5.0   → integrate normally
t=0.1:  state=0.5,   derivative=5.0   → integrate normally
t=0.2:  state=1.0,   derivative=5.0   → integrate normally
...
t=2.0:  state=10.0,  derivative=5.0   → SKIP (at upper limit, positive derivative)
t=2.1:  state=10.0,  derivative=5.0   → SKIP (still saturated)
t=2.2:  state=10.0,  derivative=5.0   → SKIP (still saturated)
t=2.3:  state=10.0,  derivative=-2.0  → RESUME (derivative reversed, integrate normally)
t=2.4:  state=9.8,   derivative=-2.0  → integrate normally
```

## Implementation Details

### Code Generation (C)

```c
// Euler integration with saturation optimization
bool skip_integration = false;

if (use_limits) {
    float current = state->integral;
    float deriv = inputs[0];

    // Check saturation conditions
    if (current >= upper_limit && deriv > 0.0f) {
        skip_integration = true;
    }
    if (current <= lower_limit && deriv < 0.0f) {
        skip_integration = true;
    }
}

if (!skip_integration) {
    // Perform integration
    state->integral += inputs[0] * dt;

    // Apply clamping
    if (use_limits) {
        state->integral = fmax(lower_limit, fmin(upper_limit, state->integral));
    }
}

outputs[0] = state->integral;
```

### Vector/Matrix Handling

For vector and matrix signals, the optimization applies **element-wise**:

```c
// Vector example
for (int i = 0; i < N; i++) {
    bool skip = false;

    if (use_limits) {
        if (state->integral[i] >= upper_limit && inputs[0][i] > 0.0f) {
            skip = true;
        }
        if (state->integral[i] <= lower_limit && inputs[0][i] < 0.0f) {
            skip = true;
        }
    }

    if (!skip) {
        state->integral[i] += inputs[0][i] * dt;
        if (use_limits) {
            state->integral[i] = fmax(lower_limit, fmin(upper_limit, state->integral[i]));
        }
    }

    outputs[0][i] = state->integral[i];
}
```

This allows some elements to continue integrating while others are saturated.

### RK4 Integration

For RK4 (4th-order Runge-Kutta), the optimization is more complex:

**Option 1: Conservative (Recommended Initial Implementation)**
- Apply limits only after the final RK4 update
- Don't attempt to optimize intermediate k1, k2, k3, k4 calculations
- Simpler implementation, maintains RK4 accuracy until saturation

**Option 2: Aggressive**
- Check saturation at each RK4 sub-step
- Skip k2, k3, k4 calculations if k1 indicates saturation
- More complex, potential accuracy concerns at saturation boundary

**Recommended approach**: Start with Option 1 (post-clamp only) and consider Option 2 if profiling shows significant performance benefit.

## Configuration UI

In the Integrator configuration dialog:

```
┌─ Integrator Configuration ────────────────┐
│                                            │
│ Initial Value: [0.0        ]               │
│ □ Use Parameter: [Select... ▼]            │
│                                            │
│ ☑ Use Limits                               │
│   Upper Limit: [10.0       ]               │
│   Lower Limit: [-10.0      ]               │
│   ℹ️ Optimizes integration at saturation   │
│                                            │
│ □ Show Enable Input                        │
│ ☑ Show Reset Input                         │
│                                            │
│ Integration Algorithm: RK4 (Model Setting) │
│                                            │
│ [Cancel]                      [Apply]      │
└────────────────────────────────────────────┘
```

## Testing Requirements

### Functional Tests

1. **Basic Saturation**: Verify output clamps at limits
2. **Skip Verification**: Confirm integration skipped when at limit with same-sign derivative
3. **Resume Verification**: Confirm integration resumes when derivative reverses
4. **Boundary Conditions**: Test behavior exactly at limits
5. **Element-wise Independence**: For vectors, verify some elements can saturate while others continue

### Performance Tests

1. **Optimization Effectiveness**: Measure CPU time saved when saturated
2. **Comparison**: Compare performance with and without optimization
3. **Long Saturation Periods**: Test models where integrators spend significant time at limits

### Accuracy Tests

1. **Analytical Comparison**: Compare with known analytical solutions
2. **RK4 vs Euler**: Verify both algorithms produce expected results with limits
3. **Limit Precision**: Verify outputs stay exactly at limits (no drift)

### Edge Cases

1. **Initial Value Outside Limits**: Verify clamping at initialization
2. **Reset to Outside Limits**: Verify clamping after reset
3. **Zero Derivative at Limit**: Verify correct behavior when derivative is exactly zero
4. **Rapid Oscillation**: Test performance when derivative rapidly changes sign at limit

## Performance Expectations

For models with integrators that spend significant time at saturation limits:

- **Expected CPU reduction**: 10-30% (depending on % time at saturation)
- **Memory impact**: Negligible (one boolean per element)
- **Code size impact**: ~10-20 additional lines per integrator

## Use Cases

This feature is particularly valuable for:

1. **Physical Systems with Hard Stops**:
   - Motor position limits
   - Valve positions (0-100%)
   - Tank levels with overflow protection

2. **Control Systems**:
   - Anti-windup for PI/PID controllers
   - Saturation in actuator models
   - Rate limiters with integration

3. **Long-Duration Simulations**:
   - Systems that reach steady-state at limits
   - Slow dynamics with long saturation periods

## Comparison with Limit Block

| Feature | Limit Block | Integrator with Limits |
|---------|-------------|------------------------|
| Purpose | Clamp any signal | Integrate with saturation |
| Optimization | None | Skips integration at saturation |
| Use Case | General signal limiting | Anti-windup, physical constraints |
| State | Stateless | Stateful (maintains integral) |

**When to use each:**
- **Limit Block**: For clamping any computed or measured signal
- **Integrator Limits**: For integration with anti-windup and physical saturation

## Future Enhancements

Potential future additions:

1. **Different limits per element**: For vectors/matrices, allow different limits for each element
2. **Parametric limits**: Allow limits to reference model parameters
3. **Soft saturation**: Gradual rolloff near limits instead of hard clamp
4. **Saturation indicator output**: Boolean output showing if any element is saturated
5. **Back-calculation anti-windup**: More sophisticated anti-windup for control applications

---

**Document Version:** 1.0
**Last Updated:** December 2, 2025
**Feature Status:** Planned for implementation
