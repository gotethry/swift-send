import { createLogger } from '../../logger';
import type { StressTestResult } from '../stress/stressTestService';

export interface LatencySample {
  endpoint: string;
  method: string;
  latencyMs: number;
  statusCode: number;
  timestamp: string;
}

export interface Bottleneck {
  area: string;
  description: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  p99LatencyMs?: number;
  errorRate?: number;
  recommendation: string;
}

export interface BenchmarkReport {
  id: string;
  generatedAt: string;
  durationMs: number;

  concurrentUsers: number;
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;

  throughputPerSecond: number;
  averageLatencyMs: number;
  p50LatencyMs: number;
  p95LatencyMs: number;
  p99LatencyMs: number;
  maxLatencyMs: number;

  errorRate: number;
  bottlenecks: Bottleneck[];
  endpointBreakdown: EndpointStats[];
  rawSamples: LatencySample[];
}

export interface EndpointStats {
  endpoint: string;
  method: string;
  callCount: number;
  averageLatencyMs: number;
  p95LatencyMs: number;
  p99LatencyMs: number;
  errorRate: number;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

export class BenchmarkReportService {
  private readonly logger;
  private readonly samples: LatencySample[] = [];

  constructor() {
    this.logger = createLogger({ component: 'benchmarkReportService' });
  }

  recordSample(sample: LatencySample): void {
    this.samples.push(sample);
  }

  clearSamples(): void {
    this.samples.length = 0;
  }

  fromStressTestResult(result: StressTestResult): BenchmarkReport {
    const latencies = result.perTransferResults
      .map((r) => r.latencyMs)
      .sort((a, b) => a - b);

    const failed = result.perTransferResults.filter((r) => !r.success).length;
    const errorRate = result.perTransferResults.length > 0
      ? failed / result.perTransferResults.length
      : 0;

    const bottlenecks = this.detectBottlenecks({
      averageLatencyMs: result.averageLatencyMs,
      p95LatencyMs: result.p95LatencyMs,
      p99LatencyMs: result.p99LatencyMs,
      errorRate,
      throughputPerSecond: result.throughputPerSecond,
    });

    return {
      id: `bench_${Date.now()}`,
      generatedAt: new Date().toISOString(),
      durationMs: result.durationMs,
      concurrentUsers: result.config.concurrency,
      totalRequests: result.config.totalTransfers,
      successfulRequests: result.successful,
      failedRequests: result.failed,
      throughputPerSecond: result.throughputPerSecond,
      averageLatencyMs: result.averageLatencyMs,
      p50LatencyMs: percentile(latencies, 50),
      p95LatencyMs: result.p95LatencyMs,
      p99LatencyMs: result.p99LatencyMs,
      maxLatencyMs: latencies[latencies.length - 1] ?? 0,
      errorRate,
      bottlenecks,
      endpointBreakdown: [],
      rawSamples: [],
    };
  }

  generateReport(windowMs?: number): BenchmarkReport {
    const now = Date.now();
    const cutoff = windowMs ? now - windowMs : 0;
    const window = this.samples.filter(
      (s) => new Date(s.timestamp).getTime() >= cutoff,
    );

    const latencies = window.map((s) => s.latencyMs).sort((a, b) => a - b);
    const failed = window.filter((s) => s.statusCode >= 500).length;
    const errorRate = window.length > 0 ? failed / window.length : 0;
    const totalMs = latencies.reduce((a, b) => a + b, 0);
    const averageLatencyMs = latencies.length > 0 ? totalMs / latencies.length : 0;
    const durationMs = windowMs ?? (latencies.length > 1 ? now - new Date(window[0]?.timestamp ?? now).getTime() : 0);
    const throughputPerSecond = durationMs > 0 ? (window.length / durationMs) * 1000 : 0;

    const endpointGroups = new Map<string, LatencySample[]>();
    for (const s of window) {
      const key = `${s.method} ${s.endpoint}`;
      const group = endpointGroups.get(key) ?? [];
      group.push(s);
      endpointGroups.set(key, group);
    }

    const endpointBreakdown: EndpointStats[] = Array.from(endpointGroups.entries()).map(
      ([key, samples]) => {
        const lats = samples.map((s) => s.latencyMs).sort((a, b) => a - b);
        const errs = samples.filter((s) => s.statusCode >= 500).length;
        const [method, ...rest] = key.split(' ');
        return {
          endpoint: rest.join(' '),
          method,
          callCount: samples.length,
          averageLatencyMs: lats.reduce((a, b) => a + b, 0) / lats.length,
          p95LatencyMs: percentile(lats, 95),
          p99LatencyMs: percentile(lats, 99),
          errorRate: errs / samples.length,
        };
      },
    );

    const p95 = percentile(latencies, 95);
    const p99 = percentile(latencies, 99);

    const bottlenecks = this.detectBottlenecks({
      averageLatencyMs,
      p95LatencyMs: p95,
      p99LatencyMs: p99,
      errorRate,
      throughputPerSecond,
    });

    this.logger.info(
      { totalSamples: window.length, errorRate, p99, throughputPerSecond },
      'benchmark report generated',
    );

    return {
      id: `bench_${Date.now()}`,
      generatedAt: new Date().toISOString(),
      durationMs,
      concurrentUsers: 0,
      totalRequests: window.length,
      successfulRequests: window.length - failed,
      failedRequests: failed,
      throughputPerSecond,
      averageLatencyMs,
      p50LatencyMs: percentile(latencies, 50),
      p95LatencyMs: p95,
      p99LatencyMs: p99,
      maxLatencyMs: latencies[latencies.length - 1] ?? 0,
      errorRate,
      bottlenecks,
      endpointBreakdown,
      rawSamples: window,
    };
  }

  private detectBottlenecks(metrics: {
    averageLatencyMs: number;
    p95LatencyMs: number;
    p99LatencyMs: number;
    errorRate: number;
    throughputPerSecond: number;
  }): Bottleneck[] {
    const bottlenecks: Bottleneck[] = [];
    const { averageLatencyMs, p95LatencyMs, p99LatencyMs, errorRate, throughputPerSecond } = metrics;

    if (p99LatencyMs > 5000) {
      bottlenecks.push({
        area: 'API Latency',
        description: `P99 latency is ${p99LatencyMs.toFixed(0)}ms — far above the 5s SLA`,
        severity: 'critical',
        p99LatencyMs,
        recommendation: 'Investigate database query plans, add caching, or scale horizontally',
      });
    } else if (p99LatencyMs > 2000) {
      bottlenecks.push({
        area: 'API Latency',
        description: `P99 latency is ${p99LatencyMs.toFixed(0)}ms — above acceptable threshold`,
        severity: 'high',
        p99LatencyMs,
        recommendation: 'Review slow endpoints in endpointBreakdown and add indexes or caching',
      });
    } else if (p95LatencyMs > 1000) {
      bottlenecks.push({
        area: 'API Latency',
        description: `P95 latency is ${p95LatencyMs.toFixed(0)}ms — noticeable degradation under load`,
        severity: 'medium',
        p99LatencyMs,
        recommendation: 'Profile hot paths and consider connection pooling improvements',
      });
    }

    if (errorRate > 0.05) {
      bottlenecks.push({
        area: 'Error Rate',
        description: `${(errorRate * 100).toFixed(1)}% of requests are failing`,
        severity: errorRate > 0.2 ? 'critical' : 'high',
        errorRate,
        recommendation:
          'Check server logs for 5xx errors; verify rate limits and circuit-breaker thresholds',
      });
    } else if (errorRate > 0.01) {
      bottlenecks.push({
        area: 'Error Rate',
        description: `${(errorRate * 100).toFixed(1)}% error rate — above acceptable baseline`,
        severity: 'medium',
        errorRate,
        recommendation: 'Review retry logic and upstream dependencies for transient failures',
      });
    }

    const latencyVariance = p99LatencyMs - averageLatencyMs;
    if (latencyVariance > 3000) {
      bottlenecks.push({
        area: 'Latency Variance',
        description: `High variance (avg ${averageLatencyMs.toFixed(0)}ms vs P99 ${p99LatencyMs.toFixed(0)}ms) indicates tail latency issues`,
        severity: 'medium',
        recommendation:
          'Investigate GC pauses, lock contention, or uneven load distribution across instances',
      });
    }

    if (throughputPerSecond < 10 && throughputPerSecond > 0) {
      bottlenecks.push({
        area: 'Throughput',
        description: `Throughput is only ${throughputPerSecond.toFixed(1)} req/s — likely a concurrency bottleneck`,
        severity: 'high',
        recommendation: 'Increase worker pool size, optimize blocking I/O, or add horizontal scaling',
      });
    }

    return bottlenecks;
  }
}
