// components/ModelBuilderMetricsViewer.tsx
import React, { useState, useEffect, useMemo } from 'react';
import uPlot from 'uplot';
import UPlotChart from './UPlotChart';

const GRID = { stroke: '#e5e7eb', dash: [3, 3], width: 1 };
const AXIS = { stroke: '#6b7280', grid: GRID, ticks: { stroke: '#e5e7eb', width: 1 } };
const CALLS_COLOR = '#8884d8';
const ERRORS_COLOR = '#ff7300';
const TIME_COLOR = '#82ca9d';

/** Hourly activity: calls and errors (left axis), average response time in ms (right axis). */
function hourlyOptions(hours: string[]): Omit<uPlot.Options, 'width'> {
  return {
    height: 300,
    legend: { show: true, live: true },
    cursor: { drag: { x: false, y: false } },
    scales: { x: { time: false }, ms: { auto: true } },
    axes: [
      { ...AXIS, splits: () => hours.map((_, i) => i), values: (_u, splits) => splits.map(i => hours[i] ?? '') },
      { ...AXIS, label: 'Calls' },
      { ...AXIS, scale: 'ms', side: 1, label: 'ms', grid: { show: false } },
    ],
    series: [
      { label: 'Hour', value: (_u, i) => (i === null ? '—' : hours[i] ?? '') },
      { label: 'API Calls', stroke: CALLS_COLOR, width: 2, points: { show: false } },
      { label: 'Avg Response (ms)', stroke: TIME_COLOR, width: 2, scale: 'ms', points: { show: false } },
      { label: 'Errors', stroke: ERRORS_COLOR, width: 2, points: { show: false } },
    ],
  };
}

/** Calls by action: successful and failed calls as grouped bars. */
function actionOptions(actions: string[]): Omit<uPlot.Options, 'width'> {
  const bars = (align: -1 | 1) => uPlot.paths.bars!({ size: [0.35, 40], align, gap: 1 });
  return {
    height: 320,
    legend: { show: true, live: true },
    cursor: { drag: { x: false, y: false }, points: { show: false } },
    scales: { x: { time: false, range: (_u, min, max) => [min - 0.6, max + 0.6] }, y: { range: (_u, _min, max) => [0, Math.max(1, max * 1.1)] } },
    axes: [
      {
        ...AXIS,
        splits: () => actions.map((_, i) => i),
        values: (_u, splits) => splits.map(i => actions[i] ?? ''),
        rotate: -45,
        size: 110,
        grid: { show: false },
      },
      { ...AXIS, label: 'Calls' },
    ],
    series: [
      { label: 'Action', value: (_u, i) => (i === null ? '—' : actions[i] ?? '') },
      { label: 'Successful Calls', fill: CALLS_COLOR, stroke: CALLS_COLOR, paths: bars(-1), points: { show: false } },
      { label: 'Failed Calls', fill: ERRORS_COLOR, stroke: ERRORS_COLOR, paths: bars(1), points: { show: false } },
    ],
  };
}

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
    const headers = { 'Authorization': `Bearer ${token}` };
    try {
      // Fetch summary
      const summaryRes = await fetch(`/api/model-builder?metricsAction=summary`, { headers });
      if (summaryRes.ok) {
        const summaryData = await summaryRes.json();
        setSummary(summaryData.data);
      }

      // Fetch hourly stats
      const hourlyRes = await fetch(`/api/model-builder?metricsAction=hourly&hours=24`, { headers });
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
    // For export, we need to use fetch with Authorization header and then trigger download
    const response = await fetch(`/api/model-builder?metricsAction=export`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (response.ok) {
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'model-builder-metrics.csv';
      a.click();
      window.URL.revokeObjectURL(url);
    }
  };

  const clearMetrics = async () => {
    if (confirm('Are you sure you want to clear all metrics data?')) {
      await fetch(`/api/model-builder?metricsAction=clear`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      fetchMetrics();
    }
  };

  // Chart options change only with their labels; data updates in place
  const hourlyChart = useMemo(() => {
    const hours = hourlyStats.map(stat => new Date(stat.hour).toLocaleTimeString([], { hour: '2-digit' }));
    const data: uPlot.AlignedData = [
      hourlyStats.map((_, i) => i),
      hourlyStats.map(stat => stat.calls),
      hourlyStats.map(stat => Math.round(stat.avgResponseTime)),
      hourlyStats.map(stat => stat.errors),
    ];
    return { options: hourlyOptions(hours), data };
  }, [hourlyStats]);

  const actionChart = useMemo(() => {
    const entries = Object.entries(summary?.callsByAction ?? {});
    const actions = entries.map(([action]) => action);
    const data: uPlot.AlignedData = [
      actions.map((_, i) => i),
      entries.map(([, calls]) => calls),
      actions.map(action => summary?.errorsByAction[action] || 0),
    ];
    return { options: actionOptions(actions), data };
  }, [summary]);

  if (loading) {
    return <div className="p-4">Loading metrics...</div>;
  }

  if (!summary) {
    return <div className="p-4">No metrics data available</div>;
  }

  // Prepare data for charts
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
        <UPlotChart options={hourlyChart.options} data={hourlyChart.data} />
      </div>

      {/* Actions Breakdown */}
      <div className="bg-white rounded-lg shadow p-4">
        <h2 className="text-lg font-semibold mb-4">API Calls by Action</h2>
        <UPlotChart options={actionChart.options} data={actionChart.data} />
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