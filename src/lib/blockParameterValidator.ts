// lib/blockParameterValidator.ts

import { BlockType, BlockTypes, getBlockType } from './blockTypeRegistry';
import { isValidType, getTypeValidationError } from './typeValidator';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  sanitizedParameters?: Record<string, any>;
}

/**
 * Validate and sanitize block parameters based on block type
 */
export function validateBlockParameters(
  blockType: BlockType,
  parameters: Record<string, any>
): ValidationResult {
  const errors: string[] = [];
  const sanitized: Record<string, any> = {};
  
  const blockDef = getBlockType(blockType);
  if (!blockDef) {
    return { valid: false, errors: [`Unknown block type: ${blockType}`] };
  }
  
  // Start with default parameters
  const defaults = blockDef.defaultParameters;
  
  switch (blockType) {
    case BlockTypes.SOURCE:
      // Validate value (C-style constant expression)
      if (parameters.value !== undefined) {
        sanitized.value = String(parameters.value);
      } else {
        sanitized.value = defaults.value;
      }
      
      // Validate dataType
      if (parameters.dataType !== undefined) {
        if (!isValidType(parameters.dataType)) {
          errors.push(`Invalid dataType: ${getTypeValidationError(parameters.dataType)}`);
        } else {
          sanitized.dataType = parameters.dataType;
        }
      } else {
        sanitized.dataType = defaults.dataType;
      }
      break;
      
    case BlockTypes.INPUT_PORT:
      // Validate signalName (C-style identifier)
      if (parameters.signalName !== undefined) {
        if (!isValidIdentifier(parameters.signalName)) {
          errors.push('signalName must be a valid C-style identifier');
        } else {
          sanitized.signalName = parameters.signalName;
        }
      } else {
        sanitized.signalName = defaults.signalName;
      }
      
      // Validate dataType
      if (parameters.dataType !== undefined) {
        if (!isValidType(parameters.dataType)) {
          errors.push(`Invalid dataType: ${getTypeValidationError(parameters.dataType)}`);
        } else {
          sanitized.dataType = parameters.dataType;
        }
      } else {
        sanitized.dataType = defaults.dataType;
      }
      break;
      
    case BlockTypes.SUM:
      // Validate signs parameter (new)
      if (parameters.signs !== undefined) {
        if (typeof parameters.signs !== 'string') {
          errors.push('signs must be a string');
        } else if (!/^[+-]+$/.test(parameters.signs)) {
          errors.push('signs must contain only + and - characters');
        } else if (parameters.signs.length < 2) {
          errors.push('signs must have at least 2 characters');
        } else if (parameters.signs.length > 10) {
          errors.push('signs must have at most 10 characters');
        } else {
          sanitized.signs = parameters.signs;
          // Override numInputs based on signs length
          sanitized.numInputs = parameters.signs.length;
        }
      } else if (parameters.numInputs !== undefined) {
        // Original numInputs validation (only if signs not provided)
        const num = Number(parameters.numInputs);
        if (!Number.isInteger(num) || num < 2 || num > 10) {
          errors.push('numInputs must be an integer between 2 and 10');
        } else {
          sanitized.numInputs = num;
          // Generate default signs (all positive)
          sanitized.signs = '+'.repeat(num);
        }
      } else {
        // Use defaults
        sanitized.numInputs = defaults.numInputs;
        sanitized.signs = defaults.signs || '++';
      }
      break;

    case BlockTypes.MULTIPLY:
      // Validate numInputs
      if (parameters.numInputs !== undefined) {
        const num = Number(parameters.numInputs);
        if (!Number.isInteger(num) || num < 2 || num > 10) {
          errors.push('numInputs must be an integer between 2 and 10');
        } else {
          sanitized.numInputs = num;
        }
      } else {
        sanitized.numInputs = defaults.numInputs;
      }
      break;
      
    case BlockTypes.SCALE:
      // Validate factor
      if (parameters.factor !== undefined) {
        const factor = Number(parameters.factor);
        if (isNaN(factor)) {
          errors.push('factor must be a number');
        } else {
          sanitized.factor = factor;
        }
      } else {
        sanitized.factor = defaults.factor;
      }
      break;
      
    case BlockTypes.TRANSFER_FUNCTION:
      // Validate numerator array
      if (parameters.numerator !== undefined) {
        if (!Array.isArray(parameters.numerator) || parameters.numerator.length == 0) {
          errors.push('numerator must be a non-empty array of numbers');
        } else if (!parameters.numerator.every((n: any) => typeof n === 'number')) {
          errors.push('numerator must contain only numbers');
        } else {
          sanitized.numerator = parameters.numerator;
        }
      } else {
        errors.push('a numerator coefficient array must be defined');
      }
      
      // Validate denominator array
      if (parameters.denominator !== undefined) {
        if (!Array.isArray(parameters.denominator) || parameters.denominator.length == 0) {
          errors.push('denominator must be a non-empty array of numbers');
        } else if (!parameters.denominator.every((n: any) => typeof n === 'number')) {
          errors.push('denominator must contain only numbers');
        } else if (parameters.denominator[0] === 0) {
          errors.push('denominator leading coefficient cannot be zero');
        } else {
          sanitized.denominator = parameters.denominator;
        }
      } else {
        errors.push('a denominator coefficient array must be defined');
      }
      break;

    case BlockTypes.TRIG:
      if (parameters.function !== undefined) {
        if (typeof parameters.function !== 'string') {
          errors.push('function parameter must be a string');
        } else if (!['sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'sincos', 'atan2'].includes(parameters.function)) {
          errors.push('function must be one of: sin, cos, tan, asin, acos, atan, sincos, atan2');
        } else {
          sanitized.function = parameters.function;
        }
      } else {
        sanitized.function = defaults.function || 'sin';  
      }
      break;
      
    case BlockTypes.LOOKUP_1D:
      // Validate inputValues array
      if (parameters.inputValues !== undefined) {
        if (!Array.isArray(parameters.inputValues) || parameters.inputValues.length < 2) {
          errors.push('inputValues must be an array with at least 2 numbers');
        } else if (!parameters.inputValues.every((n: any) => typeof n === 'number')) {
          errors.push('inputValues must contain only numbers');
        } else if (!isSorted(parameters.inputValues)) {
          errors.push('inputValues must be sorted from smallest to largest');
        } else {
          sanitized.inputValues = parameters.inputValues;
        }
      } else {
        sanitized.inputValues = defaults.inputValues;
      }
      
      // Validate outputValues array
      if (parameters.outputValues !== undefined) {
        if (!Array.isArray(parameters.outputValues)) {
          errors.push('outputValues must be an array of numbers');
        } else if (parameters.inputValues && parameters.outputValues.length !== parameters.inputValues.length) {
          errors.push('outputValues must have the same length as inputValues');
        } else if (!parameters.outputValues.every((n: any) => typeof n === 'number')) {
          errors.push('outputValues must contain only numbers');
        } else {
          sanitized.outputValues = parameters.outputValues;
        }
      } else {
        sanitized.outputValues = defaults.outputValues;
      }
      
      // Validate extrapolation
      if (parameters.extrapolation !== undefined) {
        if (parameters.extrapolation !== 'clamp' && parameters.extrapolation !== 'extrapolate') {
          errors.push('extrapolation must be "clamp" or "extrapolate"');
        } else {
          sanitized.extrapolation = parameters.extrapolation;
        }
      } else {
        sanitized.extrapolation = defaults.extrapolation;
      }
      break;
      
    case BlockTypes.LOOKUP_2D:
      // Validate input1Values array
      if (parameters.input1Values !== undefined) {
        if (!Array.isArray(parameters.input1Values) || parameters.input1Values.length < 2) {
          errors.push('input1Values must be an array with at least 2 numbers');
        } else if (!parameters.input1Values.every((n: any) => typeof n === 'number')) {
          errors.push('input1Values must contain only numbers');
        } else if (!isSorted(parameters.input1Values)) {
          errors.push('input1Values must be sorted from smallest to largest');
        } else {
          sanitized.input1Values = parameters.input1Values;
        }
      } else {
        sanitized.input1Values = defaults.input1Values;
      }
      
      // Validate input2Values array
      if (parameters.input2Values !== undefined) {
        if (!Array.isArray(parameters.input2Values) || parameters.input2Values.length < 2) {
          errors.push('input2Values must be an array with at least 2 numbers');
        } else if (!parameters.input2Values.every((n: any) => typeof n === 'number')) {
          errors.push('input2Values must contain only numbers');
        } else if (!isSorted(parameters.input2Values)) {
          errors.push('input2Values must be sorted from smallest to largest');
        } else {
          sanitized.input2Values = parameters.input2Values;
        }
      } else {
        sanitized.input2Values = defaults.input2Values;
      }
      
      // Validate outputTable 2D array
      if (parameters.outputTable !== undefined) {
        const expectedRows = sanitized.input2Values?.length || defaults.input2Values.length;
        const expectedCols = sanitized.input1Values?.length || defaults.input1Values.length;
        
        if (!Array.isArray(parameters.outputTable)) {
          errors.push('outputTable must be a 2D array of numbers');
        } else if (parameters.outputTable.length !== expectedRows) {
          errors.push(`outputTable must have ${expectedRows} rows (matching input2Values length)`);
        } else {
          let validTable = true;
          for (let i = 0; i < parameters.outputTable.length; i++) {
            if (!Array.isArray(parameters.outputTable[i])) {
              errors.push(`outputTable row ${i} must be an array`);
              validTable = false;
              break;
            } else if (parameters.outputTable[i].length !== expectedCols) {
              errors.push(`outputTable row ${i} must have ${expectedCols} columns (matching input1Values length)`);
              validTable = false;
              break;
            } else if (!parameters.outputTable[i].every((n: any) => typeof n === 'number')) {
              errors.push(`outputTable row ${i} must contain only numbers`);
              validTable = false;
              break;
            }
          }
          if (validTable) {
            sanitized.outputTable = parameters.outputTable;
          }
        }
      } else {
        sanitized.outputTable = defaults.outputTable;
      }
      
      // Validate extrapolation
      if (parameters.extrapolation !== undefined) {
        if (parameters.extrapolation !== 'clamp' && parameters.extrapolation !== 'extrapolate') {
          errors.push('extrapolation must be "clamp" or "extrapolate"');
        } else {
          sanitized.extrapolation = parameters.extrapolation;
        }
      } else {
        sanitized.extrapolation = defaults.extrapolation;
      }
      break;
      
    case BlockTypes.OUTPUT_PORT:
      // Validate signalName
      if (parameters.signalName !== undefined) {
        if (!isValidIdentifier(parameters.signalName)) {
          errors.push('signalName must be a valid C-style identifier');
        } else {
          sanitized.signalName = parameters.signalName;
        }
      } else {
        sanitized.signalName = defaults.signalName;
      }
      break;
      
    case BlockTypes.SIGNAL_DISPLAY:
      // Validate maxSamples
      if (parameters.maxSamples !== undefined) {
        const samples = Number(parameters.maxSamples);
        if (!Number.isInteger(samples) || samples < 1 || samples > 10000) {
          errors.push('maxSamples must be an integer between 1 and 10000');
        } else {
          sanitized.maxSamples = samples;
        }
      } else {
        sanitized.maxSamples = defaults.maxSamples;
      }
      break;
      
    case BlockTypes.SIGNAL_LOGGER:
      // No parameters to validate
      break;
      
    case BlockTypes.SHEET_LABEL_SINK:
    case BlockTypes.SHEET_LABEL_SOURCE:
      // Validate signalName
      if (parameters.signalName !== undefined) {
        if (typeof parameters.signalName !== 'string') {
          errors.push('signalName must be a string');
        } else {
          sanitized.signalName = parameters.signalName;
        }
      } else {
        sanitized.signalName = defaults.signalName;
      }
      break;

    case BlockTypes.MATRIX_MULTIPLY:
      // Matrix multiply has no configurable parameters
      // Type checking is done at connection time
      break;

    case BlockTypes.MUX:
      // Validate rows
      if (parameters.rows !== undefined) {
        const rows = Number(parameters.rows);
        if (!Number.isInteger(rows) || rows < 1 || rows > 100) {
          errors.push('rows must be an integer between 1 and 100');
        } else {
          sanitized.rows = rows;
        }
      } else {
        sanitized.rows = defaults.rows;
      }
      
      // Validate cols
      if (parameters.cols !== undefined) {
        const cols = Number(parameters.cols);
        if (!Number.isInteger(cols) || cols < 1 || cols > 100) {
          errors.push('cols must be an integer between 1 and 100');
        } else {
          sanitized.cols = cols;
        }
      } else {
        sanitized.cols = defaults.cols;
      }
      
      // Validate baseType
      if (parameters.baseType !== undefined) {
        if (!['double', 'float', 'int', 'long'].includes(parameters.baseType)) {
          errors.push('baseType must be double, float, int, or long');
        } else {
          sanitized.baseType = parameters.baseType;
        }
      } else {
        sanitized.baseType = defaults.baseType;
      }
      
      // Generate outputType based on rows, cols, and baseType
      if (sanitized.rows && sanitized.cols && sanitized.baseType) {
        sanitized.outputType = `${sanitized.baseType}[${sanitized.rows}][${sanitized.cols}]`;
      }
      break;

    case BlockTypes.DEMUX:
      // outputCount is dynamically determined based on input
      // but we can validate if it's manually set
      if (parameters.outputCount !== undefined) {
        const count = Number(parameters.outputCount);
        if (!Number.isInteger(count) || count < 1 || count > 1000) {
          errors.push('outputCount must be an integer between 1 and 1000');
        } else {
          sanitized.outputCount = count;
        }
      } else {
        sanitized.outputCount = defaults.outputCount;
      }
      break;
      
    case BlockTypes.SUBSYSTEM:
      // Validate sheets array - subsystems must have embedded sheets
      if (parameters.sheets !== undefined) {
        if (!Array.isArray(parameters.sheets)) {
          errors.push('sheets must be an array');
        } else if (parameters.sheets.length === 0) {
          errors.push('subsystem must have at least one sheet');
        } else {
          sanitized.sheets = parameters.sheets;
        }
      } else {
        errors.push('subsystem must have a sheets array');
      }

      // Validate inputPorts array
      if (parameters.inputPorts !== undefined) {
        if (!Array.isArray(parameters.inputPorts)) {
          errors.push('inputPorts must be an array of strings');
        } else if (!parameters.inputPorts.every((p: unknown) => typeof p === 'string')) {
          errors.push('inputPorts must contain only strings');
        } else {
          sanitized.inputPorts = parameters.inputPorts;
        }
      } else {
        sanitized.inputPorts = defaults.inputPorts;
      }

      // Validate outputPorts array
      if (parameters.outputPorts !== undefined) {
        if (!Array.isArray(parameters.outputPorts)) {
          errors.push('outputPorts must be an array of strings');
        } else if (!parameters.outputPorts.every((p: unknown) => typeof p === 'string')) {
          errors.push('outputPorts must contain only strings');
        } else {
          sanitized.outputPorts = parameters.outputPorts;
        }
      } else {
        sanitized.outputPorts = defaults.outputPorts;
      }

      // Validate showEnableInput (optional)
      if (parameters.showEnableInput !== undefined) {
        if (typeof parameters.showEnableInput !== 'boolean') {
          errors.push('showEnableInput must be a boolean');
        } else {
          sanitized.showEnableInput = parameters.showEnableInput;
        }
      }

      // Validate codeGenStrategy
      const validStrategies = ['flatten', 'segregated', 'segregated_atomic'];
      if (parameters.codeGenStrategy !== undefined) {
        if (typeof parameters.codeGenStrategy !== 'string') {
          errors.push('codeGenStrategy must be a string');
        } else if (!validStrategies.includes(parameters.codeGenStrategy)) {
          errors.push(`codeGenStrategy must be one of: ${validStrategies.join(', ')}`);
        } else {
          sanitized.codeGenStrategy = parameters.codeGenStrategy;
        }
      } else if (parameters.segregated !== undefined) {
        // Handle legacy 'segregated: true/false' parameter - convert to codeGenStrategy
        if (parameters.segregated === true) {
          sanitized.codeGenStrategy = 'segregated';
        } else {
          sanitized.codeGenStrategy = 'flatten';
        }
        // Warn about deprecated parameter (not an error, just normalize it)
      } else {
        sanitized.codeGenStrategy = defaults.codeGenStrategy || 'flatten';
      }
      break;

    case BlockTypes.CONDITION:
      // Validate condition parameter
      if (parameters.condition !== undefined) {
        if (typeof parameters.condition !== 'string') {
          errors.push('condition must be a string');
        } else {
          // Validate condition format
          const operatorMatch = parameters.condition.match(/^\s*(>|<|>=|<=|==|!=)\s*(.+)$/)
          if (!operatorMatch) {
            errors.push('condition must be in format: operator value (e.g., "> 10.0")');
          } else {
            const value = operatorMatch[2].trim();
            const valuePattern = /^-?\d+(\.\d+)?([eE][+-]?\d+)?[fFlL]?$/;
            if (!valuePattern.test(value)) {
              errors.push('condition value must be a valid numeric constant');
            } else {
              sanitized.condition = parameters.condition;
            }
          }
        }
      } else {
        sanitized.condition = defaults.condition;
      }
      break;

    case BlockTypes.TRANSPOSE:
      // Transpose block has no configurable parameters
      break;

    case BlockTypes.CROSS:
    case BlockTypes.DOT:
    case BlockTypes.MAG:
    case BlockTypes.ABS:
    case BlockTypes.UMINUS:
      // These blocks have no configurable parameters
    case BlockTypes.IF:
      // type validation performed at connection time
      break;

    case BlockTypes.EVALUATE:
      // Validate numInputs
      if (parameters.numInputs !== undefined) {
        const num = Number(parameters.numInputs);
        if (!Number.isInteger(num) || num < 1 || num > 10) {
          errors.push('numInputs must be an integer between 1 and 10');
        } else {
          sanitized.numInputs = num;
        }
      } else {
        sanitized.numInputs = defaults.numInputs;
      }

      // Validate expression
      if (parameters.expression !== undefined) {
        if (typeof parameters.expression !== 'string') {
          errors.push('expression must be a string');
        } else if (parameters.expression.trim().length === 0) {
          errors.push('expression cannot be empty');
        } else {
          sanitized.expression = parameters.expression;
        }
      } else {
        sanitized.expression = defaults.expression;
      }
      break;

    case BlockTypes.LIMIT:
      // Validate lowerLimit
      if (parameters.lowerLimit !== undefined) {
        const lower = Number(parameters.lowerLimit);
        if (isNaN(lower)) {
          errors.push('lowerLimit must be a number');
        } else {
          sanitized.lowerLimit = lower;
        }
      } else {
        sanitized.lowerLimit = defaults.lowerLimit;
      }

      // Validate upperLimit
      if (parameters.upperLimit !== undefined) {
        const upper = Number(parameters.upperLimit);
        if (isNaN(upper)) {
          errors.push('upperLimit must be a number');
        } else {
          sanitized.upperLimit = upper;
        }
      } else {
        sanitized.upperLimit = defaults.upperLimit;
      }

      // Validate that lowerLimit <= upperLimit
      if (sanitized.lowerLimit !== undefined && sanitized.upperLimit !== undefined) {
        if (sanitized.lowerLimit > sanitized.upperLimit) {
          errors.push('lowerLimit must be less than or equal to upperLimit');
        }
      }
      break;

    case BlockTypes.INTEGRATOR:
      // Validate initialValue
      if (parameters.initialValue !== undefined) {
        const init = Number(parameters.initialValue);
        if (isNaN(init)) {
          errors.push('initialValue must be a number');
        } else {
          sanitized.initialValue = init;
        }
      } else {
        sanitized.initialValue = defaults.initialValue;
      }

      // Validate showEnableInput
      if (parameters.showEnableInput !== undefined) {
        if (typeof parameters.showEnableInput !== 'boolean') {
          errors.push('showEnableInput must be a boolean');
        } else {
          sanitized.showEnableInput = parameters.showEnableInput;
        }
      } else {
        sanitized.showEnableInput = defaults.showEnableInput;
      }

      // Validate showResetInput
      if (parameters.showResetInput !== undefined) {
        if (typeof parameters.showResetInput !== 'boolean') {
          errors.push('showResetInput must be a boolean');
        } else {
          sanitized.showResetInput = parameters.showResetInput;
        }
      } else {
        sanitized.showResetInput = defaults.showResetInput;
      }

      // Validate useLimits
      if (parameters.useLimits !== undefined) {
        if (typeof parameters.useLimits !== 'boolean') {
          errors.push('useLimits must be a boolean');
        } else {
          sanitized.useLimits = parameters.useLimits;
        }
      } else {
        sanitized.useLimits = defaults.useLimits;
      }

      // Validate upperLimit
      if (parameters.upperLimit !== undefined) {
        const upper = Number(parameters.upperLimit);
        if (isNaN(upper)) {
          errors.push('upperLimit must be a number');
        } else {
          sanitized.upperLimit = upper;
        }
      } else {
        sanitized.upperLimit = defaults.upperLimit;
      }

      // Validate lowerLimit
      if (parameters.lowerLimit !== undefined) {
        const lower = Number(parameters.lowerLimit);
        if (isNaN(lower)) {
          errors.push('lowerLimit must be a number');
        } else {
          sanitized.lowerLimit = lower;
        }
      } else {
        sanitized.lowerLimit = defaults.lowerLimit;
      }

      // Validate that lowerLimit <= upperLimit when useLimits is true
      if (sanitized.useLimits && sanitized.lowerLimit !== undefined && sanitized.upperLimit !== undefined) {
        if (sanitized.lowerLimit > sanitized.upperLimit) {
          errors.push('lowerLimit must be less than or equal to upperLimit');
        }
      }
      break;

    case BlockTypes.ORIENTATION_CONVERSION:
      // Validate conversionType
      const validConversionTypes = [
        'euler_to_dcm',
        'euler_to_quaternion',
        'dcm_to_euler',
        'dcm_to_quaternion',
        'quaternion_to_dcm',
        'quaternion_to_euler',
        'body_to_quaternion_rates'
      ];
      if (parameters.conversionType !== undefined) {
        if (typeof parameters.conversionType !== 'string') {
          errors.push('conversionType must be a string');
        } else if (!validConversionTypes.includes(parameters.conversionType)) {
          errors.push(`conversionType must be one of: ${validConversionTypes.join(', ')}`);
        } else {
          sanitized.conversionType = parameters.conversionType;
        }
      } else {
        sanitized.conversionType = defaults.conversionType;
      }
      break;

    case BlockTypes.COMMENT:
      // Validate text
      if (parameters.text !== undefined) {
        if (typeof parameters.text !== 'string') {
          errors.push('text must be a string');
        } else {
          sanitized.text = parameters.text;
        }
      } else {
        sanitized.text = defaults.text;
      }

      // Validate width
      if (parameters.width !== undefined) {
        const width = Number(parameters.width);
        if (isNaN(width) || width < 100 || width > 800) {
          errors.push('width must be a number between 100 and 800');
        } else {
          sanitized.width = width;
        }
      } else {
        sanitized.width = defaults.width;
      }

      // Validate height
      if (parameters.height !== undefined) {
        const height = Number(parameters.height);
        if (isNaN(height) || height < 50 || height > 600) {
          errors.push('height must be a number between 50 and 600');
        } else {
          sanitized.height = height;
        }
      } else {
        sanitized.height = defaults.height;
      }

      // Validate backgroundColor
      if (parameters.backgroundColor !== undefined) {
        if (typeof parameters.backgroundColor !== 'string') {
          errors.push('backgroundColor must be a string');
        } else {
          sanitized.backgroundColor = parameters.backgroundColor;
        }
      } else {
        sanitized.backgroundColor = defaults.backgroundColor;
      }

      // Validate borderColor
      if (parameters.borderColor !== undefined) {
        if (typeof parameters.borderColor !== 'string') {
          errors.push('borderColor must be a string');
        } else {
          sanitized.borderColor = parameters.borderColor;
        }
      } else {
        sanitized.borderColor = defaults.borderColor;
      }
      break;

    default:
      errors.push(`No validation rules defined for block type: ${blockType}`);
  }
  
  return {
    valid: errors.length === 0,
    errors,
    sanitizedParameters: errors.length === 0 ? sanitized : undefined
  };
}

/**
 * Validate C-style identifier
 */
function isValidIdentifier(name: string): boolean {
  if (typeof name !== 'string' || name.length === 0) return false;
  return /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name);
}

/**
 * Check if array values are sorted (non-decreasing order)
 */
function isSorted(arr: number[]): boolean {
  for (let i = 1; i < arr.length; i++) {
    if (arr[i] < arr[i - 1]) {
      return false;
    }
  }
  return true;
}