// __tests__/modelMigration.test.ts

import { migrateToHierarchicalSheets } from '@/lib/modelStore'

describe('migrateToHierarchicalSheets', () => {
  it('should convert flat model to hierarchical structure', () => {
    // Sample flat model with subsystem sheets at root level
    const flatModel = {
      version: "1.0",
      metadata: {
        created: "2024-01-01T00:00:00Z",
        description: "Test model"
      },
      sheets: [
        {
          id: "main",
          name: "Main",
          blocks: [
            {
              id: "subsystem_123",
              type: "subsystem",
              name: "Subsystem1",
              position: { x: 100, y: 100 },
              parameters: {
                sheetId: "subsystem_123_main",
                sheetName: "Subsystem1 Main",
                inputPorts: ["Input1"],
                outputPorts: ["Output1"]
              }
            }
          ],
          connections: [],
          extents: { width: 1000, height: 800 }
        },
        {
          id: "subsystem_123_main",
          name: "Subsystem1 Main",
          blocks: [
            {
              id: "input_1",
              type: "input_port",
              name: "Input1",
              position: { x: 50, y: 50 },
              parameters: { portName: "Input1", dataType: "double" }
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

    // Run migration
    const hierarchicalModel = migrateToHierarchicalSheets(flatModel)

    // Verify structure
    expect(hierarchicalModel.version).toBe("2.0")
    expect(hierarchicalModel.sheets).toHaveLength(1) // Only root sheet
    expect(hierarchicalModel.sheets[0].id).toBe("main")
    
    // Verify subsystem has embedded sheets
    const subsystemBlock = hierarchicalModel.sheets[0].blocks[0]
    expect(subsystemBlock.type).toBe("subsystem")
    expect(subsystemBlock.parameters.sheets).toBeDefined()
    expect(subsystemBlock.parameters.sheets).toHaveLength(1)
    expect(subsystemBlock.parameters.sheets[0].id).toBe("subsystem_123_main")
    
    // Verify old properties removed
    expect(subsystemBlock.parameters.sheetId).toBeUndefined()
    expect(subsystemBlock.parameters.sheetName).toBeUndefined()
  })

  it('should handle already hierarchical models', () => {
    const hierarchicalModel = {
      version: "2.0",
      sheets: [],
      metadata: {},
      globalSettings: {}
    }

    const result = migrateToHierarchicalSheets(hierarchicalModel)
    expect(result).toBe(hierarchicalModel) // Should return same object
  })
})