// components/SignalDisplay.tsx

'use client'

import { useState, useEffect } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { Modal, NumberInput, Button, Stack, Group, Alert } from '@mantine/core'
import { useMantineColorScheme } from '@mantine/core'
import { IconInfoCircle } from '@tabler/icons-react'
import { BlockData } from './BlockNode'

interface SignalDisplayProps {
  block: BlockData
  signalData?: { time: number; value: number | number[] | boolean | boolean[] }[]
  isRunning?: boolean
}

// Theme configurations for recharts
const lightTheme = {
  background: '#ffffff',
  text: '#374151',
  textMuted: '#6b7280',
  grid: '#e5e7eb',
  axis: '#6b7280',
  tooltipBg: 'rgba(255, 255, 255, 0.95)',
  tooltipBorder: '#e5e7eb',
}

const darkTheme = {
  background: '#25262B',
  text: '#C1C2C5',
  textMuted: '#909296',
  grid: '#373A40',
  axis: '#909296',
  tooltipBg: 'rgba(37, 38, 43, 0.95)',
  tooltipBorder: '#373A40',
}

// Color palette for multi-line plots
const LINE_COLORS = [
  '#ef4444', // red
  '#10b981', // green
  '#3b82f6', // blue
  '#f59e0b', // amber
  '#8b5cf6', // violet
  '#ec4899', // pink
  '#14b8a6', // teal
  '#f97316', // orange
]

export default function SignalDisplay({ block, signalData = [], isRunning = false }: SignalDisplayProps) {
  const { colorScheme } = useMantineColorScheme()
  const [chartData, setChartData] = useState<any[]>([])
  const [vectorSize, setVectorSize] = useState(1)
  const [isVector, setIsVector] = useState(false)

  const isDark = colorScheme === 'dark'
  const theme = isDark ? darkTheme : lightTheme

  const maxSamples = block.parameters?.maxSamples || 1000
  const displayName = block.name

  console.log('SignalDisplay maxSamples:', maxSamples, 'from block:', block)

useEffect(() => {
  if (signalData.length === 0) {
    setChartData([])
    return
  }
  
  console.log('SignalDisplay useEffect - signalData:', {
    length: signalData.length,
    isArray: Array.isArray(signalData),
    first: signalData[0],
    last: signalData[signalData.length - 1]
  })
  
  // Determine if we're dealing with vector data
  const firstValue = signalData[0]?.value
  const isVectorData = Array.isArray(firstValue)
  setIsVector(isVectorData)
  
  if (isVectorData) {
    const size = (firstValue as any[]).length
    setVectorSize(size)
    
    // Transform vector data for multi-line chart
    console.log('About to slice with maxSamples:', maxSamples)
    const slicedData = signalData.slice(-maxSamples)
    console.log('After slice:', slicedData.length, 'samples')
  

    const transformedData = slicedData.map((point, index) => {
      const dataPoint: any = { 
        time: point.time,  // Keep as number, not string
      }
      
      if (Array.isArray(point.value)) {
        point.value.forEach((val, i) => {
          dataPoint[`element_${i}`] = typeof val === 'number' ? val : (val ? 1 : 0)
        })
      }
      
      return dataPoint
    })
    
    console.log('Final transformedData length:', transformedData.length)
    console.log('Sample of transformed data:', transformedData.slice(0, 3))
    console.log('Chart data being set with', transformedData.length, 'points')
    
    setChartData(transformedData)
  } else {
      // Transform scalar data
      const transformedData = signalData.slice(-maxSamples).map((point) => ({
        time: point.time,
        value: typeof point.value === 'number' ? point.value : (point.value ? 1 : 0)
      }))
      
      setChartData(transformedData)
    }
  }, [signalData, maxSamples])
  
  // Calculate Y-axis domain
const getYDomain = () => {
  if (chartData.length === 0) return [-1, 1]
  
  let min = Infinity
  let max = -Infinity
  
  console.log('getYDomain - checking data, isVector:', isVector, 'vectorSize:', vectorSize)
  
  chartData.forEach((point, idx) => {
    if (idx < 3) console.log('Point sample:', point) // Log first few points
    
    if (isVector) {
      for (let i = 0; i < vectorSize; i++) {
        const val = point[`element_${i}`]
        if (typeof val === 'number') {
          min = Math.min(min, val)
          max = Math.max(max, val)
        }
      }
    } else {
      if (typeof point.value === 'number') {
        min = Math.min(min, point.value)
        max = Math.max(max, point.value)
      }
    }
  })
  
  console.log('getYDomain result:', { min, max })
  
  // Add some padding
  const range = max - min
  const padding = range * 0.1 || 0.1
  return [min - padding, max + padding]
}
  
  const yDomain = getYDomain()

  console.log('SignalDisplay render - chartData:', {
  length: chartData.length,
  sample: chartData.slice(0, 3),
  hasData: chartData.length > 0
})

console.log('Y-axis domain:', yDomain)
console.log('First few data points:', chartData.slice(0, 5))
console.log('Last few data points:', chartData.slice(-5))
  
  return (
    <div
      className="rounded-lg shadow-md p-4"
      style={{ backgroundColor: theme.background }}
    >
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-medium" style={{ color: theme.text }}>{displayName}</h3>
        <div className="flex items-center gap-2">
          {isRunning && (
            <span className="flex items-center gap-1 text-xs text-green-500">
              <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
              Recording
            </span>
          )}
          <span className="text-xs" style={{ color: theme.textMuted }}>
            {chartData.length} / {maxSamples} samples
          </span>
        </div>
      </div>

      <div className="h-64">
        <ResponsiveContainer width="100%" height={256}>
          <LineChart
              key={`chart-${chartData.length}-${vectorSize}`}
              data={chartData}
              margin={{ top: 5, right: 5, left: 0, bottom: 5 }}
            >
            <CartesianGrid strokeDasharray="3 3" stroke={theme.grid} />
            <XAxis
              dataKey="time"
              label={{ value: 'Time (s)', position: 'insideBottom', offset: -5, fill: theme.textMuted }}
              tick={{ fontSize: 12, fill: theme.axis }}
              stroke={theme.axis}
              tickFormatter={(value) => value.toFixed(1)}
              allowDecimals={false}
            />
            <YAxis
              domain={yDomain}
              label={{ value: 'Value', angle: -90, position: 'insideLeft', fill: theme.textMuted }}
              tick={{ fontSize: 12, fill: theme.axis }}
              stroke={theme.axis}
              tickFormatter={(value) => value.toFixed(1)}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: theme.tooltipBg,
                border: `1px solid ${theme.tooltipBorder}`,
                borderRadius: '6px',
                fontSize: '12px',
                color: theme.text
              }}
              labelStyle={{ color: theme.text }}
              formatter={(value: any) => typeof value === 'number' ? value.toFixed(4) : value}
            />

           {isVector ? (
            // Remove the fragment and render Lines directly
            [
              <Legend
                key="legend"
                wrapperStyle={{ fontSize: '12px', color: theme.text }}
                iconType="line"
              />,
              ...Array.from({ length: vectorSize }).map((_, i) => (
                <Line
                  key={`element_${i}`}
                  type="monotone"
                  dataKey={`element_${i}`}
                  stroke={LINE_COLORS[i % LINE_COLORS.length]}
                  strokeWidth={2}
                  dot={false}
                  name={`Element ${i}`}
                />
              ))
            ]
          ) : (
            <Line
              type="monotone"
              dataKey="value"
              stroke={LINE_COLORS[0]}
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
          )}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {isVector && (
        <div className="mt-2 text-xs" style={{ color: theme.textMuted }}>
          Displaying {vectorSize} vector elements
        </div>
      )}
    </div>
  )
}

// Configuration component for Signal Display blocks
interface SignalDisplayConfigProps {
  block: BlockData
  onUpdate: (parameters: Record<string, any>) => void
  onClose: () => void
}

export function SignalDisplayConfig({ block, onUpdate, onClose }: SignalDisplayConfigProps) {
  const [maxSamples, setMaxSamples] = useState(block.parameters?.maxSamples || 1000)

  const handleSave = () => {
    onUpdate({ maxSamples })
    onClose()
  }

  return (
    <Modal
      opened={true}
      onClose={onClose}
      title={`Configure Signal Display: ${block.name}`}
      centered
    >
      <Stack gap="md">
        <NumberInput
          label="Maximum Samples"
          value={maxSamples}
          onChange={(val) => setMaxSamples(typeof val === 'number' ? val : 1000)}
          min={10}
          max={10000}
          description="Number of data points to display (10-10000)"
        />

        <Alert variant="light" color="blue" icon={<IconInfoCircle />} title="Signal Display">
          Shows real-time signal values during simulation.
          Vector signals will be displayed as multiple lines with different colors.
        </Alert>

        <Group justify="flex-end" gap="sm">
          <Button variant="default" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave}>
            Save
          </Button>
        </Group>
      </Stack>
    </Modal>
  )
}