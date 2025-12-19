// mcp-server/src/modelBuilderClient.ts
import fetch from 'node-fetch';
import { config } from './config.js';

export interface ModelBuilderResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  errors?: string[];
}

// Helper to mask sensitive data for logging
function maskToken(token: string): string {
  if (!token) return 'NOT SET';
  if (token.length <= 8) return '***';
  return '***' + token.slice(-4);
}

// Debug logger that always outputs to stderr
function debugLog(category: string, message: string, data?: any) {
  if (config.debug) {
    const timestamp = new Date().toISOString();
    console.error(`[${timestamp}] [ModelBuilderAPI:${category}] ${message}`);
    if (data !== undefined) {
      console.error(`[${timestamp}] [ModelBuilderAPI:${category}] Data:`, JSON.stringify(data, null, 2));
    }
  }
}

// Always log initialization
function initLog(message: string, data?: any) {
  const timestamp = new Date().toISOString();
  console.error(`[${timestamp}] [ModelBuilderAPI:INIT] ${message}`);
  if (data !== undefined) {
    console.error(`[${timestamp}] [ModelBuilderAPI:INIT]`, data);
  }
}

export class ModelBuilderAPIClient {
  private baseUrl: string;
  private token: string;
  private requestCounter: number = 0;

  constructor() {
    // Use the user-specific API token from config
    this.baseUrl = `${config.apiBaseUrl}/api/model-builder`;
    this.token = config.apiToken;

    // Always log initialization details
    initLog('ModelBuilderAPIClient initialized', {
      baseUrl: this.baseUrl,
      tokenSet: !!this.token,
      tokenMasked: maskToken(this.token),
      debugEnabled: config.debug,
      configSnapshot: {
        port: config.port,
        apiBaseUrl: config.apiBaseUrl,
        debug: config.debug
      }
    });

    if (!this.token) {
      console.error('[ModelBuilderAPI:INIT] WARNING: No API token configured!');
      console.error('[ModelBuilderAPI:INIT] Set MCP_API_TOKEN environment variable with a user-specific API token.');
      console.error('[ModelBuilderAPI:INIT] Generate a token at: /settings/tokens in the web application.');
    }
  }

  private async request<T>(
    method: string,
    endpoint: string,
    body?: any
  ): Promise<ModelBuilderResponse<T>> {
    const requestId = ++this.requestCounter;
    const url = `${this.baseUrl}${endpoint}`;
    const startTime = Date.now();

    // Always log requests (not just in debug mode) - helps diagnose issues
    console.error(`\n========== REQUEST #${requestId} ==========`);
    console.error(`[Request #${requestId}] ${method} ${url}`);
    console.error(`[Request #${requestId}] Debug mode: ${config.debug}`);
    console.error(`[Request #${requestId}] Token: ${maskToken(this.token)}`);

    if (body) {
      // Log body but mask any sensitive fields
      const sanitizedBody = { ...body };
      if (sanitizedBody.token) sanitizedBody.token = maskToken(sanitizedBody.token);
      if (sanitizedBody.password) sanitizedBody.password = '***';
      console.error(`[Request #${requestId}] Body:`, JSON.stringify(sanitizedBody, null, 2));
    }

    try {
      const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.token}`
      };

      debugLog('REQUEST', `Headers (sanitized):`, {
        'Content-Type': headers['Content-Type'],
        'Authorization': `Bearer ${maskToken(this.token)}`
      });

      const fetchOptions: any = {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined
      };

      console.error(`[Request #${requestId}] Sending fetch request...`);
      const response = await fetch(url, fetchOptions);
      const elapsed = Date.now() - startTime;

      console.error(`[Request #${requestId}] Response received in ${elapsed}ms`);
      console.error(`[Request #${requestId}] Status: ${response.status} ${response.statusText}`);

      // Log response headers in debug mode
      if (config.debug) {
        const responseHeaders: Record<string, string> = {};
        response.headers.forEach((value, key) => {
          responseHeaders[key] = value;
        });
        debugLog('RESPONSE', `Headers:`, responseHeaders);
      }

      const responseText = await response.text();
      console.error(`[Request #${requestId}] Response body length: ${responseText.length} chars`);

      let data: ModelBuilderResponse<T>;
      try {
        data = JSON.parse(responseText) as ModelBuilderResponse<T>;
      } catch (parseError) {
        console.error(`[Request #${requestId}] ERROR: Failed to parse JSON response`);
        console.error(`[Request #${requestId}] Raw response (first 500 chars): ${responseText.substring(0, 500)}`);
        return {
          success: false,
          error: `Invalid JSON response: ${responseText.substring(0, 100)}`,
          errors: ['Failed to parse API response as JSON']
        };
      }

      // Log full response in debug mode
      console.error(`[Request #${requestId}] Parsed response:`, JSON.stringify(data, null, 2));

      if (!data.success) {
        console.error(`[Request #${requestId}] API returned error: ${data.error || 'Unknown error'}`);
        // Check for errors in both locations (top-level and in details)
        const errors = data.errors || (data as any).details?.errors;
        if (errors) {
          console.error(`[Request #${requestId}] Error details:`, errors);
          // Ensure errors are available at the top level for consumers
          data.errors = errors;
        }
      }

      console.error(`========== END REQUEST #${requestId} ==========\n`);
      return data;
    } catch (error) {
      const elapsed = Date.now() - startTime;
      console.error(`[Request #${requestId}] EXCEPTION after ${elapsed}ms:`, error);
      console.error(`[Request #${requestId}] Error type: ${error?.constructor?.name}`);
      if (error instanceof Error) {
        console.error(`[Request #${requestId}] Error message: ${error.message}`);
        console.error(`[Request #${requestId}] Error stack: ${error.stack}`);
      }
      console.error(`========== END REQUEST #${requestId} (FAILED) ==========\n`);

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        errors: [error instanceof Error ? error.message : 'Unknown error']
      };
    }
  }

  // Model operations
  async createModel(name: string) {
    // userId is derived from the API token - never passed explicitly
    return this.request('POST', '', { action: 'createModel', name });
  }

  async getModel(modelId: string) {
    return this.request('GET', `?modelId=${modelId}`);
  }

  async deleteModel(modelId: string) {
    return this.request('DELETE', `?modelId=${modelId}`);
  }

  // Sheet operations
  async addSheet(modelId: string, name?: string, subsystemBlockId?: string) {
    const body: any = { action: 'createSheet', modelId };
    if (name) body.name = name;
    if (subsystemBlockId) body.subsystemBlockId = subsystemBlockId;
    return this.request('POST', '', body);
  }

  async listSheets(modelId: string) {
    return this.request('GET', `?action=listSheets&modelId=${modelId}`);
  }

  // Block operations
  async addBlock(modelId: string, sheetId: string, blockType: string, name?: string, position?: any, parameters?: any) {
    return this.request('POST', '', { 
      action: 'addBlock', 
      modelId, 
      sheetId, 
      blockType, 
      name, 
      position, 
      parameters 
    });
  }

  async updateBlock(modelId: string, sheetId: string, blockId: string, updates: any) {
    // Handle different update types - process all provided updates
    let lastResponse: any = { success: false, error: 'No valid updates provided' };
    let hasUpdate = false;

    // Process position update
    if (updates.position) {
      hasUpdate = true;
      lastResponse = await this.request('PUT', '', {
        action: 'updateBlockPosition',
        modelId,
        sheetId,
        blockId,
        position: updates.position
      });
      if (!lastResponse.success) return lastResponse;
    }

    // Process name update
    // Note: For input_port/output_port blocks, the API handler also updates portName
    if (updates.name) {
      hasUpdate = true;
      lastResponse = await this.request('PUT', '', {
        action: 'updateBlockName',
        modelId,
        sheetId,
        blockId,
        name: updates.name
      });
      if (!lastResponse.success) return lastResponse;
    }

    // Process parameters update (only if name wasn't provided with portName sync,
    // or if there are additional parameters beyond portName)
    if (updates.parameters) {
      hasUpdate = true;
      lastResponse = await this.request('PUT', '', {
        action: 'updateBlockParameters',
        modelId,
        sheetId,
        blockId,
        parameters: updates.parameters
      });
      if (!lastResponse.success) return lastResponse;
    }

    return hasUpdate ? lastResponse : { success: false, error: 'No valid updates provided' };
  }

  async deleteBlock(modelId: string, sheetId: string, blockId: string) {
    return this.request('DELETE', `?action=deleteBlock&modelId=${modelId}&sheetId=${sheetId}&blockId=${blockId}`);
  }

  async listBlocks(modelId: string, sheetId: string) {
    return this.request('GET', `?action=listBlocks&modelId=${modelId}&sheetId=${sheetId}`);
  }

  // Connection operations
  async addConnection(
    modelId: string,
    sheetId: string,
    sourceBlockId: string,
    sourcePortIndex: number | undefined,
    sourcePort: string | undefined,
    targetBlockId: string,
    targetPortIndex: number | undefined,
    targetPort: string | undefined
  ) {
    const body: any = {
      action: 'addConnection',
      modelId,
      sheetId,
      sourceBlockId,
      targetBlockId
    };

    // Add port specifiers (prefer index over name)
    if (sourcePortIndex !== undefined) {
      body.sourcePortIndex = sourcePortIndex;
    } else if (sourcePort) {
      body.sourcePort = sourcePort;
    }

    if (targetPortIndex !== undefined) {
      body.targetPortIndex = targetPortIndex;
    } else if (targetPort) {
      body.targetPort = targetPort;
    }

    return this.request('POST', '', body);
  }

  async deleteConnection(modelId: string, sheetId: string, connectionId: string) {
    return this.request('DELETE', `?action=deleteConnection&modelId=${modelId}&sheetId=${sheetId}&connectionId=${connectionId}`);
  }

  async listConnections(modelId: string, sheetId: string) {
    return this.request('GET', `?action=listConnections&modelId=${modelId}&sheetId=${sheetId}`);
  }

  // Validation
  async validateModel(modelId: string) {
    return this.request('POST', '', { action: 'validateModel', modelId });
  }

  // Batch operations
  async batchOperations(operations: any[], transactional: boolean = false) {
    return this.request('POST', '', {
      action: 'batchOperations',
      operations,
      transactional
    });
  }

  // Parameter operations
  async listParameters(modelId: string) {
    return this.request('GET', `?action=listParameters&modelId=${modelId}`);
  }

  async setParameter(modelId: string, name: string, signalType: string, value: number | number[] | number[][]) {
    return this.request('POST', '', {
      action: 'setParameter',
      modelId,
      name,
      signalType,
      value
    });
  }

  async deleteParameter(modelId: string, name: string) {
    return this.request('DELETE', `?action=deleteParameter&modelId=${modelId}&name=${name}`);
  }
}

// Export singleton instance
export const modelBuilderClient = new ModelBuilderAPIClient();