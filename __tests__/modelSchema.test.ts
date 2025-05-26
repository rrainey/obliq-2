import {
  ModelDataSchema,
  ModelSchema,
  validateModelData,
  validateModel,
  isValidModelData,
  isValidModel,
  validateModelDataWithErrors
} from '@/lib/modelSchema'
import { createDefaultModel } from '@/lib/defaultModel'

describe('Model Schema Validation', () => {
  describe('Valid Model Data', () => {
    test('should validate default model structure', () => {
      const defaultModel = createDefaultModel()
      
      expect(() => validateModelData(defaultModel)).not.toThrow()
      expect(isValidModelData(defaultModel)).toBe(true)
      
      const result = validateModelDataWithErrors(defaultModel)
      expect(result.valid).toBe(true)
      expect(result.errors).toHaveLength(0)
    })

    test('should validate model with multiple sheets', () => {
      const modelData = {
        version: "1.0",
        metadata: {
          created: new Date().toISOString(),
          description: "Test model with multiple sheets"
        },
        sheets: [
          {
            id: "main",
            name: "Main",
            blocks: [],
            connections: [],
            extents: { width: 1000, height: 800 }
          },
          {
            id: "subsystem1",
            name: "Subsystem 1",
            blocks: [],
            connections: [],
            extents: { width: 800, height: 600 }
          }
        ],
        globalSettings: {
          simulationTimeStep: 0.01,
          simulationDuration: 10.0
        }
      }

      expect(() => validateModelData(modelData)).not.toThrow()
      expect(isValidModelData(modelData)).toBe(true)
    })

    test('should validate model with blocks and connections', () => {
      const modelData = {
        version: "1.0",
        metadata: {
          created: new Date().toISOString(),
          description: "Test model with blocks"
        },
        sheets: [
          {
            id: "main",
            name: "Main",
            blocks: [
              {
                id: "source1",
                type: "source",
                name: "Source Block",
                position: { x: 100, y: 100 },
                parameters: { value: 1.0, signalType: "constant" }
              },
              {
                id: "sum1",
                type: "sum",
                name: "Sum Block",
                position: { x: 300, y: 100 },
                parameters: {}
              }
            ],
            connections: [
              {
                id: "wire1",
                sourceBlockId: "source1",
                sourcePortIndex: 0,
                targetBlockId: "sum1",
                targetPortIndex: 0
              }
            ],
            extents: { width: 1000, height: 800 }
          }
        ],
        globalSettings: {
          simulationTimeStep: 0.01,
          simulationDuration: 10.0
        }
      }

      expect(() => validateModelData(modelData)).not.toThrow()
      expect(isValidModelData(modelData)).toBe(true)
    })

    test('should validate complete model (database format)', () => {
      const completeModel = {
        id: "123e4567-e89b-12d3-a456-426614174000",
        user_id: "456e7890-e12b-34c5-a678-123456789012",
        name: "Test Model",
        data: createDefaultModel(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }

      expect(() => validateModel(completeModel)).not.toThrow()
      expect(isValidModel(completeModel)).toBe(true)
    })
  })

  describe('Invalid Model Data', () => {
    test('should reject empty model', () => {
      expect(() => validateModelData({})).toThrow()
      expect(isValidModelData({})).toBe(false)
    })

    test('should reject model without version', () => {
      const invalidModel = {
        metadata: {
          created: new Date().toISOString(),
          description: "No version"
        },
        sheets: [],
        globalSettings: {
          simulationTimeStep: 0.01,
          simulationDuration: 10.0
        }
      }

      expect(() => validateModelData(invalidModel)).toThrow()
      expect(isValidModelData(invalidModel)).toBe(false)
    })

    test('should reject model without sheets', () => {
      const invalidModel = {
        version: "1.0",
        metadata: {
          created: new Date().toISOString(),
          description: "No sheets"
        },
        sheets: [],
        globalSettings: {
          simulationTimeStep: 0.01,
          simulationDuration: 10.0
        }
      }

      const result = validateModelDataWithErrors(invalidModel)
      expect(result.valid).toBe(false)
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          path: 'sheets',
          message: 'Model must have at least one sheet'
        })
      )
    })

    test('should reject blocks with invalid types', () => {
      const invalidModel = {
        version: "1.0",
        metadata: {
          created: new Date().toISOString(),
          description: "Invalid block type"
        },
        sheets: [
          {
            id: "main",
            name: "Main",
            blocks: [
              {
                id: "invalid1",
                type: "invalid_block_type",
                name: "Invalid Block",
                position: { x: 100, y: 100 },
                parameters: {}
              }
            ],
            connections: [],
            extents: { width: 1000, height: 800 }
          }
        ],
        globalSettings: {
          simulationTimeStep: 0.01,
          simulationDuration: 10.0
        }
      }

      const result = validateModelDataWithErrors(invalidModel)
      expect(result.valid).toBe(false)
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          path: 'sheets.0.blocks.0.type'
        })
      )
    })

    test('should reject blocks with missing required fields', () => {
      const invalidModel = {
        version: "1.0",
        metadata: {
          created: new Date().toISOString(),
          description: "Missing block fields"
        },
        sheets: [
          {
            id: "main",
            name: "Main",
            blocks: [
              {
                id: "",  // Empty ID
                type: "sum",
                name: "",  // Empty name
                position: { x: 100, y: 100 }
              }
            ],
            connections: [],
            extents: { width: 1000, height: 800 }
          }
        ],
        globalSettings: {
          simulationTimeStep: 0.01,
          simulationDuration: 10.0
        }
      }

      const result = validateModelDataWithErrors(invalidModel)
      expect(result.valid).toBe(false)
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          path: 'sheets.0.blocks.0.id',
          message: 'Block ID cannot be empty'
        })
      )
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          path: 'sheets.0.blocks.0.name',
          message: 'Block name cannot be empty'
        })
      )
    })

    test('should reject wires with invalid port indices', () => {
      const invalidModel = {
        version: "1.0",
        metadata: {
          created: new Date().toISOString(),
          description: "Invalid wire port indices"
        },
        sheets: [
          {
            id: "main",
            name: "Main",
            blocks: [],
            connections: [
              {
                id: "wire1",
                sourceBlockId: "source1",
                sourcePortIndex: -1,  // Invalid negative index
                targetBlockId: "sum1",
                targetPortIndex: 0
              }
            ],
            extents: { width: 1000, height: 800 }
          }
        ],
        globalSettings: {
          simulationTimeStep: 0.01,
          simulationDuration: 10.0
        }
      }

      const result = validateModelDataWithErrors(invalidModel)
      expect(result.valid).toBe(false)
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          path: 'sheets.0.connections.0.sourcePortIndex',
          message: 'Source port index must be non-negative'
        })
      )
    })

    test('should reject global settings with invalid values', () => {
      const invalidModel = {
        version: "1.0",
        metadata: {
          created: new Date().toISOString(),
          description: "Invalid global settings"
        },
        sheets: [
          {
            id: "main",
            name: "Main",
            blocks: [],
            connections: [],
            extents: { width: 1000, height: 800 }
          }
        ],
        globalSettings: {
          simulationTimeStep: -0.01,  // Invalid negative time step
          simulationDuration: 0       // Invalid zero duration
        }
      }

      const result = validateModelDataWithErrors(invalidModel)
      expect(result.valid).toBe(false)
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          path: 'globalSettings.simulationTimeStep',
          message: 'Simulation time step must be positive'
        })
      )
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          path: 'globalSettings.simulationDuration',
          message: 'Simulation duration must be positive'
        })
      )
    })

    test('should reject model with invalid UUIDs', () => {
      const invalidModel = {
        id: "not-a-uuid",
        user_id: "also-not-a-uuid",
        name: "Test Model",
        data: createDefaultModel(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }

      expect(() => validateModel(invalidModel)).toThrow()
      expect(isValidModel(invalidModel)).toBe(false)
    })

    test('should reject model with invalid timestamps', () => {
      const invalidModel = {
        id: "123e4567-e89b-12d3-a456-426614174000",
        user_id: "456e7890-e12b-34c5-a678-123456789012",
        name: "Test Model",
        data: {
          ...createDefaultModel(),
          metadata: {
            created: "not-a-date",
            description: "Invalid timestamp"
          }
        },
        created_at: "also-not-a-date",
        updated_at: new Date().toISOString()
      }

      expect(() => validateModel(invalidModel)).toThrow()
      expect(isValidModel(invalidModel)).toBe(false)
    })
  })

  describe('Block Type Validation', () => {
    const validBlockTypes = [
      'sum', 'multiply', 'transfer_function', 'signal_display', 'signal_logger',
      'input_port', 'output_port', 'source', 'scale', 'lookup_1d', 'lookup_2d', 'subsystem'
    ]

    test.each(validBlockTypes)('should accept block type: %s', (blockType) => {
      const modelData = {
        version: "1.0",
        metadata: {
          created: new Date().toISOString(),
          description: `Test ${blockType} block`
        },
        sheets: [
          {
            id: "main",
            name: "Main",
            blocks: [
              {
                id: `${blockType}1`,
                type: blockType,
                name: `${blockType} Block`,
                position: { x: 100, y: 100 },
                parameters: {}
              }
            ],
            connections: [],
            extents: { width: 1000, height: 800 }
          }
        ],
        globalSettings: {
          simulationTimeStep: 0.01,
          simulationDuration: 10.0
        }
      }

      expect(() => validateModelData(modelData)).not.toThrow()
      expect(isValidModelData(modelData)).toBe(true)
    })
  })

  describe('Error Reporting', () => {
    test('should provide detailed error information', () => {
      const invalidModel = {
        version: "",
        metadata: {
          created: "invalid-date",
          description: "Test"
        },
        sheets: [],
        globalSettings: {
          simulationTimeStep: -1,
          simulationDuration: 0
        }
      }

      const result = validateModelDataWithErrors(invalidModel)
      expect(result.valid).toBe(false)
      expect(result.errors.length).toBeGreaterThan(0)
      
      // Check that each error has required properties
      result.errors.forEach(error => {
        expect(error).toHaveProperty('path')
        expect(error).toHaveProperty('message')
        expect(error).toHaveProperty('code')
      })
    })
  })
})