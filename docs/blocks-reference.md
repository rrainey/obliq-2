# Blocks Reference

## Table of Contents
- [Mathematical Operations](#mathematical-operations)
- [Dynamic Systems](#dynamic-systems)
- [Input/Output](#inputoutput)
- [Signal Display](#signal-display)
- [Lookup Tables](#lookup-tables)
- [Matrix Operations](#matrix-operations)
- [Vector Operations](#vector-operations)
- [Control Flow](#control-flow)
- [Sheet Organization](#sheet-organization)
- [Hierarchical Modeling](#hierarchical-modeling)

## Mathematical Operations

### Sum Block
**Purpose**: Adds or subtracts multiple input signals according to configured signs.

**Parameters**:
- `signs` (string): A string of '+' and '-' characters defining the operation for each input (e.g., "+-+" for add, subtract, add)
- `numInputs` (integer, 2-10): Number of input ports (automatically set based on signs length)

**Signal Compatibility**:
- Inputs: All inputs must have the same type (scalar, vector, or matrix of matching dimensions)
- Output: Same type as inputs

**Example**: A sum block with signs "+-" computes: output = input1 - input2

---

### Multiply Block
**Purpose**: Multiplies multiple input signals element-wise.

**Parameters**:
- `numInputs` (integer, 2-10): Number of input ports

**Signal Compatibility**:
- Inputs: All inputs must have the same type (scalar, vector, or matrix of matching dimensions)
- Output: Same type as inputs

**Note**: This performs element-wise multiplication, not matrix multiplication. For matrix multiplication, use the Matrix Multiply block.

---

### Scale Block
**Purpose**: Multiplies the input signal by a constant factor.

**Parameters**:
- `factor` (number): The scaling factor (default: 1.0)

**Signal Compatibility**:
- Input: Any numeric type (scalar, vector, or matrix)
- Output: Same type as input

---

### Absolute Value Block
**Purpose**: Computes the absolute value of the input signal.

**Parameters**: None

**Signal Compatibility**:
- Input: Scalar numeric only (int, long, float, double)
- Output: Same type as input

---

### Unary Minus Block
**Purpose**: Negates the input signal (changes sign).

**Parameters**: None

**Signal Compatibility**:
- Input: Any numeric type (scalar, vector, or matrix)
- Output: Same type as input

**Note**: For vectors and matrices, negation is applied element-wise.

---

### Evaluate Block
**Purpose**: Computes a custom expression using C-style arithmetic and logical operations.

**Parameters**:
- `numInputs` (integer, 1-10): Number of scalar input ports
- `expression` (string): C-style expression using in(n) to reference inputs

**Signal Compatibility**:
- Inputs: Scalar numeric values only
- Output: Always double

**Supported Operations**:
- Arithmetic: `+ - * / %`
- Comparison: `< > <= >= == !=`
- Logical: `&& || !`
- Bitwise: `& | ^ ~ << >>`
- Conditional: `? :`
- Math functions: sqrt, pow, sin, cos, tan, atan, atan2, log, exp, ceil, floor, etc.

**Example**: Expression `sqrt(pow(in(0), 2) + pow(in(1), 2))` computes the magnitude of a 2D vector.

---

### Condition Block
**Purpose**: Outputs a boolean signal based on comparing the input against a constant.

**Parameters**:
- `condition` (string): Comparison operator and value (e.g., "> 10.0", "<= -5")

**Signal Compatibility**:
- Input: Scalar numeric only
- Output: bool

**Supported Operators**: `> < >= <= == !=`

**Example**: Condition "> 0" outputs true when input is positive.

---

## Dynamic Systems

### Transfer Function Block
**Purpose**: Implements a Laplace domain transfer function H(s) using Runge-Kutta 4th order integration.

**Parameters**:
- `numerator` (array): Polynomial coefficients from highest to lowest power
- `denominator` (array): Polynomial coefficients from highest to lowest power

**Signal Compatibility**:
- Input: Any numeric type (scalar, vector, or matrix)
- Output: Same type as input

**Notes**: 
- For vector/matrix inputs, the transfer function is applied independently to each element
- The leading coefficient of the denominator cannot be zero
- State variables are maintained separately for each element

**Example**: H(s) = (s + 2)/(s² + 3s + 1) has numerator [1, 2] and denominator [1, 3, 1]

---

## Input/Output

### Input Port Block
**Purpose**: Defines an external input to the model or subsystem.

**Parameters**:
- `signalName` (string): Name of the input signal (must be valid C identifier)
- `dataType` (string): C-style type (e.g., "double", "float[3]", "double[2][3]")

**Signal Compatibility**:
- Output: Type specified by dataType parameter

---

### Output Port Block
**Purpose**: Defines an external output from the model or subsystem.

**Parameters**:
- `signalName` (string): Name of the output signal (must be valid C identifier)

**Signal Compatibility**:
- Input: Any type (type is preserved in generated code)

---

### Source Block
**Purpose**: Generates a constant value or signal.

**Parameters**:
- `value` (string): C-style constant expression
- `dataType` (string): Explicit type specification

**Signal Compatibility**:
- Output: Type determined by value/dataType

**Examples**:
- Scalar: "3.14", "true", "42"
- Vector: "[1.0, 0.0, 0.0]"
- Matrix: "[[1.0, 0.0], [0.0, 1.0]]"

---

## Signal Display

### Signal Display Block
**Purpose**: Graphically displays signal values during simulation.

**Parameters**:
- `maxSamples` (integer, 1-10000): Maximum number of samples to store (default: 1000)

**Signal Compatibility**:
- Input: Scalar or vector signals only (not matrices)
- No output

**Note**: Display blocks are ignored during C code generation.

---

### Signal Logger Block
**Purpose**: Records signal values with timestamps for later analysis.

**Parameters**: None

**Signal Compatibility**:
- Input: Scalar or vector signals only (not matrices)
- No output

**Features**: Logged data can be exported as CSV after simulation.

---

## Lookup Tables

### 1-D Lookup Block
**Purpose**: Interpolates output values based on a one-dimensional input using linear interpolation.

**Parameters**:
- `inputValues` (array): Input breakpoints (must be sorted ascending)
- `outputValues` (array): Corresponding output values
- `extrapolation` (string): "clamp" or "extrapolate"

**Signal Compatibility**:
- Input: Scalar numeric only
- Output: Same type as input

**Example**: Input values [0, 1, 2] with output values [0, 2, 8] creates a quadratic-like response.

---

### 2-D Lookup Block
**Purpose**: Interpolates output values based on two inputs using bilinear interpolation.

**Parameters**:
- `input1Values` (array): First input breakpoints
- `input2Values` (array): Second input breakpoints
- `outputTable` (2D array): Output values at each breakpoint combination
- `extrapolation` (string): "clamp" or "extrapolate"

**Signal Compatibility**:
- Inputs: Two scalar numeric values
- Output: Same type as inputs

---

## Matrix Operations

### Matrix Multiply Block
**Purpose**: Performs matrix multiplication following linear algebra rules.

**Parameters**: None

**Signal Compatibility**:
- Inputs: Compatible combinations:
  - Scalar × Scalar → Scalar
  - Scalar × Matrix → Matrix (element-wise)
  - Vector[n] × Matrix[n×m] → Vector[m]
  - Matrix[m×n] × Vector[n] → Vector[m]
  - Matrix[m×n] × Matrix[n×p] → Matrix[m×p]
- Output: Dimensions determined by multiplication rules

**Note**: Inner dimensions must match for matrix multiplication.

---

### Transpose Block
**Purpose**: Transposes a matrix or converts vectors to/from column matrices.

**Parameters**: None

**Signal Compatibility**:
- Input: Vector or matrix (scalars pass through unchanged)
- Output: 
  - Vector[n] → Matrix[n][1]
  - Matrix[m][n] → Matrix[n][m]

---

### Mux Block
**Purpose**: Combines multiple scalar inputs into a vector or matrix.

**Parameters**:
- `rows` (integer, 1-100): Number of rows in output
- `cols` (integer, 1-100): Number of columns in output
- `baseType` (string): Base type (double, float, int, long)

**Signal Compatibility**:
- Inputs: rows × cols scalar inputs of the same base type
- Output: Matrix[rows][cols] or Vector[size] based on configuration

**Note**: Inputs are arranged in row-major order.

---

### Demux Block
**Purpose**: Splits a vector or matrix into individual scalar outputs.

**Parameters**: Automatically determined from input

**Signal Compatibility**:
- Input: Vector or matrix
- Outputs: Individual scalar elements in row-major order

**Port Labels**: Outputs are labeled by position (e.g., "row1_col2" for matrices)

---

## Vector Operations

### Cross Product Block
**Purpose**: Computes the cross product of two vectors.

**Parameters**: None

**Signal Compatibility**:
- Inputs: Two vectors of dimension 2 or 3 (must match)
- Output: Vector of same dimension

**Note**: For 2D vectors, treats them as 3D with z=0.

---

### Dot Product Block
**Purpose**: Computes the dot (inner) product of two vectors.

**Parameters**: None

**Signal Compatibility**:
- Inputs: Two vectors of the same dimension
- Output: Scalar (sum of element-wise products)

---

### Magnitude Block
**Purpose**: Computes the Euclidean magnitude (length) of a vector.

**Parameters**: None

**Signal Compatibility**:
- Input: Vector of any dimension
- Output: Scalar double (√(Σx²))

---

## Control Flow

### If Block
**Purpose**: Selects between two inputs based on a control signal.

**Parameters**: None

**Signal Compatibility**:
- Input 1 (input1): Any type
- Input 2 (control): Scalar (boolean or numeric, where 0 is false)
- Input 3 (input2): Must match type of input1
- Output: Same type as input1/input2

**Behavior**: Output = control ? input2 : input1

---

### Trig Block
**Purpose**: Computes trigonometric functions.

**Parameters**:
- `function` (string): One of: sin, cos, tan, asin, acos, atan, atan2, sincos

**Signal Compatibility**:
- Inputs: 
  - Single input for most functions (scalar double, angles in radians)
  - Two inputs for atan2(y, x)
- Outputs:
  - Single output for most functions
  - Two outputs for sincos (sin and cos values)

---

## Sheet Organization

### Sheet Label Sink
**Purpose**: Captures a signal and makes it available by name within the same subsystem scope.

**Parameters**:
- `signalName` (string): Unique name for the signal within the subsystem

**Signal Compatibility**:
- Input: Any type
- No output

---

### Sheet Label Source
**Purpose**: Outputs a signal captured by a Sheet Label Sink with matching name.

**Parameters**:
- `signalName` (string): Name of the sink to connect to

**Signal Compatibility**:
- Output: Same type as the connected sink's input

**Note**: Source and sink pairs must be within the same subsystem scope.

---

## Hierarchical Modeling

### Subsystem Block
**Purpose**: Encapsulates a model sheet as a reusable block.

**Parameters**:
- `linkedSheetId` (string): ID of the sheet containing the subsystem
- `inputPorts` (array): Names of input port blocks in the subsystem
- `outputPorts` (array): Names of output port blocks in the subsystem
- `showEnableInput` (boolean): Shows an enable input port

**Signal Compatibility**:
- Inputs: Determined by Input Port blocks within the subsystem
- Outputs: Determined by Output Port blocks within the subsystem
- Enable input (optional): Boolean signal

**Enable Behavior**: When disabled (enable=false), the subsystem freezes all internal states and outputs hold their last values.

---

## Type System Notes

### Supported Base Types
- `bool`: Boolean values (true/false, 0/1 in C)
- `int`: Integer values
- `long`: Long integer values
- `float`: Single-precision floating point
- `double`: Double-precision floating point (default for most blocks)

### Array/Matrix Syntax
- Vector: `type[size]` (e.g., `double[3]`)
- Matrix: `type[rows][cols]` (e.g., `float[2][3]`)

### Type Propagation Rules
1. Source blocks and input ports define explicit types
2. Most math blocks preserve input types
3. Type mismatches are detected during model validation
4. Vectors and matrices must have matching dimensions for element-wise operations

### Signal Compatibility Guidelines
- **Scalar-only blocks**: Lookup tables, condition, absolute value
- **Element-wise blocks**: Sum, multiply, scale, unary minus (require matching dimensions)
- **Matrix-aware blocks**: Matrix multiply, transpose, mux, demux
- **Type-preserving blocks**: Most blocks output the same type as their input
- **Type-converting blocks**: Evaluate (always outputs double), Condition (always outputs bool)