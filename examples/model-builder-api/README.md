# Model Builder API Examples

This directory contains example scripts demonstrating how to use the Model Builder API to programmatically create and manipulate models in the obliq-2 visual modeling application.

## Setup

1. Install dependencies:
```bash
npm install
```

2. Set your environment variables in a `.env` file:
```env
MODEL_BUILDER_API_TOKEN=your-api-token
MODEL_BUILDER_API_URL=http://localhost:3000/api/model-builder
```

## Examples

### 1. Basic Model Creation (`basic-model.ts`)
Creates a simple model with basic blocks and connections.

```bash
npm run example:basic
```

### 2. Control System Model (`control-system.ts`)
Builds a complete PID control system with feedback loop.

```bash
npm run example:control
```

### 3. Multi-Sheet Model (`multi-sheet.ts`)
Demonstrates creating a model with multiple sheets and sheet labels for cross-sheet connections.

```bash
npm run example:multisheet
```

### 4. Signal Processing Model (`signal-processing.ts`)
Creates a signal processing chain with filters and transformations.

```bash
npm run example:signal
```

### 5. Batch Operations (`batch-operations.ts`)
Shows how to use batch operations for efficient model construction.

```bash
npm run example:batch
```

### 6. Model Validation (`validation-example.ts`)
Demonstrates model validation and error handling.

```bash
npm run example:validate
```

### 7. Full Integration Test (`full-integration-test.ts`)
Comprehensive test suite that exercises all Model Builder API endpoints.

```bash
npm run test:integration
```

This test creates a complex model using all features and validates the entire API surface.

## Running All Examples

To run all examples in sequence:

```bash
npm run examples:all
```

## API Client Usage

Each example uses the `ModelBuilderApiClient` from the main application. The client provides typed methods for all API operations:

```typescript
import { createModelBuilderApiClient } from '../../../lib/modelBuilderApiClient';

const client = createModelBuilderApiClient(
  process.env.MODEL_BUILDER_API_URL!,
  process.env.MODEL_BUILDER_API_TOKEN!
);

// Create a model
const modelResponse = await client.createModel('My Model', 'user-id');

// Add blocks, connections, etc.
```

## Common Patterns

### Error Handling
```typescript
const response = await client.addBlock(...);
if (!client.isSuccess(response)) {
  console.error('Failed:', response.error);
  return;
}
```

### Block Positioning
```typescript
const position = { x: 100, y: 200 };
await client.addBlock(modelId, sheetId, 'sum', 'Sum1', position);
```

### Creating Connections
```typescript
await client.addConnection(
  modelId, 
  sheetId,
  sourceBlockId, 
  'output',
  targetBlockId, 
  'input0'
);
```