# Layout Engine Comparison: Classic and ELK Layered

This document gives the results of the phases of [layout-improvement-plan-pass-2.md](layout-improvement-plan-pass-2.md). It compares the classic layout engine (`src/lib/layout/autoLayout.ts`) with ELK Layered (`src/lib/layout/elkLayout.ts`) on the shipped reference models.

## Final result

FPV vehicle, all 29 sheets. "Start" is the classic engine at the start of the work (the baseline of the plan). "Final" is the default layout at the end of Phase 6, which is also the stored layout of the shipped file. `Jogs` (`microJogs`) did not exist at the start; the classic value is from the same code as the final value.

| Value | Start (classic) | Final (ELK, default options) |
|---|---|---|
| Wires through blocks | 529 | 0 |
| Overlaps | 277 | 0 |
| Block overlaps | 0 | 0 |
| Diagonal segments | 0 | 0 |
| Wire ends against the port direction | 205 | 0 |
| Small steps (`Jogs`) | 133 | 0 |
| Crossings | 5425 | 3544 |
| Bends | 3310 | 3570 |
| Straight wires | 226 | 561 |
| Wire length (px) | 1605005 | 1598409 |
| Total sheet area (Mpx) | 120.9 | 139.5 |
| Main (px) | 2136 × 4474 | 2562 × 2514 |
| Layout time, whole model | 0.4 s | 3.2 s |

The reproduce commands are in [Reproduce the comparison](#reproduce-the-comparison). The phases below give the steps between the two columns.

## Summary

| Item | Value |
|---|---|
| ELK version | `elkjs` 0.12.1 (npm `latest` on 2026-11-12). Licence: EPL-2.0 OR GPL-3.0-or-later. |
| Models | `reference-models/fpv-vehicle.json` (29 sheets), `fpv-demo-flight.json` (5 sheets), `fpv-acro-rate-step.json` (5 sheets) |
| Score | `src/lib/layout/layoutMetrics.ts`, from the wire shapes that the editor draws |
| Default engine | `elk` since Phase 2 (see [Phase 2 results](#phase-2-results)). `classic` stays selectable. |

Result on the FPV vehicle, all 29 sheets:

- ELK has no wires through blocks (classic: 529) and no overlaps (classic: 277).
- ELK has 3622 crossings. The classic engine has 5425. This is 33 % fewer.
- ELK has fewer or equal crossings on each of the 29 sheets.
- ELK has 4.5 % more bends (3458 against 3310), but 2.5 times as many straight wires (568 against 226).
- The total sheet area is 21 % larger (145.9 Mpx against 120.9 Mpx). GpsRescue is the largest increase: 2.2 times the area.
- ELK takes 2.1 s for all 29 sheets. The classic engine takes 0.4 s.

Decision gate: "use ELK if it has zero wires through blocks and clearly fewer crossings on the large sheets". ELK has zero wires through blocks on all sheets. On the five sheets with more than 100 wires, ELK has 18 % (PositionControl) to 61 % (AttitudeEstimator) fewer crossings. On GpsRescue, the largest sheet, it has 36 % fewer. The recommendation is to use ELK. Before it becomes the default, make a decision about the sheet area and the bends on the large sheets (see [Where ELK is worse](#where-elk-is-worse)).

## Key sheets

Thru: wires through a block. Ovlp: overlaps between collinear segments of different nets. Cross: crossings between different nets. Strt: wires with no bend. Back, BackLen: wires that go from right to left, and their length. Diag: segments that are not horizontal or vertical. Lengths and sizes are in px. Time is the median of three runs of one sheet, after the first run (see [Run time](#run-time)).

| Sheet | Engine | Thru | Ovlp | Cross | Bends | Strt | Back | BackLen | Length | Width | Height | Diag | Time (ms) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Main | Classic | 5 | 11 | 214 | 172 | 5 | 15 | 38272 | 83409 | 2136 | 4474 | 0 | 9 |
| | ELK | 0 | 0 | 150 | 192 | 13 | 15 | 36081 | 79052 | 2008 | 3120 | 0 | 74 |
| Telemetry | Classic | 0 | 0 | 0 | 0 | 41 | 0 | 0 | 4002 | 376 | 5824 | 0 | 1 |
| | ELK | 0 | 0 | 0 | 0 | 41 | 0 | 0 | 820 | 1320 | 820 | 0 | 18 |
| FlightController | Classic | 56 | 27 | 764 | 296 | 6 | 6 | 7187 | 191168 | 4568 | 2670 | 0 | 49 |
| | ELK | 0 | 0 | 614 | 336 | 19 | 7 | 14215 | 234970 | 4421 | 3238 | 0 | 323 |
| GpsRescue | Classic | 197 | 83 | 2386 | 754 | 7 | 60 | 94549 | 558482 | 9566 | 2794 | 0 | 248 |
| | ELK | 0 | 0 | 1536 | 908 | 61 | 58 | 105136 | 761386 | 9244 | 6280 | 0 | 635 |
| PositionControl | Classic | 71 | 43 | 835 | 384 | 11 | 39 | 68701 | 215178 | 6310 | 2472 | 0 | 29 |
| | ELK | 0 | 0 | 686 | 470 | 40 | 39 | 87063 | 292103 | 5455 | 3777 | 0 | 203 |
| **All 29 sheets** | Classic | **529** | **277** | **5425** | **3310** | **226** | **205** | **304689** | **1605005** | | | **0** | 396 |
| | ELK | **0** | **0** | **3622** | **3458** | **568** | **206** | **344912** | **1827113** | | | **0** | 2051 |

## Where ELK is worse

- **Sheet area.** GpsRescue goes from 9566 × 2794 px to 9244 × 6280 px. PositionControl goes from 6310 × 2472 px to 5455 × 3777 px. A probable cause: ELK routes the feedback wires and the long wires on their own tracks around the blocks, and these tracks need space. The classic engine does not need this space, because its wires go through blocks. This cause was not measured separately.
- **Bends.** ELK has more bends on 10 of the 29 sheets. The largest increases are GpsRescue (+154), PositionControl (+86) and FlightController (+40). A wire that goes around a block needs four bends, not two.
- **Wire length.** The total is 14 % longer, for the same reason. Only 4 sheets have longer wires, but they include the three largest sheets.
- **Height.** ELK makes 12 sheets taller. Main is 3120 px high, which is lower than the classic 4474 px, but more than the Phase 2 target of 2400 px.
- **Run time.** ELK is 5 times slower in total (see [Run time](#run-time)).

ELK is not worse on crossings, wires through blocks, overlaps or diagonal segments on any sheet.

## Reproduce the comparison

Use Node 22. Run these commands from the repository root:

```bash
npm run obliq:layout -- reference-models/fpv-vehicle.json --report --json --engine classic > classic.json
npm run obliq:layout -- reference-models/fpv-vehicle.json --report --json --engine elk > elk.json
```

The `after` values of each sheet are the result of the engine. For a table instead of JSON, remove `--json`. For the other models, replace the file name.

To try an ELK option, add `--elk-option <key=value>` one time for each option. To use the order of the block list instead of the signal-flow order, add `--elk-order list`. For example:

```bash
npm run obliq:layout -- reference-models/fpv-vehicle.json --report --engine elk \
  --elk-option elk.layered.nodePlacement.strategy=NETWORK_SIMPLEX \
  --elk-option elk.layered.thoroughness=100
```

The `--elk-option` values replace the adapter defaults (`DEFAULT_ELK_OPTIONS` in `elkLayout.ts`). Each row of the [option table](#option-sets) gives the options that make it different from its base.

## Chosen option set

The adapter default (`DEFAULT_ELK_OPTIONS`, with `order: 'flow'`):

| Option | Value |
|---|---|
| `elk.algorithm` | `layered` |
| `elk.direction` | `RIGHT` |
| `elk.edgeRouting` | `ORTHOGONAL` |
| `elk.layered.layering.strategy` | `NETWORK_SIMPLEX` |
| `elk.layered.nodePlacement.strategy` | `BRANDES_KOEPF` |
| `elk.layered.feedbackEdges` | `true` |
| `elk.layered.cycleBreaking.strategy` | `MODEL_ORDER` |
| `elk.layered.crossingMinimization.greedySwitch.activationThreshold` | `0` |
| `elk.layered.thoroughness` | `30` |
| Model order (adapter option `order`) | `flow`: signal-flow order |
| On Input Port blocks | `elk.layered.layering.layerConstraint: FIRST` |
| On Output Port blocks | `elk.layered.layering.layerConstraint: LAST` |
| On each block | `elk.portConstraints: FIXED_POS` |

The selection criteria, in this order:

1. No wire through a block.
2. No overlap.
3. Fewest crossings.
4. Fewest bends.
5. Smallest sheet area.

The reasons for each value:

- **Signal-flow order with MODEL_ORDER cycle breaking.** This is the largest effect. `signalFlowOrder()` in `autoLayout.ts` uses the feedback analysis of the classic engine: a breadth-first distance from the sources, with feedback wires only inside loops. The order is a topological order of the graph without these feedback wires. With MODEL_ORDER, ELK reverses the same feedback wires as the classic engine. The crossings are 29 % fewer than with the same options and GREEDY_MODEL_ORDER or the list order.
- **BRANDES_KOEPF node placement.** It gives about 1000 fewer bends than NETWORK_SIMPLEX, and no overlaps. NETWORK_SIMPLEX gives sheets with 40 % less area.
- **Greedy switch on all graphs.** ELK turns the greedy switch off for graphs with more than 40 nodes. With the threshold at 0, the large sheets have fewer crossings.
- **Thoroughness 30.** It gives 2.6 % fewer crossings than the default 7 for 2.2 times the time.
- **Default spacings.** Other spacings changed the crossings by less than 0.5 %.

These alternatives were rejected although they are near the chosen set:

- `elk.layered.thoroughness=100` gives 50 fewer crossings (1.4 %). It takes 2.7 times as long: 5.3 s for all sheets and 1.8 s for GpsRescue. The layout runs in the browser's main thread, so this time is not acceptable.
- `elk.spacing.nodeNode=10` gives 2 fewer crossings and 10 fewer bends. A gap of 10 px between blocks leaves too little space for the block name, which the editor shows above a block. The difference is less than 0.1 %, so the default 20 px stays.
- `elk.layered.compaction.postCompaction.strategy=EDGE_LENGTH` gives 15 fewer crossings, but it makes one overlap.
- `elk.layered.cycleBreaking.strategy=DEPTH_FIRST`, with BRANDES_KOEPF, greedy switch and thoroughness 30, gives 3574 crossings with the list order. The sheet area is 185 Mpx (27 % more than the chosen set), and GpsRescue is 14456 px wide.

## Option sets

Totals for the FPV vehicle (29 sheets). The last column is the total crossings of all three reference models. Area is the sum of width × height of the sheets, in Mpx. "List order" is the order of the sheet's block list, with Input Ports first and Output Ports last. "Flow order" is the signal-flow order. "BK" is BRANDES_KOEPF node placement. "Greedy switch" is `elk.layered.crossingMinimization.greedySwitch.activationThreshold=0`.

The first group changes one option of the start set in the plan (NETWORK_SIMPLEX layering and placement, `favorStraightEdges`, GREEDY_MODEL_ORDER, list order). The second group combines the best options of the first group. The third group uses the flow order. The last group changes one option of the chosen set. "Wider spacings" (\*) is `elk.layered.spacing.nodeNodeBetweenLayers=40`, `elk.layered.spacing.edgeNodeBetweenLayers=20`, `elk.layered.spacing.edgeEdgeBetweenLayers=15`, `elk.spacing.nodeNode=30`, `elk.spacing.edgeEdge=15` and `elk.spacing.edgeNode=15`.

| Option set | Thru | Ovlp | Cross | Bends | Strt | Back | Length | Area (Mpx) | Cross, 3 models |
|---|---|---|---|---|---|---|---|---|---|
| Classic engine | 529 | 277 | 5425 | 3310 | 226 | 205 | 1605005 | 120.9 | 5442 |
| Start set (brief), list order | 0 | 2 | 5444 | 4502 | 332 | 141 | 1599358 | 89.6 | 5445 |
| nodePlacement BRANDES_KOEPF | 0 | 0 | 5324 | 3520 | 527 | 141 | 1943858 | 132.4 | 5325 |
| BRANDES_KOEPF, fixedAlignment BALANCED | 0 | 0 | 5347 | 4352 | 267 | 141 | 1881429 | 136.2 | 5348 |
| BRANDES_KOEPF, fixedAlignment LEFTUP | 0 | 0 | 5381 | 3416 | 530 | 141 | 1877011 | 137.7 | 5382 |
| nodePlacement LINEAR_SEGMENTS | 0 | 1 | 5369 | 4450 | 247 | 141 | 1708570 | 106.0 | 5370 |
| favorStraightEdges false | 0 | 2 | 5445 | 4522 | 329 | 141 | 1599209 | 89.5 | 5446 |
| cycleBreaking MODEL_ORDER | 0 | 3 | 5342 | 4912 | 297 | 210 | 1649804 | 89.0 | 5394 |
| cycleBreaking GREEDY (ELK default) | 0 | 3 | 6398 | 4514 | 340 | 152 | 1704221 | 92.6 | 6399 |
| cycleBreaking DEPTH_FIRST | 0 | 0 | 3948 | 4900 | 362 | 170 | 1993764 | 104.2 | 3949 |
| cycleBreaking SCC_CONNECTIVITY | 0 | 1 | 4770 | 4692 | 322 | 131 | 1609965 | 87.5 | 4771 |
| cycleBreaking BFS_NODE_ORDER | 0 | 2 | 5546 | 5176 | 294 | 471 | 1862467 | 93.5 | 5551 |
| cycleBreaking DFS_NODE_ORDER | 0 | 1 | 3963 | 4930 | 368 | 173 | 2036998 | 106.7 | 3964 |
| thoroughness 30 | 0 | 3 | 5430 | 4460 | 339 | 141 | 1560165 | 86.1 | 5431 |
| considerModelOrder NODES_AND_EDGES | 0 | 0 | 5957 | 4504 | 339 | 141 | 1622901 | 87.4 | 5959 |
| greedySwitch activationThreshold 0 | 0 | 4 | 5236 | 4500 | 338 | 141 | 1571207 | 88.8 | 5238 |
| feedbackEdges false | 0 | 2 | 5444 | 4502 | 332 | 141 | 1599358 | 89.6 | 5445 |
| wider spacings (*) | 0 | 0 | 5464 | 4494 | 330 | 141 | 1934986 | 116.3 | 5465 |
| edgeEdge spacings 8 | 0 | 3 | 5436 | 4500 | 327 | 141 | 1536604 | 85.5 | 5437 |
| postCompaction EDGE_LENGTH | 5 | 9 | 5466 | 4486 | 332 | 152 | 1346468 | 83.2 | 5467 |
| postCompaction LEFT | 0 | 7 | 5443 | 4464 | 332 | 141 | 1469957 | 83.2 | 5444 |
| BK + greedy switch | 0 | 0 | 5188 | 3398 | 551 | 141 | 1849914 | 132.1 | 5190 |
| BK + greedy switch + thoroughness 30 | 0 | 0 | 5151 | 3364 | 531 | 141 | 1830100 | 128.8 | 5152 |
| BK + greedy switch + DEPTH_FIRST | 0 | 0 | 3755 | 3560 | 579 | 170 | 2343927 | 190.9 | 3757 |
| BK + greedy switch + DEPTH_FIRST + thoroughness 30 | 0 | 0 | 3574 | 3486 | 581 | 170 | 2283320 | 185.3 | 3575 |
| BK + greedy switch + SCC_CONNECTIVITY | 0 | 0 | 4484 | 3474 | 522 | 131 | 1902152 | 134.2 | 4486 |
| Flow order, start set | 0 | 2 | 5739 | 4480 | 340 | 146 | 1615681 | 87.0 | 5740 |
| Flow order, MODEL_ORDER | 0 | 2 | 4001 | 4518 | 346 | 206 | 1544218 | 88.5 | 4002 |
| Flow order, MODEL_ORDER, greedy switch (NETWORK_SIMPLEX placement) | 0 | 3 | 3732 | 4464 | 354 | 206 | 1522846 | 89.7 | 3734 |
| Flow order, MODEL_ORDER, greedy switch, thoroughness 30 (NETWORK_SIMPLEX placement) | 0 | 1 | 3660 | 4510 | 349 | 206 | 1492232 | 86.9 | 3661 |
| Flow order, BK, greedy switch, MODEL_ORDER | 0 | 0 | 3717 | 3440 | 564 | 206 | 1867516 | 154.8 | 3719 |
| **Chosen:** flow order, BK, greedy switch, MODEL_ORDER, thoroughness 30 | 0 | 0 | 3622 | 3458 | 568 | 206 | 1827113 | 145.9 | 3623 |
| Chosen, thoroughness 100 | 0 | 0 | 3572 | 3444 | 569 | 206 | 1800907 | 144.5 | 3573 |
| Chosen, list order | 0 | 0 | 5082 | 3672 | 498 | 210 | 2129410 | 145.5 | 5129 |
| Chosen, GREEDY_MODEL_ORDER | 0 | 1 | 5106 | 3418 | 546 | 146 | 1895992 | 128.3 | 5107 |
| Chosen, considerModelOrder NODES_AND_EDGES | 0 | 0 | 3810 | 3468 | 553 | 206 | 1824034 | 151.5 | 3813 |
| Chosen, fixedAlignment BALANCED | 0 | 0 | 3662 | 4264 | 313 | 206 | 1874362 | 158.4 | 3664 |
| Chosen, LINEAR_SEGMENTS | 0 | 2 | 3706 | 4388 | 280 | 206 | 1750118 | 127.3 | 3708 |
| Chosen, postCompaction EDGE_LENGTH | 0 | 1 | 3607 | 3454 | 568 | 206 | 1541014 | 134.0 | 3608 |
| Chosen, nodeNode 10 | 0 | 0 | 3620 | 3448 | 574 | 206 | 1799221 | 139.8 | 3621 |
| Chosen, nodeNode 30 | 0 | 0 | 3620 | 3464 | 565 | 206 | 1855256 | 152.1 | 3621 |
| Chosen, nodeNodeBetweenLayers 40 | 0 | 0 | 3626 | 3458 | 568 | 206 | 1852743 | 149.6 | 3626 |
| Chosen, edgeNodeBetweenLayers 20 | 0 | 0 | 3623 | 3458 | 568 | 206 | 1916953 | 154.8 | 3624 |
| Chosen, edgeEdgeBetweenLayers 6 | 0 | 0 | 3624 | 3458 | 568 | 206 | 1746557 | 139.4 | 3625 |
| Chosen, edgeEdge 15 | 0 | 0 | 3638 | 3456 | 572 | 206 | 1945009 | 157.0 | 3639 |
| Chosen, feedbackEdges false | 0 | 0 | 3622 | 3458 | 568 | 206 | 1827113 | 145.9 | 3623 |

What each change did, in short:

| Change | Effect on the numbers |
|---|---|
| NETWORK_SIMPLEX to BRANDES_KOEPF placement | About 1000 fewer bends, 1.6 times as many straight wires, no overlaps. The area is 50 % larger. |
| BK `fixedAlignment` BALANCED or LEFTUP | BALANCED: 800 more bends. LEFTUP: no clear change. |
| LINEAR_SEGMENTS placement | About 1000 more bends than BK. Overlaps. |
| `favorStraightEdges` false | No clear change. |
| GREEDY_MODEL_ORDER to MODEL_ORDER (list order) | Almost no change in crossings, 400 more bends. |
| GREEDY_MODEL_ORDER to GREEDY | 18 % more crossings. |
| DEPTH_FIRST or DFS_NODE_ORDER cycle breaking | 27 % fewer crossings, but 9 % more bends and larger sheets. With NETWORK_SIMPLEX placement, GpsRescue took 19 s. |
| SCC_CONNECTIVITY cycle breaking | 12 % fewer crossings. Less than the flow order gives. |
| BFS_NODE_ORDER cycle breaking | More crossings and 471 backward wires. |
| `considerModelOrder.strategy` NODES_AND_EDGES | 5 % to 10 % more crossings. |
| Thoroughness 7 to 30 | 0 % to 3 % fewer crossings, 2.2 times the time. |
| Greedy switch on all graphs | 3 % to 7 % fewer crossings. |
| `feedbackEdges` false | No change. |
| Spacings | Less than 0.5 % change in crossings. Wider spacings make larger sheets. Narrower spacings gave no clear gain. |
| `postCompaction` EDGE_LENGTH or LEFT | Shorter wires and smaller sheets, but overlaps. EDGE_LENGTH also gave 5 wires through blocks. |
| List order to flow order, with MODEL_ORDER | 25 % to 29 % fewer crossings. |

## Full results

### FPV vehicle

| Sheet | Wires | Engine | Thru | Ovlp | Cross | Bends | Strt | Back | BackLen | Length | Width | Height | Diag | Time (ms) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Main | 91 | Classic | 5 | 11 | 214 | 172 | 5 | 15 | 38272 | 83409 | 2136 | 4474 | 0 | 9 |
|  |  | ELK | 0 | 0 | 150 | 192 | 13 | 15 | 36081 | 79052 | 2008 | 3120 | 0 | 74 |
| FlightController | 154 | Classic | 56 | 27 | 764 | 296 | 6 | 6 | 7187 | 191168 | 4568 | 2670 | 0 | 49 |
|  |  | ELK | 0 | 0 | 614 | 336 | 19 | 7 | 14215 | 234970 | 4421 | 3238 | 0 | 323 |
| Failsafe | 62 | Classic | 12 | 7 | 76 | 118 | 3 | 9 | 9009 | 38947 | 2504 | 1322 | 0 | 3 |
|  |  | ELK | 0 | 0 | 54 | 106 | 21 | 9 | 10912 | 37836 | 2290 | 1403 | 0 | 50 |
| AttitudeEstimator | 115 | Classic | 38 | 23 | 224 | 210 | 10 | 17 | 25553 | 91537 | 3890 | 1678 | 0 | 17 |
|  |  | ELK | 0 | 0 | 87 | 184 | 44 | 17 | 25504 | 75884 | 3390 | 2002 | 0 | 124 |
| Rates | 9 | Classic | 0 | 0 | 2 | 12 | 3 | 0 | 0 | 1744 | 994 | 352 | 0 | 0 |
|  |  | ELK | 0 | 0 | 0 | 10 | 4 | 0 | 0 | 1184 | 822 | 264 | 0 | 4 |
| AngleMode | 27 | Classic | 1 | 1 | 26 | 52 | 1 | 0 | 0 | 8378 | 1407 | 856 | 0 | 1 |
|  |  | ELK | 0 | 0 | 21 | 36 | 11 | 0 | 0 | 6789 | 1245 | 675 | 0 | 18 |
| GyroFilters | 7 | Classic | 0 | 0 | 0 | 4 | 5 | 0 | 0 | 955 | 1327 | 170 | 0 | 0 |
|  |  | ELK | 0 | 0 | 0 | 2 | 6 | 0 | 0 | 426 | 1039 | 120 | 0 | 4 |
| RpmFilter | 64 | Classic | 11 | 2 | 44 | 96 | 16 | 0 | 0 | 45828 | 3596 | 1658 | 0 | 8 |
|  |  | ELK | 0 | 0 | 0 | 104 | 29 | 0 | 0 | 37045 | 5081 | 1032 | 0 | 15 |
| DynamicNotch | 38 | Classic | 0 | 0 | 27 | 52 | 12 | 0 | 0 | 9246 | 1482 | 544 | 0 | 1 |
|  |  | ELK | 0 | 0 | 12 | 66 | 13 | 0 | 0 | 7656 | 1158 | 519 | 0 | 22 |
| Arming | 29 | Classic | 4 | 6 | 21 | 54 | 2 | 4 | 3330 | 11074 | 1796 | 540 | 0 | 1 |
|  |  | ELK | 0 | 0 | 12 | 52 | 9 | 4 | 4033 | 10868 | 1496 | 620 | 0 | 25 |
| AltitudeEstimator | 48 | Classic | 13 | 8 | 41 | 84 | 6 | 7 | 4405 | 24344 | 4927 | 496 | 0 | 1 |
|  |  | ELK | 0 | 0 | 22 | 88 | 16 | 7 | 5448 | 22983 | 4142 | 592 | 0 | 44 |
| AltHold | 53 | Classic | 21 | 6 | 113 | 104 | 1 | 4 | 2738 | 47969 | 3778 | 1420 | 0 | 2 |
|  |  | ELK | 0 | 0 | 38 | 88 | 18 | 4 | 3838 | 36992 | 3054 | 1028 | 0 | 72 |
| GpsRescue | 384 | Classic | 197 | 83 | 2386 | 754 | 7 | 60 | 94549 | 558482 | 9566 | 2794 | 0 | 248 |
|  |  | ELK | 0 | 0 | 1536 | 908 | 61 | 58 | 105136 | 761386 | 9244 | 6280 | 0 | 635 |
| PosHold | 79 | Classic | 23 | 14 | 134 | 156 | 1 | 10 | 7476 | 58822 | 3829 | 1296 | 0 | 4 |
|  |  | ELK | 0 | 0 | 93 | 182 | 17 | 11 | 14246 | 69771 | 3548 | 1461 | 0 | 90 |
| PositionControl | 203 | Classic | 71 | 43 | 835 | 384 | 11 | 39 | 68701 | 215178 | 6310 | 2472 | 0 | 29 |
|  |  | ELK | 0 | 0 | 686 | 470 | 40 | 39 | 87063 | 292103 | 5455 | 3777 | 0 | 203 |
| RatePID | 45 | Classic | 2 | 1 | 23 | 74 | 8 | 1 | 2037 | 20287 | 2146 | 1338 | 0 | 1 |
|  |  | ELK | 0 | 0 | 12 | 56 | 20 | 2 | 1272 | 14972 | 2276 | 850 | 0 | 26 |
| Mixer | 28 | Classic | 3 | 0 | 21 | 46 | 5 | 0 | 0 | 6697 | 2398 | 344 | 0 | 0 |
|  |  | ELK | 0 | 0 | 10 | 30 | 15 | 0 | 0 | 4933 | 1968 | 288 | 0 | 15 |
| Home | 28 | Classic | 4 | 4 | 26 | 56 | 0 | 3 | 2568 | 11512 | 1922 | 492 | 0 | 1 |
|  |  | ELK | 0 | 0 | 6 | 42 | 11 | 3 | 2951 | 8842 | 1534 | 522 | 0 | 24 |
| HomeVector | 15 | Classic | 0 | 1 | 22 | 26 | 2 | 0 | 0 | 3069 | 924 | 420 | 0 | 0 |
|  |  | ELK | 0 | 0 | 10 | 16 | 7 | 0 | 0 | 2099 | 820 | 362 | 0 | 10 |
| Motor | 17 | Classic | 0 | 0 | 4 | 24 | 5 | 0 | 0 | 3954 | 1582 | 420 | 0 | 0 |
|  |  | ELK | 0 | 0 | 0 | 12 | 11 | 0 | 0 | 2312 | 1150 | 260 | 0 | 5 |
| Battery | 12 | Classic | 3 | 2 | 3 | 14 | 5 | 2 | 1543 | 3551 | 1236 | 304 | 0 | 0 |
|  |  | ELK | 0 | 0 | 1 | 14 | 7 | 2 | 1274 | 2208 | 856 | 279 | 0 | 9 |
| Frame | 83 | Classic | 24 | 17 | 105 | 126 | 20 | 15 | 23084 | 42518 | 2328 | 1952 | 0 | 3 |
|  |  | ELK | 0 | 0 | 45 | 130 | 34 | 15 | 18092 | 35507 | 1836 | 1606 | 0 | 84 |
| Sensors | 20 | Classic | 0 | 0 | 5 | 40 | 0 | 0 | 0 | 4943 | 824 | 988 | 0 | 0 |
|  |  | ELK | 0 | 0 | 1 | 22 | 9 | 0 | 0 | 1698 | 603 | 592 | 0 | 11 |
| IMU | 10 | Classic | 0 | 0 | 0 | 8 | 6 | 0 | 0 | 984 | 860 | 458 | 0 | 0 |
|  |  | ELK | 0 | 0 | 0 | 4 | 8 | 0 | 0 | 307 | 668 | 278 | 0 | 5 |
| ImuFrontEnd | 55 | Classic | 9 | 0 | 116 | 78 | 16 | 0 | 0 | 26299 | 2702 | 876 | 0 | 2 |
|  |  | ELK | 0 | 0 | 75 | 64 | 23 | 0 | 0 | 13143 | 1982 | 954 | 0 | 23 |
| Magnetometer | 18 | Classic | 0 | 0 | 9 | 30 | 3 | 0 | 0 | 4593 | 1580 | 458 | 0 | 0 |
|  |  | ELK | 0 | 0 | 4 | 20 | 9 | 0 | 0 | 2432 | 1274 | 257 | 0 | 12 |
| Barometer | 9 | Classic | 1 | 2 | 0 | 6 | 6 | 1 | 551 | 1872 | 1487 | 189 | 0 | 0 |
|  |  | ELK | 0 | 0 | 0 | 8 | 6 | 1 | 573 | 878 | 1049 | 194 | 0 | 5 |
| GNSS | 137 | Classic | 31 | 19 | 184 | 234 | 20 | 12 | 13686 | 83643 | 5550 | 1320 | 0 | 15 |
|  |  | ELK | 0 | 0 | 133 | 216 | 46 | 12 | 14274 | 62017 | 4825 | 1400 | 0 | 101 |
| Telemetry | 41 | Classic | 0 | 0 | 0 | 0 | 41 | 0 | 0 | 4002 | 376 | 5824 | 0 | 1 |
|  |  | ELK | 0 | 0 | 0 | 0 | 41 | 0 | 0 | 820 | 1320 | 820 | 0 | 18 |
| **Total (29 sheets)** | 1881 | Classic | **529** | **277** | **5425** | **3310** | **226** | **205** | **304689** | **1605005** |  |  | **0** | 396 |
|  |  | ELK | **0** | **0** | **3622** | **3458** | **568** | **206** | **344912** | **1827113** |  |  | **0** | 2051 |

### FPV demo flight

| Sheet | Wires | Engine | Thru | Ovlp | Cross | Bends | Strt | Back | BackLen | Length | Width | Height | Diag |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Main | 22 | Classic | 0 | 0 | 6 | 40 | 2 | 0 | 0 | 9913 | 572 | 2224 | 0 |
|  |  | ELK | 0 | 0 | 0 | 38 | 3 | 0 | 0 | 8300 | 578 | 1324 | 0 |
| Pilot | 17 | Classic | 0 | 0 | 0 | 32 | 1 | 0 | 0 | 5476 | 594 | 1072 | 0 |
|  |  | ELK | 0 | 0 | 0 | 28 | 3 | 0 | 0 | 3956 | 476 | 652 | 0 |
| Conditions | 12 | Classic | 0 | 0 | 0 | 12 | 6 | 0 | 0 | 2202 | 530 | 1360 | 0 |
|  |  | ELK | 0 | 0 | 0 | 10 | 7 | 0 | 0 | 664 | 670 | 652 | 0 |
| Telemetry | 9 | Classic | 0 | 0 | 0 | 0 | 9 | 0 | 0 | 652 | 280 | 1216 | 0 |
|  |  | ELK | 0 | 0 | 0 | 0 | 9 | 0 | 0 | 180 | 484 | 400 | 0 |
| Tests | 46 | Classic | 0 | 1 | 9 | 80 | 6 | 0 | 0 | 23473 | 1219 | 2888 | 0 |
|  |  | ELK | 0 | 0 | 0 | 42 | 25 | 0 | 0 | 3960 | 1228 | 1354 | 0 |
| **Total (5 sheets)** | 106 | Classic | **0** | **1** | **15** | **164** | **24** | **0** | **0** | **41716** |  |  | **0** |
|  |  | ELK | **0** | **0** | **0** | **118** | **47** | **0** | **0** | **17060** |  |  | **0** |

### FPV acro rate step

| Sheet | Wires | Engine | Thru | Ovlp | Cross | Bends | Strt | Back | BackLen | Length | Width | Height | Diag |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Main | 10 | Classic | 0 | 0 | 0 | 16 | 2 | 0 | 0 | 1767 | 504 | 840 | 0 |
|  |  | ELK | 0 | 0 | 0 | 14 | 3 | 0 | 0 | 1624 | 448 | 840 | 0 |
| Pilot | 17 | Classic | 0 | 0 | 0 | 32 | 1 | 0 | 0 | 5476 | 594 | 1072 | 0 |
|  |  | ELK | 0 | 0 | 0 | 28 | 3 | 0 | 0 | 3956 | 476 | 652 | 0 |
| Conditions | 12 | Classic | 0 | 0 | 0 | 12 | 6 | 0 | 0 | 2202 | 530 | 1360 | 0 |
|  |  | ELK | 0 | 0 | 0 | 10 | 7 | 0 | 0 | 664 | 670 | 652 | 0 |
| Telemetry | 4 | Classic | 0 | 0 | 0 | 0 | 4 | 0 | 0 | 298 | 280 | 496 | 0 |
|  |  | ELK | 0 | 0 | 0 | 0 | 4 | 0 | 0 | 80 | 232 | 316 | 0 |
| Tests | 14 | Classic | 0 | 0 | 2 | 18 | 5 | 0 | 0 | 2783 | 600 | 784 | 0 |
|  |  | ELK | 0 | 0 | 1 | 10 | 9 | 0 | 0 | 822 | 416 | 484 | 0 |
| **Total (5 sheets)** | 57 | Classic | **0** | **0** | **2** | **78** | **18** | **0** | **0** | **12526** |  |  | **0** |
|  |  | ELK | **0** | **0** | **1** | **62** | **26** | **0** | **0** | **7146** |  |  | **0** |

## Run time

Run time is the time of `computeElkLayout()` or `computeAutoLayout()` for one sheet in Node 22.23.4 on an Intel Core Ultra 7 265K. Each value is the median of three runs, after one run that loads and compiles the code. The first ELK layout also loads `elk.bundled.js`: in Node this takes about 180 ms. The command line with `--report` gives 2.4 s for all sheets of the FPV vehicle with ELK, and 0.4 s with the classic engine.

`elk.bundled.js` runs in the calling thread. In the browser, the page does not respond during a layout. For one sheet this is at most 0.7 s (GpsRescue). For the whole FPV vehicle it is about 2 s. If this is too long, put ELK in a web worker (`elkjs/lib/elk-worker.min.js`) in a later phase.

## Bundle size

The editor loads `elkjs` with a dynamic `import()` only when a layout uses the ELK engine. `next build` (Next.js 15.5.28) gives:

| Item | Before | After |
|---|---|---|
| `/models/[id]`: page size | 524 kB | 525 kB |
| `/models/[id]`: first load JS | 821 kB | 823 kB |
| Lazy chunk with `elk.bundled.js` | none | 1.49 MB (441 kB with gzip) |
| Lazy chunk with `elkLayout.ts` | none | 6.2 kB (2.6 kB with gzip) |

The 2 kB increase in the first load is the waypoint repair (`waypointRepair.ts`) and the engine choice in the dialog. The initial chunks of the editor page do not contain ELK.

## How the adapter converts a sheet

- **Block sizes.** The node sizes come from `measure()` in `autoLayout.ts`, which uses `blockGeometry.ts`. The classic engine and the editor use the same functions.
- **Ports.** Each port has a fixed position. Input ports are on the WEST side and output ports are on the EAST side, at `portOffsetY`. Each data port is `HANDLE_OUTSET` (6 px) wide, 0 px high and outside the block. Thus ELK starts and ends each edge at the wire end that the editor draws.
- **Enable and reset wires.** An enable wire (target port -1) goes to a NORTH port at the top centre of the block. A reset wire (target port -2) goes to a SOUTH port at the bottom centre. ELK uses these wires for the layers and the placement. The adapter writes no route for them, because the editor draws them with its own shape. It clears a stale route, as the classic engine does.
- **Comment blocks.** They are not in the ELK graph and they do not move.
- **Disconnected parts.** ELK lays out each connected part separately and packs the parts (`elk.separateConnectedComponents`, the ELK default). Telemetry, which has 41 independent pairs, becomes a grid of 1320 × 820 px.
- **Position.** The laid-out blocks start at x = 100 px, with their vertical centre at y = 400 px, as with the classic engine. Block positions were rounded to whole px until Phase 6. Since Phase 6, x is whole px, and y is whole px except where a straight wire needs a fractional y (see [Phase 6 results](#phase-6-results)).
- **Routes.** ELK routes all edges from one port as one hyperedge with junction points. Each edge still has a section with the full path from its source port to its target port. The adapter reads this path as horizontal and vertical runs. The first run is at the exact source port y and the last run at the exact target port y. The other coordinates are rounded to 0.5 px. Then:
  - A wire with no bend gets no routing.
  - A wire with two bends gets `routing.midpointOffset`. The user can drag its vertical segment as before.
  - A wire with more bends gets `routing.waypoints`: the bend points only, without the end points.
- **Idempotence.** The ELK graph does not use the block positions. A second layout of a laid-out sheet changes no block and no wire. The tests check this on the full FPV vehicle.
- **Subsystem resizing.** Phase 1 rejected a resize with the ELK engine. Since Phase 2, `tuneModelLayout()` fits the subsystem sizes with the classic engine (`computeAutoLayout()` with `resizeBlocks`), then runs ELK on the resized blocks. `computeElkLayout()` itself does not resize.

## Notes on the score

- **Nets.** The score measures crossings and overlaps on the union of the segments of each net. A hyperedge trunk that several wires of one net share is one drawn shape, so ELK's shared trunks do not increase the crossings.
- **Bends.** The score counts bends for each wire. A trunk that several wires share is counted for each wire. To find if this is unfair to ELK, the distinct corners of each net were counted also: classic 2992, ELK 3199. The ratio (ELK 7 % more) is almost the same as for `bends` (ELK 4.5 % more). Thus the bend count does not change the conclusion.
- **Wires through their own block.** The score also counts `throughOwnBlock`: a wire that goes through its own source or target block. On the FPV vehicle this is 195 for the classic engine and 0 for ELK. It is not a hard metric.
- **What the score does not measure.** The score does not include the block names above blocks, the port names, or the wire labels. It does not measure how well the order reads (for example, controller before plant). Phase 3 is for that.

## Notes for Phase 2

Phase 2 removes the satellite blocks (Sheet Label blocks, constants, terminators, displays) from the graph and places them after the layout. For the ELK adapter:

- Remove the satellites before `buildElkGraph()`. Then the routes in the result do not include their wires.
- The adapter has three parts that a later phase can use separately: `buildElkGraph()` (sheet to ELK graph), the ELK run, and `elkResultToLayout()` (ELK result to block moves and wire routes). Put the satellite placement after `elkResultToLayout()`.
- A satellite that is placed after the layout can sit on an ELK route of another net. Score the result again and check `throughBlock` after the placement.
- To reserve space beside a host block, the node must be larger than `measure()` gives, but the ports must stay where the editor draws them. These ways were not tested:
  - A wider or taller node, with the FIXED_POS ports still at the true block edge, inside the node. ELK can reject a port that is not on the node border.
  - The true node size with `elk.margins` on the node. ELK can calculate the margins again from the ports and labels.
  - A dummy node for each group of satellites, with an edge to the host port.
  Use the score and `diagonalSegments` to compare them.
- After the layout, the satellite wires are straight only if the satellite is on the port's row. The rounding of block positions to whole px can move a port by up to 0.5 px. The score treats a jog of less than 1 px as straight.
- The adapter gives two-bend wires as `midpointOffset` and other wires as `waypoints`. A satellite wire that is straight needs no routing.
- The signal-flow order puts sources (Sheet Label Sources, constants) at the start of the order. If the satellites are removed, this order changes, which can change the feedback wires that ELK selects. Run the comparison again.
- Each satellite block in the graph is a node with one edge, and NETWORK_SIMPLEX layering puts it in a layer next to its host. How much this adds to the size of GpsRescue was not measured.

## Wire waypoints and block moves

Waypoints are absolute positions. Before Phase 1, the editor did not change them when a block moved, so the end segments became diagonal. Now, when the user ends a block move or a resize, `repairWiresAfterBlockChange()` (`src/lib/layout/waypointRepair.ts`) does these steps for each wire with waypoints of a changed block:

1. If both ends moved by the same distance (for example, a selection that includes both blocks), it moves all waypoints by that distance.
2. Otherwise, it moves the first (or last) waypoint to the new port y. The next waypoint has the same x, so the end segment stays horizontal.
3. It removes the routing if the wire is not orthogonal after this, if an end segment changes direction, or if the wire now goes through a block that it did not go through before. The editor then draws its default three-segment shape.

The repair uses the block geometry of `blockGeometry.ts`. It looks only at the wires of the changed blocks. A block that moves onto a wire of other blocks does not change that wire.

## Limits

- The reference models are the only test data. They have many feedback loops through `unit_delay` blocks (GpsRescue has 42). A model with a different structure can give a different result.
- The run time is from one computer.
- The editor was not run in a browser for this comparison. `next build` compiles the page, and the tests check the geometry that the editor and the PDF draw.

## Phase 2 results

Phase 2 of the plan adds satellite blocks (`src/lib/layout/satellites.ts`), a grid for pass-through sheets, a post-compaction, and subsystem resizing for the ELK engine. ELK is now the default engine of the dialog, of `tuneModelLayout()` and of `obliq:layout`. `tuneModelLayoutSync()` (the reference model builder) always uses the classic engine.

### Before and after

FPV vehicle, ELK engine, default options (no resize). Phase 1 is the chosen option set of this document. The score now also has `blockOverlaps` (BlkOvl), the number of block pairs that overlap. It is a hard metric. It is 0 for both engines on all sheets.

| Sheet | Phase | Thru | Ovlp | BlkOvl | Cross | Bends | Strt | Width | Height |
|---|---|---|---|---|---|---|---|---|---|
| Main | 1 | 0 | 0 | 0 | 150 | 192 | 13 | 2008 | 3120 |
| | 2 | 0 | 0 | 0 | 102 | 266 | 10 | 2872 | 2149 |
| Telemetry | 1 | 0 | 0 | 0 | 0 | 0 | 41 | 1320 | 820 |
| | 2 | 0 | 0 | 0 | 0 | 0 | 41 | 1406 | 1064 |
| FlightController | 1 | 0 | 0 | 0 | 614 | 336 | 19 | 4421 | 3238 |
| | 2 | 0 | 0 | 0 | 613 | 336 | 19 | 3793 | 3238 |
| GpsRescue | 1 | 0 | 0 | 0 | 1536 | 908 | 61 | 9244 | 6280 |
| | 2 | 0 | 0 | 0 | 1532 | 908 | 61 | 8510 | 6280 |
| PositionControl | 1 | 0 | 0 | 0 | 686 | 470 | 40 | 5455 | 3777 |
| | 2 | 0 | 0 | 0 | 686 | 470 | 40 | 5191 | 3777 |
| **All 29 sheets** | 1 | **0** | **0** | **0** | **3622** | **3458** | **568** | Area 145.9 Mpx | Length 1827113 |
| | 2 | **0** | **0** | **0** | **3552** | **3546** | **559** | Area 135.2 Mpx | Length 1557902 |

- No sheet has more crossings than in Phase 1. Nine sheets have fewer.
- The classic engine is unchanged: 120.9 Mpx, 5425 crossings.
- The bends increase on Main (+74), because the wires to the Sheet Labels of FlightController and Sensors turn one time (see [Satellites](#satellites)).
- With **Resize Subsystems**, the totals are 3557 crossings and 136.4 Mpx. Main is 2600 × 2066 px.
- `obliq:layout --report` takes 3.1 s for the FPV vehicle (Phase 1: 2.4 s). The increase comes from the second layouts that are described in [Satellites](#satellites) and [Sheet area](#sheet-area-and-height).
- The other two reference models have the same crossings as in Phase 1 (0, and 1 on the acro-rate-step Tests sheet), with no fault.

### Satellites

A satellite is a block of a satellite type with exactly one wire, on a data port: `sheet_label_sink`, `sheet_label_source`, `source`, `clock`, `data_store_read`, `data_store_write`, `no_connection`, `signal_display` and `signal_logger`. These blocks stay in the ELK graph:

- a pair of two candidates (for example, a Sheet Label Source that feeds a display);
- a candidate on an enable or reset wire;
- a second candidate on a host output port that already has a satellite.

On the FPV vehicle, 106 blocks are satellites (82 Sheet Labels, 24 constants). No candidate is kept for the three reasons above.

| Result | Count |
|---|---|
| Beside the host, straight wire | 57 |
| Beside the host, wire with one turn | 38 |
| In the ELK graph (the sheet's fallback: see below) | 11 (constants on AttitudeEstimator, RatePID, Mixer) |
| Shared nets (the host port also feeds other blocks): beside the host | 16 (2 straight, 14 with one turn) |

How the space is reserved. Three ways were tested on a small graph with `FIXED_POS` ports and orthogonal routing:

- `elk.margins` on the node: ELK ignores it. It calculates the margins again, and the next layer stays at the normal distance.
- A wider node with the ports at the true block edge, inside the node: ELK moves each port to the node border. The edges then start at the border.
- A wider node with the ports on the border of the reserved space: this works. It is the method that the adapter uses. The adapter adds the part of each wire inside the node (the "lane") itself. ELK does not route other wires through a node, so no other wire goes through the reserved space.

A dummy node for each group was not used: ELK can put other nodes in the same layer between the host and the dummy node, and it does not keep the dummy node on the host's rows.

The arrangement of one host side (`arrangeSide()`):

- Each satellite goes on the row of its host port when the separations permit. The rows are a least-squares fit to the port rows, in port order, with the separations below. Wires of host ports that have ELK edges ("through lanes") have a high weight, so they stay straight and the satellites move.
- Separations: 8 px between two satellites in one sub-column, name labels included. 6 px between a wire and a nearer satellite that it goes past, or that satellite's name label (12 px high, above the block).
- The layout tries 1 to 6 sub-columns, in two directions, with the shared branches below or above their satellite. It keeps the pattern with the least cost: reservation width plus height, plus 80 px for each satellite wire with a turn and 400 px for each through wire with a turn.
- A wire that cannot be straight turns one time in a channel next to the host (a fan-out). A wire that goes up turns nearer to the host than the wires below it; a wire that goes down turns nearer than the wires above it. Thus these wires do not cross.
- When the host shows its port names outside the block (`showPortNames`), the fan-out and the sub-columns start after the widest port name of that side, so that no turn goes through the names.
- A shared net: the satellite stays on the row of the port. The branch to the other blocks leaves the satellite's wire at a junction 10 px in front of the satellite's sub-column, goes past the satellite (6 px clearance), and ends at the node border.

Why 38 satellite wires turn. With 64 px Sheet Labels and visible names, two adjacent satellites need about 38 px between their rows when the lower one is farther from the host, and 50 px when the upper one is farther. Thus straight wires for each port need a port pitch of about 50 px. The hosts on Main have these pitches: FlightController 7.8 px (22 outputs on a 180 px block that the model builder sized), Sensors 16.7 px, Battery 20 px and Frame 37.1 px. On these hosts, no arrangement can give straight wires: a satellite box (76 px with its name) covers the rows of the adjacent ports. With **Resize Subsystems** (maximum port spacing 40 px), FlightController is 920 px high and Sensors is 360 px high (pitch 40 px). This is still less than 50 px, so most of these wires still turn. A maximum port spacing of 50 px gives the necessary pitch.

Constants. When a sheet has satellites that are not Sheet Labels, ELK lays out a graph without them. On three sheets, this gave more crossings (AttitudeEstimator 87 to 101, RatePID 12 to 15, Mixer 10 to 11). The ELK route of other nets changed: the constant wires themselves have no crossing. Thus `computeElkLayout()` also lays out such a sheet with Sheet Label satellites only, and keeps the result with fewer crossings. On Frame and on the sheets without such a choice, the constants stay satellites. On Frame this removes 9 crossings. The rule for a tie in crossings changed in Phase 6 (see [Tie rule of the satellite candidates](#tie-rule-of-the-satellite-candidates)). Since then, the constants of IMU and Magnetometer are also in the ELK graph.

### Pass-through sheets

A sheet that has only small parts (each part has at most 3 ELK nodes) becomes a grid: the parts are in the order of the block list, from top to bottom and then the next column. The number of columns gives the width over height that is nearest to 1.4 (landscape page). In each column, the left edges of the host blocks align, and all rows have the same height. Telemetry is 1406 × 1064 px: 4 columns of 11 rows, each wire straight. A sheet with a larger part keeps the packing of ELK. The aspect ratio is an option of `computeElkLayout()` only. It is not in the dialog or the command line.

### Sheet area and height

GpsRescue has no satellites, so its height does not come from Sheet Labels. Each layer of GpsRescue has about 20 blocks and the dummy nodes of the long wires and feedback wires. The table gives the totals for the FPV vehicle with satellites, for each option that was tried, and the size of GpsRescue.

| Option | Cross | Bends | Strt | Area (Mpx) | GpsRescue (px) | Note |
|---|---|---|---|---|---|---|
| Satellites, Phase 1 options | 3565 | 3560 | 557 | 147.1 | 9244 × 6280 | |
| `nodePlacement.bk.edgeStraightening` NONE | 3569 | 3618 | 549 | 146.7 | 9244 × 6280 | |
| **`compaction.postCompaction.strategy` EDGE_LENGTH** | **3552** | **3556** | **557** | **134.3** | **8510 × 6280** | 1 overlap (AngleMode). Kept, with a fallback. |
| `spacing.edgeEdge` 6, `edgeEdgeBetweenLayers` 6 | 3566 | 3548 | 558 | 138.9 | 8732 × 6170 | |
| `spacing.edgeNode` 6, `edgeNodeBetweenLayers` 6 | 3574 | 3554 | 559 | 138.4 | 9064 × 5966 | Wires 6 px from blocks |
| BK `fixedAlignment` BALANCED | 3547 | 4318 | 334 | 151.9 | 9244 × 6442 | |
| `layering.strategy` MIN_WIDTH | 5095 | 3826 | 513 | 218.8 | 14546 × 7087 | |
| `layering.strategy` STRETCH_WIDTH | 5033 | 3810 | 517 | 277.5 | 19062 × 7192 | |
| `layering.strategy` COFFMAN_GRAHAM, layer bound 8 | 4255 | 3870 | 513 | 197.3 | 12977 × 6724 | |
| `layering.strategy` LONGEST_PATH_SOURCE | 4353 | 3654 | 546 | 149.2 | 9294 × 6782 | |
| `layering.nodePromotion` DUMMYNODE_PERCENTAGE or NIKOLOV | 3565 | 3560 | 557 | 147.1 | 9244 × 6280 | No change |
| `mergeEdges` true | 3565 | 3560 | 557 | 147.1 | 9244 × 6280 | No change |
| `nodePlacement.strategy` NETWORK_SIMPLEX | 3601 | 4596 | 350 | 88.4 | 9494 × 2850 | 1 overlap. GpsRescue: 1256 bends (BK: 908), 18 straight (BK: 61) |
| `nodePlacement.strategy` LINEAR_SEGMENTS | 3580 | 4514 | 281 | 121.9 | 9344 × 5486 | |

Decision: the adapter default now has post-compaction EDGE_LENGTH. When it makes a hard fault (an overlap, a wire through a block, or a block overlap) on a sheet, `computeElkLayout()` lays out that sheet again without it. This applies to AngleMode only. No sheet has more crossings with it.

Only NETWORK_SIMPLEX node placement makes GpsRescue much lower (2850 px). It has 30 % more bends and 37 % fewer straight wires in total, and more crossings on FlightController (614 to 626) and PositionControl (686 to 692). Goal 4 asks for fewer turns, so it is not used. The total area (135.2 Mpx) is less than in Phase 1 (145.9 Mpx), but more than the classic engine (120.9 Mpx). The classic engine is smaller because its wires go through blocks and need no tracks.

### Sheet Label height

A Sheet Label block is 64 px high (`MIN_HEIGHT`). At 45 px (`TERMINATOR_HEIGHT`), with all other Phase 2 options, Main is 2445 × 1824 px (now 2872 × 2149 px), and the total area is 133.2 Mpx. The classic engine changes on Main (overlaps 11 to 10). The height was not changed, for these reasons:

- A saved model keeps the top edge of each label. At 45 px, the port of each label moves up by 9.5 px. Each straight wire into a label then gets a jog, and each waypoint route gets a diagonal end, until the next layout.
- The canvas draws an arrow (28 px line) and the signal name (16 px line) inside the label: 46 px. This does not fit in 45 px with the border. The purple signal name below the block name also overlaps the top of the block.
- Main is already less than the 2400 px target without the change.

To make the change later, change `getIntrinsicBlockHeight()` in `blockGeometry.ts`, make the label content in `BlockNode.tsx` smaller, and lay out the shipped models again in the same release.

### Notes for Phase 3

- `signalFlowOrder()` gets all blocks, satellites included. The adapter removes the satellites from the order after that. Thus the satellites do not change the feedback wires that ELK selects. A Phase 3 order that comes from `subsystemFunction` can replace `signalFlowOrder()` in `buildElkGraph()` the same way.
- A host with satellites is one larger ELK node. Its `NodeGeometry` (in `ElkConversion.nodes`) gives the position of the block inside the node. A row constraint for return-path blocks must use the node, not the block.
- `computeElkLayout()` can run ELK two or three times for one sheet (fallbacks). A new option that changes the graph must keep each run deterministic, so that a second layout changes nothing.
- ELK does not know the port names that a subsystem draws outside the block (`showPortNames`). An ELK wire can turn through these names, for example at the inputs of FlightController on Main. The satellite arrangement keeps clear of them. A later phase can reserve this space for all blocks with the same lane method (a node that is wider by the name width, with straight lanes).
- The FlightController block of the FPV vehicle is 180 px high with 22 outputs. Its Sheet Labels cannot have straight wires at this size. Phase 6 lays out the shipped models again: with **Resize Subsystems** and a maximum port spacing of 50 px, or with a builder height of at least 23 × 50 px, these wires can become straight.


## Phase 3 results

Phase 3 of the plan adds the `subsystemFunction` parameter, the rules that suggest it (`src/lib/layout/subsystemRole.ts`), the role-driven signal-flow order, a minimum subsystem height and a clearance for port names. All four apply to the ELK engine only. The classic engine is unchanged (5425 crossings, 120.9 Mpx).

### Subsystem function

The parameter has these values: `controller`, `actuator`, `plant`, `sensor`, `compensator` and `other`. No value means "not set". The schema (`modelSchema.ts`) and the Model Builder validator (`blockParameterValidator.ts`) accept it. Code generation does not read it: `obliq:cgen` gives the same C files for the FPV vehicle with and without the parameter on the Main subsystems.

The rules give a score to each function. The suggestion is the function with the largest score. Its confidence is 1 − exp(−(largest score − second score)). The layout uses a suggestion at a confidence of 0.6 or more. A value that the user sets always replaces the suggestion.

| Rule | Function | Weight | Applies when |
|---|---|---|---|
| Name keyword | each | 3 (1.5 when not in the head noun) | A word of the name is a keyword of the function. The head noun is the last word of three letters or more. |
| Continuous states | plant | 1.5 | The content has an integrator or a transfer function. |
| Three or more continuous states | plant | 1.5 | |
| One lag | actuator | 0.5 | The content has exactly one continuous state. |
| Rigid-body or environment blocks | plant | 1 | `body2quaternion_rates`, `inertia_diag_pack`, `atmosphere` or `cross`. |
| Lookup table | plant | 0.5 | |
| Noise | sensor | 1.5 | `random_noise` |
| Quantiser | sensor | 1 | `quantizer` |
| Noise and delay | sensor | 0.5 | Noise and a `unit_delay` or `variable_transport_delay`. The model has no sample-and-hold block. |
| Discrete filters | compensator | 1.5 | 25 % or more of the content is `notch_filter`, `discrete_transform` or `spectrum_peaks`. |
| Error and saturation | controller | 1 | A `sum` with a `-` sign, and a `limit`, `saturation_dynamic` or `rate_limiter`. |
| PID-like structure | controller | 1 | An error sum, an integrating or filter element, and a gain. |
| Own sample time | controller | 0.75 | The subsystem has `sampleTimeSec`. |
| Logic | other | 1 | 30 % or more of the content is `if`, `condition`, `edge_detect` or `relay`. |
| No inputs, or no outputs | other | 3 | |
| After a controller, before a plant | actuator | 1.5 | From the functions of the neighbour subsystems (first pass) on the parent sheet. |
| After an actuator | plant | 1 | |
| After a plant, before a controller | sensor | 1.5 | |
| Before an actuator, after a sensor or a plant | controller | 1 | |

The content is all blocks of the subsystem's sheets, with nested subsystems, without ports, Sheet Labels, muxes and demuxes. The content of a subsystem reference comes from its definition. A model reference has no content in the model, so only the name and the position apply.

Results on the reference models (no model sets the parameter):

| Model | Sheet | Subsystem | Suggestion | Confidence | Used |
|---|---|---|---|---|---|
| FPV vehicle | Main | FlightController | controller | 0.99 | yes |
| | Main | Motor_RR, Motor_FR, Motor_RL, Motor_FL | actuator | 0.97 | yes |
| | Main | Battery | plant | 1.00 | yes |
| | Main | Frame | plant | 1.00 | yes |
| | Main | Sensors | sensor | 0.98 | yes |
| | FlightController | AngleMode, AltHold, PosHold, GpsRescue, RatePID | controller | 0.90 to 0.99 | yes |
| | FlightController | AttitudeEstimator, AltitudeEstimator, GyroFilters | compensator | 0.86 to 0.95 | yes |
| | FlightController | Failsafe, Rates, Arming, Mixer, Home | none | 0 | no |
| | GyroFilters | RpmFilter, DynamicNotch | compensator | 0.99 | yes |
| | PosHold | PositionControl | controller | 0.98 | yes |
| | Home | HomeVector | controller | 0.53 | no |
| | Sensors | IMU, ImuFrontEnd, Magnetometer, Barometer, GNSS | sensor | 0.78 to 0.99 | yes |
| demo flight, acro rate step | Main | Pilot | other | 0.92 | yes |
| | Main | Vehicle | plant | 0.95 | yes |
| | Main | Conditions | other | 1.00 | yes |

Battery is a plant: it is a physical model with continuous state (charge) that the actuators load, and the controller does not command it. As `other`, the layout is almost the same, because Battery is then a block of the actuator side loop after the motors.

### Role-driven order

`signalFlowAnalysis()` in `autoLayout.ts` replaces `signalFlowOrder()` as the source of the ELK model order. It applies only to a loop (strongly connected component) that has subsystems with two or more stages: controller 1, actuator 2, plant 3, sensor and compensator 4. In such a loop, the stage of a block comes before the breadth-first position when the feedback wires are selected. A block without a function gets a stage from the nearest functions before and after it:

- When a stage after it is larger than the largest stage before it, it is on the forward path between the two.
- When it goes back from a plant, a sensor or a compensator, it is on the return path, unless it is a `sum` block or after one. A summing junction belongs to the controller side.
- Otherwise (for example, the side loop of the battery), it is just after the stage before it.

A sheet without such a loop gets the same order as before. Only Main changes on the FPV vehicle. The adapter result has `returnPath`, the return-path blocks, in block-list order. `tuneModelLayout()` gives them for each sheet. On Main this is `Sensors`. The layout places these blocks as ordinary nodes, to the right of the plant.

Main, from left to right:

| Phase | Order |
|---|---|
| 2 | Frame; FlightController and Sensors; MotorCmdSplit; motors; muxes; Battery |
| 3 | FlightController; MotorCmdSplit; motors; muxes; Frame and Battery; Sensors |

The crossings on Main decrease from 102 to 86, and the sheet is 1821 px high (2149 px before). The wires from Sensors to FlightController are long feedback wires around the sheet. Phase 4 puts Sensors on a return row below the forward path. The input ports `wind_ned`, `grid_convergence_deg`, `gnss_env` and `failsafe_procedure` stay in the first layer, so their wires to Frame and Sensors are long.

### Minimum subsystem height

With the ELK clean-up, a subsystem whose stored height is less than its natural height (`getIntrinsicBlockHeight()`) grows to its natural height. The width does not change. This never makes a block smaller. The resize is in the summary. With **Resize Subsystems**, the classic fit starts from the grown sizes. On the FPV vehicle, 6 blocks grow: FlightController (180 to 460 px), the four motors (80 to 100 px) and Sensors (150 to 180 px).

Effect on the satellites of Main: 4 of 41 satellite wires are straight, before and after. FlightController now has a port pitch of 20 px (7.8 px before), so its port names do not overlap and each label wire turns in a short fan-out. A straight wire for each Sheet Label needs about 38 px to 50 px (see [Satellites](#satellites)). With **Resize Subsystems** and a maximum port spacing of 50 px, all 41 satellite wires of Main are straight.

### Port-name clearance

The adapter now reserves the space of the port names (`showPortNames`) on each side of a block, with the lane method of the satellites: the node is wider by the widest name of the side, and each wire crosses the reservation in a straight lane. A side with satellites already started its fan-out after the names. ELK keeps 10 px between a node border and a bend, so the border is 10 px nearer than the end of the names plus 4 px.

On the FPV vehicle, 277 wire ends have a turning wire next to port names. Without the clearance, the first or the last bend of 168 of them is inside the names (Main 33, FlightController 108, Sensors 12). With the clearance, 0. The cost is width: the FlightController sheet is 4972 px wide (3793 px before), and Sensors 863 px (603 px before).

### Before and after

FPV vehicle, ELK engine, default options. Only the sheets that change are in the table.

| Sheet | Phase | Thru | Ovlp | BlkOvl | Cross | Bends | Strt | Width | Height | Cause |
|---|---|---|---|---|---|---|---|---|---|---|
| Main | 2 | 0 | 0 | 0 | 102 | 266 | 10 | 2872 | 2149 | |
| | 3 | 0 | 0 | 0 | 86 | 262 | 11 | 3226 | 1821 | Order, height, names |
| FlightController | 2 | 0 | 0 | 0 | 613 | 336 | 19 | 3793 | 3238 | |
| | 3 | 0 | 0 | 0 | 616 | 336 | 19 | 4972 | 3238 | Names |
| GyroFilters | 2 | 0 | 0 | 0 | 0 | 2 | 6 | 963 | 120 | |
| | 3 | 0 | 0 | 0 | 0 | 2 | 6 | 1261 | 120 | Names |
| Home | 2 | 0 | 0 | 0 | 6 | 42 | 11 | 1428 | 522 | |
| | 3 | 0 | 0 | 0 | 6 | 42 | 11 | 1567 | 522 | Names |
| Sensors | 2 | 0 | 0 | 0 | 0 | 22 | 9 | 603 | 592 | |
| | 3 | 0 | 0 | 0 | 1 | 22 | 9 | 863 | 592 | Names |
| **All 29 sheets** | 2 | **0** | **0** | **0** | **3552** | **3546** | **559** | Area 135.2 Mpx | Length 1557902 | |
| | 3 | **0** | **0** | **0** | **3540** | **3542** | **560** | Area 139.0 Mpx | Length 1609844 | |

Each change alone, totals for the 29 sheets:

| Change | Cross | Bends | Strt | Area (Mpx) |
|---|---|---|---|---|
| Phase 2 | 3552 | 3546 | 559 | 135.2 |
| Minimum height only | 3552 | 3550 | 560 | 135.2 |
| Minimum height and order | 3536 | 3542 | 560 | 134.3 |
| Minimum height and port names | 3556 | 3550 | 560 | 139.9 |
| All (default) | 3540 | 3542 | 560 | 139.0 |
| All, with **Resize Subsystems** | 3546 | 3532 | 562 | 141.2 |

- The hard faults stay 0 on every sheet, also with **Resize Subsystems** and with `--no-roles`.
- The new crossing on Sensors: a wider ImuFrontEnd node moved a branch of `grid_convergence_deg` across the `quat` wire.
- The other two reference models change only in width: their Main sheets show port names (demo flight 726 to 922 px, acro rate step 515 to 738 px). Their crossings do not change.
- `obliq:layout --report` takes 3.2 s for the FPV vehicle (3.0 s before).

### Notes for Phase 4

- `AutoLayoutResult.returnPath` (ELK engine) and `TuneLayoutResult.returnPath` (by sheet id) give the blocks to mirror. `signalFlowAnalysis()` also gives `feedbackWires`.
- A return row: each return-path block can be an ELK node with inverted port sides (inputs EAST, outputs WEST). The node of a host with satellites or port names has its reservation on the side where the ports are; `arrangeSide()` and the lane paths (`ux()` in `elkLayout.ts`) assume that the east side holds the outputs. A mirrored node needs the reservation on the other side. For the row itself, ELK Layered has no row constraint. Options: lay out the return path as a second graph and place it below, or use `elk.layered.layering.layerConstraint` and `elk.position` hints with interactive ordering.
- These places assume inputs on the left and outputs on the right: `portOffsetY()` and `HANDLE_OUTSET` users in `blockGeometry.ts`; `sourceEnd()` and `targetEnd()` in `elkLayout.ts` and `blockWireGeometry()` in `layoutMetrics.ts`; the WEST and EAST port sides in `buildElkGraph()`; `portLabelWidth()` and the side of a satellite in `satellites.ts`; the handles and the port-name labels in `BlockNode.tsx`; the port and label drawing in `pdfRenderer.ts`; and the default wire path in `CustomEdge.tsx` and `wireRoutingUtils.ts`.

## Phase 4 results

Phase 4 of the plan adds mirrored blocks and the return row. The new code is in `src/lib/layout/blockGeometry.ts` (port sides and the default wire path) and `src/lib/layout/returnRow.ts` (the return row). The classic engine does not place a return row.

### Flipped blocks

- A block with `parameters.flipped: true` has its inputs on the right edge and its outputs on the left edge. The y of each port does not change. Enable and reset ports stay at the top and the bottom. Text and icons do not change. The terminator of an Input Port or Output Port and the symbol of a Sheet Label are symmetrical, so they also do not change.
- `dataPortGeometry()` in `blockGeometry.ts` gives the side, the direction and the position of each data port. The canvas (`BlockNode.tsx`, `CustomEdge.tsx`), the PDF export (`pdfRenderer.ts`), the score (`layoutMetrics.ts`), the waypoint repair, both layout engines and the satellites use it.
- `defaultWirePath()` gives the path of a wire without waypoints, for all port sides. Ports that face each other keep the three-segment step of earlier versions and its `midpointOffset`. Ports that face the same way get a step past the outer port. A target behind its source gets five segments: a stub out of each port and a run between, above or below the blocks. A backward wire with the usual sides and a stored `midpointOffset` (the classic engine writes one for each feedback wire) keeps the earlier step, so that the classic layouts and the shipped models do not change.
- The PDF export now includes the wires in the sheet bounds. Before, a wire outside the blocks could go into the page margin.
- `obliq:cgen` gives the same C files for the FPV vehicle with `flipped: true` on one third of all blocks (380 of 1138), and for the laid-out model with the return row. Only the time stamps and the source path in the manifest are different.

### New hard metric

`portDirection` in `layoutMetrics.ts` counts the wires whose first segment goes back from the source port, or whose last segment comes into the target port from behind. Such a wire goes back through its own block. `diagonalSegments` and `portDirection` are now in `HARD_METRICS`, so the golden test checks them. All 29 FPV sheets have 0 for both with the ELK engine. The classic engine has 197 (the feedback wires of its earlier shape, which go back through their source block). The `Back` value now counts a wire as backward against the direction of its source port, so a wire on the mirrored row is not backward.

### Return row: method

ELK Layered has no row constraint. These methods were tried on FPV Main:

| Method | Result |
|---|---|
| One graph. Return blocks with inverted port sides (inputs EAST, outputs WEST), with their edges reversed and moved in the model order next to the controller | Sensors goes into its own layer between FlightController and the motors, but at the top of that layer. The sheet is wider by the width of Sensors (654 px). |
| The same, with `elk.layered.crossingMinimization.positionChoiceConstraint`, `inLayerSuccOf` or `semiInteractive` on the return block or on connector nodes | No effect on the order in the layer, in `elkjs` 0.12.1. |
| Two graphs (selected) | See below. |

The selected method (`returnRow.ts`) lays out two graphs with the adapter of the earlier phases:

1. The forward graph F has all blocks that are not on the row. A net from F to the row ends at a connector node (12 × 20 px, not a block). A net from the row to F starts at a connector node. First, the connectors have no layer constraint, so ELK puts each connector next to its block. The wire then turns down to the channel in the column of the connector. When a block or a vertical wire of another net is below a connector, that connector gets the layer constraint LAST (or FIRST) and a lane in the right (or left) margin of F, and F is laid out again.
2. The row graph R has the return blocks and their satellites, unflipped, with connectors FIRST (from F) and LAST (to F). The adapter lays it out from left to right, then the result is mirrored (x → −x). The blocks of R are then flipped blocks, and their satellites and port-name reservations are on the correct sides.
3. R goes below F, with a channel between them. Its centre is between the left edge of the controller and the right edge of the plant. Each net between F and R has its own track in the channel and its own lane beside R. The track and lane order is the one with the fewest crossings among the connecting wires (eight orders are tried).
4. The layout scores the result. When a hard metric (`throughBlock`, `overlaps`, `blockOverlaps`, `diagonalSegments`, `portDirection`) is not 0, it uses the layout without the row (all blocks unflipped).

The row holds the return-path blocks that a plant feeds, directly or through other return-path blocks, with their satellites, and the blocks with no input wire that feed only the row (on Main: the Input Port `gnss_env`). `signalFlowAnalysis()` is the same as in Phase 3. The extra rule about the plant is for the FlightController sheet: there, AttitudeEstimator, AltitudeEstimator, YawEstimate and HeadingTrue are on the return path of a loop through the mode logic (Arming, the GPS Rescue tasks), but no plant feeds them. A return row for them gave 10 wires through blocks and 11 overlaps, and it would read wrongly: their inputs are the sensor signals from the Input Ports at the left of the sheet.

### Before and after

FPV vehicle, ELK engine, default options. Only Main changes. The other two reference models do not change (no return path with a plant).

Main, top left corner of the main blocks (px):

| Block | Phase 3 | Phase 4 |
|---|---|---|
| FlightController | (480, 389) | (460, −584) |
| MotorCmdSplit | (1204, −459) | (1184, 454) |
| Motor_RR | (1432, −473) | (1362, 340) |
| Frame | (2031, 494) | (1971, 345) |
| Battery | (2039, −3) | (1857, 785) |
| Sensors | (2714, 387) | (1304, 1329), flipped |
| gnss_env | (196, 1228) | (1614, 1519), flipped |

| Sheet | Phase | Thru | Ovlp | BlkOvl | Diag | PortDir | Cross | Bends | Strt | Back | Length | Width | Height |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Main | 3 | 0 | 0 | 0 | 0 | 0 | 86 | 262 | 11 | 12 | 88858 | 3226 | 1821 |
| | 4 | 0 | 0 | 0 | 0 | 0 | 84 | 302 | 10 | 11 | 78191 | 2570 | 2514 |
| **All 29 sheets** | 3 | **0** | **0** | **0** | **0** | **0** | **3540** | **3542** | **560** | | **1609844** | Area 139.0 Mpx | |
| | 4 | **0** | **0** | **0** | **0** | **0** | **3538** | **3582** | **559** | | **1599177** | Area 139.5 Mpx | |

- The wire length on Main is 12 % less, and the length of backward wires is 48 % less (26129 px against 50058 px). The eight feedback wires from Sensors do not go around the whole sheet.
- Crossings on Main: 84 against 86.
- Bends on Main: 40 more. Each wire between the rows has four or five bends (down, along the channel, into the row).
- Main is narrower (2570 px against 3226 px) and taller (2514 px against 1821 px): the row is below the forward path. The area is 6.5 Mpx against 5.9 Mpx. The Phase 2 target (Main less than 2400 px high) is for the layout without the row (`--no-mirror`, 1821 px).
- 10 blocks are flipped: Sensors, its eight Sheet Label Sinks and `gnss_env`.
- `obliq:layout --report` takes 3.2 s for the FPV vehicle (3.1 s with `--no-mirror`).
- A second layout changes nothing (`blocksMoved`, `wiresRouted` and `blocksFlipped` are 0).
- With `--no-mirror`, the result is the Phase 3 result: 3540 crossings, Main 3226 × 1821 px.

### Shipped models with the new default wire path

The shipped models were laid out with the classic engine. Their feedback wires have a stored turn position and keep their shape. A backward wire without a turn position now goes around its blocks. On the stored FPV vehicle ("before" in `--report`), this changes the 29-sheet totals from 529 to 528 wires through blocks, 277 to 269 overlaps and 5425 to 5442 crossings. Phase 6 lays out the shipped models again.

### Notes for Phases 5 and 6

- Sheet Label pairs (Phase 5): the return row is a separate graph. A label pair that goes between the forward path and the row is two satellites, one in each graph, and it adds no wire between the rows. A wire that replaces such a pair becomes a connecting wire in the channel. Count the crossings of the whole sheet, not of one graph, when you compare.
- The connector nodes are not blocks. They only reserve space. A Phase 5 edit that adds or removes a wire between the forward path and the row changes the connectors, so lay out the sheet again after the edit.
- Hop marks and junction dots (Phase 6): the wires between the rows share no segment with other nets, but the wires of one net from a connector to its targets in R (or from F to a connector) branch inside R and F as before. The connecting wires cross the vertical wires of F where a connector column goes down.
- When the shipped models are laid out again (Phase 6), Sensors on the FPV vehicle Main gets `flipped: true`. Older versions of the editor ignore the parameter and draw Sensors unflipped, with the wires of the new layout.

## Phase 5 results

Phase 5 of the plan adds the adjustment **Tidy signal labels** (`tidySignalLabels` in `TuneLayoutOptions`, `--tidy-labels` in `obliq:layout`). It is off by default. The code is in `src/lib/layout/tidyLabels.ts`. `wireDetails()` in `layoutMetrics.ts` gives the length and the crossings of each wire and each net. `layoutSheetElk()` and `laidOutSheetElk()` in `tuneModelLayout.ts` lay out one sheet with the options of the tune.

### Label scope

The tidy must not connect a label to a different signal. These are the rules of the code that resolves the labels:

- `ModelFlattener.resolveSheetLabels()` (`src/lib/codegen/ModelFlattener.ts:1522`): the scope of a label is the subsystem path of its block. All sheets of one subsystem share a scope, and all top-level sheets share the `root` scope. A Sheet Label Source looks for a sink with the same `signalName` in its own scope, then in each parent scope, then in all scopes of the model (a global fallback, line 1629). Two sinks with the same name in one scope give a warning, and the last one is used. A source with no sink gives a warning and has no value.
- `computeCrossingTags()` (`src/lib/codegen/crossingTagPorts.ts:101`): for a segregated subsystem or a model reference, a source outside and a sink inside with the same name become an output port, and the opposite becomes an input port. This test uses only the names.
- `validateSheetLabels()` (`src/lib/sheetLabelUtils.ts:252`): a source with no sink of its name on its sheet or in the subsystems below it is "unmatched". A sink with no source is permitted. The 41 Telemetry sources of the FPV vehicle are "unmatched" for this check, because their sinks are on Main. This is not new.
- Type propagation (`propagateSignalTypesMultiSheet()`) resolves the labels by name over all sheets.

Thus, the tidy makes each new name unique in the whole model, sinks and sources included. It never renames an existing label, and it removes a sink only when no source of that name remains in the model. A host model can read a sink of an embedded model by its name (crossing tags), and the tidy cannot see the hosts.

### Edit rules and defaults

| Kind | Default | Candidate | Kept when |
|---|---|---|---|
| Wire to label pair (B) | on | A wire of at least 800 px with at least 6 crossings, or a backward wire of at least 800 px and at least half of the sheet's width plus height. The 8 best candidates of a sheet, by crossings + 0.002 × length | The sheet's crossings decrease by at least 2 and by at least 3 %, no fault metric increases, and the sheet area increases by 10 % or less |
| Label pair to wire (A) | off | A Sheet Label Source with a sink of its name on the same sheet. Each consumer is ahead of the driver port and at most 400 px (Manhattan distance) from it | The crossings do not increase, no fault metric increases, and each new wire is shorter than a B candidate and crosses no other net |
| Split a source (C) | off | A Sheet Label Source whose consumer ports form two or more groups (single linkage, 400 px) | The crossings do not increase, no fault metric increases, and the wire length decreases by at least 200 px |

The fault metrics are `throughBlock`, `overlaps`, `blockOverlaps`, `diagonalSegments` and `portDirection`. All thresholds are options (`DEFAULT_TIDY_OPTIONS`).

The method for each sheet:

1. Lay out the sheet with the options of the tune and score it.
2. For each kind (A, C, B): find the candidates on the laid-out sheet. Apply all of them and lay out the sheet again. When the score accepts the result, keep it. Else try each candidate alone, in order, and keep each one that the score accepts.
3. Do step 2 again until a round keeps no edit, for 3 rounds at most and 30 trial layouts for each sheet at most.

Because the last round keeps no edit, and the layout does not use the stored positions, a second run makes no edit. The edits do not change the order of the sheets or of the existing blocks. New block and wire ids come from the names and the ids of the replaced wire, so the result is deterministic.

Guards of B (a guarded wire stays drawn):

- `forward-path`: both ends are on a path of data wires from a controller to a plant.
- `role-stage`: both ends are subsystems with an effective function other than Other (the wires between the stages of a loop, the feedback from a sensor).
- `channel`: one end is flipped and the other is not (a wire between the return row and the forward rows).
- `jc_0171`: the wire is the last drawn wire from one subsystem to another.
- `output-port`: the target is an Output Port. A Sheet Label Source that feeds an Output Port is not a candidate for A or C. The Telemetry sheet (41 such sources) does not change.
- `label`: an end is already a Sheet Label.

The new sink goes beside the driver and the new source beside the consumer. The consumer wire keeps the id of the replaced wire. When the net already drives a sink with a unique name on the sheet, B adds only a source of that name.

### Edits on the reference models

`npm run obliq:layout -- <model> --report --tidy-labels`. The FPV demo flight and the FPV acro rate step get no edit: their sheets have no long wire with 6 crossings, and A and C (also when they are on) find no candidate. The FPV vehicle gets 38 edits, all of kind B. 28 edits add a new pair and 10 edits add a source to a sink that an earlier edit added (66 new blocks).

| Sheet | Edits | Crossings | Bends | Wire length (px) | Size (px) |
|---|---|---|---|---|---|
| FlightController | 3 | 616 → 490 | 336 → 434 | 219549 → 216255 | 4972 × 3238 → 5072 × 3352 |
| Failsafe | 1 | 54 → 49 | 106 → 118 | 28190 → 26676 | 1983 × 1403 → 2331 × 1182 |
| GpsRescue | 8 | 1532 → 1364 | 908 → 1030 | 680626 → 708805 | 8510 × 6280 → 9575 × 5966 |
| PosHold | 10 | 93 → 49 | 180 → 202 | 60711 → 39252 | 3406 × 1461 → 3574 × 1190 |
| PositionControl | 9 | 686 → 526 | 470 → 516 | 269921 → 224547 | 5191 × 3777 → 5506 × 3338 |
| Sensors/GNSS | 7 | 130 → 112 | 216 → 282 | 48998 → 49925 | 4379 × 1400 → 5405 × 1192 |
| Main | 0 | 84 → 84 | 302 → 302 | 78191 → 78191 | 2570 × 2514 (no change) |
| **All 29 sheets** | **38** | **3538 → 3017** | **3582 → 3948** | **1599177 → 1556642** | Area 139.5 → 142.5 Mpx |

The "before" values are the layout without the tidy (default options). The hard faults stay 0 on every sheet. No Sheet Label breaks the endpoint rule after the layout (`labelEndpointFaults()`: 0 on all sheets of the three models).

On Main, B finds candidates, but the guards keep them: 37 `role-stage` (Sensors to FlightController and the other stages), 10 `forward-path`, 1 `channel` (`grid_convergence_deg` to Sensors on the return row), 21 `jc_0171`, and 61 `output-port` over all sheets.

### Endpoint rule (Goal 2)

`labelEndpointFaults()` checks each wire of a Sheet Label after the layout: no point of a sink's wire is to the right of the sink's port, and no point of a source's wire is to the left of the source's port (the opposite on a flipped label). The satellites of Phase 2 obey this rule. A label that stays in the ELK graph (a source with two or more consumers, a pair) also obeys it: a source has no input edge, so ELK puts it in an earlier layer than its consumers, and a sink has no output edge. The return row is mirrored, so its labels obey the mirrored rule. The check found 0 faults on the three models, with and without the tidy. The summary and the command line report each fault.

### Behaviour

- The validation and the type propagation of the app give the same errors and warnings before and after (`validateModelDataWithErrors`, `validateMultiSheetTypeCompatibility`, `validateModelTypeCompatibilityMultiSheet`, `propagateSignalTypesMultiSheet`, `validateSheetLabels` on each sheet, `validateBlockParameters`). The counts that are not zero (92 schema errors, 41 unmatched Telemetry sources, 76 parameter errors) are the same before the tidy. Type propagation gives a type to 28 more signals: the new sinks.
- `obliq:cgen` of the tidied FPV vehicle: `fpv.h` is the same. `fpv.c` has the same lines in a different order: two blocks of the Failsafe sheet (`ThrottleLowTimePrev` and `ThrottleLowTime`) move in the output phase and in the update phase, past blocks that do not use them (`Procedure`, `Stage2TimePrev`, `Stage2Time`). Only the time stamps and the source path in the manifest are different otherwise.
- Simulation: the FPV demo flight (10000 steps) and the FPV acro rate step (6000 steps), each built once with the original vehicle and once with the tidied vehicle. After each step, a hash covers the inputs, outputs, signals, states and data stores of the model structure (20628 and 19788 bytes). The hashes are equal, so all signals and states are the same to the bit at each step. All 19 and 6 Asserts pass with the same check counts. The logger buffers after these fields hold heap addresses, so the hash does not include them.
- `__tests__/tidy-labels.test.ts` does the same comparison for the FPV acro rate step, with the tidy of the PosHold sheet (10 edits). The test takes about 3 s.

### Readability

Images (PDF renderer, then `pdftoppm`) are in the Phase 5 scratch folder of the work session: PosHold, PositionControl, FlightController and GNSS, each before and after.

- **PosHold**: easier to read. The long wires of `Entering`, `Requested` and `Run` went across the sheet to the upsample stages and to `ControlOk`. They are now short label pairs. The crossings decrease by 47 % and the wire length by 35 %.
- **PositionControl** and **GpsRescue**: better, but these sheets are still dense. The long feedback wires from the unit delays (`NorthVelocityPrev`, `FailurePrev`) and the wires that fan out from `Update` and `InitGo` are labels now.
- **FlightController**: a small gain. Three wires became labels (`sticks_fs`, `airmode`, `gnss_course_2`). The name `gnss_course_2` shows that the name `gnss_course` is already a label elsewhere in the model.
- **GNSS**: mixed. The hold loop (`HoldSplit` back to `HoldVN`, `HoldVE`, `HoldVD`) is now four label pairs, so the loop is not visible as a drawn loop. The sheet is 23 % wider.
- Each edit adds bends (a short wire at each label): +366 bends in total.

A and C are off by default. They find no candidate on these models (no sheet has a label pair on one sheet, and the consumers of each fanned-out source are less than 400 px apart), so they have not shown that they make a diagram easier to read. Unit tests cover them.

### Run time

The tidy of the FPV vehicle makes 91 trial layouts and takes about 30 s to 33 s. `obliq:layout --report --tidy-labels` takes 37 s (3.2 s without the tidy). Most of the time is on GpsRescue (0.7 s for each layout), PositionControl and FlightController. `maxEvaluationsPerSheet` (30) and `maxRounds` (3) limit the time. The two test models take 0.3 s each. A tidy of one sheet (for example PosHold) takes about 2 s.

### Open issues

- New names come from block names when the driver is not a port or a subsystem output (`InitGo`, `PosSplit_2`). They have no unit suffix, because the tidy does not invent one.
- A host model that embeds the tidied model sees the new sink names (crossing tags). The names are unique in the model, but the tidy cannot check them against the hosts. The two FPV test models do not use these names.
- The run time on large sheets is long for the dialog. The dialog says so in the description of the option.

## Phase 6 results

Phase 6 adds the hop marks and junction dots (`src/lib/wireDecorations.ts`), a fix for small steps in wires, and the new layout of the shipped models.

### Small steps in wires

Some laid-out wires had a visible step of less than 2 px, for example the `cmd` wire from MotorCmdSplit into Motor_FR on Main (0.67 px). A new hard metric, `microJogs` (`Jogs` in the report), counts each wire segment shorter than 2 px with a bend at one or both ends. On the FPV vehicle the ELK layout had 276. The causes, with the jogs that each fix removed. The fixes were added in this order: the groups, the satellite snap, the near pairs, the runs. The other 2 jogs are forced (see below).

| Cause | Jogs removed | Fix |
|---|---|---|
| ELK aligns the ports of a straight wire exactly, but the port rows are fractions of a block height, so the blocks are at fractional y. The adapter rounded each block to whole px on its own. The ports then differ by up to 1 px, the adapter wrote no route (less than 1 px is "straight"), and the editor drew its default step. Telemetry: all 41 wires. | 263 | `alignedRows()` in `elkLayout.ts`: blocks joined by a wire whose ports ELK aligned form a group, and the whole group moves by one amount, which puts its first block at a whole px. Satellites with a straight wire take the exact y of their host port. |
| ELK left a few wires with ports less than 2 px apart. | 2 | The same function joins such a pair (nearest first): the smaller group moves by the distance. |
| A hyperedge trunk that leaves the port 1 px to 2 px off the port row, or an inner run that is that near the end run. | 4 | `orthogonalRoute()` joins a run that is less than 2 px from the run before it, or from the end run. The rule depends on the runs before, so wires of one net keep one trunk. |
| The satellite arrangement put a satellite 1 px off its port row. | 5 | A row less than 2 px from its port row snaps to it (`EPS_STRAIGHT` in `satellites.ts`). The separations keep at least 6 px between rows, so 4 px stay. |

Two wires stay with a step of 1.33 px: two wires between the same demux (20 px output pitch) and evaluate block (21.33 px input pitch), one of them exactly straight (EulerPrevSplit to CogAttitudeFactor, HeldSplit to GroundSpeed). No position of the two blocks makes both straight. The metric does not count such a step (`forcedJogWires()` in `layoutMetrics.ts`). With this rule, the ELK layout has 0 on all 29 sheets of the FPV vehicle and on the other two models. The classic engine has 133 on the HEAD layout input, 136 on the new stored file.

Effect on the 29-sheet totals (ELK, default options):

| Value | Before the fix | After the fix |
|---|---|---|
| `microJogs` | 276 | 0 |
| Crossings | 3538 | 3544 |
| Bends | 3582 | 3574 |
| Straight wires | 559 | 559 |
| Wire length (px) | 1599177 | 1599868 |

The 6 more crossings are not new crossings. Each one is a crossing that a step hid: the bend of the step was exactly on the vertical segment of the other net, so the score did not count a crossing there (a crossing must be more than 0.5 px inside both segments). This was checked for each of them: AttitudeEstimator +2, RatePID +1, Frame +1, GNSS +3. On GpsRescue the crossings go from 1532 to 1530: 2 hidden crossings appear, and 4 crossings that a step counted two times are now counted one time. On Mixer, the two candidate layouts (with all satellites, and with Sheet Label satellites only) now both have 11 crossings. With the tie rule of that time (keep the layout with all satellites), Mixer became 2242 × 306 px (it was 1968 × 288 px), and its wire length 878 px more. With the fixed geometry, the earlier Mixer layout also has 11 crossings. A new tie rule then gave Mixer its earlier layout again (see [Tie rule of the satellite candidates](#tie-rule-of-the-satellite-candidates)). The table above gives the values before the new tie rule.

The golden file has the new values. With `--no-mirror`, the total is 3546 (Phase 3: 3540) for the same reason. This value is for the 3.7.2 file, which has no flipped blocks. `--no-mirror` keeps the stored flags, so on the 3.8.0 file the total is 3553.

### Shipped models

`scripts/build-fpv-reference-model.ts` now lays out the three files in `reference-models/` with `tuneModelLayout()` (ELK, subsystem functions, mirrored return row, minimum subsystem height; not Resize Subsystems, not Tidy signal labels) after it builds them. The builder used the classic engine with the same options before. `SHIPPED_FPV_MODELS()` is now asynchronous. The builders of each model stay synchronous with the classic engine (`tuneModelLayoutSync()`), because the tests build many variants and do not read their layout. `TEST_FPV_MODELS()` is also asynchronous, and it gives the files in `test-models/fpv/` the same final layout pass (`layOutShipped()`). The test `fpv-test-models.test.ts` gets the models from `TEST_FPV_MODELS()`, so it compares the files byte for byte with the same layout.

Before the change, the builder reproduced the shipped files byte for byte. After the change, a script compared the old and the new files field by field. The only differences are layout data:

| File | Block positions | Wire routes | Subsystem heights | `flipped` | Sheet extents | Other differences |
|---|---|---|---|---|---|---|
| `fpv-vehicle.json` (1138 blocks, 1881 wires) | 1138 | 1681 | 6 | 10 | 29 | 0 |
| `fpv-demo-flight.json` (116 blocks, 106 wires) | 116 | 80 | 0 | 0 | 5 | 0 |
| `fpv-acro-rate-step.json` (58 blocks, 57 wires) | 58 | 40 | 0 | 0 | 5 | 0 |

The same check on the 29 files in `test-models/fpv/` found only layout data in each file. The stored layout is the engine's own: `npm run obliq:layout -- reference-models/fpv-vehicle.json --report` gives the same values before and after on all sheets. This is also true for each file in `test-models/fpv/`. `obliq:test` on the two test models, the FPV Jest suites and `obliq:cgen` of the vehicle give the same results as before (the C files differ only in the time stamps).

Score of the stored files, with the drawing rules of Phase 6:

| Model | Version | Thru | Ovlp | Cross | Bends | Strt | Jogs | Length | Area (Mpx) |
|---|---|---|---|---|---|---|---|---|---|
| FPV vehicle (29 sheets) | 3.7.2 | 528 | 269 | 5442 | 3304 | 229 | 137 | 1608306 | 120.4 |
| | 3.8.0 | 0 | 0 | 3544 | 3570 | 561 | 0 | 1598409 | 139.5 |
| FPV demo flight (5 sheets) | 3.7.2 | 0 | 1 | 11 | 158 | 27 | 6 | 40761 | 6.7 |
| | 3.8.0 | 0 | 0 | 0 | 120 | 46 | 0 | 15732 | 3.4 |
| FPV acro rate step (5 sheets) | 3.7.2 | 0 | 0 | 2 | 78 | 18 | 6 | 12526 | 2.4 |
| | 3.8.0 | 0 | 0 | 1 | 64 | 25 | 0 | 8873 | 1.7 |

The 3.7.2 FPV vehicle values are not the classic "Start" values of the [final result](#final-result) (529, 277, 5425): the Phase 4 default wire path draws a backward wire without a turn position around its blocks.

### Tie rule of the satellite candidates

A sheet with satellites that are not Sheet Labels has two candidate layouts: with all satellites, and with Sheet Label satellites only (see [Satellites](#satellites)). `computeElkLayoutDetail()` keeps the candidate with fewer faults, then fewer crossings. Before, on a tie in crossings, it kept the candidate with all satellites. After the fix of the small steps, the two Mixer candidates had the same crossings, and the kept candidate was the larger one.

The new tie rule (`tieWorse()` in `elkLayout.ts`) applies when the crossings are equal and both candidates have no hard fault (no wire through a block, overlap, block overlap, diagonal segment, wire end against the port direction or small step). It keeps the candidate with fewer bends, then with the shorter total wire length, then with the smaller sheet area. On a full tie, it keeps the candidate with all satellites, so the result is deterministic.

The sheets that change. "Constants" is the number of constants that leave the satellite placement and go into the ELK graph.

| Sheet | Cross | Bends | Strt | Length | Size (px) | Constants |
|---|---|---|---|---|---|---|
| FPV vehicle: Mixer | 11 → 11 | 32 → 30 | 14 → 15 | 5111 → 4233 | 2242 × 306 → 1968 × 288 | 2 (MixerTable, MotorIdle) |
| FPV vehicle: IMU | 0 → 0 | 4 → 4 | 8 → 8 | 681 → 306 | 862 × 228 → 668 × 278 | 2 (AccelBias, GyroBias) |
| FPV vehicle: Magnetometer | 4 → 4 | 22 → 20 | 8 → 9 | 1930 → 1724 | 1376 × 269 → 1246 × 257 | 2 (EarthField, MagBias) |
| FPV Demo Flight and FPV Acro Rate Step: Conditions | 0 → 0 | 12 → 10 | 6 → 7 | 688 → 644 | 830 × 663 → 670 × 652 | 10 |

The other sheets with such a choice (AttitudeEstimator, RatePID, Frame) do not change: their candidates have different crossings. The PDF export of the four sheets was examined before and after. On each sheet, the constants stay next to the block that they feed:

- Mixer: the sheet is 274 px narrower, with 878 px less wire. MixerTable and `pid` are in one column in front of MotorMix. MotorIdle is in front of MotorOutput, below IdleToFull.
- IMU: the bias constants are below the Sheet Label Source, directly in front of the sum. The wires from the Sheet Labels are shorter.
- Magnetometer: MagBias and MagNoise are in one column in front of MagSum, with a straight MagBias wire.
- Conditions: the four GNSS constants are in one column, not in two staggered columns. The wire from UereScale no longer goes past VDOP.

FPV vehicle, 29 sheets: crossings 3544 (no change), bends 3574 → 3570, straight wires 559 → 561, wire length 1599868 → 1598409 px, area 139.6 → 139.5 Mpx. All hard metrics stay 0 on all sheets of the three reference models and of the files in `test-models/fpv/`. The golden values do not change: they hold the hard metrics and the crossings only.

### The classic engine on the new stored file

The golden test lays out the stored file with each engine. The classic engine starts the order of each column from the stored block positions, and it keeps the stored flip and the grown subsystem heights. Thus its result on the new file is different: 557 wires through blocks (529 before), 320 overlaps (277), 5026 crossings (5425), 197 wire ends against the port direction (205), and 136 small steps. With the old heights and no flip, but the new positions, it gives 549, 271 and 5066: most of the change comes from the positions. The ELK result does not change, because ELK does not read the positions. The golden file has the new classic values.

