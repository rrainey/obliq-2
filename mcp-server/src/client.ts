// mcp-server/src/client.ts
import fetch, { Response } from 'node-fetch';
import { config } from './config.js';

export interface APIResponse<T = any> {
  success: boolean;
  data?: T;
  errors?: string[];
  error?: string;
}

export interface AutomationRequest {
  action: 'generateCode' | 'simulate' | 'validateModel';
  modelId: string;
  version?: number;
  parameters?: Record<string, any>;
}

export class AutomationAPIClient {
  private baseUrl: string;
  private token: string;

  constructor() {
    this.baseUrl = config.apiBaseUrl;
    this.token = config.automationToken;
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
    const url = `${this.baseUrl}/api/automations/${this.token}`;
    
    if (config.debug) {
      console.error(`[API Client] Making request:`, {
        url,
        action,
        modelId,
        version,
        hasParameters: !!parameters
      });
    }
    
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
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
        console.error(`[API Client] Response status: ${response.status}`);
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

      // Handle structured error responses
      if (!response.ok) {
        return {
          success: false,
          error: responseData.error || `API request failed: ${response.status}`,
          errors: responseData.errors || [responseData.error || 'Unknown error']
        };
      }

      // Success response
      return {
        success: responseData.success !== false,
        data: responseData.data || responseData,
        errors: responseData.errors
      };

    } catch (error) {
      console.error('[API Client] Request failed:', error);
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
   * Direct HTTP GET request (for future use)
   */
  async get<T = any>(path: string): Promise<APIResponse<T>> {
    const url = `${this.baseUrl}${path}`;
    
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
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
   * Direct HTTP POST request (for future use)
   */
  async post<T = any>(path: string, body: any): Promise<APIResponse<T>> {
    const url = `${this.baseUrl}${path}`;
    
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
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