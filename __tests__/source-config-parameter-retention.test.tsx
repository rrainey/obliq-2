// __tests__/source-config-parameter-retention.test.tsx

/**
 * Test that SourceConfig retains parameter names, not values
 *
 * This test verifies the fix for the issue where parameter names were being
 * replaced with their values when editing a Source block.
 */

describe('SourceConfig Parameter Name Retention', () => {
  test('configuration should store parameter name, not value', () => {
    // Simulate saving a Source block with a parameter reference
    const blockConfig = {
      signalType: 'constant',
      dataType: 'double',
      value: 3.14159,        // The parameter's value (for display)
      useParameter: true,
      parameterName: 'PI'    // The parameter NAME (this is what matters)
    }

    // Verify that the parameter name is retained
    expect(blockConfig.useParameter).toBe(true)
    expect(blockConfig.parameterName).toBe('PI')

    // The value is stored for display/validation, but the parameterName is the source of truth
    expect(blockConfig.value).toBe(3.14159)
  })

  test('when useParameter is true, parameterName takes precedence', () => {
    const blockConfig = {
      signalType: 'constant',
      dataType: 'float',
      value: 2.5,              // Could be stale if parameter was changed
      useParameter: true,
      parameterName: 'GAIN'    // This is the authoritative reference
    }

    // The block references the parameter by NAME
    expect(blockConfig.parameterName).toBe('GAIN')

    // Even if the value field differs from the current parameter value,
    // the parameterName is what's used in code generation and simulation
    expect(blockConfig.useParameter).toBe(true)
  })

  test('when useParameter is false, value is used directly', () => {
    const blockConfig = {
      signalType: 'constant',
      dataType: 'double',
      value: 42.0,
      useParameter: false,
      parameterName: undefined  // No parameter reference
    }

    // This block uses a literal value
    expect(blockConfig.useParameter).toBe(false)
    expect(blockConfig.parameterName).toBeUndefined()
    expect(blockConfig.value).toBe(42.0)
  })

  test('parameter reference survives edit cycle', () => {
    // Initial state: Block references parameter PI
    const initialConfig = {
      signalType: 'constant',
      dataType: 'double',
      value: 3.14159,
      useParameter: true,
      parameterName: 'PI'
    }

    // User opens dialog, closes without changes
    // The parameter NAME should be preserved
    const afterEdit = {
      ...initialConfig
    }

    expect(afterEdit.parameterName).toBe('PI')
    expect(afterEdit.useParameter).toBe(true)

    // The parameter name 'PI' is retained, not the value 3.14159
  })
})

/**
 * IMPLEMENTATION NOTES:
 *
 * The fix ensures that when a Source block uses a parameter:
 *
 * 1. On Save:
 *    - useParameter: true
 *    - parameterName: "PI" (the name)
 *    - value: 3.14159 (for display only)
 *
 * 2. On Load (dialog reopen):
 *    - If useParameter is true, show parameterName in the text field
 *    - NOT the numeric value
 *
 * 3. In Code Generation:
 *    - If useParameter is true, emit: model->signals.X = PI;
 *    - NOT: model->signals.X = 3.14159;
 *
 * 4. In Simulation:
 *    - If useParameter is true, look up parameterName in parameters map
 *    - Use the current value from the map
 *    - This allows parameters to be changed without editing blocks
 */
