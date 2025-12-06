# Database Migration: Model Parameters Support

**Date:** December 2, 2025
**Feature:** Feature 1 - Model Parameter Support
**Schema Version:** v2.1
**Migration Required:** No

## Overview

This migration adds support for global model parameters (name/signal-type/value tuples) that can be referenced throughout the model. Parameters are stored in the existing JSONB `data` column, requiring no schema changes to the database.

## Schema Changes

### Database Tables

**NO CHANGES REQUIRED**

The `model_versions` table already uses a flexible JSONB `data` column that can accommodate the new parameters structure.

### Model Data Structure

**Previous Structure (v2.0):**
```json
{
  "version": "2.0",
  "metadata": {
    "created": "2025-12-02T00:00:00.000Z",
    "description": "Model description"
  },
  "sheets": [...],
  "globalSettings": {
    "simulationTimeStep": 0.01,
    "simulationDuration": 10.0
  }
}
```

**New Structure (v2.1):**
```json
{
  "version": "2.1",
  "metadata": {
    "created": "2025-12-02T00:00:00.000Z",
    "description": "Model description"
  },
  "sheets": [...],
  "globalSettings": {
    "simulationTimeStep": 0.01,
    "simulationDuration": 10.0
  },
  "parameters": [
    {
      "name": "MY_PARAMETER",
      "signalType": "double",
      "value": 3.14
    },
    {
      "name": "VEC_PARAM",
      "signalType": "double[3]",
      "value": [1.0, 2.0, 3.0]
    },
    {
      "name": "MATRIX_PARAM",
      "signalType": "float[2][3]",
      "value": [[1, 2, 3], [4, 5, 6]]
    }
  ]
}
```

## Backward Compatibility

### Loading Old Models (v2.0 or v1.0)

Models without the `parameters` field will load successfully with an empty parameters array:

```typescript
// In modelStore.ts - initializeFromModel()
const parameters = versionData.data.parameters || []  // Defaults to []
```

**Result:** Old models work without modification.

### Saving Models

New saves will use version "2.1" and include the parameters array:

```typescript
// In modelStore.ts - saveModel()
const modelData = {
  version: "2.1",
  // ...
  parameters: updatedState.parameters
}
```

**Result:** All new saves include parameters (even if empty).

## Validation

### Parameter Name Validation

Parameters are validated at the application level using Zod schemas:

1. **Format:** Must be valid C identifier: `^[a-zA-Z_][a-zA-Z0-9_]*$`
2. **Uniqueness:** Parameter names must be unique within the model
3. **No Conflicts:** Parameter names cannot conflict with top-level block names

### Signal Type Validation

Signal types follow C-language conventions:
- Scalars: `float`, `double`, `long`, `bool`
- Vectors: `float[N]`, `double[N]`, `long[N]`, `bool[N]`
- Matrices: `float[M][N]`, `double[M][N]` (2D arrays only)

### Value Validation

Values must match the declared signal type:
- Scalar types → number
- Vector types → number[]
- Matrix types → number[][]

## Migration Steps

### For Development Environment

**NO ACTION REQUIRED**

The existing database schema supports the new data structure without modification.

### For Production Environment

**NO ACTION REQUIRED**

Simply deploy the updated application code. The database requires no changes.

### Testing Backward Compatibility

1. Load a model created before this migration (v2.0 or v1.0)
2. Verify it loads with `parameters: []`
3. Add a parameter via the UI
4. Save the model
5. Verify the saved version is "2.1" and includes parameters

## Rollback Plan

If rollback is needed:

1. Deploy previous application version
2. Models saved as v2.1 will load but:
   - Parameters field will be ignored (application won't use it)
   - No functional issues (extra fields in JSONB are harmless)
3. Users can continue editing models normally

**Data Loss Risk:** If rollback occurs, parameters added in v2.1 will be ignored but remain in the database. Re-deploying the update will restore access to those parameters.

## Code Changes

### Modified Files

1. **src/lib/modelSchema.ts**
   - Added `ModelParameterSchema`
   - Updated `ModelDataSchema` to include optional `parameters` field
   - Added validation for parameter uniqueness and name conflicts
   - Exported `ModelParameter` type

2. **src/lib/modelStore.ts**
   - Added `parameters: ModelParameter[]` to state
   - Added parameter actions: `addParameter`, `updateParameter`, `deleteParameter`, `getParameter`, `validateParameterName`
   - Updated `saveModel` to include parameters in modelData (version "2.1")
   - Updated `saveAsNewModel` to include parameters
   - Updated `initializeFromModel` to load parameters (with empty array default)

### Database Scripts

None required.

## Verification Checklist

- [x] Schema validation passes for v2.0 models (backward compatibility)
- [x] Schema validation passes for v2.1 models (new structure)
- [x] Parameters default to empty array for old models
- [x] Parameters are saved with new models
- [x] Parameter name validation works (uniqueness, format, conflicts)
- [x] Zustand store actions work (add, update, delete, get)
- [ ] Unit tests added (pending Feature 1.5)
- [ ] Integration tests pass (pending Feature 1.5)

## Notes

- The migration is **non-destructive** and **fully backward compatible**
- No database downtime required
- Models can be loaded and saved regardless of version (1.0, 2.0, 2.1)
- Future migrations can add more fields to the JSONB data without schema changes

## References

- Implementation Plan: `docs/IMPLEMENTATION_PLAN_2025-12.md` - Feature 1
- Model Schema: `src/lib/modelSchema.ts`
- Model Store: `src/lib/modelStore.ts`
