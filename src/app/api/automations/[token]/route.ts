import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabaseClient'
import { CodeGenerator } from '@/lib/codeGeneration'
import { SimulationEngine } from '@/lib/simulationEngine'
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

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params
    const body: AutomationRequest = await request.json()

    // Verify the automation token
    if (!isValidToken(token)) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Invalid or missing automation token',
          timestamp: new Date().toISOString()
        },
        { status: 401 }
      )
    }

    // Validate request body
    if (!body.action || !body.modelId) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Missing required fields: action and modelId',
          timestamp: new Date().toISOString()
        },
        { status: 400 }
      )
    }

    // Fetch the model using service role (bypasses RLS for automation)
    const { data: model, error } = await supabase
      .from('models')
      .select('*')
      .eq('id', body.modelId)
      .single()

    if (error) {
      console.error('Database error:', error)
      return NextResponse.json(
        {
          success: false,
          action: body.action,
          modelId: body.modelId,
          timestamp: new Date().toISOString(),
          errors: ['Failed to fetch model from database']
        },
        { status: 500 }
      )
    }

    if (!model) {
      return NextResponse.json(
        {
          success: false,
          action: body.action,
          modelId: body.modelId,
          timestamp: new Date().toISOString(),
          errors: ['Model not found']
        },
        { status: 404 }
      )
    }

    // Execute the requested action
    const result = await executeAction(body.action, model, body.parameters)

    return NextResponse.json(result)

  } catch (error) {
    console.error('Automation API error:', error)
    return NextResponse.json(
      {
        success: false,
        error: 'Internal server error',
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    )
  }
}

function isValidToken(token: string): boolean {
  // Check against environment variable
  const validToken = process.env.AUTOMATION_API_TOKEN
  
  if (!validToken) {
    console.error('AUTOMATION_API_TOKEN environment variable not set')
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
        return {
          ...baseResponse,
          errors: [`Unknown action: ${action}`]
        }
    }
  } catch (error) {
    return {
      ...baseResponse,
      errors: [`Action execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`]
    }
  }
}

async function handleGenerateCode(model: any, baseResponse: AutomationResponse): Promise<AutomationResponse> {
  const sheets = model.data.sheets || []
  const mainSheet = sheets.find((s: any) => s.id === 'main') || sheets[0]

  if (!mainSheet) {
    return {
      ...baseResponse,
      errors: ['No main sheet found in model']
    }
  }

  const codeGenerator = new CodeGenerator(
    mainSheet.blocks || [],
    mainSheet.connections || [],
    sheets,
    model.name
  )

  const result = codeGenerator.generateCode()

  if (!result.success) {
    return {
      ...baseResponse,
      errors: result.errors
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
        blocksProcessed: mainSheet.blocks?.length || 0,
        wiresProcessed: mainSheet.connections?.length || 0
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
      errors: ['No main sheet found in model']
    }
  }

  const blocks = mainSheet.blocks || []
  const wires = mainSheet.connections || []

  if (blocks.length === 0) {
    return {
      ...baseResponse,
      errors: ['No blocks found in model']
    }
  }

  // Use provided parameters or defaults
  const config = {
    timeStep: parameters?.timeStep || model.data.globalSettings?.simulationTimeStep || 0.01,
    duration: parameters?.duration || model.data.globalSettings?.simulationDuration || 10.0
  }

  const engine = new SimulationEngine(blocks, wires, config, undefined, sheets)
  const results = engine.run()

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
    if (block) {
      signalSummaries[block.name] = {
        type: block.type,
        samples: data.length,
        finalValue: data[data.length - 1] || 0,
        min: data.length > 0 ? Math.min(...data) : 0,
        max: data.length > 0 ? Math.max(...data) : 0,
        average: data.length > 0 ? data.reduce((a, b) => a + b, 0) / data.length : 0
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
  const mainSheet = sheets.find((s: any) => s.id === 'main') || sheets[0]

  if (!mainSheet) {
    return {
      ...baseResponse,
      errors: ['No main sheet found in model']
    }
  }

  const blocks = mainSheet.blocks || []
  const wires = mainSheet.connections || []
  const errors: string[] = []
  const warnings: string[] = []

  // Basic validation checks
  if (blocks.length === 0) {
    errors.push('Model contains no blocks')
  }

  // Check for unconnected required inputs
  for (const block of blocks) {
    const requiredInputs = getRequiredInputCount(block.type)
    const connectedInputs = wires.filter((wire: any) => wire.targetBlockId === block.id).length
    
    if (connectedInputs < requiredInputs) {
      errors.push(`Block ${block.name} (${block.type}) has ${connectedInputs}/${requiredInputs} required inputs connected`)
    }
  }

  // Check for isolated blocks (no inputs AND no outputs connected)
  for (const block of blocks) {
    if (!['input_port', 'source'].includes(block.type)) {
      const hasInputs = wires.some((wire: any) => wire.targetBlockId === block.id)
      const hasOutputs = wires.some((wire: any) => wire.sourceBlockId === block.id)
      
      if (!hasInputs && !hasOutputs) {
        warnings.push(`Block ${block.name} is isolated (no connections)`)
      }
    }
  }

  // Check for missing output ports
  const hasOutputPorts = blocks.some((block: any) => block.type === 'output_port')
  if (!hasOutputPorts) {
    warnings.push('Model has no output ports - generated code will have no outputs')
  }

  // Check for missing input ports  
  const hasInputPorts = blocks.some((block: any) => block.type === 'input_port')
  if (!hasInputPorts && !blocks.some((block: any) => block.type === 'source')) {
    warnings.push('Model has no input ports or source blocks - may not produce meaningful results')
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