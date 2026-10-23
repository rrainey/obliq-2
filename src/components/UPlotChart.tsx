'use client'

// components/UPlotChart.tsx
//
// A general uPlot chart: built from `options` (without width), redrawn with
// setData when `data` changes, rebuilt when `options` change, and sized to
// its container's width. Signal Display plots use their own SignalPlot,
// which adds the shared plot layout.

import { useEffect, useRef } from 'react'
import uPlot from 'uplot'
import 'uplot/dist/uPlot.min.css'

interface UPlotChartProps {
  options: Omit<uPlot.Options, 'width'>
  data: uPlot.AlignedData
  className?: string
}

export default function UPlotChart({ options, data, className }: UPlotChartProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const plotRef = useRef<uPlot | null>(null)
  const dataRef = useRef(data)
  dataRef.current = data

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const plot = new uPlot({ ...options, width: Math.max(100, el.clientWidth) } as uPlot.Options, dataRef.current, el)
    plotRef.current = plot
    const resize = new ResizeObserver(() => {
      const w = Math.max(100, el.clientWidth)
      if (Math.abs(w - plot.width) >= 1) plot.setSize({ width: w, height: plot.height })
    })
    resize.observe(el)
    return () => {
      resize.disconnect()
      plot.destroy()
      plotRef.current = null
    }
  }, [options])

  useEffect(() => {
    plotRef.current?.setData(data)
  }, [data])

  return <div ref={containerRef} className={className} />
}
