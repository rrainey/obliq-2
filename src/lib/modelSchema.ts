// lib/modelSchema.ts
import { z } from 'zod'

// Block position schema
const PositionSchema = z.object({
  x: z.number(),
  y: z.number()
})

// Block parameters schema (flexible for different block types)
const BlockParametersSchema = z.record(z.any()).optional()

// Block schema
const BlockSchema = z.object({
  id: z.string().min(1, 'Block ID cannot be empty'),
  type: z.enum([
    'sum', 'multiply', 'transfer_function', 'signal_display', 'signal_logger',
    'input_port', 'output_port', 'source', 'scale', 'lookup_1d', 'lookup_2d', 'subsystem'
  ]),
  name: z.string().min(1, 'Block name cannot be empty'),
  position: PositionSchema,
  parameters: BlockParametersSchema
})

// Wire/Connection schema
const WireSchema = z.object({
  id: z.string().min(1, 'Wire ID cannot be empty'),
  sourceBlockId: z.string().min(1, 'Source block ID cannot be empty'),
  sourcePortIndex: z.number().min(0, 'Source port index must be non-negative'),
  targetBlockId: z.string().min(1, 'Target block ID cannot be empty'),
  targetPortIndex: z.number().min(0, 'Target port index must be non-negative')
})

// Sheet extents schema
const ExtentsSchema = z.object({
  width: z.number().positive('Width must be positive'),
  height: z.number().positive('Height must be positive')
})

// Sheet schema
const SheetSchema = z.object({
  id: z.string().min(1, 'Sheet ID cannot be empty'),
  name: z.string().min(1, 'Sheet name cannot be empty'),
  blocks: z.array(BlockSchema),
  connections: z.array(WireSchema),
  extents: ExtentsSchema
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

// Main model data schema
export const ModelDataSchema = z.object({
  version: z.string().min(1, 'Version cannot be empty'),
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
export type Sheet = z.infer<typeof SheetSchema>
export type Position = z.infer<typeof PositionSchema>
export type Extents = z.infer<typeof ExtentsSchema>
export type GlobalSettings = z.infer<typeof GlobalSettingsSchema>
export type Metadata = z.infer<typeof MetadataSchema>

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