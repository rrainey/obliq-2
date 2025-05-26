# Automation API Documentation

The Automation API allows external systems to programmatically interact with visual models for CI/CD pipelines, automated testing, and validation workflows.

## Authentication

The API uses token-based authentication. Set the `AUTOMATION_API_TOKEN` environment variable on your server.

```bash
AUTOMATION_API_TOKEN=your-secure-token-here
```

## Endpoint

```
POST /api/automations/{token}
```

## Request Format

```json
{
  "action": "generateCode | simulate | validateModel",
  "modelId": "uuid-of-the-model",
  "parameters": {
    // Optional action-specific parameters
  }
}
```

## Actions

### 1. Generate Code

Generates C code for the specified model.

**Request:**
```json
{
  "action": "generateCode",
  "modelId": "123e4567-e89b-12d3-a456-426614174000"
}
```

**Response:**
```json
{
  "success": true,
  "action": "generateCode",
  "modelId": "123e4567-e89b-12d3-a456-426614174000",
  "timestamp": "2024-03-15T10:30:00.000Z",
  "data": {
    "filesGenerated": ["MyModel.h", "MyModel.c", "library.properties"],
    "summary": {
      "headerFile": "MyModel.h",
      "sourceFile": "MyModel.c", 
      "libraryConfig": "library.properties",
      "blocksProcessed": 5,
      "wiresProcessed": 4
    }
  }
}
```

### 2. Simulate Model

Runs a simulation of the model and returns results summary.

**Request:**
```json
{
  "action": "simulate",
  "modelId": "123e4567-e89b-12d3-a456-426614174000",
  "parameters": {
    "timeStep": 0.01,
    "duration": 5.0
  }
}
```

**Response:**
```json
{
  "success": true,
  "action": "simulate", 
  "modelId": "123e4567-e89b-12d3-a456-426614174000",
  "timestamp": "2024-03-15T10:30:00.000Z",
  "data": {
    "simulationDuration": 5.0,
    "timePoints": 500,
    "outputPorts": {
      "Output1": 2.456,
      "ControlSignal": 1.234
    },
    "signals": {
      "Display1": {
        "type": "signal_display",
        "samples": 500,
        "finalValue": 2.456,
        "min": -1.2,
        "max": 3.1,
        "average": 1.8
      }
    },
    "config": {
      "timeStep": 0.01,
      "duration": 5.0
    }
  }
}
```

### 3. Validate Model

Validates the model structure and reports issues.

**Request:**
```json
{
  "action": "validateModel",
  "modelId": "123e4567-e89b-12d3-a456-426614174000"
}
```

**Response:**
```json
{
  "success": true,
  "action": "validateModel",
  "modelId": "123e4567-e89b-12d3-a456-426614174000", 
  "timestamp": "2024-03-15T10:30:00.000Z",
  "data": {
    "validation": {
      "errors": [],
      "warnings": [
        "Model has no output ports - generated code will have no outputs"
      ],
      "blockCounts": {
        "source": 1,
        "sum": 2,
        "signal_display": 1
      },
      "totalBlocks": 4,
      "totalWires": 3,
      "sheets": 1
    }
  }
}
```

## Error Responses

### Invalid Token
```json
{
  "success": false,
  "error": "Invalid or missing automation token",
  "timestamp": "2024-03-15T10:30:00.000Z"
}
```

### Model Not Found
```json
{
  "success": false,
  "action": "simulate",
  "modelId": "invalid-id",
  "timestamp": "2024-03-15T10:30:00.000Z",
  "errors": ["Model not found"]
}
```

### Validation Errors
```json
{
  "success": false,
  "action": "validateModel",
  "modelId": "123e4567-e89b-12d3-a456-426614174000",
  "timestamp": "2024-03-15T10:30:00.000Z", 
  "errors": [
    "Block Sum1 (sum) has 0/1 required inputs connected",
    "Model contains no blocks"
  ]
}
```

## Usage Examples

### CI/CD Pipeline Integration

**GitHub Actions Example:**
```yaml
name: Model Validation
on: [push, pull_request]

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - name: Validate Model
        run: |
          curl -X POST "${{ secrets.MODEL_API_URL }}/api/automations/${{ secrets.AUTOMATION_TOKEN }}" \
            -H "Content-Type: application/json" \
            -d '{
              "action": "validateModel",
              "modelId": "${{ vars.MODEL_ID }}"
            }'
```

### Automated Code Generation

**Shell Script Example:**
```bash
#!/bin/bash
MODEL_ID="123e4567-e89b-12d3-a456-426614174000"
API_TOKEN="your-secure-token"
API_URL="https://your-app.com"

# Generate code
response=$(curl -s -X POST "$API_URL/api/automations/$API_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"action\":\"generateCode\",\"modelId\":\"$MODEL_ID\"}")

if [[ $(echo $response | jq -r '.success') == "true" ]]; then
  echo "Code generation successful"
  echo $response | jq '.data.summary'
else
  echo "Code generation failed"
  echo $response | jq '.errors'
  exit 1
fi
```

### Model Testing

**Python Example:**
```python
import requests
import json

def test_model(model_id, token, base_url):
    # First validate
    response = requests.post(f"{base_url}/api/automations/{token}", 
        json={
            "action": "validateModel",
            "modelId": model_id
        })
    
    if not response.json()["success"]:
        print("Validation failed:", response.json()["errors"])
        return False
    
    # Then simulate
    response = requests.post(f"{base_url}/api/automations/{token}",
        json={
            "action": "simulate", 
            "modelId": model_id,
            "parameters": {"duration": 10.0}
        })
    
    if response.json()["success"]:
        results = response.json()["data"]
        print(f"Simulation completed: {results['timePoints']} time points")
        print(f"Output ports: {results['outputPorts']}")
        return True
    else:
        print("Simulation failed:", response.json()["errors"])
        return False

# Usage
test_model("your-model-id", "your-token", "https://your-app.com")
```

## Security Notes

1. **Keep tokens secure** - Store in environment variables, not in code
2. **Use HTTPS** - Always use encrypted connections in production  
3. **Rotate tokens** - Regularly update automation tokens
4. **Monitor usage** - Log and monitor API usage for security
5. **Scope access** - Consider separate tokens for different automation needs

## Rate Limiting

The API currently has no built-in rate limiting, but consider implementing it for production use to prevent abuse.

## Support

For questions about the Automation API, check the application logs or contact your system administrator.