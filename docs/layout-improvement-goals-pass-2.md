
# Automatic Model Layout Improvement

## Goal

I wish to radically improve the visual results of Model Layout Tuning feature of `obliq-2`

1. Follow industry standard signal flow conventions (see below)
2. Edit, add, or remove signal Source/ Sink blocks to be most consistent with Goal (1). In short, Source and Sink blocks for a shared signal should only be the **visual** left or right endpoints of a signal path.
3. Improve use of Sink/Source block layout - Use staggering or other visual techniques to reduce the vertical requirements of models with large groups of Sink/Source blocks. (you will find an example anti-pattern of this in the top-level sheet of the current model: http://127.0.0.1:3000/models/69d68e40-b984-49bf-91f0-fa697900588a)
4. Minimize the visual complexity of routed signals (needs research into best practices or algorithms; perhaps we should be aiming to reduce the number of signal edges (ie., number of turns signals make overall); Goal (3) takes precedence over Goal (4) here: we should be willing to add turns to create staggered layout).
5. Add a command-line capability to run automatic layout of an `obliq-2` JSON model.

**The overarching goal here is to improve our automated approach to model visual layout to improve the readability and understandability of every `oblq-2` model. Feel free to research this problem space to locate and apply unique techniques or novel appraches to achieve this result**

## Forward Signal Flow Conventions (Left to Right)

We already prefer a left to right automated layout, but there are further improvements we might inject:

In a standard closed-loop system, the blocks follow this exact sequence along the top path:
- Summing Junction (or Reference Input). Compares the desired setpoint (reference input) with the measured output from the sensor to calculate the error signal.
- Controller (Upstream). Receives the error signal and computes the necessary control action or command.
- Actuator. Converts the controller's low-power command into a physical action, such as opening a valve or spinning a motor.
- Plant (Downstream). Represents the physical process or system being controlled, which responds to the actuator to produce the final system output.

### Exception: Feedback Compensators

While the primary controller sits upstream in the forward path, an auxiliary controller (often called a compensator) is occasionally placed in the feedback path. Even in this setup, the signal travels from the plant output, through the feedback element, and back to the summing junction before reaching the plant again.

### Practicality of use

Improving this left-to-right convention today is likely only practical at a Subsystem level.  And it might require adding a "Subsystem Function" property to subsystem block types (e.g. "Controller", "Actuator", "Plant", "Compensator", "Other").  This does raise an interesting sub-problem: would it be feasible to design a neural network capable of analyzing a Subsystem which would accurately identify the Subsystem Function property through inspection?  This is worth assessing in an implementation plan.
