# Automatic Model Layout Improvement: Implementation Plan (Pass 2)

This plan implements the goals in [layout-improvement-goals-pass-2.md](layout-improvement-goals-pass-2.md).

## Decisions

| Decision | Result |
|---|---|
| Layout engine | Use `elkjs` (ELK Layered) if it wins the comparison in Phase 1. |
| Feedback path | Draw the blocks on the feedback path mirrored. Add flip support to the canvas and to the PDF renderer. |
| Subsystem role | Add a `subsystemFunction` property. Suggest its value with rules. Do not build a neural network. |
| Label edits | Changes to Sheet Label blocks are a separate adjustment. The default is off. |
| A `sheet_label_source` that feeds an `output_port` directly | Deferred. Examine this after the other phases are complete. Until then, the layout does not change this structure. |

## Baseline

These values come from the current engine on `reference-models/fpv-vehicle.json`. To get them, run `npm run obliq:layout -- reference-models/fpv-vehicle.json --report` and read the "after" rows. The score counts the wires of one net as one drawn shape.

| Sheet | Wires | Size (px) | Straight wires | Crossings | Overlaps | Nets through a block |
|---|---|---|---|---|---|---|
| Main | 91 | 2136 × 4474 | 5 | 214 | 11 | 5 |
| Telemetry | 41 | 376 × 5824 | 41 | 0 | 0 | 0 |
| FlightController | 154 | 4568 × 2670 | 6 | 764 | 27 | 56 |
| GpsRescue | 384 | 9566 × 2794 | 7 | 2386 | 83 | 197 |
| PositionControl | 203 | 6310 × 2472 | 11 | 835 | 43 | 71 |
| All 29 sheets | 1881 | | 226 | 5425 | 277 | 529 |

The causes in the current engine are:

- The row spacing in a column is 80 px. The port pitch is 20 px to 40 px. Leaf blocks cannot align with the ports that drive them.
- Vertical placement uses the mean position of the neighbours. This aligns a block with none of them.
- The layout sets only `routing.midpointOffset`, which gives one turn for each wire. A wire cannot go around a block.
- A wire that spans several columns does not reserve space in the columns between.
- Longest-path ranking makes wide sheets.

## Phase 0: Layout score and command line

Purpose: measure each later change. This phase also completes Goal 5.

1. Add `src/lib/layout/layoutMetrics.ts`. Compute these values from the drawn wire geometry, with `routing.waypoints` included:
   - wires through a block
   - overlaps between wires of different nets
   - crossings
   - bends, and the number of straight wires
   - backward wires, by count and by length
   - total wire length
   - sheet width, height and aspect ratio
2. Add `scripts/obliq-layout.ts` and the `obliq:layout` script in `package.json`. Use the argument conventions of `scripts/obliq-cgen.ts`.
   - `npm run obliq:layout -- model.json -o out.json` applies the layout.
   - `--report` prints the score for each sheet and does not write a file.
   - `--scope`, `--resize-subsystems` and the other options match `TuneLayoutOptions`.
3. Add a Jest test that compares the score of each reference model with stored values. A change that makes a hard metric worse fails the test.

Done when: the command reproduces the baseline table.

## Phase 1: ELK comparison

Purpose: select the engine with data.

1. Add `elkjs` as a dependency. Its licence is EPL-2.0.
2. Add `src/lib/layout/elkLayout.ts`. It converts one sheet to an ELK graph and converts the result back to `AutoLayoutResult`.
   - Give each block its real size from `blockGeometry.ts`.
   - Give each port a fixed position (`portConstraints: FIXED_POS`).
   - Start with these options: `layering.strategy: NETWORK_SIMPLEX`, `nodePlacement.strategy: NETWORK_SIMPLEX`, `nodePlacement.favorStraightEdges: true`, `edgeRouting: ORTHOGONAL`, `feedbackEdges: true`, `cycleBreaking.strategy: GREEDY_MODEL_ORDER`.
   - Put `layerConstraint: FIRST` on Input Ports and `LAST` on Output Ports.
3. Add `waypoints` to `WireRoute`. Map ELK bend points to `routing.waypoints`.
4. Add an `--engine elk|classic` option to `obliq:layout`.
5. Compare the two engines on all reference models. Try `BRANDES_KOEPF` and `LINEAR_SEGMENTS` node placement also.

Decision gate: use ELK if it has zero wires through blocks and clearly fewer crossings on the large sheets. If it does not, add long-wire lanes, median alignment and waypoint routes to the current engine.

Risk: `elkjs` is asynchronous. `tuneModelLayout` and its callers become asynchronous.

Risk: the editor stores waypoints as absolute positions. Examine what `CustomEdge.tsx` and `wireRoutingUtils.ts` do when the user moves a block that has a wire with waypoints. Clear the stale waypoints if necessary.

## Phase 2: Leaf blocks and staggered groups

Purpose: Goals 2 and 3.

1. Identify satellite blocks. A satellite is a block with one connection: a Sheet Label Sink, a Sheet Label Source, a constant, a terminator or a display.
2. Remove the satellites from the graph before the engine runs. Reserve space for them beside their host block.
3. After the engine runs, put each satellite on the row of its port. Stagger adjacent satellites across sub-columns. The number of sub-columns is the satellite height plus a gap, divided by the port pitch, rounded up.
4. Each satellite wire is then straight. A Sheet Label Sink is the right end of its signal path, and a Sheet Label Source is the left end.
5. Where a net feeds a label and other blocks, put the label at a junction on that net, in the nearest free position.
6. For a sheet that contains only independent pairs (Telemetry), wrap the pairs into a grid. Select the number of columns from the page aspect ratio.
7. Examine a smaller height for Sheet Label blocks. They are 64 px high now. At 45 px, two sub-columns are sufficient at a 40 px port pitch.

Done when: the Main sheet is less than 2400 px high and Telemetry is less than 2000 px high. All satellite wires are straight.

Status: done, with the exceptions that [layout-engine-comparison.md](layout-engine-comparison.md#phase-2-results) gives. Main is 2149 px high and Telemetry is 1064 px high. 57 of 95 satellite wires beside a host are straight. The other wires turn one time, because the host ports are too close together. The Sheet Label height stays 64 px.

## Phase 3: Subsystem function and feedback order

Purpose: Goal 1.

1. Add `subsystemFunction` to the subsystem parameters in `modelSchema.ts`. Values: `controller`, `actuator`, `plant`, `sensor`, `compensator`, `other`. No value means "not set".
2. Add the property to the subsystem properties dialog and to the Model Builder API.
3. Add `src/lib/layout/subsystemRole.ts`, which suggests a value from rules:
   - keywords in the name
   - block content (integrators, saturation, noise and quantiser blocks, continuous states)
   - position in the loop
4. Show the suggestion in the dialog. The user's value always overrides it.
5. Use the role to select the feedback wire of each loop. The forward order is summing junction, controller, actuator, plant. A sensor or a compensator goes on the return path.
6. Pass this order to the engine as the model order. Put return-path blocks on a row below the forward path.

Done when: on the Main sheet, FlightController, Motors, and Frame read left to right, and Sensors is on the return row.

Status: done, with the changes that [layout-engine-comparison.md](layout-engine-comparison.md#phase-3-results) gives. On Main, FlightController, MotorCmdSplit, the motors, Frame and Sensors read left to right. The layout gives the return-path blocks (Sensors on Main), but it does not put them on a return row: Phase 4 does that, together with the mirrored blocks. Phase 3 also adds a minimum subsystem height and a clearance for port names.

## Phase 4: Mirrored blocks

Purpose: draw the feedback path right to left.

1. Add a `flipped` parameter to blocks.
2. In `blockGeometry.ts`, add a function that gives the side of each port. Use it in `BlockNode.tsx`, `pdfRenderer.ts`, the wire path code and the layout.
3. Draw the wire path correctly for a source port on the left side and a target port on the right side.
4. Add **Flip Block** to the block context menu.
5. Add a **Mirror feedback-path blocks** adjustment to **Tune Model Layout**. The layout sets `flipped` on return-path blocks only when this adjustment is on.

Risk: this phase touches each place that assumes inputs are on the left. Give it its own release.

Status: done, with the changes that [layout-engine-comparison.md](layout-engine-comparison.md#phase-4-results) gives. On Main, Sensors is on a flipped row below the forward path, between FlightController and Frame. The layout lays out the return row as a second graph, mirrors it, and joins the two graphs with its own lanes. The row holds only the return path that a plant feeds. A backward wire without a turn position now goes around its blocks.

## Phase 5: Tidy signal labels

Purpose: Goal 2, the edits that change the model.

1. Add a **Tidy signal labels** adjustment. The default is off.
2. Replace a Sheet Label pair on one sheet with a wire when the wire is short and adds no crossings.
3. Replace a wire with a Sheet Label pair when the wire is long and crosses many other wires.
4. Give each group of consumers its own Sheet Label Source.
5. Report each edit in the summary of the dialog.
6. Run `obliq:test` on the reference models before and after. The simulation results must be the same.

Status: done, with the changes that [layout-engine-comparison.md](layout-engine-comparison.md#phase-5-results) gives. Items 2 and 4 are in the code, but their sub-options are off by default: on the reference models they find no candidate. Item 3 makes 38 edits on the FPV vehicle and decreases its crossings from 3538 to 3017. The simulation of the two test models is the same to the bit.

## Phase 6: Drawing details and release

1. Draw a hop mark where two wires of different nets cross.
2. Draw a dot at each junction of a net.
3. Lay out the shipped FPV models again with `obliq:layout`.
4. Update the Diagram Layout section of `README.md` and add release notes to `CHANGELOG.md`.

Status: done, with the changes that [layout-engine-comparison.md](layout-engine-comparison.md#phase-6-results) gives.

- Items 1 and 2: `src/lib/wireDecorations.ts` gives the hops and the junction dots to the canvas and to the PDF export. The rules are in the Diagram Layout section of `README.md`.
- Item 3: the builder (`scripts/build-fpv-reference-model.ts`) lays out the three shipped files with the default ELK layout. Only layout data changes. Before this, the layout got a fix for small steps in wires and a new hard metric, `microJogs`.
- Item 4: `README.md` has one Diagram Layout section, and `CHANGELOG.md` has the section "What's New in 3.8.0". The version number in `package.json` does not change until the release.

## Status of the phases

| Phase | Status |
|---|---|
| 0. Layout score and command line | Done |
| 1. ELK comparison | Done. ELK is the default engine. |
| 2. Leaf blocks and staggered groups | Done, with exceptions (see Phase 2) |
| 3. Subsystem function and feedback order | Done |
| 4. Mirrored blocks | Done |
| 5. Tidy signal labels | Done. Off by default. |
| 6. Drawing details and release | Done. The release itself (version, tag) is open. |

## Deferred

- A `sheet_label_source` that feeds an `output_port` directly. Decide if the layout must flag it or change it. The Tidy keeps these pairs.
- The construction of the Telemetry sheet of the FPV vehicle (41 Sheet Label Source and Output Port pairs). This is a matter for the builder, not for the layout.
- The size of the GpsRescue sheet (8510 × 6279 px). Its height comes from about 20 blocks in each layer and the tracks of its long and feedback wires. A smaller sheet needs a change to the construction of the sheet (for example more subsystems), not to the layout.
- A learned classifier for `subsystemFunction`. This needs some hundreds of labelled subsystems. No public corpus has these labels.
- A smaller Sheet Label height (45 px instead of 64 px). See [Sheet Label height](layout-engine-comparison.md#sheet-label-height).
- A view setting to show or hide the hop marks.
- Levelling the forward row on Main: FlightController, the motors and Frame are not on one row.
- The run time of Tidy signal labels (about 30 s for the FPV vehicle). A web worker or fewer trial layouts can make it shorter.
