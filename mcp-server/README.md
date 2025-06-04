# MCP Server for Obliq2 Visual Modeling Application

This Model Context Protocol (MCP) server provides programmatic access to the Obliq2 visual modeling and simulation application. It acts as a bridge between MCP clients (like AI assistants) and the Obliq2 automation API.

## Overview

The MCP server exposes 17 tools across 5 categories:
- **Model Management** - Query existing models
- **Model Construction** - Document model modification operations (read-only in current API)
- **Simulation** - Run simulations and get results
- **Validation** - Validate model structure
- **Code Generation** - Generate C code from models

## Prerequisites

- Node.js 18+ and npm
- Access to a running Obliq2 application instance
- Automation API token from your Obliq2 deployment

## Installation

1. Clone the repository and navigate to the MCP server directory:
```bash
cd mcp-server
```

2. Install dependencies:
```bash
npm install
```

3. Create a `.env` file with your configuration:
```bash
cp .env.example .env
```

4. Edit `.env` with your values:
```env
# MCP Server Configuration
MCP_SERVER_PORT=3001
MCP_API_BASE_URL=http://localhost:3000

# Authentication tokens
MCP_API_TOKEN=your-mcp-authentication-token
AUTOMATION_API_TOKEN=your-automation-api-token

# Debug mode (optional)
MCP_DEBUG=false
```

## Running the Server

### Development mode (with auto-reload):
```bash
npm run dev
```

### Production mode:
```bash
npm run build
npm start
```

## Configuration

| Environment Variable | Description | Required | Default |
|---------------------|-------------|----------|---------|
| MCP_SERVER_PORT | Port number for the MCP server | No | 3001 |
| MCP_API_BASE_URL | Base URL of the Obliq2 API | No | http://localhost:3000 |
| MCP_API_TOKEN | Token for MCP authentication | No | (auth disabled if not set) |
| AUTOMATION_API_TOKEN | Token for Obliq2 automation API | Yes | - |
| MCP_DEBUG | Enable debug logging | No | false |

## Available Tools

### Model Management

#### get_model
Retrieve basic information about a model.
```json
{
  "modelId": "123e4567-e89b-12d3-a456-426614174000",
  "version": 2  // optional
}
```

#### list_models
Not available - requires user authentication.

#### create_model
Not available - requires user authentication.

#### delete_model
Not available - requires user authentication.

### Simulation

#### run_simulation
Execute a simulation on a model.
```json
{
  "modelId": "123e4567-e89b-12d3-a456-426614174000",
  "version": 1,      // optional
  "timeStep": 0.01,  // optional, default: 0.01
  "duration": 10.0   // optional, default: 10.0
}
```

Returns simulation summary with output port values and signal statistics.

#### get_simulation_results
Not available - detailed time series data not provided by automation API.

### Validation

#### validate_model
Check a model for structural errors.
```json
{
  "modelId": "123e4567-e89b-12d3-a456-426614174000",
  "version": 1  // optional
}
```

Returns errors, warnings, and block statistics.

#### list_sheet_labels
Not available - requires access to full model structure.

#### validate_sheet_labels
Not available - requires access to full model structure.

### Code Generation

#### generate_code
Generate C code from a model.
```json
{
  "modelId": "123e4567-e89b-12d3-a456-426614174000",
  "version": 1  // optional
}
```

Returns list of generated files and summary statistics.

#### get_generated_files
Not available - files are generated on-demand and not stored.

### Model Construction

All construction tools (add_sheet, add_block, update_block, delete_block, add_connection, delete_connection) return informative messages explaining that model modification is not available through the automation API. These operations require the future Model Builder API.

## Authentication

The MCP server supports token-based authentication. If `MCP_API_TOKEN` is set, clients must provide the token in their requests. The token can be provided in:
- `params.auth.token`
- `params._auth`
- `metadata.token`
- `metadata.authorization` (with or without "Bearer " prefix)

## Error Handling

The server provides detailed error messages for:
- Invalid model IDs (must be valid UUIDs)
- Missing required parameters
- API failures
- Timeout errors (30-second limit)

Enable debug mode (`MCP_DEBUG=true`) for stack traces and additional logging.

## Logging

All requests are logged to stderr with:
- Timestamp
- Tool name
- Execution duration
- Success/failure status
- Error messages (if any)
- Request arguments (in debug mode only)

## Architecture Notes

The MCP server acts as a protocol adapter:
- Receives MCP tool calls via stdio
- Translates them to HTTP requests to the Obliq2 automation API
- Returns structured responses

It does NOT:
- Store any state
- Access the database directly
- Modify models (automation API is read-only)
- Provide user authentication

## Future Enhancements

Model modification capabilities will be available when the Model Builder API is implemented. This will enable:
- Creating new models from scratch
- Adding/modifying sheets, blocks, and connections
- Full CRUD operations with proper versioning

## Troubleshooting

### "AUTOMATION_API_TOKEN environment variable not set"
Set the token in your `.env` file or environment.

### "Invalid model ID format"
Ensure model IDs are valid UUIDs (e.g., `123e4567-e89b-12d3-a456-426614174000`).

### "Tool execution timeout"
Operations are limited to 30 seconds. Check network connectivity to the Obliq2 API.

### Authentication failures
Verify your MCP_API_TOKEN matches what the client is sending.

## Support

For issues specific to the MCP server, check the logs and ensure your configuration is correct. For Obliq2-specific questions, refer to the main application documentation.