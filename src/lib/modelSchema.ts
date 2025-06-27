// lib/modelSchema.ts
import { z } from 'zod'

/**
 * SignalValue defines valid types for signals in the interactive simulation subsystem
 */
export type SignalValue = number | number[] | number[][] | boolean | boolean[]

// Block position schema
const PositionSchema = z.object({
  x: z.number(),
  y: z.number()
})

// Signal type schema as C-language types
const SignalTypeSchema = z.enum(['float', 'double', 'long', 'bool'])
  .or(z.string().regex(/^(float|double|long|bool)\[\d+\]$/, 'Invalid array type syntax'))

// Forward declaration for recursive schema
const SheetSchema: z.ZodType<any> = z.lazy(() => SheetSchemaDefinition)

// Subsystem-specific parameters schema
const SubsystemParametersSchema = z.object({
  inputPorts: z.array(z.string()).min(1, 'Subsystem must have at least one input port'),
  outputPorts: z.array(z.string()).min(1, 'Subsystem must have at least one output port'),
  sheets: z.array(SheetSchema).min(1, 'Subsystem must have at least one sheet')
})

// Block parameters schema with type validation for specific block types
const BlockParametersSchema = z.record(z.any()).optional().superRefine((params, ctx) => {
  if (!params) return
  
  // Validate dataType for blocks that have it
  if ('dataType' in params && params.dataType !== undefined) {
    const result = SignalTypeSchema.safeParse(params.dataType)
    if (!result.success) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Invalid dataType: ${params.dataType}. Must be a valid C-style type (float, double, long, bool) or 1D array.`,
        path: ['dataType']
      })
    }
  }
})

// Block schema
const BlockSchema = z.discriminatedUnion('type', [
  // Regular blocks
  z.object({
    id: z.string().min(1, 'Block ID cannot be empty'),
    type: z.enum([
      'sum', 'multiply', 'transfer_function', 'signal_display', 'signal_logger',
      'input_port', 'output_port', 'source', 'scale', 'lookup_1d', 'lookup_2d',
      'sheet_label_sink', 'sheet_label_source'
    ]),
    name: z.string().min(1, 'Block name cannot be empty'),
    position: PositionSchema,
    parameters: BlockParametersSchema
  }),
  // Subsystem block with special structure
  z.object({
    id: z.string().min(1, 'Block ID cannot be empty'),
    type: z.literal('subsystem'),
    name: z.string().min(1, 'Block name cannot be empty'),
    position: PositionSchema,
    parameters: SubsystemParametersSchema
  })
])

// Wire/Connection schema
const WireSchema = z.object({
  id: z.string().min(1, 'Wire ID cannot be empty'),
  sourceBlockId: z.string().min(1, 'Source block ID cannot be empty'),
  sourcePortIndex: z.number().min(0, 'Source port index must be non-negative'),
  targetBlockId: z.string().min(1, 'Target block ID cannot be empty'),
  targetPortIndex: z.number().min(0, 'Target port index must be non-negative')
})

// Signal type information schema (for propagated types)
const SignalTypeInfoSchema = z.object({
  wireId: z.string(),
  sourceBlockId: z.string(),
  sourcePortIndex: z.number(),
  targetBlockId: z.string(),
  targetPortIndex: z.number(),
  type: SignalTypeSchema,
  parsedType: z.object({
    baseType: z.enum(['float', 'double', 'long', 'bool']),
    isArray: z.boolean(),
    arraySize: z.number().optional()
  })
}).optional()

// Sheet extents schema
const ExtentsSchema = z.object({
  width: z.number().positive('Width must be positive'),
  height: z.number().positive('Height must be positive')
})

// Sheet schema definition (recursive to support subsystems)
const SheetSchemaDefinition = z.object({
  id: z.string().min(1, 'Sheet ID cannot be empty'),
  name: z.string().min(1, 'Sheet name cannot be empty'),
  blocks: z.array(BlockSchema),
  connections: z.array(WireSchema),
  extents: ExtentsSchema,
  // Optional: Store propagated type information for optimization
  signalTypes: z.record(z.string(), SignalTypeInfoSchema).optional()
})

// Global settings schema
const GlobalSettingsSchema = z.object({
  simulationTimeStep: z.number().positive('Simulation time step must be positive'),
  simulationDuration: z.number().positive('Simulation duration must be positive')
})

// Metadata schema
const MetadataSchema = z.object({
  created: z.string().datetime('Invalid created timestamp'),
  description: z.string().optional()
})

// Main model data schema - only contains root-level sheets
export const ModelDataSchema = z.object({
  version: z.enum(['1.0', '2.0']).default('1.0'), // Support both versions
  metadata: MetadataSchema,
  sheets: z.array(SheetSchema).min(1, 'Model must have at least one sheet'),
  globalSettings: GlobalSettingsSchema
})

// Complete model schema (as stored in database)
export const ModelSchema = z.object({
  id: z.string().uuid('Model ID must be a valid UUID'),
  user_id: z.string().uuid('User ID must be a valid UUID'),
  name: z.string().min(1, 'Model name cannot be empty'),
  data: ModelDataSchema,
  created_at: z.string().datetime('Invalid created_at timestamp'),
  updated_at: z.string().datetime('Invalid updated_at timestamp')
})

// Type exports
export type ModelData = z.infer<typeof ModelDataSchema>
export type Block = z.infer<typeof BlockSchema>
export type Wire = z.infer<typeof WireSchema>
export type Sheet = z.infer<typeof SheetSchemaDefinition>
export type Position = z.infer<typeof PositionSchema>
export type Extents = z.infer<typeof ExtentsSchema>
export type GlobalSettings = z.infer<typeof GlobalSettingsSchema>
export type Metadata = z.infer<typeof MetadataSchema>
export type SignalType = z.infer<typeof SignalTypeSchema>
export type SignalTypeInfo = z.infer<typeof SignalTypeInfoSchema>
export type SubsystemParameters = z.infer<typeof SubsystemParametersSchema>

// Helper type to extract subsystem blocks
export type SubsystemBlock = Extract<Block, { type: 'subsystem' }>

// Validation functions
export function validateModelData(data: unknown): ModelData {
  return ModelDataSchema.parse(data)
}

export function validateModel(model: unknown): z.infer<typeof ModelSchema> {
  return ModelSchema.parse(model)
}

export function isValidModelData(data: unknown): data is ModelData {
  return ModelDataSchema.safeParse(data).success
}

export function isValidModel(model: unknown): model is z.infer<typeof ModelSchema> {
  return ModelSchema.safeParse(model).success
}

// Validation with detailed error reporting
export function validateModelDataWithErrors(data: unknown) {
  const result = ModelDataSchema.safeParse(data)
  if (result.success) {
    return { valid: true, data: result.data, errors: [] }
  }
  
  return { 
    valid: false, 
    data: null, 
    errors: result.error.errors.map(err => ({
      path: err.path.join('.'),
      message: err.message,
      code: err.code
    }))
  }
}

// Validation helper for signal types
export function validateSignalType(type: unknown): SignalType {
  return SignalTypeSchema.parse(type)
}

export function isValidSignalType(type: unknown): type is SignalType {
  return SignalTypeSchema.safeParse(type).success
}

// Helper to extract type information from a model
export function extractTypeInformation(modelData: ModelData): Map<string, string> {
  const typeInfo = new Map<string, string>()
  
  function extractFromSheets(sheets: Sheet[]) {
    for (const sheet of sheets) {
      for (const block of sheet.blocks) {
        // Extract explicit types from source blocks
        if ((block.type === 'source' || block.type === 'input_port') && 
            block.parameters?.dataType) {
          typeInfo.set(`${block.id}:0`, block.parameters.dataType)
        }
        
        // Recursively extract from subsystem sheets
        if (block.type === 'subsystem' && block.parameters.sheets) {
          extractFromSheets(block.parameters.sheets)
        }
      }
      
      // Include stored signal types if available
      if (sheet.signalTypes) {
        for (const [key, info] of Object.entries(sheet.signalTypes)) {
          if (info?.type) {
            typeInfo.set(key, info.type)
          }
        }
      }
    }
  }
  
  extractFromSheets(modelData.sheets)
  return typeInfo
}

// Helper to find all sheets in a model (including nested ones)
export function getAllSheets(modelData: ModelData): Sheet[] {
  const allSheets: Sheet[] = []
  
  function collectSheets(sheets: Sheet[]) {
    for (const sheet of sheets) {
      allSheets.push(sheet)
      
      // Collect sheets from subsystems
      for (const block of sheet.blocks) {
        if (block.type === 'subsystem' && block.parameters.sheets) {
          collectSheets(block.parameters.sheets)
        }
      }
    }
  }
  
  collectSheets(modelData.sheets)
  return allSheets
}

// Helper to find a sheet by ID anywhere in the model hierarchy
export function findSheetById(modelData: ModelData, sheetId: string): Sheet | null {
  function searchSheets(sheets: Sheet[]): Sheet | null {
    for (const sheet of sheets) {
      if (sheet.id === sheetId) {
        return sheet
      }
      
      // Search in subsystem sheets
      for (const block of sheet.blocks) {
        if (block.type === 'subsystem' && block.parameters.sheets) {
          const found = searchSheets(block.parameters.sheets)
          if (found) return found
        }
      }
    }
    return null
  }
  
  return searchSheets(modelData.sheets)
}