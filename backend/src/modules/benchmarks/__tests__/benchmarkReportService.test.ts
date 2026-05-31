import { BenchmarkReportService, type LatencySample } from '../benchmarkReportService';
import type { StressTestResult } from '../../stress/stressTestService';

function makeSample(overrides: Partial<LatencySample> = {}): LatencySample {
  return {
    endpoint: '/api/transfers',
    method: 'POST',
    latencyMs: 200,
    statusCode: 200,
    timestamp: new Date().toISOString(),
    ...overrides,
  };
}

function makeStressResult(overrides: Partial<StressTestResult> = {}): StressTestResult {
  return {
    runId: 'run_1',
    config: { concurrency: 10, totalTransfers: 100, amount: 50, userId: 'u1', walletId: 'w1' },
    timestamp: new Date().toISOString(),
    durationMs: 10000,
    successful: 95,
    failed: 5,
    throughputPerSecond: 9.5,
    averageLatencyMs: 300,
    p95LatencyMs: 800,
    p99LatencyMs: 1500,
    errors: [],
    perTransferResults: Array.from({ length: 100 }, (_, i) => ({
      index: i,
      transferId: `t_${i}`,
      success: i < 95,
      latencyMs: i < 95 ? 300 : 5000,
      error: i >= 95 ? 'timeout' : undefined,
    })),
    ...overrides,
  };
}

describe('BenchmarkReportService', () => {
  let svc: BenchmarkReportService;

  beforeEach(() => {
    svc = new BenchmarkReportService();
  });

  describe('fromStressTestResult', () => {
    it('maps stress test result to benchmark report', () => {
      const result = makeStressResult();
      const report = svc.fromStressTestResult(result);

      expect(report.totalRequests).toBe(100);
      expect(report.successfulRequests).toBe(95);
      expect(report.failedRequests).toBe(5);
      expect(report.errorRate).toBeCloseTo(0.05);
      expect(report.throughputPerSecond).toBe(9.5);
    });

    it('detects high error rate as a bottleneck', () => {
      const result = makeStressResult({
        successful: 50,
        failed: 50,
        perTransferResults: Array.from({ length: 100 }, (_, i) => ({
          index: i,
          transferId: `t_${i}`,
          success: i < 50,
          latencyMs: 300,
        })),
      });
      const report = svc.fromStressTestResult(result);
      const errBottleneck = report.bottlenecks.find((b) => b.area === 'Error Rate');
      expect(errBottleneck).toBeDefined();
      expect(errBottleneck!.severity).toBe('critical');
    });

    it('detects critical p99 latency as a bottleneck', () => {
      const result = makeStressResult({ p99LatencyMs: 6000 });
      const report = svc.fromStressTestResult(result);
      const latBottleneck = report.bottlenecks.find((b) => b.area === 'API Latency');
      expect(latBottleneck).toBeDefined();
      expect(latBottleneck!.severity).toBe('critical');
    });

    it('reports no bottlenecks for healthy results', () => {
      const result = makeStressResult({
        failed: 0,
        averageLatencyMs: 150,
        p95LatencyMs: 400,
        p99LatencyMs: 700,
        throughputPerSecond: 50,
        perTransferResults: Array.from({ length: 100 }, (_, i) => ({
          index: i,
          transferId: `t_${i}`,
          success: true,
          latencyMs: 150,
        })),
      });
      const report = svc.fromStressTestResult(result);
      expect(report.bottlenecks).toHaveLength(0);
    });
  });

  describe('generateReport', () => {
    it('returns empty report when no samples recorded', () => {
      const report = svc.generateReport();
      expect(report.totalRequests).toBe(0);
      expect(report.bottlenecks).toHaveLength(0);
    });

    it('computes endpoint breakdown correctly', () => {
      svc.recordSample(makeSample({ endpoint: '/api/transfers', latencyMs: 100 }));
      svc.recordSample(makeSample({ endpoint: '/api/transfers', latencyMs: 200 }));
      svc.recordSample(makeSample({ endpoint: '/api/wallets', method: 'GET', latencyMs: 50 }));

      const report = svc.generateReport();
      expect(report.totalRequests).toBe(3);
      const transferStats = report.endpointBreakdown.find((e) => e.endpoint === '/api/transfers');
      expect(transferStats?.callCount).toBe(2);
      expect(transferStats?.averageLatencyMs).toBe(150);
    });

    it('flags high error rate as bottleneck in live samples', () => {
      for (let i = 0; i < 10; i++) {
        svc.recordSample(makeSample({ statusCode: i < 7 ? 500 : 200 }));
      }
      const report = svc.generateReport();
      const errBottleneck = report.bottlenecks.find((b) => b.area === 'Error Rate');
      expect(errBottleneck).toBeDefined();
    });

    it('clearSamples resets state', () => {
      svc.recordSample(makeSample());
      svc.clearSamples();
      const report = svc.generateReport();
      expect(report.totalRequests).toBe(0);
    });
  });
});
