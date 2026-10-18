//app/api/automations/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { CodeGenerator } from '@/lib/codeGenerationNew'
import { executeServerSimulation, type SimulationConfig } from '@/lib/wasm/ServerWasmExecutor'
import { withErrorHandling, AppError, ErrorTypes, validateRequiredFields } from '@/lib/apiErrorHandler'
import { authenticateRequest } from '@/lib/apiAuthMiddleware'
import {
  getStorage,
  ModelNotFoundError,
  ModelFileMissingError,
  InvalidModelFileError,
  type ModelData,
  type ModelRecord
} from '@/lib/server/storage'

export const runtime = 'nodejs'

interface AutomationRequest {
  action: 'generateCode' | 'simulate' | 'validateModel' | 'listModels'
  modelId?: string
  version?: number
  parameters?: Record<string, any>
}

interface AutomationResponse {
  success: boolean
  action: string
  modelId: string
  version?: number
  timestamp: string
  data?: any
  errors?: string[]
}

/**
 * Collect the caller's credentials so internal calls (e.g. /api/compile-wasm
 * from the simulation executor) are authenticated the same way.
 */
function forwardedAuthHeaders(request: NextRequest): Record<string, string> {
  const headers: Record<string, string> = {}
  const authorization = request.headers.get('Authorization')
  if (authorization) headers['Authorization'] = authorization
  const cookie = request.headers.get('Cookie')
  if (cookie) headers['Cookie'] = cookie
  return headers
}

async function automationHandler(
  request: NextRequest
): Promise<NextResponse> {
  // API token (Authorization: Bearer <token>) or local session cookie
  const authResult = await authenticateRequest(request)

  if (!authResult.authenticated) {
    throw new AppError(
      request.headers.get('Authorization')
        ? authResult.error || 'Invalid or expired API token'
        : 'Missing Authorization header. Use: Authorization: Bearer <token>',
      401,
      ErrorTypes.UNAUTHORIZED
    )
  }

  // Parse and validate request body
  let body: AutomationRequest
  try {
    body = await request.json()
  } catch (error) {
    throw new AppError(
      'Invalid JSON in request body',
      400,
      ErrorTypes.VALIDATION_ERROR
    )
  }

  // Validate required fields
  validateRequiredFields(body, ['action'])

  // Validate action type
  const validActions = ['generateCode', 'simulate', 'validateModel', 'listModels']
  if (!validActions.includes(body.action)) {
    throw new AppError(
      `Invalid action: ${body.action}. Valid actions are: ${validActions.join(', ')}`,
      400,
      ErrorTypes.VALIDATION_ERROR,
      { providedAction: body.action, validActions }
    )
  }

  // Handle listModels action separately (doesn't require modelId)
  if (body.action === 'listModels') {
    const result = await handleListModels()
    return NextResponse.json(result)
  }

  // For other actions, modelId is required
  if (!body.modelId) {
    throw new AppError(
      'Missing required field: modelId',
      400,
      ErrorTypes.VALIDATION_ERROR
    )
  }

  // Validate modelId format
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
  if (!uuidRegex.test(body.modelId)) {
    throw new AppError(
      'Invalid model ID format',
      400,
      ErrorTypes.VALIDATION_ERROR,
      { providedModelId: body.modelId }
    )
  }

  // Load the model: a specific saved version if requested, otherwise the
  // current model file (authoritative, possibly newer than the latest snapshot)
  const storage = getStorage()
  let model: ModelRecord
  let versionData: { version: number; data: ModelData }
  try {
    if (body.version) {
      model = storage.models.require(body.modelId)
      versionData = { version: body.version, data: storage.models.getVersion(body.modelId, body.version) }
    } else {
      const current = storage.models.readCurrent(body.modelId)
      model = current.record
      versionData = { version: current.record.latest_version, data: current.data }
    }
  } catch (error) {
    if (error instanceof ModelNotFoundError) {
      const existing = storage.models.get(body.modelId)
      if (body.version && existing) {
        throw new AppError(
          `Version ${body.version} not found for this model`,
          404,
          ErrorTypes.NOT_FOUND,
          { modelId: body.modelId, requestedVersion: body.version, latestVersion: existing.latest_version }
        )
      }
      throw new AppError(
        'Model not found or access denied',
        404,
        ErrorTypes.NOT_FOUND,
        { modelId: body.modelId }
      )
    }
    if (error instanceof ModelFileMissingError) {
      throw new AppError(error.message, 404, ErrorTypes.NOT_FOUND, { modelId: body.modelId, filePath: error.filePath })
    }
    if (error instanceof InvalidModelFileError) {
      throw new AppError(error.message, 422, ErrorTypes.VALIDATION_ERROR, { modelId: body.modelId })
    }
    throw error
  }
  const versionToUse = versionData.version

  // Validate version data structure
  if (!versionData.data || !versionData.data.sheets || !Array.isArray(versionData.data.sheets)) {
    throw new AppError(
      'Invalid model structure: missing or invalid sheets data',
      400,
      ErrorTypes.VALIDATION_ERROR,
      { modelId: body.modelId, modelName: model.name, version: versionToUse }
    )
  }

  // Execute the requested action
  const result = await executeAction(body.action, model, versionData, body.parameters, forwardedAuthHeaders(request))

  return NextResponse.json(result)
}

async function executeAction(
  action: string,
  model: any,
  versionData: any,
  parameters?: Record<string, any>,
  authHeaders?: Record<string, string>
): Promise<AutomationResponse> {
  const baseResponse: AutomationResponse = {
    success: false,
    action,
    modelId: model.id,
    version: versionData.version,
    timestamp: new Date().toISOString()
  }

  try {
    switch (action) {
      case 'generateCode':
        return await handleGenerateCode(model, versionData, baseResponse)

      case 'simulate':
        return await handleSimulate(model, versionData, baseResponse, parameters, authHeaders)

      case 'validateModel':
        return await handleValidateModel(model, versionData, baseResponse)

      default:
        throw new AppError(
          `Unknown action: ${action}`,
          400,
          ErrorTypes.VALIDATION_ERROR
        )
    }
  } catch (error) {
    // Convert any errors to standardized response format
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return {
      ...baseResponse,
      errors: [`Action execution failed: ${errorMessage}`]
    }
  }
}

async function handleGenerateCode(model: any, versionData: any, baseResponse: AutomationResponse): Promise<AutomationResponse> {
  const sheets = versionData.data.sheets || []
  const mainSheet = sheets.find((s: any) => s.id === 'main') || sheets[0]

  if (!mainSheet) {
    return {
      ...baseResponse,
      errors: ['No sheets found in model']
    }
  }

  const blocks = mainSheet.blocks || []
  const connections = mainSheet.connections || []

  if (blocks.length === 0) {
    return {
      ...baseResponse,
      errors: ['Cannot generate code: model contains no blocks']
    }
  }

  let result: any
  try {
    const codeGenerator = new CodeGenerator({ modelName: model.name })
    result = codeGenerator.generate(sheets)
  } catch (error) {
    return {
      ...baseResponse,
      errors: [`Code generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`]
    }
  }

  // Check for warnings that might indicate issues
  if (result.warnings && result.warnings.length > 0) {
    console.warn('[handleGenerateCode] Warnings:', result.warnings)
  }

  // For automation API, return code generation summary
  const filesGenerated = [`${model.name}.h`, `${model.name}.c`]
  if (result.subsystemFiles && result.subsystemFiles.length > 0) {
    result.subsystemFiles.forEach((sf: any) => {
      filesGenerated.push(`${sf.name}.h`, `${sf.name}.c`)
    })
  }

  return {
    ...baseResponse,
    success: true,
    data: {
      filesGenerated,
      summary: {
        headerFile: `${model.name}.h`,
        sourceFile: `${model.name}.c`,
        blocksProcessed: result.stats?.blocksProcessed || blocks.length,
        connectionsProcessed: result.stats?.connectionsProcessed || connections.length,
        subsystemsFlattened: result.stats?.subsystemsFlattened || 0
      },
      warnings: result.warnings || []
    }
  }
}

async function handleSimulate(
  model: any,
  versionData: any,
  baseResponse: AutomationResponse,
  parameters?: Record<string, any>,
  authHeaders?: Record<string, string>
): Promise<AutomationResponse> {
  // Build simulation configuration
  const simConfig: SimulationConfig = {
    timeStep: 0.01,
    duration: 10.0,
    optimizationLevel: 'O2',
    authHeaders
  }

  // Validate and apply user-provided parameters
  if (parameters) {
    if (parameters.timeStep !== undefined) {
      if (typeof parameters.timeStep !== 'number' || parameters.timeStep <= 0) {
        return {
          ...baseResponse,
          errors: ['Invalid timeStep parameter: must be a positive number']
        }
      }
      simConfig.timeStep = parameters.timeStep
    }

    if (parameters.duration !== undefined) {
      if (typeof parameters.duration !== 'number' || parameters.duration <= 0) {
        return {
          ...baseResponse,
          errors: ['Invalid duration parameter: must be a positive number']
        }
      }
      simConfig.duration = parameters.duration
    }

    // Pass through input values if provided
    if (parameters.inputs && typeof parameters.inputs === 'object') {
      simConfig.inputs = parameters.inputs
    }

    // Optional: include full time series data
    if (parameters.includeTimeSeries === true) {
      simConfig.includeTimeSeries = true
      if (typeof parameters.sampleRate === 'number' && parameters.sampleRate > 0) {
        simConfig.timeSeriesSampleRate = parameters.sampleRate
      }
    }

    // Optional: optimization level
    if (parameters.optimizationLevel && ['O0', 'O1', 'O2', 'O3'].includes(parameters.optimizationLevel)) {
      simConfig.optimizationLevel = parameters.optimizationLevel
    }
  }

  // Use model defaults if no parameters provided
  if (!parameters) {
    simConfig.timeStep = versionData.data.globalSettings?.simulationTimeStep || 0.01
    simConfig.duration = versionData.data.globalSettings?.simulationDuration || 10.0
  }

  // Execute WASM-based simulation
  const result = await executeServerSimulation(model.id, simConfig)

  if (!result.success) {
    return {
      ...baseResponse,
      errors: [result.error || 'Simulation failed']
    }
  }

  // Calculate number of time points
  const timePoints = result.timeSteps || Math.ceil((simConfig.duration || 10) / (simConfig.timeStep || 0.01))

  return {
    ...baseResponse,
    success: true,
    data: {
      simulationDuration: result.finalTime,
      timePoints,
      outputPorts: result.outputs || {},
      signals: result.signals || {},
      config: {
        timeStep: simConfig.timeStep,
        duration: simConfig.duration
      },
      // Additional metadata from WASM execution
      performance: {
        compilationTimeMs: result.compilationTimeMs,
        executionTimeMs: result.executionTimeMs,
        totalTimeMs: result.totalTimeMs,
        cacheHit: result.cacheHit
      }
    }
  }
}

async function handleValidateModel(model: any, versionData: any, baseResponse: AutomationResponse): Promise<AutomationResponse> {
  const sheets = versionData.data.sheets || []

  if (sheets.length === 0) {
    return {
      ...baseResponse,
      errors: ['Model contains no sheets']
    }
  }

  const mainSheet = sheets.find((s: any) => s.id === 'main') || sheets[0]
  const blocks = mainSheet.blocks || []
  const wires = mainSheet.connections || []
  const errors: string[] = []
  const warnings: string[] = []

  // Basic validation checks
  if (blocks.length === 0) {
    errors.push('Model contains no blocks')
  }

  // Validate block structure
  for (const block of blocks) {
    if (!block.id || typeof block.id !== 'string') {
      errors.push(`Block missing or invalid ID: ${JSON.stringify(block)}`)
      continue
    }

    if (!block.type || typeof block.type !== 'string') {
      errors.push(`Block ${block.id} missing or invalid type`)
      continue
    }

    if (!block.name || typeof block.name !== 'string') {
      warnings.push(`Block ${block.id} missing or invalid name`)
    }

    if (!block.position || typeof block.position.x !== 'number' || typeof block.position.y !== 'number') {
      warnings.push(`Block ${block.id} missing or invalid position`)
    }
  }

  // Validate wire structure and connections
  for (const wire of wires) {
    if (!wire.id || typeof wire.id !== 'string') {
      errors.push(`Wire missing or invalid ID: ${JSON.stringify(wire)}`)
      continue
    }

    if (!wire.sourceBlockId || !wire.targetBlockId) {
      errors.push(`Wire ${wire.id} missing source or target block ID`)
      continue
    }

    // Check if referenced blocks exist
    const sourceBlock = blocks.find((b: any) => b.id === wire.sourceBlockId)
    const targetBlock = blocks.find((b: any) => b.id === wire.targetBlockId)

    if (!sourceBlock) {
      errors.push(`Wire ${wire.id} references non-existent source block: ${wire.sourceBlockId}`)
    }

    if (!targetBlock) {
      errors.push(`Wire ${wire.id} references non-existent target block: ${wire.targetBlockId}`)
    }
  }

  // Check for unconnected required inputs (only if no structural errors)
  if (errors.length === 0) {
    for (const block of blocks) {
      const requiredInputs = getRequiredInputCount(block.type)
      const connectedInputs = wires.filter((wire: any) => wire.targetBlockId === block.id).length

      if (connectedInputs < requiredInputs) {
        errors.push(`Block ${block.name} (${block.type}) has ${connectedInputs}/${requiredInputs} required inputs connected`)
      }
    }

    // Check for isolated blocks
    for (const block of blocks) {
      if (!['input_port', 'source'].includes(block.type)) {
        const hasInputs = wires.some((wire: any) => wire.targetBlockId === block.id)
        const hasOutputs = wires.some((wire: any) => wire.sourceBlockId === block.id)

        if (!hasInputs && !hasOutputs) {
          warnings.push(`Block ${block.name} is isolated (no connections)`)
        }
      }
    }

    // Check for missing output/input ports
    const hasOutputPorts = blocks.some((block: any) => block.type === 'output_port')
    if (!hasOutputPorts) {
      warnings.push('Model has no output ports - generated code will have no outputs')
    }

    const hasInputPorts = blocks.some((block: any) => block.type === 'input_port')
    const hasSources = blocks.some((block: any) => block.type === 'source')
    if (!hasInputPorts && !hasSources) {
      warnings.push('Model has no input ports or source blocks - may not produce meaningful results')
    }
  }

  // Model structure summary
  const blockCounts: Record<string, number> = {}
  for (const block of blocks) {
    blockCounts[block.type] = (blockCounts[block.type] || 0) + 1
  }

  return {
    ...baseResponse,
    success: errors.length === 0,
    data: {
      validation: {
        errors: errors,
        warnings: warnings,
        blockCounts: blockCounts,
        totalBlocks: blocks.length,
        totalWires: wires.length,
        sheets: sheets.length
      }
    },
    errors: errors.length > 0 ? errors : undefined
  }
}

async function handleListModels(): Promise<AutomationResponse> {
  const baseResponse: AutomationResponse = {
    success: false,
    action: 'listModels',
    modelId: '',
    timestamp: new Date().toISOString()
  }

  try {
    // Already ordered by updated_at DESC
    const models = getStorage()
      .models.list()
      .map(({ id, name, latest_version, created_at, updated_at }) => ({ id, name, latest_version, created_at, updated_at }))

    return {
      ...baseResponse,
      success: true,
      data: {
        models,
        count: models.length
      }
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return {
      ...baseResponse,
      errors: [`Failed to list models: ${errorMessage}`]
    }
  }
}

function getRequiredInputCount(blockType: string): number {
  switch (blockType) {
    case 'sum':
    case 'multiply':
      return 1 // At least one input required
    case 'scale':
    case 'transfer_function':
    case 'lookup_1d':
    case 'signal_display':
    case 'signal_logger':
    case 'output_port':
      return 1
    case 'lookup_2d':
      return 2
    case 'input_port':
    case 'source':
      return 0
    default:
      return 0
  }
}

// Export the wrapped handler
export const POST = withErrorHandling(automationHandler, 'automation-api')
