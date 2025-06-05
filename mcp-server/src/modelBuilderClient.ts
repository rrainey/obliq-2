// mcp-server/src/modelBuilderClient.ts
import fetch from 'node-fetch';
import { config } from './config.js';

export interface ModelBuilderResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  errors?: string[];
}

export class ModelBuilderAPIClient {
  private baseUrl: string;
  private token: string;

  constructor() {
    // Use the Model Builder API token from config
    this.baseUrl = `${config.apiBaseUrl}/api/model-builder`;
    this.token = config.modelBuilderToken || config.automationToken; // Fallback to automation token if not set
  }

  private async request<T>(
    method: string,
    endpoint: string,
    body?: any
  ): Promise<ModelBuilderResponse<T>> {
    const url = `${this.baseUrl}/${this.token}${endpoint}`;
    
    if (config.debug) {
      console.error(`[Model Builder API] ${method} ${url}`);
    }

    try {
      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json'
        },
        body: body ? JSON.stringify(body) : undefined
      });

      const data = await response.json() as ModelBuilderResponse<T>;
      
      if (config.debug) {
        console.error(`[Model Builder API] Response:`, data);
      }

      return data;
    } catch (error) {
      console.error('[Model Builder API] Request failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        errors: [error instanceof Error ? error.message : 'Unknown error']
      };
    }
  }

  // Model operations
  async createModel(name: string, userId: string) {
    return this.request('POST', '', { action: 'createModel', name, userId });
  }

  async getModel(modelId: string) {
    return this.request('GET', `?modelId=${modelId}`);
  }

  async deleteModel(modelId: string) {
    return this.request('DELETE', `?modelId=${modelId}`);
  }

  // Sheet operations
  async addSheet(modelId: string, name?: string) {
    return this.request('POST', '', { action: 'createSheet', modelId, name });
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
    // Handle different update types
    if (updates.position) {
      return this.request('PUT', '', {
        action: 'updateBlockPosition',
        modelId,
        sheetId,
        blockId,
        position: updates.position
      });
    }
    if (updates.name) {
      return this.request('PUT', '', {
        action: 'updateBlockName',
        modelId,
        sheetId,
        blockId,
        name: updates.name
      });
    }
    if (updates.parameters) {
      return this.request('PUT', '', {
        action: 'updateBlockParameters',
        modelId,
        sheetId,
        blockId,
        parameters: updates.parameters
      });
    }
    return { success: false, error: 'No valid updates provided' };
  }

  async deleteBlock(modelId: string, sheetId: string, blockId: string) {
    return this.request('DELETE', `?action=deleteBlock&modelId=${modelId}&sheetId=${sheetId}&blockId=${blockId}`);
  }

  async listBlocks(modelId: string, sheetId: string) {
    return this.request('GET', `?action=listBlocks&modelId=${modelId}&sheetId=${sheetId}`);
  }

  // Connection operations
  async addConnection(modelId: string, sheetId: string, sourceBlockId: string, sourcePort: string, targetBlockId: string, targetPort: string) {
    return this.request('POST', '', {
      action: 'addConnection',
      modelId,
      sheetId,
      sourceBlockId,
      sourcePort,
      targetBlockId,
      targetPort
    });
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
}

// Export singleton instance
export const modelBuilderClient = new ModelBuilderAPIClient();