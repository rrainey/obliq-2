// lib/modelBuilderApiMetrics.ts

export interface MetricEntry {
  timestamp: Date;
  endpoint: string;
  action: string;
  responseTime: number;
  success: boolean;
  statusCode?: number;
  errorMessage?: string;
}

export interface MetricsSummary {
  totalCalls: number;
  successfulCalls: number;
  failedCalls: number;
  averageResponseTime: number;
  callsByAction: Record<string, number>;
  errorsByAction: Record<string, number>;
  responseTimeByAction: Record<string, { avg: number; min: number; max: number; count: number }>;
}

export class ModelBuilderApiMetrics {
  private metrics: MetricEntry[] = [];
  private maxEntries: number = 10000; // Keep last 10k entries to prevent memory issues

  /**
   * Record a metric entry
   */
  record(
    endpoint: string,
    action: string,
    responseTime: number,
    success: boolean,
    statusCode?: number,
    errorMessage?: string
  ): void {
    const entry: MetricEntry = {
      timestamp: new Date(),
      endpoint,
      action,
      responseTime,
      success,
      statusCode,
      errorMessage
    };

    this.metrics.push(entry);

    // Trim old entries if we exceed maxEntries
    if (this.metrics.length > this.maxEntries) {
      this.metrics = this.metrics.slice(-this.maxEntries);
    }
  }

  /**
   * Get all metrics
   */
  getMetrics(): MetricEntry[] {
    return [...this.metrics];
  }

  /**
   * Get metrics within a time range
   */
  getMetricsInRange(startTime: Date, endTime: Date): MetricEntry[] {
    return this.metrics.filter(
      m => m.timestamp >= startTime && m.timestamp <= endTime
    );
  }

  /**
   * Get metrics for a specific action
   */
  getMetricsByAction(action: string): MetricEntry[] {
    return this.metrics.filter(m => m.action === action);
  }

  /**
   * Get summary statistics
   */
  getSummary(since?: Date): MetricsSummary {
    const relevantMetrics = since 
      ? this.metrics.filter(m => m.timestamp >= since)
      : this.metrics;

    if (relevantMetrics.length === 0) {
      return {
        totalCalls: 0,
        successfulCalls: 0,
        failedCalls: 0,
        averageResponseTime: 0,
        callsByAction: {},
        errorsByAction: {},
        responseTimeByAction: {}
      };
    }

    const totalCalls = relevantMetrics.length;
    const successfulCalls = relevantMetrics.filter(m => m.success).length;
    const failedCalls = totalCalls - successfulCalls;
    const totalResponseTime = relevantMetrics.reduce((sum, m) => sum + m.responseTime, 0);
    const averageResponseTime = totalResponseTime / totalCalls;

    const callsByAction: Record<string, number> = {};
    const errorsByAction: Record<string, number> = {};
    const responseTimeByAction: Record<string, { avg: number; min: number; max: number; count: number }> = {};

    relevantMetrics.forEach(metric => {
      // Count calls by action
      callsByAction[metric.action] = (callsByAction[metric.action] || 0) + 1;

      // Count errors by action
      if (!metric.success) {
        errorsByAction[metric.action] = (errorsByAction[metric.action] || 0) + 1;
      }

      // Track response times by action
      if (!responseTimeByAction[metric.action]) {
        responseTimeByAction[metric.action] = {
          avg: 0,
          min: metric.responseTime,
          max: metric.responseTime,
          count: 0
        };
      }

      const actionStats = responseTimeByAction[metric.action];
      actionStats.count++;
      actionStats.min = Math.min(actionStats.min, metric.responseTime);
      actionStats.max = Math.max(actionStats.max, metric.responseTime);
    });

    // Calculate averages for each action
    Object.keys(responseTimeByAction).forEach(action => {
      const actionMetrics = relevantMetrics.filter(m => m.action === action);
      const totalTime = actionMetrics.reduce((sum, m) => sum + m.responseTime, 0);
      responseTimeByAction[action].avg = totalTime / actionMetrics.length;
    });

    return {
      totalCalls,
      successfulCalls,
      failedCalls,
      averageResponseTime,
      callsByAction,
      errorsByAction,
      responseTimeByAction
    };
  }

  /**
   * Get hourly statistics for the last N hours
   */
  getHourlyStats(hours: number = 24): Array<{ hour: string; calls: number; avgResponseTime: number; errors: number }> {
    const now = new Date();
    const stats: Array<{ hour: string; calls: number; avgResponseTime: number; errors: number }> = [];

    for (let i = hours - 1; i >= 0; i--) {
      const hourStart = new Date(now);
      hourStart.setHours(hourStart.getHours() - i);
      hourStart.setMinutes(0, 0, 0);
      
      const hourEnd = new Date(hourStart);
      hourEnd.setHours(hourEnd.getHours() + 1);

      const hourMetrics = this.getMetricsInRange(hourStart, hourEnd);
      
      const calls = hourMetrics.length;
      const errors = hourMetrics.filter(m => !m.success).length;
      const avgResponseTime = calls > 0
        ? hourMetrics.reduce((sum, m) => sum + m.responseTime, 0) / calls
        : 0;

      stats.push({
        hour: hourStart.toISOString(),
        calls,
        avgResponseTime,
        errors
      });
    }

    return stats;
  }

  /**
   * Clear all metrics
   */
  clear(): void {
    this.metrics = [];
  }

  /**
   * Export metrics as CSV
   */
  exportToCsv(): string {
    const headers = ['timestamp', 'endpoint', 'action', 'responseTime', 'success', 'statusCode', 'errorMessage'];
    const rows = this.metrics.map(m => [
      m.timestamp.toISOString(),
      m.endpoint,
      m.action,
      m.responseTime.toString(),
      m.success.toString(),
      m.statusCode?.toString() || '',
      m.errorMessage || ''
    ]);

    return [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');
  }
}

// Singleton instance
export const modelBuilderApiMetrics = new ModelBuilderApiMetrics();