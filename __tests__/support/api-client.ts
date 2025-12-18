// __tests__/support/api-client.ts
// Test API client wrapper for integration tests

// Import fetch from cross-fetch for Node.js/Jest compatibility
import fetch from 'cross-fetch';

export interface ApiResponse<T = any> {
  success: boolean;
  timestamp: string;
  data?: T;
  error?: string;
  code?: string;
  details?: Record<string, any>;
}

export interface CreateModelResponse {
  id: string;
  name: string;
  user_id: string;
  latest_version: number;
  created_at: string;
  updated_at: string;
  mainSheet: {
    id: string;
    name: string;
  };
}

export interface BlockResponse {
  id: string;
  type: string;
  name: string;
  position: { x: number; y: number };
  parameters: Record<string, any>;
  ports: {
    inputs: string[];
    outputs: string[];
  };
}

export interface ConnectionResponse {
  id: string;
  sourceBlockId: string;
  sourcePortIndex: number;
  sourcePort: string;
  targetBlockId: string;
  targetPortIndex: number;
  targetPort: string;
}

export class TestApiClient {
  private baseUrl: string;
  private token: string;

  constructor(token: string, baseUrl?: string) {
    this.baseUrl = baseUrl || process.env.TEST_API_URL || 'http://localhost:3000/api/model-builder';
    this.token = token;
  }

  private async request<T>(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    params?: Record<string, string>,
    body?: Record<string, any>
  ): Promise<ApiResponse<T>> {
    const url = new URL(this.baseUrl);

    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          url.searchParams.set(key, value);
        }
      });
    }

    const options: RequestInit = {
      method,
      headers: {
        'Authorization': `Bearer ${this.token}`,
        'Content-Type': 'application/json'
      }
    };

    if (body && (method === 'POST' || method === 'PUT')) {
      options.body = JSON.stringify(body);
    }

    const response = await fetch(url.toString(), options);
    return response.json();
  }

  // GET requests
  async get<T>(action: string, params: Record<string, string> = {}): Promise<ApiResponse<T>> {
    return this.request<T>('GET', { action, ...params });
  }

  // POST requests
  async post<T>(body: Record<string, any>): Promise<ApiResponse<T>> {
    return this.request<T>('POST', undefined, body);
  }

  // PUT requests
  async put<T>(body: Record<string, any>): Promise<ApiResponse<T>> {
    return this.request<T>('PUT', undefined, body);
  }

  // DELETE requests
  async delete<T>(action: string, params: Record<string, string> = {}): Promise<ApiResponse<T>> {
    return this.request<T>('DELETE', { action, ...params });
  }

  // ============================================
  // Model Operations
  // ============================================

  async createModel(name: string): Promise<ApiResponse<CreateModelResponse>> {
    return this.post({ action: 'createModel', name });
  }

  async getModel(modelId: string): Promise<ApiResponse<any>> {
    return this.get('getModel', { modelId });
  }

  async getModelMetadata(modelId: string): Promise<ApiResponse<any>> {
    return this.get('getModelMetadata', { modelId });
  }

  async updateModelName(modelId: string, name: string): Promise<ApiResponse<any>> {
    return this.put({ action: 'updateModelName', modelId, name });
  }

  async validateModel(modelId: string): Promise<ApiResponse<any>> {
    return this.post({ action: 'validateModel', modelId });
  }

  async deleteModel(modelId: string): Promise<ApiResponse<any>> {
    return this.delete('deleteModel', { modelId });
  }

  // ============================================
  // Sheet Operations
  // ============================================

  async listSheets(modelId: string): Promise<ApiResponse<any>> {
    return this.get('listSheets', { modelId });
  }

  async createSheet(modelId: string, name?: string, subsystemBlockId?: string): Promise<ApiResponse<any>> {
    return this.post({
      action: 'createSheet',
      modelId,
      ...(name && { name }),
      ...(subsystemBlockId && { subsystemBlockId })
    });
  }

  async renameSheet(modelId: string, sheetId: string, newName: string): Promise<ApiResponse<any>> {
    return this.put({ action: 'renameSheet', modelId, sheetId, newName });
  }

  async deleteSheet(modelId: string, sheetId: string): Promise<ApiResponse<any>> {
    return this.delete('deleteSheet', { modelId, sheetId });
  }

  async clearSheet(modelId: string, sheetId: string): Promise<ApiResponse<any>> {
    return this.delete('clearSheet', { modelId, sheetId });
  }

  async cloneSheet(modelId: string, sheetId: string, newName?: string): Promise<ApiResponse<any>> {
    return this.post({
      action: 'cloneSheet',
      modelId,
      sheetId,
      ...(newName && { newName })
    });
  }

  async exportSheet(modelId: string, sheetId: string): Promise<ApiResponse<any>> {
    return this.get('exportSheet', { modelId, sheetId });
  }

  async importSheet(modelId: string, sheetData: any, overrideName?: string): Promise<ApiResponse<any>> {
    return this.post({
      action: 'importSheet',
      modelId,
      sheetData,
      ...(overrideName && { overrideName })
    });
  }

  // ============================================
  // Block Operations
  // ============================================

  async listBlocks(modelId: string, sheetId: string): Promise<ApiResponse<any>> {
    return this.get('listBlocks', { modelId, sheetId });
  }

  async getBlock(modelId: string, sheetId: string, blockId: string): Promise<ApiResponse<any>> {
    return this.get('getBlock', { modelId, sheetId, blockId });
  }

  async addBlock(
    modelId: string,
    sheetId: string,
    blockType: string,
    options?: {
      name?: string;
      position?: { x: number; y: number };
      parameters?: Record<string, any>;
    }
  ): Promise<ApiResponse<{ block: BlockResponse; newVersion: number; subsystemSheet?: any }>> {
    return this.post({
      action: 'addBlock',
      modelId,
      sheetId,
      blockType,
      ...options
    });
  }

  async updateBlockPosition(
    modelId: string,
    sheetId: string,
    blockId: string,
    position: { x: number; y: number }
  ): Promise<ApiResponse<any>> {
    return this.put({
      action: 'updateBlockPosition',
      modelId,
      sheetId,
      blockId,
      position
    });
  }

  async updateBlockName(
    modelId: string,
    sheetId: string,
    blockId: string,
    name: string
  ): Promise<ApiResponse<any>> {
    return this.put({
      action: 'updateBlockName',
      modelId,
      sheetId,
      blockId,
      name
    });
  }

  async updateBlockParameters(
    modelId: string,
    sheetId: string,
    blockId: string,
    parameters: Record<string, any>
  ): Promise<ApiResponse<any>> {
    return this.put({
      action: 'updateBlockParameters',
      modelId,
      sheetId,
      blockId,
      parameters
    });
  }

  async deleteBlock(modelId: string, sheetId: string, blockId: string): Promise<ApiResponse<any>> {
    return this.delete('deleteBlock', { modelId, sheetId, blockId });
  }

  async getBlockPorts(modelId: string, sheetId: string, blockId: string): Promise<ApiResponse<any>> {
    return this.get('getBlockPorts', { modelId, sheetId, blockId });
  }

  // ============================================
  // Connection Operations
  // ============================================

  async listConnections(modelId: string, sheetId: string): Promise<ApiResponse<any>> {
    return this.get('listConnections', { modelId, sheetId });
  }

  async getConnection(modelId: string, sheetId: string, connectionId: string): Promise<ApiResponse<any>> {
    return this.get('getConnection', { modelId, sheetId, connectionId });
  }

  async addConnection(
    modelId: string,
    sheetId: string,
    sourceBlockId: string,
    targetBlockId: string,
    options: {
      sourcePortIndex?: number;
      sourcePort?: string;
      targetPortIndex?: number;
      targetPort?: string;
    }
  ): Promise<ApiResponse<{ connection: ConnectionResponse; newVersion: number }>> {
    return this.post({
      action: 'addConnection',
      modelId,
      sheetId,
      sourceBlockId,
      targetBlockId,
      ...options
    });
  }

  async deleteConnection(modelId: string, sheetId: string, connectionId: string): Promise<ApiResponse<any>> {
    return this.delete('deleteConnection', { modelId, sheetId, connectionId });
  }

  // ============================================
  // Model-Level Parameter Operations
  // ============================================

  async listModelParameters(modelId: string): Promise<ApiResponse<any>> {
    return this.get('listParameters', { modelId });
  }

  async setModelParameter(
    modelId: string,
    name: string,
    signalType: string,
    value: any
  ): Promise<ApiResponse<any>> {
    return this.post({
      action: 'setParameter',
      modelId,
      name,
      signalType,
      value
    });
  }

  async deleteModelParameter(modelId: string, name: string): Promise<ApiResponse<any>> {
    return this.delete('deleteParameter', { modelId, name });
  }

  // ============================================
  // Block-Level Parameter Operations (Subsystems)
  // ============================================

  async listParameters(modelId: string, blockId: string): Promise<ApiResponse<any>> {
    return this.get('listBlockParameters', { modelId, blockId });
  }

  async getParameter(modelId: string, blockId: string, paramName: string): Promise<ApiResponse<any>> {
    return this.get('getBlockParameter', { modelId, blockId, paramName });
  }

  async addParameter(
    modelId: string,
    blockId: string,
    param: {
      name: string;
      dataType: string;
      defaultValue: any;
    }
  ): Promise<ApiResponse<any>> {
    return this.post({
      action: 'addBlockParameter',
      modelId,
      blockId,
      ...param
    });
  }

  async updateParameter(
    modelId: string,
    blockId: string,
    paramName: string,
    updates: {
      name?: string;
      defaultValue?: any;
    }
  ): Promise<ApiResponse<any>> {
    return this.put({
      action: 'updateBlockParameter',
      modelId,
      blockId,
      paramName,
      ...updates
    });
  }

  async deleteParameter(modelId: string, blockId: string, paramName: string): Promise<ApiResponse<any>> {
    return this.delete('deleteBlockParameter', { modelId, blockId, paramName });
  }

  // ============================================
  // Batch Operations
  // ============================================

  async batchOperations(
    operations: Array<Record<string, any>>,
    transactional: boolean = false
  ): Promise<ApiResponse<any>> {
    return this.post({
      action: 'batchOperations',
      operations,
      transactional
    });
  }
}
