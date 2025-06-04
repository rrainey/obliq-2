// mcp-server/src/tools/simulation.ts
import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { apiClient } from '../client.js';
import {
  RunSimulationInput,
  RunSimulationOutput,
  GetSimulationResultsInput,
  GetSimulationResultsOutput
} from '../types.js';

export const runSimulationTool: Tool = {
  name: 'run_simulation',
  description: 'Run a simulation on a model',
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
        description: 'Simulation time step (default: 0.01)',
        minimum: 0.0001,
        maximum: 1.0
      },
      duration: {
        type: 'number',
        description: 'Simulation duration in seconds (default: 10.0)',
        minimum: 0.1,
        maximum: 3600
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
      
      // Prepare simulation parameters
      const parameters: any = {};
      if (input.timeStep !== undefined) {
        parameters.timeStep = input.timeStep;
      }
      if (input.duration !== undefined) {
        parameters.duration = input.duration;
      }
      
      // Call the automation API to run simulation
      const response = await apiClient.simulate(input.modelId, parameters, input.version);
      
      if (!response.success) {
        return {
          success: false,
          error: response.error || 'Simulation failed'
        };
      }
      
      // Extract simulation results
      const data = response.data;
      
      return {
        success: true,
        simulationDuration: data.simulationDuration,
        timePoints: data.timePoints,
        outputPorts: data.outputPorts || {},
        signals: data.signals || {}
      };
      
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error during simulation'
      };
    }
  }
};

export const getSimulationResultsTool: Tool = {
  name: 'get_simulation_results',
  description: 'Get detailed simulation results',
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
      
      // The automation API returns summary results, not detailed time series
      // A full implementation would need to either:
      // 1. Store simulation results temporarily
      // 2. Return results as part of run_simulation
      // 3. Add a new API endpoint for detailed results
      
      return {
        success: false,
        error: 'Detailed simulation results are not available through the automation API. ' +
               'The run_simulation tool returns summary statistics. ' +
               'For detailed time series data, consider implementing result storage or use the web UI.'
      };
      
      // In a full implementation, this would return:
      // - timePoints: array of simulation time values
      // - signalData: map of blockId to array of values at each time point
      // - Filtered by blockId if specified
      
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
};