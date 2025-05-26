//app/api/automations/[token]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabaseClient'
import { CodeGenerator } from '@/lib/codeGeneration'
import { SimulationEngine } from '@/lib/simulationEngine'
import { withErrorHandling, AppError, ErrorTypes, validateRequiredFields } from '@/lib/apiErrorHandler'
import JSZip from 'jszip'

interface AutomationRequest {
  action: 'generateCode' | 'simulate' | 'validateModel'
  modelId: string
  parameters?: Record<string, any>
}

interface AutomationResponse {
  success: boolean
  action: string
  modelId: string
  timestamp: string
  data?: any
  errors?: string[]
}

async function automationHandler(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
): Promise<NextResponse> {
  const { token } = await params

  // Verify the automation token
  if (!isValidToken(token)) {
    throw new AppError(
      'Invalid or missing automation token',
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
  validateRequiredFields(body, ['action', 'modelId'])

  // Validate action type
  const validActions = ['generateCode', 'simulate', 'validateModel']
  if (!validActions.includes(body.action)) {
    throw new AppError(
      `Invalid action: ${body.action}. Valid actions are: ${validActions.join(', ')}`,
      400,
      ErrorTypes.VALIDATION_ERROR,
      { providedAction: body.action, validActions }
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

  // Fetch the model using service role (bypasses RLS for automation)
  const { data: model, error: dbError } = await supabase
    .from('models')
    .select('*')
    .eq('id', body.modelId)
    .single()

  if (dbError) {
    throw dbError // Will be handled by the error handler
  }

  if (!model) {
    throw new AppError(
      'Model not found',
      404,
      ErrorTypes.NOT_FOUND,
      { modelId: body.modelId }
    )
  }

  // Validate model structure
  if (!model.data || !model.data.sheets || !Array.isArray(model.data.sheets)) {
    throw new AppError(
      'Invalid model structure: missing or invalid sheets data',
      400,
      ErrorTypes.VALIDATION_ERROR,
      { modelId: body.modelId, modelName: model.name }
    )
  }

  // Execute the requested action
  const result = await executeAction(body.action, model, body.parameters)

  return NextResponse.json(result)
}

function isValidToken(token: string): boolean {
  const validToken = process.env.AUTOMATION_API_TOKEN
  
  if (!validToken) {
    console.error('AUTOMATION_API_TOKEN environment variable not set')
    return false
  }

  if (!token || typeof token !== 'string') {
    return false
  }

  return token === validToken
}

async function executeAction(
  action: string, 
  model: any, 
  parameters?: Record<string, any>
): Promise<AutomationResponse> {
  const baseResponse: AutomationResponse = {
    success: false,
    action,
    modelId: model.id,
    timestamp: new Date().toISOString()
  }

  try {
    switch (action) {
      case 'generateCode':
        return await handleGenerateCode(model, baseResponse)
      
      case 'simulate':
        return await handleSimulate(model, baseResponse, parameters)
      
      case 'validateModel':
        return await handleValidateModel(model, baseResponse)
      
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

async function handleGenerateCode(model: any, baseResponse: AutomationResponse): Promise<AutomationResponse> {
  const sheets = model.data.sheets || []
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

  let codeGenerator: CodeGenerator
  try {
    codeGenerator = new CodeGenerator(blocks, connections, sheets, model.name)
  } catch (error) {
    return {
      ...baseResponse,
      errors: [`Failed to initialize code generator: ${error instanceof Error ? error.message : 'Unknown error'}`]
    }
  }

  const result = codeGenerator.generateCode()

  if (!result.success) {
    return {
      ...baseResponse,
      errors: result.errors || ['Code generation failed with unknown error']
    }
  }

  if (!result.files || result.files.length === 0) {
    return {
      ...baseResponse,
      errors: ['Code generation produced no files']
    }
  }

  // For automation API, return code generation summary instead of files
  return {
    ...baseResponse,
    success: true,
    data: {
      filesGenerated: result.files.map(f => f.name),
      summary: {
        headerFile: `${model.name}.h`,
        sourceFile: `${model.name}.c`,
        libraryConfig: 'library.properties',
        blocksProcessed: blocks.length,
        wiresProcessed: connections.length
      }
    }
  }
}

async function handleSimulate(
  model: any, 
  baseResponse: AutomationResponse, 
  parameters?: Record<string, any>
): Promise<AutomationResponse> {
  const sheets = model.data.sheets || []
  const mainSheet = sheets.find((s: any) => s.id === 'main') || sheets[0]

  if (!mainSheet) {
    return {
      ...baseResponse,
      errors: ['No sheets found in model']
    }
  }

  const blocks = mainSheet.blocks || []
  const wires = mainSheet.connections || []

  if (blocks.length === 0) {
    return {
      ...baseResponse,
      errors: ['Cannot simulate: model contains no blocks']
    }
  }

  // Validate and use simulation parameters
  const config = {
    timeStep: 0.01,
    duration: 10.0
  }

  if (parameters) {
    if (parameters.timeStep !== undefined) {
      if (typeof parameters.timeStep !== 'number' || parameters.timeStep <= 0) {
        return {
          ...baseResponse,
          errors: ['Invalid timeStep parameter: must be a positive number']
        }
      }
      config.timeStep = parameters.timeStep
    }

    if (parameters.duration !== undefined) {
      if (typeof parameters.duration !== 'number' || parameters.duration <= 0) {
        return {
          ...baseResponse,
          errors: ['Invalid duration parameter: must be a positive number']
        }
      }
      config.duration = parameters.duration
    }
  }

  // Use model defaults if no parameters provided
  if (!parameters) {
    config.timeStep = model.data.globalSettings?.simulationTimeStep || 0.01
    config.duration = model.data.globalSettings?.simulationDuration || 10.0
  }

  let engine: SimulationEngine
  let results: any

  try {
    engine = new SimulationEngine(blocks, wires, config, undefined, sheets)
    results = engine.run()
  } catch (error) {
    return {
      ...baseResponse,
      errors: [`Simulation failed: ${error instanceof Error ? error.message : 'Unknown error'}`]
    }
  }

  // Collect output port values
  const outputPortValues = engine.getOutputPortValues()
  const outputSummary: Record<string, number> = {}
  outputPortValues.forEach((value, portName) => {
    outputSummary[portName] = value
  })

  // Collect signal display/logger summaries
  const signalSummaries: Record<string, any> = {}
  for (const [blockId, data] of results.signalData.entries()) {
    const block = blocks.find((b: any) => b.id === blockId)
    if (block && Array.isArray(data) && data.length > 0) {
      signalSummaries[block.name] = {
        type: block.type,
        samples: data.length,
        finalValue: data[data.length - 1] || 0,
        min: Math.min(...data),
        max: Math.max(...data),
        average: data.reduce((a, b) => a + b, 0) / data.length
      }
    }
  }

  return {
    ...baseResponse,
    success: true,
    data: {
      simulationDuration: results.finalTime,
      timePoints: results.timePoints.length,
      outputPorts: outputSummary,
      signals: signalSummaries,
      config: config
    }
  }
}

async function handleValidateModel(model: any, baseResponse: AutomationResponse): Promise<AutomationResponse> {
  const sheets = model.data.sheets || []
  
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