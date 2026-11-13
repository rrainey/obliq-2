# Blocks Reference

## Table of Contents
- [Mathematical Operations](#mathematical-operations)
- [Discontinuities](#discontinuities)
  - Saturation Dynamic, Relay, Rate Limiter, Quantizer, Edge Detect
- [Dynamic Systems](#dynamic-systems)
  - Transfer Function, Integrator, Unit Delay, Derivative, Variable Transport Delay
- [Input/Output](#inputoutput)
- [Signal Display](#signal-display)
- [Lookup Tables](#lookup-tables)
- [Matrix Operations](#matrix-operations)
- [Vector Operations](#vector-operations)
- [Control Flow](#control-flow)
- [Sheet Organization](#sheet-organization)
- [Hierarchical Modeling](#hierarchical-modeling)
  - Subsystem, Model Reference, For Iterator Subsystem, Iteration Index

## Parameters of All Blocks

- `flipped` (optional, boolean): When it is `true`, the editor draws the block mirrored. The inputs are on the right edge and the outputs are on the left edge. The y of each port does not change. Enable and reset ports stay at the top and the bottom. The text and the icon of the block do not change. Comment blocks do not have this parameter. It has no effect on simulation or code generation. To set it on the canvas, right-click the block and choose **Flip Block**. The layout sets it on the return row of a control loop (see [Diagram Layout](../README.md#diagram-layout)).

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

### Divide Block
**Purpose**: Element-wise division of two inputs (`num / den`).

**Parameters**: None

**Ports**:
- `num` (port 0): Numerator
- `den` (port 1): Denominator

**Signal Compatibility**:
- Same shape T / T → T
- Vector or matrix / scalar → numerator shape (scalar denominator broadcast)
- Scalar / vector or matrix → **invalid**
- Output: Same base type as numerator

**Notes**:
- IEEE division-by-zero behavior (no trap / saturation in v1)
- Direct feedthrough

**Example**: Gravity-style `mu * r_vec / r_mag` uses multiply + divide with scalar denominator.

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

### Sign Block
**Purpose**: Signum function (element-wise).

**Parameters**: None

**Semantics**:
- `y = 1` if `u > 0`
- `y = -1` if `u < 0`
- `y = 0` if `u == 0`

**Signal Compatibility**:
- Input: Any numeric type (scalar, vector, or matrix)
- Output: Same type as input

---

### Notch Filter Block

**Type**: `notch_filter`

A second-order notch. Its centre frequency and depth can change on every sample, so another signal can drive it. It uses a state-variable form, which stays valid when the frequency moves.

**Parameters**:
- `q` (default 5): centre frequency divided by the bandwidth
- `sampleTime` (seconds, default 0): 0 uses the enclosing sample scope, or the model step

**Ports**:
- Input 0, `signal`: `double` or `double[N]`, filtered element by element
- Input 1, `center_Hz`: limited to 1 Hz … 0.48/Ts
- Input 2, `weight`: limited to 0 … 1. Weight 1 gives the full notch. Weight 0 passes the signal, and the states keep running
- Output: the same type as `signal`

**Semantics**: with g = tan(π·f·Ts) and k = 1/Q, the block is the bilinear transform of (s² + ω²) / (s² + (ω/Q)·s + ω²) at weight 1.

### Spectrum Peaks Block

**Type**: `spectrum_peaks`

Tracks the strongest frequencies in a signal, to drive Notch Filter blocks. It re-implements the behaviour of the analysis in Betaflight's dynamic notch.

**Parameters**:
- `count` (default 3): number of peaks
- `windowSize` (default 72): samples in the sliding DFT, an even number
- `minHz`, `maxHz` (defaults 100, 600): search range
- `updateEvery` (default 12): input samples between peak searches
- `sampleTime` (seconds, default 0): 0 uses the enclosing sample scope, or the model step

**Ports**: input 0 is `double`. The output is `double[count]`, in Hz, in frequency order.

**Semantics**:
1. Average floor(fs / (2·maxHz)) samples, at least one. Push the result through a sliding DFT, damped by r = 0.9999.
2. At each search, apply a Hann window in the frequency domain, take the power of each bin, and keep the `count` highest local maxima.
3. Calculate the noise floor without the peaks. The threshold is twice the floor.
4. Each peak above the threshold moves its output. Parabolic interpolation gives its frequency, and a PT1 follows it. The cutoff is 4 Hz × (power / threshold), limited to 4–40 Hz.

Outputs start evenly spaced across the search range, and stay in place while no peak is above the threshold.

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

## Discontinuities

### Saturation Dynamic Block

**Type**: `saturation_dynamic`

**Purpose**: Keeps the input `u` between a lower limit and an upper limit. Two input signals supply the limits, thus the limits can change during the simulation. For limits that do not change, use the Limit block.

**Parameters**: None. The block has no configuration dialog. A double-click on the block does not open a dialog, the same as for the other blocks without parameters.

**Ports** (in this order, the same order as the Simulink Saturation Dynamic block):
- `up` (input port 0): Upper limit
- `u` (input port 1): Input signal
- `lo` (input port 2): Lower limit
- `y` (output port 0): Limited signal

The block shows the names `up`, `u` and `lo` inside its body, next to the input ports. On a flipped block, the input ports and their names are on the right edge.

**Semantics**: `y = fmax(lo, fmin(up, u))`, for each element.
- When `lo <= u <= up`, `y = u`.
- When `u > up`, `y = up`. When `u < lo`, `y = lo`.
- When `lo > up`, `y = lo` for all values of `u`. The block does not show an error or a warning for this condition.
- When `u` is NaN and `lo <= up`, `y = up`. When a limit is NaN, the block ignores that limit (the C functions `fmin` and `fmax` return the operand that is not NaN).

**Signal Compatibility**:
- Scalar: all three inputs are scalars. The output is a scalar.
- Vector or matrix: when `u` is a vector or a matrix, the output has the dimensions of `u`. Each limit is a scalar, which applies to all elements, or has the same dimensions as `u`.
- A scalar `u` with vector limits gives a vector output. The block applies `u` to each element.
- A scalar `u` with a matrix limit is not valid.
- Inputs that are not scalars must have the same dimensions. For example, `double[3]` and `double[4]` are not valid together, and `double[3]` and `double[3][1]` are not valid together.
- Data types: `double`, `float` and `long`. A `bool` input is not valid. The calculation is in `double`, and the output has the type of `u`. Use the same base type on all three inputs. When all inputs are scalars, type propagation gives the type of `up` to the output, and the generated C gives the type of `u` to the output.
- **Validate Model** and the check before a simulation run show an error for the dimensions that are not valid and for a `bool` input. The check before a run shows a warning when an input is not connected.

**State**: None. The block is direct feedthrough.

**Generated C**: `y = fmax(lo, fmin(up, u));`, in a `for` loop over the elements for a vector or a matrix.

**Examples**:
- Output limit. The FPV reference model (sheet `RatePID`) uses the block `PIDSumLimit`. It limits the sum of the P, I, D and feed-forward terms (`double[3]`, one element for each axis) to the Betaflight `pidsum_limit` and `pidsum_limit_yaw` (±500, ±500, ±400) before the mixer. Two constant `double[3]` sources supply `up` and `lo`. To change the limit during the flight, connect a signal to `up` and its negative to `lo`.
- Anti-windup clamp with limits from a signal. Limit the integral term to the range that the actuator can still use after the P term. Connect `u_max - P` to `up`, the integral term to `u`, and `u_min - P` to `lo`. The limits change with the P term. The block limits only its output. To stop windup, put the block inside the integrator loop. For a discrete integrator made of a Sum and a Unit Delay, limit the output of the Sum before the Unit Delay.

---

### Relay Block
**Purpose**: Hysteresis (Schmitt) switch for rate modulators and bang-bang control.

**Parameters**:
- `onThreshold` (number): Switch ON when `u ≥ onThreshold`
- `offThreshold` (number): Switch OFF when `u ≤ offThreshold` (must be ≤ onThreshold)
- `onOutput` / `offOutput` (number): Output levels (default 1 / 0)
- `initialOn` (boolean): Initial hysteresis state

**Algorithm**: Between thresholds the previous ON/OFF state is held.

**Signal Compatibility**: Scalar numeric only (v1). Direct feedthrough — use `unit_delay` in feedback to avoid algebraic loops.

---

### Rate Limiter Block
**Purpose**: Limits how fast the output may change (command rate limiting).

**Parameters**:
- `risingSlewLimit` (number, > 0): Maximum positive dy/dt (units/sec)
- `fallingSlewLimit` (number, < 0): Minimum (most negative) dy/dt
- `initialOutput` (number): Output at t = 0

**Algorithm** (fixed-step `model->dt`):
```
delta = clamp(u - y_prev, fallingSlewLimit*dt, risingSlewLimit*dt)
y = y_prev + delta
```

**Signal Compatibility**: Scalar numeric only (v1).

---

### Quantizer Block
**Purpose**: Round to nearest multiple of a step size (sensor / D-A quantization).

**Parameters**:
- `quantum` (number, > 0): Quantization step

**Semantics**: `y = quantum * floor(u / quantum + 0.5)` (element-wise for vectors/matrices)

**Signal Compatibility**: Any numeric type; output matches input type.

---

### Edge Detect Block
**Purpose**: Emit a one-step pulse when the input crosses a threshold (engine start / stage timers).

**Parameters**:
- `edge` (`rising` | `falling` | `either`): which transitions produce a pulse
- `threshold` (number, default 0.5): input is high when ≥ threshold

**Output**: `double` 1.0 for one simulation step on edge, else 0.0

**State**: previous high/low for edge detection

**Typical use**: pulse → integrator **reset** (start integrating), or capture clock into unit_delay for “time since start”.

---

## Matrix / Signal Plumbing

### Selector Block
**Purpose**: Select elements from a vector by 0-based indices (v1: vector only).

**Parameters**:
- `indices` (number[]): e.g. `[0, 2]` picks first and third elements

**Output type**:
- One index → scalar
- K indices → `double[K]` (same base type as input)

**Notes**: Direct feedthrough. Out-of-range indices fail type/connection validation when input size is known.

---

## Data Stores (model-scoped)

Shared named signals across the entire model hierarchy (not limited to one sheet like sheet labels). Used for IGM modes, timers, shared navigation state.

### Data Store Write
**Purpose**: Write input into `model->data_stores.<storeName>`.

**Parameters**:
- `storeName` (string): Valid C identifier
- `dataType` (string): Declared type (codegen prefers live input type)
- `initialValue` (string): C99 initializer at t=0

**Ports**: One input, no outputs (sink).

### Data Store Read
**Purpose**: Read `model->data_stores.<storeName>` into an output signal.

**Parameters**:
- `storeName` (string)
- `dataType` (string): Output type (should match the write)

**Semantics**: Same-step write→read works if the write block is ordered first (topological). Otherwise the previous step / initial value is read. Avoid write↔read algebraic loops without a unit delay.

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

### Integrator Block
**Purpose**: Continuous-time integrator (equivalent to 1/s). Integration method (Euler/RK4) is selected at the model level.

**Data ports** (left edge, index ≥ 0):
| Port | Index | When |
|------|-------|------|
| Derivative | 0 | Always |
| x(0) | 1 | When `showInitPort` is true |

**Control ports** (visual placement only; negative indices):
| Port | Index | Placement | When |
|------|-------|-----------|------|
| Enable | −1 | Top | `showEnableInput` |
| Reset | −2 | Bottom | `showResetInput` (rising edge) |

**Parameters**:
- `initialValue` (number): State at t=0 when x(0) is not shown
- `showInitPort` (boolean): Expose left-side x(0) data port for external IC
- `showEnableInput` / `showResetInput` (boolean): Control ports
- `useLimits`, `lowerLimit`, `upperLimit`: Optional saturation

**Initial condition and reset semantics**:
- At t=0 with `showInitPort`: state ← connected x(0) signal, or **0** if unconnected
- At t=0 without `showInitPort`: state ← `initialValue`
- On rising-edge **reset** with `showInitPort`: state ← **current** x(0) signal (re-sampled)
- On rising-edge **reset** without `showInitPort`: state ← `initialValue`

**Signal Compatibility**:
- Derivative and x(0) (if present): same numeric type (scalar, vector, or matrix)
- Output: same type as derivative input
- **No direct feedthrough** (breaks algebraic loops through the derivative path)

---

### Unit Delay Block
**Purpose**: Discrete unit delay (z⁻¹ / Memory). Output is the previous sample of the input.

**Parameters**:
- `initialValue` (number): Delayed output value at the first sample (t=0)
- `sampleInterval` (number, seconds): `0` = update every simulation step; `>0` = hold and update on that period (same pattern as Discrete Transform)

**Signal Compatibility**:
- Input: Any numeric type (scalar, vector, or matrix)
- Output: Same type as input
- **No direct feedthrough** (classic algebraic-loop breaker)

**Notes**:
- State is updated during algebraic evaluation once per simulation step (not continuously integrated)
- Useful for IGM history, last χ commands, and discrete feedback

**Example**: Constant input u=1 with initialValue=0 yields y sequence 0, 1, 1, 1, … at successive steps.

---

### Derivative Block

**Type**: `derivative`

**Purpose**: Gives the time derivative of the input as a backward difference. Use it for a rate that you cannot get from the model states. For a derivative with less noise, use a Transfer Function such as `s / (tau*s + 1)`.

**Ports**:
- `u` (input port 0): Input signal
- `du_dt` (output port 0): Derivative of `u`, in the units of `u` per second

**Parameters**:
- `initialCondition` (number, default `0`): The value of `u_prev` before the first step, for all elements. In most uses it has no effect (see **State and first step**).

**Calculation**: `du_dt = (u - u_prev) / (t - t_prev)`, for each element.
- `u_prev` and `t_prev` are the input and the time at the last major step. The block latches them one time in each step, after the algebra.
- At a major step, `t - t_prev` is the simulation step `dt`. The output is the backward difference over one step. For `u = t²` the output is `2t - dt`.
- In an RK4 stage, `t - t_prev` is the time from the major step to the stage (`dt/2` or `dt`). Thus an integrator of `du_dt` gets a correct slope in each stage. With Euler there are no stages.
- When `t - t_prev` is less than 1e-15 s, the divisor is `dt`.
- There is no filter.

**State and first step**:
- The state is `u_prev` (the shape of `u`) and `t_prev`.
- The editor simulation, `npm run obliq:test` and the C project call `<model>_seed_from_inputs()` after `<model>_init()`. This function runs the algebra, thus `u_prev = u(0)` and the first output is `0`.
- When a host calls only `<model>_init()`, the first output is `u(0) / dt` on the top-level sheet. In a segregated subsystem module it is `(u(0) - initialCondition) / dt`.

**Signal Compatibility**:
- Scalar, vector or matrix input. The output has the shape and the data type of the input. The block calculates each element separately.
- Direct feedthrough: a loop through the block without a state is an algebraic loop.

**Sample time and enable**:
- In a subsystem with a sample time, the block calculates its output only at the sample hits and holds it between hits. It latches `u` on each simulation step. Thus the output at a hit is the difference over the last simulation step, not over the sample period.
- In a subsystem that is disabled, the block does not latch. After the subsystem is enabled again, the divisor is the time since the last latch.

**Numerical cautions**:
- The output amplifies noise. Noise with an amplitude `a` on `u` gives up to `2a / dt` on the output.
- A step of height `h` in `u` gives a pulse of height `h / dt` for one step.
- The output lags the true derivative by about `dt/2`.
- Do not put the block in the body of a For Iterator Subsystem. The block latches on each pass, and from the second pass the divisor is `dt`.

**Generated C**: `y = (u - model->states.<name>_prev) / (model->time - model->states.<name>_tprev);` (in a `for` loop for a vector or a matrix), and the latch `prev = u; tprev = time;` after the algebra.

**Example**: Connect the output of a position integrator to `u`. The output is the velocity, with a lag of about `dt/2`.

---

### Variable Transport Delay Block

**Type**: `variable_transport_delay`

**Purpose**: Delays a scalar signal by a time that an input signal supplies. Use it for a transport lag that changes during the simulation, for example a sensor latency or a fluid transport time.

**Ports** (in this order):
- `u` (input port 0): Input signal
- `delay_sec` (input port 1): Delay, in seconds
- `y` (output port 0): Delayed signal

**Parameters**:
- `maximumDelay` (number, seconds, default `1`): The largest delay. Must be greater than 0.
- `maximumPoints` (integer, default `1024`): The length of the ring buffer, in samples. From 2 to 1000000.
- `initialInput` (number, default `0`): The output before the input history covers the delay. It is the value of `u` before t = 0.

**Calculation**: `y(t) = u(t - d)`, with linear interpolation between samples.
- `d` is `delay_sec`, limited to the range 0 to `maximumDelay`. A negative delay gives `d = 0`. A NaN delay gives `d = 0`.
- The buffer keeps one sample of `u` for each simulation step (`dt`). Thus `d` is also limited to `maximumPoints * dt`. Set `maximumPoints` to `maximumDelay / dt` or more.
- When `d` is less than `dt`, the block interpolates between the current input and the last sample. Thus `d = 0` gives `y = u`.
- Before the history covers the delay (`t < d`), the output is `initialInput`.
- When `delay_sec` changes quickly, the output follows the new delay in the same step. The block does not limit the rate of change of the delay. When the delay increases by more than 1 s in each second, `t - d` decreases, and the output shows older samples again.

**State**: The ring buffer of `maximumPoints` samples (8 bytes each) and its write position. The buffer is part of the model state. RK4 copies the model state 3 times in each step, thus a large buffer makes each step slower. The block writes the buffer one time for each value of the time, after the algebra. A second algebra pass at the same time (`seed_from_inputs`, the passes of a For Iterator body) does not add a sample.

**Signal Compatibility**:
- `u` and `delay_sec` must be scalars. A vector or a matrix on either input is an error in **Validate Model** and in the check before a simulation run. The generated C then has an `#error` with the block name.
- The output is `double`.
- Direct feedthrough on both inputs.

**Sample time and integration method**:
- In a subsystem with a sample time, the block calculates its output only at the sample hits. It writes the buffer on each simulation step. Thus the delay is in seconds, and the output is held between hits.
- With RK4, the block writes the buffer at the major step only. In an RK4 stage the output uses the stage value of `u` only when `d < dt`.

**Generated C**: a `double <name>_buf[maximumPoints]` ring buffer in the state struct. The output is `y = y0 + f * (y1 - y0)`, with `y0` and `y1` the samples at the ages `floor(d / dt)` and `floor(d / dt) + 1`.

**Example**: Sensor latency that changes with the load. Connect the true signal to `u` and the latency in seconds to `delay_sec`. Set `maximumDelay` to the largest latency, for example `0.05`. With `dt = 0.001`, set `maximumPoints` to `50` or more.

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

### Random Noise Block
**Purpose**: White noise for sensor models and disturbance inputs. Gaussian or uniform, held for one sample period, from a seeded deterministic generator.

**Parameters**:
- `distribution` (`gaussian` | `uniform`, default `gaussian`): uniform spans `mean ± √3·σ`, so both have the same variance
- `mean` (number or number[], default 0): one value for all elements, or one per element
- `amplitudeMode` (`stdDev` | `density`, default `stdDev`)
- `stdDev` (number or number[], default 1): σ, used when `amplitudeMode` is `stdDev`
- `noiseDensity` (number or number[], default 0): one-sided white-noise density N in units/√Hz (the datasheet convention, RMS = N·√bandwidth), used when `amplitudeMode` is `density`; σ = N/√(2·Ts)
- `sampleTime` (seconds, default 0): hold time; 0 draws a new value every model step. Inside a sampled subsystem, 0 inherits the subsystem's period
- `seed` (non-negative integer, default 1): give each noise block its own seed
- `dataType` (`double` or `double[N]`)

**Semantics**:
- A new value is drawn at the start of each sample period (`sample_tick % round(Ts/dt) == 0`) and held until the next. RK4 minor stages never advance the generator.
- Ts is `sampleTime`, else the enclosing sample scope, else the model step.
- The generator is SplitMix64, emitted inline in the generated C, with Box–Muller for Gaussian values. Native and WASM builds produce identical sequences for the same seed; libc `rand()` is not used.
- Vector outputs draw an independent value per element.

**Ports**: no inputs, one output. Not direct feedthrough.

**Example**: a gyro axis with density 4.9e-5 rad/s/√Hz sampled at 1 kHz has σ = 4.9e-5/√(2·0.001) ≈ 1.10e-3 rad/s.

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

### Assert Block
**Purpose**: A test check. Records whether its input ever broke a condition during a run.

**Parameters**:
- `mode`:
  - `bounds` (default): fails when `u < lower` or `u > upper`. A blank (`null`) bound is unbounded.
  - `near`: has a second input, `expected`. It fails when `|u − expected| > absTol + relTol·|expected|`. A scalar `expected` applies to every element.
  - `true`: fails when `u` is false or 0.
- `lower`, `upper`: bounds for `bounds` mode (defaults −1 and 1).
- `absTol`, `relTol`: tolerances for `near` mode (defaults 1e-6 and 0).
- `checkFrom`, `checkUntil`: the check window in seconds. The defaults are 0 and `null`, the end of the run.
- `onFailure`: `record` (default) records the failure and continues; `stop` ends the simulation after the failing step.

**Signal Compatibility**:
- Input: scalar, vector or matrix, checked element by element. Any failing element fails the step.
- NaN always fails.
- No output.

**Results**: after a run, the toolbar shows how many Asserts passed. Click it for a Test Results panel listing each Assert's status, first failure and failed/checked step counts. Clicking a row shows that block. Each Assert block also shows a mark (✓ passed, ✕ failed, – not checked); the marks and the toolbar fade once the model changes. The automations API's `simulate` action, and the MCP `run_simulation` tool, return the results as `asserts`. From the command line, `npm run obliq:test -- <model>` runs a model's Asserts natively with its saved simulation settings (see the README's Testing Models section).

**Behaviour**:
- The check runs once per major time step at the step's start time. Blocks inside a subsystem with a sample time check only on its sample hits.
- RK4 intermediate stages are never checked.
- An Assert whose window contains no step reports **not checked**, not passed.

**Generated C**:
- All check code is inside `#ifdef OBLIQ_ASSERTS`. Exported code leaves it undefined, so deployed code carries no test logic unless you define it.
- With it defined, the model provides:
  - `<model>_assert_count()`;
  - `<model>_assert_result(model, i, &result)`, which fills an `obliq_assert_result_t` with the status (not checked, passed or failed), checked and failed step counts, the first failure's time, value and element index (−1 for a scalar), and the worst violation;
  - `<model>_stop_requested(model)`.
- Assert blocks inside segregated subsystems and subsystem references are not checked yet, and code generation warns about them.

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

### Atmosphere Block
**Purpose**: U.S. Standard Atmosphere 1976 (COESA) versus geometric altitude, computed from the standard's defining formulae.

**Input**: `altitude_m`, geometric altitude above MSL (meters)

**Outputs** (four scalar ports, in MathWorks COESA order):
| Port | Quantity |
|------|----------|
| 0 | `temperature_K` |
| 1 | `speed_of_sound_mps` |
| 2 | `pressure_Pa` |
| 3 | `density_kgpm3` |

**Parameters**:
- `model`: `coesa1976` (formulae, default) or `table` (custom breakpoints, linear interpolation)
- `extrapolation`: `clamp` (default) or `extrapolate`. For `coesa1976`, `clamp` holds the altitude to the formulae's range of −5 km to 86 km, and `extrapolate` continues the end layers' formulae. For `table`, they clamp to the table ends or extrapolate linearly.

**Model**:
- Seven layers of linear molecular-scale temperature in geopotential altitude, H = r₀z/(r₀ + z) with r₀ = 6 356 766 m.
- Hydrostatic pressure in each layer: power law where the lapse rate is non-zero, exponential where the layer is isothermal.
- ρ = PM₀/(R*T) and a = √(γR*T/M₀), with the 1976 constants (g₀ = 9.80665, R* = 8.31432, M₀ = 0.0289644, γ = 1.4).
- Below 32 km this is identical to the ICAO/ISO standard atmosphere.
- The same formulae are available in TypeScript as `ussa1976()` and `ussa1976PressureAltitude()` in `src/lib/atmosphere/ussa1976.ts`.

**Notes**:
- Build dynamic pressure as a subsystem: `q = 0.5 * density * mag(V_rel)^2`
- Mach ≈ `mag(V) / speed_of_sound`

---

## Hierarchical Modeling

### Subsystem Block
**Purpose**: Encapsulates a model sheet as a reusable block.

**Parameters**:
- `linkedSheetId` (string): ID of the sheet containing the subsystem
- `inputPorts` (array): Names of input port blocks in the subsystem
- `outputPorts` (array): Names of output port blocks in the subsystem
- `showEnableInput` (boolean): Shows an enable input port
- `subsystemFunction` (optional): The function of the subsystem in a control loop: `controller`, `actuator`, `plant`, `sensor`, `compensator` or `other`. No value means "not set". Only the diagram layout uses it (see [Diagram Layout](../README.md#diagram-layout)). It has no effect on simulation or code generation. A Model Reference Block can also have it.

**Signal Compatibility**:
- Inputs: Determined by Input Port blocks within the subsystem
- Outputs: Determined by Output Port blocks within the subsystem
- Enable input (optional): Boolean signal

**Enable Behavior**: When disabled (enable=false), the subsystem freezes all internal states and outputs hold their last values.

---

### Model Reference Block
**Purpose**: Embeds another saved model, the way a test model embeds the model it tests. Several models can embed the same model, each driving it with its own inputs and run settings.

**Parameters** (a `subsystem` block with no sheets of its own):
- `modelRef`: `{ modelId, version, name }`. `version` is a saved version to pin, or `null` for the model's latest save. `name` is the model's name; if no model has `modelId` (the model was imported or seeded and got a new id), the one model with exactly this name is used, and the editor then records its id.
- `inputPorts`, `outputPorts`: the referenced model's top-level Input Port and Output Port names, in sheet then block order. The editor keeps these current.

**In the editor**:
- Add one from the **Hierarchy** group, choose the model and version in its properties, and see its ports there.
- **Open Model** (properties dialog or context menu) opens the referenced model in a new tab, read-only when pinned. Edit it there; when you return, references that follow the latest save reload it, and the block's ports follow. Wires are matched by port name.
- The badge shows `latest`, `vN`, `vN · newer` (a newer version exists), `missing` or `no model`.
- Deleting a model that others reference warns which models use it. Exporting a model with references reminds you to export the referenced models too.

**Building and simulating**: the referenced model is read when this model is built (simulation, Generate Code, `obliq:test`) and is compiled in as a flattened subsystem.
- Its own simulation settings are ignored; this model's apply.
- Its parameters join this model's. The same name with a different value or type is an error naming both models.
- Sheet labels never connect across the model boundary.
- References nest, up to 8 deep. A cycle is an error.
- A referenced model with data stores is not supported yet.
- Assert blocks inside the referenced model are checked and reported.

**APIs**: the Model Builder actions `addModelReference` and `setModelReference`, and the MCP tools `add_model_reference` and `set_model_reference`.

---

### For Iterator Subsystem Block

**Type**: `for_iterator_subsystem`

**Purpose**: Runs its body sheet a fixed number of times in each simulation step, the same as the Simulink For Iterator Subsystem. Use it for a calculation that repeats for each element, for example the forces of each blade of a rotor.

**Body sheet**: The body is a sheet in `parameters.sheets`, the same as for a subsystem. The Input Port and Output Port blocks in the body set the ports of the block. Put an Iteration Index block in the body to get the number of the pass.

**Ports**: One input port for each Input Port block in the body (`inputPorts`), and one output port for each Output Port block (`outputPorts`). An enable input when `showEnableInput` is `true`.

**Parameters**:
- `iterationLimit` (integer, default `5`): The number of passes in each simulation step. 1 or more. The number is a parameter. A signal cannot set it.
- `indexBase` (`0` or `1`, default `1`): The value of the Iteration Index on the first pass. On the last pass the value is `indexBase + iterationLimit - 1`.
- `resetStates` (`held` or `reset`, default `held`): With `held`, the states in the body keep their values from pass to pass and from step to step. With `reset`, the block sets the Integrator and Unit Delay states in the body to their initial values before each pass.
- `accumulateOutputs` (boolean, default `false`): With `false`, each output is the value of the last pass. With `true`, each output is the sum of the values of all passes (element-wise for a vector or a matrix).
- `codeGenStrategy` (`segregated_atomic` or `segregated`, default `segregated_atomic`): The body is always a separate C module. The Model Builder API does not accept `flatten`. Code generation uses `segregated_atomic` for an old model with `flatten`.
- `inputPorts`, `outputPorts`, `showEnableInput`, `showPortNames`, `parameters`: The same as for a Subsystem Block.

**Behavior in one simulation step**:
1. The block copies its inputs to the body one time, before the first pass. All passes use the same input values.
2. The block sets the index and runs the body `iterationLimit` times.
3. The block gives the outputs of the last pass, or the sums.

**States in the body**:
- A Unit Delay in the body updates on each pass. With `held`, a Unit Delay gives the value of the previous pass, and on the first pass the value of the last pass of the previous step.
- An Integrator in the body advances one time in each simulation step, with its input from the last pass. Do not use `reset` with an Integrator in the body: the reset occurs before each pass.
- Do not put a Derivative or a Variable Transport Delay in the body. Their time base is the simulation step, not the pass.

**Enable**: When the enable input is 0.5 or less, no pass of the body runs, and the outputs hold their last values.

**Nesting**: A flattened Subsystem in the body is permitted. A For Iterator Subsystem or a segregated Subsystem in the body is not supported. The generated C does not compile. This limit applies to each segregated module in a segregated module.

**Code generation**: The body is a separate C module `<Name>.c`. The parent calls `<Name>_compute_outputs()` in a C `for` loop:
`for (int __fi = 1; __fi < 6; ++__fi) { model->Loop.iteration_index = __fi; Loop_compute_outputs(&model->Loop); }`

**Limits**:
- The editor does not show the block on the palette. The canvas cannot open the body sheet. Create the block through the Model Builder API or the MCP server, or import a model JSON file.
- The editor type propagation does not look into the body. **Validate Model** shows a warning for each wire from the block, and for the wires after it: "Unable to determine signal type". Code generation finds the types, and the check before a simulation run shows no warning.

**Example**: Sum of `u * i` for `i = 1, 2, 3`. In the body, connect the Input Port `u` and an Iteration Index to a Multiply block, and the Multiply block to the Output Port `y`. Set `iterationLimit` to `3`, `indexBase` to `1` and `accumulateOutputs` to `true`. For `u = 2` the output is `12`. With `accumulateOutputs` set to `false`, the output is `6` (the last pass).

---

### Iteration Index Block

**Type**: `iteration_index`

**Purpose**: Gives the number of the current pass of the parent For Iterator Subsystem.

**Ports**:
- `i` (output port 0): The index of the pass, `double`

**Parameters**: None with an effect. The `indexBase` and `iterationLimit` of the parent For Iterator Subsystem set the values. The block can have an `indexBase` parameter (`0` or `1`) from the registry defaults. It has no effect.

**Values**: `indexBase` on the first pass, then 1 more on each pass. With the default `indexBase = 1` and `iterationLimit = 5`, the values are 1, 2, 3, 4, 5 (one-based). With `indexBase = 0` they are 0 to 4 (zero-based).

**Placement**: Put the block in the body sheet of a For Iterator Subsystem, or in a flattened Subsystem in that body. In another place, **Validate Model** and the check before a simulation run show an error. The generated C then has an `#error` with the block name.

**State**: None.

**Generated C**: `y = (double)model->iteration_index;`. The parent sets `iteration_index` before each pass.

**Example**: See the For Iterator Subsystem Block.

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