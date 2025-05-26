'use client'

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'

interface SignalDisplayProps {
  blockId: string
  timePoints: number[]
  signalData: number[]
  title?: string
  width?: number
  height?: number
}

export default function SignalDisplay({ 
  blockId, 
  timePoints, 
  signalData, 
  title,
  width = 400,
  height = 200
}: SignalDisplayProps) {
  // Prepare data for Recharts
  const chartData = timePoints.map((time, index) => ({
    time: time,
    value: signalData[index] || 0
  }))

  // Calculate some basic statistics
  const stats = {
    min: signalData.length > 0 ? Math.min(...signalData) : 0,
    max: signalData.length > 0 ? Math.max(...signalData) : 0,
    final: signalData.length > 0 ? signalData[signalData.length - 1] : 0,
    samples: signalData.length
  }

  return (
    <div className="bg-white border rounded-lg p-4 shadow-sm">
      <div className="flex justify-between items-center mb-3">
        <h3 className="font-medium text-gray-900">
          {title || `Signal Display - ${blockId}`}
        </h3>
        <div className="text-xs text-gray-500">
          {stats.samples} samples
        </div>
      </div>
      
      {chartData.length > 0 ? (
        <div style={{ width, height }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e0e7ff" />
              <XAxis 
                dataKey="time" 
                type="number"
                scale="linear"
                domain={['dataMin', 'dataMax']}
                tickFormatter={(value) => value.toFixed(1)}
                stroke="#6b7280"
                fontSize={10}
              />
              <YAxis 
                type="number"
                domain={['dataMin - 0.1', 'dataMax + 0.1']}
                tickFormatter={(value) => value.toFixed(2)}
                stroke="#6b7280"
                fontSize={10}
              />
              <Tooltip 
                formatter={(value: number) => [value.toFixed(3), 'Value']}
                labelFormatter={(label: number) => `Time: ${label.toFixed(3)}s`}
                contentStyle={{
                  backgroundColor: '#f9fafb',
                  border: '1px solid #d1d5db',
                  borderRadius: '4px',
                  fontSize: '12px'
                }}
              />
              <Line 
                type="monotone" 
                dataKey="value" 
                stroke="#3b82f6" 
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 3, fill: '#3b82f6' }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div 
          className="flex items-center justify-center bg-gray-50 border-2 border-dashed border-gray-300 rounded"
          style={{ width, height }}
        >
          <div className="text-center text-gray-500">
            <div className="text-sm">No data to display</div>
            <div className="text-xs mt-1">Run simulation to see signal trace</div>
          </div>
        </div>
      )}

      {/* Signal Statistics */}
      <div className="mt-3 grid grid-cols-4 gap-2 text-xs">
        <div className="bg-gray-50 px-2 py-1 rounded">
          <div className="text-gray-500">Min</div>
          <div className="font-medium">{stats.min.toFixed(3)}</div>
        </div>
        <div className="bg-gray-50 px-2 py-1 rounded">
          <div className="text-gray-500">Max</div>
          <div className="font-medium">{stats.max.toFixed(3)}</div>
        </div>
        <div className="bg-gray-50 px-2 py-1 rounded">
          <div className="text-gray-500">Final</div>
          <div className="font-medium">{stats.final.toFixed(3)}</div>
        </div>
        <div className="bg-gray-50 px-2 py-1 rounded">
          <div className="text-gray-500">Range</div>
          <div className="font-medium">{(stats.max - stats.min).toFixed(3)}</div>
        </div>
      </div>
    </div>
  )
}