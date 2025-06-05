// lib/modelBuilderApiClient.ts

import { 
  ModelBuilderResponse,
  ModelBuilderSuccessResponse,
  ModelBuilderErrorResponse,
  GetModelResponse,
  CreateModelResponse,
  ListSheetsResponse,
  CreateSheetResponse,
  ListBlocksResponse,
  GetBlockResponse,
  AddBlockResponse,
  ListConnectionsResponse,
  GetConnectionResponse,
  AddConnectionResponse,
  GetBlockPortsResponse,
  ValidateModelResponse,
  BatchOperationsResponse,
  UpdateBlockPositionResponse,
  UpdateBlockNameResponse,
  UpdateBlockParametersResponse,
  RenameSheetResponse,
  DeleteModelResponse,
  DeleteSheetResponse,
  DeleteBlockResponse,
  DeleteConnectionResponse,
  Position
} from './modelBuilderApiTypes';

export interface ModelBuilderApiClientConfig {
  baseUrl: string;
  token: string;
}

export class ModelBuilderApiClient {
  private baseUrl: string;
  private token: string;

  constructor(config: ModelBuilderApiClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, ''); // Remove trailing slash
    this.token = config.token;
  }

  // Helper method to make requests
  private async request<T>(
    method: string,
    url: string,
    body?: any
  ): Promise<ModelBuilderResponse<T>> {
    const response = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json'
      },
      body: body ? JSON.stringify(body) : undefined
    });

    const data = await response.json();
    return data as ModelBuilderResponse<T>;
  }

  // Helper to check if response is successful
  isSuccess<T>(response: ModelBuilderResponse<T>): response is ModelBuilderSuccessResponse<T> {
    return response.success === true;
  }

  // Model Operations
  async getModel(modelId: string): Promise<ModelBuilderResponse<GetModelResponse>> {
    return this.request<GetModelResponse>(
      'GET',
      `${this.baseUrl}/${this.token}?modelId=${modelId}`
    );
  }

  async createModel(name: string, userId: string): Promise<ModelBuilderResponse<CreateModelResponse>> {
    return this.request<CreateModelResponse>(
      'POST',
      `${this.baseUrl}/${this.token}`,
      { action: 'createModel', name, userId }
    );
  }

  async updateModelName(modelId: string, name: string): Promise<ModelBuilderResponse<any>> {
    return this.request<any>(
      'PUT',
      `${this.baseUrl}/${this.token}`,
      { action: 'updateModelName', modelId, name }
    );
  }

  async deleteModel(modelId: string): Promise<ModelBuilderResponse<DeleteModelResponse>> {
    return this.request<DeleteModelResponse>(
      'DELETE',
      `${this.baseUrl}/${this.token}?modelId=${modelId}`
    );
  }

  // Sheet Operations
  async listSheets(modelId: string): Promise<ModelBuilderResponse<ListSheetsResponse>> {
    return this.request<ListSheetsResponse>(
      'GET',
      `${this.baseUrl}/${this.token}?action=listSheets&modelId=${modelId}`
    );
  }

  async createSheet(modelId: string, name?: string): Promise<ModelBuilderResponse<CreateSheetResponse>> {
    return this.request<CreateSheetResponse>(
      'POST',
      `${this.baseUrl}/${this.token}`,
      { action: 'createSheet', modelId, name }
    );
  }

  async renameSheet(modelId: string, sheetId: string, newName: string): Promise<ModelBuilderResponse<RenameSheetResponse>> {
    return this.request<RenameSheetResponse>(
      'PUT',
      `${this.baseUrl}/${this.token}`,
      { action: 'renameSheet', modelId, sheetId, newName }
    );
  }

  async deleteSheet(modelId: string, sheetId: string): Promise<ModelBuilderResponse<DeleteSheetResponse>> {
    return this.request<DeleteSheetResponse>(
      'DELETE',
      `${this.baseUrl}/${this.token}?action=deleteSheet&modelId=${modelId}&sheetId=${sheetId}`
    );
  }

  async cloneSheet(modelId: string, sheetId: string, newName?: string): Promise<ModelBuilderResponse<any>> {
    return this.request<any>(
      'POST',
      `${this.baseUrl}/${this.token}`,
      { action: 'cloneSheet', modelId, sheetId, newName }
    );
  }

  async clearSheet(modelId: string, sheetId: string): Promise<ModelBuilderResponse<any>> {
    return this.request<any>(
      'DELETE',
      `${this.baseUrl}/${this.token}?action=clearSheet&modelId=${modelId}&sheetId=${sheetId}`
    );
  }

  async importSheet(modelId: string, sheetData: any, overrideId?: string, overrideName?: string): Promise<ModelBuilderResponse<any>> {
    return this.request<any>(
      'POST',
      `${this.baseUrl}/${this.token}`,
      { action: 'importSheet', modelId, sheetData, overrideId, overrideName }
    );
  }

  async exportSheet(modelId: string, sheetId: string): Promise<ModelBuilderResponse<any>> {
    return this.request<any>(
      'GET',
      `${this.baseUrl}/${this.token}?action=exportSheet&modelId=${modelId}&sheetId=${sheetId}`
    );
  }

  // Block Operations
  async listBlocks(modelId: string, sheetId: string): Promise<ModelBuilderResponse<ListBlocksResponse>> {
    return this.request<ListBlocksResponse>(
      'GET',
      `${this.baseUrl}/${this.token}?action=listBlocks&modelId=${modelId}&sheetId=${sheetId}`
    );
  }

  async getBlock(modelId: string, sheetId: string, blockId: string): Promise<ModelBuilderResponse<GetBlockResponse>> {
    return this.request<GetBlockResponse>(
      'GET',
      `${this.baseUrl}/${this.token}?action=getBlock&modelId=${modelId}&sheetId=${sheetId}&blockId=${blockId}`
    );
  }

  async addBlock(
    modelId: string,
    sheetId: string,
    blockType: string,  // Changed from BlockType to string
    name?: string,
    position?: Position,
    parameters?: Record<string, any>
  ): Promise<ModelBuilderResponse<AddBlockResponse>> {
    return this.request<AddBlockResponse>(
      'POST',
      `${this.baseUrl}/${this.token}`,
      { action: 'addBlock', modelId, sheetId, blockType, name, position, parameters }
    );
  }

  async updateBlockPosition(
    modelId: string,
    sheetId: string,
    blockId: string,
    position: Position
  ): Promise<ModelBuilderResponse<UpdateBlockPositionResponse>> {
    return this.request<UpdateBlockPositionResponse>(
      'PUT',
      `${this.baseUrl}/${this.token}`,
      { action: 'updateBlockPosition', modelId, sheetId, blockId, position }
    );
  }

  async updateBlockName(
    modelId: string,
    sheetId: string,
    blockId: string,
    name: string
  ): Promise<ModelBuilderResponse<UpdateBlockNameResponse>> {
    return this.request<UpdateBlockNameResponse>(
      'PUT',
      `${this.baseUrl}/${this.token}`,
      { action: 'updateBlockName', modelId, sheetId, blockId, name }
    );
  }

  async updateBlockParameters(
    modelId: string,
    sheetId: string,
    blockId: string,
    parameters: Record<string, any>
  ): Promise<ModelBuilderResponse<UpdateBlockParametersResponse>> {
    return this.request<UpdateBlockParametersResponse>(
      'PUT',
      `${this.baseUrl}/${this.token}`,
      { action: 'updateBlockParameters', modelId, sheetId, blockId, parameters }
    );
  }

  async deleteBlock(modelId: string, sheetId: string, blockId: string): Promise<ModelBuilderResponse<DeleteBlockResponse>> {
    return this.request<DeleteBlockResponse>(
      'DELETE',
      `${this.baseUrl}/${this.token}?action=deleteBlock&modelId=${modelId}&sheetId=${sheetId}&blockId=${blockId}`
    );
  }

  async getBlockPorts(modelId: string, sheetId: string, blockId: string): Promise<ModelBuilderResponse<GetBlockPortsResponse>> {
    return this.request<GetBlockPortsResponse>(
      'GET',
      `${this.baseUrl}/${this.token}?action=getBlockPorts&modelId=${modelId}&sheetId=${sheetId}&blockId=${blockId}`
    );
  }

  // Connection Operations
  async listConnections(modelId: string, sheetId: string): Promise<ModelBuilderResponse<ListConnectionsResponse>> {
    return this.request<ListConnectionsResponse>(
      'GET',
      `${this.baseUrl}/${this.token}?action=listConnections&modelId=${modelId}&sheetId=${sheetId}`
    );
  }

  async getConnection(modelId: string, sheetId: string, connectionId: string): Promise<ModelBuilderResponse<GetConnectionResponse>> {
    return this.request<GetConnectionResponse>(
      'GET',
      `${this.baseUrl}/${this.token}?action=getConnection&modelId=${modelId}&sheetId=${sheetId}&connectionId=${connectionId}`
    );
  }

  async addConnection(
    modelId: string,
    sheetId: string,
    sourceBlockId: string,
    sourcePort: string,
    targetBlockId: string,
    targetPort: string
  ): Promise<ModelBuilderResponse<AddConnectionResponse>> {
    return this.request<AddConnectionResponse>(
      'POST',
      `${this.baseUrl}/${this.token}`,
      { action: 'addConnection', modelId, sheetId, sourceBlockId, sourcePort, targetBlockId, targetPort }
    );
  }

  async deleteConnection(modelId: string, sheetId: string, connectionId: string): Promise<ModelBuilderResponse<DeleteConnectionResponse>> {
    return this.request<DeleteConnectionResponse>(
      'DELETE',
      `${this.baseUrl}/${this.token}?action=deleteConnection&modelId=${modelId}&sheetId=${sheetId}&connectionId=${connectionId}`
    );
  }

  // Validation
  async validateModel(modelId: string): Promise<ModelBuilderResponse<ValidateModelResponse>> {
    return this.request<ValidateModelResponse>(
      'POST',
      `${this.baseUrl}/${this.token}`,
      { action: 'validateModel', modelId }
    );
  }

  // Batch Operations
  async batchOperations(
    operations: Array<{ id?: string; action: string; [key: string]: any }>,
    transactional: boolean = false
  ): Promise<ModelBuilderResponse<BatchOperationsResponse>> {
    return this.request<BatchOperationsResponse>(
      'POST',
      `${this.baseUrl}/${this.token}`,
      { action: 'batchOperations', operations, transactional }
    );
  }

  // Metadata
  async getModelMetadata(modelId: string): Promise<ModelBuilderResponse<any>> {
    return this.request<any>(
      'GET',
      `${this.baseUrl}/${this.token}?action=getModelMetadata&modelId=${modelId}`
    );
  }
}

// Export a factory function for convenience
export function createModelBuilderApiClient(baseUrl: string, token: string): ModelBuilderApiClient {
  return new ModelBuilderApiClient({ baseUrl, token });
}

// Re-export the BlockTypes for convenience when using the client
export { BlockTypes } from './blockTypeRegistry';