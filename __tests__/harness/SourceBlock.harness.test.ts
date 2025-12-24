/**
 * Source Block Tests using BlockTestHarness
 *
 * Tests the C code generation for Source block signal types:
 * - Step signal
 * - Ramp signal
 * - Sine signal
 * - Constant signal
 */

import { BlockTestHarness, createHarness } from './BlockTestHarness'

describe('Source Block - Harness Tests', () => {
  let harness: BlockTestHarness

  // Increase timeout for Docker compilation
  jest.setTimeout(300000) // 5 minutes

  beforeEach(() => {
    harness = createHarness()
  })

  afterEach(async () => {
    await harness.cleanup()
  })

  describe('Constant Signal', () => {
    it('should output a constant value', async () => {
      const model = harness.createTestModel({
        blocks: [{
          type: 'source',
          name: 'ConstSource',
          parameters: {
            signalType: 'constant',
            dataType: 'double',
            value: 42.0
          }
        }],
        outputs: ['ConstSource']
      })

      const compiled = await harness.generateAndCompile(model, 'const_source_test')
      const results = await harness.runSimulation(compiled, {
        duration: 1.0,
        dt: 0.1
      })

      // Constant should be 42.0 at all times
      harness.assertOutputAt(results, 0.1, 'out_0', 42.0)
      harness.assertOutputAt(results, 0.5, 'out_0', 42.0)
      harness.assertFinalOutput(results, 'out_0', 42.0)
    })
  })

  describe('Step Signal', () => {
    it('should output 0 before step time, then step value', async () => {
      const model = harness.createTestModel({
        blocks: [{
          type: 'source',
          name: 'StepSource',
          parameters: {
            signalType: 'step',
            dataType: 'double',
            stepTime: 1.0,
            stepValue: 5.0
          }
        }],
        outputs: ['StepSource']
      })

      const compiled = await harness.generateAndCompile(model, 'step_source_test')
      const results = await harness.runSimulation(compiled, {
        duration: 3.0,
        dt: 0.1
      })

      // Note: Outputs at recorded time T were computed at model->time = T - dt
      // So to verify behavior at step time 1.0, we check at recorded time 1.1
      // Before step time: output should be 0
      harness.assertOutputAt(results, 0.5, 'out_0', 0.0)
      harness.assertOutputAt(results, 1.0, 'out_0', 0.0) // Computed at t=0.9

      // After step time (computed time >= 1.0): output should be stepValue
      // At recorded t=1.2, computed t=1.1 >= 1.0, so output = 5
      harness.assertOutputAt(results, 1.2, 'out_0', 5.0)
      harness.assertOutputAt(results, 2.0, 'out_0', 5.0)
      harness.assertFinalOutput(results, 'out_0', 5.0)
    })

    it('should handle step at t=0', async () => {
      const model = harness.createTestModel({
        blocks: [{
          type: 'source',
          name: 'StepSource',
          parameters: {
            signalType: 'step',
            dataType: 'double',
            stepTime: 0.0,
            stepValue: 10.0
          }
        }],
        outputs: ['StepSource']
      })

      const compiled = await harness.generateAndCompile(model, 'step_zero_test')
      const results = await harness.runSimulation(compiled, {
        duration: 1.0,
        dt: 0.1
      })

      // Step at t=0 means output should always be stepValue (since time >= 0 always)
      harness.assertOutputAt(results, 0.1, 'out_0', 10.0)
      harness.assertFinalOutput(results, 'out_0', 10.0)
    })

    it('should handle negative step values', async () => {
      const model = harness.createTestModel({
        blocks: [{
          type: 'source',
          name: 'StepSource',
          parameters: {
            signalType: 'step',
            dataType: 'double',
            stepTime: 0.5,
            stepValue: -3.0
          }
        }],
        outputs: ['StepSource']
      })

      const compiled = await harness.generateAndCompile(model, 'step_neg_test')
      const results = await harness.runSimulation(compiled, {
        duration: 2.0,
        dt: 0.1
      })

      harness.assertOutputAt(results, 0.4, 'out_0', 0.0) // Computed at t=0.3
      harness.assertOutputAt(results, 1.0, 'out_0', -3.0) // Computed at t=0.9 >= 0.5
    })
  })

  describe('Ramp Signal', () => {
    it('should output startValue + slope * time', async () => {
      const model = harness.createTestModel({
        blocks: [{
          type: 'source',
          name: 'RampSource',
          parameters: {
            signalType: 'ramp',
            dataType: 'double',
            startValue: 0.0,
            slope: 1.0
          }
        }],
        outputs: ['RampSource']
      })

      const compiled = await harness.generateAndCompile(model, 'ramp_source_test')
      const results = await harness.runSimulation(compiled, {
        duration: 5.0,
        dt: 0.1
      })

      // Note: Output at recorded time T was computed at model->time = T - dt
      // With slope=1, output = computation_time = recorded_time - dt
      // At recorded t=1.1, computed at t=1.0, so output=1.0
      harness.assertOutputAt(results, 1.1, 'out_0', 1.0, 0.01)
      harness.assertOutputAt(results, 2.1, 'out_0', 2.0, 0.01)
      harness.assertOutputAt(results, 3.1, 'out_0', 3.0, 0.01)
      // Final output at t=5.0 was computed at t=4.9
      harness.assertFinalOutput(results, 'out_0', 4.9, 0.01)
    })

    it('should handle non-zero start value', async () => {
      const model = harness.createTestModel({
        blocks: [{
          type: 'source',
          name: 'RampSource',
          parameters: {
            signalType: 'ramp',
            dataType: 'double',
            startValue: 10.0,
            slope: 2.0
          }
        }],
        outputs: ['RampSource']
      })

      const compiled = await harness.generateAndCompile(model, 'ramp_offset_test')
      const results = await harness.runSimulation(compiled, {
        duration: 3.0,
        dt: 0.1
      })

      // output = 10 + 2*computed_time, where computed_time = recorded_time - dt
      // At recorded t=0.1, computed at t=0, output = 10 + 2*0 = 10
      harness.assertOutputAt(results, 0.1, 'out_0', 10.0, 0.01)
      // At recorded t=1.1, computed at t=1.0, output = 10 + 2*1 = 12
      harness.assertOutputAt(results, 1.1, 'out_0', 12.0, 0.01)
      // At recorded t=2.1, computed at t=2.0, output = 10 + 2*2 = 14
      harness.assertOutputAt(results, 2.1, 'out_0', 14.0, 0.01)
      // Final at t=3.0, computed at t=2.9, output = 10 + 2*2.9 = 15.8
      harness.assertFinalOutput(results, 'out_0', 15.8, 0.01)
    })

    it('should handle negative slope', async () => {
      const model = harness.createTestModel({
        blocks: [{
          type: 'source',
          name: 'RampSource',
          parameters: {
            signalType: 'ramp',
            dataType: 'double',
            startValue: 100.0,
            slope: -10.0
          }
        }],
        outputs: ['RampSource']
      })

      const compiled = await harness.generateAndCompile(model, 'ramp_neg_test')
      const results = await harness.runSimulation(compiled, {
        duration: 5.0,
        dt: 0.1
      })

      // output = 100 - 10*computed_time
      // At recorded t=1.0, computed at t=0.9, output = 100 - 10*0.9 = 91
      harness.assertOutputAt(results, 1.0, 'out_0', 91.0, 0.01)
      // At recorded t=5.0, computed at t=4.9, output = 100 - 10*4.9 = 51
      harness.assertOutputAt(results, 5.0, 'out_0', 51.0, 0.01)
    })
  })

  describe('Sine Signal', () => {
    it('should output amplitude * sin(2*PI*frequency*time)', async () => {
      const model = harness.createTestModel({
        blocks: [{
          type: 'source',
          name: 'SineSource',
          parameters: {
            signalType: 'sine',
            dataType: 'double',
            frequency: 1.0, // 1 Hz
            amplitude: 1.0  // Scale/peak value
          }
        }],
        outputs: ['SineSource']
      })

      const compiled = await harness.generateAndCompile(model, 'sine_source_test')
      const results = await harness.runSimulation(compiled, {
        duration: 2.0,
        dt: 0.01 // Finer resolution for sine wave
      })

      // Note: Output at recorded time T was computed at model->time = T - dt
      // At recorded t=0.01, computed at t=0: sin(0) = 0
      harness.assertOutputAt(results, 0.01, 'out_0', 0.0, 0.02)

      // At recorded t=0.26, computed at t=0.25: sin(PI/2) = 1
      harness.assertOutputAt(results, 0.26, 'out_0', 1.0, 0.02)

      // At recorded t=0.51, computed at t=0.5: sin(PI) = 0
      harness.assertOutputAt(results, 0.51, 'out_0', 0.0, 0.02)

      // At recorded t=0.76, computed at t=0.75: sin(3*PI/2) = -1
      harness.assertOutputAt(results, 0.76, 'out_0', -1.0, 0.02)

      // At recorded t=1.01, computed at t=1.0: sin(2*PI) = 0
      harness.assertOutputAt(results, 1.01, 'out_0', 0.0, 0.02)
    })

    it('should handle different amplitudes', async () => {
      const model = harness.createTestModel({
        blocks: [{
          type: 'source',
          name: 'SineSource',
          parameters: {
            signalType: 'sine',
            dataType: 'double',
            frequency: 1.0,
            amplitude: 5.0  // Scale/peak value = 5
          }
        }],
        outputs: ['SineSource']
      })

      const compiled = await harness.generateAndCompile(model, 'sine_amp_test')
      const results = await harness.runSimulation(compiled, {
        duration: 1.0,
        dt: 0.01
      })

      // At recorded t=0.26, computed at t=0.25: 5 * sin(PI/2) = 5
      harness.assertOutputAt(results, 0.26, 'out_0', 5.0, 0.1)

      // At recorded t=0.76, computed at t=0.75: 5 * sin(3*PI/2) = -5
      harness.assertOutputAt(results, 0.76, 'out_0', -5.0, 0.1)
    })

    it('should handle different frequencies', async () => {
      const model = harness.createTestModel({
        blocks: [{
          type: 'source',
          name: 'SineSource',
          parameters: {
            signalType: 'sine',
            dataType: 'double',
            frequency: 2.0, // 2 Hz - twice as fast
            amplitude: 1.0
          }
        }],
        outputs: ['SineSource']
      })

      const compiled = await harness.generateAndCompile(model, 'sine_freq_test')
      const results = await harness.runSimulation(compiled, {
        duration: 1.0,
        dt: 0.01
      })

      // At 2 Hz, period = 0.5s
      // At recorded t=0.135, computed at t=0.125: sin(PI/2) = 1
      harness.assertOutputAt(results, 0.135, 'out_0', 1.0, 0.02)

      // At recorded t=0.26, computed at t=0.25: sin(PI) = 0
      harness.assertOutputAt(results, 0.26, 'out_0', 0.0, 0.02)

      // At recorded t=0.385, computed at t=0.375: sin(3*PI/2) = -1
      harness.assertOutputAt(results, 0.385, 'out_0', -1.0, 0.02)
    })
  })

  describe('Integration with Other Blocks', () => {
    it('should work with Sum block', async () => {
      const model = harness.createTestModel({
        blocks: [
          {
            type: 'source',
            name: 'Const1',
            parameters: {
              signalType: 'constant',
              dataType: 'double',
              value: 10.0
            }
          },
          {
            type: 'source',
            name: 'Const2',
            parameters: {
              signalType: 'constant',
              dataType: 'double',
              value: 5.0
            }
          },
          {
            type: 'sum',
            name: 'Sum',
            parameters: {
              signs: '++'
            }
          }
        ],
        connections: [
          { from: 'Const1', to: { block: 'Sum', port: 0 } },
          { from: 'Const2', to: { block: 'Sum', port: 1 } }
        ],
        outputs: ['Sum']
      })

      const compiled = await harness.generateAndCompile(model, 'source_sum_test')
      const results = await harness.runSimulation(compiled, {
        duration: 1.0,
        dt: 0.1
      })

      // 10 + 5 = 15
      harness.assertFinalOutput(results, 'out_0', 15.0)
    })

    it('should work with Scale block', async () => {
      const model = harness.createTestModel({
        blocks: [
          {
            type: 'source',
            name: 'RampSource',
            parameters: {
              signalType: 'ramp',
              dataType: 'double',
              startValue: 0.0,
              slope: 1.0
            }
          },
          {
            type: 'scale',
            name: 'Gain',
            parameters: {
              gain: 3.0
            }
          }
        ],
        connections: [
          { from: 'RampSource', to: 'Gain' }
        ],
        outputs: ['Gain']
      })

      const compiled = await harness.generateAndCompile(model, 'source_scale_test')
      const results = await harness.runSimulation(compiled, {
        duration: 2.0,
        dt: 0.1
      })

      // Ramp output at computed t = recorded_t - dt
      // At recorded t=1.1, computed t=1.0: ramp = 1.0, scaled = 3.0
      harness.assertOutputAt(results, 1.1, 'out_0', 3.0, 0.05)

      // At recorded t=2.0, computed t=1.9: ramp = 1.9, scaled = 5.7
      harness.assertFinalOutput(results, 'out_0', 5.7, 0.05)
    })
  })
})
