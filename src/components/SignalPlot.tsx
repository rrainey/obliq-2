'use client'

// components/SignalPlot.tsx
//
// A Signal Display plot drawn with uPlot (canvas). Ranges, ticks and labels
// come from lib/plots/signalPlot, shared with the PDF export.
//
// - Hover: the legend below the plot shows the time and each value under
//   the cursor (4 decimals), with a vertical cursor line.
// - Click a legend entry to hide or show that line; the y range follows.
// - Drag across the plot to zoom the time axis; double-click to reset.
//
// The plot is created once and updated with setData when the results change.
// It is rebuilt only when the number of lines or the theme changes.

import { useEffect, useMemo, useRef } from 'react'
import uPlot from 'uplot'
import 'uplot/dist/uPlot.min.css'
import {
  PlotColumns,
  PlotTheme,
  formatTick,
  formatValue,
  niceStep,
  niceTicks,
  plotColor,
  plotYRange,
} from '@/lib/plots/signalPlot'

interface SignalPlotProps {
  columns: PlotColumns
  theme: PlotTheme
  /** Height of the plot area including axes (px) */
  height: number
  /** Accessible description of the plot */
  ariaLabel: string
}

/** About one tick per this many pixels along an axis. */
const TICK_SPACING_X = 50
const TICK_SPACING_Y = 30

/** Axis splits and labels from the shared nice-tick layout. */
function axisTicks(spacing: number) {
  const target = (u: uPlot, axisIdx: number) => {
    const horizontal = axisIdx === 0
    const px = horizontal ? u.bbox.width / uPlot.pxRatio : u.bbox.height / uPlot.pxRatio
    return Math.max(3, Math.round(px / spacing))
  }
  return {
    splits: (u: uPlot, axisIdx: number, min: number, max: number) => niceTicks(min, max, target(u, axisIdx)),
    values: (u: uPlot, splits: number[], axisIdx: number) => {
      const scale = axisIdx === 0 ? u.scales.x : u.scales.y
      const step = niceStep(scale.min ?? 0, scale.max ?? 1, target(u, axisIdx))
      return splits.map(v => formatTick(v, step))
    },
  }
}

function buildOptions(columns: PlotColumns, theme: PlotTheme, width: number, height: number): uPlot.Options {
  const axis = (label: string, spacing: number): uPlot.Axis => ({
    label,
    stroke: theme.axis,
    labelFont: '12px sans-serif',
    font: '11px sans-serif',
    grid: { stroke: theme.grid, dash: [3, 3], width: 1 },
    ticks: { stroke: theme.grid, width: 1 },
    ...axisTicks(spacing),
  })
  return {
    width,
    height,
    legend: { show: true, live: true },
    cursor: { drag: { x: true, y: false }, points: { size: 6 } },
    scales: {
      x: { time: false },
      y: {
        range: (u: uPlot) =>
          plotYRange(
            columns.series,
            u.series.slice(1).map(s => s.show !== false)
          ),
      },
    },
    axes: [axis('Time (s)', TICK_SPACING_X), axis('Value', TICK_SPACING_Y)],
    series: [
      { label: 'Time (s)', value: (_u: uPlot, v: number | null) => (v === null || v === undefined ? '—' : v.toFixed(4)) },
      ...columns.labels.map((label, i) => ({
        label,
        stroke: plotColor(i),
        width: 1.5,
        points: { show: false },
        value: (_u: uPlot, v: number | null) => formatValue(v),
      })),
    ],
  }
}

const toData = (columns: PlotColumns): uPlot.AlignedData => [columns.times, ...columns.series] as uPlot.AlignedData

export default function SignalPlot({ columns, theme, height, ariaLabel }: SignalPlotProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const plotRef = useRef<uPlot | null>(null)
  const columnsRef = useRef(columns)
  columnsRef.current = columns
  const lineCount = columns.series.length

  // (Re)create when the number of lines or the theme changes
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const plot = new uPlot(
      buildOptions(columnsRef.current, theme, Math.max(100, el.clientWidth), height),
      toData(columnsRef.current),
      el
    )
    plotRef.current = plot
    const resize = new ResizeObserver(() => {
      const w = Math.max(100, el.clientWidth)
      if (Math.abs(w - plot.width) >= 1) plot.setSize({ width: w, height })
    })
    resize.observe(el)
    return () => {
      resize.disconnect()
      plot.destroy()
      plotRef.current = null
    }
  }, [lineCount, theme, height])

  // New results: update the data in place (this also resets a zoom)
  useEffect(() => {
    const plot = plotRef.current
    if (!plot || plot.series.length - 1 !== columns.series.length) return
    // The y range reads the columns through the options closure; refresh it
    plot.scales.y.range = (u: uPlot) =>
      plotYRange(
        columns.series,
        u.series.slice(1).map(s => s.show !== false)
      )
    plot.setData(toData(columns))
  }, [columns])

  // Legend text follows the theme (uPlot's stylesheet assumes a light page)
  const style = useMemo(() => ({ color: theme.text }), [theme])

  return <div ref={containerRef} className="signal-plot" style={style} role="img" aria-label={ariaLabel} />
}
