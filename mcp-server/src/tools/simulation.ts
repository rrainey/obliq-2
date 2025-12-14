// mcp-server/src/tools/simulation.ts
import { apiClient } from '../client.js';
import {
  ToolWithHandler,
  RunSimulationInput,
  RunSimulationOutput,
  GetSimulationResultsInput,
  GetSimulationResultsOutput
} from '../types.js';

export const runSimulationTool: ToolWithHandler = {
  name: 'run_simulation',
  description: 'Run a WASM-compiled simulation on a model. The model is compiled to WebAssembly and executed server-side for high performance.',
  inputSchema: {
    type: 'object',
    properties: {
      modelId: {
        type: 'string',
        description: 'UUID of the model to simulate'
      },
      version: {
        type: 'number',
        description: 'Optional version number to simulate'
      },
      timeStep: {
        type: 'number',
        description: 'Simulation time step in seconds (default: 0.01)',
        minimum: 0.0001,
        maximum: 1.0
      },
      duration: {
        type: 'number',
        description: 'Simulation duration in seconds (default: 10.0)',
        minimum: 0.1,
        maximum: 3600
      },
      inputs: {
        type: 'object',
        description: 'Input values to set before simulation. Keys are input port names, values are numbers.',
        additionalProperties: { type: 'number' }
      },
      optimizationLevel: {
        type: 'string',
        description: 'WASM compilation optimization level (default: O2)',
        enum: ['O0', 'O1', 'O2', 'O3']
      },
      includeTimeSeries: {
        type: 'boolean',
        description: 'Include full time series data in signal results (default: false, only returns statistics)'
      },
      sampleRate: {
        type: 'number',
        description: 'Sample rate for time series (every N steps, default: 1). Only used if includeTimeSeries is true.',
        minimum: 1
      }
    },
    required: ['modelId']
  },
  handler: async (args: unknown): Promise<RunSimulationOutput> => {
    const input = args as RunSimulationInput;

    try {
      // Validate model ID format
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(input.modelId)) {
        return {
          success: false,
          error: 'Invalid model ID format. Must be a valid UUID.'
        };
      }

      // Prepare simulation parameters - pass all supported options
      const parameters: any = {};
      if (input.timeStep !== undefined) {
        parameters.timeStep = input.timeStep;
      }
      if (input.duration !== undefined) {
        parameters.duration = input.duration;
      }
      if (input.inputs !== undefined) {
        parameters.inputs = input.inputs;
      }
      if (input.optimizationLevel !== undefined) {
        parameters.optimizationLevel = input.optimizationLevel;
      }
      if (input.includeTimeSeries !== undefined) {
        parameters.includeTimeSeries = input.includeTimeSeries;
      }
      if (input.sampleRate !== undefined) {
        parameters.sampleRate = input.sampleRate;
      }

      // Call the automation API to run WASM simulation
      const response = await apiClient.simulate(input.modelId, parameters, input.version);

      if (!response.success) {
        return {
          success: false,
          error: response.error || 'Simulation failed',
          errorDetails: {
            code: response.code,
            emccError: response.details?.emccError,
            errors: response.errors,
            ...response.details
          }
        };
      }

      // Extract simulation results
      const data = response.data;

      return {
        success: true,
        simulationDuration: data.simulationDuration,
        timePoints: data.timePoints,
        outputPorts: data.outputPorts || {},
        signals: data.signals || {},
        // Include performance metrics from WASM execution
        performance: data.performance
      };

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error during simulation'
      };
    }
  }
};

export const getSimulationResultsTool: ToolWithHandler = {
  name: 'get_simulation_results',
  description: 'Get detailed simulation results. Note: For time series data, use run_simulation with includeTimeSeries=true instead.',
  inputSchema: {
    type: 'object',
    properties: {
      modelId: {
        type: 'string',
        description: 'UUID of the model'
      },
      blockId: {
        type: 'string',
        description: 'Optional block ID to get specific signal data'
      }
    },
    required: ['modelId']
  },
  handler: async (args: unknown): Promise<GetSimulationResultsOutput> => {
    const input = args as GetSimulationResultsInput;

    try {
      // Validate model ID format
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(input.modelId)) {
        return {
          success: false,
          error: 'Invalid model ID format. Must be a valid UUID.'
        };
      }

      // Validate block ID if provided
      if (input.blockId && !uuidRegex.test(input.blockId)) {
        return {
          success: false,
          error: 'Invalid block ID format. Must be a valid UUID.'
        };
      }

      // Time series data is now available through run_simulation with includeTimeSeries=true
      return {
        success: false,
        error: 'Use run_simulation with includeTimeSeries=true to get time series data. ' +
               'Example: run_simulation({ modelId: "...", duration: 10, includeTimeSeries: true }). ' +
               'The signals field in the response will include a "data" array for each signal.'
      };

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
};