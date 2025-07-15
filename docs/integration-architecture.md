# Integration Architecture

## Overview

The simulation engine uses a two-layer architecture that separates algebraic computations from time-based integration. This design provides better modularity, testability, and support for multiple integration methods.

## Architecture Layers

### 1. Algebraic Layer
- **Purpose**: Compute all block outputs based on current inputs and states
- **Characteristics**:
  - Pure function: (inputs, states) → outputs
  - No state changes
  - No time advancement
  - Can be called multiple times per time step (for RK4)

### 2. Integration Layer
- **Purpose**: Update states based on derivatives
- **Characteristics**:
  - Manages time advancement
  - Orchestrates integration methods (Euler, RK4)
  - Handles enable state transitions
  - Validates numerical stability

## Block Module Interface

Each block module implements the `IBlockModule` interface with these key methods:

```typescript
interface IBlockModule {
  // Existing methods...
  
  // New method for derivative computation
  computeDerivatives?(
    blockState: BlockState,
    inputs: any[],
    time: number
  ): number[] | undefined
}
```

## Integration Methods

### Euler Integration
- First-order accuracy
- Simple: x[n+1] = x[n] + dt * f(x[n], t[n])
- Fast but less accurate
- Good for testing and non-stiff systems

### RK4 Integration
- Fourth-order accuracy
- Requires 4 derivative evaluations per step
- More accurate for same step size
- Better stability properties

## State Management

States are managed through the `StateContainer` interface:
- Supports cloning for RK4 intermediate steps
- Handles scalar, vector, and matrix states
- Provides rollback capability

## Benefits

1. **Correctness**: Proper handling of cascaded dynamic systems
2. **Flexibility**: Easy to add new integration methods
3. **Performance**: Algebraic computations can be optimized independently
4. **Testing**: Integration methods can be tested in isolation
5. **Debugging**: Clear separation of concerns

## Migration Guide

To add a new stateful block:

1. Implement `requiresState()` → return true
2. Implement `computeDerivatives()` → return state derivatives
3. Update `executeSimulation()` → only compute outputs
4. Add state struct members in `generateStateStructMembers()`

## Example: Transfer Function

Before (embedded RK4):
```typescript
// RK4 integration embedded in processTransferFunctionElement
const k1 = dydt(currentState, input)
const k2 = dydt(currentState + 0.5 * h * k1, input)
// ... etc
states[0] = currentState + (h / 6) * (k1 + 2 * k2 + 2 * k3 + k4)
```

After (separated):
```typescript
// In computeDerivatives
derivatives[0] = (b0 * input - a0 * states[0]) / a1

// In executeSimulation
blockState.outputs[0] = states[0] // Just output current state
```