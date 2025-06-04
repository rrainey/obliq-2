// mcp-server/src/config.ts
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables from .env file
// Try multiple locations for flexibility
dotenv.config({ path: path.join(__dirname, '../../.env') });
dotenv.config({ path: path.join(__dirname, '../.env') });
dotenv.config(); // Current directory

// Configuration interface
interface Config {
  port: number;
  apiBaseUrl: string;
  apiToken: string;
  automationToken: string;
  debug: boolean;
}

// Load and validate configuration
function loadConfig(): Config {
  const port = parseInt(process.env.MCP_SERVER_PORT || '3001', 10);
  
  if (isNaN(port) || port < 1 || port > 65535) {
    throw new Error('MCP_SERVER_PORT must be a valid port number between 1 and 65535');
  }
  
  const apiBaseUrl = process.env.MCP_API_BASE_URL || 'http://localhost:3000';
  
  // Validate URL format
  try {
    new URL(apiBaseUrl);
  } catch (error) {
    throw new Error(`MCP_API_BASE_URL is not a valid URL: ${apiBaseUrl}`);
  }
  
  return {
    port,
    apiBaseUrl: apiBaseUrl.replace(/\/$/, ''), // Remove trailing slash
    apiToken: process.env.MCP_API_TOKEN || '',
    automationToken: process.env.AUTOMATION_API_TOKEN || '',
    debug: process.env.MCP_DEBUG === 'true'
  };
}

// Export the loaded configuration
export const config = loadConfig();

// Helper function to mask sensitive values for logging
export function getMaskedConfig(): Record<string, any> {
  return {
    port: config.port,
    apiBaseUrl: config.apiBaseUrl,
    apiToken: config.apiToken ? '***' + config.apiToken.slice(-4) : 'not set',
    automationToken: config.automationToken ? '***' + config.automationToken.slice(-4) : 'not set',
    debug: config.debug
  };
}