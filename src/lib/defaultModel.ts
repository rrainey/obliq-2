// Default model structure for new models
export const createDefaultModel = () => ({
  version: "1.0",
  metadata: {
    created: new Date().toISOString(),
    description: "New Model"
  },
  sheets: [
    {
      id: "main",
      name: "Main",
      blocks: [],
      connections: [],
      extents: {
        width: 1000,
        height: 800
      }
    }
  ],
  globalSettings: {
    simulationTimeStep: 0.01,
    simulationDuration: 10.0
  }
})