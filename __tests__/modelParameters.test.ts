// __tests__/modelParameters.test.ts
import {
  ModelDataSchema,
  validateModelData,
  validateModelDataWithErrors,
  isValidModelData
} from '@/lib/modelSchema'

describe('Model Parameters Validation (Feature 1)', () => {
  describe('Valid Parameters', () => {
    test('should accept model with empty parameters array (v2.1)', () => {
      const modelData = {
        version: "2.1",
        metadata: {
          created: new Date().toISOString(),
          description: "Model with no parameters"
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
          simulationTimeStep: 0.01,
          simulationDuration: 10.0
        },
        parameters: []
      }

      expect(() => validateModelData(modelData)).not.toThrow()
      expect(isValidModelData(modelData)).toBe(true)
    })

    test('should accept model without parameters field (backward compatibility)', () => {
      const modelData = {
        version: "2.0",
        metadata: {
          created: new Date().toISOString(),
          description: "Old model without parameters"
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
          simulationTimeStep: 0.01,
          simulationDuration: 10.0
        }
      }

      const result = validateModelData(modelData)
      expect(result.parameters).toEqual([]) // Should default to empty array
    })

    test('should accept scalar parameter (double)', () => {
      const modelData = {
        version: "2.1",
        metadata: {
          created: new Date().toISOString(),
          description: "Model with scalar parameter"
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
          simulationTimeStep: 0.01,
          simulationDuration: 10.0
        },
        parameters: [
          {
            name: "PI",
            signalType: "double",
            value: 3.14159
          }
        ]
      }

      expect(() => validateModelData(modelData)).not.toThrow()
      expect(isValidModelData(modelData)).toBe(true)
    })

    test('should accept vector parameter', () => {
      const modelData = {
        version: "2.1",
        metadata: {
          created: new Date().toISOString(),
          description: "Model with vector parameter"
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
          simulationTimeStep: 0.01,
          simulationDuration: 10.0
        },
        parameters: [
          {
            name: "VECTOR_PARAM",
            signalType: "double[3]",
            value: [1.0, 2.0, 3.0]
          }
        ]
      }

      expect(() => validateModelData(modelData)).not.toThrow()
      expect(isValidModelData(modelData)).toBe(true)
    })

    test('should accept matrix parameter', () => {
      const modelData = {
        version: "2.1",
        metadata: {
          created: new Date().toISOString(),
          description: "Model with matrix parameter"
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
          simulationTimeStep: 0.01,
          simulationDuration: 10.0
        },
        parameters: [
          {
            name: "MATRIX_PARAM",
            signalType: "float[2][3]",
            value: [[1, 2, 3], [4, 5, 6]]
          }
        ]
      }

      expect(() => validateModelData(modelData)).not.toThrow()
      expect(isValidModelData(modelData)).toBe(true)
    })

    test('should accept multiple parameters with different types', () => {
      const modelData = {
        version: "2.1",
        metadata: {
          created: new Date().toISOString(),
          description: "Model with multiple parameters"
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
          simulationTimeStep: 0.01,
          simulationDuration: 10.0
        },
        parameters: [
          {
            name: "SCALAR_DOUBLE",
            signalType: "double",
            value: 1.5
          },
          {
            name: "SCALAR_FLOAT",
            signalType: "float",
            value: 2.5
          },
          {
            name: "SCALAR_LONG",
            signalType: "long",
            value: 42
          },
          {
            name: "VECTOR_BOOL",
            signalType: "bool[4]",
            value: [1, 0, 1, 0]
          },
          {
            name: "MATRIX_DOUBLE",
            signalType: "double[2][2]",
            value: [[1.1, 2.2], [3.3, 4.4]]
          }
        ]
      }

      expect(() => validateModelData(modelData)).not.toThrow()
      expect(isValidModelData(modelData)).toBe(true)
    })

    test('should accept parameter names with underscores', () => {
      const modelData = {
        version: "2.1",
        metadata: {
          created: new Date().toISOString(),
          description: "Model with underscored parameter names"
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
          simulationTimeStep: 0.01,
          simulationDuration: 10.0
        },
        parameters: [
          {
            name: "_private_param",
            signalType: "double",
            value: 1.0
          },
          {
            name: "MY_CONSTANT_VALUE",
            signalType: "double",
            value: 2.0
          },
          {
            name: "param_123",
            signalType: "double",
            value: 3.0
          }
        ]
      }

      expect(() => validateModelData(modelData)).not.toThrow()
      expect(isValidModelData(modelData)).toBe(true)
    })
  })

  describe('Invalid Parameters', () => {
    test('should reject parameter with empty name', () => {
      const modelData = {
        version: "2.1",
        metadata: {
          created: new Date().toISOString(),
          description: "Invalid parameter"
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
          simulationTimeStep: 0.01,
          simulationDuration: 10.0
        },
        parameters: [
          {
            name: "",
            signalType: "double",
            value: 1.0
          }
        ]
      }

      const result = validateModelDataWithErrors(modelData)
      expect(result.valid).toBe(false)
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          path: 'parameters.0.name',
          message: 'Parameter name cannot be empty'
        })
      )
    })

    test('should reject parameter with invalid identifier (starts with number)', () => {
      const modelData = {
        version: "2.1",
        metadata: {
          created: new Date().toISOString(),
          description: "Invalid parameter"
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
          simulationTimeStep: 0.01,
          simulationDuration: 10.0
        },
        parameters: [
          {
            name: "123_param",
            signalType: "double",
            value: 1.0
          }
        ]
      }

      const result = validateModelDataWithErrors(modelData)
      expect(result.valid).toBe(false)
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          path: 'parameters.0.name',
          message: expect.stringContaining('valid identifier')
        })
      )
    })

    test('should reject parameter with invalid identifier (contains spaces)', () => {
      const modelData = {
        version: "2.1",
        metadata: {
          created: new Date().toISOString(),
          description: "Invalid parameter"
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
          simulationTimeStep: 0.01,
          simulationDuration: 10.0
        },
        parameters: [
          {
            name: "my parameter",
            signalType: "double",
            value: 1.0
          }
        ]
      }

      const result = validateModelDataWithErrors(modelData)
      expect(result.valid).toBe(false)
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          path: 'parameters.0.name',
          message: expect.stringContaining('valid identifier')
        })
      )
    })

    test('should reject parameter with invalid identifier (special characters)', () => {
      const modelData = {
        version: "2.1",
        metadata: {
          created: new Date().toISOString(),
          description: "Invalid parameter"
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
          simulationTimeStep: 0.01,
          simulationDuration: 10.0
        },
        parameters: [
          {
            name: "my-param",
            signalType: "double",
            value: 1.0
          }
        ]
      }

      const result = validateModelDataWithErrors(modelData)
      expect(result.valid).toBe(false)
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          path: 'parameters.0.name'
        })
      )
    })

    test('should reject duplicate parameter names', () => {
      const modelData = {
        version: "2.1",
        metadata: {
          created: new Date().toISOString(),
          description: "Duplicate parameters"
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
          simulationTimeStep: 0.01,
          simulationDuration: 10.0
        },
        parameters: [
          {
            name: "MY_PARAM",
            signalType: "double",
            value: 1.0
          },
          {
            name: "MY_PARAM",
            signalType: "float",
            value: 2.0
          }
        ]
      }

      const result = validateModelDataWithErrors(modelData)
      expect(result.valid).toBe(false)
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          path: 'parameters.1.name',
          message: expect.stringContaining('Duplicate parameter name')
        })
      )
    })

    test('should reject parameter name that conflicts with block name', () => {
      const modelData = {
        version: "2.1",
        metadata: {
          created: new Date().toISOString(),
          description: "Parameter conflicts with block"
        },
        sheets: [
          {
            id: "main",
            name: "Main",
            blocks: [
              {
                id: "source1",
                type: "source",
                name: "MY_BLOCK",
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
        },
        parameters: [
          {
            name: "MY_BLOCK",
            signalType: "double",
            value: 1.0
          }
        ]
      }

      const result = validateModelDataWithErrors(modelData)
      expect(result.valid).toBe(false)
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          path: 'parameters.0.name',
          message: expect.stringContaining('conflicts with a top-level block name')
        })
      )
    })
  })

  describe('Backward Compatibility', () => {
    test('should load v1.0 model and default parameters to empty array', () => {
      const v1Model = {
        version: "1.0",
        metadata: {
          created: new Date().toISOString(),
          description: "Old v1.0 model"
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
          simulationTimeStep: 0.01,
          simulationDuration: 10.0
        }
      }

      const validated = validateModelData(v1Model)
      expect(validated.parameters).toEqual([])
    })

    test('should load v2.0 model and default parameters to empty array', () => {
      const v2Model = {
        version: "2.0",
        metadata: {
          created: new Date().toISOString(),
          description: "v2.0 model"
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
          simulationTimeStep: 0.01,
          simulationDuration: 10.0
        }
      }

      const validated = validateModelData(v2Model)
      expect(validated.parameters).toEqual([])
    })

    test('should accept all supported versions (1.0, 2.0, 2.1)', () => {
      const versions = ["1.0", "2.0", "2.1"]

      versions.forEach(version => {
        const modelData = {
          version,
          metadata: {
            created: new Date().toISOString(),
            description: `Model version ${version}`
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
            simulationTimeStep: 0.01,
            simulationDuration: 10.0
          }
        }

        expect(() => validateModelData(modelData)).not.toThrow()
      })
    })
  })
})
