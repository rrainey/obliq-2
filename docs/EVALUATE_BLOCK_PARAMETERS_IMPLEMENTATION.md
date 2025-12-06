# Evaluate Block Parameter Support - Implementation Summary

**Date:** December 2, 2025
**Feature:** Feature 3 - Priority 2
**Status:** ✅ COMPLETE

## Overview

This document details the implementation of parameter support in Evaluate blocks, allowing users to reference model parameters by name in mathematical expressions. Parameters are validated, evaluated in simulation, and emitted as `#define` macros in generated C code.

## What Was Implemented

### 1. UI Updates - EvaluateConfig.tsx

**Changes:**
- Added `useModelStore` hook to access parameters
- Display parameters in Quick Reference section (4-column grid)
- Show parameter examples in help text
- Pass parameter names to expression validator

**User Experience:**
```typescript
// Before: Only inputs, operators, and math functions shown
// After: Parameters displayed with their types:
• GAIN (double)
• THRESHOLD (float)
• MAX_VALUE (long)

// Example shown in help:
"GAIN * in(0)" - Multiply input by parameter GAIN
```

### 2. Expression Validation - C99ExpressionValidator.ts

**Changes:**
- Added `parameterNames: string[]` to constructor (defaults to empty array)
- Modified `Identifier` case to validate against parameter names
- Provides helpful error messages for unknown identifiers

**Before:**
```typescript
constructor(numInputs: number)
// Any identifier → error
```

**After:**
```typescript
constructor(numInputs: number, parameterNames: string[] = [])
// Known parameter → valid
// Unknown identifier → error with suggestion
```

### 3. Expression Evaluation - C99ExpressionEvaluator.ts

**Changes:**
- Added `parameters: Map<string, number>` to constructor
- Modified `Identifier` case to look up parameter values
- Throws error if parameter not found during evaluation

**Before:**
```typescript
case 'Identifier':
  throw new Error(`Unexpected identifier: ${expr.name}`)
```

**After:**
```typescript
case 'Identifier':
  const paramValue = this.parameters.get(expr.name)
  if (paramValue === undefined) {
    throw new Error(`Parameter '${expr.name}' not found`)
  }
  return paramValue
```

### 4. Code Generation - c99ExpressionCodeGen.ts

**Changes:**
- Modified `Identifier` case to emit parameter name directly

**Before:**
```typescript
case 'Identifier':
  throw new Error(`Unexpected identifier in expression: ${expr.name}`)
```

**After:**
```typescript
case 'Identifier':
  // Parameter reference - emit the parameter name directly
  return expr.name
```

**Generated C Code:**
```c
// Expression: "GAIN * in(0)"
// Generated:
double _eval_in0 = model->signals.Input1;
model->signals.ScaledInput = (GAIN * _eval_in0);

// GAIN is a #define from header:
#define GAIN 2.5
```

### 5. Block Module - EvaluateBlockModule.ts

**Changes in `executeSimulation()`:**
- Build parameter map from `simulationState.parameters`
- Filter for scalar parameters only (numbers)
- Pass parameters to validator and evaluator

**Code:**
```typescript
// Build parameter map for scalar parameters only
const parameterMap = new Map<string, number>()
if (simulationState.parameters) {
  simulationState.parameters.forEach((value, name) => {
    if (typeof value === 'number') {
      parameterMap.set(name, value)
    }
  })
}

// Validate with parameter names
const parameterNames = Array.from(parameterMap.keys())
const validator = new C99ExpressionValidator(numInputs, parameterNames)

// Evaluate with parameters
const evaluator = new C99ExpressionEvaluator(numericInputs, parameterMap)
```

## Test Coverage

**File:** `__tests__/evaluate-block-parameters.test.ts`
**Tests:** 19/19 passing

### Test Categories:

1. **Expression Validation with Parameters** (4 tests)
   - Accept parameter identifier in expression
   - Reject unknown parameter identifier
   - Accept multiple parameters
   - Validate expression with no parameters

2. **Expression Evaluation with Parameters** (5 tests)
   - Evaluate single parameter
   - Evaluate multiple parameters
   - Handle missing parameter error
   - Complex expressions with parameters
   - Parameter-only expressions

3. **Code Generation with Parameters** (3 tests)
   - Generate parameter reference in C code
   - Generate multiple parameter references
   - Complex parameter expressions

4. **EvaluateBlockModule Integration** (4 tests)
   - Generate C code with parameters
   - Execute simulation with parameter
   - Execute simulation with multiple parameters
   - Handle missing parameter gracefully
   - Work with no parameters

5. **Complex Parameter Expressions** (3 tests)
   - Mathematical operations with parameters
   - Conditional expressions with parameters
   - Nested expressions with parameters

## Usage Examples

### Example 1: Simple Gain

**Model Setup:**
- Parameter: `GAIN = 2.5`
- Evaluate Expression: `GAIN * in(0)`

**Simulation:**
```
Input: 4.0
Output: 10.0  // 2.5 * 4.0
```

**Generated C Code:**
```c
#define GAIN 2.5

void model_step(model_t* model) {
    double _eval_in0 = model->signals.Input1;
    model->signals.ScaledInput = (GAIN * _eval_in0);
}
```

### Example 2: Offset and Scale

**Model Setup:**
- Parameters: `A = 3.0`, `B = 10.0`
- Evaluate Expression: `A * in(0) + B`

**Simulation:**
```
Input: 2.0
Output: 16.0  // 3.0 * 2.0 + 10.0
```

**Generated C Code:**
```c
#define A 3.0
#define B 10.0

void model_step(model_t* model) {
    double _eval_in0 = model->signals.Input1;
    model->signals.Scaled = ((A * _eval_in0) + B);
}
```

### Example 3: Threshold Comparison

**Model Setup:**
- Parameters: `THRESHOLD = 10.0`, `MAX_VALUE = 100.0`, `MIN_VALUE = 0.0`
- Evaluate Expression: `in(0) > THRESHOLD ? MAX_VALUE : MIN_VALUE`

**Simulation:**
```
Input: 15.0
Output: 100.0  // 15.0 > 10.0 ? 100.0 : 0.0
```

**Generated C Code:**
```c
#define THRESHOLD 10.0
#define MAX_VALUE 100.0
#define MIN_VALUE 0.0

void model_step(model_t* model) {
    double _eval_in0 = model->signals.Input1;
    model->signals.Thresholded = ((_eval_in0 > THRESHOLD) ? (MAX_VALUE) : (MIN_VALUE));
}
```

## Files Modified

1. **src/components/EvaluateConfig.tsx** - UI updates
2. **src/lib/c99ExpressionValidator.ts** - Validation with parameter names
3. **src/lib/c99ExpressionEvaluator.ts** - Evaluation with parameter values
4. **src/lib/c99ExpressionCodeGen.ts** - Code generation with parameter references
5. **src/lib/blocks/EvaluateBlockModule.ts** - Integration in simulation and codegen

## Backward Compatibility

All changes are backward compatible:

- Validator accepts empty parameter list (default)
- Evaluator accepts empty parameter map (default)
- Expressions without parameters work exactly as before
- Existing tests continue to pass (all 53 parameter tests passing)

## Known Limitations

1. **Scalar Parameters Only**: Evaluate expressions only support scalar (number) parameters
   - Vector/matrix parameters are filtered out in simulation
   - This is by design - expressions operate on scalars

2. **No Type Checking**: Parameters are treated as `double` in expressions
   - Float parameters are promoted to double
   - No distinction between int/float/double in expressions

3. **No Constant Folding**: Parameter expressions are not pre-computed
   - `A * B + C` is evaluated every step, even if A, B, C are constants
   - Could be optimized in future

## Integration with Feature 3

This completes **Priority 2** of Feature 3:

- ✅ **Priority 1: Source Block Support** (December 2, 2025)
- ✅ **Priority 2: Evaluate Block Support** (December 2, 2025)
- ⏳ **Priority 3: Integration Testing** (pending)

## Verification

All parameter-related tests passing:
```
Test Suites: 4 passed
Tests:       53 passed
  - parameter-code-generation.test.ts: 10 tests
  - source-block-parameters.test.ts: 8 tests
  - evaluate-block-parameters.test.ts: 19 tests
  - modelParameters.test.ts: 16 tests
```

## References

- Main Feature Doc: [FEATURE_3_PARTIAL_IMPLEMENTATION.md](./FEATURE_3_PARTIAL_IMPLEMENTATION.md)
- Implementation Plan: [IMPLEMENTATION_PLAN_2025-12.md](./IMPLEMENTATION_PLAN_2025-12.md)
- Source Block Implementation: Previous implementation (December 2, 2025)
