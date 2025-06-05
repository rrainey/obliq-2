// components/ModelBuilderMetricsViewer.tsx
import React, { useState, useEffect } from 'react';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

interface MetricsSummary {
  totalCalls: number;
  successfulCalls: number;
  failedCalls: number;
  averageResponseTime: number;
  callsByAction: Record<string, number>;
  errorsByAction: Record<string, number>;
  responseTimeByAction: Record<string, { avg: number; min: number; max: number; count: number }>;
}

interface HourlyStats {
  hour: string;
  calls: number;
  avgResponseTime: number;
  errors: number;
}

export function ModelBuilderMetricsViewer({ token }: { token: string }) {
  const [summary, setSummary] = useState<MetricsSummary | null>(null);
  const [hourlyStats, setHourlyStats] = useState<HourlyStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const fetchMetrics = async () => {
    try {
      // Fetch summary
      const summaryRes = await fetch(`/api/model-builder/${token}?metricsAction=summary`);
      if (summaryRes.ok) {
        const summaryData = await summaryRes.json();
        setSummary(summaryData.data);
      }

      // Fetch hourly stats
      const hourlyRes = await fetch(`/api/model-builder/${token}?metricsAction=hourly&hours=24`);
      if (hourlyRes.ok) {
        const hourlyData = await hourlyRes.json();
        setHourlyStats(hourlyData.data);
      }
    } catch (error) {
      console.error('Failed to fetch metrics:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMetrics();
    
    if (autoRefresh) {
      const interval = setInterval(fetchMetrics, 30000); // Refresh every 30 seconds
      return () => clearInterval(interval);
    }
  }, [autoRefresh]);

  const exportMetrics = async () => {
    window.location.href = `/api/model-builder/${token}?metricsAction=export`;
  };

  const clearMetrics = async () => {
    if (confirm('Are you sure you want to clear all metrics data?')) {
      await fetch(`/api/model-builder/${token}?metricsAction=clear`);
      fetchMetrics();
    }
  };

  if (loading) {
    return <div className="p-4">Loading metrics...</div>;
  }

  if (!summary) {
    return <div className="p-4">No metrics data available</div>;
  }

  // Prepare data for charts
  const actionData = Object.entries(summary.callsByAction).map(([action, calls]) => ({
    action,
    calls,
    errors: summary.errorsByAction[action] || 0,
    avgTime: summary.responseTimeByAction[action]?.avg || 0
  }));

  const hourlyChartData = hourlyStats.map(stat => ({
    hour: new Date(stat.hour).toLocaleTimeString([], { hour: '2-digit' }),
    calls: stat.calls,
    avgTime: Math.round(stat.avgResponseTime),
    errors: stat.errors
  }));

  return (
    <div className="p-4 space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg shadow p-4">
          <h3 className="text-sm font-medium text-gray-600">Total API Calls</h3>
          <div className="text-2xl font-bold mt-2">{summary.totalCalls}</div>
        </div>

        <div className="bg-white rounded-lg shadow p-4">
          <h3 className="text-sm font-medium text-gray-600">Success Rate</h3>
          <div className="text-2xl font-bold mt-2">
            {summary.totalCalls > 0 
              ? Math.round((summary.successfulCalls / summary.totalCalls) * 100)
              : 0}%
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-4">
          <h3 className="text-sm font-medium text-gray-600">Failed Calls</h3>
          <div className="text-2xl font-bold text-red-600 mt-2">{summary.failedCalls}</div>
        </div>

        <div className="bg-white rounded-lg shadow p-4">
          <h3 className="text-sm font-medium text-gray-600">Avg Response Time</h3>
          <div className="text-2xl font-bold mt-2">{Math.round(summary.averageResponseTime)}ms</div>
        </div>
      </div>

      {/* Controls */}
      <div className="flex gap-4 flex-wrap">
        <button 
          onClick={() => setAutoRefresh(!autoRefresh)}
          className="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50"
        >
          {autoRefresh ? 'Disable' : 'Enable'} Auto-Refresh
        </button>
        <button 
          onClick={fetchMetrics}
          className="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50"
        >
          Refresh Now
        </button>
        <button 
          onClick={exportMetrics}
          className="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50"
        >
          Export CSV
        </button>
        <button 
          onClick={clearMetrics}
          className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700"
        >
          Clear Metrics
        </button>
      </div>

      {/* Hourly Activity Chart */}
      <div className="bg-white rounded-lg shadow p-4">
        <h2 className="text-lg font-semibold mb-4">API Activity (Last 24 Hours)</h2>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={hourlyChartData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="hour" />
            <YAxis yAxisId="left" />
            <YAxis yAxisId="right" orientation="right" />
            <Tooltip />
            <Legend />
            <Line 
              yAxisId="left"
              type="monotone" 
              dataKey="calls" 
              stroke="#8884d8" 
              name="API Calls"
            />
            <Line 
              yAxisId="right"
              type="monotone" 
              dataKey="avgTime" 
              stroke="#82ca9d" 
              name="Avg Response (ms)"
            />
            <Line 
              yAxisId="left"
              type="monotone" 
              dataKey="errors" 
              stroke="#ff7300" 
              name="Errors"
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Actions Breakdown */}
      <div className="bg-white rounded-lg shadow p-4">
        <h2 className="text-lg font-semibold mb-4">API Calls by Action</h2>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={actionData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="action" angle={-45} textAnchor="end" height={100} />
            <YAxis />
            <Tooltip />
            <Legend />
            <Bar dataKey="calls" fill="#8884d8" name="Successful Calls" />
            <Bar dataKey="errors" fill="#ff7300" name="Failed Calls" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Response Time by Action */}
      <div className="bg-white rounded-lg shadow p-4">
        <h2 className="text-lg font-semibold mb-4">Response Time by Action</h2>
        <div className="space-y-2">
          {Object.entries(summary.responseTimeByAction).map(([action, stats]) => (
            <div key={action} className="flex items-center justify-between p-2 border rounded">
              <span className="font-medium">{action}</span>
              <div className="flex gap-4 text-sm">
                <span>Avg: {Math.round(stats.avg)}ms</span>
                <span>Min: {Math.round(stats.min)}ms</span>
                <span>Max: {Math.round(stats.max)}ms</span>
                <span className="text-gray-500">({stats.count} calls)</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}