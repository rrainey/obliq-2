# Model Builder API Documentation

The Model Builder API provides programmatic access to create, modify, and inspect visual models. This API is designed for automated testing, external tools, and programmatic model construction.

## Table of Contents

1. [Authentication](#authentication)
2. [Rate Limiting](#rate-limiting)
3. [Error Handling](#error-handling)
4. [Endpoints](#endpoints)
   - [Model Operations](#model-operations)
   - [Sheet Operations](#sheet-operations)
   - [Block Operations](#block-operations)
   - [Connection Operations](#connection-operations)
   - [Validation & Metadata](#validation--metadata)
   - [Batch Operations](#batch-operations)
5. [Examples](#examples)
6. [Error Codes](#error-codes)

## Authentication

The API uses token-based authentication. Include your API token in the URL path:

```
https://your-app.com/api/model-builder/{TOKEN}/
```

Set the `MODEL_BUILDER_API_TOKEN` environment variable on your server.

## Rate Limiting

- **Limit**: 100 requests per minute per token
- **Window**: 1-minute sliding window
- **Response**: HTTP 429 with `Retry-After` header when exceeded

## Error Handling

All error responses follow this format:

```json
{
  "success": false,
  "timestamp": "2024-03-15T10:30:00.000Z",
  "error": "Error message",
  "code": "ERROR_CODE",
  "details": { /* optional context */ }
}
```

## Endpoints

### Model Operations

#### Get Model
Retrieve complete model data including all sheets, blocks, and connections.

```http
GET /api/model-builder/{TOKEN}?modelId={MODEL_ID}
```

**Response:**
```json
{
  "success": true,
  "timestamp": "2024-03-15T10:30:00.000Z",
  "data": {
    "id": "123e4567-e89b-12d3-a456-426614174000",
    "name": "My Model",
    "user_id": "user-123",
    "data": { /* full model JSON */ },
    "created_at": "2024-03-01T08:00:00.000Z",
    "updated_at": "2024-03-15T10:00:00.000Z"
  }
}
```

#### Get Model Metadata
Retrieve model information without the full data.

```http
GET /api/model-builder/{TOKEN}?action=getModelMetadata&modelId={MODEL_ID}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "123e4567-e89b-12d3-a456-426614174000",
    "name": "My Model",
    "userId": "user-123",
    "latestVersion": 15,
    "versionCount": 15,
    "createdAt": "2024-03-01T08:00:00.000Z",
    "updatedAt": "2024-03-15T10:00:00.000Z",
    "statistics": {
      "sheetCount": 3,
      "totalBlocks": 25,
      "totalConnections": 18
    }
  }
}
```

#### Create Model
Create a new empty model.

```http
POST /api/model-builder/{TOKEN}
Content-Type: application/json

{
  "action": "createModel",
  "name": "New Model",
  "userId": "user-123"
}
```

#### Update Model Name
Rename an existing model.

```http
PUT /api/model-builder/{TOKEN}
Content-Type: application/json

{
  "action": "updateModelName",
  "modelId": "123e4567-e89b-12d3-a456-426614174000",
  "name": "Updated Model Name"
}
```

#### Delete Model
Permanently delete a model and all its versions.

```http
DELETE /api/model-builder/{TOKEN}?modelId={MODEL_ID}
```

### Sheet Operations

#### List Sheets
Get all sheets in a model.

```http
GET /api/model-builder/{TOKEN}?action=listSheets&modelId={MODEL_ID}
```

#### Create Sheet
Add a new sheet to a model.

```http
POST /api/model-builder/{TOKEN}
Content-Type: application/json

{
  "action": "createSheet",
  "modelId": "123e4567-e89b-12d3-a456-426614174000",
  "name": "New Sheet"  // optional
}
```

#### Rename Sheet
Update a sheet's name.

```http
PUT /api/model-builder/{TOKEN}
Content-Type: application/json

{
  "action": "renameSheet",
  "modelId": "123e4567-e89b-12d3-a456-426614174000",
  "sheetId": "main",
  "newName": "Controller Logic"
}
```

#### Delete Sheet
Remove a sheet from a model.

```http
DELETE /api/model-builder/{TOKEN}?action=deleteSheet&modelId={MODEL_ID}&sheetId={SHEET_ID}
```

#### Clone Sheet
Create a copy of an existing sheet.

```http
POST /api/model-builder/{TOKEN}
Content-Type: application/json

{
  "action": "cloneSheet",
  "modelId": "123e4567-e89b-12d3-a456-426614174000",
  "sheetId": "main",
  "newName": "Main (Copy)"  // optional
}
```

#### Clear Sheet
Remove all blocks and connections from a sheet.

```http
DELETE /api/model-builder/{TOKEN}?action=clearSheet&modelId={MODEL_ID}&sheetId={SHEET_ID}
```

#### Import Sheet
Add a sheet from JSON data.

```http
POST /api/model-builder/{TOKEN}
Content-Type: application/json

{
  "action": "importSheet",
  "modelId": "123e4567-e89b-12d3-a456-426614174000",
  "sheetData": {
    "id": "original_id",
    "name": "Imported Sheet",
    "blocks": [...],
    "connections": [...],
    "extents": { "width": 2000, "height": 2000 }
  },
  "overrideId": "custom_id",    // optional
  "overrideName": "Custom Name"  // optional
}
```

#### Export Sheet
Get a sheet as standalone JSON.

```http
GET /api/model-builder/{TOKEN}?action=exportSheet&modelId={MODEL_ID}&sheetId={SHEET_ID}
```

### Block Operations

#### List Blocks
Get all blocks in a sheet.

```http
GET /api/model-builder/{TOKEN}?action=listBlocks&modelId={MODEL_ID}&sheetId={SHEET_ID}
```

#### Get Block
Get details of a specific block.

```http
GET /api/model-builder/{TOKEN}?action=getBlock&modelId={MODEL_ID}&sheetId={SHEET_ID}&blockId={BLOCK_ID}
```

#### Add Block
Create a new block on a sheet.

```http
POST /api/model-builder/{TOKEN}
Content-Type: application/json

{
  "action": "addBlock",
  "modelId": "123e4567-e89b-12d3-a456-426614174000",
  "sheetId": "main",
  "blockType": "sum",
  "name": "Summer1",              // optional
  "position": { "x": 100, "y": 200 },  // optional
  "parameters": { "numInputs": 3 }     // optional
}
```

**Supported Block Types:**
- `source` - Constant or signal generator
- `input_port` - External input
- `sum` - Addition block
- `multiply` - Multiplication block
- `scale` - Scalar multiplication
- `transfer_function` - Laplace transfer function
- `lookup_1d` - 1D lookup table
- `lookup_2d` - 2D lookup table
- `output_port` - External output
- `signal_display` - Signal visualization
- `signal_logger` - Data logging
- `sheet_label_sink` - Sheet connection sink
- `sheet_label_source` - Sheet connection source
- `subsystem` - Nested subsystem

#### Update Block Position
Move a block to a new position.

```http
PUT /api/model-builder/{TOKEN}
Content-Type: application/json

{
  "action": "updateBlockPosition",
  "modelId": "123e4567-e89b-12d3-a456-426614174000",
  "sheetId": "main",
  "blockId": "block_123",
  "position": { "x": 300, "y": 400 }
}
```

#### Update Block Name
Rename a block.

```http
PUT /api/model-builder/{TOKEN}
Content-Type: application/json

{
  "action": "updateBlockName",
  "modelId": "123e4567-e89b-12d3-a456-426614174000",
  "sheetId": "main",
  "blockId": "block_123",
  "name": "MotorController"
}
```

#### Update Block Parameters
Modify block-specific parameters.

```http
PUT /api/model-builder/{TOKEN}
Content-Type: application/json

{
  "action": "updateBlockParameters",
  "modelId": "123e4567-e89b-12d3-a456-426614174000",
  "sheetId": "main",
  "blockId": "block_123",
  "parameters": {
    "numerator": [1, 2],
    "denominator": [1, 3, 1]
  }
}
```

#### Delete Block
Remove a block and its connections.

```http
DELETE /api/model-builder/{TOKEN}?action=deleteBlock&modelId={MODEL_ID}&sheetId={SHEET_ID}&blockId={BLOCK_ID}
```

#### Get Block Ports
Get port information and connection status.

```http
GET /api/model-builder/{TOKEN}?action=getBlockPorts&modelId={MODEL_ID}&sheetId={SHEET_ID}&blockId={BLOCK_ID}
```

### Connection Operations

#### List Connections
Get all connections in a sheet.

```http
GET /api/model-builder/{TOKEN}?action=listConnections&modelId={MODEL_ID}&sheetId={SHEET_ID}
```

#### Get Connection
Get details of a specific connection.

```http
GET /api/model-builder/{TOKEN}?action=getConnection&modelId={MODEL_ID}&sheetId={SHEET_ID}&connectionId={CONNECTION_ID}
```

#### Add Connection
Create a wire between blocks.

```http
POST /api/model-builder/{TOKEN}
Content-Type: application/json

{
  "action": "addConnection",
  "modelId": "123e4567-e89b-12d3-a456-426614174000",
  "sheetId": "main",
  "sourceBlockId": "block_1",
  "sourcePort": "output",
  "targetBlockId": "block_2",
  "targetPort": "input1"
}
```

#### Delete Connection
Remove a wire between blocks.

```http
DELETE /api/model-builder/{TOKEN}?action=deleteConnection&modelId={MODEL_ID}&sheetId={SHEET_ID}&connectionId={CONNECTION_ID}
```

### Validation & Metadata

#### Validate Model
Check model for errors and warnings.

```http
POST /api/model-builder/{TOKEN}
Content-Type: application/json

{
  "action": "validateModel",
  "modelId": "123e4567-e89b-12d3-a456-426614174000"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "modelId": "123e4567-e89b-12d3-a456-426614174000",
    "valid": false,
    "errors": [
      "Block 'Sum1' has no input connections",
      "Sheet label source 'Signal1' has no matching sink"
    ],
    "warnings": [
      "Sheet 'Unused' has no blocks"
    ],
    "summary": {
      "sheetCount": 3,
      "totalBlocks": 15,
      "totalConnections": 12,
      "errorCount": 2,
      "warningCount": 1
    }
  }
}
```

### Batch Operations

Execute multiple operations in a single request.

```http
POST /api/model-builder/{TOKEN}
Content-Type: application/json

{
  "action": "batchOperations",
  "transactional": true,  // optional, default false
  "operations": [
    {
      "id": "op1",
      "action": "addBlock",
      "modelId": "123e4567-e89b-12d3-a456-426614174000",
      "sheetId": "main",
      "blockType": "source",
      "position": { "x": 100, "y": 100 }
    },
    {
      "id": "op2",
      "action": "addBlock",
      "modelId": "123e4567-e89b-12d3-a456-426614174000",
      "sheetId": "main",
      "blockType": "sum",
      "position": { "x": 300, "y": 100 }
    }
  ]
}
```

**Transactional Mode:**
- When `transactional: true`, all operations must succeed or all are rolled back
- Failed operations stop execution in transactional mode
- Non-transactional mode continues after failures

## Examples

### Building a Simple Model

```javascript
// 1. Create a model
const model = await fetch('/api/model-builder/TOKEN', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    action: 'createModel',
    name: 'Temperature Controller',
    userId: 'user-123'
  })
});
const { data: { id: modelId } } = await model.json();

// 2. Add blocks using batch operations
await fetch('/api/model-builder/TOKEN', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    action: 'batchOperations',
    operations: [
      {
        action: 'addBlock',
        modelId,
        sheetId: 'main',
        blockType: 'source',
        name: 'SetPoint',
        position: { x: 100, y: 100 },
        parameters: { value: '25.0', dataType: 'double' }
      },
      {
        action: 'addBlock',
        modelId,
        sheetId: 'main',
        blockType: 'transfer_function',
        name: 'PIController',
        position: { x: 300, y: 100 },
        parameters: {
          numerator: [1, 0.1],
          denominator: [1, 0]
        }
      }
    ]
  })
});

// 3. Connect blocks
await fetch('/api/model-builder/TOKEN', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    action: 'addConnection',
    modelId,
    sheetId: 'main',
    sourceBlockId: 'block_xxx',  // Use actual IDs from responses
    sourcePort: 'output',
    targetBlockId: 'block_yyy',
    targetPort: 'input'
  })
});

// 4. Validate the model
const validation = await fetch('/api/model-builder/TOKEN', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    action: 'validateModel',
    modelId
  })
});
```

## Error Codes

| Code | Description | HTTP Status |
|------|-------------|-------------|
| `UNAUTHORIZED` | Invalid or missing API token | 401 |
| `RATE_LIMIT_EXCEEDED` | Too many requests | 429 |
| `INVALID_REQUEST` | Malformed request | 400 |
| `MISSING_PARAMETER` | Required parameter missing | 400 |
| `MODEL_NOT_FOUND` | Model doesn't exist | 404 |
| `SHEET_NOT_FOUND` | Sheet doesn't exist | 404 |
| `BLOCK_NOT_FOUND` | Block doesn't exist | 404 |
| `CONNECTION_NOT_FOUND` | Connection doesn't exist | 404 |
| `INVALID_BLOCK_TYPE` | Unknown block type | 400 |
| `DUPLICATE_NAME` | Name already exists | 400 |
| `INVALID_CONNECTION` | Connection rule violation | 400 |
| `PORT_ALREADY_CONNECTED` | Input port can only have one incoming connection | 400 |
| `VALIDATION_FAILED` | Parameter validation error | 400 |
| `SERVER_ERROR` | Internal server error | 500 |

## Best Practices

1. **Use Batch Operations** for creating complex models to reduce API calls
2. **Validate Models** before simulation or code generation
3. **Handle Rate Limits** by implementing exponential backoff
4. **Store Block IDs** returned from creation for subsequent operations
5. **Use Transactional Mode** for critical operations that must succeed together
6. **Check Error Codes** for programmatic error handling
7. **Log Operations** for debugging and audit trails

## Migration from UI

To migrate models created in the UI to API-based construction:

1. Export the model using `GET /api/model-builder/{TOKEN}?modelId={MODEL_ID}`
2. Extract sheet data using the export sheet endpoint
3. Use the import sheet endpoint to recreate in a new model
4. Adjust IDs and parameters as needed

## Support

For questions or issues with the Model Builder API:
- Check application logs for detailed error messages
- Ensure your API token is valid and has appropriate permissions
- Verify rate limits aren't being exceeded
- Contact your system administrator for token provisioning