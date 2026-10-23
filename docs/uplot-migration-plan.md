# Plan: Signal Display plots on uPlot

Status: decisions confirmed (October 2026).

## Goals

- Draw Signal Display plots with [uPlot](https://github.com/leeoniya/uPlot) (MIT, about 50 KB) instead of Recharts.
- Keep every current capability.
- Make large runs fast. The FPV Demo Flight's Telemetry sheet holds 9 scopes of up to 10,000 samples, several of them vectors.
- Make plots printable as **vector** graphics in **Export as PDF**.
- Separately, narrow the block palette by 15%.

## What exists today

The plots in the editor's Simulation Results panel are drawn by `SignalDisplay` ([src/components/SignalDisplay.tsx](../src/components/SignalDisplay.tsx)).

| Capability | Today (Recharts) |
|---|---|
| Header | The block's name, "n / max samples", and a "Recording" badge. The badge is never shown in practice: the editor always passes `isRunning={false}`. |
| Data | Scalars, and vectors with one line per element. Booleans are plotted as 0/1, and only the last `maxSamples` samples are kept. Matrices are rejected by validation. |
| Axes | Time (s) on x and "Value" on y, both labelled with 1 decimal place. y covers the data range plus 10% padding. Dashed grid. |
| Hover | A floating tooltip with the time and each value to 4 decimals. |
| Vectors | Lines in 8 fixed colours, a legend labelled "Element *i*", and a note "Displaying *N* vector elements". |
| Theme | Light and dark colours. |
| Size | 256 px tall, filling the width of the 400 px results panel. |
| Settings | `SignalDisplayConfig` sets Maximum Samples. It is unaffected by this plan. |

Other Recharts use: the admin API metrics page ([ModelBuilderMetricsViewer.tsx](../src/components/ModelBuilderMetricsViewer.tsx)) has an hourly line chart and a bar chart over small data.

`SimulationDisplayPanel.tsx` also imports `SignalDisplay`, but nothing uses that component. It is removed in step 1.

## Behaviour after the switch

**Kept as is:**
- The header and sample count.
- Scalars, vectors and booleans, and the `maxSamples` window.
- The 8 line colours, light and dark themes, the 256 px height and the full panel width.
- The "Time (s)" and "Value" axis titles.

**Changes, meant as improvements:**

| Area | Change | Why |
|---|---|---|
| Tick labels | Automatic precision instead of a fixed 1 decimal place. | A 0.003 V ripple is labelled "0.0" today. |
| Hover | uPlot's legend, below the plot, shows the time and each value under the cursor (4 decimals), with a vertical cursor line. It replaces the floating tooltip. | Same information, in a fixed place that never covers the trace. |
| Legend | The same legend lists the coloured "Element *i*" entries, as now (a scalar shows "Value"). Click an entry to hide or show that line. | Lets you inspect one element of a busy vector. |
| Zoom | Drag across a plot to zoom the time axis; double-click to reset. | New. Long runs can be inspected without re-running. |
| Line shape | Straight segments between samples, for vectors as well. | Vectors are drawn as smoothed splines today, which overshoot between samples. The data is sampled, so straight segments are the faithful plot. Scalars already use straight segments. |
| Rendering | Canvas, at the device pixel ratio. No animation. | Performance. |

**Possible gaps and how they are covered:**

| Gap | Cover |
|---|---|
| Canvas is a bitmap. Printing the browser page could look soft, while Recharts' SVG printed sharply. | **Export as PDF** can include the plots as vector paths, drawn from the data rather than the canvas (step 4). That is the print path. uPlot reads the screen's pixel ratio globally, so redrawing at print resolution on `beforeprint` is not practical: a browser print of the page shows screen-resolution plots. |
| uPlot needs `window`, so it cannot render on the server. | Loaded in the client component, in an effect, as other canvas code is. |
| Theme switches | The axis and grid colours are updated in place, without rebuilding the plot. |
| Accessibility: a canvas has no text. Recharts' SVG had little more. | The plot gets an `aria-label` summarising the signal, its time span and its range. |
| Tests: jsdom has no canvas. | Data shaping (column building, booleans, the sample window, the y range) is pure functions with unit tests. Plot rendering is checked in the browser, as for earlier UI work. |
| Admin metrics page | Moves to uPlot too, so Recharts can be removed: a line plot, and grouped bars with uPlot's bar path builder. Lower priority (step 5). It could also stay on Recharts. |

## Performance

- **No per-point objects.** Data goes to uPlot as columns (`[time[], el0[], el1[], …]`, typed arrays) instead of one object per sample.
- **Fast drawing.** uPlot draws each series as one canvas path and skips points that fall in the same pixel column. 10,000 points per line draws in a few milliseconds.
- **No render-path logging.** The `console.log` calls `SignalDisplay` makes with data copies on every render are removed.
- **Fewer rebuilds.** The plot is created once per block and updated with `setData` when results change. Recharts rebuilds today, because its `key` changes with the data length.

**Target:** the FPV Demo Flight's Telemetry sheet (9 scopes) appears within about 100 ms of results arriving, and hover stays smooth. It is measured before and after the switch.

## PDF export of plots (new)

**Export as PDF** gets a new option, **Include plot results on sheets**. It is off by default, and is available once the model has been run.

- **Where the plots go.** When the option is on, each printed sheet that has Signal Display results puts its plots in a column on the right side of that sheet's diagram page. The diagram is fitted into the area to the left. Pages for sheets without results are unchanged, as is every page when the option is off.
- **The column.** It takes about a third of the page width. Plots are stacked top to bottom in the order of their blocks on the sheet (by y, then x), each with its title, axes, ticks, grid, legend and lines. They share the column's height equally, down to a minimum readable height of about 1.5 in.
- **Too many plots.** If a sheet has more plots than fit, the rest continue in the right-hand column of a following page for the same sheet. That page has the same footer and shows the diagram again on the left.
- **Scaling.** The page's scaling choice (100%, 50%, scale to fit) applies to the diagram area. The plot column is always laid out to fit the page.
- **Vector drawing.** Everything is drawn with pdf-lib vector paths, as the existing lookup-table plots already are ([pdfRenderer.ts](../src/lib/export/pdfRenderer.ts)), so plots stay sharp at any page size.
- **Decimation.** Long series are first reduced, keeping the minimum and maximum of each horizontal step of the printed plot (about 2,000 per line). No peaks are lost, and the file stays small.
- **Matching the screen.** The plot layout (tick choice, ranges, decimation) is shared with the on-screen plots, so print matches screen.

## Block palette: 15% narrower

- The editor's left panel (`AppShell` navbar in [page.tsx](../src/app/models/[id]/page.tsx)) goes from **340 px to 290 px**: 289, rounded.
- The palette's cards already truncate long names and descriptions, and the category filter chips wrap.
- To check in the browser: card text, the search box, the category chips, the "Drag blocks onto the canvas" hint and the V/E/S/P legend, in light and dark themes.
- The canvas gains the 50 px.

## Steps

1. **Data shaping and cleanup.**
   - Pure functions: signal results to columns, booleans to 0/1, the `maxSamples` window, the y range with padding, and series labels. Unit tests.
   - Remove the render-path logging and the unused `SimulationDisplayPanel.tsx`.
2. **The `UPlotChart` component.**
   - A small React wrapper: create, `setData`, theme updates, `ResizeObserver`, destroy.
   - The legend with live values under the cursor.
   - `SignalDisplay` renders through it, with the same header and props.
3. **Zoom and legend toggling.**
   - Browser checks in light and dark themes on the FPV Demo Flight. Timings recorded against the Recharts baseline.
4. **PDF results pages.**
   - The **Include plot results on sheets** option, the right-hand plot column with diagram refit, overflow pages, the vector plot renderer and decimation.
   - Tests on the generated PDF's page count and plot drawing operations.
5. **Admin metrics page on uPlot, then remove `recharts`** from `package.json`. Optional, independent of 1–4.
6. **Palette width** to 290 px, a first value to try and adjust after use, with a browser check. Independent: can go first.

Each step is a separate commit with tests and a CHANGELOG entry.

## Decisions

1. **Hover:** uPlot's own legend shows the values under the cursor, with no floating tooltip.
2. **Synced cursors:** left out. They only help on sheets with several Signal Displays, and can be added later with uPlot's cursor sync.
3. **PDF:** plots go in a column on the right side of each sheet's diagram page, only when the new **Include plot results on sheets** option is on.
4. **Admin metrics page:** moves to uPlot, and Recharts is removed.
5. **Palette width:** 290 px as a first value.
