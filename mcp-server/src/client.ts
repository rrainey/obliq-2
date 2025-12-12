// mcp-server/src/client.ts
import fetch from 'node-fetch';
import { config } from './config.js';

export interface APIResponse<T = any> {
  success: boolean;
  data?: T;
  errors?: string[];
  error?: string;
  /** Error code (e.g., VALIDATION_ERROR, INTERNAL_ERROR) */
  code?: string;
  /** Detailed error information from the API */
  details?: {
    emccError?: string;
    [key: string]: any;
  };
}

export interface AutomationRequest {
  action: 'generateCode' | 'simulate' | 'validateModel' | 'listModels';
  modelId?: string;
  version?: number;
  parameters?: Record<string, any>;
}

// Helper to mask token for logging
function maskToken(token: string): string {
  if (!token) return 'NOT SET';
  if (token.length <= 8) return '***';
  return '***' + token.slice(-4);
}

export class AutomationAPIClient {
  private baseUrl: string;
  private token: string;

  constructor() {
    this.baseUrl = config.apiBaseUrl;
    this.token = config.apiToken;

    if (!this.token) {
      console.error('[AutomationAPI] WARNING: No API token configured!');
      console.error('[AutomationAPI] Set MCP_API_TOKEN environment variable with a user-specific API token.');
    }
  }

  /**
   * Makes a request to the automation API
   */
  async request<T = any>(
    action: AutomationRequest['action'],
    modelId: string,
    parameters?: any,
    version?: number
  ): Promise<APIResponse<T>> {
    const url = `${this.baseUrl}/api/automations`;

    if (config.debug) {
      console.error(`[AutomationAPI] Making request:`, {
        url,
        action,
        modelId,
        version,
        hasParameters: !!parameters,
        token: maskToken(this.token)
      });
    }

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.token}`
        },
        body: JSON.stringify({
          action,
          modelId,
          version,
          parameters
        })
      });

      const responseText = await response.text();

      if (config.debug) {
        console.error(`[AutomationAPI] Response status: ${response.status}`);
        console.error(`[AutomationAPI] Response body length: ${responseText.length} chars`);
      }

      // Try to parse as JSON
      let responseData: any;
      try {
        responseData = JSON.parse(responseText);
      } catch (e) {
        // Not JSON response
        if (!response.ok) {
          return {
            success: false,
            error: `API request failed: ${response.status} ${response.statusText}`,
            errors: [responseText]
          };
        }
        // Non-JSON success response?
        return {
          success: true,
          data: responseText as T
        };
      }

      if (config.debug) {
        console.error(`[AutomationAPI] Parsed response:`, JSON.stringify(responseData, null, 2));
      }

      // Handle structured error responses
      if (!response.ok) {
        return {
          success: false,
          error: responseData.error || `API request failed: ${response.status}`,
          errors: responseData.errors || [responseData.error || 'Unknown error'],
          code: responseData.code,
          details: responseData.details
        };
      }

      // Success response
      return {
        success: responseData.success !== false,
        data: responseData.data || responseData,
        errors: responseData.errors,
        code: responseData.code,
        details: responseData.details
      };

    } catch (error) {
      console.error('[AutomationAPI] Request failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        errors: [error instanceof Error ? error.message : 'Unknown error']
      };
    }
  }

  /**
   * Generate C code for a model
   */
  async generateCode(modelId: string, version?: number): Promise<APIResponse> {
    return this.request('generateCode', modelId, undefined, version);
  }

  /**
   * Run simulation for a model
   */
  async simulate(
    modelId: string,
    parameters?: { timeStep?: number; duration?: number },
    version?: number
  ): Promise<APIResponse> {
    return this.request('simulate', modelId, parameters, version);
  }

  /**
   * Validate a model
   */
  async validateModel(modelId: string, version?: number): Promise<APIResponse> {
    return this.request('validateModel', modelId, undefined, version);
  }

  /**
   * List all models owned by the authenticated user
   */
  async listModels(): Promise<APIResponse> {
    const url = `${this.baseUrl}/api/automations`;

    if (config.debug) {
      console.error(`[AutomationAPI] Making listModels request:`, {
        url,
        token: maskToken(this.token)
      });
    }

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.token}`
        },
        body: JSON.stringify({
          action: 'listModels'
        })
      });

      const responseText = await response.text();

      if (config.debug) {
        console.error(`[AutomationAPI] Response status: ${response.status}`);
        console.error(`[AutomationAPI] Response body length: ${responseText.length} chars`);
      }

      let responseData: any;
      try {
        responseData = JSON.parse(responseText);
      } catch (e) {
        if (!response.ok) {
          return {
            success: false,
            error: `API request failed: ${response.status} ${response.statusText}`,
            errors: [responseText]
          };
        }
        return {
          success: true,
          data: responseText
        };
      }

      if (config.debug) {
        console.error(`[AutomationAPI] Parsed response:`, JSON.stringify(responseData, null, 2));
      }

      if (!response.ok) {
        return {
          success: false,
          error: responseData.error || `API request failed: ${response.status}`,
          errors: responseData.errors || [responseData.error || 'Unknown error'],
          code: responseData.code,
          details: responseData.details
        };
      }

      return {
        success: responseData.success !== false,
        data: responseData.data || responseData,
        errors: responseData.errors,
        code: responseData.code,
        details: responseData.details
      };

    } catch (error) {
      console.error('[AutomationAPI] listModels request failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        errors: [error instanceof Error ? error.message : 'Unknown error']
      };
    }
  }

  /**
   * Direct HTTP GET request with authentication
   */
  async get<T = any>(path: string): Promise<APIResponse<T>> {
    const url = `${this.baseUrl}${path}`;

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.token}`
        }
      });

      const data = await response.json() as any;

      if (!response.ok) {
        return {
          success: false,
          error: `GET request failed: ${response.status}`,
          errors: [data?.error || 'Unknown error']
        };
      }

      return {
        success: true,
        data: data as T
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        errors: [error instanceof Error ? error.message : 'Unknown error']
      };
    }
  }

  /**
   * Direct HTTP POST request with authentication
   */
  async post<T = any>(path: string, body: any): Promise<APIResponse<T>> {
    const url = `${this.baseUrl}${path}`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.token}`
        },
        body: JSON.stringify(body)
      });

      const data = await response.json() as any;

      if (!response.ok) {
        return {
          success: false,
          error: `POST request failed: ${response.status}`,
          errors: [data?.error || 'Unknown error']
        };
      }

      return {
        success: true,
        data: data as T
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        errors: [error instanceof Error ? error.message : 'Unknown error']
      };
    }
  }
}

// Export a singleton instance
export const apiClient = new AutomationAPIClient();
